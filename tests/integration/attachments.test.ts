import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  readdirSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import sharp from 'sharp';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  withPersistence,
  seedAccount,
  seedNote,
  testDigest,
} from '../helpers/persistence.ts';
import { AttachmentService } from '../../src/lib/server/attachments/service.ts';
import {
  DiskBudget,
  ImageQueue,
} from '../../src/lib/server/attachments/resources.ts';
import { processImage } from '../../src/lib/server/attachments/images.ts';
import { animatedPng } from '../helpers/images.ts';
import { receive } from '../../src/lib/server/attachments/files.ts';
import { runAttachmentCleanup } from '../../src/lib/server/attachments/cleanup.ts';
import { enqueueAttachmentCleanup } from '../../src/lib/server/maintenance/cleanup.ts';
import {
  sessions,
  attachments,
  noteAttachments,
  fileCleanupJobs,
  appSettings,
} from '../../src/lib/server/db/schema.ts';
import { insertReceipt } from '../../src/lib/server/db/receipts.ts';
import type { Persistence } from '../../src/lib/server/db/connection.ts';
import type { SessionIdentity } from '../../src/lib/server/auth/service.ts';
import { DEFAULT_SETTINGS } from '../../src/lib/shared/settings.ts';
import type {
  InitializeBatch,
  UploadBatchDto,
} from '../../src/lib/shared/attachments.ts';

function identity(p: Persistence): SessionIdentity {
  const id = seedAccount(p);
  const sessionHash = 'b'.repeat(64);
  const expiresAt = Date.now() + 60_000;
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
function manifest(
  buffers: Buffer[],
  names = buffers.map((_, i) => `file-${i}.dat`),
): InitializeBatch {
  return {
    mutationId: randomUUID(),
    requestDigest: testDigest,
    items: buffers.map((buffer, i) => ({
      id: randomUUID(),
      filename: names[i],
      incomingBytes: buffer.length,
      incomingDigest: createHash('sha256').update(buffer).digest('hex'),
    })),
  };
}
function batch(
  service: AttachmentService,
  owner: SessionIdentity,
  value: InitializeBatch,
): UploadBatchDto {
  const result = service.initialize(owner, value);
  if (result.state !== 'batch') throw new Error('Expected batch');
  return result.batch;
}
function request(buffer: Buffer, mime = 'application/octet-stream'): Request {
  return new Request('http://localhost/upload', {
    method: 'PUT',
    headers: { 'content-type': mime },
    body: new Uint8Array(buffer),
  });
}
const fixture = (width = 80, height = 40) =>
  sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 100, g: 150, b: 90, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer();
function setSettings(
  p: Persistence,
  values: Partial<typeof DEFAULT_SETTINGS>,
): void {
  p.write((tx) =>
    tx
      .update(appSettings)
      .set({ valueJson: JSON.stringify({ ...DEFAULT_SETTINGS, ...values }) })
      .run(),
  );
}

describe('product private attachments, actual SQLite/filesystem/Sharp', () => {
  it('resumes frozen manifests, validates item IDs and resolves existing receipts before upload', async () =>
    withPersistence((p) => {
      const owner = identity(p);
      const service = new AttachmentService(p);
      const value = manifest(
        [Buffer.from('original bytes')],
        ['../圖書館";.txt'],
      );
      const first = batch(service, owner, value);
      expect(batch(service, owner, value).id).toBe(first.id);
      expect(() =>
        batch(service, owner, { ...value, requestDigest: 'c'.repeat(64) }),
      ).toThrow(/different/);
      expect(() =>
        batch(service, owner, {
          ...value,
          items: [{ ...value.items[0], filename: 'changed' }],
        }),
      ).toThrow(/different/);
      expect(() =>
        batch(service, owner, { ...value, mutationId: randomUUID() }),
      ).toThrow(/different/);
      expect(() =>
        batch(service, owner, {
          ...value,
          mutationId: randomUUID(),
          items: [{ ...value.items[0], id: '../../secret' }],
        }),
      ).toThrow(/Invalid/);
      const confirmed = manifest([]);
      const result = {
        noteId: randomUUID(),
        status: 'published' as const,
        revision: 1,
        deleted: false,
      };
      p.write((tx) =>
        insertReceipt(
          tx,
          owner.account.id,
          confirmed.mutationId,
          confirmed.requestDigest,
          result,
        ),
      );
      expect(service.initialize(owner, confirmed)).toEqual({
        state: 'confirmed',
        result,
      });
      expect(() =>
        service.status(
          { ...owner, account: { ...owner.account, id: randomUUID() } },
          first.id,
        ),
      ).toThrow(/Sign in/);
    }));

  it('corrects orientation, strips GPS/EXIF, stores exact variants/checksums, and never retains image originals', async () =>
    withPersistence(async (p, root) => {
      const owner = identity(p);
      const service = new AttachmentService(p);
      const input = await sharp({
        create: { width: 80, height: 40, channels: 3, background: 'red' },
      })
        .withMetadata({ orientation: 6 })
        .withExifMerge({
          IFD0: { Artist: 'Synthetic fixture' },
          IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '1/1 2/1 3/1' },
        })
        .jpeg()
        .toBuffer();
      const value = manifest([input], ['actually-a-file.txt']);
      const first = batch(service, owner, value);
      const ready = await service.upload(
        owner,
        first.id,
        value.items[0].id,
        request(input),
      );
      expect(ready).toMatchObject({
        kind: 'image',
        readiness: 'ready',
        width: 40,
        height: 80,
        thumbnailWidth: 40,
        thumbnailHeight: 80,
      });
      const row = p.db
        .select()
        .from(attachments)
        .where(eq(attachments.id, ready.id))
        .get()!;
      for (const variant of ['display.webp', 'thumbnail.webp'] as const) {
        const path = p.storage.attachmentPath(ready.id, variant);
        const bytes = readFileSync(path);
        const metadata = await sharp(bytes).metadata();
        expect(metadata).toMatchObject({
          width: 40,
          height: 80,
          format: 'webp',
        });
        expect(metadata.exif).toBeUndefined();
        expect(metadata.icc).toBeUndefined();
        expect(metadata.xmp).toBeUndefined();
        expect(metadata.orientation).toBeUndefined();
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(
          variant === 'display.webp' ? row.displayDigest : row.thumbnailDigest,
        );
      }
      expect(row.fileBytes).toBeNull();
      expect(
        existsSync(p.storage.attachmentPath(ready.id, 'attachment.bin')),
      ).toBe(false);
      expect(readdirSync(join(root, 'staging', 'uploads'))).toEqual([]);
      expect(
        readdirSync(
          dirname(p.storage.attachmentPath(ready.id, 'display.webp')),
        ).sort(),
      ).toEqual(['display.webp', 'thumbnail.webp']);
      const download = await service.download(owner, ready.id, 'display', true);
      expect(download.headers.get('content-type')).toBe('image/webp');
      expect(download.headers.get('content-disposition')).toContain('.webp');
      await download.arrayBuffer();
      const before = readFileSync(
        p.storage.attachmentPath(ready.id, 'display.webp'),
      );
      expect(
        await service.upload(owner, first.id, ready.id, request(input)),
      ).toEqual(ready);
      expect(
        readFileSync(p.storage.attachmentPath(ready.id, 'display.webp')),
      ).toEqual(before);
      new AttachmentService(p);
      expect(service.status(owner, first.id).attachments[0].readiness).toBe(
        'ready',
      );
    }));

  it('keeps ordinary/HTML/SVG bytes unchanged, uses safe download headers and private ownership/variant checks', async () =>
    withPersistence(async (p) => {
      const owner = identity(p);
      const service = new AttachmentService(p);
      const inputs = [
        Buffer.from('<!doctype html><script>bad()</script>'),
        Buffer.from('<svg onload="bad()"></svg>'),
        Buffer.from('%PDF-synthetic\u0000'),
        Buffer.alloc(0),
      ];
      const value = manifest(inputs, [
        '../../香港";.html',
        'active.svg',
        'document.pdf',
        'empty.txt',
      ]);
      const b = batch(service, owner, value);
      for (const [i, input] of inputs.entries()) {
        const ready = await service.upload(
          owner,
          b.id,
          value.items[i].id,
          request(input),
        );
        expect(ready.kind).toBe('file');
        const response = await service.download(owner, ready.id, 'file');
        expect(Buffer.from(await response.arrayBuffer())).toEqual(input);
        expect(response.headers.get('content-type')).toBe(
          'application/octet-stream',
        );
        expect(response.headers.get('content-disposition')).toMatch(
          /^attachment; filename="[^"\r\n]*"; filename\*=UTF-8''/,
        );
        expect(response.headers.get('x-content-type-options')).toBe('nosniff');
        expect(response.headers.get('content-security-policy')).toContain(
          'sandbox',
        );
        expect(response.headers.get('cache-control')).toContain('no-store');
        await expect(
          service.download(owner, ready.id, 'display'),
        ).rejects.toThrow(/variant/);
        await expect(
          service.download(
            { ...owner, sessionHash: 'c'.repeat(64) },
            ready.id,
            'file',
          ),
        ).rejects.toThrow(/Sign in/);
      }
      expect(service.unusedReady(owner)).toHaveLength(4);
    }));

  it('bounds output without upscale and retains transparency/static GIF', async () =>
    withPersistence(async (p) => {
      const owner = identity(p);
      const service = new AttachmentService(p);
      setSettings(p, { displayMaxEdge: 128, thumbnailMaxEdge: 32 });
      const inputs = [
        await fixture(280, 140),
        await sharp(await fixture(4, 4))
          .gif()
          .toBuffer(),
      ];
      const value = manifest(inputs);
      const b = batch(service, owner, value);
      const results = await Promise.all(
        inputs.map((input, i) =>
          service.upload(owner, b.id, value.items[i].id, request(input)),
        ),
      );
      expect(results[0]).toMatchObject({
        width: 128,
        height: 64,
        thumbnailWidth: 32,
        thumbnailHeight: 16,
      });
      expect(results[1]).toMatchObject({ width: 4, height: 4 });
      expect(
        (
          await sharp(
            readFileSync(
              p.storage.attachmentPath(results[0].id, 'display.webp'),
            ),
          ).metadata()
        ).hasAlpha,
      ).toBe(true);
    }));

  it.each(['gif', 'webp', 'png'] as const)(
    'rejects animation in %s, including generic file uploads, and deletes originals',
    async (format) =>
      withPersistence(async (p, root) => {
        const owner = identity(p);
        const service = new AttachmentService(p);
        const pixels = Buffer.from([255, 0, 0, 255, 0, 0, 255, 255]);
        const input =
          format === 'png'
            ? await animatedPng()
            : await sharp(pixels, {
                raw: { width: 1, height: 2, channels: 4, pageHeight: 1 },
              })
                .toFormat(format, { loop: 0, delay: [100, 100] })
                .toBuffer();
        const value = manifest([input]);
        const b = batch(service, owner, value);
        await expect(
          service.upload(owner, b.id, value.items[0].id, request(input)),
        ).rejects.toThrow(/Animated/);
        expect(readdirSync(join(root, 'staging', 'uploads'))).toEqual([]);
        expect(
          existsSync(
            p.storage.attachmentPath(value.items[0].id, 'display.webp'),
          ),
        ).toBe(false);
        expect(service.status(owner, b.id).attachments[0].readiness).toBe(
          'failed',
        );
      }),
  );

  it('rejects spoofed image MIME, decoded overflow, mismatched bytes and streamed excess without trusting Content-Length', async () =>
    withPersistence(async (p, root) => {
      const owner = identity(p);
      const service = new AttachmentService(p);
      const image = await fixture(80, 40);
      const plain = Buffer.from('unchanged');
      const value = manifest([image, plain]);
      const b = batch(service, owner, value);
      setSettings(p, { imageMaxPixels: 100 });
      await expect(
        service.upload(owner, b.id, value.items[0].id, request(image)),
      ).rejects.toThrow(/pixel/);
      setSettings(p, { imageMaxPixels: 50_000_000 });
      await expect(
        service.upload(
          owner,
          b.id,
          value.items[1].id,
          request(plain, 'image/png'),
        ),
      ).rejects.toThrow(/not a supported/);
      await expect(
        service.upload(
          owner,
          b.id,
          value.items[1].id,
          request(Buffer.from('different')),
        ),
      ).rejects.toThrow(/limit|different/);
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(plain);
          controller.enqueue(Buffer.from('extra'));
          controller.close();
        },
      });
      const excess = new Request('http://localhost/upload', {
        method: 'PUT',
        body: stream,
        duplex: 'half',
      } as RequestInit);
      await expect(
        service.upload(owner, b.id, value.items[1].id, excess),
      ).rejects.toThrow(/limit/);
      await expect(
        service.upload(
          owner,
          b.id,
          value.items[1].id,
          request(plain.subarray(0, 3)),
        ),
      ).rejects.toThrow(/incomplete/);
      expect(readdirSync(join(root, 'staging', 'uploads'))).toEqual([]);
      expect(
        (await service.upload(owner, b.id, value.items[1].id, request(plain)))
          .readiness,
      ).toBe('ready');
      await expect(
        service.upload(
          owner,
          b.id,
          value.items[1].id,
          request(Buffer.from('mismatch!')),
        ),
      ).rejects.toThrow(/different/);
    }));

  it('honors disk reserve and active receive bound, rechecks revoked sessions and drains an active lease safely', async () =>
    withPersistence(async (p, root) => {
      const owner = identity(p);
      const disk = new DiskBudget(root, 500, () => ({
        available: 1000,
        total: 2000,
      }));
      const service = new AttachmentService(p, disk);
      const input = Buffer.from('file');
      const value = manifest([input]);
      const b = batch(service, owner, value);
      await expect(
        service.upload(owner, b.id, value.items[0].id, request(input)),
      ).rejects.toThrow(/disk space/);
      const normal = new AttachmentService(p);
      let finish!: () => void;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          finish = () => {
            controller.enqueue(input);
            controller.close();
          };
        },
      });
      const upload = normal.upload(
        owner,
        b.id,
        value.items[0].id,
        new Request('http://localhost/upload', {
          method: 'PUT',
          body: stream,
          duplex: 'half',
        } as RequestInit),
      );
      await expect(
        normal.upload(owner, b.id, value.items[0].id, request(input)),
      ).rejects.toThrow(/busy/);
      const maintenance = p.coordinator.exclusive(async () => 'drained');
      finish();
      expect((await upload).readiness).toBe('ready');
      expect(await maintenance).toBe('drained');
      p.write((tx) =>
        tx
          .update(sessions)
          .set({ revokedAt: Date.now() })
          .where(eq(sessions.tokenHash, owner.sessionHash))
          .run(),
      );
      await expect(
        normal.upload(owner, b.id, value.items[0].id, request(input)),
      ).rejects.toThrow(/Sign in/);
    }));

  it('startup removes temporary/crash-installed originals but preserves ready retries; cleanup protects cloned and Trash references', async () =>
    withPersistence(async (p) => {
      const owner = identity(p);
      const service = new AttachmentService(p);
      const input = Buffer.from('retained');
      const value = manifest([input]);
      const b = batch(service, owner, value);
      const ready = await service.upload(
        owner,
        b.id,
        value.items[0].id,
        request(input),
      );
      const staged = p.storage.stagingDirectory('uploads', randomUUID());
      writeFileSync(join(staged, 'original.tmp'), 'temporary-original');
      const unknown = randomUUID();
      const dir = dirname(p.storage.attachmentPath(unknown, 'attachment.bin'));
      mkdirSync(dir);
      writeFileSync(join(dir, 'attachment.bin'), 'crash-installed');
      new AttachmentService(p);
      expect(existsSync(staged)).toBe(false);
      expect(existsSync(dir)).toBe(false);
      expect(
        existsSync(p.storage.attachmentPath(ready.id, 'attachment.bin')),
      ).toBe(true);
      const first = seedNote(p);
      const second = seedNote(p, 'trash');
      p.write((tx) => {
        tx.insert(noteAttachments)
          .values([
            { noteId: first, attachmentId: ready.id, ordinal: 0 },
            { noteId: second, attachmentId: ready.id, ordinal: 0 },
          ])
          .run();
      });
      expect(() =>
        p.write((tx) => enqueueAttachmentCleanup(tx, ready.id)),
      ).toThrow(/referenced/);
      p.write((tx) =>
        tx
          .delete(noteAttachments)
          .where(
            and(
              eq(noteAttachments.noteId, first),
              eq(noteAttachments.attachmentId, ready.id),
            ),
          )
          .run(),
      );
      expect(() =>
        p.write((tx) => enqueueAttachmentCleanup(tx, ready.id)),
      ).toThrow(/referenced/);
      p.write((tx) => {
        tx.delete(noteAttachments)
          .where(eq(noteAttachments.noteId, second))
          .run();
        enqueueAttachmentCleanup(tx, ready.id);
      });
      // Simulate restart after a cleanup worker marked a job running.
      p.write((tx) =>
        tx.update(fileCleanupJobs).set({ state: 'running' }).run(),
      );
      await runAttachmentCleanup(p);
      expect(
        existsSync(p.storage.attachmentPath(ready.id, 'attachment.bin')),
      ).toBe(false);
      expect(
        p.db
          .select()
          .from(attachments)
          .where(eq(attachments.id, ready.id))
          .get(),
      ).toBeUndefined();
      expect(p.db.select().from(fileCleanupJobs).all()).toEqual([]);
      expect(p.native.pragma('foreign_key_check')).toEqual([]);
    }));

  it('stream caps/deadline, corrupt image and transactional commit failures retain a retryable identity without original bytes', async () =>
    withPersistence(async (p, root) => {
      const owner = identity(p);
      const service = new AttachmentService(p);
      const input = Buffer.alloc(2048, 1);
      const corrupt = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
      const value = manifest([input, corrupt]);
      const b = batch(service, owner, value);
      setSettings(p, { fileMaxBytes: 1024 });
      await expect(
        service.upload(owner, b.id, value.items[0].id, request(input)),
      ).rejects.toThrow(/byte limit/);
      await expect(
        service.upload(owner, b.id, value.items[1].id, request(corrupt)),
      ).rejects.toThrow(/corrupt/);
      setSettings(p, { fileMaxBytes: DEFAULT_SETTINGS.fileMaxBytes });
      p.native.exec(
        "CREATE TRIGGER test_attachment_failure BEFORE UPDATE OF readiness ON attachments WHEN NEW.readiness = 'ready' BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END",
      );
      await expect(
        service.upload(owner, b.id, value.items[0].id, request(input)),
      ).rejects.toThrow(/could not be stored/);
      expect(
        existsSync(
          p.storage.attachmentPath(value.items[0].id, 'attachment.bin'),
        ),
      ).toBe(false);
      expect(readdirSync(join(root, 'staging', 'uploads'))).toEqual([]);
      p.native.exec('DROP TRIGGER test_attachment_failure');
      expect(
        (await service.upload(owner, b.id, value.items[0].id, request(input)))
          .readiness,
      ).toBe('ready');
      const staging = p.storage.stagingDirectory('uploads', randomUUID());
      const slow = new ReadableStream<Uint8Array>({ start() {} });
      await expect(
        receive(slow, join(staging, 'original.tmp'), 1, 1024, 1024, false, 5),
      ).rejects.toThrow(/timed out/);
    }));

  it('bounds parallel receive work and rechecks session revocation during an upload', async () =>
    withPersistence(async (p, root) => {
      const owner = identity(p);
      const service = new AttachmentService(p);
      const input = Buffer.from('frozen file');
      const value = manifest([input, input, input, input]);
      const b = batch(service, owner, value);
      const finish: Array<() => void> = [];
      const work = value.items.slice(0, 3).map((item) => {
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            finish.push(() => {
              controller.enqueue(input);
              controller.close();
            });
          },
        });
        return service.upload(
          owner,
          b.id,
          item.id,
          new Request('http://localhost/upload', {
            method: 'PUT',
            body: stream,
            duplex: 'half',
          } as RequestInit),
        );
      });
      await expect(
        service.upload(owner, b.id, value.items[3].id, request(input)),
      ).rejects.toThrow(/busy/);
      p.write((tx) =>
        tx
          .update(sessions)
          .set({ revokedAt: Date.now() })
          .where(eq(sessions.tokenHash, owner.sessionHash))
          .run(),
      );
      const results = Promise.allSettled(work);
      finish.forEach((done) => done());
      expect(
        (await results).every(
          (result) =>
            result.status === 'rejected' &&
            /Sign in/.test(result.reason.message),
        ),
      ).toBe(true);
      expect(readdirSync(join(root, 'staging', 'uploads'))).toEqual([]);
      expect(readdirSync(join(root, 'files'))).toEqual([]);
    }));

  it('serializes actual native image subprocesses and kills an over-deadline worker without outputs', async () =>
    withPersistence(async (p) => {
      const staging = p.storage.stagingDirectory('uploads', randomUUID());
      const input = join(staging, 'original.tmp');
      writeFileSync(input, await fixture(1024, 1024));
      const queue = new ImageQueue();
      let active = 0;
      let peak = 0;
      const run = queue.run.bind(queue);
      queue.run = (operation) =>
        run(async () => {
          active++;
          peak = Math.max(peak, active);
          try {
            return await operation();
          } finally {
            active--;
          }
        });
      await Promise.all(
        [0, 1, 2].map((i) =>
          processImage(
            input,
            join(staging, `display-${i}.webp`),
            join(staging, `thumbnail-${i}.webp`),
            { ...DEFAULT_SETTINGS },
            queue,
          ),
        ),
      );
      expect(peak).toBe(1);
      await expect(
        processImage(
          input,
          join(staging, 'timeout.webp'),
          join(staging, 'timeout-thumb.webp'),
          { ...DEFAULT_SETTINGS },
          queue,
          1,
        ),
      ).rejects.toThrow(/timed out/);
      expect(existsSync(join(staging, 'timeout.webp'))).toBe(false);
    }));
});
