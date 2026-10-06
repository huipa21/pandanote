import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import tar from 'tar-stream';
import { describe, expect, it } from 'vitest';
import {
  assertCleanCheckout,
  deriveRelease,
} from '../../scripts/release-version.ts';
import { buildImage, imageBuildOptions } from '../../scripts/image-build.ts';

function git(root: string, args: string[], date?: string) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_DATE: '2020-01-01T00:00:00Z',
      ...(date ? { GIT_COMMITTER_DATE: date } : {}),
    },
  });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}
function repository() {
  const root = mkdtempSync(join(tmpdir(), 'pandanote-version-'));
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.name', 'Synthetic version test']);
  git(root, ['config', 'user.email', 'synthetic@example.invalid']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  writeFileSync(join(root, '.gitignore'), 'ignored-secret\n');
  writeFileSync(join(root, 'source.txt'), 'committed source');
  git(root, ['add', '.']);
  return root;
}
function commit(root: string, date: string) {
  git(root, ['commit', '--allow-empty', '-m', 'Synthetic commit'], date);
  return git(root, ['rev-parse', 'HEAD']);
}
async function entries(buffer: Buffer) {
  const result = new Map<string, string>();
  const extract = tar.extract();
  extract.on('entry', (header, stream, next) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => {
      chunks.push(chunk as Buffer);
    });
    stream.on('end', () => {
      result.set(header.name, Buffer.concat(chunks).toString());
      next();
    });
  });
  await new Promise<void>((resolve, reject) => {
    extract.on('finish', resolve);
    extract.on('error', reject);
    extract.end(buffer);
  });
  return result;
}

describe('actual Git release derivation', () => {
  it('uses UTC committer dates, daily reset, complete nonmonotonic ancestry and stable old commits', () => {
    const root = repository();
    try {
      commit(root, '2026-10-06T07:59:59+08:00'); // UTC October 5, not author January 1
      expect(deriveRelease(root).version).toBe('261005-1');
      const target = commit(root, '2026-10-06T08:00:00+08:00');
      const original = deriveRelease(root);
      expect(original).toMatchObject({
        version: '261006-1',
        committedAt: '2026-10-06T00:00:00.000Z',
        commit: target,
      });
      commit(root, '2026-10-05T23:00:00Z'); // a backward clock must not prune older matches
      commit(root, '2026-10-06T01:00:00Z');
      expect(deriveRelease(root).version).toBe('261006-2');
      for (let i = 0; i < 10; i++) commit(root, '2026-10-06T02:00:00Z');
      expect(deriveRelease(root).version).toBe('261006-12');
      git(root, ['checkout', '--detach', target]);
      expect(deriveRelease(root)).toEqual(original);
      // Direct timezone variation of the same function in a native Node child.
      const child = (tz: string) =>
        spawnSync(
          process.execPath,
          [
            '--input-type=module',
            '-e',
            `import {deriveRelease} from ${JSON.stringify(new URL('../../scripts/release-version.ts', import.meta.url).href)}; process.stdout.write(JSON.stringify(deriveRelease(process.argv[1])));`,
            root,
          ],
          { encoding: 'utf8', env: { ...process.env, TZ: tz } },
        );
      for (const tz of ['Pacific/Honolulu', 'Asia/Tokyo']) {
        const result = child(tz);
        expect(result.status, result.stderr).toBe(0);
        expect(JSON.parse(result.stdout)).toEqual(original);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('counts a merge once and excludes merged feature branch commits', () => {
    const root = repository();
    try {
      commit(root, '2026-10-06T00:00:00Z');
      git(root, ['checkout', '-b', 'feature']);
      commit(root, '2026-10-06T01:00:00Z');
      commit(root, '2026-10-06T02:00:00Z');
      git(root, ['checkout', 'main']);
      commit(root, '2026-10-06T03:00:00Z');
      git(
        root,
        ['merge', '--no-ff', 'feature', '-m', 'Synthetic merge'],
        '2026-10-06T04:00:00Z',
      );
      expect(deriveRelease(root).version).toBe('261006-3');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('rejects staged, unstaged, untracked, shallow and missing repositories; ignored files are allowed', () => {
    const root = repository();
    const shallowParent = mkdtempSync(join(tmpdir(), 'pandanote-shallow-'));
    try {
      const first = commit(root, '2026-10-06T00:00:00Z');
      writeFileSync(join(root, 'ignored-secret'), 'not release content');
      expect(deriveRelease(root).commit).toBe(first);
      writeFileSync(join(root, 'source.txt'), 'unstaged');
      expect(() => deriveRelease(root)).toThrow(/Dirty/);
      git(root, ['add', 'source.txt']);
      expect(() => deriveRelease(root)).toThrow(/Dirty/);
      git(root, ['reset', '--hard', 'HEAD']);
      writeFileSync(join(root, 'untracked.txt'), 'untracked');
      expect(() => deriveRelease(root)).toThrow(/Dirty/);
      rmSync(join(root, 'untracked.txt'));
      commit(root, '2026-10-06T01:00:00Z');
      expect(() => assertCleanCheckout(root, first)).toThrow(/HEAD changed/);
      const shallow = join(shallowParent, 'clone');
      git(shallowParent, ['clone', '--depth=1', '--no-local', root, shallow]);
      expect(() => deriveRelease(shallow)).toThrow(/Shallow/);
      expect(() => deriveRelease(shallowParent)).toThrow(/Git command failed/);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(shallowParent, { recursive: true, force: true });
    }
  });
  it('builds an immutable committed archive with matching arguments; rejects dirty before invoking the engine and propagates failures', async () => {
    const root = repository();
    let archive = Buffer.alloc(0);
    let args: string[] = [];
    let snapshotDirectory = '';
    try {
      commit(root, '2026-10-06T00:00:00Z');
      writeFileSync(join(root, 'ignored-secret'), 'must never enter the image');
      const info = buildImage(
        root,
        imageBuildOptions([]),
        (engine, actual, input) => {
          expect(engine).toBe('docker');
          args = actual;
          archive = readFileSync(input);
          if (process.platform === 'linux')
            snapshotDirectory = dirname(readlinkSync(`/proc/self/fd/${input}`));
        },
        () => undefined,
      );
      expect(args.filter((arg) => arg === '-t')).toHaveLength(2);
      expect(args).toContain('pandanote:latest');
      expect(args).toContain(`pandanote:${info.version}`);
      expect(args).toContain(`PANDANOTE_VERSION=${info.version}`);
      expect(args).toContain(`PANDANOTE_COMMIT=${info.commit}`);
      expect(args).toContain(`PANDANOTE_COMMITTED_AT=${info.committedAt}`);
      expect(args.at(-1)).toBe('-');
      const contents = await entries(archive);
      expect(contents.get('source.txt')).toBe('committed source');
      expect(contents.has('ignored-secret')).toBe(false);
      expect(
        [...contents.keys()].some((name) => name.startsWith('.git/')),
      ).toBe(false);
      if (snapshotDirectory) expect(existsSync(snapshotDirectory)).toBe(false);
      buildImage(
        root,
        imageBuildOptions([]),
        (engine, actual) => {
          expect(engine).toBe('podman');
          expect(actual.slice(0, 3)).toEqual(['build', '--format', 'docker']);
          expect(actual).toContain('pandanote:latest');
          expect(actual).toContain(`PANDANOTE_VERSION=${info.version}`);
        },
        (engine) => (engine === 'docker' ? 'missing' : undefined),
      );
      expect(() =>
        buildImage(
          root,
          imageBuildOptions([]),
          () => {
            throw new Error('Synthetic engine failure');
          },
          () => undefined,
        ),
      ).toThrow(/engine failure/);
      writeFileSync(join(root, 'source.txt'), 'changed');
      let invoked = false;
      expect(() =>
        buildImage(
          root,
          imageBuildOptions([]),
          () => {
            invoked = true;
          },
          () => {
            throw new Error('Dirty sources must fail before detection');
          },
        ),
      ).toThrow(/Dirty/);
      expect(invoked).toBe(false);
      // Exercise the actual CLI in this synthetic dirty repo, independent of the
      // developer checkout's state. Test tooling is ignored, never release source.
      mkdirSync(join(root, 'scripts'));
      mkdirSync(join(root, 'src/lib/shared'), { recursive: true });
      for (const script of ['image-build.ts', 'release-version.ts'])
        cpSync(resolve('scripts', script), join(root, 'scripts', script));
      cpSync(
        resolve('src/lib/shared/build-info.ts'),
        join(root, 'src/lib/shared/build-info.ts'),
      );
      writeFileSync(join(root, '.git/info/exclude'), 'scripts/\nsrc/\n');
      const result = spawnSync(
        process.execPath,
        [join(root, 'scripts/image-build.ts')],
        { encoding: 'utf8' },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/Dirty/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
