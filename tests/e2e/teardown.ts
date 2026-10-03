import { readFile, rm } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';

export default async function teardown(): Promise<void> {
  // Playwright runs global teardown BEFORE stopping web servers. Close the
  // test-owned adapter child first so Windows does not hold SQLite files open.
  let pid: number | undefined;
  try {
    pid = Number(await readFile('.e2e-data/server.pid', 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (pid && Number.isInteger(pid)) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
    let stopped = false;
    for (let i = 0; i < 100; i++) {
      try {
        process.kill(pid, 0);
      } catch {
        stopped = true;
        break;
      }
      await setTimeout(100);
    }
    if (!stopped)
      throw new Error('Test-owned app did not stop before fixture cleanup');
  }
  // Fixture-only path, never DATA_DIR from a user's environment.
  await rm('.e2e-data', { recursive: true, force: true, maxRetries: 5 });
}
