import type { Element, Root } from 'hast';

type Highlighter = Awaited<
  ReturnType<(typeof import('shiki/bundle/web'))['createHighlighter']>
>;
let highlighter: Promise<Highlighter> | undefined;
const cache = new Map<string, Root>();
let queue = Promise.resolve();

/** One lazy highlighter, bounded output/grammar caches; unsupported code stays plain. */
export async function highlight(
  code: string,
  language: string,
): Promise<Root | null> {
  if (!language || code.length > 32_768) return null;
  const key = `${language}\0${code}`;
  const cached = cache.get(key);
  if (cached) return cached;
  let result: Root | null = null;
  const run = queue.then(async () => {
    const { createHighlighter, bundledLanguages } =
      await import('shiki/bundle/web');
    if (!(language in bundledLanguages)) return;
    // Native RegExp engine works with script-src 'self': no WASM/eval exception.
    const { createJavaScriptRegexEngine } =
      await import('shiki/engine/javascript');
    highlighter ??= createHighlighter({
      themes: ['github-light', 'github-dark'],
      langs: [],
      engine: createJavaScriptRegexEngine(),
    });
    const instance = await highlighter;
    if (!instance.getLoadedLanguages().includes(language)) {
      if (instance.getLoadedLanguages().length >= 48) return;
      await instance.loadLanguage(language as keyof typeof bundledLanguages);
    }
    result = instance.codeToHast(code, {
      lang: language,
      themes: { light: 'github-light', dark: 'github-dark' },
      defaultColor: false,
    });
    // Shiki 4 emits HTML-style property names; rehype-sanitize expects HAST.
    function normalize(node: Root | Element) {
      if (node.type === 'element') {
        if (node.properties.class) {
          node.properties.className = String(node.properties.class).split(' ');
          delete node.properties.class;
        }
        if (node.properties.tabindex !== undefined) {
          node.properties.tabIndex = String(node.properties.tabindex);
          delete node.properties.tabindex;
        }
      }
      for (const child of node.children)
        if (child.type === 'element') normalize(child);
    }
    normalize(result);
    cache.set(key, result);
    if (cache.size > 64) cache.delete(cache.keys().next().value!);
  });
  queue = run.catch(() => {});
  try {
    await run;
  } catch {
    /* Readable plain code is a safe fallback. Never log source or grammar errors. */
  }
  return result;
}
