import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  withPersistence,
  seedAccount,
  testDigest,
} from '../helpers/persistence.ts';
import { AttachmentService } from '../../src/lib/server/attachments/service.ts';
import {
  fileMime,
  voiceMime,
} from '../../src/lib/server/attachments/images.ts';
import { parseRange } from '../../src/lib/server/attachments/files.ts';
import { eq, sql } from 'drizzle-orm';
import { seedNote, seedAttachment } from '../helpers/persistence.ts';
import {
  attachments,
  noteAttachments,
  sessions,
} from '../../src/lib/server/db/schema.ts';
import type { Persistence } from '../../src/lib/server/db/connection.ts';
import type { SessionIdentity } from '../../src/lib/server/auth/service.ts';
import type { InitializeBatch } from '../../src/lib/shared/attachments.ts';

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
const webm = (size = 600) =>
  Buffer.concat([
    Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84]),
    Buffer.from('webm'),
    Buffer.alloc(size - 12, 7),
  ]);
const mp4 = (brand = 'M4A ', size = 600) =>
  Buffer.concat([
    Buffer.from([0, 0, 0, 0x18]),
    Buffer.from('ftyp' + brand),
    Buffer.alloc(size - 12, 9),
  ]);
const ogg = (size = 600) =>
  Buffer.concat([Buffer.from('OggS\0\x02'), Buffer.alloc(size - 6, 3)]);
const matroska = () =>
  Buffer.concat([
    Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x88]),
    Buffer.from('matroska'),
    Buffer.alloc(200),
  ]);

function manifest(buffers: Buffer[], voice: boolean[]): InitializeBatch {
  return {
    mutationId: randomUUID(),
    requestDigest: testDigest,
    items: buffers.map((buffer, i) => ({
      id: randomUUID(),
      filename: `voice-${i}.bin`,
      incomingBytes: buffer.length,
      incomingDigest: createHash('sha256').update(buffer).digest('hex'),
      ...(voice[i] ? { voice: true } : {}),
    })),
  };
}
function put(buffer: Buffer, mime = 'audio/webm'): Request {
  return new Request('http://localhost/upload', {
    method: 'PUT',
    headers: { 'content-type': mime },
    body: new Uint8Array(buffer),
  });
}
async function setup(
  p: Persistence,
  buffers: Buffer[],
  voice: boolean[],
  mime = 'audio/webm',
) {
  const owner = identity(p);
  const service = new AttachmentService(p);
  const value = manifest(buffers, voice);
  const result = service.initialize(owner, value);
  if (result.state !== 'batch') throw new Error('Expected batch');
  const ids: string[] = [];
  for (const [i, buffer] of buffers.entries()) {
    const ready = await service.upload(
      owner,
      result.batch.id,
      value.items[i].id,
      put(buffer, mime),
    );
    ids.push(ready.id);
  }
  return { owner, service, value, batchId: result.batch.id, ids };
}
const bytes = async (r: Response) => Buffer.from(await r.arrayBuffer());

describe('voice clip classification (magic bytes)', () => {
  it('detects each container and never classifies without the flag', () => {
    expect(voiceMime(webm())).toBe('audio/webm');
    for (const brand of ['M4A ', 'isom', 'mp42', 'iso2'])
      expect(voiceMime(mp4(brand))).toBe('audio/mp4');
    expect(voiceMime(ogg())).toBe('audio/ogg');
    expect(voiceMime(matroska())).toBeNull();
    expect(voiceMime(mp4('heic'))).toBeNull();
    expect(voiceMime(mp4('avif'))).toBeNull();
    expect(voiceMime(Buffer.from('plain text'))).toBeNull();
    expect(voiceMime(Buffer.alloc(0))).toBeNull();
    for (const buffer of [webm(), mp4(), ogg()])
      expect(fileMime(buffer)).toBe('application/octet-stream');
  });
  it('parses byte ranges per RFC 9110', () => {
    expect(parseRange(null, 100)).toBe('ignore');
    expect(parseRange('bytes=0-9', 100)).toEqual({ start: 0, end: 9 });
    expect(parseRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange('bytes=90-500', 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange('bytes=-500', 100)).toEqual({ start: 0, end: 99 });
    expect(parseRange('bytes=100-', 100)).toBe('unsatisfiable');
    expect(parseRange('bytes=-0', 100)).toBe('unsatisfiable');
    expect(parseRange('bytes=0-0', 0)).toBe('unsatisfiable');
    for (const ignored of [
      'bytes=0-1,5-6',
      'bytes=5-2',
      'bytes=-',
      'items=0-1',
      'bytes=a-b',
      'garbage',
      'bytes=0-1e3',
      `bytes=${'9'.repeat(30)}-`,
    ])
      expect(parseRange(ignored, 100), ignored).toBe('ignore');
  });
});

describe('voice clip upload and inline serving, actual SQLite/filesystem', () => {
  it('stores flagged webm/mp4/ogg as audio and ignores the client MIME', () =>
    withPersistence(async (p) => {
      const inputs = [webm(), mp4(), ogg(), mp4('isom')];
      const { owner, service, ids } = await setup(
        p,
        inputs,
        inputs.map(() => true),
        'application/octet-stream',
      );
      const expected = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mp4'];
      for (const [i, id] of ids.entries()) {
        const response = await service.download(owner, id, 'file');
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe(expected[i]);
        expect(response.headers.get('accept-ranges')).toBe('bytes');
        expect(response.headers.get('content-disposition')).toMatch(
          /^inline; filename="voice-\d\.bin"/,
        );
        expect(response.headers.get('x-content-type-options')).toBe('nosniff');
        expect(response.headers.get('content-security-policy')).toContain(
          'sandbox',
        );
        expect(await bytes(response)).toEqual(inputs[i]);
      }
    }));

  it('keeps non-voice webm opaque and a spoofed audio client MIME unclassified', () =>
    withPersistence(async (p) => {
      const { owner, service, ids } = await setup(
        p,
        [webm(), webm()],
        [false, false],
        'audio/webm',
      );
      for (const id of ids) {
        const response = await service.download(owner, id, 'file');
        expect(response.headers.get('content-type')).toBe(
          'application/octet-stream',
        );
        expect(response.headers.get('content-disposition')).toMatch(
          /^attachment;/,
        );
        expect(response.headers.has('accept-ranges')).toBe(false);
        await response.arrayBuffer();
        // Range is ignored for ordinary files.
        const ranged = await service.download(owner, id, 'file', false, false, {
          range: 'bytes=0-9',
        });
        expect(ranged.status).toBe(200);
        await ranged.arrayBuffer();
      }
    }));

  it('rejects flagged bytes that are not a supported container', () =>
    withPersistence(async (p) => {
      const owner = identity(p);
      const service = new AttachmentService(p);
      for (const bad of [
        Buffer.from('not audio at all'),
        matroska(),
        mp4('heic'),
        Buffer.alloc(0),
      ]) {
        const value = manifest([bad], [true]);
        const result = service.initialize(owner, value);
        if (result.state !== 'batch') throw new Error('Expected batch');
        await expect(
          service.upload(
            owner,
            result.batch.id,
            value.items[0].id,
            put(bad, 'audio/webm'),
          ),
        ).rejects.toThrow(/not a supported audio/);
        expect(
          service.status(owner, result.batch.id).attachments[0],
        ).toMatchObject({ readiness: 'failed', kind: 'file' });
      }
    }));

  it('serves full, partial, suffix, open-ended and invalid ranges consistently, including HEAD', () =>
    withPersistence(async (p) => {
      const input = webm(1000);
      const { owner, service, ids } = await setup(p, [input], [true]);
      const id = ids[0];
      const get = (range: string | null, head = false, ifRange?: string) =>
        service.download(owner, id, 'file', false, head, { range, ifRange });
      const full = await get(null);
      expect(full.status).toBe(200);
      expect(full.headers.get('content-length')).toBe('1000');
      expect(full.headers.has('content-range')).toBe(false);
      await full.arrayBuffer();

      const part = await get('bytes=10-19');
      expect(part.status).toBe(206);
      expect(part.headers.get('content-range')).toBe('bytes 10-19/1000');
      expect(part.headers.get('content-length')).toBe('10');
      expect(part.headers.get('content-type')).toBe('audio/webm');
      expect(await bytes(part)).toEqual(input.subarray(10, 20));

      const tail = await get('bytes=990-');
      expect(tail.status).toBe(206);
      expect(tail.headers.get('content-range')).toBe('bytes 990-999/1000');
      expect(await bytes(tail)).toEqual(input.subarray(990));

      const suffix = await get('bytes=-5');
      expect(suffix.headers.get('content-range')).toBe('bytes 995-999/1000');
      expect(await bytes(suffix)).toEqual(input.subarray(995));

      const clamped = await get('bytes=0-99999');
      expect(clamped.status).toBe(206);
      expect(clamped.headers.get('content-range')).toBe('bytes 0-999/1000');
      expect(await bytes(clamped)).toEqual(input);

      const unsatisfiable = await get('bytes=1000-');
      expect(unsatisfiable.status).toBe(416);
      expect(unsatisfiable.headers.get('content-range')).toBe('bytes */1000');
      expect(await bytes(unsatisfiable)).toHaveLength(0);

      for (const ignored of ['bytes=0-1,5-6', 'bytes=9-2', 'junk']) {
        const response = await get(ignored);
        expect(response.status).toBe(200);
        expect(await bytes(response)).toEqual(input);
      }

      const head = await get('bytes=10-19', true);
      expect(head.status).toBe(206);
      expect(head.headers.get('content-range')).toBe('bytes 10-19/1000');
      expect(head.headers.get('content-length')).toBe('10');
      const headFull = await get(null, true);
      expect(headFull.status).toBe(200);
      expect(headFull.headers.get('content-length')).toBe('1000');

      // If-Range: a matching validator keeps the range, a stale one returns the file.
      const etag = full.headers.get('etag')!;
      expect(etag).toMatch(/^"[0-9a-f]{64}"$/);
      const matching = await get('bytes=0-3', false, etag);
      expect(matching.status).toBe(206);
      await matching.arrayBuffer();
      const stale = await get('bytes=0-3', false, '"stale"');
      expect(stale.status).toBe(200);
      expect(await bytes(stale)).toEqual(input);
    }));

  it('keeps ?download=1 an attachment download and authorization unchanged', () =>
    withPersistence(async (p) => {
      const input = ogg(800);
      const { owner, service, ids } = await setup(p, [input], [true]);
      const id = ids[0];
      const download = await service.download(owner, id, 'file', true, false, {
        range: 'bytes=0-9',
      });
      expect(download.status).toBe(200);
      expect(download.headers.get('content-type')).toBe(
        'application/octet-stream',
      );
      expect(download.headers.get('content-disposition')).toMatch(
        /^attachment;/,
      );
      expect(download.headers.has('accept-ranges')).toBe(false);
      expect(await bytes(download)).toEqual(input);
      await expect(
        service.download({ ...owner, sessionHash: 'c'.repeat(64) }, id, 'file'),
      ).rejects.toThrow(/Sign in/);
      await expect(service.download(owner, id, 'display')).rejects.toThrow(
        /variant/,
      );
      await expect(
        service.download(owner, randomUUID(), 'file'),
      ).rejects.toThrow(/not found/);
    }));

  it('is retry-safe: the voice flag is part of the frozen manifest', () =>
    withPersistence(async (p) => {
      const input = webm();
      const owner = identity(p);
      const service = new AttachmentService(p);
      const value = manifest([input], [true]);
      const first = service.initialize(owner, value);
      if (first.state !== 'batch') throw new Error('Expected batch');
      expect(service.initialize(owner, value)).toMatchObject({
        state: 'batch',
        batch: { id: first.batch.id },
      });
      // Same ids/digests but a dropped flag is a different frozen manifest.
      const plain = { ...value.items[0] };
      delete plain.voice;
      expect(() =>
        service.initialize(owner, { ...value, items: [plain] }),
      ).toThrow(/different/);
      const ready = await service.upload(
        owner,
        first.batch.id,
        value.items[0].id,
        put(input),
      );
      expect(ready.mime).toBe('audio/webm');
      // A duplicate PUT after ready keeps the stored classification and bytes.
      const again = await service.upload(
        owner,
        first.batch.id,
        value.items[0].id,
        put(input),
      );
      expect(again.mime).toBe('audio/webm');
      expect(service.initialize(owner, value)).toMatchObject({
        state: 'batch',
      });
      const response = await service.download(owner, ready.id, 'file');
      expect(await bytes(response)).toEqual(input);
      // The same bytes uploaded without the flag stay opaque.
      const other = manifest([input], [false]);
      const otherBatch = service.initialize(owner, other);
      if (otherBatch.state !== 'batch') throw new Error('Expected batch');
      expect(otherBatch.batch.attachments[0].mime).toBe(
        'application/octet-stream',
      );
    }));
});

describe('renaming a saved voice clip, actual SQLite/filesystem', () => {
  const link = (p: Persistence, noteId: string, attachmentId: string) =>
    p.write((tx) =>
      tx
        .insert(noteAttachments)
        .values({ noteId, attachmentId, ordinal: 0 })
        .run(),
    );
  const stored = (p: Persistence, id: string) =>
    p.db.select().from(attachments).where(eq(attachments.id, id)).get()!;

  it('changes only the display name, keeps bytes/MIME/digest and refreshes the note search', () =>
    withPersistence(async (p) => {
      const { owner, service, ids } = await setup(p, [webm()], [true]);
      const noteId = seedNote(p);
      link(p, noteId, ids[0]);
      const before = stored(p, ids[0]);
      const renamed = service.rename(owner, ids[0], {
        filename: 'Weekly sync.webm',
      });
      expect(renamed).toMatchObject({
        id: ids[0],
        filename: 'Weekly sync.webm',
        mime: 'audio/webm',
      });
      const after = stored(p, ids[0]);
      expect(after).toEqual({
        ...before,
        originalFilename: 'Weekly sync.webm',
      });
      const search = p.db.all<{ names: string }>(
        sql`select filename_fields_json as names from note_search where note_id=${noteId}`,
      );
      expect(search[0]?.names).toContain('weekly sync.webm');
      // Still plays, and the download name follows.
      const response = await service.download(owner, ids[0], 'file', false);
      expect(response.headers.get('content-disposition')).toContain(
        'Weekly sync.webm',
      );
      expect(await bytes(response)).toEqual(webm());
    }));

  it('refuses unusable names, non-clips, unsaved and unknown attachments', () =>
    withPersistence(async (p) => {
      const { owner, service, ids } = await setup(p, [webm()], [true]);
      const noteId = seedNote(p);
      // Not linked to any note yet.
      expect(() =>
        service.rename(owner, ids[0], { filename: 'a.webm' }),
      ).toThrow(/not found/i);
      link(p, noteId, ids[0]);
      for (const filename of [
        '',
        '   ',
        'a/b.webm',
        '..x',
        'a\b',
        'q?.webm',
        ' pad',
        'x'.repeat(256),
        'bell',
      ])
        expect(() => service.rename(owner, ids[0], { filename })).toThrow(
          /cannot be used/,
        );
      expect(() =>
        service.rename(owner, ids[0], { filename: 'a.webm', extra: 1 }),
      ).toThrow(/cannot be used/);
      expect(() => service.rename(owner, ids[0], 'a.webm')).toThrow(
        /cannot be used/,
      );
      expect(() =>
        service.rename(owner, randomUUID().replaceAll('-', ''), {
          filename: 'a.webm',
        }),
      ).toThrow();
      // An ordinary file is not a clip.
      const plain = seedAttachment(p);
      link(p, seedNote(p), plain);
      expect(() => service.rename(owner, plain, { filename: 'a.txt' })).toThrow(
        /Only voice clips/,
      );
      expect(stored(p, ids[0]).originalFilename).toBe('voice-0.bin');
    }));

  it('every other column of a linked attachment stays immutable', () =>
    withPersistence(async (p) => {
      const { ids } = await setup(p, [webm()], [true]);
      link(p, seedNote(p), ids[0]);
      const attempt = (column: string, value: string | number) =>
        p.write((tx) =>
          tx.run(
            sql.raw(
              `update attachments set ${column}=${typeof value === 'string' ? `'${value}'` : value} where id='${ids[0]}'`,
            ),
          ),
        );
      expect(() => attempt('detected_mime', 'audio/ogg')).toThrow();
      expect(() => attempt('file_digest', 'f'.repeat(64))).toThrow();
      expect(() => attempt('incoming_bytes', 1)).toThrow();
      expect(() => attempt('original_filename', 'ok.webm')).not.toThrow();
      const row = stored(p, ids[0]);
      expect(row).toMatchObject({
        detectedMime: 'audio/webm',
        incomingBytes: 600,
        originalFilename: 'ok.webm',
      });
      expect(row.fileDigest).not.toBe('f'.repeat(64));
    }));
});
