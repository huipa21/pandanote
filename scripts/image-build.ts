import { spawnSync } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertCleanCheckout, deriveRelease, git } from './release-version.ts';
import type { ReleaseBuildInfo } from '../src/lib/shared/build-info.ts';

export interface ImageBuildOptions {
  engine: 'docker' | 'podman';
  platform: 'linux/amd64' | 'linux/arm64';
}
export function imageBuildOptions(args: string[]): ImageBuildOptions {
  const options: ImageBuildOptions = {
    engine: 'docker',
    platform: 'linux/amd64',
  };
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    if (seen.has(key)) throw new Error(`Duplicate image build option: ${key}`);
    seen.add(key);
    if (key === '--engine' && (value === 'docker' || value === 'podman'))
      options.engine = value;
    else if (
      key === '--platform' &&
      (value === 'linux/amd64' || value === 'linux/arm64')
    )
      options.platform = value;
    else
      throw new Error(
        'Usage: npm run image:build -- [--platform linux/amd64|linux/arm64] [--engine docker|podman]',
      );
  }
  return options;
}

type EngineRunner = (
  engine: string,
  args: string[],
  input: number,
  cwd: string,
) => void;
const runEngine: EngineRunner = (engine, args, input, cwd) => {
  const result = spawnSync(engine, args, {
    cwd,
    stdio: [input, 'inherit', 'inherit'],
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `${engine} image build failed${result.status === null ? '' : ` (exit ${result.status})`}`,
    );
};

export function buildImage(
  cwd: string,
  options: ImageBuildOptions,
  run: EngineRunner = runEngine,
): ReleaseBuildInfo {
  const info = deriveRelease(cwd);
  if (
    git(cwd, ['ls-tree', '-r', info.commit])
      .split(/\r?\n/)
      .some((line) => line.startsWith('160000 '))
  )
    throw new Error('Release archives do not support Git submodules');
  const temporary = mkdtempSync(join(tmpdir(), 'pandanote-image-'));
  let input: number | undefined;
  try {
    const archive = join(temporary, 'source.tar');
    git(cwd, ['archive', '--format=tar', `--output=${archive}`, info.commit]);
    assertCleanCheckout(cwd, info.commit);
    input = openSync(archive, 'r');
    console.log(
      `Building pandanote:${info.version} (${info.commit}) for ${options.platform}`,
    );
    run(
      options.engine,
      [
        'build',
        ...(options.engine === 'podman' ? ['--format', 'docker'] : []),
        '--platform',
        options.platform,
        '-f',
        'ops/Dockerfile',
        '-t',
        `pandanote:${info.version}`,
        '--build-arg',
        `PANDANOTE_VERSION=${info.version}`,
        '--build-arg',
        `PANDANOTE_COMMIT=${info.commit}`,
        '--build-arg',
        `PANDANOTE_COMMITTED_AT=${info.committedAt}`,
        '-',
      ],
      input,
      cwd,
    );
    return info;
  } finally {
    if (input !== undefined) closeSync(input);
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    buildImage(
      resolve(import.meta.dirname, '..'),
      imageBuildOptions(process.argv.slice(2)),
    );
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Image build failed',
    );
    process.exitCode = 1;
  }
}
