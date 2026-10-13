// Synthetic Linux production-image gate only. Copied to /tmp, never shipped.
// Bounded streams and a trusted test CA; TLS verification stays enabled.
import fs from 'node:fs';
import https from 'node:https';
import { Readable } from 'node:stream';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { setTimeout as delay } from 'node:timers/promises';
import type { NoteMutation } from '../../src/lib/shared/notes.ts';
const {
  canonicalNoteMutation,
}: typeof import('../../src/lib/shared/notes.ts') = await import(
  '/app/' + 'src/lib/shared/notes.ts'
);
const origin = process.env.DEP_ORIGIN;
const edge = process.env.DEP_EDGE;
if (!origin || !edge) throw new Error('DEP_ORIGIN and DEP_EDGE required');
const host = new URL(origin).host;
const agent = new https.Agent({
  ca: fs.readFileSync('/tmp/dep-ca.crt'),
  servername: 'localhost',
});
const password = 'deployment-only-password';
let cookie = '';
async function request<T = unknown>(
  path: string,
  method = 'GET',
  body?: object | Readable,
  extra: Record<string, string | number> = {},
): Promise<T> {
  const json = body !== undefined && !(body instanceof Readable);
  const payload =
    body instanceof Readable
      ? body
      : body === undefined
        ? undefined
        : Buffer.from(JSON.stringify(body));
  return new Promise<T>((resolve, reject) => {
    const req = https.request(
      {
        host: edge,
        port: 443,
        servername: 'localhost',
        agent,
        path,
        method,
        headers: {
          host,
          origin,
          cookie,
          ...(json && Buffer.isBuffer(payload)
            ? {
                'content-type': 'application/json',
                'content-length': payload.length,
              }
            : {}),
          ...extra,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let count = 0;
        res.on('data', (chunk: Buffer) => {
          count += chunk.length;
          if (count > 1024 * 1024)
            res.destroy(new Error('Unbounded JSON response'));
          else chunks.push(chunk);
        });
        res.on('error', reject);
        res.on('end', () => {
          if (res.headers['set-cookie'])
            cookie = res.headers['set-cookie'][0].split(';')[0];
          const text = Buffer.concat(chunks).toString();
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300)
            reject(new Error(`${method} ${path}: ${res.statusCode} ${text}`));
          else {
            try {
              resolve(JSON.parse(text) as T);
            } catch (e) {
              reject(e);
            }
          }
        });
      },
    );
    req.on('error', reject);
    if (payload instanceof Readable) pipeline(payload, req).catch(reject);
    else req.end(payload);
  });
}
async function login() {
  await request('/api/auth/login', 'POST', {
    username: 'deployment.owner',
    password,
  });
}
const grant = async (scope: string) =>
  (
    await request<{ grant: string }>('/api/auth/fresh', 'POST', {
      scope,
      password,
    })
  ).grant;
await login();
await request('/api/settings/storage', 'PATCH', {
  imageInputMaxBytes: 20 * 1024 * 1024,
  fileMaxBytes: 500 * 1024 * 1024,
  imageMaxPixels: 50_000_000,
  displayMaxEdge: 2560,
  displayQuality: 85,
  thumbnailMaxEdge: 480,
  thumbnailQuality: 75,
  markdownMaxBytes: 1024 * 1024,
  maxAttachmentsPerNote: 100,
});
const bytes = 384 * 1024 * 1024;
const file = '/tmp/dep-random.bin';
const hash = createHash('sha256');
const out = fs.openSync(file, 'wx', 0o600);
try {
  for (let remaining = bytes; remaining > 0;) {
    const chunk = randomBytes(Math.min(1024 * 1024, remaining));
    if (remaining === bytes) chunk.write('PandaNote synthetic binary.');
    fs.writeSync(out, chunk);
    hash.update(chunk);
    remaining -= chunk.length;
  }
} finally {
  fs.closeSync(out);
}
const digest = hash.digest('hex');
try {
  const items = Array.from({ length: 3 }, (_, i) => ({
    id: randomUUID(),
    filename: `synthetic-${i}.bin`,
    incomingBytes: bytes,
    incomingDigest: digest,
  }));
  const command: NoteMutation = {
    action: 'create',
    mutationId: randomUUID(),
    content: {
      bodyMarkdown: 'Large archive fixture #DEP',
      timelineAt: null,
      attachmentIds: items.map((i) => i.id),
    },
  };
  const manifest = {
    mutationId: command.mutationId,
    requestDigest: createHash('sha256')
      .update(canonicalNoteMutation(command))
      .digest('hex'),
    items,
  };
  const batch = (
    await request<{ data: { batch: { id: string } } }>(
      '/api/uploads',
      'POST',
      manifest,
    )
  ).data.batch;
  for (const item of items)
    await request(
      `/api/uploads/${batch.id}/${item.id}`,
      'PUT',
      fs.createReadStream(file),
      { 'content-type': 'application/octet-stream', 'content-length': bytes },
    );
  const note = (
    await request<{ data: { noteId: string } }>('/api/notes', 'POST', command)
  ).data;
  const id = randomUUID();
  await request('/api/backups', 'POST', {
    id,
  });
  for (let i = 0; ; i++) {
    const job = (
      await request<{ data: { id: string; state: string }[] }>('/api/backups')
    ).data.find((j) => j.id === id);
    if (job?.state === 'complete') break;
    if (job?.state === 'failed' || i > 3000)
      throw new Error('Large backup failed/timed out');
    await delay(200);
  }
  const archive = `/data/backups/${id}.pnb`;
  const size = fs.statSync(archive).size;
  if (size < 1024 ** 3) throw new Error('Fixture is not at least 1 GiB');
  const form = new URLSearchParams().toString();
  const downloaded = '/tmp/dep-downloaded.pnb';
  await new Promise<void>((resolve, reject) => {
    const req = https.request(
      {
        host: edge,
        port: 443,
        servername: 'localhost',
        agent,
        path: `/api/backups/${id}/download`,
        method: 'POST',
        headers: {
          host,
          origin,
          cookie,
          'content-type': 'application/x-www-form-urlencoded',
          'content-length': Buffer.byteLength(form),
        },
      },
      async (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error('Large download refused'));
          return;
        }
        try {
          await pipeline(
            res,
            fs.createWriteStream(downloaded, { flags: 'wx', mode: 0o600 }),
          );
          resolve();
        } catch (e) {
          reject(e);
        }
      },
    );
    req.on('error', reject);
    req.end(form);
  });
  const sha = async (path: string) => {
    const h = createHash('sha256');
    for await (const chunk of fs.createReadStream(path))
      h.update(chunk as Buffer);
    return h.digest('hex');
  };
  if (
    fs.statSync(downloaded).size !== size ||
    (await sha(downloaded)) !== (await sha(archive))
  )
    throw new Error('Download mismatch');
  const summary = (
    await request<{ data: { id: string } }>(
      '/api/restores',
      'POST',
      fs.createReadStream(downloaded),
      {
        'content-type': 'application/octet-stream',
        'content-length': size,
        'x-archive-bytes': size,
        'x-restore-grant': await grant('restore'),
      },
    )
  ).data;
  await request('/api/restores/confirm', 'POST', {
    id: summary.id,
    confirmed: true,
    grant: await grant('restore'),
  });
  await login();
  const restored = (
    await request<{ data: { attachmentIds: string[] } }>(
      `/api/notes/${note.noteId}`,
    )
  ).data;
  if (restored.attachmentIds.length !== 3)
    throw new Error('Large restored references missing');
  for (const item of items)
    if ((await sha(`/data/files/${item.id}/attachment.bin`)) !== digest)
      throw new Error('Restored file mismatch');
  fs.unlinkSync(downloaded);
  console.log(
    `PASS large archive TLS upload/validate/restore: ${size} bytes; all three file hashes intact`,
  );
} finally {
  fs.rmSync(file, { force: true });
  agent.destroy();
}
