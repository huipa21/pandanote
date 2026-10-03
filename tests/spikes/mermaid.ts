import DOMPurify from 'dompurify';

export function sanitizeSvgProbe(svg: string): string {
  const clean = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: [
      'foreignObject',
      'image',
      'a',
      'script',
      'use',
      'animate',
      'set',
    ],
    FORBID_ATTR: ['href', 'xlink:href'],
  });
  const document = new DOMParser().parseFromString(clean, 'image/svg+xml');
  for (const element of document.querySelectorAll('*')) {
    for (const attr of [...element.attributes]) {
      // Preserve local SVG paint references, never remote/data URLs.
      if (/url\s*\(/i.test(attr.value) && !/^url\(#[\w-]+\)$/.test(attr.value))
        element.removeAttribute(attr.name);
    }
    if (
      element.tagName === 'style' &&
      /@import|url\s*\(/i.test(element.textContent ?? '')
    )
      element.remove();
  }
  return new XMLSerializer().serializeToString(document.documentElement);
}

let library: Promise<typeof import('mermaid')> | undefined;
let sequence = 0;

export async function renderMermaidProbe(source: string): Promise<string> {
  library ??= import('mermaid');
  const { default: mermaid } = await library;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    htmlLabels: false,
    flowchart: { htmlLabels: false },
    maxTextSize: 10_000,
    suppressErrorRendering: true,
  });
  const { svg } = await mermaid.render(`probe-${++sequence}`, source);
  return sanitizeSvgProbe(svg);
}
