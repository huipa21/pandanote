import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  backupCreateSchema,
  backupDeleteSchema,
  backupManifestSchema,
} from '../../src/lib/shared/backups.ts';
import {
  readDownloadForm,
  backupErrorResponse,
} from '../../src/lib/server/backups/http.ts';
it('bounds manifests and permits only explicit included/excluded fields and payload paths', () => {
  const manifest = {
    format: 'PandaNote',
    formatVersion: 2,
    schemaVersion: 2,
    appVersion: '0.0.0',
    createdAt: Date.now(),
    counts: { notes: 0, attachments: 0 },
    included:
      'notes,drafts,trash,tags,receipts,files,settings,account,mfa,recovery-codes,portable-keys',
    excluded:
      'local-drafts,sessions,challenges,rate-limits,pending-uploads,cleanup-jobs,search,backup-catalog,archives,staging,pre-upgrade,deployment',
    entries: ['snapshot/pandanote.sqlite', 'snapshot/key-material.json'].map(
      (path) => ({ path, size: 1, sha256: 'a'.repeat(64) }),
    ),
  };
  expect(backupManifestSchema.safeParse(manifest).success).toBe(true);
  for (const changed of [
    { ...manifest, formatVersion: 1 },
    { ...manifest, formatVersion: 3 },
    { ...manifest, password: 'unsupported' },
    { ...manifest, entries: [manifest.entries[0], manifest.entries[0]] },
    {
      ...manifest,
      entries: [
        manifest.entries[0],
        { ...manifest.entries[1], path: '../keys' },
      ],
    },
    {
      ...manifest,
      entries: [
        manifest.entries[0],
        { ...manifest.entries[1], size: 8 * 1024 ** 3 },
      ],
    },
  ])
    expect(backupManifestSchema.safeParse(changed).success).toBe(false);
  expect(
    backupCreateSchema.safeParse({ id: randomUUID(), grant: 'a'.repeat(43) })
      .success,
  ).toBe(true);
  expect(
    backupDeleteSchema.safeParse({ grant: 'a'.repeat(43), confirmed: false })
      .success,
  ).toBe(false);
});
it('native protected download form is capped, unique, POST-body only and never accepts extra fields', async () => {
  const request = (body: string) =>
    new Request('http://localhost/download', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
  expect(await readDownloadForm(request('grant=' + 'a'.repeat(43)))).toEqual({
    grant: 'a'.repeat(43),
  });
  for (const body of [
    'grant=a&grant=b',
    'grant=a&path=../private',
    'x=a',
    'grant=' + 'a'.repeat(300),
  ])
    await expect(readDownloadForm(request(body))).rejects.toThrow();
  for (const code of ['SQLITE_FULL', 'ENOSPC']) {
    const response = backupErrorResponse({
      code,
      message: 'synthetic private path should not escape',
    });
    expect(response.status).toBe(507);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: 'storage-full',
        message: 'Not enough disk space for backup. Free space and retry.',
      },
    });
  }
});
