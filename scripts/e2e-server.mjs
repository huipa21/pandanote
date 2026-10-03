import { spawn, execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const parent = resolve('.e2e-data');
await mkdir(parent, { recursive: true });
const data = await mkdtemp(resolve(parent, 'run-'));
const env = {
  ...process.env,
  HOST: '127.0.0.1',
  PORT: '4173',
  ORIGIN: 'http://127.0.0.1:4173',
  DATA_DIR: data,
  NODE_ENV: 'production',
  TRUSTED_PROXY_IPS: '',
  ADDRESS_HEADER: '',
  HOST_HEADER: '',
  PROTOCOL_HEADER: '',
  PORT_HEADER: '',
};
try {
  execFileSync(process.execPath, ['scripts/migrate.ts'], {
    env,
    stdio: 'pipe',
  });
  const token = execFileSync(process.execPath, ['scripts/setup-token.ts'], {
    env,
    encoding: 'utf8',
    stdio: 'pipe',
  }).trim();
  // Test-only fixture handoff, excluded from git and removed at teardown.
  await writeFile(resolve(parent, 'fixture.json'), JSON.stringify({ token }), {
    mode: 0o600,
  });
} catch {
  await rm(data, { recursive: true, force: true });
  throw new Error('E2E private storage initialization failed');
}
const child = spawn(process.execPath, ['build/index.js'], {
  stdio: 'inherit',
  env,
});
await writeFile(resolve(parent, 'server.pid'), String(child.pid));
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => child.kill('SIGTERM'));
}
child.on('exit', (code) => {
  void rm(data, { recursive: true, force: true }).finally(() => {
    process.exitCode = code ?? 1;
  });
});
child.on('error', (error) => {
  console.error(error.message);
  void rm(data, { recursive: true, force: true }).finally(() => {
    process.exitCode = 1;
  });
});
