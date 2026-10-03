import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-node';
import { defineConfig } from 'vite';
import type { Adapter } from '@sveltejs/kit';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Adapter 6 removed runtime ORIGIN and otherwise infers HTTPS from Host. Keep
// the domain deployment-configurable while retaining Kit's built-in form CSRF
// check. This narrow generated handoff is pinned/checked, not a node_modules patch.
function runtimeOriginAdapter(): Adapter {
  const node = adapter();
  return {
    ...node,
    async adapt(builder) {
      if (builder.config.paths.origin !== undefined)
        throw new Error('Configure ORIGIN at runtime, not kit.paths.origin');
      await node.adapt(builder);
      const path = resolve('build/adapter-node.js');
      const source = readFileSync(path, 'utf8');
      const marker = 'export const origin = undefined;';
      if (source.split(marker).length !== 2)
        throw new Error(
          'Adapter origin handoff changed; review the installed API',
        );
      writeFileSync(
        path,
        source.replace(
          marker,
          `export const origin = (() => {
  try {
    const value = process.env.ORIGIN;
    if (!value || new URL(value).origin !== value) throw new Error();
    return value;
  } catch {
    throw new Error('Configure a canonical ORIGIN before starting PandaNote');
  }
})();`,
        ),
      );
    },
  };
}

export default defineConfig({
  plugins: [
    sveltekit({
      adapter: runtimeOriginAdapter(),
      csp: {
        directives: {
          'default-src': ['self'],
          'script-src': ['self'],
          'style-src': ['self', 'unsafe-inline'],
          'object-src': ['none'],
          'base-uri': ['self'],
          'frame-ancestors': ['none'],
        },
      },
    }),
  ],
});
