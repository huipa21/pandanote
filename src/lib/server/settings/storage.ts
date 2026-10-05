import { lstatSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import type { Persistence } from '../db/connection.ts';
import type { SessionIdentity } from '../auth/service.ts';
import { assertSessionIdentity } from '../auth/identity.ts';
import { diskSpace, diskReserveFromEnv } from '../attachments/resources.ts';
import {
  storageUsageSchema,
  UNUSED_UPLOAD_QUIET_MS,
  type StorageUsage,
} from '../../shared/storage.ts';

// Operator-owned private tree only. Never follow symlinks or return paths.
// Bounded traversal fails safely instead of monopolizing an unbounded GET.
function treeBytes(path: string, budget: { remaining: number }): number {
  if (--budget.remaining < 0)
    throw new Error('Storage inspection limit exceeded');
  let stat;
  try {
    stat = lstatSync(path);
  } catch (error) {
    // A staging job can finish during measurement. Missing transient bytes are
    // zero, not an error; all other filesystem failures remain visible.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw error;
  }
  if (stat.isSymbolicLink()) throw new Error('Unsafe private storage entry');
  if (stat.isFile()) return stat.size;
  if (!stat.isDirectory()) throw new Error('Unsupported private storage entry');
  return readdirSync(path).reduce(
    (sum, name) => sum + treeBytes(join(path, name), budget),
    0,
  );
}
export function storageUsage(
  p: Persistence,
  identity: SessionIdentity,
): StorageUsage {
  assertSessionIdentity(p.db, identity);
  const now = Date.now();
  const disk = diskSpace(p.storage.root);
  const reserve =
    diskReserveFromEnv() ?? Math.max(5 * 1024 ** 3, Math.ceil(disk.total / 10));
  const budget = { remaining: 100_000 };
  const databaseBytes = treeBytes(join(p.storage.root, 'db'), budget);
  const backupBytes = treeBytes(join(p.storage.root, 'backups'), budget);
  const stagingBytes = treeBytes(join(p.storage.root, 'staging'), budget);
  return p.db.transaction((tx) => {
    assertSessionIdentity(tx, identity);
    const sums = tx.get<{
      referencedBytes: number;
      trashOnlyBytes: number;
      unusedBytes: number;
    }>(sql`
      with usage as (
        select coalesce(display_bytes,0)+coalesce(thumbnail_bytes,0)+coalesce(file_bytes,0) as bytes,
        exists(select 1 from note_attachments r join notes n on n.id=r.note_id where r.attachment_id=a.id and n.status<>'trash') as live,
        exists(select 1 from note_attachments r where r.attachment_id=a.id) as referenced
        from attachments a where readiness='ready'
      ) select coalesce(sum(case when live then bytes else 0 end),0) as referencedBytes,
        coalesce(sum(case when referenced and not live then bytes else 0 end),0) as trashOnlyBytes,
        coalesce(sum(case when not referenced then bytes else 0 end),0) as unusedBytes from usage`)!;
    const pendingBatchCount = tx.get<{ count: number }>(
      sql`select count(*) as count from upload_batches where account_id=${identity.account.id} and status='pending'`,
    )!.count;
    const pending = tx.all<{ id: string; activityAt: number }>(
      sql`select id, activity_at as activityAt from upload_batches b where account_id=${identity.account.id} and status='pending' and not exists(select 1 from attachments a join note_attachments r on r.attachment_id=a.id where a.batch_id=b.id) order by activity_at,id limit 20`,
    );
    const pendingUploads = pending.map((batch) => {
      const stats = tx.get<{
        readyCount: number;
        itemCount: number;
        storedBytes: number;
      }>(
        sql`select count(*) as itemCount, coalesce(sum(readiness='ready'),0) as readyCount, coalesce(sum(coalesce(display_bytes,0)+coalesce(thumbnail_bytes,0)+coalesce(file_bytes,0)),0) as storedBytes from attachments where batch_id=${batch.id}`,
      )!;
      const filenames = tx
        .all<{ filename: string }>(
          sql`select original_filename as filename from attachments where batch_id=${batch.id} order by id limit 5`,
        )
        .map((row) => row.filename);
      return {
        ...batch,
        ...stats,
        filenames,
        eligibleAt: batch.activityAt + UNUSED_UPLOAD_QUIET_MS,
        eligible: batch.activityAt <= now - UNUSED_UPLOAD_QUIET_MS,
      };
    });
    return storageUsageSchema.parse({
      measuredAt: now,
      totalDiskBytes: disk.total,
      freeDiskBytes: disk.available,
      reserveBytes: reserve,
      availableAboveReserveBytes: Math.max(0, disk.available - reserve),
      ...sums,
      backupBytes,
      databaseBytes,
      stagingBytes,
      pendingBatchCount,
      pendingUploads,
      cleanupJobs: tx.get<{ count: number }>(
        sql`select count(*) as count from file_cleanup_jobs`,
      )!.count,
    });
  });
}
