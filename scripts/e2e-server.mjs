import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const parent = resolve('.e2e-data');
await mkdir(parent, { recursive: true });
const data = await mkdtemp(resolve(parent, 'run-'));
const child = spawn(process.execPath, ['build/index.js'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: '4173',
    ORIGIN: 'http://127.0.0.1:4173',
    DATA_DIR: data,
    NODE_ENV: 'production',
  },
});
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
