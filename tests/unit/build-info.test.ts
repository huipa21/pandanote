import { describe, expect, it } from 'vitest';
import {
  buildInfoFromEnvironment,
  developmentBuildInfo,
  releaseBuildInfo,
  utcVersionDate,
} from '../../src/lib/shared/build-info.ts';
import { imageBuildOptions } from '../../scripts/image-build.ts';

const hash = 'a'.repeat(40);
const instant = '2026-10-06T00:00:00.000Z';
describe('release metadata contract', () => {
  it('accepts daily sequences and preserves full hash and canonical UTC instant', () => {
    expect(releaseBuildInfo('261006-12', hash, instant)).toEqual({
      kind: 'release',
      version: '261006-12',
      commit: hash,
      committedAt: instant,
    });
    expect(utcVersionDate('2026-10-05T23:59:59.000Z')).toBe('261005');
    expect(utcVersionDate(instant)).toBe('261006');
  });
  it.each([
    '261006-0',
    '261006-01',
    '261006--1',
    '261005-1',
    '261006-9007199254740992',
    '20261006-1',
  ])('rejects invalid version %s', (version) => {
    expect(() => releaseBuildInfo(version, hash, instant)).toThrow();
  });
  it.each([
    '2026-10-06T08:00:00+08:00',
    '2026-10-06T00:00:00Z',
    '2026-02-30T00:00:00.000Z',
    'invalid',
  ])('rejects noncanonical time %s', (time) => {
    expect(() => releaseBuildInfo('261006-1', hash, time)).toThrow();
  });
  it('rejects shortened hashes, incomplete metadata and required production metadata', () => {
    expect(() => releaseBuildInfo('261006-1', 'abcdef0', instant)).toThrow();
    expect(buildInfoFromEnvironment({})).toEqual(developmentBuildInfo);
    expect(() => buildInfoFromEnvironment({}, true)).toThrow(/image:build/);
    expect(() =>
      buildInfoFromEnvironment({ PANDANOTE_VERSION: '261006-1' }),
    ).toThrow();
    expect(
      buildInfoFromEnvironment(
        {
          PANDANOTE_VERSION: '261006-1',
          PANDANOTE_COMMIT: hash,
          PANDANOTE_COMMITTED_AT: instant,
        },
        true,
      ),
    ).toEqual(releaseBuildInfo('261006-1', hash, instant));
  });
  it('restricts image options; arbitrary flags cannot override metadata', () => {
    expect(imageBuildOptions([])).toEqual({
      engine: 'docker',
      platform: 'linux/amd64',
    });
    expect(
      imageBuildOptions(['--engine', 'podman', '--platform', 'linux/arm64']),
    ).toEqual({ engine: 'podman', platform: 'linux/arm64' });
    for (const args of [
      ['--build-arg', 'PANDANOTE_VERSION=spoofed'],
      ['--platform', 'windows/amd64'],
      ['--engine'],
      ['--engine', 'docker', '--engine', 'podman'],
    ])
      expect(() => imageBuildOptions(args)).toThrow();
  });
});
