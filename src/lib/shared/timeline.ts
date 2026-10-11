import { z } from 'zod';
import { DomainError, instantSchema, type NoteSnapshot } from './domain.ts';
import {
  renderMarkdown,
  type RenderedMarkdown,
  type ImageReference,
} from './markdown/render.ts';
import {
  calendarDate,
  calendarMonth,
  localDate,
  monthRange,
} from './calendar.ts';
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
// Query boundaries may precede epoch zero (a valid earliest note's local day).
// Stored note instants remain nonnegative under the existing domain contract.
const rangeInstantSchema = z
  .number()
  .int()
  .min(-8_640_000_000_000_000)
  .max(8_640_000_000_000_000);
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
  /** At most one tag (normalized key); it matches the tag and its subtags. */
  tag?: string;
  query?: string;
  day?: { start: number; end: number };
  date?: string;
  month?: string;
}
export interface TimelineCard extends NoteSnapshot {
  bodyTruncated: boolean;
  rendered: RenderedMarkdown;
  snippets?: SearchSnippet[];
}
export interface TimelinePage {
  filters: TimelineFilters;
  anchor: number | null;
  emptyMonth?: boolean;
  items: TimelineCard[];
  nextCursor: string | null;
}

export function canonicalFilters(
  tag: string | null | undefined,
  query = '',
  day?: TimelineFilters['day'],
  date?: string,
  month?: string,
): TimelineFilters {
  const normalized = tag?.normalize('NFKC').toLowerCase();
  if (
    normalized !== undefined &&
    // Filters address existing normalized identities, not new hashtag input.
    // NFKC can expand a valid tag (including spaces in Arabic
    // ligatures); reapplying the source grammar here would make it unfilterable.
    (!normalized.length ||
      [...normalized].length > 128 ||
      /[\p{Cc}#]/u.test(normalized) ||
      // Nested paths: 1–5 non-empty segments separated by single slashes.
      normalized.split('/').length > 5 ||
      normalized.split('/').some((part) => !part.length))
  )
    throw new DomainError('validation', 'Invalid tag filter.');
  const search = canonicalSearch(query);
  if (
    day &&
    (!rangeInstantSchema.safeParse(day.start).success ||
      !rangeInstantSchema.safeParse(day.end).success ||
      day.end <= day.start)
  )
    throw new DomainError('validation', 'Invalid selected-day range.');
  if (date) calendarDate(date);
  if (month) calendarMonth(month);
  if (month && (date || day))
    throw new DomainError('validation', 'Choose a month or a day, not both.');
  return {
    ...(date ? { date } : {}),
    ...(month ? { month } : {}),
    ...(normalized !== undefined ? { tag: normalized } : {}),
    ...(search ? { query: search } : {}),
    ...(day ? { day } : {}),
  };
}
export function filterKey(filters: TimelineFilters): string {
  const canonical = canonicalFilters(
    filters.tag,
    filters.query,
    filters.day,
    filters.date,
    filters.month,
  );
  return JSON.stringify([
    canonical.tag ?? null,
    canonical.query ?? '',
    canonical.date ?? canonical.day ?? null,
    canonical.month ?? null,
  ]);
}
export function filterHref(filters: TimelineFilters): string {
  const params = new URLSearchParams();
  const canonical = canonicalFilters(
    filters.tag,
    filters.query,
    filters.day,
    filters.date,
    filters.month,
  );
  if (canonical.tag !== undefined) params.set('tag', canonical.tag);
  if (canonical.query) params.set('q', canonical.query);
  if (canonical.month) params.set('month', canonical.month);
  if (canonical.date) params.set('date', canonical.date);
  else if (canonical.day) {
    params.set('dayStart', String(canonical.day.start));
    params.set('dayEnd', String(canonical.day.end));
  }
  return `/${params.size ? `?${params}` : ''}`;
}
/** Tag views are single-tag: selecting a tag replaces any other tag filter. */
export function selectTag(filters: TimelineFilters, tag: string): string {
  return filterHref(
    canonicalFilters(tag, filters.query, filters.day, filters.date),
  );
}
/** Does a note's tag set fall under the selected tag (itself or a subtag)? */
export function noteHasTag(noteTags: readonly string[], tag: string): boolean {
  return noteTags.some((t) => t === tag || t.startsWith(tag + '/'));
}
export function parseTimelineQuery(params: URLSearchParams) {
  if (params.getAll('tag').length > 1)
    throw new DomainError('validation', 'Select only one tag.');
  if (
    params.toString().length > 8192 ||
    [...params.keys()].some(
      (key) =>
        ![
          'tag',
          'cursor',
          'limit',
          'q',
          'dayStart',
          'dayEnd',
          'date',
          'month',
        ].includes(key),
    ) ||
    params.getAll('cursor').length > 1 ||
    ['limit', 'q', 'dayStart', 'dayEnd', 'date', 'month'].some(
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
    (params.has('date') && start !== null) ||
    (params.has('date') && !params.get('date')) ||
    (params.has('month') && !params.get('month')) ||
    (start === null) !== (end === null) ||
    [start, end].some((v) => v !== null && !/^-?\d{1,16}$/.test(v))
  )
    throw new DomainError('validation', 'Invalid selected-day range.');
  return {
    filters: canonicalFilters(
      params.get('tag'),
      params.get('q') ?? '',
      start !== null ? { start: Number(start), end: Number(end) } : undefined,
      params.get('date') ?? undefined,
      params.get('month') ?? undefined,
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
  return monthRange(monthKey(now, timezone), timezone).end;
}
export function monthKey(at: number, timezone: string): string {
  return localDate(at, timezone).slice(0, 7);
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
/** Photos attached to a note but not embedded in its Markdown, in attachment order. */
export function gridImages(
  note: NoteSnapshot,
): (ImageReference & { filename: string })[] {
  const body = note.bodyMarkdown;
  const embedded = (id: string) =>
    body.includes(`(attachment:${id})`) ||
    new RegExp(`:\\s*attachment:${id}`).test(body);
  return (note.attachments ?? [])
    .filter((a) => a.kind === 'image' && !embedded(a.id))
    .map((a) => ({
      id: a.id,
      url: `/api/attachments/${a.id}/thumbnail`,
      filename: a.filename,
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

/**
 * Compact card date in the account timezone, without timezone text:
 * "Mon, Jul 21" in the current year, "Mon, Jul 21, 2020" otherwise.
 */
export function shortDate(
  at: number,
  timeZone: string,
  now: number = Date.now(),
): string {
  const year = (value: number) =>
    new Intl.DateTimeFormat('en', { timeZone, year: 'numeric' }).format(value);
  return new Intl.DateTimeFormat('en', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(year(at) === year(now) ? {} : { year: 'numeric' }),
  }).format(at);
}
