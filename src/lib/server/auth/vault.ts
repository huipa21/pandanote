import { and, eq, sql } from 'drizzle-orm';
import type { DomainDatabase, DomainTransaction } from '../db/connection.ts';
import { notes, noteAttachments } from '../db/schema.ts';
import { DomainError } from '../../shared/domain.ts';
import type { SessionIdentity } from './service.ts';
import { assertSessionIdentity } from './identity.ts';

type Reader = DomainDatabase | DomainTransaction;

export function vaultState(db: Reader, identity: SessionIdentity) {
  const session = assertSessionIdentity(db, identity);
  return { open: session.vaultOpen, version: session.vaultVersion };
}

export function visibleNotes(db: Reader, identity: SessionIdentity) {
  return vaultState(db, identity).open ? sql`1` : eq(notes.isPrivate, false);
}

export function assertNoteVisible(
  db: Reader,
  identity: SessionIdentity,
  note: { isPrivate: boolean },
) {
  if (note.isPrivate && !vaultState(db, identity).open)
    throw new DomainError('not-found', 'err.noteNotFoundKeepYour');
}

export function visibleAttachment(
  db: Reader,
  identity: SessionIdentity,
  id: string,
) {
  return (
    db
      .select({ id: notes.id })
      .from(noteAttachments)
      .innerJoin(notes, eq(notes.id, noteAttachments.noteId))
      .where(
        and(eq(noteAttachments.attachmentId, id), visibleNotes(db, identity)),
      )
      .limit(1)
      .get() !== undefined
  );
}
