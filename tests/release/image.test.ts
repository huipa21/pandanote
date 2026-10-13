import { spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { readSetupCode } from './setup-code.ts';

// Explicit external-image gate, synthetic anonymous volume only. No fixed aliases.
const engine = process.env.IMAGE_ENGINE ?? 'docker';
const image = process.env.IMAGE_UNDER_TEST;
const app = `pn-image-${randomUUID()}`;
let created = false;
function cli(args: string[], expected = 0): string {
  const result = spawnSync(engine, args, {
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  // Never emit captured request credentials/native causes into test diagnostics.
  if (result.status !== expected)
    throw new Error(
      `Image gate ${args[0]} failed (exit ${result.status}, expected ${expected})`,
    );
  return result.stdout.trim();
}
function execute(source: string): string {
  return cli([
    'exec',
    '--user',
    '1000:1000',
    app,
    'node',
    '--input-type=module',
    '-e',
    source,
  ]);
}
function request(
  path: string,
  data?: unknown,
  cookie = '',
): { status: number; cookie?: string; body: Record<string, unknown> } {
  return JSON.parse(
    execute(
      `const origin='http://localhost:3000';const r=await fetch(origin+${JSON.stringify(path)},{method:${JSON.stringify(data === undefined ? 'GET' : 'POST')},headers:{origin,cookie:${JSON.stringify(cookie)},'content-type':'application/json'},${data === undefined ? '' : `body:${JSON.stringify(JSON.stringify(data))},`}});const text=await r.text();let body;try{body=JSON.parse(text)}catch{body={health:text}}console.log(JSON.stringify({status:r.status,cookie:r.headers.get('set-cookie')?.split(';')[0],body}));`,
    ),
  );
}
const digest = (text: string) =>
  createHash('sha256').update(text).digest('hex');
test.beforeAll(async () => {
  if (!image)
    throw new Error(
      'IMAGE_UNDER_TEST is required; missing final image is blocked, not skipped',
    );
  cli([
    'run',
    '-d',
    '--name',
    app,
    '-e',
    'ORIGIN=http://localhost:3000',
    image,
  ]);
  created = true;
  await expect
    .poll(
      () => {
        const result = spawnSync(engine, [
          'exec',
          app,
          'node',
          '-e',
          "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))",
        ]);
        return result.status;
      },
      { timeout: 90_000 },
    )
    .toBe(0);
});
test.afterAll(() => {
  if (created) cli(['rm', '-f', '-v', app]);
});
test('IMG: pristine production inventory, deferred natives/highlighting and missing-module negative control', async () => {
  test.setTimeout(180_000);
  expect(
    execute(
      `import fs from 'node:fs';for(const p of ['tests','docs','.git','.env','package-lock.json','ops'])if(fs.existsSync('/app/'+p))throw Error('private inventory');console.log('PASS pristine inventory');`,
    ),
  ).toContain('PASS');
  cli(['exec', app, 'mkdir', '-p', '/app/tests/release']);
  for (const file of [
    'tests/release/native-probe.ts',
    'tests/release/image-probe.ts',
    'scripts/runtime-dependency-contract.ts',
  ])
    cli(['cp', resolve(file), `${app}:/app/${file}`]);
  expect(
    cli([
      'exec',
      '--user',
      '1000:1000',
      app,
      'node',
      'tests/release/native-probe.ts',
    ]),
  ).toContain('PASS native');
  const result = JSON.parse(
    cli([
      'exec',
      '--user',
      '1000:1000',
      app,
      'node',
      'tests/release/image-probe.ts',
    ]),
  );
  expect(result.result).toContain('PASS final minimized');
  const labels = JSON.parse(
    cli(['image', 'inspect', image!, '--format', '{{json .Config.Labels}}']),
  );
  expect(result.identity.version).toBe(
    labels['org.opencontainers.image.version'],
  );
  expect(result.identity.commit).toBe(
    labels['org.opencontainers.image.revision'],
  );
  expect(result.identity.committedAt).toBe(
    labels['org.opencontainers.image.created'],
  );
  // Modify only a disposable container layer. The pristine supplied image survives.
  cli(
    [
      'run',
      '--rm',
      '--entrypoint',
      'node',
      image!,
      '-e',
      "require('fs').renameSync('node_modules/shiki','node_modules/missing-shiki');require.resolve('shiki')",
    ],
    1,
  );
});

test('IMG: real live PTY reset, immediate revocation/MFA reset and stopped source reindex', async () => {
  test.setTimeout(240_000);
  const password = 'synthetic-image-password';
  const next = 'synthetic-new-password ✓';
  // The code is read from the container's own log, as an operator would.
  const setupCode = await readSetupCode(() => cli(['logs', app]));
  const setup = request('/api/setup/account', {
    username: 'image.owner',
    email: 'image@example.invalid',
    password,
    passwordConfirm: password,
    setupCode,
  });
  expect(setup.status).toBe(200);
  let cookie = setup.cookie!;
  expect(
    request(
      '/api/setup/preferences',
      { siteTitle: 'Synthetic image', language: 'en', timezone: 'Asia/Tokyo' },
      cookie,
    ).status,
  ).toBe(200);
  const grant = request(
    '/api/auth/fresh',
    { scope: 'mfa-enroll', password },
    cookie,
  ).body.grant;
  const enrollment = request(
    '/api/auth/security',
    { action: 'enroll', grant },
    cookie,
  ).body.enrollment as { secret: string; challenge: string };
  const { generateSync } = await import('otplib');
  const confirmed = request(
    '/api/auth/security',
    {
      action: 'confirm',
      challenge: enrollment.challenge,
      code: generateSync({ secret: enrollment.secret }),
    },
    cookie,
  );
  expect(confirmed.status).toBe(200);
  cookie = confirmed.cookie!;
  const saved = request(
    '/api/notes',
    {
      action: 'create',
      mutationId: randomUUID(),
      content: {
        bodyMarkdown: '香港 数据库 図書館 reset survivor #Image',
        timelineAt: null,
        attachmentIds: [],
      },
    },
    cookie,
  );
  expect(saved.status).toBe(200);
  const note = saved.body.data as { noteId: string };
  const before = request('/api/notes/' + note.noteId, undefined, cookie).body
    .data;
  const keyHash = execute(
    "import fs from 'node:fs';import {createHash} from 'node:crypto';console.log(createHash('sha256').update(fs.readFileSync('/data/private/key-material.json')).digest('hex'));",
  );
  const client = process.env.IMAGE_PTY_CLIENT_JSON
    ? (JSON.parse(process.env.IMAGE_PTY_CLIENT_JSON) as string[])
    : [engine];
  const args = [
    ...client,
    'run',
    '--rm',
    '-it',
    '--volumes-from',
    app,
    '-e',
    'ORIGIN=http://localhost:3000',
    image!,
    'reset-password',
  ];
  const python = `import os,pty,subprocess,select,time,errno\nm,s=pty.openpty()\np=subprocess.Popen(${JSON.stringify(args)},stdin=s,stdout=s,stderr=s,close_fds=True)\nos.close(s)\nout=b''\ndef wait(text):\n global out\n end=time.monotonic()+60\n while text not in out:\n  if time.monotonic()>end: raise Exception('prompt timeout')\n  ready,_,_=select.select([m],[],[],0.1)\n  if ready: out+=os.read(m,65536)\nwait(b'New password: ')\nos.write(m,${JSON.stringify(next)}.encode()+b'\\r')\nwait(b'Re-enter password: ')\nos.write(m,${JSON.stringify(next)}.encode()+b'\\r')\nwhile p.poll() is None:\n ready,_,_=select.select([m],[],[],0.1)\n if ready:\n  try: out+=os.read(m,65536)\n  except OSError as e:\n   if e.errno!=errno.EIO: raise\nassert p.wait()==0\nassert ${JSON.stringify(next)}.encode() not in out\nassert b'all sessions revoked' in out\nos.close(m)\nprint('PASS PTY no echo')`;
  const q = (text: string) => `'${text.replaceAll("'", "'\\''")}'`;
  const command = `python3 -c ${q(python)}`;
  const terminal =
    process.env.IMAGE_REMOTE === 'podman-machine'
      ? spawnSync(engine, ['machine', 'ssh', command], {
          encoding: 'utf8',
          timeout: 120_000,
        })
      : spawnSync('sh', ['-c', command], {
          encoding: 'utf8',
          timeout: 120_000,
        });
  if (terminal.status !== 0)
    throw new Error(
      'Real PTY image reset failed; prerequisite/behavior blocker',
    );
  expect(terminal.stdout).toContain('PASS PTY');
  expect(request('/api/notes', undefined, cookie).status).toBe(401);
  const login = request('/api/auth/login', {
    username: 'image.owner',
    password: next,
  });
  expect(login.status).toBe(200);
  expect(login.body).toEqual({ ok: true });
  expect(
    request('/api/auth/login', { username: 'image.owner', password }).status,
  ).toBe(401);
  cookie = login.cookie!;
  expect(
    digest(
      JSON.stringify(
        request('/api/notes/' + note.noteId, undefined, cookie).body.data,
      ),
    ),
  ).toBe(digest(JSON.stringify(before)));
  expect(
    execute(
      "import fs from 'node:fs';import {createHash} from 'node:crypto';console.log(createHash('sha256').update(fs.readFileSync('/data/private/key-material.json')).digest('hex'));",
    ),
  ).toBe(keyHash);
  const search = request(
    '/api/notes?q=%E9%A6%99%E6%B8%AF',
    undefined,
    cookie,
  ).body;
  cli(
    [
      'run',
      '--rm',
      '--volumes-from',
      app,
      '-e',
      'ORIGIN=http://localhost:3000',
      image!,
      'reset-password',
    ],
    1,
  );
  cli(
    [
      'run',
      '--rm',
      '--volumes-from',
      app,
      '-e',
      'ORIGIN=http://localhost:3000',
      image!,
      'reset-password',
      'unsafe-argument',
    ],
    1,
  );
  cli(['stop', app]);
  expect(cli(['inspect', app, '--format', '{{.State.ExitCode}}'])).toBe('0');
  cli([
    'run',
    '--rm',
    '--volumes-from',
    app,
    '-e',
    'ORIGIN=http://localhost:3000',
    image!,
    'reindex',
  ]);
  cli(['start', app]);
  await expect
    .poll(
      () => {
        try {
          return request('/health').status;
        } catch {
          return 0;
        }
      },
      { timeout: 60_000 },
    )
    .toBe(200);
  expect(
    request('/api/notes?q=%E9%A6%99%E6%B8%AF', undefined, cookie).body,
  ).toEqual(search);
});
