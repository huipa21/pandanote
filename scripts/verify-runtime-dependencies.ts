import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyRuntimeContract } from './runtime-dependency-contract.ts';

export function verifyRuntimeDependencies(
  root = resolve(import.meta.dirname, '..'),
) {
  const json = (file: string) =>
    JSON.parse(readFileSync(resolve(root, file), 'utf8'));
  verifyRuntimeContract(
    json('package.json'),
    json('ops/runtime/package.json'),
    json('ops/runtime/package-lock.json'),
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    verifyRuntimeDependencies();
    console.log('Runtime dependency manifest/lock contract verified');
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : 'Runtime dependency verification failed',
    );
    process.exitCode = 1;
  }
}
