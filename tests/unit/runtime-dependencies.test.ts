import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { verifyRuntimeContract } from '../../scripts/runtime-dependency-contract.ts';
import { verifyRuntimeDependencies } from '../../scripts/verify-runtime-dependencies.ts';

const load = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
describe('locked runtime dependency contract', () => {
  it('verifies the actual manifests and lock without network mutation', () => {
    expect(() => verifyRuntimeDependencies()).not.toThrow();
  });
  it.each([
    'missing',
    'extra',
    'drift',
    'peer',
    'lock-root',
    'locked-version',
    'script',
    'dev',
    'engine',
    'override',
    'integrity',
  ])('rejects %s drift', (fault) => {
    const main = load('package.json');
    const runtime = load('ops/runtime/package.json');
    const lock = load('ops/runtime/package-lock.json');
    if (fault === 'missing') delete runtime.dependencies.sharp;
    if (fault === 'extra')
      runtime.dependencies.mermaid = main.dependencies.mermaid;
    if (fault === 'drift') runtime.dependencies.shiki = '1.0.0';
    if (fault === 'peer') delete runtime.dependencies.svelte;
    if (fault === 'lock-root') lock.packages[''].dependencies.svelte = '1.0.0';
    if (fault === 'locked-version')
      lock.packages['node_modules/svelte'].version = '1.0.0';
    if (fault === 'script') runtime.scripts = { prepare: 'echo bad' };
    if (fault === 'dev') runtime.devDependencies = {};
    if (fault === 'engine') runtime.engines.node = '>=20';
    if (fault === 'override') main.overrides.shiki = '1.0.0';
    if (fault === 'integrity')
      delete lock.packages['node_modules/svelte'].integrity;
    expect(() => verifyRuntimeContract(main, runtime, lock)).toThrow(
      'Runtime dependency contract',
    );
  });
});
