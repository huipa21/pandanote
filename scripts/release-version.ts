import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  releaseBuildInfo,
  type ReleaseBuildInfo,
} from '../src/lib/shared/build-info.ts';

export function git(cwd: string, args: string[]): string {
  const result = spawnSync('git', ['--no-replace-objects', ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' },
  });
  if (result.error || result.status !== 0)
    throw new Error(
      'Git command failed; use a complete PandaNote Git checkout',
    );
  return result.stdout.trim();
}

export function assertCleanCheckout(cwd: string, commit?: string): string {
  if (git(cwd, ['rev-parse', '--is-shallow-repository']) !== 'false')
    throw new Error(
      'Shallow Git history cannot determine a release sequence; fetch complete history',
    );
  if (git(cwd, ['status', '--porcelain=v1', '--untracked-files=all']))
    throw new Error(
      'Dirty working tree: commit or remove staged, unstaged and non-ignored untracked changes before building a release',
    );
  const head = git(cwd, ['rev-parse', 'HEAD']);
  if (commit && head !== commit)
    throw new Error(
      'HEAD changed while preparing the release; retry from a stable clean checkout',
    );
  return head;
}

export function deriveRelease(cwd: string): ReleaseBuildInfo {
  const commit = assertCleanCheckout(cwd);
  // Anchored to this hash, not a branch or a date-pruned Git traversal. Old commits
  // with non-monotonic timestamps must still be counted if their UTC date matches.
  const times = git(cwd, [
    'log',
    '--first-parent',
    '--format=%ct',
    commit,
  ]).split(/\r?\n/);
  const instants = times.map((value) => {
    if (!/^\d+$/.test(value))
      throw new Error('Invalid Git committer timestamp');
    const seconds = Number(value);
    if (!Number.isSafeInteger(seconds))
      throw new Error('Invalid Git committer timestamp');
    return new Date(seconds * 1000).toISOString();
  });
  const committedAt = instants[0];
  const day = committedAt.slice(0, 10);
  const sequence = instants.filter(
    (instant) => instant.slice(0, 10) === day,
  ).length;
  return releaseBuildInfo(
    `${day.slice(2).replaceAll('-', '')}-${sequence}`,
    commit,
    committedAt,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const info = deriveRelease(resolve(import.meta.dirname, '..'));
    console.log(JSON.stringify(info, null, 2));
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : 'Could not determine release metadata',
    );
    process.exitCode = 1;
  }
}
