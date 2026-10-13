import { expect, it } from 'vitest';
import {
  newSession,
  sessionFingerprint,
  isSessionDirty,
  assertEditableSnapshot,
  removeImageReferences,
  remapImageReferences,
} from '../../src/lib/client/editor/model.ts';

it('new empty/cleared editor has no exit prompt; changes include attachments and dates', () => {
  const session = newSession(100);
  const clean = sessionFingerprint(session);
  expect(isSessionDirty(session, clean)).toBe(false);
  expect(isSessionDirty({ ...session, bodyMarkdown: 'note' }, clean)).toBe(
    true,
  );
  expect(isSessionDirty({ ...session, bodyMarkdown: ' \n ' }, clean)).toBe(
    false,
  );
  const edit = {
    ...session,
    kind: 'edit' as const,
    serverBase: {
      noteId: crypto.randomUUID(),
      revision: 1,
      snapshotDigest: 'a'.repeat(64),
    },
    bodyMarkdown: 'saved',
  };
  const base = sessionFingerprint(edit);
  expect(isSessionDirty(edit, base)).toBe(false);
  expect(isSessionDirty({ ...edit, timelineAt: 101 }, base)).toBe(true);
  expect(isSessionDirty({ ...edit, bodyMarkdown: '' }, base)).toBe(true);
});
it('image removal and retry remapping preserve code and first reference-definition semantics', () => {
  const id = crypto.randomUUID(),
    next = crypto.randomUUID();
  const source = `![inline](attachment:${id})\n\n![ref][photo]\n\n[photo]: attachment:${id}\n[photo]: attachment:${next}\n\n\`![code](attachment:${id})\``;
  const removed = removeImageReferences(source, id);
  expect(removed).not.toContain('![inline]');
  expect(removed).not.toContain('![ref]');
  expect(removed).toContain(`\`![code](attachment:${id})\``);
  const copied = remapImageReferences(source, new Map([[id, next]]));
  expect(copied).toContain(`![inline](attachment:${next})`);
  expect(copied).toContain(`\`![code](attachment:${id})\``);
});
it('editing requires full attachment metadata and a non-Trash server snapshot', () => {
  const note = {
    id: crypto.randomUUID(),
    status: 'published' as const,
    priorStatus: null,
    bodyMarkdown: 'note',
    timelineAt: 100,
    createdAt: 100,
    updatedAt: 100,
    contentEditedAt: null,
    pinnedAt: null,
    revision: 1,
    attachmentIds: [],
    attachments: [],
    tags: [],
  };
  expect(() => assertEditableSnapshot(note)).not.toThrow();
  expect(() =>
    assertEditableSnapshot({ ...note, attachmentIds: [crypto.randomUUID()] }),
  ).toThrow('incomplete');
  expect(() =>
    assertEditableSnapshot({
      ...note,
      status: 'trash',
      priorStatus: 'published',
    }),
  ).toThrow('Restore');
});
