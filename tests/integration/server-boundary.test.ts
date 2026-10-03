import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

it.each(['direct', 'indirect'] as const)(
  'rejects a %s browser import of persistence during a real SvelteKit production build',
  (kind) => {
    const root = mkdtempSync(join(tmpdir(), 'pandanote-boundary-'));
    try {
      symlinkSync(
        resolve('node_modules'),
        join(root, 'node_modules'),
        'junction',
      );
      for (const file of ['package.json', 'vite.config.ts', 'src/app.html'])
        cpSync(resolve(file), join(root, file));
      cpSync(resolve('src/lib'), join(root, 'src/lib'), { recursive: true });
      mkdirSync(join(root, 'src/routes'), { recursive: true });
      writeFileSync(
        join(root, 'src/lib/shared/leak.ts'),
        `export { connectDatabase } from '../server/db/connection.ts';`,
      );
      const imported =
        kind === 'direct' ? '#lib/server/db/connection' : '#lib/shared/leak';
      writeFileSync(
        join(root, 'src/routes/+page.svelte'),
        `<script lang="ts">import { connectDatabase } from '${imported}';</script><p>{typeof connectDatabase}</p>`,
      );
      const result = spawnSync(
        process.execPath,
        [resolve('node_modules/vite/bin/vite.js'), 'build'],
        {
          cwd: root,
          encoding: 'utf8',
          timeout: 30_000,
          env: {
            ...process.env,
            TEST: 'false',
            VITEST: 'false',
            NODE_ENV: 'production',
          },
        },
      );
      const output = `${result.stdout}\n${result.stderr}`;
      expect(result.error, output).toBeUndefined();
      expect(result.status, output).not.toBe(0);
      expect(output).toMatch(
        /Cannot import.*server.*(?:client|browser)|server-only.*(?:client|browser)|private.*client/is,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
  40_000,
);
