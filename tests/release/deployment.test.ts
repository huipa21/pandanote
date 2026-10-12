import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { readSetupCode } from './setup-code.ts';

// Explicit opt-in Linux production-image gate. Never run on a production engine:
// requires the fixed app name and proxynet to be unused, and restores image aliases.
// DEP_IMAGE and DEP_UPGRADE_IMAGE are isolated synthetic builds of this checkout;
// the latter adds a trusted SQL + data migration. See tests/release/README.md.
const engine = process.env.DEP_ENGINE ?? 'docker';
const image = process.env.DEP_IMAGE;
const upgrade = process.env.DEP_UPGRADE_IMAGE;
const binary = process.env.DEP_COMPOSE_BINARY;
const remote = process.env.DEP_REMOTE === 'podman-machine';
const dockerContainer = process.env.DEP_DOCKER_CONTAINER;
const spawnEngine = (
  args: string[],
  options: { encoding?: 'utf8'; timeout?: number; maxBuffer?: number } = {},
) =>
  spawnSync(
    engine,
    dockerContainer ? ['exec', dockerContainer, 'docker', ...args] : args,
    { ...options, encoding: 'utf8' },
  );
// Test-only alternate socket for a separate storage/daemon; never a production input.
const socket =
  process.env.DEP_ENGINE_SOCKET ??
  (remote ? '/run/user/0/podman/podman.sock' : '/var/run/docker.sock');
const root = `/var/tmp/pandanote-dep-${randomUUID()}`;
const helper = `pandanote-dep-${randomUUID()}`;
const edge = `${helper}-edge`;
const origin = 'https://localhost:18447';
const password = 'deployment-only-password';
const temporary = mkdtempSync(join(tmpdir(), 'pandanote-dep-driver-'));
let original: string | undefined;
let owned = false;
const q = (text: string) => `'${text.replaceAll("'", "'\\''")}'`;
function cli(args: string[], expected = 0, timeout = 180_000): string {
  // Optional disposable Docker-in-Podman backend. Bridge client-side files only;
  // Docker still performs the real Compose/start/health/stop/load operations.
  if (dockerContainer && args[0] === 'cp') {
    const transfer = `/tmp/pn-dep-transfer-${randomUUID()}`;
    const fromDriver = !args[1].includes(':/');
    const bridge = spawnSync(
      engine,
      fromDriver
        ? ['cp', args[1], `${dockerContainer}:${transfer}`]
        : ['exec', dockerContainer, 'docker', 'cp', args[1], transfer],
      { encoding: 'utf8', timeout },
    );
    expect(bridge.status, 'Docker test transport copy').toBe(0);
    const result = spawnSync(
      engine,
      fromDriver
        ? ['exec', dockerContainer, 'docker', 'cp', transfer, args[2]]
        : ['cp', `${dockerContainer}:${transfer}`, args[2]],
      { encoding: 'utf8', timeout },
    );
    spawnSync(engine, ['exec', dockerContainer, 'rm', '-f', transfer]);
    expect(result.status, 'Docker test transport copy').toBe(expected);
    return result.stdout.trim();
  }
  const result = spawnEngine(args, {
    encoding: 'utf8',
    timeout,
    maxBuffer: 8 * 1024 * 1024,
  });
  expect(result.status, `${args[0]}: ${result.stderr}\n${result.stdout}`).toBe(
    expected,
  );
  return result.stdout.trim();
}
function shell(command: string, timeout = 180_000): string {
  if (dockerContainer) {
    const result = spawnSync(
      engine,
      ['exec', dockerContainer, 'sh', '-c', command],
      { encoding: 'utf8', timeout },
    );
    expect(result.status, 'Docker test host shell').toBe(0);
    return result.stdout.trim();
  }
  if (remote) return cli(['machine', 'ssh', command], 0, timeout);
  const result = spawnSync('sh', ['-c', command], {
    encoding: 'utf8',
    timeout,
    maxBuffer: 8 * 1024 * 1024,
  });
  expect(result.status, result.stderr + result.stdout).toBe(0);
  return result.stdout.trim();
}
const compose = (args: string, timed = false) =>
  cli([
    'exec',
    '-e',
    'DOCKER_HOST=unix:///test-engine.sock',
    helper,
    'sh',
    '-c',
    `${timed ? 'start=$(node -p "process.hrtime.bigint().toString()"); ' : ''}cd ${q(root)} && ./compose ${args}${timed ? '; code=$?; end=$(node -p "process.hrtime.bigint().toString()"); printf "DEP_MS=%s\\n" "$(( (end - start) / 1000000 ))"; exit "$code"' : ''}`,
  ]);
function copy(text: string, destination: string) {
  const file = join(temporary, randomUUID());
  writeFileSync(file, text);
  cli(['cp', file, `${helper}:/probe/${destination}`]);
}
function inspect(script: string): unknown {
  return JSON.parse(
    cli([
      'exec',
      '--user',
      '1000:1000',
      'pandanote',
      'node',
      '--input-type=module',
      '-e',
      script,
    ]),
  );
}
async function ready() {
  await expect
    .poll(
      () => {
        const result = spawnEngine(
          [
            'exec',
            'pandanote',
            'node',
            '-e',
            "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))",
          ],
          { timeout: 10_000 },
        );
        return result.status;
      },
      { timeout: 90_000 },
    )
    .toBe(0);
}

test.describe.configure({ mode: 'serial' });
test.beforeAll(() => {
  if (!image || !upgrade || !binary)
    throw new Error(
      'DEP_IMAGE, DEP_UPGRADE_IMAGE and DEP_COMPOSE_BINARY are required (Linux engine/Compose); missing prerequisites are a blocker.',
    );
  if (
    spawnEngine(['container', 'inspect', 'pandanote']).status === 0 ||
    spawnEngine(['network', 'inspect', 'proxynet']).status === 0
  )
    throw new Error(
      'Refusing deployment gate: pandanote/proxynet already exists. Use an isolated test engine.',
    );
  const old = spawnEngine(
    ['image', 'inspect', 'pandanote:latest', '--format', '{{.Id}}'],
    { encoding: 'utf8' },
  );
  if (old.status === 0) original = old.stdout.trim();
  cli(['tag', image, 'pandanote:latest']);
  cli(['network', 'create', 'proxynet']);
  owned = true;
  shell(`mkdir -m 700 ${q(root)}`);
  cli([
    'run',
    '-d',
    '--name',
    helper,
    '--entrypoint',
    'sleep',
    '-v',
    `${root}:/probe`,
    '-v',
    `${root}:${root}`,
    '-v',
    `${socket}:/test-engine.sock`,
    image,
    'infinity',
  ]);
  cli([
    'cp',
    resolve('docker-compose.yml'),
    `${helper}:/probe/docker-compose.yml`,
  ]);
  cli(['cp', resolve(binary), `${helper}:/probe/compose`]);
  cli(['exec', helper, 'chmod', '755', '/probe/compose']);
  copy(`ORIGIN=${origin}\n`, '.env');
  // Config uses ONLY the required ORIGIN; ./data does not exist yet.
  expect(compose('config')).toContain('pandanote:latest');
  compose('up -d');
  cli([
    'create',
    '--name',
    edge,
    '--network',
    'proxynet',
    '-p',
    '18447:443',
    'docker.io/library/caddy:2.11.6-alpine',
  ]);
  const caddyfile = join(temporary, 'Caddyfile');
  writeFileSync(caddyfile, 'localhost {\n reverse_proxy pandanote:3000\n}\n');
  cli(['cp', caddyfile, `${edge}:/etc/caddy/Caddyfile`]);
  cli(['start', edge]);
});
test.afterAll(() => {
  if (owned) {
    // Remove only resources allocated after the collision check, never user data.
    spawnEngine(['rm', '-f', edge, 'pandanote', helper], {
      timeout: 60_000,
    });
    spawnEngine(['network', 'rm', 'proxynet'], { timeout: 60_000 });
    if (original) spawnEngine(['tag', original, 'pandanote:latest']);
    else if (dockerContainer) spawnEngine(['image', 'rm', 'pandanote:latest']);
    else spawnEngine(['untag', image!, 'pandanote:latest']);
    shell(`rm -rf ${q(root)}`);
  }
  rmSync(temporary, { recursive: true, force: true });
});

test('DEP-01–05: copied minimal deployment, default private bind, browser setup, PID 1 privileges and Caddy client IP', async ({
  browser,
}) => {
  await ready();
  await expect
    .poll(
      () =>
        cli(['inspect', 'pandanote', '--format', '{{.State.Health.Status}}']),
      { timeout: 90_000 },
    )
    .toBe('healthy');
  expect(
    inspect(
      `import fs from 'node:fs'; const s=fs.readFileSync('/proc/1/status','utf8'); console.log(JSON.stringify({uid:s.match(/Uid:\\s*(\\d+)/)[1],gid:s.match(/Gid:\\s*(\\d+)/)[1],effective:s.match(/CapEff:\\s*(\\w+)/)[1],permitted:s.match(/CapPrm:\\s*(\\w+)/)[1],cmd:fs.readFileSync('/proc/1/cmdline','utf8'),owner:fs.statSync('/data').uid,mode:fs.statSync('/data').mode&511,dbMode:fs.statSync('/data/db/pandanote.sqlite').mode&511}));`,
    ),
  ).toMatchObject({
    uid: '1000',
    gid: '1000',
    effective: '0000000000000000',
    permitted: '0000000000000000',
    owner: 1000,
    mode: 0o700,
    dbMode: 0o600,
    cmd: expect.stringContaining('build/index.js'),
  });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await expect
    .poll(
      async () => {
        try {
          return (await context.request.get(`${origin}/health`)).status();
        } catch {
          return 0;
        }
      },
      { timeout: 60_000 },
    )
    .toBe(200);
  await page.goto(origin);
  await expect(page).toHaveURL(`${origin}/setup`);
  await page
    .getByLabel('Setup code', { exact: true })
    .fill(await readSetupCode(() => cli(['logs', 'pandanote'])));
  await page.getByLabel('Username', { exact: true }).fill('deployment.owner');
  await page
    .getByLabel('Email', { exact: true })
    .fill('deployment@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Re-enter password', { exact: true }).fill(password);
  await page
    .getByRole('button', { name: 'Create account', exact: true })
    .click();
  await expect(page).toHaveURL(`${origin}/setup/preferences`);
  await page.getByRole('button', { name: 'Finish setup', exact: true }).click();
  await expect(page).toHaveURL(`${origin}/`);
  const response = await page.request.post(`${origin}/api/notes`, {
    headers: { origin },
    data: {
      action: 'create',
      mutationId: randomUUID(),
      content: {
        bodyMarkdown: 'Linux deployment survivor #DEP',
        timelineAt: null,
        location: null,
        attachmentIds: [],
      },
    },
  });
  expect(response.status()).toBe(200);
  for (const spoof of [undefined, '203.0.113.250', '198.51.100.240, invalid']) {
    expect(
      (
        await context.request.post(`${origin}/api/auth/login`, {
          headers: { origin, ...(spoof ? { 'x-forwarded-for': spoof } : {}) },
          data: { username: 'wrong.user', password: 'wrong-password' },
        })
      ).status(),
    ).toBe(401);
  }
  expect(
    inspect(
      `import fs from 'node:fs'; import {createHmac} from 'node:crypto'; import Database from 'better-sqlite3'; const key=Buffer.from(JSON.parse(fs.readFileSync('/data/private/key-material.json','utf8')).totpEncryptionKey,'base64'); const hash=v=>createHmac('sha256',key).update('auth-rate-v1\\0'+v).digest('hex'); const d=new Database('/data/db/pandanote.sqlite',{readonly:true}); const rows=d.prepare('SELECT key_hash,attempts FROM auth_rate_limits').all(); console.log(JSON.stringify({login:rows.filter(r=>r.attempts===3).length,spoof:rows.some(r=>r.key_hash===hash('login:ip:203.0.113.250'))}));`,
    ),
  ).toEqual({ login: 2, spoof: false });
  await context.close();
});

test('DEP-03,04,06: restart/recreation preserve data, idle default shutdown, non-default identity and root refusal', async () => {
  for (const operation of ['restart pandanote', 'down']) {
    compose(operation);
    if (operation === 'down') compose('up -d');
    await ready();
    expect(
      inspect(
        `import Database from 'better-sqlite3';const d=new Database('/data/db/pandanote.sqlite',{readonly:true});console.log(JSON.stringify(d.prepare('SELECT username FROM account').get()));`,
      ),
    ).toEqual({ username: 'deployment.owner' });
  }
  // Measure on the Linux host, excluding the driver's SSH round-trip latency.
  const stopped = compose('stop pandanote', true);
  expect(Number(stopped.match(/DEP_MS=(\d+)/)?.[1])).toBeLessThan(10_000);
  expect(cli(['inspect', 'pandanote', '--format', '{{.State.ExitCode}}'])).toBe(
    '0',
  );
  copy(`ORIGIN=${origin}\nPUID=12345\nPGID=12346\n`, '.env');
  compose('up -d');
  await ready();
  const s = cli([
    'exec',
    '--user',
    '12345:12346',
    'pandanote',
    'node',
    '-e',
    "console.log(require('fs').readFileSync('/proc/1/status','utf8'))",
  ]);
  expect(s).toMatch(/Uid:\s+12345/);
  expect(s).toMatch(/Gid:\s+12346/);
  expect(s).toMatch(/CapEff:\s+0000000000000000/);
  expect(s).toMatch(/CapPrm:\s+0000000000000000/);
  cli(['run', '--rm', '-e', `ORIGIN=${origin}`, '-e', 'PUID=0', image!], 1);
  compose('down');
  copy(`ORIGIN=${origin}\n`, '.env');
  compose('up -d');
  await ready();
});

test('DEP-08: actual >1 GiB archive streams through minimal TLS Caddy, validates and restores', async () => {
  test.setTimeout(1_200_000);
  cli([
    'cp',
    resolve('tests/release/large-restore.ts'),
    'pandanote:/tmp/large-restore.ts',
  ]);
  cli([
    'cp',
    `${edge}:/data/caddy/pki/authorities/local/root.crt`,
    join(temporary, 'root.crt'),
  ]);
  cli(['cp', join(temporary, 'root.crt'), 'pandanote:/tmp/dep-ca.crt']);
  const output = cli(
    [
      'exec',
      '--user',
      '1000:1000',
      '-e',
      `DEP_EDGE=${edge}`,
      '-e',
      `DEP_ORIGIN=${origin}`,
      'pandanote',
      'node',
      '/tmp/large-restore.ts',
    ],
    0,
    1_100_000,
  );
  expect(output).toContain('PASS large archive TLS upload/validate/restore');
  console.log(output);
});

test('DEP-06: default stop interrupts an active backup; restart fails it without exposing a partial archive', async () => {
  // The prior test populated >1 GiB of incompressible referenced files. Initiate
  // another real backup, stop while it runs; default 10 s eventually kills work.
  const result = inspect(
    `import {randomUUID} from 'node:crypto';const origin=${JSON.stringify(origin)}; const login=await fetch('http://localhost:3000/api/auth/login',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({username:'deployment.owner',password:${JSON.stringify(password)}})});const cookie=login.headers.get('set-cookie').split(';')[0];const headers={origin,cookie,'content-type':'application/json'};const f=await fetch('http://localhost:3000/api/auth/fresh',{method:'POST',headers,body:JSON.stringify({scope:'backup-create',password:${JSON.stringify(password)}})});const id=randomUUID();const r=await fetch('http://localhost:3000/api/backups',{method:'POST',headers,body:JSON.stringify({id,grant:(await f.json()).grant})});if(!r.ok)throw Error('backup start');console.log(JSON.stringify({id}));`,
  ) as { id: string };
  // Freeze native work by stopping its process (test fault injection only), so
  // this reliably exercises timeout/crash recovery rather than racing completion.
  cli([
    'exec',
    'pandanote',
    'sh',
    '-c',
    'for p in /proc/[0-9]*; do [ "${p##*/}" = 1 ] && continue; [ "$(cat "$p/comm" 2>/dev/null)" = node ] || continue; case "$(tr "\\0" " " < "$p/cmdline" 2>/dev/null)" in *--input-type*) kill -STOP "${p##*/}" 2>/dev/null || true;; esac; done',
  ]);
  compose('stop pandanote');
  compose('start pandanote');
  await ready();
  expect(
    inspect(
      `import fs from 'node:fs';import Database from 'better-sqlite3';const d=new Database('/data/db/pandanote.sqlite',{readonly:true});console.log(JSON.stringify({state:d.prepare('SELECT state FROM backup_jobs WHERE id=?').get(${JSON.stringify(result.id)}).state,archive:fs.existsSync('/data/backups/'+${JSON.stringify(result.id)}+'.pnb')}));`,
    ),
  ).toEqual({ state: 'failed', archive: false });
});

test('DEP-07: synthetic SQL/data upgrade captures old DB; documented image + copy rollback preserves notes', async () => {
  compose('down');
  cli(['tag', upgrade!, 'pandanote:latest']);
  compose('up -d');
  await ready();
  expect(
    inspect(
      `import fs from 'node:fs';import Database from 'better-sqlite3';const d=new Database('/data/db/pandanote.sqlite',{readonly:true});const old=new Database('/data/pre-upgrade/pandanote.sqlite',{readonly:true});console.log(JSON.stringify({version:d.pragma('user_version',{simple:true}),old:old.pragma('user_version',{simple:true}),notes:d.prepare('SELECT COUNT(*) n FROM notes').get().n,step:d.prepare('SELECT data_step FROM __pandanote_migrations WHERE version=3').get().data_step,manifest:JSON.parse(fs.readFileSync('/data/pre-upgrade/manifest.json','utf8'))}));`,
    ),
  ).toMatchObject({
    version: 3,
    old: 2,
    notes: 2,
    step: 'deployment-proof-v1',
    manifest: { fromSchemaVersion: 2, toSchemaVersion: 3 },
  });
  compose('down');
  shell(
    `cd ${q(root)} && mv data/db data/db.after-upgrade && mkdir data/db && cp data/pre-upgrade/pandanote.sqlite data/db/pandanote.sqlite`,
  );
  cli(['tag', image!, 'pandanote:latest']);
  compose('up -d');
  await ready();
  expect(
    inspect(
      `import Database from 'better-sqlite3';const d=new Database('/data/db/pandanote.sqlite',{readonly:true});console.log(JSON.stringify({version:d.pragma('user_version',{simple:true}),body:d.prepare('SELECT body_markdown FROM notes WHERE body_markdown LIKE ?').get('Linux deployment survivor%').body_markdown}));`,
    ),
  ).toEqual({ version: 2, body: 'Linux deployment survivor #DEP' });
});
