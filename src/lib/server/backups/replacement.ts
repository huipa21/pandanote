import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import {
  JournalStore,
  type FilesystemJournal,
} from '../maintenance/journal.ts';
import {
  WriteCoordinator,
  type MaintenanceLease,
} from '../maintenance/coordinator.ts';
import {
  PrivateStorage,
  syncDirectory,
  rejectSymlinks,
} from '../storage/private-storage.ts';
import { idSchema } from '../../shared/domain.ts';

export type SwapBoundary =
  | 'prepared'
  | 'old-db'
  | 'new-db'
  | 'old-files'
  | 'new-files'
  | 'old-key'
  | 'new-key'
  | 'reopened'
  | 'committing'
  | 'verified';
export function stateParts(storage: PrivateStorage, record: FilesystemJournal) {
  const stage = join(
    storage.root,
    'staging/restores',
    record.stagedStateId,
    'state',
  );
  const rollback = join(
    storage.root,
    'staging/restores',
    record.rollbackStateId,
  );
  return [
    {
      name: 'db',
      live: join(storage.root, 'db'),
      staged: join(stage, 'db'),
      old: join(rollback, 'db'),
    },
    {
      name: 'files',
      live: join(storage.root, 'files'),
      staged: join(stage, 'files'),
      old: join(rollback, 'files'),
    },
    {
      name: 'key',
      live: storage.keyPath,
      staged: join(stage, 'key-material.json'),
      old: join(rollback, 'key-material.json'),
    },
  ] as const;
}
export function durableRename(from: string, to: string): void {
  rejectSymlinks(from);
  rejectSymlinks(to);
  renameSync(from, to);
  syncDirectory(dirname(from));
  syncDirectory(dirname(to));
}
function remove(path: string) {
  rejectSymlinks(path);
  rmSync(path, { recursive: true, force: true });
  syncDirectory(dirname(path));
}
/** Idempotent even if killed while rolling back: once an old part is moved back,
 * its missing rollback path means leave that restored live part alone. Journal
 * is removed LAST. Until verified, recovery always chooses the complete old set. */
export function recoverReplacement(
  storage: PrivateStorage,
  record: FilesystemJournal,
  store: JournalStore,
  lease?: MaintenanceLease,
): void {
  if (record.stagedStateId === record.rollbackStateId)
    throw new Error('Restore journal state identities must differ');
  if (record.phase !== 'verified') {
    for (const part of stateParts(storage, record)) {
      if (existsSync(part.old)) {
        remove(part.live);
        durableRename(part.old, part.live);
      }
      if (!existsSync(part.live))
        throw new Error(
          'Restore rollback set is incomplete; operator recovery required',
        );
    }
  }
  remove(join(storage.root, 'staging/restores', record.stagedStateId));
  remove(join(storage.root, 'staging/restores', record.rollbackStateId));
  store.remove(record.id, lease);
}
/** Called before ANY DB/key reads and before abandoned-upload cleanup. */
export function recoverRestores(storage: PrivateStorage): void {
  const store = new JournalStore(storage, new WriteCoordinator());
  const records = store.list();
  if (records.length > 1)
    throw new Error('Multiple restore journals require operator inspection');
  for (const record of records) recoverReplacement(storage, record, store);
  const root = join(storage.root, 'staging/restores');
  const names = readdirSync(root);
  if (names.length > 1000)
    throw new Error('Restore staging requires operator inspection');
  for (const name of names) {
    idSchema.parse(name);
    const path = join(root, name);
    if (lstatSync(path).isSymbolicLink())
      throw new Error('Unsafe restore staging');
    remove(path);
  }
}
export function createReplacementState(
  storage: PrivateStorage,
  id: string,
  extracted: string,
): string {
  const state = join(storage.stagingDirectory('restores', id), 'state');
  mkdirSync(join(state, 'db'), { recursive: true, mode: 0o700 });
  durableRename(
    join(extracted, 'snapshot/pandanote.sqlite'),
    join(state, 'db/pandanote.sqlite'),
  );
  durableRename(
    join(extracted, 'snapshot/key-material.json'),
    join(state, 'key-material.json'),
  );
  if (existsSync(join(extracted, 'files')))
    durableRename(join(extracted, 'files'), join(state, 'files'));
  else mkdirSync(join(state, 'files'), { mode: 0o700 });
  syncDirectory(state);
  syncDirectory(join(state, 'db'));
  syncDirectory(join(state, 'files'));
  return state;
}
