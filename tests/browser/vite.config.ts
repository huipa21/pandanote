import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export const probeCsp = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' ws://127.0.0.1:4174",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

// Separate browser-only fixture server: never included in the application build.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [svelte()],
  server: {
    headers: {
      'Content-Security-Policy': probeCsp,
      'X-Content-Type-Options': 'nosniff',
    },
    fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] },
  },
});
