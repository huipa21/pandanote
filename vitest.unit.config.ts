import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

// The Svelte plugin compiles rune modules (`*.svelte.ts`) so the editor workspace
// class can be unit tested without a browser.
export default defineConfig({
  plugins: [svelte()],
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
});
