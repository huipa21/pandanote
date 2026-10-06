// Public source identity, independent of schema/archive compatibility and app settings.
export interface ReleaseBuildInfo {
  kind: 'release';
  version: string;
  commit: string;
  committedAt: string;
}
export interface DevelopmentBuildInfo {
  kind: 'development';
  version: 'Development';
  commit: null;
  committedAt: null;
}
export type BuildInfo = ReleaseBuildInfo | DevelopmentBuildInfo;
export const developmentBuildInfo: DevelopmentBuildInfo = {
  kind: 'development',
  version: 'Development',
  commit: null,
  committedAt: null,
};

export function utcVersionDate(iso: string): string {
  const date = new Date(iso);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/.test(iso) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString() !== iso
  )
    throw new Error(
      'Release commit time must be a canonical UTC Git timestamp',
    );
  return iso.slice(2, 10).replaceAll('-', '');
}

export function releaseBuildInfo(
  version: string,
  commit: string,
  committedAt: string,
): ReleaseBuildInfo {
  const match = /^(\d{6})-([1-9]\d*)$/.exec(version);
  if (
    !match ||
    !Number.isSafeInteger(Number(match[2])) ||
    match[1] !== utcVersionDate(committedAt) ||
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commit)
  )
    throw new Error(
      'Invalid release version, full Git hash or UTC commit date',
    );
  return { kind: 'release', version, commit, committedAt };
}

export function buildInfoFromEnvironment(
  env: Record<string, string | undefined>,
  required = false,
): BuildInfo {
  const fields = [
    env.PANDANOTE_VERSION,
    env.PANDANOTE_COMMIT,
    env.PANDANOTE_COMMITTED_AT,
  ];
  if (!required && fields.every((field) => !field)) return developmentBuildInfo;
  if (fields.some((field) => !field))
    throw new Error(
      'Release metadata is required: use npm run image:build from a clean, complete Git checkout',
    );
  return releaseBuildInfo(fields[0]!, fields[1]!, fields[2]!);
}
