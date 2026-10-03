import { spawn, execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { createServer as createHttpsServer } from 'node:https';
import { request as proxyRequest } from 'node:http';

const security = process.argv[2] === 'security';
const port = security ? '4176' : '4173';
const parent = resolve(security ? '.e2e-data/security' : '.e2e-data');
await mkdir(parent, { recursive: true });
const data = await mkdtemp(resolve(parent, 'run-'));
const env = {
  ...process.env,
  HOST: '127.0.0.1',
  PORT: port,
  ORIGIN: security ? 'https://127.0.0.1:4175' : `http://127.0.0.1:${port}`,
  DATA_DIR: data,
  NODE_ENV: 'production',
  TRUSTED_PROXY_IPS: security ? '127.0.0.1,::ffff:127.0.0.1' : '',
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
// Synthetic, short-lived TLS key/certificate: never a production credential.
// Exercise the real HTTPS edge and overwritten trusted-proxy header in S02.
/** @type {import('node:https').Server | undefined} */
let proxy;
if (security) {
  const key = resolve(data, 'test-tls-key.pem');
  const cert = resolve(data, 'test-tls-cert.pem');
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      key,
      '-out',
      cert,
      '-days',
      '1',
      '-subj',
      '/CN=127.0.0.1',
      '-addext',
      'subjectAltName=IP:127.0.0.1',
    ],
    { stdio: 'pipe' },
  );
  proxy = createHttpsServer(
    { key: readFileSync(key), cert: readFileSync(cert) },
    (incoming, outgoing) => {
      const upstream = proxyRequest(
        {
          hostname: '127.0.0.1',
          port: Number(port),
          path: incoming.url,
          method: incoming.method,
          headers: { ...incoming.headers, 'x-forwarded-for': '192.0.2.44' },
        },
        (response) => {
          outgoing.writeHead(response.statusCode ?? 502, response.headers);
          response.pipe(outgoing);
        },
      );
      upstream.on('error', () => {
        outgoing.writeHead(503);
        outgoing.end();
      });
      incoming.pipe(upstream);
    },
  );
  await new Promise((done) =>
    proxy?.listen(4175, '127.0.0.1', () => done(undefined)),
  );
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
  proxy?.close();
  void rm(data, { recursive: true, force: true }).finally(() => {
    process.exitCode = code ?? 1;
  });
});
child.on('error', (error) => {
  proxy?.close();
  console.error(error.message);
  void rm(data, { recursive: true, force: true }).finally(() => {
    process.exitCode = 1;
  });
});
