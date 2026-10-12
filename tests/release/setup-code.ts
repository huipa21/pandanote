import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

// Test-only reader for the one-time setup code (docs/security-hardening/PLAN.md
// SH2.1 log-line contract). The code is printed to stdout after the runtime is
// ready; a restart prints a new one. Nothing here logs the code, the log text or
// the engine output: failures carry only a generic message.

export const SETUP_CODE_LINE =
  /PandaNote setup code: ([A-Z2-9]{5}(?:-[A-Z2-9]{5}){3})/g;

/** Newest setup code in the log text, or null when none was printed yet. */
export function latestSetupCode(logs: string): string | null {
  let code: string | null = null;
  for (const match of logs.matchAll(SETUP_CODE_LINE)) code = match[1];
  return code;
}

/**
 * Polls the container's stdout until a setup code appears. The line is printed
 * after /health is ok, so a short poll covers the gap.
 */
export async function readSetupCode(
  readLogs: () => string | Promise<string>,
  timeoutMs = 60_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const code = latestSetupCode(await readLogs());
    if (code) return code;
    if (Date.now() > deadline)
      throw new Error(
        'No PandaNote setup code line appeared in the container log',
      );
    await delay(500);
  }
}

/**
 * Stdout of the `pandanote` service of a Compose project (drill: `pna`/`pnb`).
 * Uses DOCKER (default docker), like ops/release-drill.sh.
 */
export function composePandanoteStdout(project: string): string {
  const engine = process.env.DOCKER ?? 'docker';
  const ids = spawnSync(
    engine,
    [
      'ps',
      '-aq',
      '--filter',
      `label=com.docker.compose.project=${project}`,
      '--filter',
      'label=com.docker.compose.service=pandanote',
    ],
    { encoding: 'utf8', timeout: 60_000 },
  );
  // Newest container first; the drill recreates nothing between setup and logs.
  const id = ids.stdout.trim().split('\n')[0];
  if (ids.status !== 0 || !id)
    throw new Error(`No pandanote container found for project ${project}`);
  const logs = spawnSync(engine, ['logs', id], {
    encoding: 'utf8',
    timeout: 60_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (logs.status !== 0) throw new Error('Reading container logs failed');
  return logs.stdout;
}
