import { z } from 'zod';
import { DomainError, instantSchema, type NoteSnapshot } from './domain.ts';
import {
  renderMarkdown,
  type RenderedMarkdown,
  type ImageReference,
} from './markdown/render.ts';
import { Temporal } from '@js-temporal/polyfill';

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
export async function snapshotCard(note: NoteSnapshot): Promise<TimelineCard> {
  const content = boundedPreview(note.bodyMarkdown);
  return {
    ...note,
    ...content,
    rendered: await renderMarkdown(content.bodyMarkdown, cardImages(note)),
  };
}
export interface TimelineFilters {
  tags: string[];
}
export interface TimelineCard extends NoteSnapshot {
  bodyTruncated: boolean;
  rendered: RenderedMarkdown;
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

export function canonicalFilters(tags: readonly string[]): TimelineFilters {
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
  return { tags: [...new Set(normalized)].sort() };
}
export function filterKey(filters: TimelineFilters): string {
  return JSON.stringify(canonicalFilters(filters.tags).tags);
}
export function filterHref(filters: TimelineFilters): string {
  const params = new URLSearchParams();
  for (const tag of canonicalFilters(filters.tags).tags)
    params.append('tag', tag);
  return `/${params.size ? `?${params}` : ''}`;
}
export function toggleTag(filters: TimelineFilters, tag: string): string {
  const key = canonicalFilters([tag]).tags[0];
  return filterHref(
    canonicalFilters(
      filters.tags.includes(key)
        ? filters.tags.filter((t) => t !== key)
        : [...filters.tags, key],
    ),
  );
}
export function parseTimelineQuery(params: URLSearchParams) {
  if (
    params.toString().length > 8192 ||
    [...params.keys()].some(
      (key) => !['tag', 'cursor', 'limit'].includes(key),
    ) ||
    params.getAll('cursor').length > 1 ||
    params.getAll('limit').length > 1
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
  return {
    filters: canonicalFilters(params.getAll('tag')),
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
