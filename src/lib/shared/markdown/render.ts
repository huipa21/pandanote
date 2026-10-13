import { unified } from 'unified';
import remarkRehype from 'remark-rehype';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import type { Code, Nodes, Text as MdText } from 'mdast';
import type { Element, Root, Text } from 'hast';
import { parseMarkdown } from './parse.ts';
import { tagSpans, type TagSpan } from './tags.ts';
import { highlight } from './highlight.ts';
import { translate } from '../i18n/index.ts';
import { DEFAULT_LANGUAGE, type Language } from '../i18n/registry.ts';

export interface ImageReference {
  id: string;
  /** Application-owned authenticated route or ephemeral local blob URL. */
  url: string;
  width?: number;
  height?: number;
}
export interface RenderedMarkdown {
  html: string;
  codes: string[];
  diagrams: string[];
}
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const element = (
  tagName: string,
  properties: Element['properties'],
  children: Element['children'],
): Element => ({ type: 'element', tagName, properties, children });
const text = (value: string): Text => ({ type: 'text', value });
const stringify = unified().use(rehypeStringify);
function textOf(node: Element['children'][number]): string {
  if (node.type === 'text') return node.value;
  return node.type === 'element'
    ? node.children.map((child) => textOf(child)).join('')
    : '';
}
/** GFM task checkboxes are disabled display controls; give each an accessible name. */
function labelTaskCheckbox(item: Element): void {
  const input = item.children.find(
    (child): child is Element =>
      child.type === 'element' &&
      child.tagName === 'input' &&
      child.properties.type === 'checkbox',
  );
  if (!input) return;
  const name = textOf(item).replace(/s+/g, ' ').trim().slice(0, 80);
  input.properties.ariaLabel = `${input.properties.checked ? 'Completed' : 'Open'} task${name ? `: ${name}` : ''}`;
}
const sanitizer = unified().use(rehypeSanitize, {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    span: ['className', 'style'],
    pre: ['className', 'style', 'tabIndex'],
    code: ['className'],
    img: ['src', 'alt', 'width', 'height', 'loading', 'decoding'],
  },
  protocols: { ...defaultSchema.protocols, src: ['blob'] },
});
function safeLink(url: string): boolean {
  // No protocol-relative, control/whitespace obfuscation or backslash URLs.
  // eslint-disable-next-line no-control-regex
  if (/[\s\u0000-\u001f\u007f\\]/u.test(url) || url.startsWith('//'))
    return false;
  return /^(https?:|mailto:)/i.test(url) || !/^[^/?#]*:/.test(url);
}
export async function renderMarkdown(
  source: string,
  images: readonly ImageReference[] = [],
  /** Language of generated control labels (code copy, diagram placeholder). */
  uiLanguage: Language = DEFAULT_LANGUAGE,
): Promise<RenderedMarkdown> {
  const tree = parseMarkdown(source);
  const codes: string[] = [];
  const diagrams: string[] = [];
  const codeNodes = new Map<number | undefined, Code>();
  const definitions = new Map<string, string>();
  function collectDefinitions(node: Nodes): void {
    if (node.type === 'definition') definitions.set(node.identifier, node.url);
    if ('children' in node) node.children.forEach(collectDefinitions);
  }
  collectDefinitions(tree);
  function resolveImage(url: string) {
    const id = url.startsWith('attachment:') ? url.slice(11) : '';
    const ref = uuid.test(id)
      ? images.find((image) => image.id === id)
      : undefined;
    return ref &&
      (ref.url === `/api/attachments/${id}/display` ||
        ref.url === `/api/attachments/${id}/thumbnail` ||
        /^blob:https?:\/\//.test(ref.url))
      ? ref
      : undefined;
  }
  function prepare(node: Nodes): void {
    if (node.type === 'code') codeNodes.set(node.position?.start.offset, node);
    if (node.type === 'link' && !safeLink(node.url)) node.url = '';
    if (node.type === 'definition' && !safeLink(node.url)) node.url = '';
    if (node.type === 'image') {
      const ref = resolveImage(node.url);
      // Never fetch arbitrary remote/user-authored images. S05/S06 own descriptors.
      if (ref) {
        node.url = ref.url;
        node.data = {
          hProperties: {
            width: ref.width,
            height: ref.height,
            loading: 'lazy',
            decoding: 'async',
          },
        };
      } else {
        node.url = '';
        node.alt = `Image unavailable${node.alt ? `: ${node.alt}` : ''}`;
      }
    }
    if (node.type === 'imageReference') {
      const ref = resolveImage(definitions.get(node.identifier) ?? '');
      node.data = ref
        ? {
            hName: 'img',
            hProperties: {
              src: ref.url,
              alt: node.alt ?? '',
              width: ref.width,
              height: ref.height,
              loading: 'lazy',
              decoding: 'async',
            },
          }
        : {
            hName: 'span',
            hProperties: {},
            hChildren: [
              text(`Image unavailable${node.alt ? `: ${node.alt}` : ''}`),
            ],
          };
    }
    if ('children' in node) {
      const parent = node as { children: Nodes[] };
      parent.children = parent.children.flatMap((child) =>
        child.type === 'text'
          ? splitTags(child).flatMap(splitLineBreaks)
          : [child],
      );
      parent.children.forEach(prepare);
    }
  }
  // Hashtag text is wrapped in a span (never removed from the source) so note
  // cards can show the tag chips instead of repeating the text.
  let tags: TagSpan[] = [];
  try {
    tags = tagSpans(source);
  } catch {
    // Over-limit notes still render; only the tag-text wrapping is skipped.
  }
  // Standard Markdown folds a single newline into a space. PandaNote notes are
  // typed like plain notes, so every newline inside text becomes a hard break.
  function splitLineBreaks(node: Nodes): Nodes[] {
    if (node.type !== 'text' || !node.value.includes('\n')) return [node];
    return node.value.split('\n').flatMap((line, index) => {
      const parts: Nodes[] = [];
      if (index > 0) parts.push({ type: 'break' });
      if (line) parts.push({ type: 'text', value: line });
      return parts;
    });
  }
  function splitTags(node: MdText): Nodes[] {
    const start = node.position?.start.offset;
    if (start === undefined || !tags.length) return [node];
    const inside = tags.filter(
      (span) =>
        span.start >= start &&
        span.end <= start + node.value.length &&
        node.value.slice(span.start - start, span.end - start) ===
          source.slice(span.start, span.end),
    );
    if (!inside.length) return [node];
    const parts: Nodes[] = [];
    let cursor = 0;
    for (const span of inside) {
      const from = span.start - start;
      if (from > cursor)
        parts.push({ type: 'text', value: node.value.slice(cursor, from) });
      parts.push({
        type: 'tagText',
        value: node.value.slice(from, span.end - start),
      } as unknown as Nodes);
      cursor = span.end - start;
    }
    if (cursor < node.value.length)
      parts.push({ type: 'text', value: node.value.slice(cursor) });
    return parts;
  }
  prepare(tree);
  const hast = (await unified()
    .use(remarkRehype, {
      handlers: {
        tagText: (_state: unknown, node: { value: string }) =>
          element('span', { className: ['tag-text'] }, [text(node.value)]),
      },
    } as never)
    .run(tree)) as Root;
  async function transform(parent: Root | Element): Promise<void> {
    for (let i = 0; i < parent.children.length; i++) {
      const node = parent.children[i];
      if (node.type !== 'element') continue;
      if (node.tagName === 'img' && !node.properties.src) {
        parent.children[i] = element('span', { className: ['missing-image'] }, [
          text(String(node.properties.alt ?? 'Image unavailable')),
        ]);
      } else if (
        node.tagName === 'pre' &&
        node.children[0]?.type === 'element' &&
        node.children[0].tagName === 'code'
      ) {
        // Footnotes are moved to the end by remark-rehype, so DOM traversal
        // order is not source order. Match by the retained source position.
        const original = codeNodes.get(node.position?.start.offset)!;
        const language = (original.lang ?? '').toLowerCase();
        if (language === 'mermaid') {
          const index = diagrams.push(original.value) - 1;
          parent.children[i] = element(
            'div',
            {
              className: ['mermaid-diagram'],
              dataDiagram: index,
              role: 'img',
              ariaLabel: translate(uiLanguage, 'markdown.diagram'),
            },
            [text(translate(uiLanguage, 'markdown.diagramWaiting'))],
          );
        } else {
          const index = codes.push(original.value) - 1;
          node.properties.tabIndex = 0;
          const highlighted = await highlight(original.value, language);
          // Shiki alone creates this HTML; source never becomes trusted markup.
          const safeContent = (await sanitizer.run(
            highlighted ?? { type: 'root', children: [node] },
          )) as Root;
          parent.children[i] = element(
            'section',
            { className: ['code-block'] },
            [
              element('div', { className: ['code-toolbar'] }, [
                element('span', {}, [text(language || 'text')]),
                element(
                  'button',
                  {
                    type: 'button',
                    disabled: true,
                    dataCode: index,
                    ariaLabel: translate(uiLanguage, 'markdown.copyCode', {
                      language: language || 'text',
                    }),
                  },
                  [text(translate(uiLanguage, 'markdown.copy'))],
                ),
                element(
                  'span',
                  {
                    className: ['sr-only'],
                    dataCopyFeedback: true,
                    ariaLive: 'polite',
                  },
                  [],
                ),
              ]),
              ...safeContent.children.filter(
                (child) => child.type !== 'doctype',
              ),
            ],
          );
        }
      } else {
        if (node.tagName === 'a')
          node.properties.rel = ['noreferrer', 'noopener'];
        if (node.tagName === 'li') labelTaskCheckbox(node);
        await transform(node);
      }
    }
  }
  // Sanitize user-derived HTML BEFORE adding application-owned controls/metadata.
  const safe = (await sanitizer.run(hast)) as Root;
  await transform(safe);
  return { html: String(stringify.stringify(safe)), codes, diagrams };
}
