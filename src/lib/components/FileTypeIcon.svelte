<script lang="ts">
  import {
    fileIconKind,
    fileExtensionLabel,
    fileBrandMark,
  } from '#lib/shared/attachments.ts';

  /** Extension-based icon for a generic (non-image, non-voice-clip) attachment.
   * Word/Excel/PowerPoint/PDF/archive files get a brand-coloured document with
   * the familiar application monogram (W/X/P/PDF/ZIP), like the real app
   * icons; common media/code/text types get a pictographic mark; anything
   * else shows a short uppercase extension label on a plain document glyph.
   * Decorative; the filename itself remains the accessible name wherever this
   * is used. */
  let { filename }: { filename: string } = $props();
  const kind = $derived(fileIconKind(filename));
  const label = $derived(fileExtensionLabel(filename));
  const mark = $derived(kind ? fileBrandMark(kind) : null);
</script>

<svg
  class="file-type-icon"
  viewBox="0 0 24 24"
  aria-hidden="true"
  data-file-icon={kind ?? (label ? 'label' : 'plain')}
>
  <path class="doc" d="M6 3h8l4 4v14H6zM14 3v4h4" />
  {#if mark}
    <rect class="band" x="6" y="14.5" width="12" height="6.5" rx="0.5" />
    <text class="band-label" x="12" y="19.1" text-anchor="middle">{mark}</text>
  {:else if kind === 'audio'}
    <path d="M9 17V8.5L15 7v8" /><circle cx="7.5" cy="17" r="1.6" /><circle
      cx="13.5"
      cy="15.5"
      r="1.6"
    />
  {:else if kind === 'video'}
    <path class="fill" d="m10 10 5 3-5 3Z" />
  {:else if kind === 'code'}
    <path d="m9.5 10-3 3 3 3M14.5 10l3 3-3 3" />
  {:else if kind === 'text'}
    <path d="M8.5 11h7M8.5 14h7M8.5 17h4" />
  {:else if kind === 'image'}
    <circle cx="9.3" cy="12.3" r="1.3" /><path d="m17 18-4.5-4.5L8 18" />
  {:else if label}
    <text x="12" y="16.5" text-anchor="middle">{label}</text>
  {/if}
</svg>

<style>
  .file-type-icon {
    width: 1.25em;
    height: 1.25em;
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .file-type-icon .doc {
    fill: var(--surface, #fff);
  }
  .file-type-icon .fill {
    fill: currentColor;
    stroke: none;
  }
  .file-type-icon .band {
    stroke: none;
    fill: var(--muted, #6b6b6b);
  }
  .file-type-icon .band-label {
    fill: #fff;
    stroke: none;
    font-size: 5.2px;
    font-weight: 700;
    font-family: inherit;
    letter-spacing: -0.2px;
  }
  .file-type-icon text {
    fill: currentColor;
    stroke: none;
    font-size: 6.5px;
    font-weight: 700;
    font-family: inherit;
  }
  .file-type-icon[data-file-icon='word'] .band {
    fill: #2b579a;
  }
  .file-type-icon[data-file-icon='excel'] .band {
    fill: #217346;
  }
  .file-type-icon[data-file-icon='powerpoint'] .band {
    fill: #d24726;
  }
  .file-type-icon[data-file-icon='pdf'] .band {
    fill: #e5342a;
  }
  .file-type-icon[data-file-icon='pdf'] .band-label {
    font-size: 4.4px;
    letter-spacing: 0;
  }
  .file-type-icon[data-file-icon='archive'] .band {
    fill: #767676;
  }
  .file-type-icon[data-file-icon='archive'] .band-label {
    font-size: 4.4px;
    letter-spacing: 0;
  }
</style>
