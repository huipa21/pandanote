import { Persistence } from './db/connection.ts';
import { readSettings } from './settings/repository.ts';
import { AuthService } from './auth/service.ts';
import { AttachmentService } from './attachments/service.ts';
import { NoteService } from './notes/service.ts';
import { TagService } from './tags/service.ts';
import { runAttachmentCleanup } from './attachments/cleanup.ts';
import { authPolicy, type AuthPolicy } from './auth/policy.ts';
import { BackupService } from './backups/service.ts';
import { DiskBudget } from './attachments/resources.ts';
import { RestoreService } from './backups/restore.ts';
import {
  initializeApplication,
  ignoreLegacyEnvironment,
  ApplicationInitializationError,
} from './initialize.ts';

export interface Runtime {
  persistence: Persistence;
  auth: AuthService;
  attachments: AttachmentService;
  notes: NoteService;
  tags: TagService;
  backups: BackupService;
  restores: RestoreService;
  ready: Promise<void>;
  policy: AuthPolicy;
  close: () => Promise<void>;
}
let current: Runtime | undefined;
let initializing: Promise<void> | undefined;
// Init is called by Kit before requests, never by getRuntime/health/handle.
export function initializeRuntime(development = false): Promise<void> {
  return (initializing ??= openRuntime(development));
}
async function openRuntime(development: boolean): Promise<void> {
  ignoreLegacyEnvironment(process.env);
  const policy = authPolicy(process.env, development);
  process.env.ORIGIN = policy.origin;
  const storage = await initializeApplication();
  const persistence = new Persistence(storage);
  try {
    readSettings(persistence);
    const auth = new AuthService(persistence);
    const disk = new DiskBudget(persistence.storage.root);
    const attachments = new AttachmentService(persistence, disk);
    const backups = new BackupService(persistence, auth, disk);
    const restores = new RestoreService(persistence, auth, backups, disk);
    const notes = new NoteService(persistence);
    const tags = new TagService(persistence);
    const ready = runAttachmentCleanup(persistence);
    let closing: Promise<void> | undefined;
    const close = (): Promise<void> =>
      (closing ??= ready.then(async () => {
        await backups.wait();
        await persistence.close();
      }));
    await ready;
    current = {
      persistence,
      auth,
      attachments,
      notes,
      tags,
      backups,
      restores,
      ready,
      policy,
      close,
    };
    const onShutdown = (): void => {
      void close().catch(() => {
        console.error(
          'Private persistence shutdown failed. Operator inspection required.',
        );
        process.exitCode = 1;
      });
    };
    // Adapter 6 emits this only after HTTP requests drain. beforeExit covers
    // development/tools without installing competing SIGTERM/SIGINT handlers.
    process.once('sveltekit:shutdown', onShutdown);
    process.once('beforeExit', onShutdown);
  } catch (error) {
    await persistence.close();
    throw new ApplicationInitializationError(
      'PandaNote runtime initialization failed. Check private data and recovery. No requests served.',
      { cause: error },
    );
  }
}
export function getRuntime(): Runtime {
  if (!current) throw new Error('PandaNote startup is not ready');
  return current;
}
