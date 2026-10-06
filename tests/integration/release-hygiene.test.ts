import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
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

// Every shipped HTTP surface is listed deliberately. A debug/dev/fixture route can
// only appear after a conscious update to this security review list.
const EXPECTED_ROUTES = [
  'api/attachments/[attachmentId]/[variant]',
  'api/auth/fresh',
  'api/auth/login',
  'api/auth/logout',
  'api/auth/mfa',
  'api/auth/security',
  'api/auth/setup',
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
    ]);
  });

  it('application source has no dev credentials, test imports, debug logging or unreviewed environment', () => {
    const allowedEnv = new Set([
      'DATA_DIR',
      'DISK_RESERVE_BYTES',
      'NODE_ENV',
      'ORIGIN',
      'ADDRESS_HEADER',
      'HOST_HEADER',
      'PROTOCOL_HEADER',
      'PORT_HEADER',
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

describe('deployment artifacts', () => {
  const docker = read('ops/Dockerfile');
  const compose = read('compose.yaml');
  const caddy = read('ops/Caddyfile');
  const ignore = lines(read('.dockerignore'));

  it('image is pinned, non-root and omits tests/docs/dev dependencies/secrets', () => {
    expect(docker).toMatch(/node:24\.21\.0-bookworm-slim@sha256:[0-9a-f]{64}/);
    expect(docker).toMatch(/^USER node$/m);
    expect(docker).toMatch(/npm ci --omit=dev/);
    expect(docker).not.toMatch(/NODE_TLS_REJECT_UNAUTHORIZED|strict-ssl/i);
    const runtime = docker.slice(docker.indexOf('AS runtime'));
    const copies = lines(runtime).filter(
      (line) => line.startsWith('COPY ') && !line.includes('--from'),
    );
    expect(copies.length).toBeGreaterThan(0);
    for (const forbidden of ['tests', 'docs', '.env', 'ops/', 'playwright'])
      for (const line of copies) expect(line).not.toContain(forbidden);
    expect(runtime).toMatch(/DATA_DIR=\/data/);
    for (const secret of ['.env', 'data/', '*.pnb', '*.sqlite', 'backups/'])
      expect(ignore, secret).not.toContain(`!${secret}`);
    expect(ignore[1]).toBe('**'); // allowlist, not denylist
  });

  it('compose has one app writer, no published app port, private persistent data and configurable domain', () => {
    expect(compose).toMatch(/ORIGIN: \$\{ORIGIN:\?/);
    expect(compose).toMatch(/DOMAIN: \$\{DOMAIN:\?/);
    expect(compose).not.toMatch(/(ORIGIN|DOMAIN): ['"]?https?:/);
    const app = compose.slice(
      compose.indexOf('\n  app:'),
      compose.indexOf('\n  # One-shot'),
    );
    expect(app).not.toMatch(/^\s+ports:/m);
    expect(app).toMatch(/restart: unless-stopped/);
    expect(app).toMatch(/stop_grace_period/);
    expect(compose).toMatch(/read_only: true/);
    expect(compose).toMatch(/cap_drop: \[ALL\]/);
    expect(compose).toMatch(/no-new-privileges/);
    expect(compose).not.toMatch(/replicas|scale:/);
    // Operator tasks never start with the public stack and have no network.
    for (const task of ['migrate', 'setup-token', 'recover-auth', 'reindex']) {
      const start = compose.indexOf(`\n  ${task}:`);
      expect(start, task).toBeGreaterThan(0);
      const block = compose.slice(start + 1).split(/\n {2}\S/)[0];
      expect(block).toContain('profiles: [ops]');
      expect(block).toContain('network_mode: none');
    }
  });

  it('reverse proxy overwrites the forwarded address, streams bodies and uses HTTPS defaults', () => {
    expect(caddy).toMatch(/header_up X-Forwarded-For \{remote_host\}/);
    expect(caddy).toMatch(/flush_interval -1/);
    expect(caddy).toMatch(/request_body/);
    expect(caddy).not.toMatch(
      /request_buffers|tls_insecure_skip_verify|http:\/\//,
    );
    expect(caddy).toMatch(/^\{\$DOMAIN\}/m);
    expect(caddy).toMatch(/Strict-Transport-Security/);
  });
});
