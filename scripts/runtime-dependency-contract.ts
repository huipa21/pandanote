// Reviewed packaging roots: source startup/maintenance + generated SSR + deferred
// workers. Browser-only Mermaid/DOMPurify are bundled by the full build install.
export const runtimeRoots = {
  '@js-temporal/polyfill':
    'Shared timezone/date contracts used by SSR and source tools',
  '@sveltejs/kit':
    'Generated server API/internal/node exports and source hooks',
  argon2: 'Configured native password hashing, including interactive reset',
  'better-sqlite3':
    'SQLite startup, live services, snapshot/trust subprocesses',
  'drizzle-orm': 'Source migrations/schema/services and generated SSR',
  otplib: 'TOTP enrollment, verification and recovery-auth flows',
  qrcode: 'Server enrollment QR matrix',
  'rehype-sanitize': 'Shared safe Markdown rendering',
  'rehype-stringify': 'Shared Markdown HTML serialization',
  'remark-gfm': 'Shared parsing/rendering/tag source spans',
  'remark-parse': 'Shared Markdown parser',
  'remark-rehype': 'Shared Markdown-to-HAST conversion',
  sharp: 'Deferred createRequire image worker and archive trust worker',
  shiki: 'Deferred SSR highlighting, web grammars and JS engine',
  svelte: 'Explicit Kit runtime peer and generated SSR exports',
  'tar-stream': 'Streaming private archive creation/validation',
  unified: 'Shared Markdown pipeline',
  zod: 'Source/server runtime validation',
} as const;

export const forbiddenRuntimePackages = [
  'mermaid',
  'dompurify',
  '@sveltejs/adapter-node',
  'vite',
  '@sveltejs/vite-plugin-svelte',
  'typescript',
  'rolldown',
  'esbuild',
  'lightningcss',
  'vitest',
  '@playwright/test',
  'drizzle-kit',
  'tsx',
] as const;
interface Manifest {
  name?: string;
  version?: string;
  private?: boolean;
  type?: string;
  engines?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  workspaces?: unknown;
  overrides?: Record<string, unknown>;
}
interface LockEntry {
  version?: string;
  integrity?: string;
  resolved?: string;
  link?: boolean;
  dependencies?: Record<string, string>;
  engines?: Record<string, string>;
}
interface Lock {
  lockfileVersion?: number;
  packages?: Record<string, LockEntry>;
}
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
export function verifyRuntimeContract(
  main: Manifest,
  runtime: Manifest,
  lock: Lock,
): void {
  const fail = (reason: string): never => {
    throw new Error(`Runtime dependency contract: ${reason}`);
  };
  const expected = Object.keys(runtimeRoots).sort();
  if (!equal(Object.keys(runtime.dependencies ?? {}).sort(), expected))
    fail(
      'missing or unexpected runtime root (review scripts/runtime-dependency-contract.ts)',
    );
  if (runtime.devDependencies || runtime.scripts || runtime.workspaces)
    fail(
      'runtime manifest must have no dev dependencies, scripts or workspaces',
    );
  if (runtime.private !== true || runtime.type !== 'module')
    fail('staging manifest must be private ESM');
  if (!equal(runtime.engines, main.engines)) fail('engine requirements drift');
  for (const name of expected) {
    const version = runtime.dependencies![name];
    if (
      !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version) ||
      main.dependencies?.[name] !== version
    )
      fail(`exact root version drift: ${name}`);
  }
  if (lock.lockfileVersion !== 3 || !lock.packages?.[''])
    fail('expected npm lockfile v3');
  const root = lock.packages![''];
  if (
    !equal(root.dependencies, runtime.dependencies) ||
    !equal(root.engines, runtime.engines) ||
    root.version !== runtime.version
  )
    fail('stale runtime lock root; regenerate explicitly');
  for (const name of expected)
    if (
      lock.packages![`node_modules/${name}`]?.version !==
      runtime.dependencies![name]
    )
      fail(`stale locked root: ${name}`);
  for (const [name, entry] of Object.entries(lock.packages!)) {
    if (!name) continue;
    if (
      entry.link ||
      !entry.integrity?.startsWith('sha512-') ||
      !entry.resolved?.startsWith('https://registry.npmjs.org/')
    )
      fail('runtime lock must use integrity-pinned registry packages');
  }
  // Only copy root overrides whose package actually occurs in this graph. A new
  // applicable override cannot be silently lost when maintaining the two locks.
  const applicable = Object.fromEntries(
    Object.entries(main.overrides ?? {}).filter(([name]) =>
      Object.keys(lock.packages!).some(
        (path) =>
          path.endsWith(`/node_modules/${name}`) ||
          path === `node_modules/${name}`,
      ),
    ),
  );
  if (!equal(runtime.overrides ?? {}, applicable))
    fail('applicable root overrides drift');
}
