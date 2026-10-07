import { spawn, spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { startupAppVersion } from '../../src/lib/server/db/upgrade-version.ts';

const metadata = {
  PANDANOTE_VERSION: '261006-12',
  PANDANOTE_COMMIT: 'b'.repeat(40),
  PANDANOTE_COMMITTED_AT: '2026-10-06T12:34:56.000Z',
};
const withoutMetadata = {
  ...process.env,
  PANDANOTE_VERSION: '',
  PANDANOTE_COMMIT: '',
  PANDANOTE_COMMITTED_AT: '',
};
it('production metadata validator rejects absent/partial/invalid arguments', () => {
  for (const values of [
    {},
    { PANDANOTE_VERSION: '261006-12' },
    { ...metadata, PANDANOTE_COMMIT: 'bad' },
    { ...metadata, PANDANOTE_VERSION: '261005-1' },
  ]) {
    const result = spawnSync(
      process.execPath,
      ['scripts/verify-build-metadata.ts'],
      { encoding: 'utf8', env: { ...withoutMetadata, ...values } },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/metadata is required|Invalid release/);
  }
  const valid = spawnSync(
    process.execPath,
    ['scripts/verify-build-metadata.ts'],
    { env: { ...withoutMetadata, ...metadata } },
  );
  expect(valid.status).toBe(0);
});

it('real adapter build embeds metadata in SSR and cannot be changed by runtime environment', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pandanote-embedded-'));
  let child: ReturnType<typeof spawn> | undefined;
  try {
    symlinkSync(
      resolve('node_modules'),
      join(root, 'node_modules'),
      'junction',
    );
    for (const file of ['package.json', 'vite.config.ts', 'src/app.html'])
      cpSync(resolve(file), join(root, file));
    mkdirSync(join(root, 'src/lib/shared'), { recursive: true });
    for (const file of ['build-info.ts', 'version.ts'])
      cpSync(
        resolve('src/lib/shared', file),
        join(root, 'src/lib/shared', file),
      );
    mkdirSync(join(root, 'src/routes'), { recursive: true });
    writeFileSync(
      join(root, 'src/routes/+page.svelte'),
      `<script lang="ts">import {buildInfo} from '#lib/shared/version.ts';</script><p>{buildInfo.version}</p><p>{buildInfo.commit}</p><p>{buildInfo.committedAt}</p>`,
    );
    const built = spawnSync(
      process.execPath,
      [resolve('node_modules/vite/bin/vite.js'), 'build'],
      {
        cwd: root,
        encoding: 'utf8',
        timeout: 45_000,
        env: {
          ...process.env,
          ...metadata,
          TEST: 'false',
          VITEST: 'false',
          NODE_ENV: 'production',
        },
      },
    );
    expect(built.status, built.stdout + built.stderr).toBe(0);
    // Source startup tooling receives exactly the identity embedded by the same
    // adapter build; no runtime PANDANOTE_* value is consulted by this reader.
    const manifestPath = join(root, 'build/build-info.json');
    expect(JSON.parse(readFileSync(manifestPath, 'utf8'))).toEqual({
      kind: 'release',
      version: metadata.PANDANOTE_VERSION,
      commit: metadata.PANDANOTE_COMMIT,
      committedAt: metadata.PANDANOTE_COMMITTED_AT,
    });
    expect(startupAppVersion(manifestPath)).toBe(metadata.PANDANOTE_VERSION);
    // PORT=0 asks the OS to choose an unused port. Adapter logs its actual bound address.
    child = spawn(process.execPath, ['build/index.js'], {
      cwd: root,
      env: {
        ...process.env,
        PANDANOTE_VERSION: 'spoofed-at-runtime',
        PANDANOTE_COMMIT: 'c'.repeat(40),
        PANDANOTE_COMMITTED_AT: '2030-01-01T00:00:00.000Z',
        ORIGIN: 'http://127.0.0.1',
        HOST: '127.0.0.1',
        PORT: '0',
        NODE_ENV: 'production',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const address = await new Promise<string>((accept, reject) => {
      let text = '';
      const deadline = setTimeout(
        () => reject(new Error('Adapter startup timed out')),
        10_000,
      );
      child!.once('error', (error) => {
        clearTimeout(deadline);
        reject(error);
      });
      child!.once('exit', () => {
        clearTimeout(deadline);
        reject(new Error('Adapter exited before startup'));
      });
      child!.stdout!.on('data', (chunk: Buffer) => {
        text += chunk.toString();
        const match = /Listening on http:\/\/127\.0\.0\.1:(\d+)/.exec(text);
        if (match) {
          clearTimeout(deadline);
          accept(`http://127.0.0.1:${match[1]}`);
        }
      });
    });
    const response = await fetch(address);
    const html = await response.text();
    expect(response.status).toBe(200);
    for (const value of Object.values(metadata)) expect(html).toContain(value);
    expect(html).not.toContain('spoofed-at-runtime');
  } finally {
    if (child && child.exitCode === null) {
      await new Promise<void>((accept) => {
        child!.once('exit', () => accept());
        child!.kill();
      });
    }
    rmSync(root, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  }
}, 60_000);
