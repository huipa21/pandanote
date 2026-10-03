import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createGzip, gzipSync, gunzipSync } from 'node:zlib';
import tar, { type Header } from 'tar-stream';

import { expect, it } from 'vitest';
import { validateArchiveProbe, type Payload } from '../spikes/archive';

type Headers = Partial<Header> & Pick<Header, 'name'>;

const body = Buffer.from('synthetic payload');
const payload: Payload = {
  size: body.length,
  sha256: createHash('sha256').update(body).digest('hex'),
};
const limits = { compressed: 100_000, expanded: 100_000, files: 10 };

async function withArchive(
  entries: { header: Headers; body?: Buffer }[],
  test: (path: string, root: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'pandanote-archive-'));
  try {
    const path = join(root, 'archive.pnb');
    const pack = tar.pack();
    const writing = pipeline(
      pack,
      createGzip(),
      createWriteStream(path, { flags: 'wx', mode: 0o600 }),
    );
    for (const entry of entries)
      pack.entry({ mtime: new Date(0), ...entry.header }, entry.body ?? body);
    pack.finalize();
    await writing;
    await test(path, root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

it('streams and verifies complete payload before any filesystem extraction/write', async () => {
  await withArchive(
    [{ header: { name: 'manifest.json' } }],
    async (path, root) => {
      await validateArchiveProbe(
        path,
        new Map([['manifest.json', payload]]),
        limits,
      );
      expect(await readdir(root)).toEqual(['archive.pnb']);
      // Demonstrate a real second pass, only after complete no-write validation.
      // S17 must keep staged archives immutable and validate manifest/DB first.
      const stage = join(root, 'stage');
      await mkdir(stage, { mode: 0o700 });
      const extract = tar.extract();
      extract.on('entry', (header, entry, next) => {
        if (header.type !== 'file' || header.name !== 'manifest.json') {
          next(new Error('Unexpected extraction entry'));
          return;
        }
        void pipeline(
          entry,
          createWriteStream(join(stage, header.name), {
            flags: 'wx',
            mode: 0o600,
          }),
        ).then(
          () => next(),
          (error: Error) => next(error),
        );
      });
      await pipeline(createReadStream(path), createGunzip(), extract);
      expect(await readFile(join(stage, 'manifest.json'))).toEqual(body);
    },
  );
});

it.each([
  '../escape',
  '/absolute',
  'C:/drive',
  'C:\\drive',
  'files/../../escape',
  'files\\..\\escape',
])('rejects traversal/drive entry %s without writing', async (name) => {
  await withArchive([{ header: { name } }], async (path, root) => {
    await expect(
      validateArchiveProbe(path, new Map([[name, payload]]), limits),
    ).rejects.toThrow();
    expect(await readdir(root)).toEqual(['archive.pnb']);
  });
});

it.each([
  'symlink',
  'link',
  'block-device',
  'character-device',
  'fifo',
  'directory',
] as const)('rejects %s at the raw header boundary', async (type) => {
  await withArchive(
    [
      {
        header: { name: 'unsafe', type, linkname: '../escape' },
        body: Buffer.alloc(0),
      },
    ],
    async (path) => {
      await expect(
        validateArchiveProbe(path, new Map(), limits),
      ).rejects.toThrow(/Only regular USTAR/);
    },
  );
});

it.each(['x', 'g', 'L', 'K'])(
  'rejects hidden extension typeflag %s (PAX/global PAX/GNU path/link)',
  async (flag) => {
    await withArchive([{ header: { name: 'one' } }], async (path) => {
      const raw = gunzipSync(await readFile(path));
      raw[156] = flag.charCodeAt(0);
      raw.fill(32, 148, 156);
      const sum = raw.subarray(0, 512).reduce((total, byte) => total + byte, 0);
      raw.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
      await writeFile(path, gzipSync(raw));
      await expect(
        validateArchiveProbe(path, new Map(), limits),
      ).rejects.toThrow(/Only regular USTAR/);
    });
  },
);

it('rejects PAX path override (tar-stream hides extension entries from listeners)', async () => {
  await withArchive(
    [{ header: { name: 'safe', pax: { path: '../escape' } } as Headers }],
    async (path) => {
      await expect(
        validateArchiveProbe(path, new Map([['safe', payload]]), limits),
      ).rejects.toThrow(/Only regular USTAR/);
    },
  );
});

it('rejects duplicate entries, missing payload, wrong checksum, unexpected sizes and count limits', async () => {
  await withArchive(
    [{ header: { name: 'one' } }, { header: { name: 'one' } }],
    async (path) => {
      await expect(
        validateArchiveProbe(path, new Map([['one', payload]]), limits),
      ).rejects.toThrow('Duplicate');
    },
  );
  await withArchive([{ header: { name: 'one' } }], async (path) => {
    await expect(
      validateArchiveProbe(
        path,
        new Map([
          ['one', payload],
          ['two', payload],
        ]),
        limits,
      ),
    ).rejects.toThrow('Missing');
    await expect(
      validateArchiveProbe(
        path,
        new Map([['one', { ...payload, sha256: '0'.repeat(64) }]]),
        limits,
      ),
    ).rejects.toThrow('Checksum');
    await expect(
      validateArchiveProbe(
        path,
        new Map([['one', { ...payload, size: 1 }]]),
        limits,
      ),
    ).rejects.toThrow('size');
    await expect(
      validateArchiveProbe(path, new Map([['one', payload]]), {
        ...limits,
        files: 0,
      }),
    ).rejects.toThrow('Too many');
  });
});

it('bounds compressed/expanded bytes and rejects truncated gzip', async () => {
  await withArchive(
    [{ header: { name: 'one' }, body: Buffer.alloc(200_000) }],
    async (path, root) => {
      await expect(
        validateArchiveProbe(path, new Map(), { ...limits, compressed: 1 }),
      ).rejects.toThrow('byte limit');
      await expect(
        validateArchiveProbe(path, new Map(), { ...limits, expanded: 100 }),
      ).rejects.toThrow('byte limit');
      const broken = join(root, 'broken.pnb');
      await writeFile(broken, Buffer.from([0x1f, 0x8b, 0x08]));
      await expect(
        validateArchiveProbe(broken, new Map(), limits),
      ).rejects.toThrow();
    },
  );
});
