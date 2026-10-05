import { createHash, randomUUID } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { expect, it, vi } from 'vitest';
import {
  withPersistence,
  seedAccount,
  seedNote,
  testDigest,
} from '../helpers/persistence.ts';
import { Persistence } from '../../src/lib/server/db/connection.ts';
import type { SessionIdentity } from '../../src/lib/server/auth/service.ts';
import { AttachmentService } from '../../src/lib/server/attachments/service.ts';
import { DiskBudget } from '../../src/lib/server/attachments/resources.ts';
import { runAttachmentCleanup } from '../../src/lib/server/attachments/cleanup.ts';
import { storageUsage } from '../../src/lib/server/settings/storage.ts';
import {
  readSettings,
  updateStorageLimits,
  updateCalendar,
  updateAppearance,
} from '../../src/lib/server/settings/repository.ts';
import {
  storageLimitsFrom,
  UNUSED_UPLOAD_QUIET_MS,
} from '../../src/lib/shared/storage.ts';
import {
  sessions,
  uploadBatches,
  attachments,
  noteAttachments,
  fileCleanupJobs,
} from '../../src/lib/server/db/schema.ts';
function owner(p: Persistence): SessionIdentity {
  const id = seedAccount(p),
    tokenHash = 'b'.repeat(64),
    expiresAt = Date.now() + 600_000;
  p.write((tx) =>
    tx
      .insert(sessions)
      .values({
        tokenHash,
        accountId: id,
        expiresAt,
        securityRevision: 1,
        createdAt: Date.now(),
      })
      .run(),
  );
  return {
    account: { id, mfaEnabled: false },
    sessionHash: tokenHash,
    securityRevision: 1,
    expiresAt,
  };
}
function service(p: Persistence) {
  return new AttachmentService(p, new DiskBudget(p.storage.root, 0));
}
async function upload(
  p: Persistence,
  s: AttachmentService,
  identity: SessionIdentity,
  bytes = Buffer.from('exact synthetic bytes'),
) {
  const manifest = {
    mutationId: randomUUID(),
    requestDigest: testDigest,
    items: [
      {
        id: randomUUID(),
        filename: '香港.dat',
        incomingBytes: bytes.length,
        incomingDigest: createHash('sha256').update(bytes).digest('hex'),
      },
    ],
  };
  const result = s.initialize(identity, manifest);
  if (result.state !== 'batch') throw new Error('Expected batch');
  await s.upload(
    identity,
    result.batch.id,
    manifest.items[0].id,
    new Request('http://localhost/upload', { method: 'PUT', body: bytes }),
  );
  return { batchId: result.batch.id, id: manifest.items[0].id, manifest };
}
function quiet(p: Persistence, id: string) {
  const activityAt = Date.now() - UNUSED_UPLOAD_QUIET_MS - 10_000;
  p.write((tx) =>
    tx
      .update(uploadBatches)
      .set({ activityAt })
      .where(eq(uploadBatches.id, id))
      .run(),
  );
  return { id, activityAt };
}
it('persists strict storage-only merges, preserves appearance/calendar/security, enforces native bytes/pixels/quality/dimensions', async () =>
  withPersistence(async (p) => {
    const identity = owner(p),
      s = service(p);
    updateAppearance(p, {
      theme: 'dark',
      density: 'compact',
      collapseLongNotes: false,
    });
    updateCalendar(p, identity, { timezone: 'Asia/Tokyo', weekStart: 0 });
    const limits = {
      ...storageLimitsFrom(readSettings(p)),
      displayMaxEdge: 16,
      thumbnailMaxEdge: 8,
      displayQuality: 51,
      thumbnailQuality: 42,
      fileMaxBytes: 1024,
    };
    expect(updateStorageLimits(p, identity, limits)).toEqual(limits);
    expect(readSettings(p)).toMatchObject({
      theme: 'dark',
      timezone: 'Asia/Tokyo',
      weekStart: 0,
      sessionLifetimeDays: 7,
    });
    expect(() =>
      updateStorageLimits(p, identity, { ...limits, dataDir: '../public' }),
    ).toThrow();
    const image = await sharp({
      create: { width: 80, height: 40, channels: 3, background: 'red' },
    })
      .png()
      .toBuffer();
    const uploaded = await upload(p, s, identity, image);
    const row = p.db
      .select()
      .from(attachments)
      .where(eq(attachments.id, uploaded.id))
      .get()!;
    expect([
      row.width,
      row.height,
      row.thumbnailWidth,
      row.thumbnailHeight,
    ]).toEqual([16, 8, 8, 4]);
    updateStorageLimits(p, identity, { ...limits, imageMaxPixels: 100 });
    await expect(upload(p, s, identity, image)).rejects.toThrow(/pixel|Image/i);
    await expect(upload(p, s, identity, Buffer.alloc(1025))).rejects.toThrow(
      /byte limit/i,
    );
    p.write((tx) => tx.delete(sessions).run());
    expect(() => updateStorageLimits(p, identity, limits)).toThrow(/Sign in/);
    expect(() =>
      updateAppearance(
        p,
        { theme: 'light', density: 'comfortable', collapseLongNotes: true },
        identity,
      ),
    ).toThrow(/Sign in/);
    expect(() => storageUsage(p, identity)).toThrow(/Sign in/);
  }));
it('reports shared files once, separates Trash/pending, measures private archives/staging/database without exposing paths', async () =>
  withPersistence(async (p, root) => {
    const identity = owner(p),
      s = service(p),
      live = seedNote(p),
      trash = seedNote(p, 'trash');
    const a = await upload(p, s, identity),
      b = await upload(p, s, identity),
      c = await upload(p, s, identity);
    p.write((tx) => {
      tx.insert(noteAttachments)
        .values([
          { noteId: live, attachmentId: a.id, ordinal: 0 },
          { noteId: trash, attachmentId: a.id, ordinal: 0 },
          { noteId: trash, attachmentId: b.id, ordinal: 1 },
        ])
        .run();
    });
    writeFileSync(join(root, 'backups', `${randomUUID()}.pnb`), '12345');
    const staging = p.storage.stagingDirectory('backups', randomUUID());
    writeFileSync(join(staging, 'synthetic.tmp'), '123');
    const usage = storageUsage(p, identity);
    expect(usage).toMatchObject({
      referencedBytes: 21,
      trashOnlyBytes: 21,
      unusedBytes: 21,
      backupBytes: 5,
      stagingBytes: 3,
      pendingBatchCount: 3,
    });
    expect(usage.pendingUploads.map((x) => x.id)).toEqual([c.batchId]);
    expect(usage.databaseBytes).toBeGreaterThan(0);
    expect(usage.freeDiskBytes).toBeLessThanOrEqual(usage.totalDiskBytes);
    expect(JSON.stringify(usage)).not.toContain(root);
  }));
it('requires confirmation and a quiet attempt, rechecks resumed activity/references, deletes ready bytes safely and permits exact retry', async () =>
  withPersistence(async (p) => {
    const identity = owner(p),
      s = service(p),
      a = await upload(p, s, identity);
    let selected = {
      id: a.batchId,
      activityAt:
        s.status(identity, a.batchId).status === 'pending'
          ? p.db
              .select()
              .from(uploadBatches)
              .where(eq(uploadBatches.id, a.batchId))
              .get()!.activityAt
          : 0,
    };
    await expect(
      s.cleanupUnused(identity, { confirmed: true, batches: [selected] }),
    ).rejects.toThrow(/active|recently/);
    selected = quiet(p, a.batchId);
    await expect(
      s.cleanupUnused(identity, { confirmed: false, batches: [selected] }),
    ).rejects.toThrow(/Confirm/);
    s.initialize(identity, a.manifest); // Another browser resumes while confirmation is open.
    await expect(
      s.cleanupUnused(identity, { confirmed: true, batches: [selected] }),
    ).rejects.toThrow(/active|recently/);
    selected = quiet(p, a.batchId);
    const note = seedNote(p, 'trash');
    p.write((tx) =>
      tx
        .insert(noteAttachments)
        .values({ noteId: note, attachmentId: a.id, ordinal: 0 })
        .run(),
    );
    await expect(
      s.cleanupUnused(identity, { confirmed: true, batches: [selected] }),
    ).rejects.toThrow(/referenced/);
    expect(existsSync(p.storage.attachmentPath(a.id, 'attachment.bin'))).toBe(
      true,
    );
    p.write((tx) =>
      tx.delete(noteAttachments).where(eq(noteAttachments.noteId, note)).run(),
    );
    expect(
      await s.cleanupUnused(identity, { confirmed: true, batches: [selected] }),
    ).toEqual({ remainingJobs: 0 });
    expect(existsSync(p.storage.attachmentPath(a.id, 'attachment.bin'))).toBe(
      false,
    );
    expect(
      p.db.select().from(attachments).where(eq(attachments.id, a.id)).get(),
    ).toBeUndefined();
    expect(
      await s.cleanupUnused(identity, { confirmed: true, batches: [selected] }),
    ).toEqual({ remainingJobs: 0 });
    expect(p.native.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(p.native.pragma('foreign_key_check')).toEqual([]);
  }));
it('rolls back an entire stale selection and cleanup-queue failures without abandoning other attempts', async () =>
  withPersistence(async (p) => {
    const identity = owner(p),
      s = service(p),
      a = await upload(p, s, identity),
      b = await upload(p, s, identity);
    const first = quiet(p, a.batchId),
      second = quiet(p, b.batchId);
    s.initialize(identity, b.manifest);
    await expect(
      s.cleanupUnused(identity, { confirmed: true, batches: [first, second] }),
    ).rejects.toThrow();
    expect(p.db.select().from(fileCleanupJobs).all()).toHaveLength(0);
    expect(s.status(identity, a.batchId).status).toBe('pending');
    p.native.exec(
      "CREATE TRIGGER synthetic_fail_cleanup BEFORE INSERT ON file_cleanup_jobs BEGIN SELECT RAISE(ABORT,'synthetic queue failure'); END",
    );
    await expect(
      s.cleanupUnused(identity, { confirmed: true, batches: [first] }),
    ).rejects.toThrow('synthetic');
    p.native.exec('DROP TRIGGER synthetic_fail_cleanup');
    expect(s.status(identity, a.batchId).status).toBe('pending');
    expect(existsSync(p.storage.attachmentPath(a.id, 'attachment.bin'))).toBe(
      true,
    );
  }));
it('refuses cleanup during an actively received old upload and protects activity even after failed transfer', async () =>
  withPersistence(async (p) => {
    const identity = owner(p),
      s = service(p),
      a = await upload(p, s, identity),
      selected = quiet(p, a.batchId);
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
      },
    });
    const transferring = s.upload(
      identity,
      a.batchId,
      a.id,
      new Request('http://localhost/upload', {
        method: 'PUT',
        body: stream,
        duplex: 'half',
      } as RequestInit),
    );
    const failed = expect(transferring).rejects.toThrow();
    await expect(
      s.cleanupUnused(identity, { confirmed: true, batches: [selected] }),
    ).rejects.toThrow(/active|recently/);
    controller.error(new Error('Synthetic connection loss'));
    await failed;
    expect(existsSync(p.storage.attachmentPath(a.id, 'attachment.bin'))).toBe(
      true,
    );
    expect(storageUsage(p, identity).pendingUploads[0].eligible).toBe(false);
  }));
it('durable queued deletion survives worker admission failure and real persistence restart', async () =>
  withPersistence(async (p) => {
    const identity = owner(p),
      s = service(p),
      a = await upload(p, s, identity),
      selected = quiet(p, a.batchId);
    const worker = vi
      .spyOn(p.coordinator, 'exclusive')
      .mockRejectedValueOnce(new Error('Synthetic worker admission failure'));
    await expect(
      s.cleanupUnused(identity, { confirmed: true, batches: [selected] }),
    ).rejects.toThrow('Synthetic');
    worker.mockRestore();
    expect(s.status(identity, a.batchId).status).toBe('abandoned');
    expect(p.db.select().from(fileCleanupJobs).all()).toHaveLength(1);
    expect(existsSync(p.storage.attachmentPath(a.id, 'attachment.bin'))).toBe(
      true,
    );
    await p.close();
    const reopened = new Persistence(p.storage);
    try {
      const restarted = service(reopened);
      expect(reopened.db.select().from(fileCleanupJobs).all()).toHaveLength(1);
      expect(
        await restarted.cleanupUnused(identity, {
          confirmed: true,
          retryQueued: true,
        }),
      ).toEqual({ remainingJobs: 0 });
      expect(
        existsSync(reopened.storage.attachmentPath(a.id, 'attachment.bin')),
      ).toBe(false);
      expect(reopened.db.select().from(fileCleanupJobs).all()).toHaveLength(0);
      await runAttachmentCleanup(reopened); // Startup repeat remains safe.
    } finally {
      await reopened.close();
    }
  }));
