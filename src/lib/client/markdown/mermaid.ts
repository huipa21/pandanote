import { tr } from '#lib/client/i18n-current.ts';
import DOMPurify from 'dompurify';

export const MAX_DIAGRAM_LENGTH = 12_000;
export function validateDiagram(source: string): void {
  if (
    source.length > MAX_DIAGRAM_LENGTH ||
    source.split(/\r?\n/).length > 160 ||
    (source.match(/--|==|->|[;{}]/g)?.length ?? 0) > 300 ||
    (source.match(/[[({]|\bparticipant\b/g)?.length ?? 0) > 160
  )
    throw new Error(tr('mermaid.tooLarge'));
  // Reject config/directives before Mermaid can change our trusted settings.
  // Also forbid HTML/CSS/links/assets before the library's temporary DOM exists.
  if (
    /%%\{|^\s*---|(?:^|;)\s*(?:click|href|callback|link|links|classDef|style|linkStyle)\b|\b(?:image|img|icon|href|callback)\s*:|#(?:x[\da-f]+|\d+);|&(?:#\w+|\w+);|<|>|(?:https?|data|javascript):|url\s*\(|@import|\\/im.test(
      source.replace(/--?>>?|==>|-.->|=>|~>/g, ''),
    )
  )
    throw new Error(tr('mermaid.disabled'));
}

/** Detached SVG only; never insert the library's raw temporary output. */
export function sanitizeSvg(svg: string): string {
  const clean = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true },
    ADD_TAGS: ['style'],
    FORBID_TAGS: [
      'foreignObject',
      'image',
      'a',
      'script',
      'use',
      'animate',
      'animateMotion',
      'animateTransform',
      'set',
      'filter',
    ],
    FORBID_ATTR: ['href', 'xlink:href', 'src'],
  });
  const document = new DOMParser().parseFromString(clean, 'image/svg+xml');
  if (
    document.documentElement.localName !== 'svg' ||
    document.querySelector('parsererror')
  )
    throw new Error(tr('mermaid.invalidOutput'));
  const id = document.documentElement.id;
  for (const node of document.querySelectorAll('*')) {
    for (const attr of [...node.attributes]) {
      if (/url\s*\(/i.test(attr.value) && !/^url\(#[\w-]+\)$/.test(attr.value))
        node.removeAttribute(attr.name);
      if (/\\|@import|expression\s*\(/i.test(attr.value))
        node.removeAttribute(attr.name);
    }
    if (node.localName === 'style') {
      // Parse detached CSS without adopting it. Keep only SVG-scoped ordinary
      // rules and paint/text declarations; no imports, fonts, animations or URLs.
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(node.textContent ?? '');
      const rules: string[] = [];
      if (/^panda-diagram-\d+$/.test(id))
        for (const rule of sheet.cssRules) {
          if (!(rule instanceof CSSStyleRule)) continue;
          const selectors = rule.selectorText
            .split(',')
            .map((value) => value.trim());
          if (
            !selectors.every(
              (value) =>
                value.startsWith(`#${id}`) &&
                /^[\w\s.#:[\]="'*-]+$/.test(value) &&
                !value.includes('+') &&
                !value.includes('~'),
            )
          )
            continue;
          const declarations: string[] = [];
          for (const property of rule.style) {
            const value = rule.style.getPropertyValue(property);
            if (
              /^(?:fill|stroke(?:-[\w-]+)?|color|background-color|opacity|font(?:-[\w-]+)?|text-anchor|dominant-baseline|alignment-baseline|white-space|text-align|line-height|padding|margin|border(?:-[\w-]+)?|rx|ry|--[\w-]+)$/.test(
                property,
              ) &&
              !/url\s*\(|@|\\|expression\s*\(/i.test(value)
            )
              declarations.push(`${property}:${value}`);
          }
          if (declarations.length)
            rules.push(`${selectors.join(',')}{${declarations.join(';')}}`);
        }
      node.textContent = rules.join('\n');
      if (!rules.length) node.remove();
    }
  }
  return new XMLSerializer().serializeToString(document.documentElement);
}
let library: Promise<typeof import('mermaid')> | undefined;
let sequence = 0;
let queue = Promise.resolve();
const cache = new Map<string, string>();
function uniqueSvg(svg: string): string {
  const tree = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const old = tree.documentElement.id;
  if (!/^panda-diagram-\d+$/.test(old))
    throw new Error(tr('mermaid.invalidOutput'));
  const id = `panda-diagram-${++sequence}`;
  for (const node of tree.querySelectorAll('*')) {
    for (const attr of [...node.attributes])
      node.setAttribute(attr.name, attr.value.replaceAll(old, id));
    if (node.localName === 'style')
      node.textContent = node.textContent!.replaceAll(old, id);
  }
  return new XMLSerializer().serializeToString(tree.documentElement);
}
export async function renderDiagram(
  source: string,
  dark: boolean,
  signal?: AbortSignal,
): Promise<string> {
  signal?.throwIfAborted();
  validateDiagram(source);
  const key = `${dark}\0${source}`;
  const existing = cache.get(key);
  if (existing) return uniqueSvg(existing);
  let result = '';
  const run = queue.then(async () => {
    signal?.throwIfAborted();
    library ??= import('mermaid');
    const { default: mermaid } = await library;
    signal?.throwIfAborted();
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      theme: dark ? 'dark' : 'default',
      fontFamily: 'system-ui, sans-serif',
      maxTextSize: MAX_DIAGRAM_LENGTH,
      maxEdges: 300,
      suppressErrorRendering: true,
      secure: [
        'securityLevel',
        'htmlLabels',
        'maxTextSize',
        'maxEdges',
        'theme',
        'startOnLoad',
      ],
    });
    const id = `panda-diagram-${++sequence}`;
    const container = document.createElement('div');
    // Private render sandbox; no untrusted links/HTML/assets reach this point.
    // display:none destroys SVG text/layout measurements. Invisible offscreen
    // layout supplies real bounds without exposing the temporary unsanitized SVG.
    container.style.cssText =
      'position:absolute;left:-100000px;top:0;width:760px;visibility:hidden;pointer-events:none';
    container.setAttribute('aria-hidden', 'true');
    document.body.append(container);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const output = await Promise.race([
        mermaid.render(id, source, container),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error(tr('mermaid.timeout'))),
            5000,
          );
        }),
      ]);
      result = sanitizeSvg(output.svg);
      cache.set(key, result);
      if (cache.size > 32) cache.delete(cache.keys().next().value!);
    } finally {
      clearTimeout(timeout);
      container.remove();
      document.getElementById(`d${id}`)?.remove();
    }
  });
  queue = run.catch(() => {});
  await run;
  return uniqueSvg(result);
}
