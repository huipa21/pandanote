import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PrivateStorage,
  newPrivateId,
} from '../../src/lib/server/storage/private-storage.ts';
import {
  connectDatabase,
  Persistence,
} from '../../src/lib/server/db/connection.ts';
import { applyMigrations } from '../../src/lib/server/db/migrations.ts';
import { initializeSettings } from '../../src/lib/server/settings/repository.ts';
import { account, notes, attachments } from '../../src/lib/server/db/schema.ts';

// Test-only seeding. The operator CLI never imports this file.
export async function withPersistence(
  test: (p: Persistence, root: string) => void | Promise<void>,
): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'pandanote-persistence-'));
  let persistence: Persistence | undefined;
  try {
    const storage = new PrivateStorage({ dataDir: root, production: true });
    storage.initializeKeys();
    const native = connectDatabase(storage.databasePath);
    try {
      applyMigrations(native);
    } finally {
      native.close();
    }
    persistence = new Persistence(storage);
    initializeSettings(persistence);
    await test(persistence, root);
  } finally {
    await persistence?.close();
    rmSync(root, { recursive: true, force: true });
  }
}
export function seedAccount(p: Persistence): string {
  const id = newPrivateId();
  p.write((tx) =>
    tx
      .insert(account)
      .values({
        id,
        username: 'fixture',
        email: 'fixture@example.invalid',
        passwordHash: 'synthetic-test-only-not-a-password-hash',
        createdAt: Date.now(),
      })
      .run(),
  );
  return id;
}
export function seedNote(
  p: Persistence,
  status: 'published' | 'trash' = 'published',
): string {
  const id = newPrivateId();
  const now = Date.now();
  p.write((tx) =>
    tx
      .insert(notes)
      .values({
        id,
        bodyMarkdown: 'synthetic 香港 #Work',
        status,
        priorStatus: status === 'trash' ? 'published' : null,
        timelineAt: now,
        createdAt: now,
        updatedAt: now,
        revision: 1,
      })
      .run(),
  );
  return id;
}
export const testDigest = 'a'.repeat(64);
export function seedAttachment(
  p: Persistence,
  readiness: 'ready' | 'pending' = 'ready',
): string {
  const id = newPrivateId();
  p.write((tx) =>
    tx
      .insert(attachments)
      .values({
        id,
        kind: 'file',
        originalFilename: '../not-a-storage-path.txt',
        detectedMime: 'text/plain',
        incomingDigest: testDigest,
        incomingBytes: 4,
        readiness,
        fileBytes: readiness === 'ready' ? 4 : null,
        fileDigest: readiness === 'ready' ? testDigest : null,
        createdAt: Date.now(),
      })
      .run(),
  );
  return id;
}
