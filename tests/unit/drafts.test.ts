import { expect, it } from 'vitest';
import {
  DraftRepository,
  draftPrefix,
  type ExclusiveLock,
} from '../../src/lib/client/drafts/repository.ts';
import {
  decodeRecord,
  draftSchema,
  newDraft,
  commandForDraft,
  excerpt,
  recoveryMatches,
  removeImageReferences,
  type DraftAttachment,
} from '../../src/lib/client/drafts/model.ts';
import { commandDigest, sha256 } from '../../src/lib/client/uploads/attempt.ts';
import type { BinaryRepository } from '../../src/lib/client/drafts/blobs.ts';
import { recoveryDraft } from '../../src/lib/client/drafts/recovery.ts';
import type { NoteSnapshot } from '../../src/lib/shared/domain.ts';

const account = '11111111-1111-4111-8111-111111111111';

it('full snapshots seed published/draft recovery, preserve metadata and refuse Trash/incomplete files', async () => {
  const fileId = crypto.randomUUID();
  const note: NoteSnapshot = {
    id: crypto.randomUUID(),
    status: 'published',
    priorStatus: null,
    bodyMarkdown: 'full source 香港',
    timelineAt: 10,
    createdAt: 20,
    updatedAt: 30,
    contentEditedAt: null,
    revision: 7,
    location: { latitude: 0, longitude: 0, accuracy: null, label: 'Synthetic' },
    attachmentIds: [fileId],
    tags: [],
    attachments: [
      {
        id: fileId,
        kind: 'file',
        filename: 'large.bin',
        mime: 'application/octet-stream',
        incomingBytes: 60 * 1024 * 1024,
        storedBytes: 60 * 1024 * 1024,
        readiness: 'ready',
        width: null,
        height: null,
        thumbnailWidth: null,
        thumbnailHeight: null,
      },
    ],
  };
  const recovery = await recoveryDraft(account, note);
  expect(recovery.kind).toBe('edit-published');
  expect(recovery.bodyMarkdown).toBe(note.bodyMarkdown);
  expect(recovery.timelineAt).toBe(10);
  expect(recovery.location).toEqual(note.location);
  expect(recovery.attachments[0].source).toBe('server');
  expect(recovery.serverBase?.revision).toBe(7);
  expect(
    (await recoveryDraft(account, { ...note, status: 'draft' })).kind,
  ).toBe('edit-server-draft');
  await expect(
    recoveryDraft(account, { ...note, status: 'trash', priorStatus: 'draft' }),
  ).rejects.toThrow('Restore');
  await expect(
    recoveryDraft(account, { ...note, attachments: [] }),
  ).rejects.toThrow('incomplete');
  expect(
    draftSchema.safeParse({
      ...recovery,
      attachments: [{ ...recovery.attachments[0], source: 'local' }],
    }).success,
  ).toBe(false);
});

it('conflict forks preserve original text/blobs and remap new uploads without changing shared server IDs', async () => {
  const { repo, blobs } = fixture();
  const localId = crypto.randomUUID(),
    serverId = crypto.randomUUID();
  const base = {
    noteId: crypto.randomUUID(),
    revision: 2,
    snapshotDigest: 'a'.repeat(64),
  };
  let draft = await repo.create({
    ...newDraft(account),
    kind: 'edit-published',
    serverBase: base,
    bodyMarkdown: `![local](attachment:${localId}) ![server](attachment:${serverId})`,
    attachments: [
      {
        id: serverId,
        source: 'server',
        kind: 'image',
        filename: 'server.webp',
        mime: 'image/webp',
        size: 3,
      },
    ],
  });
  draft = await repo.add(
    draft,
    {
      id: localId,
      source: 'local',
      kind: 'image',
      filename: 'local.png',
      mime: 'image/png',
      size: 3,
    },
    new Blob(['abc']),
  );
  const copy = await repo.copy(draft, { kind: 'new', serverBase: null });
  const newId = copy.attachments.find((a) => a.source === 'local')!.id;
  expect(newId).not.toBe(localId);
  expect(copy.bodyMarkdown).toContain(`attachment:${newId}`);
  expect(copy.bodyMarkdown).toContain(`attachment:${serverId}`);
  expect(await blobs.get(account, copy.localDraftId, newId)).toBeDefined();
  expect(repo.read(draft.localDraftId)).toEqual(draft);
  expect(await blobs.get(account, draft.localDraftId, localId)).toBeDefined();
  const replace = await repo.copy(draft, {
    kind: 'edit-published',
    serverBase: { ...base, revision: 3 },
  });
  const command = commandForDraft(replace, crypto.randomUUID());
  expect(command.action).toBe('update');
  expect('expectedRevision' in command && command.expectedRevision).toBe(3);
});
const other = '22222222-2222-4222-8222-222222222222';
class MemoryStorage implements Storage {
  data = new Map<string, string>();
  fail = false;
  get length() {
    return this.data.size;
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  clear() {
    this.data.clear();
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    if (this.fail) throw new Error('quota');
    this.data.set(key, value);
  }
}
class MemoryBlobs implements BinaryRepository {
  data = new Map<string, Blob>();
  fail = false;
  key(a: string, d: string, id: string) {
    return `${a}/${d}/${id}`;
  }
  async put(a: string, d: string, id: string, blob: Blob) {
    if (this.fail) throw new Error('quota');
    this.data.set(this.key(a, d, id), blob);
  }
  async get(a: string, d: string, id: string) {
    return this.data.get(this.key(a, d, id));
  }
  async list(a: string, d: string) {
    return [...this.data.keys()]
      .filter((key) => key.startsWith(`${a}/${d}/`))
      .map((key) => key.split('/')[2]);
  }
  async listDraftIds(a: string) {
    return [
      ...new Set(
        [...this.data.keys()]
          .filter((key) => key.startsWith(`${a}/`))
          .map((key) => key.split('/')[1]),
      ),
    ];
  }
  async remove(a: string, d: string, id: string) {
    if (this.fail) throw new Error('quota');
    this.data.delete(this.key(a, d, id));
  }
  close() {}
}
function fixture() {
  const storage = new MemoryStorage();
  const blobs = new MemoryBlobs();
  let pending = Promise.resolve();
  const lock: ExclusiveLock = (_name, action) => {
    const result = pending.then(action);
    pending = result.then(
      () => {},
      () => {},
    );
    return result;
  };
  return {
    storage,
    blobs,
    repo: new DraftRepository(account, storage, blobs, lock),
    second: new DraftRepository(account, storage, blobs, lock),
    foreign: new DraftRepository(other, storage, blobs, lock),
  };
}
const item = (): DraftAttachment => ({
  id: crypto.randomUUID(),
  source: 'local',
  filename: 'quiet.txt',
  kind: 'file',
  mime: 'text/plain',
  size: 3,
});

it('validates version/account/recovery identity, no title or blob URL fields, and UTF-8 limits', () => {
  const draft = newDraft(account, 10);
  expect(
    decodeRecord(JSON.stringify(draft), account, draft.localDraftId),
  ).toEqual(draft);
  for (const bad of [
    { ...draft, schemaVersion: 9 },
    { ...draft, accountId: other },
    { ...draft, title: 'not allowed' },
    { ...draft, blobUrl: 'blob:secret' },
    { ...draft, kind: 'edit-published' },
  ])
    expect(() =>
      decodeRecord(JSON.stringify(bad), account, draft.localDraftId),
    ).toThrow();
  expect(
    draftSchema.safeParse({ ...draft, bodyMarkdown: '猫'.repeat(350000) })
      .success,
  ).toBe(false);
  expect(() => decodeRecord('{broken', account, draft.localDraftId)).toThrow(
    /kept/,
  );
});
it('persists independent metadata and rebuilds an inconsistent/missing index from authoritative records', async () => {
  const { repo, storage, foreign } = fixture();
  const first = await repo.create({
    ...newDraft(account),
    bodyMarkdown: '香港',
    timelineAt: 1234,
    location: {
      latitude: 22.3,
      longitude: 114.2,
      accuracy: null,
      label: 'synthetic',
    },
  });
  const second = await repo.create({
    ...newDraft(account),
    bodyMarkdown: '図書館',
  });
  storage.setItem(`${draftPrefix(account)}index`, '{broken');
  expect(repo.list().drafts).toEqual(expect.arrayContaining([first, second]));
  expect(JSON.parse(storage.getItem(`${draftPrefix(account)}index`)!)).toEqual({
    schemaVersion: 1,
    ids: expect.arrayContaining([first.localDraftId, second.localDraftId]),
  });
  expect(foreign.list().drafts).toEqual([]);
  await expect(foreign.save(first)).rejects.toThrow(/account/);
});
it('preserves unknown/corrupt records and warns rather than silently resets them', () => {
  const { repo, storage } = fixture();
  const id = crypto.randomUUID();
  const key = `${draftPrefix(account)}record:${id}`;
  storage.setItem(key, '{"schemaVersion":99}');
  expect(repo.list().warnings.join()).toMatch(/unsupported/);
  expect(storage.getItem(key)).toBe('{"schemaVersion":99}');
});
it('checks revisions inside the shared lock so simultaneous saves cannot silently overwrite', async () => {
  const { repo, second } = fixture();
  const draft = await repo.create();
  const results = await Promise.allSettled([
    repo.save({ ...draft, bodyMarkdown: 'A' }),
    second.save({ ...draft, bodyMarkdown: 'B' }),
  ]);
  expect(results.map((result) => result.status)).toEqual([
    'fulfilled',
    'rejected',
  ]);
  expect(repo.read(draft.localDraftId)).toMatchObject({
    revision: 2,
    bodyMarkdown: 'A',
  });
});
it('commits bytes before references, reports quota failures and reconciles crash-created orphans', async () => {
  const { repo, storage, blobs } = fixture();
  const draft = await repo.create();
  const descriptor = item();
  blobs.fail = true;
  await expect(
    repo.add(draft, descriptor, new Blob(['abc'])),
  ).rejects.toThrow();
  expect(repo.read(draft.localDraftId)).toMatchObject({ attachments: [] });
  blobs.fail = false;
  storage.fail = true;
  await expect(repo.add(draft, descriptor, new Blob(['abc']))).rejects.toThrow(
    /not saved/,
  );
  expect(await blobs.list(account, draft.localDraftId)).toEqual([
    descriptor.id,
  ]);
  expect(repo.read(draft.localDraftId)).toMatchObject({ attachments: [] });
  storage.fail = false;
  expect(await repo.reconcile(draft.localDraftId)).toEqual({
    missing: [],
    warning: '',
  });
  expect(await blobs.list(account, draft.localDraftId)).toEqual([]);
});
it('reports missing/wrong-size blobs without deleting their descriptors or server references', async () => {
  const { repo, blobs } = fixture();
  let draft = await repo.create();
  const descriptor = item();
  draft = await repo.add(draft, descriptor, new Blob(['abc']));
  await blobs.put(
    account,
    draft.localDraftId,
    descriptor.id,
    new Blob(['wrong size']),
  );
  expect((await repo.reconcile(draft.localDraftId)).missing).toEqual([
    descriptor.id,
  ]);
  expect(repo.read(draft.localDraftId)).toMatchObject({
    attachments: [descriptor],
  });
  await blobs.remove(account, draft.localDraftId, descriptor.id);
  expect((await repo.reconcile(draft.localDraftId)).missing).toEqual([
    descriptor.id,
  ]);
});
it('discard removes only its blobs and retains a tombstone that prevents stale resurrection', async () => {
  const { repo, blobs } = fixture();
  const descriptor = item();
  const first = await repo.add(
    await repo.create(),
    descriptor,
    new Blob(['abc']),
  );
  const second = await repo.add(
    await repo.create(),
    descriptor,
    new Blob(['abc']),
  );
  expect(await repo.discard(first)).toBe('');
  await expect(repo.save(first)).rejects.toThrow(/discarded/);
  expect(repo.read(first.localDraftId)).toMatchObject({ deleted: true });
  expect(await blobs.list(account, first.localDraftId)).toEqual([]);
  expect(
    await (
      await blobs.get(account, second.localDraftId, descriptor.id)
    )?.text(),
  ).toBe('abc');
});
it('cleanup retries after discard-byte failure, while failed text discard changes nothing', async () => {
  const { repo, storage, blobs } = fixture();
  const descriptor = item();
  const draft = await repo.add(
    await repo.create(),
    descriptor,
    new Blob(['abc']),
  );
  storage.fail = true;
  await expect(repo.discard(draft)).rejects.toThrow();
  expect(repo.read(draft.localDraftId)).toMatchObject({ deleted: false });
  storage.fail = false;
  blobs.fail = true;
  expect(await repo.discard(draft)).toMatch(/could not be cleaned/);
  blobs.fail = false;
  await repo.cleanupOrphans();
  expect(await blobs.list(account, draft.localDraftId)).toEqual([]);
});
it('keeps a losing edit as a separate draft with identical bytes and preserves the winning edit', async () => {
  const { repo, blobs } = fixture();
  const descriptor = item();
  const draft = await repo.add(
    await repo.create(),
    descriptor,
    new Blob(['abc']),
  );
  await repo.save({ ...draft, bodyMarkdown: 'winner' });
  const copied = await repo.copy({ ...draft, bodyMarkdown: 'loser' });
  expect(copied.localDraftId).not.toBe(draft.localDraftId);
  expect(copied.bodyMarkdown).toBe('loser');
  expect(repo.read(draft.localDraftId)).toMatchObject({
    bodyMarkdown: 'winner',
  });
  expect(
    await (
      await blobs.get(account, copied.localDraftId, descriptor.id)
    )?.text(),
  ).toBe('abc');
});
it('recovery capability retains server identity and requires exact snapshot checks after restore', async () => {
  const { repo } = fixture();
  const base = {
    noteId: crypto.randomUUID(),
    revision: 7,
    snapshotDigest: 'a'.repeat(64),
  };
  const recovery = await repo.create({
    ...newDraft(account),
    kind: 'edit-server-draft',
    serverBase: base,
    bodyMarkdown: 'local edits',
    attachments: [{ ...item(), source: 'server' }],
  });
  expect(recoveryMatches(recovery, base)).toBe(true);
  expect(recoveryMatches(recovery, { ...base, revision: 8 })).toBe(false);
  expect(
    recoveryMatches(recovery, { ...base, snapshotDigest: 'b'.repeat(64) }),
  ).toBe(false);
  expect((await repo.reconcile(recovery.localDraftId)).missing).toEqual([]);
});
it('uses safe content excerpts and removes image spans only, preserving code and unrelated references', () => {
  const id = crypto.randomUUID();
  const image = `![猫](attachment:${id})`;
  const source = `${image}\n\n![second][ref]\n\n[ref]: attachment:${id}\n\n\`${image}\`\n\n![other](https://example.test/a)`;
  expect(removeImageReferences(source, id)).toBe(
    `\n\n\n\n[ref]: attachment:${id}\n\n\`${image}\`\n\n![other](https://example.test/a)`,
  );
  expect(excerpt({ ...newDraft(account), attachments: [item()] })).toBe(
    'File attachment',
  );
  expect(
    excerpt({
      ...newDraft(account),
      bodyMarkdown: '<script>safe text excerpt</script>',
    }),
  ).toContain('<script>');
});
it('sweeps crash-created orphan blobs but preserves foreign accounts and unsupported draft records', async () => {
  const { repo, storage, blobs } = fixture();
  const orphan = crypto.randomUUID();
  const unknown = crypto.randomUUID();
  const descriptor = item();
  await blobs.put(account, orphan, descriptor.id, new Blob(['abc']));
  await blobs.put(account, unknown, descriptor.id, new Blob(['abc']));
  await blobs.put(other, orphan, descriptor.id, new Blob(['abc']));
  storage.setItem(
    `${draftPrefix(account)}record:${unknown}`,
    '{"schemaVersion":99}',
  );
  expect((await repo.cleanupOrphans()).join()).toMatch(/unsupported/);
  expect(await blobs.list(account, orphan)).toEqual([]);
  expect(await blobs.list(account, unknown)).toEqual([descriptor.id]);
  expect(await blobs.list(other, orphan)).toEqual([descriptor.id]);
});
it('keeps losing text as a separate recoverable copy when a referenced file was evicted', async () => {
  const { repo, blobs } = fixture();
  const descriptor = item();
  const draft = await repo.add(
    await repo.create(),
    descriptor,
    new Blob(['abc']),
  );
  await blobs.remove(account, draft.localDraftId, descriptor.id);
  const copy = await repo.copy({
    ...draft,
    bodyMarkdown: 'Keep this losing text',
  });
  expect(copy.bodyMarkdown).toBe('Keep this losing text');
  expect(copy.attachments).toEqual([descriptor]);
  expect((await repo.reconcile(copy.localDraftId)).missing).toEqual([
    descriptor.id,
  ]);
});
it('freezes retry identity across tabs, copies pending IDs safely, and removes bytes only on confirmed completion', async () => {
  const { repo, blobs, second } = fixture();
  const descriptor = { ...item(), kind: 'image' as const };
  const blob = new Blob(['abc']);
  let draft = await repo.add(await repo.create(), descriptor, blob);
  draft = await repo.save({
    ...draft,
    bodyMarkdown: `![quiet](attachment:${descriptor.id})`,
  });
  const stale = draft;
  const command = commandForDraft(draft, crypto.randomUUID());
  draft = await repo.save({
    ...draft,
    postingAttempt: {
      command,
      manifest: {
        mutationId: command.mutationId,
        requestDigest: await commandDigest(command),
        items: [
          {
            id: descriptor.id,
            filename: descriptor.filename,
            incomingBytes: blob.size,
            incomingDigest: await sha256(blob),
          },
        ],
      },
      phase: 'frozen',
      batchId: null,
      readyIds: [],
      result: null,
    },
  });
  await expect(second.save(stale)).rejects.toThrow(/another tab/);
  await expect(
    repo.save({ ...draft, postingAttempt: undefined }),
  ).rejects.toThrow(/frozen/);
  await expect(repo.complete(draft)).rejects.toThrow(/confirmation/);
  const copy = await repo.copy(draft);
  expect(copy.postingAttempt).toBeUndefined();
  expect(copy.attachments[0].id).not.toBe(descriptor.id);
  expect(copy.bodyMarkdown).toContain(`attachment:${copy.attachments[0].id}`);
  expect(
    await (await blobs.get(
      account,
      copy.localDraftId,
      copy.attachments[0].id,
    ))!.text(),
  ).toBe('abc');
  draft = await repo.save({
    ...draft,
    postingAttempt: {
      ...draft.postingAttempt!,
      phase: 'confirmed',
      result: {
        noteId: crypto.randomUUID(),
        revision: 1,
        status: 'published',
        deleted: false,
      },
    },
  });
  expect(await repo.complete(draft)).toBe('');
  expect(repo.read(draft.localDraftId)?.deleted).toBe(true);
  expect(await blobs.list(account, draft.localDraftId)).toEqual([]);
  expect(await blobs.list(account, copy.localDraftId)).toHaveLength(1);
});
