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
  BODY_SIZE_LIMIT: '512M',
  ADDRESS_HEADER: '',
  HOST_HEADER: '',
  PROTOCOL_HEADER: '',
  PORT_HEADER: '',
};
// The real built server initializes empty storage; browser/API setup creates
// test accounts through the same public flow as production. No CLI token/seed.
// Synthetic, short-lived TLS key/certificate: never a production credential.
// Exercise the real HTTPS edge and overwritten trusted-proxy header in S02.
/**
 * Client address the security proxy reports. Tests may pick one of the documentation
 * addresses (192.0.2.0/24) with x-e2e-client-address to get a separate rate-limit
 * bucket; everything else shares 192.0.2.44. Test harness only.
 * @param {import('node:http').IncomingHttpHeaders} headers
 */
function e2eClientAddress(headers) {
  const requested = headers['x-e2e-client-address'];
  return typeof requested === 'string' && /^192\.0\.2\.\d{1,3}$/.test(requested)
    ? requested
    : '192.0.2.44';
}

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
          headers: {
            ...incoming.headers,
            'x-forwarded-for': e2eClientAddress(incoming.headers),
          },
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
// Test harness only: the app prints its setup code once to stdout. Capture it so
// the browser/API tests can read it from a private, mode-0600 fixture file.
const setupCodeFile = resolve(parent, 'setup-code');
const setupCodePattern =
  /PandaNote setup code: ([A-Z2-9]{5}(?:-[A-Z2-9]{5}){3})/;
await rm(setupCodeFile, { force: true });
let written = '';
let tail = '';
/** @param {Buffer} chunk */
function captureSetupCode(chunk) {
  tail = (tail + chunk.toString('utf8')).slice(-4096);
  const match = tail.match(setupCodePattern);
  if (match && match[1] !== written) {
    written = match[1];
    void writeFile(setupCodeFile, written, { mode: 0o600 });
  }
}
const child = spawn(process.execPath, ['build/index.js'], {
  stdio: ['inherit', 'pipe', 'pipe'],
  env,
});
child.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
  captureSetupCode(chunk);
});
child.stderr.on('data', (chunk) => {
  process.stderr.write(chunk);
  captureSetupCode(chunk);
});
await writeFile(resolve(parent, 'server.pid'), String(child.pid));
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => child.kill('SIGTERM'));
}
/** Bounded retry for transient Windows locks after the child stops.
 * @param {number} exitCode
 */
async function cleanup(exitCode) {
  proxy?.close();
  await rm(setupCodeFile, { force: true });
  try {
    await rm(data, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
    process.exitCode = exitCode;
  } catch {
    console.error('E2E private fixture cleanup failed');
    process.exitCode = 1;
  }
}
child.on('exit', (code) => {
  void cleanup(code ?? 1);
});
child.on('error', (error) => {
  console.error(error.message);
  void cleanup(1);
});
