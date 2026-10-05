import { z } from 'zod';
import { DomainError, instantSchema, type NoteSnapshot } from './domain.ts';
import {
  renderMarkdown,
  type RenderedMarkdown,
  type ImageReference,
} from './markdown/render.ts';
import { Temporal } from '@js-temporal/polyfill';
import {
  canonicalSearch,
  parseSearch,
  searchSnippet,
  normalizeSearch,
  type SearchSnippet,
} from './search.ts';

export const DEFAULT_PAGE_SIZE = 30;
export const MAX_PAGE_SIZE = 100;
export const CARD_SOURCE_BYTES = 8192;
export const PAGE_SOURCE_BYTES = 192 * 1024;
export function boundedPreview(text: string): {
  bodyMarkdown: string;
  bodyTruncated: boolean;
} {
  const bytes = new TextEncoder().encode(text);
  let end = Math.min(bytes.length, CARD_SOURCE_BYTES);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  while (true) {
    try {
      const bodyMarkdown = decoder.decode(bytes.subarray(0, end));
      return { bodyMarkdown, bodyTruncated: bytes.length > end };
    } catch {
      end--;
    }
  }
}
export async function snapshotCard(
  note: NoteSnapshot,
  query = '',
): Promise<TimelineCard> {
  const content = boundedPreview(note.bodyMarkdown);
  const units = parseSearch(query);
  const firstSnippet = (
    field: SearchSnippet['field'],
    fields: readonly string[],
  ) => {
    for (const value of fields) {
      const snippet = searchSnippet(field, normalizeSearch(value), units);
      if (snippet) return snippet;
    }
  };
  return {
    ...note,
    ...content,
    rendered: await renderMarkdown(content.bodyMarkdown, cardImages(note)),
    snippets: units.length
      ? [
          firstSnippet('body', [note.bodyMarkdown]),
          firstSnippet('tag', note.tags),
          firstSnippet(
            'filename',
            (note.attachments ?? []).map((file) => file.filename),
          ),
        ].filter((s): s is SearchSnippet => !!s)
      : undefined,
  };
}
export interface TimelineFilters {
  tags: string[];
  query?: string;
  day?: { start: number; end: number };
}
export interface TimelineCard extends NoteSnapshot {
  bodyTruncated: boolean;
  rendered: RenderedMarkdown;
  snippets?: SearchSnippet[];
}
export interface TimelinePage {
  filters: TimelineFilters;
  anchor: number | null;
  items: TimelineCard[];
  nextCursor: string | null;
}
export interface TimelineTag {
  id: string;
  key: string;
  label: string;
  count: number;
}

export function canonicalFilters(
  tags: readonly string[],
  query = '',
  day?: TimelineFilters['day'],
): TimelineFilters {
  if (tags.length > 20)
    throw new DomainError('validation', 'Select at most 20 tags.');
  const normalized = tags.map((tag) => tag.normalize('NFKC').toLowerCase());
  if (
    // Filters address existing normalized identities, not new hashtag input.
    // NFKC can expand a valid tag (including spaces in Arabic
    // ligatures); reapplying the source grammar here would make it unfilterable.
    normalized.some(
      (tag) => !tag.length || [...tag].length > 64 || /[\p{Cc}#]/u.test(tag),
    )
  )
    throw new DomainError('validation', 'Invalid tag filter.');
  const search = canonicalSearch(query);
  if (
    day &&
    (!instantSchema.safeParse(day.start).success ||
      !instantSchema.safeParse(day.end).success ||
      day.end <= day.start)
  )
    throw new DomainError('validation', 'Invalid selected-day range.');
  return {
    tags: [...new Set(normalized)].sort(),
    ...(search ? { query: search } : {}),
    ...(day ? { day } : {}),
  };
}
export function filterKey(filters: TimelineFilters): string {
  const canonical = canonicalFilters(filters.tags, filters.query, filters.day);
  return JSON.stringify([
    canonical.tags,
    canonical.query ?? '',
    canonical.day ?? null,
  ]);
}
export function filterHref(filters: TimelineFilters): string {
  const params = new URLSearchParams();
  const canonical = canonicalFilters(filters.tags, filters.query, filters.day);
  for (const tag of canonical.tags) params.append('tag', tag);
  if (canonical.query) params.set('q', canonical.query);
  if (canonical.day) {
    params.set('dayStart', String(canonical.day.start));
    params.set('dayEnd', String(canonical.day.end));
  }
  return `/${params.size ? `?${params}` : ''}`;
}
export function toggleTag(filters: TimelineFilters, tag: string): string {
  const key = canonicalFilters([tag]).tags[0];
  return filterHref(
    canonicalFilters(
      filters.tags.includes(key)
        ? filters.tags.filter((t) => t !== key)
        : [...filters.tags, key],
      filters.query,
      filters.day,
    ),
  );
}
export function parseTimelineQuery(params: URLSearchParams) {
  if (
    params.toString().length > 8192 ||
    [...params.keys()].some(
      (key) =>
        !['tag', 'cursor', 'limit', 'q', 'dayStart', 'dayEnd'].includes(key),
    ) ||
    params.getAll('cursor').length > 1 ||
    ['limit', 'q', 'dayStart', 'dayEnd'].some(
      (key) => params.getAll(key).length > 1,
    )
  )
    throw new DomainError('validation', 'Invalid timeline query.');
  const limit = params.get('limit') ?? String(DEFAULT_PAGE_SIZE);
  if (!/^[1-9]\d{0,2}$/.test(limit) || Number(limit) > MAX_PAGE_SIZE)
    throw new DomainError('validation', 'Page size must be between 1 and 100.');
  const cursor = params.get('cursor');
  if (cursor !== null && (!cursor.length || cursor.length > 2048))
    throw new DomainError(
      'validation',
      'Invalid timeline cursor. Start from the first page.',
    );
  const start = params.get('dayStart'),
    end = params.get('dayEnd');
  if (
    (start === null) !== (end === null) ||
    [start, end].some((v) => v !== null && !/^\d{1,16}$/.test(v))
  )
    throw new DomainError('validation', 'Invalid selected-day range.');
  return {
    filters: canonicalFilters(
      params.getAll('tag'),
      params.get('q') ?? '',
      start !== null ? { start: Number(start), end: Number(end) } : undefined,
    ),
    cursor,
    limit: Number(limit),
  };
}
export const cursorPayloadSchema = z.strictObject({
  v: z.literal(1),
  key: z.string().max(4096),
  timezone: z.string().max(100),
  anchor: instantSchema.nullable(),
  at: instantSchema,
  id: z.uuidv4().regex(/^[0-9a-f-]+$/),
});
export type CursorPayload = z.infer<typeof cursorPayloadSchema>;
export function currentMonthEnd(timezone: string, now = Date.now()): number {
  const date =
    Temporal.Instant.fromEpochMilliseconds(now).toZonedDateTimeISO(timezone);
  return date
    .with({ day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 })
    .add({ months: 1 }).epochMilliseconds;
}
export function monthKey(at: number, timezone: string): string {
  return Temporal.Instant.fromEpochMilliseconds(at)
    .toZonedDateTimeISO(timezone)
    .toPlainDate()
    .toString()
    .slice(0, 7);
}
export function cardImages(note: NoteSnapshot): ImageReference[] {
  return (note.attachments ?? [])
    .filter((a) => a.kind === 'image')
    .map((a) => ({
      id: a.id,
      url: `/api/attachments/${a.id}/thumbnail`,
      // Both variants preserve aspect ratio. Reserve layout before lazy decoding.
      width: a.thumbnailWidth ?? a.width ?? undefined,
      height: a.thumbnailHeight ?? a.height ?? undefined,
    }));
}
export function mergeCards(
  current: TimelineCard[],
  incoming: TimelineCard[],
): TimelineCard[] {
  const byId = new Map(current.map((note) => [note.id, note]));
  for (const note of incoming)
    if (!byId.has(note.id) || byId.get(note.id)!.revision <= note.revision)
      byId.set(note.id, note);
  return [...byId.values()].sort(
    (a, b) =>
      b.timelineAt - a.timelineAt || (a.id === b.id ? 0 : a.id < b.id ? 1 : -1),
  );
}
