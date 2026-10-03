import { unified } from 'unified';
import remarkRehype from 'remark-rehype';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import type { Code, Nodes } from 'mdast';
import type { Element, Root, Text } from 'hast';
import { parseMarkdown } from './parse.ts';
import { highlight } from './highlight.ts';

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
    if ('children' in node) node.children.forEach(prepare);
  }
  prepare(tree);
  const hast = (await unified().use(remarkRehype).run(tree)) as Root;
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
              ariaLabel: 'Mermaid diagram',
            },
            [text('Diagram waiting until visible…')],
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
                    dataCode: index,
                    ariaLabel: `Copy ${language || 'text'} code`,
                  },
                  [text('Copy')],
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
        await transform(node);
      }
    }
  }
  // Sanitize user-derived HTML BEFORE adding application-owned controls/metadata.
  const safe = (await sanitizer.run(hast)) as Root;
  await transform(safe);
  return { html: String(stringify.stringify(safe)), codes, diagrams };
}
