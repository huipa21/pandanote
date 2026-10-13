<script lang="ts">
  import { getContext, untrack } from 'svelte';
  import { useI18n } from '#lib/client/i18n.svelte.ts';
  import {
    READING,
    type ReadingState,
  } from '#lib/client/timeline/reading.svelte.ts';
  const reading = getContext<ReadingState | undefined>(READING);
  const t = useI18n().t;
  import {
    renderMarkdown,
    type ImageReference,
    type RenderedMarkdown,
  } from '#lib/shared/markdown/render.ts';
  import '#lib/styles/markdown.css';
  let {
    source,
    images = [],
    debounce = 0,
    initial,
    allowCodeCopy = true,
    foreground = false,
    onImage,
  }: {
    source: string;
    images?: readonly ImageReference[];
    debounce?: number;
    initial?: RenderedMarkdown;
    allowCodeCopy?: boolean;
    foreground?: boolean;
    onImage?: (id: string) => void;
  } = $props();
  let output = $state<RenderedMarkdown>(
    untrack(() => initial ?? { html: '', codes: [], diagrams: [] }),
  );
  let error = $state('');
  let loading = $state(false);
  let root: HTMLDivElement;
  let generation = 0;
  $effect(() => {
    const text = source;
    const refs = images;
    const current = ++generation;
    if (initial) {
      output = initial;
      loading = false;
      error = '';
      return;
    }
    loading = true;
    const timer = setTimeout(() => {
      void renderMarkdown(text, refs)
        .then((result) => {
          if (current !== generation) return;
          output = result;
          error = '';
        })
        .catch(() => {
          if (current === generation) error = t('markdown.previewFailed');
        })
        .finally(() => {
          if (current === generation) loading = false;
        });
    }, debounce);
    return () => {
      clearTimeout(timer);
      generation++;
    };
  });
  $effect(() => {
    const refs = images;
    if (onImage)
      root.querySelectorAll<HTMLImageElement>('img').forEach((image) => {
        if (
          refs.some((ref) => ref.url === image.getAttribute('src')) &&
          !image.closest('a')
        ) {
          image.tabIndex = 0;
          image.setAttribute('role', 'button');
          image.setAttribute(
            'aria-label',
            t('markdown.openImage', {
              name: image.alt || t('markdown.noteImage'),
            }),
          );
        }
      });
    // SSR copy controls wait for the delegated handler/hydrated DOM. Preview
    // replacements use the same boundary, never a swallowed pre-hydration click.
    const codes = output.codes;
    // Labels are localized after hydration; server HTML keeps the English defaults.
    root
      .querySelectorAll<HTMLButtonElement>('button[data-code]')
      .forEach((button) => {
        const language =
          button.closest('.code-block')?.querySelector('.code-toolbar > span')
            ?.textContent || 'text';
        button.textContent = t('markdown.copy');
        button.setAttribute('aria-label', t('markdown.copyCode', { language }));
      });
    if (codes.length)
      root
        .querySelectorAll<HTMLButtonElement>('button[data-code]')
        .forEach((button) => {
          button.disabled = !allowCodeCopy;
          button.title = allowCodeCopy ? '' : t('markdown.showMoreCopy');
        });
  });
  $effect(() => {
    const diagrams = output.diagrams;
    if (!diagrams.length || reading?.viewer || (!foreground && reading?.detail))
      return;
    let disposed = false;
    const cancel = new AbortController();
    // Observer bookkeeping is intentionally nonreactive; it never drives UI state.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const visible = new Set<HTMLElement>();
    const media = matchMedia('(prefers-color-scheme: dark)');
    let revision = 0;
    const drawn = new WeakMap<HTMLElement, number>();
    function dark() {
      const theme = document.documentElement.dataset.theme;
      return theme === 'dark' || (theme === 'system' && media.matches);
    }
    async function draw(target: HTMLElement) {
      const current = revision;
      if (drawn.get(target) === current) return;
      drawn.set(target, current);
      if (!target.querySelector('svg'))
        target.textContent = t('mermaid.rendering');
      try {
        const { renderDiagram } =
          await import('#lib/client/markdown/mermaid.ts');
        if (disposed) return;
        const svg = await renderDiagram(
          diagrams[Number(target.dataset.diagram)],
          dark(),
          cancel.signal,
        );
        if (!disposed && current === revision && target.isConnected)
          target.innerHTML = svg;
      } catch (failure) {
        if (!disposed && current === revision) {
          target.removeAttribute('role');
          target.textContent =
            failure instanceof Error &&
            [
              t('mermaid.tooLarge'),
              t('mermaid.disabled'),
              t('mermaid.timeout'),
            ].includes(failure.message)
              ? failure.message
              : t('mermaid.invalid');
        }
      }
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            const target = entry.target as HTMLElement;
            visible.add(target);
            void draw(target);
          } else {
            visible.delete(entry.target as HTMLElement);
          }
      },
      { threshold: 0.01 },
    );
    root
      .querySelectorAll<HTMLElement>('[data-diagram]')
      .forEach((target) => observer.observe(target));
    const refresh = () => {
      revision++;
      for (const target of visible) void draw(target);
    };
    const themes = new MutationObserver(refresh);
    themes.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    media.addEventListener('change', refresh);
    return () => {
      disposed = true;
      cancel.abort();
      observer.disconnect();
      themes.disconnect();
      media.removeEventListener('change', refresh);
    };
  });
  function openImage(target: EventTarget | null): boolean {
    if (
      !(target instanceof HTMLImageElement) ||
      !onImage ||
      target.closest('a')
    )
      return false;
    const ref = images.find(
      (image) => image.url === target.getAttribute('src'),
    );
    if (!ref) return false;
    onImage(ref.id);
    return true;
  }
  function imageKey(event: KeyboardEvent) {
    if (
      (event.key === 'Enter' || event.key === ' ') &&
      openImage(event.target)
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
  }
  async function copy(event: MouseEvent) {
    if (openImage(event.target) || !allowCodeCopy) return;
    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>('button[data-code]')
        : null;
    if (!target || !root.contains(target)) return;
    try {
      await navigator.clipboard.writeText(
        output.codes[Number(target.dataset.code)],
      );
      target.textContent = t('markdown.copied');
      target.parentElement!.querySelector('[data-copy-feedback]')!.textContent =
        t('markdown.codeCopied');
    } catch {
      target.textContent = t('markdown.copyFailedSelect');
      target.parentElement!.querySelector('[data-copy-feedback]')!.textContent =
        t('markdown.copyFailed');
    }
    // No timer or detached DOM retained after replacing/unmounting the preview.
  }
</script>

{#if error}<p role="alert">{error}</p>{/if}
<!-- Delegated clicks originate from real generated buttons, including keyboard activation. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="markdown"
  bind:this={root}
  onclick={copy}
  onkeydown={imageKey}
  aria-busy={loading}
>
  <!-- Only the shared sanitized pipeline may produce output.html. -->
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html output.html}
</div>
