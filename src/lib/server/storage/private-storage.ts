import { randomBytes, randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  chmodSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import { idSchema } from '../../shared/domain.ts';

export const newPrivateId = (): string => randomUUID();
export const keySchema = z.strictObject({
  version: z.literal(1),
  keyId: idSchema,
  totpEncryptionKey: z
    .string()
    .regex(/^[A-Za-z0-9+/]{43}=$/)
    .refine((v) => Buffer.from(v, 'base64').length === 32),
});
export type KeyMaterial = z.infer<typeof keySchema>;
export type AttachmentVariant =
  'display.webp' | 'thumbnail.webp' | 'attachment.bin';
export type StagingKind = 'uploads' | 'backups' | 'restores';

function within(path: string, base: string): boolean {
  const part = relative(base, path);
  return (
    part === '' ||
    (!part.startsWith(`..${sep}`) && part !== '..' && !isAbsolute(part))
  );
}

// This protects the operator-configured local tree, not an OS attacker with the
// app's UID. Do not accept user paths or race untrusted directory writers here.
export function rejectSymlinks(path: string): void {
  let cursor = resolve(path);
  while (true) {
    try {
      if (lstatSync(cursor).isSymbolicLink())
        throw new Error('Private storage may not use symbolic links');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
}
function secureDirectory(path: string): void {
  rejectSymlinks(path);
  const existed = existsSync(path);
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const stat = lstatSync(path);
  if (!stat.isDirectory())
    throw new Error('Private storage path must be a directory');
  if (process.platform !== 'win32') {
    if (stat.uid !== process.getuid?.())
      throw new Error('Private storage must be owned by the application user');
    chmodSync(path, 0o700);
  }
  if (!existed) {
    syncDirectory(path);
    syncDirectory(dirname(path));
  }
}
export function syncDirectory(path: string): void {
  // Windows does not support directory fsync. The deployment durability gate is Linux.
  if (process.platform === 'win32') return;
  const fd = openSync(path, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/** Durable single-file replacement. Multi-directory restore requires its own
 * journaled state machine in S17; this primitive does not claim atomic restore.
 */
export function writePrivateJson(
  path: string,
  value: unknown,
  createOnly = false,
): void {
  rejectSymlinks(path);
  const temp = join(dirname(path), `.${newPrivateId()}.tmp`);
  const fd = openSync(temp, 'wx', 0o600);
  try {
    try {
      writeFileSync(fd, JSON.stringify(value));
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    if (createOnly) {
      linkSync(temp, path);
      unlinkSync(temp);
    } else renameSync(temp, path);
    syncDirectory(dirname(path));
  } finally {
    if (existsSync(temp)) unlinkSync(temp);
  }
}

export interface StorageOptions {
  dataDir?: string;
  production?: boolean;
  projectRoot?: string;
}
export class PrivateStorage {
  readonly root: string;
  readonly databasePath: string;
  readonly keyPath: string;
  constructor(options: StorageOptions = {}) {
    const project = realpathSync(options.projectRoot ?? process.cwd());
    const configured = options.dataDir ?? process.env.DATA_DIR;
    const production =
      options.production ?? process.env.NODE_ENV === 'production';
    if (production && (!configured || !isAbsolute(configured)))
      throw new Error('Production DATA_DIR must be an absolute private path');
    this.root = resolve(project, configured ?? 'data');
    rejectSymlinks(this.root);
    // Reject source/build/static trees, and ancestors that would contain them.
    if (
      within(project, this.root) ||
      [
        'src',
        'static',
        'public',
        'build',
        'dist',
        '.svelte-kit',
        'node_modules',
      ].some((part) => within(this.root, join(project, part)))
    ) {
      throw new Error('DATA_DIR must be outside source and public assets');
    }
    secureDirectory(this.root);
    for (const part of [
      'db',
      'files',
      'private',
      'staging',
      'staging/uploads',
      'staging/backups',
      'staging/restores',
      'backups',
      'private/journals',
    ])
      secureDirectory(join(this.root, part));
    this.databasePath = this.checked(join('db', 'pandanote.sqlite'));
    this.keyPath = this.checked(join('private', 'key-material.json'));
    // Private directory permissions protect WAL/SHM as well as the main DB.
    if (existsSync(this.databasePath) && process.platform !== 'win32')
      chmodSync(this.databasePath, 0o600);
  }
  private checked(part: string): string {
    const path = join(this.root, part);
    rejectSymlinks(path);
    if (existsSync(path) && !lstatSync(path).isFile())
      throw new Error('Private file path is not a regular file');
    return path;
  }
  attachmentPath(id: string, variant: AttachmentVariant): string {
    idSchema.parse(id);
    if (!['display.webp', 'thumbnail.webp', 'attachment.bin'].includes(variant))
      throw new Error('Unknown file variant');
    return this.checked(join('files', id, variant));
  }
  stagingDirectory(kind: StagingKind, id: string): string {
    idSchema.parse(id);
    if (!['uploads', 'backups', 'restores'].includes(kind))
      throw new Error('Unknown staging kind');
    const path = join(this.root, 'staging', kind, id);
    secureDirectory(path);
    return path;
  }
  backupPath(id: string): string {
    idSchema.parse(id);
    return this.checked(join('backups', `${id}.pnb`));
  }
  journalPath(id: string): string {
    idSchema.parse(id);
    return this.checked(join('private', 'journals', `${id}.json`));
  }
  initializeKeys(): KeyMaterial {
    if (!existsSync(this.keyPath)) {
      // Never silently replace lost portable authentication keys.
      if (existsSync(this.databasePath))
        throw new Error(
          'Key material is missing for an existing database; operator recovery required',
        );
      try {
        writePrivateJson(
          this.keyPath,
          {
            version: 1,
            keyId: newPrivateId(),
            totpEncryptionKey: randomBytes(32).toString('base64'),
          },
          true,
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
    }
    return this.readKeys();
  }
  readKeys(): KeyMaterial {
    rejectSymlinks(this.keyPath);
    const stat = lstatSync(this.keyPath);
    if (!stat.isFile() || stat.size > 4096)
      throw new Error('Invalid private key material file');
    if (process.platform !== 'win32') {
      if (stat.uid !== process.getuid?.())
        throw new Error('Private key material has the wrong owner');
      chmodSync(this.keyPath, 0o600);
    }
    return keySchema.parse(JSON.parse(readFileSync(this.keyPath, 'utf8')));
  }
}
