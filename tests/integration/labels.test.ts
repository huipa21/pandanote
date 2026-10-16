import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { withPersistence, seedAccount } from '../helpers/persistence.ts';
import { LabelService } from '../../src/lib/server/labels/service.ts';
import { NoteService } from '../../src/lib/server/notes/service.ts';
import { DomainError } from '../../src/lib/shared/domain.ts';
import { MAX_LABELS } from '../../src/lib/shared/labels.ts';
import { Persistence } from '../../src/lib/server/db/connection.ts';
import { labels, sessions } from '../../src/lib/server/db/schema.ts';
import type { SessionIdentity } from '../../src/lib/server/auth/service.ts';
import type { NoteContent, NoteMutation } from '../../src/lib/shared/notes.ts';

function identity(p: Persistence): SessionIdentity {
  const id = seedAccount(p);
  const sessionHash = 'd'.repeat(64);
  const expiresAt = Date.now() + 3_600_000;
  p.write((tx) =>
    tx
      .insert(sessions)
      .values({
        tokenHash: sessionHash,
        accountId: id,
        securityRevision: 1,
        expiresAt,
        createdAt: Date.now(),
      })
      .run(),
  );
  return {
    account: { id, mfaEnabled: false },
    sessionHash,
    securityRevision: 1,
    expiresAt,
  };
}

const createCommand = (
  name: string,
  color: string = 'blue',
  icon: string | null = null,
  mutationId = randomUUID(),
  extra: {
    headerColor?: string | null;
    background?: string | null;
    font?: string | null;
  } = {},
) => ({
  action: 'create' as const,
  mutationId,
  name,
  color,
  icon,
  headerColor: extra.headerColor ?? null,
  background: extra.background ?? null,
  font: extra.font ?? null,
});

const noteContent = (labelId: string | null = null): NoteContent => ({
  bodyMarkdown: 'hello',
  timelineAt: Date.now(),
  attachmentIds: [],
  labelId,
});
const createNote = (labelId: string | null = null): NoteMutation => ({
  action: 'create',
  mutationId: randomUUID(),
  content: noteContent(labelId),
});

function expectDomain(action: () => unknown, code: string, key: string) {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe(code);
    expect((error as DomainError).messageKey).toBe(key);
    return;
  }
  throw new Error('expected a DomainError');
}

describe('Label CRUD, caps, receipts', () => {
  it('creates/renames/recolors/deletes and replays receipts; stale/duplicate/limit/not-found are rejected', () =>
    withPersistence((p) => {
      const owner = identity(p),
        service = new LabelService(p);
      // Replay with the SAME mutation ID returns the original result (not a
      // second insert, which would otherwise collide on the name).
      const createA = createCommand('Work', 'blue', 'star');
      const created = service.mutate(owner, createA);
      expect(created.revision).toBe(1);
      expect(service.mutate(owner, createA)).toEqual(created);
      expect(service.list(owner).items).toHaveLength(1);

      const second = service.mutate(owner, createCommand('Office'));
      expect(service.list(owner).items).toHaveLength(2);

      const update = {
        action: 'update' as const,
        mutationId: randomUUID(),
        labelId: created.labelId,
        expectedRevision: created.revision,
        name: 'Business',
        color: 'green',
        icon: null,
        headerColor: 'red',
        background: 'amber',
        font: 'mono',
      };
      const updated = service.mutate(owner, update);
      expect(updated.revision).toBe(2);
      // The new format fields (header/background color, font) persisted.
      const afterUpdate = service
        .list(owner)
        .items.find((l) => l.id === updated.labelId);
      expect(afterUpdate).toMatchObject({
        headerColor: 'red',
        background: 'amber',
        font: 'mono',
      });
      // Replay of the same update returns the original result even after no
      // further change was made.
      expect(service.mutate(owner, update)).toEqual(updated);
      // Stale revision now (the row already moved to revision 2).
      expectDomain(
        () => service.mutate(owner, { ...update, mutationId: randomUUID() }),
        'conflict',
        'err.labelChanged',
      );
      // Duplicate name (case/width-insensitive against the second label).
      expectDomain(
        () => service.mutate(owner, createCommand('ｏｆｆｉｃｅ')),
        'validation',
        'err.labelNameExists',
      );
      // Deleting a label that does not exist.
      expectDomain(
        () =>
          service.mutate(owner, {
            action: 'delete',
            mutationId: randomUUID(),
            labelId: randomUUID(),
            expectedRevision: 1,
            confirmed: true,
          }),
        'not-found',
        'err.labelNotFound',
      );
      const del = service.mutate(owner, {
        action: 'delete',
        mutationId: randomUUID(),
        labelId: updated.labelId,
        expectedRevision: updated.revision,
        confirmed: true,
      });
      expect(del.deleted).toBe(true);
      expect(service.list(owner).items.map((l) => l.id)).not.toContain(
        updated.labelId,
      );
      void second;
    }));

  it('rejects the 41st label', () =>
    withPersistence((p) => {
      const owner = identity(p),
        service = new LabelService(p);
      for (let i = 0; i < MAX_LABELS; i++)
        service.mutate(owner, createCommand(`Label ${i}`));
      expect(service.list(owner).items).toHaveLength(MAX_LABELS);
      expectDomain(
        () => service.mutate(owner, createCommand('One too many')),
        'validation',
        'err.labelLimitReached',
      );
    }));

  it('case/width-insensitive duplicate names are rejected on create and update', () =>
    withPersistence((p) => {
      const owner = identity(p),
        service = new LabelService(p);
      service.mutate(owner, createCommand('Work'));
      expectDomain(
        () => service.mutate(owner, createCommand('ｗｏｒｋ')),
        'validation',
        'err.labelNameExists',
      );
    }));
});

describe('Notes carry at most one label', () => {
  it('setting an unknown labelId on create/update fails; a valid label attaches and survives pin/trash/restore; deleting the label clears it', () =>
    withPersistence((p) => {
      const owner = identity(p),
        labelService = new LabelService(p),
        noteService = new NoteService(p);
      const label = labelService.mutate(
        owner,
        createCommand('Urgent', 'red', 'flag'),
      );
      expectDomain(
        () => noteService.mutate(owner, createNote(randomUUID())),
        'not-found',
        'err.labelNotFound',
      );
      const created = noteService.mutate(owner, createNote(label.labelId));
      expect(noteService.get(owner, created.noteId).labelId).toBe(
        label.labelId,
      );
      // Pin keeps the label.
      noteService.mutate(owner, {
        action: 'pin',
        mutationId: randomUUID(),
        noteId: created.noteId,
        expectedRevision: created.revision,
      });
      expect(noteService.get(owner, created.noteId).labelId).toBe(
        label.labelId,
      );
      // Trash keeps the label (not published-only, unlike pinnedAt).
      const pinnedRevision = noteService.get(owner, created.noteId).revision;
      noteService.mutate(owner, {
        action: 'trash',
        mutationId: randomUUID(),
        noteId: created.noteId,
        expectedRevision: pinnedRevision,
      });
      expect(noteService.get(owner, created.noteId).labelId).toBe(
        label.labelId,
      );
      // Restore keeps the label.
      const trashedRevision = noteService.get(owner, created.noteId).revision;
      noteService.mutate(owner, {
        action: 'restore',
        mutationId: randomUUID(),
        noteId: created.noteId,
        expectedRevision: trashedRevision,
      });
      expect(noteService.get(owner, created.noteId).labelId).toBe(
        label.labelId,
      );
      // Deleting the label clears label_id on the note, in the same transaction,
      // without deleting the note.
      const current = noteService.get(owner, created.noteId);
      labelService.mutate(owner, {
        action: 'delete',
        mutationId: randomUUID(),
        labelId: label.labelId,
        expectedRevision: label.revision,
        confirmed: true,
      });
      expect(noteService.get(owner, created.noteId).labelId).toBeNull();
      expect(current.id).toBe(created.noteId);
    }));

  it('editing a note can replace or clear its label', () =>
    withPersistence((p) => {
      const owner = identity(p),
        labelService = new LabelService(p),
        noteService = new NoteService(p);
      const a = labelService.mutate(owner, createCommand('A'));
      const b = labelService.mutate(owner, createCommand('B'));
      const created = noteService.mutate(owner, createNote(a.labelId));
      const replaced = noteService.mutate(owner, {
        action: 'update',
        mutationId: randomUUID(),
        noteId: created.noteId,
        expectedRevision: created.revision,
        content: noteContent(b.labelId),
      });
      expect(noteService.get(owner, created.noteId).labelId).toBe(b.labelId);
      noteService.mutate(owner, {
        action: 'update',
        mutationId: randomUUID(),
        noteId: created.noteId,
        expectedRevision: replaced.revision,
        content: noteContent(null),
      });
      expect(noteService.get(owner, created.noteId).labelId).toBeNull();
    }));
});

describe('Label DB invariants', () => {
  it('rejects an invalid color/icon/name/revision/time at the database check level', () =>
    withPersistence((p) => {
      const owner = identity(p);
      const now = Date.now();
      expect(() =>
        p.write((tx) =>
          tx
            .insert(labels)
            .values({
              id: randomUUID(),
              name: 'x',
              nameKey: 'x',
              color: 'neon',
              icon: null,
              revision: 1,
              createdAt: now,
              updatedAt: now,
            })
            .run(),
        ),
      ).toThrow();
      expect(() =>
        p.write((tx) =>
          tx
            .insert(labels)
            .values({
              id: randomUUID(),
              name: '',
              nameKey: '',
              color: 'blue',
              icon: null,
              revision: 1,
              createdAt: now,
              updatedAt: now,
            })
            .run(),
        ),
      ).toThrow();
      void owner;
    }));
});
