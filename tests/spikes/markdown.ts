import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import type { Nodes, Root } from 'mdast';

export interface Span {
  start: number;
  end: number;
  text: string;
}

// Prove source-offset rewrites are feasible, without promising the complete S04
// grammar (notably mixed inline HTML and entity/escape mapping).
export function textSpans(source: string): Span[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(source) as Root;
  const spans: Span[] = [];
  function visit(node: Nodes): void {
    if (['code', 'inlineCode', 'html'].includes(node.type)) return;
    if (node.type === 'text') {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start !== undefined && end !== undefined) {
        spans.push({ start, end, text: source.slice(start, end) });
      }
    }
    if ('children' in node) node.children.forEach(visit);
  }
  visit(tree);
  return spans;
}

export function rewriteProbeTag(
  source: string,
  from: string,
  to: string,
): string {
  const replacements: Span[] = [];
  for (const span of textSpans(source)) {
    const pattern = /(^|[\s(（])#([\p{L}\p{N}\p{M}_-]+)/gu;
    for (const match of span.text.matchAll(pattern)) {
      if (match[2].normalize('NFKC').toLowerCase() !== from.toLowerCase())
        continue;
      const start = span.start + match.index + match[1].length;
      replacements.push({
        start,
        end: start + match[2].length + 1,
        text: `#${to}`,
      });
    }
  }
  for (const span of replacements.sort((a, b) => b.start - a.start)) {
    source = source.slice(0, span.start) + span.text + source.slice(span.end);
  }
  return source;
}
