import {
  chmodSync,
  chownSync,
  lstatSync,
  mkdirSync,
  readdirSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  resolvePrivateRoot,
  type StorageOptions,
} from '../src/lib/server/storage/private-storage.ts';

export function containerCommand(
  args: string[],
): 'server' | 'reset-password' | 'reindex' {
  if (
    args.length === 0 ||
    (args.length === 2 && args[0] === 'node' && args[1] === 'build/index.js')
  )
    return 'server';
  if (
    args.length === 1 &&
    (args[0] === 'reset-password' || args[0] === 'reindex')
  )
    return args[0];
  throw new Error(
    'Unsupported container command. Use reset-password or reindex without arguments.',
  );
}

export interface ContainerIdentity {
  uid: number;
  gid: number;
}
export function containerIdentity(env: NodeJS.ProcessEnv): ContainerIdentity {
  const parse = (name: string): number => {
    const value = env[name] ?? '1000';
    if (!/^[1-9]\d*$/.test(value) || Number(value) > 2_147_483_647)
      throw new Error(`${name} must be a positive numeric ID (not root)`);
    return Number(value);
  };
  return { uid: parse('PUID'), gid: parse('PGID') };
}

/** Root bootstrap only: never follows links/mounts or touches application code.
 * The private bind tree is operator-controlled, not writable by other users.
 * Validate the complete bounded inventory before any ownership change. */
export function prepareContainerData(
  identity: ContainerIdentity,
  options: StorageOptions = {},
): void {
  const root = resolvePrivateRoot(options);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const device = lstatSync(root).dev;
  const inventory: {
    path: string;
    directory: boolean;
    uid: number;
    gid: number;
  }[] = [];
  const links = new Map<string, { expected: number; seen: number }>();
  const pending = [root];
  while (pending.length) {
    const path = pending.pop()!;
    const stat = lstatSync(path);
    if (
      stat.isSymbolicLink() ||
      stat.dev !== device ||
      (!stat.isFile() && !stat.isDirectory())
    )
      throw new Error('Unsafe private data entry');
    if (inventory.length >= 1_000_000)
      throw new Error('Private data inventory exceeds startup limit');
    inventory.push({
      path,
      directory: stat.isDirectory(),
      uid: stat.uid,
      gid: stat.gid,
    });
    if (stat.isDirectory()) {
      for (const name of readdirSync(path)) pending.push(join(path, name));
    } else if (stat.nlink > 1) {
      const key = `${stat.dev}:${stat.ino}`;
      const entry = links.get(key) ?? { expected: stat.nlink, seen: 0 };
      entry.seen += 1;
      links.set(key, entry);
    }
  }
  if ([...links.values()].some(({ expected, seen }) => expected !== seen))
    throw new Error('Private data contains an external hard link');
  for (const entry of inventory) {
    if (entry.uid !== identity.uid || entry.gid !== identity.gid)
      chownSync(entry.path, identity.uid, identity.gid);
    chmodSync(entry.path, entry.directory ? 0o700 : 0o600);
  }
}

/** Maintenance never walks or changes a live tree. Verify only the mount root;
 * normal server startup already prepared its private inventory. */
export function verifyContainerDataOwner(
  identity: ContainerIdentity,
  options: StorageOptions = {},
): void {
  const root = resolvePrivateRoot(options);
  const stat = lstatSync(root);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== identity.uid ||
    stat.gid !== identity.gid
  )
    throw new Error('Private data folder must already be owned by PUID/PGID');
}

/** setuid from root permanently clears root's effective/permitted capabilities. */
export function becomeContainerUser(
  identity: ContainerIdentity,
  options: StorageOptions = {},
  maintenance = false,
): void {
  if (!process.getuid || !process.getgid || !process.setuid || !process.setgid)
    throw new Error('Container entrypoint requires Linux user APIs');
  if (maintenance || process.getuid() !== 0)
    verifyContainerDataOwner(identity, options);
  if (process.getuid() === 0) {
    if (!maintenance) prepareContainerData(identity, options);
    process.setgroups!([]);
    process.setgid(identity.gid);
    process.setuid(identity.uid);
  }
  if (process.getuid() !== identity.uid || process.getgid() !== identity.gid)
    throw new Error('Container user does not match PUID/PGID');
  process.umask(0o077);
}
