import { z } from 'zod';
import { DomainError, idSchema, instantSchema } from './domain.ts';
import { parseSearch } from './search.ts';

export const listStatusSchema = z.enum(['trash']);
export type ListStatus = z.infer<typeof listStatusSchema>;
/** A bounded label, not a full editor/recovery snapshot or a stored title. */
export interface StatusNote {
  id: string;
  status: ListStatus;
  priorStatus: 'published' | null;
  revision: number;
  timelineAt: number;
  updatedAt: number;
  excerpt: string;
  images: number;
  files: number;
  /** Normalized tag keys, as shown on timeline cards. */
  tags: string[];
}
export interface StatusPage {
  status: ListStatus;
  items: StatusNote[];
  nextCursor: string | null;
}
export const statusCursorSchema = z.strictObject({
  v: z.literal(1),
  status: listStatusSchema,
  at: instantSchema,
  id: idSchema,
  // Normalized search units bind the cursor to the query that produced it.
  units: z.array(z.string().max(1024)).max(20),
});
export function parseStatusQuery(params: URLSearchParams) {
  if (
    params.toString().length > 4096 ||
    [...params.keys()].some(
      (key) => !['status', 'cursor', 'limit', 'q'].includes(key),
    ) ||
    ['status', 'cursor', 'limit', 'q'].some(
      (key) => params.getAll(key).length > 1,
    )
  )
    throw new DomainError('validation', 'err.invalidTrashQuery');
  const status = listStatusSchema.safeParse(params.get('status'));
  const rawLimit = params.get('limit') ?? '30';
  const cursor = params.get('cursor');
  if (
    !status.success ||
    !/^[1-9]\d{0,2}$/.test(rawLimit) ||
    Number(rawLimit) > 100 ||
    (cursor !== null && (!cursor || cursor.length > 2048))
  )
    throw new DomainError('validation', 'err.chooseTrashAndAPage');
  // Same literal grammar as note search; an absent or empty q lists all Trash.
  const units = parseSearch(params.get('q') ?? '');
  return { status: status.data, limit: Number(rawLimit), cursor, units };
}
export function statusExcerpt(
  text: string,
  images: number,
  files: number,
): string {
  const clean = text
    .replace(/!\[[^\]]*\]\(attachment:[^)]+\)/g, '')
    .replace(/\s+/gu, ' ')
    .replaceAll('\0', '␀')
    .trim();
  if (!clean)
    return images ? 'Image note' : files ? 'File attachment' : 'Text note';
  const points = [...clean];
  return points.slice(0, 240).join('') + (points.length > 240 ? '…' : '');
}

/** Trash shows this many notes first; scrolling lazy-loads the same amount. */
export const STATUS_PAGE_SIZE = 30;
