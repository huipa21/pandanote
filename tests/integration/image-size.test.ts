import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync, zstdCompressSync } from 'node:zlib';
import { pack } from 'tar-stream';
import { describe, expect, it } from 'vitest';
import { imageSizeCli, inspectImageArchive } from '../../scripts/image-size.ts';

async function fixture(
  multiple = false,
  compressedLayers: boolean | 'zstd' = false,
) {
  const inner = pack();
  inner.entry({ name: 'app/node_modules/example/index.js' }, 'executable');
  inner.entry(
    { name: 'app/node_modules/example/index.js.map' },
    'synthetic-map',
  );
  inner.entry({ name: 'app/build/client/app.js.gz' }, 'precompressed');
  inner.finalize();
  const layer: Buffer[] = [];
  for await (const chunk of inner) layer.push(Buffer.from(chunk as Uint8Array));
  const outer = pack();
  outer.entry(
    { name: 'payload.tar' },
    compressedLayers === 'zstd'
      ? zstdCompressSync(Buffer.concat(layer))
      : compressedLayers
        ? gzipSync(Buffer.concat(layer))
        : Buffer.concat(layer),
  );
  outer.entry({
    name: 'legacy/layer.tar',
    type: 'symlink',
    linkname: '../payload.tar',
  });
  outer.entry(
    { name: 'config.json' },
    JSON.stringify({
      os: 'linux',
      architecture: 'amd64',
      config: { Labels: { revision: 'synthetic' } },
    }),
  );
  const image = {
    Config: 'config.json',
    RepoTags: ['synthetic:only'],
    Layers: ['legacy/layer.tar', 'payload.tar'],
  };
  outer.entry(
    { name: 'manifest.json' },
    JSON.stringify(multiple ? [image, image] : [image]),
  );
  outer.finalize();
  const chunks: Buffer[] = [];
  for await (const chunk of outer)
    chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks);
}

describe('read-only bounded Docker image size reporting', () => {
  it('counts aliases once, labels overlapping categories and explicitly reports multiple images', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pandanote-size-'));
    try {
      const file = join(dir, 'synthetic.tar');
      const bytes = await fixture(true);
      await writeFile(file, bytes);
      const report = await inspectImageArchive(file);
      expect(report.archive.bytes).toBe(bytes.length);
      expect(report.gzip.bytes).toBe(gzipSync(bytes, { level: 6 }).length);
      expect(report.images).toHaveLength(2);
      expect(report.images[0].platform).toBe('linux/amd64');
      expect(report.logicalLayerReferences).toBe(4);
      expect(report.distinctLayerPayloads).toBe(1);
      expect(report.layers[0].nodeModules).toEqual({ files: 2, bytes: 23 });
      expect(report.layers[0].dependencyMaps).toEqual({ files: 1, bytes: 13 });
      expect(report.largestPackages[0]).toEqual({
        name: 'example',
        files: 2,
        bytes: 23,
      });
      expect(report.accounting).toContain('overlap');
      expect(await readFile(file)).toEqual(bytes);
      const compressed = join(dir, 'synthetic.tar.gz');
      await writeFile(compressed, gzipSync(bytes));
      const gzReport = await inspectImageArchive(compressed);
      expect(gzReport.rawTar).toEqual(report.rawTar);
      expect(gzReport.layers).toEqual(report.layers);
      const output = join(dir, 'report.json');
      await imageSizeCli(['--archive', file, '--output', output]);
      await expect(
        imageSizeCli(['--archive', file, '--output', output]),
      ).rejects.toThrow('EEXIST');
      await expect(
        imageSizeCli(['--archive', file, '--output', file]),
      ).rejects.toThrow('EEXIST');
      expect(await readFile(file)).toEqual(bytes);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it.each(['gzip', 'zstd'] as const)(
    'decodes Docker containerd %s layer blobs while separating stored/tar sizes',
    async (codec) => {
      const dir = await mkdtemp(join(tmpdir(), 'pandanote-size-layer-gzip-'));
      try {
        const file = join(dir, 'containerd.tar');
        await writeFile(
          file,
          await fixture(false, codec === 'zstd' ? 'zstd' : true),
        );
        const report = await inspectImageArchive(file);
        expect(report.layers[0].codec).toBe(codec);
        expect(report.layers[0].stored.bytes).toBeLessThan(
          report.layers[0].tar.bytes,
        );
        expect(report.layers[0].dependencyMaps.bytes).toBe(13);
        expect(report.largestPackages[0].bytes).toBe(23);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  );

  it('rejects truncation, invalid checksums, OCI/empty input, corrupt gzip and invalid options', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pandanote-size-invalid-'));
    try {
      const bytes = await fixture();
      const file = join(dir, 'bad.tar');
      await writeFile(file, bytes.subarray(0, bytes.length - 700));
      await expect(inspectImageArchive(file)).rejects.toThrow(
        /Truncated|Unexpected/,
      );
      const bad = Buffer.from(bytes);
      bad[1] ^= 1;
      await writeFile(file, bad);
      await expect(inspectImageArchive(file)).rejects.toThrow(/checksum/);
      await writeFile(file, Buffer.alloc(1024));
      await expect(inspectImageArchive(file)).rejects.toThrow(/Docker-format/);
      const gz = join(dir, 'bad.tar.gz');
      await writeFile(gz, gzipSync(bytes).subarray(0, -8));
      await expect(inspectImageArchive(gz)).rejects.toThrow();
      await expect(inspectImageArchive(file, 0)).rejects.toThrow('Gzip');
      await expect(
        imageSizeCli(['--archive', file, '--archive', file]),
      ).rejects.toThrow('duplicate');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('does not disclose malformed metadata content in errors', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pandanote-size-redaction-'));
    try {
      const outer = pack();
      outer.entry(
        { name: 'manifest.json' },
        'synthetic-private-marker invalid-json',
      );
      outer.finalize();
      const chunks: Buffer[] = [];
      for await (const chunk of outer)
        chunks.push(Buffer.from(chunk as Uint8Array));
      const file = join(dir, 'bad.tar');
      await writeFile(file, Buffer.concat(chunks));
      await expect(inspectImageArchive(file)).rejects.toThrow(
        'Invalid image metadata JSON',
      );
      await expect(inspectImageArchive(file)).rejects.not.toThrow(
        'synthetic-private-marker',
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('bounds metadata and refuses unsafe/missing/looping aliases without extraction', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pandanote-size-bounds-'));
    try {
      for (const variant of ['large', 'missing', 'cycle', 'unsafe']) {
        const outer = pack();
        if (variant === 'large')
          outer.entry({ name: 'manifest.json' }, Buffer.alloc(1024 * 1024 + 1));
        else {
          outer.entry({ name: 'config.json' }, '{}');
          outer.entry(
            { name: 'manifest.json' },
            JSON.stringify([
              {
                Config: 'config.json',
                RepoTags: null,
                Layers: [variant === 'unsafe' ? '../outside' : 'missing.tar'],
              },
            ]),
          );
          if (variant === 'cycle')
            outer.entry({
              name: 'missing.tar',
              type: 'symlink',
              linkname: 'missing.tar',
            });
        }
        outer.finalize();
        const chunks: Buffer[] = [];
        for await (const chunk of outer)
          chunks.push(Buffer.from(chunk as Uint8Array));
        const file = join(dir, 'bad.tar');
        await writeFile(file, Buffer.concat(chunks));
        await expect(inspectImageArchive(file)).rejects.toThrow(
          /limit|Missing|Cyclic|Unsafe/,
        );
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
