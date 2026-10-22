import { createHash, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { expect, it } from 'vitest';
import { withPersistence } from '../helpers/persistence.ts';
import { createFixtureAccount } from '../helpers/auth.ts';
import { AuthService } from '../../src/lib/server/auth/service.ts';
import { vaultState } from '../../src/lib/server/auth/vault.ts';
import {
  NoteService,
  noteMutationDigest,
} from '../../src/lib/server/notes/service.ts';
import {
  timelinePage,
  publishedTags,
} from '../../src/lib/server/notes/timeline.ts';
import { statusPage } from '../../src/lib/server/notes/status-list.ts';
import {
  monthActivity,
  yearActivity,
} from '../../src/lib/server/calendar/activity.ts';
import { TagService } from '../../src/lib/server/tags/service.ts';
import { AttachmentService } from '../../src/lib/server/attachments/service.ts';
import { DiskBudget } from '../../src/lib/server/attachments/resources.ts';
import { account, sessions } from '../../src/lib/server/db/schema.ts';
import type { NoteMutation } from '../../src/lib/shared/notes.ts';
import type { Persistence } from '../../src/lib/server/db/connection.ts';

const password = 'synthetic-vault-only password 香港';
const ip = '192.0.2.89';
async function fixture(p: Persistence) {
  const auth = new AuthService(p);
  const credential = await createFixtureAccount(auth, password, ip);
  const identity = auth.authenticate(credential.token)!;
  return {
    auth,
    identity,
    credential,
    notes: new NoteService(p),
    tags: new TagService(p),
  };
}
function create(
  bodyMarkdown: string,
  isPrivate = false,
  attachmentIds: string[] = [],
): Extract<NoteMutation, { action: 'create' }> {
  return {
    action: 'create',
    mutationId: randomUUID(),
    content: {
      bodyMarkdown,
      isPrivate,
      attachmentIds,
      timelineAt: Date.now() - 1000,
    },
  };
}

it('password-only unlock is session-wide, rate-limited, revoked on close and isolated from other sessions', async () => {
  await withPersistence(async (p) => {
    const f = await fixture(p);
    const other = await f.auth.login('fixture', password, ip);
    if ('mfaRequired' in other) throw new Error('Expected session');
    const otherIdentity = f.auth.authenticate(other.token)!;
    expect(vaultState(p.db, f.identity)).toEqual({ open: false, version: 0 });
    await expect(
      f.auth.unlockVault(f.identity, 'wrong-password', ip),
    ).rejects.toMatchObject({ code: 'unauthorized' });
    expect(vaultState(p.db, f.identity).open).toBe(false);
    p.write((tx) =>
      tx
        .update(account)
        .set({ totpEnabled: 1, totpSecretEncrypted: 'synthetic-test-only' })
        .run(),
    );
    await f.auth.unlockVault(f.identity, password, ip);
    const refreshedIdentity = f.auth.authenticate(f.credential.token)!;
    expect(vaultState(p.db, refreshedIdentity)).toEqual({
      open: true,
      version: 1,
    });
    expect(vaultState(p.db, otherIdentity).open).toBe(false);
    f.auth.closeVault(refreshedIdentity);
    expect(vaultState(p.db, f.identity)).toEqual({ open: false, version: 2 });
    for (let i = 0; i < 8; i++)
      await expect(
        f.auth.unlockVault(f.identity, 'wrong-password', ip),
      ).rejects.toMatchObject({ code: 'unauthorized' });
    await expect(
      f.auth.unlockVault(f.identity, password, ip),
    ).rejects.toMatchObject({ code: 'rate-limited' });
    p.write((tx) =>
      tx
        .update(sessions)
        .set({ revokedAt: Date.now() })
        .where(eq(sessions.tokenHash, f.identity.sessionHash))
        .run(),
    );
    expect(() => f.auth.closeVault(f.identity)).toThrow();
    expect(() => vaultState(p.db, f.identity)).toThrow();
  });
});

it('closed Vault hides body, conflicts, pins, search, private-only tags, activity and Trash while preserving receipts', async () => {
  await withPersistence(async (p) => {
    const f = await fixture(p);
    const publicNote = f.notes.mutate(
      f.identity,
      create('public word #shared'),
    );
    const command = create('hiddenneedle #secret #shared', true);
    const privateNote = f.notes.mutate(f.identity, command);
    expect(f.notes.get(f.identity, publicNote.noteId).isPrivate).toBe(false);
    expect(() => f.notes.get(f.identity, privateNote.noteId)).toThrow();
    expect(() =>
      f.notes.mutate(f.identity, {
        action: 'trash',
        mutationId: randomUUID(),
        noteId: privateNote.noteId,
        expectedRevision: 999,
      }),
    ).toThrowError(expect.objectContaining({ code: 'not-found' }));
    expect(f.notes.mutate(f.identity, command)).toEqual(privateNote);
    expect(
      (await timelinePage(p, f.identity, new URLSearchParams('q=hiddenneedle')))
        .items,
    ).toEqual([]);
    expect(
      (await timelinePage(p, f.identity, new URLSearchParams())).items.map(
        (n) => n.id,
      ),
    ).toEqual([publicNote.noteId]);
    expect(publishedTags(p, f.identity).map((t) => t.key)).toEqual(['shared']);
    expect(f.tags.list(f.identity)).toEqual([
      { key: 'shared', display: 'shared', published: 1, trash: 0 },
    ]);
    expect(f.tags.summary(f.identity, 'secret')).toBeNull();
    expect(() =>
      f.tags.preview(f.identity, {
        action: 'remove',
        source: 'shared',
        target: null,
      }),
    ).toThrowError(expect.objectContaining({ messageKey: 'vault.required' }));
    expect(() =>
      f.tags.preview(f.identity, {
        action: 'remove',
        source: 'secret',
        target: null,
      }),
    ).toThrowError(expect.objectContaining({ code: 'not-found' }));
    const date = new Date().toISOString();
    const total = () =>
      monthActivity(p, f.identity, date.slice(0, 7)).counts.reduce(
        (a, b) => a + b,
        0,
      );
    expect(total()).toBe(1);
    expect(
      yearActivity(p, f.identity, Number(date.slice(0, 4)))
        .months.flatMap((m) => m.counts)
        .reduce((a, b) => a + b, 0),
    ).toBe(1);
    await expect(
      timelinePage(p, f.identity, new URLSearchParams('vault=1')),
    ).rejects.toMatchObject({ code: 'unauthorized' });
    await f.auth.unlockVault(f.identity, password, ip);
    expect(total()).toBe(2);
    expect(
      (
        await timelinePage(p, f.identity, new URLSearchParams('vault=1'))
      ).items.map((n) => n.id),
    ).toEqual([privateNote.noteId]);
    expect(
      (await timelinePage(p, f.identity, new URLSearchParams('q=hiddenneedle')))
        .items,
    ).toHaveLength(1);
    f.notes.mutate(f.identity, {
      action: 'pin',
      mutationId: randomUUID(),
      noteId: privateNote.noteId,
      expectedRevision: 1,
    });
    expect(
      (await timelinePage(p, f.identity, new URLSearchParams())).pinned?.map(
        (n) => n.id,
      ),
    ).toEqual([privateNote.noteId]);
    f.auth.closeVault(f.identity);
    expect(
      (await timelinePage(p, f.identity, new URLSearchParams())).pinned,
    ).toEqual([]);
    await f.auth.unlockVault(f.identity, password, ip);
    f.notes.mutate(f.identity, {
      action: 'trash',
      mutationId: randomUUID(),
      noteId: privateNote.noteId,
      expectedRevision: 2,
    });
    expect(
      statusPage(p, f.identity, new URLSearchParams('status=trash')).items,
    ).toHaveLength(1);
    f.auth.closeVault(f.identity);
    expect(
      statusPage(p, f.identity, new URLSearchParams('status=trash')).items,
    ).toEqual([]);
    await f.auth.unlockVault(f.identity, password, ip);
    f.notes.mutate(f.identity, {
      action: 'restore',
      mutationId: randomUUID(),
      noteId: privateNote.noteId,
      expectedRevision: 3,
    });
    expect(f.notes.get(f.identity, privateNote.noteId).isPrivate).toBe(true);
    const operation = {
      action: 'rename',
      source: 'secret',
      target: 'hiddenrenamed',
    };
    const preview = f.tags.preview(f.identity, operation);
    f.tags.execute(f.identity, {
      operation,
      previewToken: preview.previewToken,
      confirmed: true,
      mutationId: randomUUID(),
    });
    f.auth.closeVault(f.identity);
    expect(f.tags.check(f.identity, ['secret'])[0].target).toBeNull();
    expect(f.tags.summary(f.identity, 'hiddenrenamed')).toBeNull();
    await f.auth.unlockVault(f.identity, password, ip);
    const privateBase = f.notes.get(f.identity, privateNote.noteId);
    f.notes.mutate(f.identity, {
      action: 'update',
      mutationId: randomUUID(),
      noteId: privateBase.id,
      expectedRevision: privateBase.revision,
      content: {
        bodyMarkdown: 'private with tags removed',
        timelineAt: privateBase.timelineAt,
        attachmentIds: [],
        isPrivate: true,
      },
    });
    f.auth.closeVault(f.identity);
    expect(
      f.tags.list(f.identity).some((tag) => tag.key === 'hiddenrenamed'),
    ).toBe(false);
  });
});

it('privacy is revision/digest bound; both timeline and Trash cursors expire on a Vault transition', async () => {
  await withPersistence(async (p) => {
    const f = await fixture(p);
    const one = f.notes.mutate(f.identity, create('one #both'));
    const two = f.notes.mutate(f.identity, create('two #both', true));
    await f.auth.unlockVault(f.identity, password, ip);
    const page = await timelinePage(
      p,
      f.identity,
      new URLSearchParams('limit=1&tag=both'),
    );
    expect(page.nextCursor).not.toBeNull();
    for (const id of [one.noteId, two.noteId])
      f.notes.mutate(f.identity, {
        action: 'trash',
        mutationId: randomUUID(),
        noteId: id,
        expectedRevision: 1,
      });
    const trash = statusPage(
      p,
      f.identity,
      new URLSearchParams('status=trash&limit=1'),
    );
    f.auth.closeVault(f.identity);
    await expect(
      timelinePage(
        p,
        f.identity,
        new URLSearchParams({
          limit: '1',
          tag: 'both',
          cursor: page.nextCursor!,
        }),
      ),
    ).rejects.toMatchObject({ code: 'validation' });
    expect(() =>
      statusPage(
        p,
        f.identity,
        new URLSearchParams({
          status: 'trash',
          limit: '1',
          cursor: trash.nextCursor!,
        }),
      ),
    ).toThrow();
    const command = create('receipt identity');
    f.notes.mutate(f.identity, command);
    expect(() =>
      f.notes.mutate(f.identity, {
        ...command,
        content: { ...command.content, isPrivate: true },
      }),
    ).toThrowError(expect.objectContaining({ code: 'mutation-mismatch' }));
    const saved = f.notes.mutate(f.identity, create('convert'));
    f.notes.mutate(f.identity, {
      action: 'update',
      mutationId: randomUUID(),
      noteId: saved.noteId,
      expectedRevision: 1,
      content: create('convert', true).content,
    });
    expect(() => f.notes.get(f.identity, saved.noteId)).toThrow();
    await f.auth.unlockVault(f.identity, password, ip);
    const base = f.notes.get(f.identity, saved.noteId);
    f.notes.mutate(f.identity, {
      action: 'update',
      mutationId: randomUUID(),
      noteId: base.id,
      expectedRevision: base.revision,
      content: {
        bodyMarkdown: base.bodyMarkdown,
        attachmentIds: [],
        timelineAt: base.timelineAt,
      },
    });
    expect(f.notes.get(f.identity, base.id).isPrivate).toBe(true);
    f.notes.mutate(f.identity, {
      action: 'update',
      mutationId: randomUUID(),
      noteId: base.id,
      expectedRevision: base.revision + 1,
      content: {
        bodyMarkdown: base.bodyMarkdown,
        attachmentIds: [],
        timelineAt: base.timelineAt,
        isPrivate: false,
      },
    });
    f.auth.closeVault(f.identity);
    expect(f.notes.get(f.identity, base.id)).toMatchObject({
      isPrivate: false,
      revision: 4,
    });
  });
});

it('private-only files cannot be downloaded, renamed or reused while closed; explicit public references remain readable', async () => {
  await withPersistence(async (p, root) => {
    const f = await fixture(p);
    const files = new AttachmentService(p, new DiskBudget(root, 0));
    const id = randomUUID();
    const command = create('secret attachment', true, [id]);
    const bytes = Buffer.from('synthetic private-only file');
    const batch = files.initialize(f.identity, {
      mutationId: command.mutationId,
      requestDigest: noteMutationDigest(command),
      items: [
        {
          id,
          filename: 'vault-only.txt',
          incomingBytes: bytes.length,
          incomingDigest: createHash('sha256').update(bytes).digest('hex'),
        },
      ],
    });
    if (batch.state !== 'batch') throw new Error('Expected upload batch');
    await files.upload(
      f.identity,
      batch.batch.id,
      id,
      new Request('http://localhost/upload', {
        method: 'PUT',
        body: new Uint8Array(bytes),
      }),
    );
    f.notes.mutate(f.identity, command);
    await expect(files.download(f.identity, id, 'file')).rejects.toMatchObject({
      code: 'not-found',
    });
    await expect(
      files.download(f.identity, id, 'file', false, true, {
        range: 'bytes=0-2',
      }),
    ).rejects.toMatchObject({ code: 'not-found' });
    expect(() =>
      files.rename(f.identity, id, { filename: 'renamed.txt' }),
    ).toThrowError(expect.objectContaining({ code: 'not-found' }));
    expect(() =>
      f.notes.mutate(f.identity, create('stolen file', false, [id])),
    ).toThrow();
    await f.auth.unlockVault(f.identity, password, ip);
    expect(
      Buffer.from(
        await (await files.download(f.identity, id, 'file')).arrayBuffer(),
      ),
    ).toEqual(bytes);
    f.notes.mutate(
      f.identity,
      create('intentionally shared file', false, [id]),
    );
    f.auth.closeVault(f.identity);
    expect(
      Buffer.from(
        await (await files.download(f.identity, id, 'file')).arrayBuffer(),
      ),
    ).toEqual(bytes);
  });
});
