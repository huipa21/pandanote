import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { idSchema, instantSchema } from '../../shared/domain.ts';
import {
  PrivateStorage,
  syncDirectory,
  writePrivateJson,
} from '../storage/private-storage.ts';
import { WriteCoordinator, type MaintenanceLease } from './coordinator.ts';

// S17 owns the restore state machine. This bounded private record is only its
// durable journal primitive: generated IDs, no archive-supplied filesystem paths.
export const journalSchema = z.strictObject({
  version: z.literal(1),
  id: idSchema,
  kind: z.literal('restore'),
  phase: z.enum([
    'prepared',
    'old-state-retained',
    'new-state-installed',
    'verified',
    'rollback-required',
  ]),
  stagedStateId: idSchema,
  rollbackStateId: idSchema,
  updatedAt: instantSchema,
});
export type FilesystemJournal = z.infer<typeof journalSchema>;
export class JournalStore {
  private storage: PrivateStorage;
  private coordinator: WriteCoordinator;
  constructor(storage: PrivateStorage, coordinator: WriteCoordinator) {
    this.storage = storage;
    this.coordinator = coordinator;
  }
  read(id: string): FilesystemJournal | null {
    const path = this.storage.journalPath(id);
    if (!existsSync(path)) return null;
    if (lstatSync(path).size > 4096)
      throw new Error('Filesystem journal is too large');
    const record = journalSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
    if (record.id !== id)
      throw new Error('Filesystem journal identity mismatch');
    return record;
  }
  list(): FilesystemJournal[] {
    const folder = join(this.storage.root, 'private', 'journals');
    const names = readdirSync(folder);
    if (names.length > 100)
      throw new Error(
        'Too many filesystem journals; operator recovery required',
      );
    return names
      .filter((name) => name.endsWith('.json'))
      .map((name) => {
        const record = this.read(idSchema.parse(name.slice(0, -5)));
        if (!record) throw new Error('Filesystem journal disappeared');
        return record;
      });
  }
  put(value: FilesystemJournal, lease?: MaintenanceLease): void {
    const record = journalSchema.parse(value);
    (lease ?? this.coordinator).write(() =>
      writePrivateJson(this.storage.journalPath(record.id), record),
    );
  }
  remove(id: string, lease?: MaintenanceLease): void {
    (lease ?? this.coordinator).write(() => {
      const path = this.storage.journalPath(id);
      if (existsSync(path)) {
        unlinkSync(path);
        syncDirectory(join(this.storage.root, 'private', 'journals'));
      }
    });
  }
}
