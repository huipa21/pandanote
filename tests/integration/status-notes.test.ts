import { randomUUID, createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { withPersistence, seedAccount } from '../helpers/persistence.ts';
import type { Persistence } from '../../src/lib/server/db/connection.ts';
import type { SessionIdentity } from '../../src/lib/server/auth/service.ts';
import { sessions } from '../../src/lib/server/db/schema.ts';
import { statusPage } from '../../src/lib/server/notes/status-list.ts';
import {
  NoteService,
  noteMutationDigest,
} from '../../src/lib/server/notes/service.ts';
import { AttachmentService } from '../../src/lib/server/attachments/service.ts';
import { DiskBudget } from '../../src/lib/server/attachments/resources.ts';
import {
  timelinePage,
  publishedTags,
} from '../../src/lib/server/notes/timeline.ts';
import { monthActivity } from '../../src/lib/server/calendar/activity.ts';
import type { NoteMutation } from '../../src/lib/shared/notes.ts';
function owner(p: Persistence): SessionIdentity {
  const id = seedAccount(p),
    expiresAt = Date.now() + 3600000,
    sessionHash = 'b'.repeat(64);
  p.write((tx) =>
    tx
      .insert(sessions)
      .values({
        tokenHash: sessionHash,
        accountId: id,
        securityRevision: 1,
        createdAt: Date.now(),
        expiresAt,
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
const query = (status: string, extra = {}) =>
  new URLSearchParams({ status, ...extra });
const create = (
  bodyMarkdown: string,
  attachmentIds: string[] = [],
): NoteMutation => ({
  action: 'create',
  mutationId: randomUUID(),
  content: {
    bodyMarkdown,
    attachmentIds,
    timelineAt: Date.UTC(2020, 0, 3),
    location: null,
  },
});
describe('S13 bounded private status lists with real SQLite/files', () => {
  it('paginates ties without gaps, binds status, excludes published and bounds labels/payloads', async () =>
    withPersistence((p) => {
      const identity = owner(p),
        service = new NoteService(p),
        ids: string[] = [];
      service.mutate(identity, create('published exclusion'));
      for (let n = 0; n < 75; n++) {
        const note = service.mutate(
          identity,
          create('香港\0 <script> #Work ' + '漢'.repeat(10000)),
        );
        service.mutate(identity, {
          action: 'move-to-draft',
          mutationId: randomUUID(),
          noteId: note.noteId,
          expectedRevision: 1,
        });
        ids.push(note.noteId);
      }
      const first = statusPage(p, identity, query('draft'));
      const second = statusPage(
        p,
        identity,
        query('draft', { cursor: first.nextCursor! }),
      );
      const third = statusPage(
        p,
        identity,
        query('draft', { cursor: second.nextCursor! }),
      );
      expect(
        [...first.items, ...second.items, ...third.items].map((n) => n.id),
      ).toEqual(ids.sort().reverse());
      expect(third.nextCursor).toBeNull();
      expect(
        first.items.every(
          (n) => [...n.excerpt].length <= 241 && n.excerpt.includes('␀'),
        ),
      ).toBe(true);
      expect(JSON.stringify(first).length).toBeLessThan(30000);
      expect(first.items[0]).not.toHaveProperty('bodyMarkdown');
      expect(first.items[0]).not.toHaveProperty('location');
      expect(() =>
        statusPage(p, identity, query('trash', { cursor: first.nextCursor! })),
      ).toThrow('different status');
      for (const params of [
        query('published'),
        query('draft', { cursor: 'bad' }),
        query('draft', { limit: '101' }),
        new URLSearchParams('status=draft&status=trash'),
        query('draft', { q: 'private' }),
      ])
        expect(() => statusPage(p, identity, params)).toThrow();
      p.write((tx) =>
        tx
          .delete(sessions)
          .where(eq(sessions.tokenHash, identity.sessionHash))
          .run(),
      );
      expect(() => statusPage(p, identity, query('draft'))).toThrow('Sign in');
    }));
  it('lists image/file-only labels, preserves prior status/date/native files through restore, and excludes both statuses from normal queries', async () =>
    withPersistence(async (p) => {
      const identity = owner(p),
        service = new NoteService(p),
        upload = new AttachmentService(p, new DiskBudget(p.storage.root, 0));
      const input = await sharp({
        create: { width: 8, height: 8, channels: 3, background: 'green' },
      })
        .png()
        .toBuffer();
      const bases = [];
      for (const [index, bytes] of [
        input,
        Buffer.from('exact file bytes'),
      ].entries()) {
        const fileId = randomUUID(),
          command = create('', [fileId]);
        const init = upload.initialize(identity, {
          mutationId: command.mutationId,
          requestDigest: noteMutationDigest(command),
          items: [
            {
              id: fileId,
              filename: index ? '香港.txt' : 'image.png',
              incomingBytes: bytes.length,
              incomingDigest: createHash('sha256').update(bytes).digest('hex'),
            },
          ],
        });
        if (init.state !== 'batch') throw new Error('Expected batch');
        await upload.upload(
          identity,
          init.batch.id,
          fileId,
          new Request('http://localhost/upload', {
            method: 'PUT',
            body: new Uint8Array(bytes),
          }),
        );
        const result = service.mutate(identity, command);
        bases.push(service.get(identity, result.noteId));
        service.mutate(identity, {
          action: 'move-to-draft',
          mutationId: randomUUID(),
          noteId: result.noteId,
          expectedRevision: 1,
        });
      }
      const drafts = statusPage(p, identity, query('draft'));
      expect(drafts.items.map((n) => n.excerpt).sort()).toEqual([
        'File attachment',
        'Image note',
      ]);
      for (const note of drafts.items)
        service.mutate(identity, {
          action: 'trash',
          mutationId: randomUUID(),
          noteId: note.id,
          expectedRevision: note.revision,
        });
      const published = service.mutate(
        identity,
        create('#Work published to trash'),
      );
      service.mutate(identity, {
        action: 'trash',
        mutationId: randomUUID(),
        noteId: published.noteId,
        expectedRevision: 1,
      });
      const trash = statusPage(p, identity, query('trash'));
      expect(trash.items.filter((n) => n.priorStatus === 'draft')).toHaveLength(
        2,
      );
      expect(
        trash.items.filter((n) => n.priorStatus === 'published'),
      ).toHaveLength(1);
      expect(
        (await timelinePage(p, identity, new URLSearchParams('q=Work'))).items,
      ).toHaveLength(0);
      expect(publishedTags(p, identity)).toHaveLength(0);
      expect(
        monthActivity(p, identity, '2020-01').counts.every(
          (count) => count === 0,
        ),
      ).toBe(true);
      for (const note of trash.items)
        service.mutate(identity, {
          action: 'restore',
          mutationId: randomUUID(),
          noteId: note.id,
          expectedRevision: note.revision,
        });
      for (const base of bases)
        expect(service.get(identity, base.id)).toMatchObject({
          status: 'draft',
          timelineAt: base.timelineAt,
          attachmentIds: base.attachmentIds,
          attachments: base.attachments,
          createdAt: base.createdAt,
        });
      expect(statusPage(p, identity, query('trash')).items).toHaveLength(0);
      expect(statusPage(p, identity, query('draft')).items).toHaveLength(2);
      expect(
        (await timelinePage(p, identity, new URLSearchParams('q=Work'))).items,
      ).toHaveLength(1);
      expect(p.native.pragma('integrity_check', { simple: true })).toBe('ok');
      expect(p.native.pragma('foreign_key_check')).toEqual([]);
    }));
});
