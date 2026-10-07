import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { releaseBuildInfo } from '../../shared/build-info.ts';

/** Adapter output is immutable build metadata, not a runtime environment override.
 * Standalone source CLIs (without an adapter build) are explicitly Development. */
export function startupAppVersion(
  path = resolve('build/build-info.json'),
): string {
  if (!existsSync(path)) return 'Development';
  const metadata = z
    .discriminatedUnion('kind', [
      z.strictObject({
        kind: z.literal('development'),
        version: z.literal('Development'),
        commit: z.null(),
        committedAt: z.null(),
      }),
      z.strictObject({
        kind: z.literal('release'),
        version: z.string(),
        commit: z.string(),
        committedAt: z.string(),
      }),
    ])
    .parse(JSON.parse(readFileSync(path, 'utf8')));
  return metadata.kind === 'release'
    ? releaseBuildInfo(metadata.version, metadata.commit, metadata.committedAt)
        .version
    : metadata.version;
}
