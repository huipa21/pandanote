import type { NoteSnapshot } from '#lib/shared/domain.ts';
import { canonicalNoteSnapshot } from '#lib/shared/notes.ts';
import { sha256 } from '../uploads/attempt.ts';
import { draftSchema, newDraft, type LocalDraft } from './model.ts';

/** Only full private snapshots may seed recovery, never bounded timeline cards. */
export async function recoveryDraft(
  accountId: string,
  note: NoteSnapshot,
): Promise<LocalDraft> {
  if (note.status === 'trash')
    throw new Error('Restore this note before editing it.');
  if (
    note.attachmentIds.length !== (note.attachments ?? []).length ||
    note.attachmentIds.some((id, index) => note.attachments?.[index]?.id !== id)
  )
    throw new Error(
      'Attachment metadata is incomplete. Reload the note before editing.',
    );
  return draftSchema.parse({
    ...newDraft(accountId),
    kind: note.status === 'published' ? 'edit-published' : 'edit-server-draft',
    serverBase: {
      noteId: note.id,
      revision: note.revision,
      snapshotDigest: await sha256(canonicalNoteSnapshot(note)),
    },
    bodyMarkdown: note.bodyMarkdown,
    timelineAt: note.timelineAt,
    location: note.location,
    attachments: (note.attachments ?? []).map((file) => ({
      id: file.id,
      source: 'server',
      kind: file.kind,
      filename: file.filename,
      mime: file.mime,
      size: file.storedBytes,
    })),
  });
}
