import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}
const read = (path: string) => readFileSync(path, 'utf8');
const posix = (path: string) => relative('.', path).split(sep).join('/');
const lines = (text: string) => text.split(/\r?\n/);

// Every shipped HTTP surface needs a conscious update to this security review.
const EXPECTED_ROUTES = [
  'api/attachments/[attachmentId]/[variant]',
  'api/auth/fresh',
  'api/auth/login',
  'api/auth/logout',
  'api/auth/mfa',
  'api/auth/security',
  'api/auth/account',
  'api/setup/account',
  'api/setup/preferences',
  'api/backups',
  'api/backups/[backupId]',
  'api/backups/[backupId]/download',
  'api/calendar',
  'api/notes',
  'api/notes/[noteId]',
  'api/notes/[noteId]/actions',
  'api/notes/status',
  'api/restores',
  'api/restores/confirm',
  'api/settings/appearance',
  'api/settings/calendar',
  'api/settings/general',
  'api/settings/storage',
  'api/settings/storage/cleanup',
  'api/tags',
  'api/tags/check',
  'api/tags/preview',
  'api/uploads',
  'api/uploads/[batchId]',
  'api/uploads/[batchId]/[attachmentId]',
  'health',
];

describe('production surface hygiene', () => {
  it('ships exactly the reviewed endpoints and pages, no debug/test route', () => {
    const routes = files('src/routes').map(posix);
    const named = (suffix: string) =>
      routes
        .filter((p) => p.endsWith(suffix))
        .map((p) => p.slice('src/routes/'.length, -suffix.length))
        .sort();
    expect(named('/+server.ts')).toEqual([...EXPECTED_ROUTES].sort());
    expect(named('/+page.svelte')).toEqual([
      '(app)',
      '(app)/drafts',
      '(app)/notes/[noteId]',
      '(app)/settings',
      '(app)/tags',
      '(app)/trash',
      'login',
      'setup',
      'setup/preferences',
    ]);
  });

  it('application source has no dev credentials, test imports, debug logging or unreviewed environment', () => {
    // Legacy values are read only to scrub/ignore them, never as configuration.
    const allowedEnv = new Set([
      'DATA_DIR',
      'DISK_RESERVE_BYTES',
      'NODE_ENV',
      'ORIGIN',
      'ADDRESS_HEADER',
      'HOST_HEADER',
      'PROTOCOL_HEADER',
      'PORT_HEADER',
      'SETUP_TOKEN',
      'TRUSTED_PROXY_IPS',
    ]);
    for (const path of files('src')) {
      const text = read(path);
      expect(text, path).not.toMatch(/from ['"][^'"]*\/tests\//);
      expect(text, path).not.toMatch(/console\.(log|debug|trace)\(/);
      expect(text, path).not.toMatch(/(?:admin|demo|test)@|password123/i);
      for (const match of text.matchAll(/process\.env\.([A-Z_]+)/g))
        expect(allowedEnv.has(match[1]), `${path}: ${match[1]}`).toBe(true);
    }
  });
});

describe('current documentation contracts (DOC-01–03)', () => {
  const documents = [
    'README.md',
    'AGENTS.md',
    ...['docs', 'ops', 'migrations', 'tests'].flatMap(files),
  ].filter((path) => path.endsWith('.md'));

  it('removes obsolete operator guidance outside preserved PROGRESS history', () => {
    const removed = [
      'SETUP_TOKEN',
      'TRUSTED_PROXY_IPS',
      'db:migrate',
      'auth:setup-token',
      'auth:recover',
      'compose.yaml',
      'ops/compose.external.yaml',
    ];
    for (const path of documents) {
      if (path.endsWith('PROGRESS.md')) continue;
      const text = read(path);
      for (const name of removed)
        expect(text, `${path}: ${name}`).not.toContain(name);
      expect(text, path).not.toMatch(/ops\/[\w.-]*env\.example/);
    }
    // Negative assertions and the deliberate legacy environment scrub code are
    // required security tests, not supported deployment configuration.
  });

  it('resolves local Markdown links and pins the canonical install/recovery flow', () => {
    for (const path of documents) {
      const prose = read(path)
        .replace(/^```[^\n]*\n[\s\S]*?^```/gm, '')
        .replace(/`[^`\n]*`/g, '');
      for (const match of prose.matchAll(
        /!?\[[^\]\n]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
      )) {
        const href = match[1];
        if (/^(?:[a-z][a-z\d+.-]*:|#)/i.test(href)) continue;
        const target = decodeURIComponent(href.split('#')[0]);
        expect(
          existsSync(resolve(dirname(path), target)),
          `${path}: ${href}`,
        ).toBe(true);
      }
    }
    const guide = read('ops/DEPLOYMENT.md');
    for (const command of [
      'npm run image:build -- --platform linux/amd64',
      'docker image save -o pandanote-image.tar pandanote:latest',
      'podman save --format docker-archive -o pandanote-image.tar localhost/pandanote:latest',
      'docker tag localhost/pandanote:latest pandanote:latest',
      'cp .env.example .env',
      'docker compose up -d',
      'reverse_proxy pandanote:3000',
      'docker compose run --rm pandanote reset-password',
      'docker compose run --rm pandanote reindex',
      'sudo cp data/pre-upgrade/pandanote.sqlite data/db/pandanote.sqlite',
    ])
      expect(guide, command).toContain(command);
    expect(guide).toContain('First visitor owns an empty instance');
    expect(guide).toContain('60 minutes');
    expect(guide).toContain('8–128');
    expect(guide).toContain('not a single atomic directory exchange');
    expect(read('docs/simplify-setup/OPERATIONS.md')).toContain(
      '../../ops/DEPLOYMENT.md',
    );
    const scripts = JSON.parse(read('package.json')).scripts as Record<
      string,
      string
    >;
    expect(scripts['reset-password']).toContain('scripts/reset-password.ts');
    expect(scripts['search:reindex']).toContain('scripts/reindex.ts');
    for (const removed of ['db:migrate', 'auth:setup-token', 'auth:recover'])
      expect(scripts).not.toHaveProperty(removed);
  });
});

describe('deployment artifacts', () => {
  const docker = read('ops/Dockerfile');
  const compose = read('docker-compose.yml');
  const ignore = lines(read('.dockerignore'));

  it('image is pinned, drops bootstrap root privileges and omits tests/docs/dev dependencies/secrets', () => {
    expect(docker).toContain(
      'node:24.21.0-alpine3.23@sha256:9ec4a2e289874ed0d722e1772ec2de45d2801541db8612f3638b26f128c69ac2',
    );
    expect(docker).toMatch(/^USER root$/m);
    expect(docker).toContain(
      'ENTRYPOINT ["node", "scripts/container-entry.ts"]',
    );
    const entry = read('scripts/container-entry.ts');
    expect(entry.indexOf('becomeContainerUser(')).toBeLessThan(
      entry.indexOf('await bootstrapContainer('),
    );
    expect(entry).toContain('ignoreLegacyEnvironment(process.env)');
    expect(read('src/lib/server/initialize.ts')).toContain(
      'delete env.SETUP_TOKEN',
    );
    expect(entry).toContain('process.execve(');
    const user = read('scripts/container-user.ts');
    expect(user).toContain('process.setuid(identity.uid)');
    expect(user).toContain('process.setgroups!([])');
    expect(docker).toContain('npm ci --omit=dev --omit=peer');
    expect(docker).not.toContain('--omit=optional');
    expect(docker).toContain(
      'COPY ops/runtime/package.json ops/runtime/package-lock.json .npmrc ./',
    );
    expect(
      docker.indexOf("find node_modules -type f -name '*.map' -delete"),
    ).toBeLessThan(docker.indexOf('AS runtime'));
    expect(JSON.parse(read('package.json')).scripts.build).toContain(
      'verify-runtime-dependencies.ts',
    );
    expect(docker).not.toMatch(/NODE_TLS_REJECT_UNAUTHORIZED|strict-ssl/i);
    const runtime = docker.slice(docker.indexOf('AS runtime'));
    const copies = lines(runtime).filter(
      (line) => line.startsWith('COPY ') && !line.includes('--from'),
    );
    expect(copies.length).toBeGreaterThan(0);
    for (const forbidden of ['tests', 'docs', '.env', 'ops/', 'playwright'])
      for (const line of copies) expect(line).not.toContain(forbidden);
    expect(runtime).toMatch(/DATA_DIR=\/data/);
    expect(runtime).toContain('BODY_SIZE_LIMIT=64G');
    expect(runtime).toContain('HEALTHCHECK');
    expect(runtime).toContain('scripts/reset-password.ts scripts/reindex.ts');
    expect(runtime).not.toMatch(
      /apt-get|python3|g\+\+|apk add.*(?:make|git|gcompat)/,
    );
    expect(runtime).toContain('apk add --no-cache ca-certificates libstdc++');
    for (const stage of ['build', 'production-deps']) {
      const install = docker.split(`AS ${stage}\n`)[1].split('\nFROM ')[0];
      expect(install).toContain(
        'apk add --no-cache ca-certificates python3 make g++',
      );
      expect(install.indexOf('apk add')).toBeLessThan(
        install.indexOf('npm ci'),
      );
    }
    for (const secret of ['.env', 'data/', '*.pnb', '*.sqlite', 'backups/'])
      expect(ignore, secret).not.toContain(`!${secret}`);
    expect(ignore[1]).toBe('**');
    expect(ignore).toContain('!docker-compose.yml');
    expect(lines(read('.gitignore'))).toContain('/data/');
  });

  it('ships exactly one minimal Compose and one env template with only ORIGIN required', () => {
    expect(compose.trim()).toBe(`services:
  pandanote:
    image: \${PANDANOTE_IMAGE:-pandanote:latest}
    container_name: pandanote
    restart: unless-stopped
    env_file: .env
    volumes:
      - \${DATA_PATH:-./data}:/data
    networks:
      - proxynet

networks:
  proxynet:
    external: true # the Docker network your Caddy container is on`);
    expect(compose).not.toMatch(
      /read_only|tmpfs|cap_drop|cap_add|security_opt|init:|stop_grace_period|healthcheck|logging|ipv4_address|ports:|profiles:|build:/,
    );
    const root = readdirSync('.');
    expect(root.filter((p) => /compose.*\.ya?ml$/.test(p))).toEqual([
      'docker-compose.yml',
    ]);
    expect(root.filter((p) => /env\.example$/.test(p))).toEqual([
      '.env.example',
    ]);
    const ops = files('ops').map(posix);
    expect(
      ops.filter((p) => /compose.*\.ya?ml$|env\.example$|Caddyfile$/.test(p)),
    ).toEqual([]);
    for (const removed of [
      'compose.yaml',
      'ops/compose.external.yaml',
      'ops/external.env.example',
      'ops/production.env.example',
      'ops/Caddyfile',
    ])
      expect(existsSync(removed), removed).toBe(false);
    const env = read('.env.example');
    expect(lines(env).filter((l) => /^[A-Z_]+=/.test(l))).toEqual([
      'ORIGIN=https://notes.example.com',
    ]);
    for (const path of [
      'docker-compose.yml',
      '.env.example',
      'ops/Dockerfile',
      'ops/release-drill.sh',
      'ops/release-benchmark.sh',
    ])
      expect(read(path), path).not.toMatch(/SETUP_TOKEN|TRUSTED_PROXY_IPS/);
  });

  it('Caddy and two-domain deployments are test-only and exercise default forwarding/body limits', () => {
    const drill = read('tests/release/compose.drill.yaml');
    expect(drill).toContain('docker.io/library/caddy:2.11.6-alpine');
    expect(drill).not.toMatch(
      /ipv4_address|subnet:|profiles:|SETUP_TOKEN|TRUSTED_PROXY_IPS/,
    );
    expect(read('tests/release/Caddyfile')).toContain(
      'reverse_proxy pandanote:3000',
    );
    expect(read('tests/release/Caddyfile')).not.toMatch(
      /header_up|request_body|request_buffers|health_uri|timeout|tls_insecure_skip_verify/,
    );
    for (const script of ['ops/release-drill.sh', 'ops/release-benchmark.sh']) {
      expect(read(script)).toContain('-f tests/release/compose.drill.yaml');
      expect(read(script)).not.toMatch(/setup-token|scripts\/migrate|\.token/);
    }
  });
});
