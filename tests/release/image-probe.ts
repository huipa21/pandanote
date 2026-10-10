// Executed as the app UID inside an externally supplied production image.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, lstatSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  runtimeRoots,
  forbiddenRuntimePackages,
} from '../../scripts/runtime-dependency-contract.ts';
import { renderMarkdown } from '../../src/lib/shared/markdown/render.ts';

const modules = '/app/node_modules';
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = join(dir, name),
      stat = lstatSync(file);
    return stat.isDirectory() ? walk(file) : stat.isFile() ? [file] : [];
  });
}
const files = walk(modules);
assert.equal(files.filter((file) => file.endsWith('.map')).length, 0);
for (const file of files.filter((file) => file.endsWith('/package.json'))) {
  const pkg = JSON.parse(readFileSync(file, 'utf8')) as { name?: string };
  assert.ok(
    !forbiddenRuntimePackages.some((name) => pkg.name === name),
    'Forbidden package in installed inventory',
  );
}
for (const name of Object.keys(runtimeRoots)) await import(name);
for (const executable of ['python3', 'make', 'g++', 'git', 'tsx'])
  assert.equal(
    execFileSync(
      'sh',
      [
        '-c',
        'command -v "$1" >/dev/null && echo found || echo absent',
        'probe',
        executable,
      ],
      { encoding: 'utf8' },
    ).trim(),
    'absent',
  );
assert.ok(existsSync('/app/build/build-info.json'));
assert.ok(existsSync('/app/migrations/0000_baseline.sql'));
for (const script of [
  'container-entry.ts',
  'container-bootstrap.ts',
  'container-user.ts',
  'reset-password.ts',
  'reindex.ts',
])
  assert.ok(existsSync('/app/scripts/' + script));
const pkg = JSON.parse(readFileSync('/app/package.json', 'utf8'));
assert.equal(pkg.type, 'module');
assert.equal(pkg.imports['#lib/*'], './src/lib/*');
const client = walk('/app/build/client');
assert.ok(client.some((file) => file.endsWith('.gz')));
assert.ok(client.some((file) => file.endsWith('.br')));
assert.ok(files.some((file) => /license|copying/i.test(file)));
assert.ok(files.some((file) => file.endsWith('.wasm')));
for (const language of ['typescript', 'sql', 'python']) {
  const rendered = await renderMarkdown(
    '```' + language + '\nconst value = 1;\n```',
  );
  assert.match(rendered.html, /shiki/);
}
const fallback = await renderMarkdown('```rust\nfn main() {}\n```');
assert.doesNotMatch(fallback.html, /shiki/);
assert.match(fallback.html, /fn main/);
const status = readFileSync('/proc/1/status', 'utf8');
assert.match(status, /CapEff:\s+0000000000000000/);
assert.match(status, /CapPrm:\s+0000000000000000/);
assert.notEqual(process.getuid!(), 0);
console.log(
  JSON.stringify({
    result:
      'PASS final minimized inventory/maps/licenses/WASM/precompression/source tools/ESM/deferred highlighting/zero caps',
    files: files.length,
    packages: files.filter((file) => file.endsWith('/package.json')).length,
    identity: JSON.parse(readFileSync('/app/build/build-info.json', 'utf8')),
  }),
);
