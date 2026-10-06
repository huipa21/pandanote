import { spawnSync } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertCleanCheckout, deriveRelease, git } from './release-version.ts';
import type { ReleaseBuildInfo } from '../src/lib/shared/build-info.ts';

export type ImageEngine = 'docker' | 'podman';
export interface ImageBuildOptions {
  engine: ImageEngine | 'auto';
  platform: 'linux/amd64' | 'linux/arm64';
}
export function imageBuildOptions(args: string[]): ImageBuildOptions {
  const options: ImageBuildOptions = {
    engine: 'auto',
    platform: 'linux/amd64',
  };
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    if (seen.has(key)) throw new Error(`Duplicate image build option: ${key}`);
    seen.add(key);
    if (
      key === '--engine' &&
      (value === 'auto' || value === 'docker' || value === 'podman')
    )
      options.engine = value;
    else if (
      key === '--platform' &&
      (value === 'linux/amd64' || value === 'linux/arm64')
    )
      options.platform = value;
    else
      throw new Error(
        'Usage: npm run image:build -- [--platform linux/amd64|linux/arm64] [--engine auto|docker|podman]',
      );
  }
  return options;
}

export type EngineProbe = (engine: ImageEngine) => string | undefined;
// Probe the server, not just the executable: Docker Desktop / the Podman VM
// may be installed but stopped. Keep detection bounded and never use a shell.
const probeEngine: EngineProbe = (engine) => {
  const result = spawnSync(engine, ['info'], {
    encoding: 'utf8',
    timeout: 15_000,
    windowsHide: true,
  });
  if (!result.error && result.status === 0) return undefined;
  return (
    result.error?.message || result.stderr.trim() || `exit ${result.status}`
  );
};
export function resolveImageEngine(
  requested: ImageBuildOptions['engine'],
  probe: EngineProbe = probeEngine,
): ImageEngine {
  const candidates: ImageEngine[] =
    requested === 'auto' ? ['docker', 'podman'] : [requested];
  const failures: string[] = [];
  for (const engine of candidates) {
    const failure = probe(engine);
    if (failure === undefined) return engine;
    failures.push(`${engine}: ${failure}`);
  }
  throw new Error(
    `No usable container engine. Start Docker Desktop (Linux containers) or the Podman machine (podman machine start).\n${failures.join('\n')}`,
  );
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
      `${engine} image build failed${result.status === null ? '' : ` (exit ${result.status})`}${result.error ? `: ${result.error.message}` : ''}`,
    );
};

export function buildImage(
  cwd: string,
  options: ImageBuildOptions,
  run: EngineRunner = runEngine,
  probe: EngineProbe = probeEngine,
): ReleaseBuildInfo {
  const info = deriveRelease(cwd);
  if (
    git(cwd, ['ls-tree', '-r', info.commit])
      .split(/\r?\n/)
      .some((line) => line.startsWith('160000 '))
  )
    throw new Error('Release archives do not support Git submodules');
  const engine = resolveImageEngine(options.engine, probe);
  const temporary = mkdtempSync(join(tmpdir(), 'pandanote-image-'));
  let input: number | undefined;
  try {
    const archive = join(temporary, 'source.tar');
    git(cwd, ['archive', '--format=tar', `--output=${archive}`, info.commit]);
    assertCleanCheckout(cwd, info.commit);
    input = openSync(archive, 'r');
    console.log(
      `Building pandanote:latest (version ${info.version}, ${info.commit}) for ${options.platform} with ${engine}`,
    );
    run(
      engine,
      [
        'build',
        ...(engine === 'podman' ? ['--format', 'docker'] : []),
        '--platform',
        options.platform,
        '-f',
        'ops/Dockerfile',
        '-t',
        'pandanote:latest',
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
    console.log(`Built pandanote:latest and pandanote:${info.version}`);
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
