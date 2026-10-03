import { rm } from 'node:fs/promises';

export default async function teardown(): Promise<void> {
  // Fixture-only path, never DATA_DIR from a user's environment.
  await rm('.e2e-data', { recursive: true, force: true, maxRetries: 5 });
}
