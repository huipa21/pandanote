import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

export default ts.config(
  {
    ignores: [
      'node_modules/**',
      '.svelte-kit/**',
      'build/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'data/**',
      '.browser-spike/**',
      '.e2e-data/**',
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs['flat/recommended'],
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  {
    files: ['**/*.svelte'],
    languageOptions: { parserOptions: { parser: ts.parser } },
  },
  {
    files: ['src/app.d.ts'],
    rules: {
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-namespace': 'off',
    },
  },
);
