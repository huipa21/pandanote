import { createHash } from 'node:crypto';
import { dayRange, monthRange } from '../../shared/calendar.ts';
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  gte,
  inArray,
  lt,
  or,
  sql,
} from 'drizzle-orm';
import type { Persistence } from '../db/connection.ts';
import { searchPredicates, snippetColumns } from '../search/query.ts';
import {
  parseSearch,
  searchSnippet,
  type SearchSnippet,
} from '../../shared/search.ts';
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
} from '../../shared/timeline.ts';
import {
  buildTagTree,
  tagAncestors,
  tagSubtreeUpper,
  type TagNode,
} from '../../shared/tag-tree.ts';

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
  const units = parseSearch(filters.query ?? '');
  const timezone = readSettings(p).timezone;
  if (filters.date) filters.day = dayRange(filters.date, timezone);
  const month = filters.month ? monthRange(filters.month, timezone) : null;
  const decoded = cursor ? decodeCursor(cursor) : null;
  const anchor = decoded
    ? decoded.anchor
    : month
      ? month.end
      : filters.tags.length || units.length || filters.day
        ? null
        : currentMonthEnd(timezone, now);
  const key = fingerprint(filterKey(filters), timezone, anchor);
  if (
    decoded &&
    (decoded.key !== key ||
      decoded.timezone !== timezone ||
      (month && anchor !== month.end) ||
      (!month &&
        (filters.tags.length > 0 || units.length > 0 || filters.day) &&
        anchor !== null))
  )
    throw new DomainError(
      'validation',
      'This cursor belongs to different filters or timezone. Start from the first page.',
    );
  const result = p.db.transaction((tx) => {
    assertSessionIdentity(tx, identity);
    const predicates = [
      eq(notes.status, 'published'),
      ...searchPredicates(units),
    ];
    if (filters.day)
      predicates.push(
        gte(notes.timelineAt, filters.day.start),
        lt(notes.timelineAt, filters.day.end),
      );
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
        // Subtree match: the tag itself or any `tag/...` descendant (BINARY range).
        sql`exists (select 1 from ${noteTags} inner join ${tags} on ${tags.id} = ${noteTags.tagId} where ${noteTags.noteId} = ${notes.id} and (${tags.normalizedKey} = ${tag} or (${tags.normalizedKey} >= ${tag + '/'} and ${tags.normalizedKey} < ${tagSubtreeUpper(tag)})))`,
      );
    const rows = tx
      .select({
        ...getTableColumns(notes),
        bodyMarkdown: sql<string>`substr(${notes.bodyMarkdown}, 1, ${CARD_SOURCE_BYTES + 1})`,
        ...snippetColumns(units),
      })
      .from(notes)
      .where(and(...predicates))
      .orderBy(desc(notes.timelineAt), desc(notes.id))
      .limit(limit + 1)
      .all();
    const emptyMonth = Boolean(
      month && !decoded && (!rows.length || rows[0].timelineAt < month.start),
    );
    let used = 0;
    const bounded = [];
    // Stop at a contiguous ordering boundary, never filter out intervening rows.
    for (const row of emptyMonth ? [] : rows.slice(0, limit)) {
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
      const snippets = units.length
        ? [
            row.searchBody
              ? searchSnippet('body', row.searchBody, units)
              : undefined,
            row.searchTag
              ? searchSnippet('tag', row.searchTag, units)
              : undefined,
            row.searchFilename
              ? searchSnippet('filename', row.searchFilename, units)
              : undefined,
          ].filter((s): s is SearchSnippet => !!s)
        : undefined;
      const note: NoteSnapshot & {
        bodyTruncated: boolean;
        snippets?: SearchSnippet[];
      } = {
        id: row.id,
        status: row.status,
        priorStatus: row.priorStatus,
        timelineAt: row.timelineAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        contentEditedAt: row.contentEditedAt,
        revision: row.revision,
        ...content,
        ...(snippets ? { snippets } : {}),
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
      emptyMonth,
      nextCursor:
        emptyMonth && rows.length
          ? encodeCursor({
              v: 1,
              key,
              timezone,
              anchor,
              at: month!.start,
              id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
            })
          : last && rows.length > items.length
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
  return {
    filters,
    anchor,
    items,
    nextCursor: result.nextCursor,
    emptyMonth: result.emptyMonth,
  };
}
/** Count-ordered nested tag tree of published notes (docs/nested-tags/SPEC.md §2-3).
 * One covering read of published (note, tag) pairs; every node counts distinct notes
 * within its subtree, aggregated in memory (bounded by the 100-tags-per-note cap). */
export function publishedTags(
  p: Persistence,
  identity: SessionIdentity,
): TagNode[] {
  return p.db.transaction((tx) => {
    assertSessionIdentity(tx, identity);
    const registry = new Map(
      tx
        .all<{
          id: string;
          key: string;
          display: string;
        }>(sql`select id, normalized_key as key, display from tags`)
        .map((row) => [row.id, row]),
    );
    // notes_status_timeline and the note_tags primary key cover this scan.
    const pairs = tx.all<{ note: string; tag: string }>(
      sql`select nt.note_id as note, nt.tag_id as tag from notes n
        join note_tags nt on nt.note_id = n.id where n.status = 'published'`,
    );
    const direct = new Map<string, number>();
    const within = new Map<string, Set<string>>();
    const paths = new Map<string, string[]>();
    for (const { note, tag } of pairs) {
      direct.set(tag, (direct.get(tag) ?? 0) + 1);
      let path = paths.get(tag);
      if (!path) {
        const key = registry.get(tag)!.key;
        paths.set(tag, (path = [...tagAncestors(key), key]));
      }
      for (const key of path) {
        let notesWithin = within.get(key);
        if (!notesWithin) within.set(key, (notesWithin = new Set()));
        notesWithin.add(note);
      }
    }
    return buildTagTree(
      [...direct].map(([tag, count]) => ({
        key: registry.get(tag)!.key,
        display: registry.get(tag)!.display,
        count,
      })),
      new Map([...within].map(([key, set]) => [key, set.size])),
    );
  });
}
