import { createHash } from 'node:crypto';
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  inArray,
  lt,
  or,
  sql,
} from 'drizzle-orm';
import type { Persistence } from '../db/connection.ts';
import {
  notes,
  tags,
  noteTags,
  attachments,
  noteAttachments,
} from '../db/schema.ts';
import type { SessionIdentity } from '../auth/service.ts';
import { assertSessionIdentity } from '../auth/identity.ts';
import { readSettings } from '../settings/repository.ts';
import { attachmentDto } from '../attachments/service.ts';
import { DomainError, type NoteSnapshot } from '../../shared/domain.ts';
import { renderMarkdown } from '../../shared/markdown/render.ts';
import {
  CARD_SOURCE_BYTES,
  boundedPreview,
  PAGE_SOURCE_BYTES,
  cardImages,
  currentMonthEnd,
  cursorPayloadSchema,
  filterKey,
  parseTimelineQuery,
  type CursorPayload,
  type TimelinePage,
  type TimelineTag,
} from '../../shared/timeline.ts';

// Cursors contain no authority: all predicates and session checks still apply.
// A query fingerprint binds canonical filters, timezone and the fixed anchor.
function fingerprint(
  filters: string,
  timezone: string,
  anchor: number | null,
): string {
  return createHash('sha256')
    .update(JSON.stringify([filters, timezone, anchor]))
    .digest('hex');
}
export function encodeCursor(value: CursorPayload): string {
  return Buffer.from(JSON.stringify(cursorPayloadSchema.parse(value))).toString(
    'base64url',
  );
}
export function decodeCursor(value: string): CursorPayload {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error();
    const buffer = Buffer.from(value, 'base64url');
    if (buffer.toString('base64url') !== value) throw new Error();
    return cursorPayloadSchema.parse(JSON.parse(buffer.toString('utf8')));
  } catch {
    throw new DomainError(
      'validation',
      'Invalid timeline cursor. Start from the first page.',
    );
  }
}
export async function timelinePage(
  p: Persistence,
  identity: SessionIdentity,
  params: URLSearchParams,
  now = Date.now(),
): Promise<TimelinePage> {
  const { filters, cursor, limit } = parseTimelineQuery(params);
  const timezone = readSettings(p).timezone;
  const decoded = cursor ? decodeCursor(cursor) : null;
  const anchor = decoded
    ? decoded.anchor
    : filters.tags.length
      ? null
      : currentMonthEnd(timezone, now);
  const key = fingerprint(filterKey(filters), timezone, anchor);
  if (
    decoded &&
    (decoded.key !== key ||
      decoded.timezone !== timezone ||
      (filters.tags.length > 0 && anchor !== null))
  )
    throw new DomainError(
      'validation',
      'This cursor belongs to different filters or timezone. Start from the first page.',
    );
  const result = p.db.transaction((tx) => {
    assertSessionIdentity(tx, identity);
    const predicates = [eq(notes.status, 'published')];
    if (anchor !== null) predicates.push(lt(notes.timelineAt, anchor));
    if (decoded)
      predicates.push(
        or(
          lt(notes.timelineAt, decoded.at),
          and(eq(notes.timelineAt, decoded.at), lt(notes.id, decoded.id)),
        )!,
      );
    for (const tag of filters.tags)
      predicates.push(
        sql`exists (select 1 from ${noteTags} inner join ${tags} on ${tags.id} = ${noteTags.tagId} where ${noteTags.noteId} = ${notes.id} and ${tags.normalizedKey} = ${tag})`,
      );
    const rows = tx
      .select({
        ...getTableColumns(notes),
        bodyMarkdown: sql<string>`substr(${notes.bodyMarkdown}, 1, ${CARD_SOURCE_BYTES + 1})`,
      })
      .from(notes)
      .where(and(...predicates))
      .orderBy(desc(notes.timelineAt), desc(notes.id))
      .limit(limit + 1)
      .all();
    let used = 0;
    const bounded = [];
    // Stop at a contiguous ordering boundary, never filter out intervening rows.
    for (const row of rows.slice(0, limit)) {
      const bytes = Buffer.byteLength(
        boundedPreview(row.bodyMarkdown).bodyMarkdown,
        'utf8',
      );
      if (bounded.length && used + bytes > PAGE_SOURCE_BYTES) break;
      bounded.push(row);
      used += bytes;
    }
    const ids = bounded.map((r) => r.id);
    const linkedTags = ids.length
      ? tx
          .select({ noteId: noteTags.noteId, key: tags.normalizedKey })
          .from(noteTags)
          .innerJoin(tags, eq(noteTags.tagId, tags.id))
          .where(inArray(noteTags.noteId, ids))
          .orderBy(asc(tags.normalizedKey))
          .all()
      : [];
    const linkedFiles = ids.length
      ? tx
          .select({ noteId: noteAttachments.noteId, attachment: attachments })
          .from(noteAttachments)
          .innerJoin(
            attachments,
            eq(attachments.id, noteAttachments.attachmentId),
          )
          .where(inArray(noteAttachments.noteId, ids))
          .orderBy(asc(noteAttachments.ordinal))
          .all()
      : [];
    const items = bounded.map((row) => {
      const content = boundedPreview(row.bodyMarkdown);
      const files = linkedFiles
        .filter((a) => a.noteId === row.id)
        .map((a) => attachmentDto(a.attachment));
      const note: NoteSnapshot & { bodyTruncated: boolean } = {
        id: row.id,
        status: row.status,
        priorStatus: row.priorStatus,
        timelineAt: row.timelineAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        contentEditedAt: row.contentEditedAt,
        revision: row.revision,
        ...content,
        location:
          row.latitude === null || row.longitude === null
            ? null
            : {
                latitude: row.latitude,
                longitude: row.longitude,
                accuracy: row.accuracy,
                label: row.locationLabel,
              },
        attachmentIds: files.map((a) => a.id),
        attachments: files,
        tags: linkedTags.filter((t) => t.noteId === row.id).map((t) => t.key),
      };
      return note;
    });
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        last && rows.length > items.length
          ? encodeCursor({
              v: 1,
              key,
              timezone,
              anchor,
              at: last.timelineAt,
              id: last.id,
            })
          : null,
    };
  });
  const items = [];
  // Bounded sequential rendering limits simultaneous AST/highlighter work.
  for (const note of result.items)
    items.push({
      ...note,
      rendered: await renderMarkdown(note.bodyMarkdown, cardImages(note)),
    });
  return { filters, anchor, items, nextCursor: result.nextCursor };
}
export function publishedTags(
  p: Persistence,
  identity: SessionIdentity,
): TimelineTag[] {
  return p.db.transaction((tx) => {
    assertSessionIdentity(tx, identity);
    return tx
      .select({
        id: tags.id,
        key: tags.normalizedKey,
        label: tags.display,
        count: sql<number>`count(*)`,
      })
      .from(tags)
      .innerJoin(noteTags, eq(tags.id, noteTags.tagId))
      .innerJoin(notes, eq(notes.id, noteTags.noteId))
      .where(eq(notes.status, 'published'))
      .groupBy(tags.id)
      .orderBy(asc(tags.normalizedKey))
      .all();
  });
}
