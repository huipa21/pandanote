import { and, asc, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import type { Persistence } from '../db/connection.ts';
import type { SessionIdentity } from '../auth/service.ts';
import { assertSessionIdentity } from '../auth/identity.ts';
import { visibleNotes, vaultState } from '../auth/vault.ts';
import {
  notes,
  noteAttachments,
  attachments,
  noteTags,
  tags,
} from '../db/schema.ts';
import { DomainError } from '../../shared/domain.ts';
import {
  parseStatusQuery,
  statusCursorSchema,
  statusExcerpt,
  type StatusPage,
} from '../../shared/status-notes.ts';
import { searchPredicates } from '../search/query.ts';
import { tagSpans } from '../../shared/markdown/tags.ts';

/** Hashtags are shown as tag chips on each row, so their text is left out of the excerpt. */
function withoutTagText(source: string): string {
  let spans;
  try {
    spans = tagSpans(source);
  } catch {
    // Only notes over the unique-tag limit fail here; such notes cannot be saved.
    return source;
  }
  let text = source;
  for (const span of [...spans].reverse())
    text = text.slice(0, span.start) + text.slice(span.end);
  return text;
}

export function statusPage(
  p: Persistence,
  identity: SessionIdentity,
  params: URLSearchParams,
): StatusPage {
  const { status, limit, cursor, search, query } = parseStatusQuery(params);
  let decoded: ReturnType<typeof statusCursorSchema.parse> | null = null;
  if (cursor) {
    try {
      if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error();
      const bytes = Buffer.from(cursor, 'base64url');
      if (bytes.toString('base64url') !== cursor) throw new Error();
      decoded = statusCursorSchema.parse(JSON.parse(bytes.toString('utf8')));
      if (decoded.status !== status) throw new Error();
      if (decoded.q !== query) throw new Error();
    } catch {
      throw new DomainError('validation', 'err.invalidCursorOrDifferentStatus');
    }
  }
  return p.db.transaction((tx) => {
    assertSessionIdentity(tx, identity);
    const version = vaultState(tx, identity).version;
    if (decoded && (decoded.vaultVersion ?? 0) !== version)
      throw new DomainError('validation', 'err.invalidCursorOrDifferentStatus');
    const predicates = [
      eq(notes.status, status),
      visibleNotes(tx, identity),
      ...searchPredicates(search),
    ];
    if (decoded)
      predicates.push(
        or(
          lt(notes.timelineAt, decoded.at),
          and(eq(notes.timelineAt, decoded.at), lt(notes.id, decoded.id)),
        )!,
      );
    // Bound selection in SQLite, including sources with NULs. Counts never expose
    // private paths, full source or whole attachment collections.
    const rows = tx
      .select({
        id: notes.id,
        priorStatus: notes.priorStatus,
        revision: notes.revision,
        timelineAt: notes.timelineAt,
        updatedAt: notes.updatedAt,
        source: sql<Buffer | null>`substr(cast(${notes.bodyMarkdown} as blob), 1, 1024)`,
      })
      .from(notes)
      .where(and(...predicates))
      .orderBy(desc(notes.timelineAt), desc(notes.id))
      .limit(limit + 1)
      .all();
    const selected = rows.slice(0, limit);
    const tagRows = selected.length
      ? tx
          .select({ noteId: noteTags.noteId, key: tags.normalizedKey })
          .from(noteTags)
          .innerJoin(tags, eq(noteTags.tagId, tags.id))
          .where(
            inArray(
              noteTags.noteId,
              selected.map((row) => row.id),
            ),
          )
          .orderBy(asc(tags.normalizedKey))
          .all()
      : [];
    const counts = selected.length
      ? tx
          .select({
            noteId: noteAttachments.noteId,
            images: sql<number>`sum(case when ${attachments.kind} = 'image' then 1 else 0 end)`,
            files: sql<number>`sum(case when ${attachments.kind} = 'file' then 1 else 0 end)`,
          })
          .from(noteAttachments)
          .innerJoin(
            attachments,
            eq(attachments.id, noteAttachments.attachmentId),
          )
          .where(
            inArray(
              noteAttachments.noteId,
              selected.map((row) => row.id),
            ),
          )
          .groupBy(noteAttachments.noteId)
          .all()
      : [];
    const items = selected.map(({ source, ...row }) => {
      const count = counts.find((count) => count.noteId === row.id);
      const images = count?.images ?? 0,
        files = count?.files ?? 0;
      return {
        ...row,
        status,
        images,
        files,
        excerpt: statusExcerpt(
          withoutTagText(source?.toString('utf8') ?? ''),
          images,
          files,
        ),
        tags: tagRows.filter((t) => t.noteId === row.id).map((t) => t.key),
      };
    });
    const last = items.at(-1);
    return {
      status,
      items,
      nextCursor:
        last && rows.length > limit
          ? Buffer.from(
              JSON.stringify({
                v: 1,
                status,
                at: last.timelineAt,
                id: last.id,
                q: query,
                vaultVersion: version,
              }),
            ).toString('base64url')
          : null,
    };
  });
}
