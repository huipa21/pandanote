// Execute the real shared initializer in a separate Node process without a
// test-only production CLI. Log only its deliberately safe startup message.
export const startupArgs = [
  '--input-type=module',
  '-e',
  `import { initializeApplication } from './src/lib/server/initialize.ts';
   try { await initializeApplication(); console.info('Private storage ready. No account was created.'); }
   catch (error) { console.error(error.message); process.exitCode = 1; }`,
];
