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
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from 'drizzle-orm';
import type { Persistence } from '../db/connection.ts';
import { searchPredicates, snippetColumns } from '../search/query.ts';
import {
  parseSearch,
  positiveSearch,
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
import { visibleNotes, vaultState } from '../auth/vault.ts';
import { readSettings } from '../settings/repository.ts';
import { attachmentDto } from '../attachments/service.ts';
import { DomainError, type NoteSnapshot } from '../../shared/domain.ts';
import { renderMarkdown } from '../../shared/markdown/render.ts';
import { MAX_PINNED_NOTES } from '../../shared/notes.ts';
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
    throw new DomainError('validation', 'err.invalidTimelineCursorStartFrom');
  }
}
type Reader = Persistence['db'];
type CardRow = typeof notes.$inferSelect &
  Partial<Record<'searchBody' | 'searchTag' | 'searchFilename', string | null>>;
type TimelineItem = NoteSnapshot & {
  bodyTruncated: boolean;
  snippets?: SearchSnippet[];
};
/** Bounded card sources plus tags, files and search snippets for the given rows. */
function hydrate(
  tx: Pick<Reader, 'select'>,
  rows: CardRow[],
  search: ReturnType<typeof parseSearch>,
): TimelineItem[] {
  const ids = rows.map((r) => r.id);
  const { terms, tags: tagKeys } = positiveSearch(search);
  const hasPositive = terms.length > 0 || tagKeys.length > 0;
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
  return rows.map((row) => {
    const content = boundedPreview(row.bodyMarkdown);
    const files = linkedFiles
      .filter((a) => a.noteId === row.id)
      .map((a) => attachmentDto(a.attachment));
    const snippets = hasPositive
      ? [
          row.searchBody
            ? searchSnippet('body', row.searchBody, terms)
            : undefined,
          row.searchTag
            ? searchSnippet('tag', row.searchTag, [...terms, ...tagKeys])
            : undefined,
          row.searchFilename
            ? searchSnippet('filename', row.searchFilename, terms)
            : undefined,
        ].filter((s): s is SearchSnippet => !!s)
      : undefined;
    const note: NoteSnapshot & {
      bodyTruncated: boolean;
      snippets?: SearchSnippet[];
    } = {
      id: row.id,
      isPrivate: row.isPrivate,
      status: row.status,
      priorStatus: row.priorStatus,
      pinnedAt: row.pinnedAt,
      timelineAt: row.timelineAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      contentEditedAt: row.contentEditedAt,
      revision: row.revision,
      ...content,
      ...(snippets ? { snippets } : {}),
      attachmentIds: files.map((a) => a.id),
      attachments: files,
      tags: linkedTags.filter((t) => t.noteId === row.id).map((t) => t.key),
    };
    return note;
  });
}
function pinnedRows(
  tx: Pick<Reader, 'select'>,
  search: ReturnType<typeof parseSearch>,
  visibility: ReturnType<typeof visibleNotes>,
) {
  return tx
    .select({
      ...getTableColumns(notes),
      bodyMarkdown: sql<string>`substr(${notes.bodyMarkdown}, 1, ${CARD_SOURCE_BYTES + 1})`,
      ...snippetColumns(search),
    })
    .from(notes)
    .where(
      and(eq(notes.status, 'published'), isNotNull(notes.pinnedAt), visibility),
    )
    .orderBy(desc(notes.pinnedAt), desc(notes.id))
    .limit(MAX_PINNED_NOTES)
    .all();
}
export async function timelinePage(
  p: Persistence,
  identity: SessionIdentity,
  params: URLSearchParams,
  now = Date.now(),
): Promise<TimelinePage> {
  const { filters, cursor, limit } = parseTimelineQuery(params);
  const search = parseSearch(filters.query ?? '');
  const settings = readSettings(p);
  const timezone = settings.timezone;
  if (filters.date) filters.day = dayRange(filters.date, timezone);
  const month = filters.month ? monthRange(filters.month, timezone) : null;
  const decoded = cursor ? decodeCursor(cursor) : null;
  const anchor = decoded
    ? decoded.anchor
    : month
      ? month.end
      : filters.tag !== undefined || search || filters.day
        ? null
        : currentMonthEnd(timezone, now);
  const vault = vaultState(p.db, identity);
  if (filters.vault && !vault.open)
    throw new DomainError('unauthorized', 'vault.required');
  const key = fingerprint(
    filterKey(filters) + '|' + vault.version,
    timezone,
    anchor,
  );
  if (
    decoded &&
    (decoded.key !== key ||
      decoded.timezone !== timezone ||
      (month && anchor !== month.end) ||
      (!month &&
        (filters.tag !== undefined || search || filters.day) &&
        anchor !== null))
  )
    throw new DomainError('validation', 'err.thisCursorBelongsToDifferent');
  // Plain "All notes" view: pinned notes live in their own first-page section and
  // are excluded from the chronological stream.
  const plain =
    !filters.vault &&
    filters.tag === undefined &&
    !search &&
    !filters.day &&
    !filters.month;
  const result = p.db.transaction((tx) => {
    assertSessionIdentity(tx, identity);
    const predicates = [
      eq(notes.status, 'published'),
      visibleNotes(tx, identity),
      ...searchPredicates(search),
    ];
    if (filters.vault) predicates.push(eq(notes.isPrivate, true));
    if (plain) predicates.push(isNull(notes.pinnedAt));
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
    if (filters.tag !== undefined) {
      const tag = filters.tag;
      predicates.push(
        sql`exists (select 1 from ${noteTags} inner join ${tags} on ${tags.id} = ${noteTags.tagId} where ${noteTags.noteId} = ${notes.id} and ${tags.normalizedKey} = ${tag})`,
      );
    }
    const rows = tx
      .select({
        ...getTableColumns(notes),
        bodyMarkdown: sql<string>`substr(${notes.bodyMarkdown}, 1, ${CARD_SOURCE_BYTES + 1})`,
        ...snippetColumns(search),
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
    const items = hydrate(tx, bounded, search);
    const pinned =
      plain && !decoded
        ? hydrate(
            tx,
            pinnedRows(tx, search, visibleNotes(tx, identity)),
            search,
          )
        : undefined;
    const last = items.at(-1);
    return {
      items,
      pinned,
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
  const render = async (list: TimelineItem[]) => {
    const out = [];
    // Bounded sequential rendering limits simultaneous AST/highlighter work.
    for (const note of list)
      out.push({
        ...note,
        rendered: await renderMarkdown(
          note.bodyMarkdown,
          cardImages(note),
          settings.language,
        ),
      });
    return out;
  };
  const items = await render(result.items);
  const pinned = result.pinned ? await render(result.pinned) : undefined;
  return {
    filters,
    anchor,
    items,
    ...(pinned ? { pinned } : {}),
    nextCursor: result.nextCursor,
    emptyMonth: result.emptyMonth,
  };
}
/** Tags of published notes with distinct-note counts, most used first. */
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
      .where(and(eq(notes.status, 'published'), visibleNotes(tx, identity)))
      .groupBy(tags.id)
      .orderBy(sql`count(*) desc`, asc(tags.normalizedKey))
      .all();
  });
}
