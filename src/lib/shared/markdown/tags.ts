import type { Nodes } from 'mdast';
import { parseMarkdown } from './parse.ts';

export interface TagSpan {
  /** UTF-16 source offsets, including the literal # marker. */
  start: number;
  end: number;
  spelling: string;
  key: string;
}
export const MAX_TAG_LENGTH = 64;
export const MAX_UNIQUE_TAGS = 100;
export function tagKey(value: string): string {
  return value.normalize('NFKC').toLowerCase();
}
const body = /^[\p{L}\p{N}\p{M}_-]+$/u;
export function validateTag(value: string): string {
  if (!body.test(value) || [...value].length > MAX_TAG_LENGTH)
    throw new Error(
      'Tags must contain 1–64 letters, numbers, marks, underscores or hyphens.',
    );
  return tagKey(value);
}

export function tagSpans(source: string): TagSpan[] {
  const spans: TagSpan[] = [];
  // Raw inline HTML contents are not Markdown tags, even though mdast represents
  // the text between opening/closing HTML nodes as ordinary text siblings.
  const htmlStack: string[] = [];
  function visit(node: Nodes): void {
    if (node.type === 'html') {
      for (const match of node.value.matchAll(
        /<\s*(\/?)\s*([a-z][\w:-]*)\b[^>]*>/gi,
      )) {
        const name = match[2].toLowerCase();
        if (match[1]) {
          const index = htmlStack.lastIndexOf(name);
          if (index !== -1) htmlStack.splice(index);
        } else if (
          !/\/\s*>$/.test(match[0]) &&
          !/^(br|hr|img|input|meta|link|wbr)$/.test(name)
        ) {
          htmlStack.push(name);
        }
      }
      return;
    }
    if (
      ['code', 'inlineCode', 'image', 'imageReference', 'definition'].includes(
        node.type,
      )
    )
      return;
    if (node.type === 'link') {
      const raw = source.slice(
        node.position?.start.offset,
        node.position?.end.offset,
      );
      // Angle/bare autolinks are URLs, not human-authored Markdown link labels.
      if (!raw.startsWith('[')) return;
    }
    if (node.type === 'text' && !htmlStack.length) {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start === undefined || end === undefined) return;
      const raw = source.slice(start, end);
      const urls = [
        ...raw.matchAll(/(?:\b[a-z][a-z\d+.-]*:\/\/|\bwww\.)[^\s<>]+/gi),
      ];
      for (const match of raw.matchAll(/#[\p{L}\p{N}\p{M}_-]+/gu)) {
        const index = match.index;
        if (
          urls.some(
            (url) => index >= url.index && index < url.index + url[0].length,
          )
        )
          continue;
        // Odd backslash runs escape #; even runs encode literal backslashes,
        // which are not an allowed hashtag boundary either.
        if (index > 0 && !/[\s\p{Ps}\p{Pi}"']/u.test(raw[index - 1])) continue;
        if (index === 0 && start > 0 && source[start - 1] === '\\') continue;
        const spelling = match[0].slice(1);
        const key = validateTag(spelling);
        spans.push({
          start: start + index,
          end: start + index + match[0].length,
          spelling,
          key,
        });
      }
    }
    if ('children' in node) node.children.forEach(visit);
    // HTML state does not leak from one block into an unrelated Markdown block.
    if (['paragraph', 'heading', 'html'].includes(node.type))
      htmlStack.length = 0;
  }
  visit(parseMarkdown(source));
  if (new Set(spans.map((span) => span.key)).size > MAX_UNIQUE_TAGS)
    throw new Error('A note may contain at most 100 unique tags.');
  return spans;
}
export function extractTags(
  source: string,
): { key: string; spelling: string }[] {
  const unique = new Map<string, string>();
  for (const span of tagSpans(source))
    if (!unique.has(span.key)) unique.set(span.key, span.spelling);
  return [...unique].map(([key, spelling]) => ({ key, spelling }));
}
/** Replace only original hashtag spans, never reserialize the Markdown AST. */
export function rewriteTag(
  source: string,
  from: string,
  to: string | null,
): string {
  const key = validateTag(from);
  if (to !== null) validateTag(to);
  for (const span of tagSpans(source)
    .filter((span) => span.key === key)
    .reverse())
    source =
      source.slice(0, span.start) +
      (to === null ? '' : `#${to}`) +
      source.slice(span.end);
  return source;
}
