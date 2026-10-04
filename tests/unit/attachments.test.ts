import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { initializeBatchSchema } from '../../src/lib/shared/attachments.ts';
import {
  DiskBudget,
  ImageQueue,
} from '../../src/lib/server/attachments/resources.ts';
import { downloadDisposition } from '../../src/lib/server/attachments/files.ts';
import { WriteCoordinator } from '../../src/lib/server/maintenance/coordinator.ts';

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
describe('attachment bounds and contracts', () => {
  it('rejects duplicate/path IDs, header controls, oversized manifests and invalid checksums', () => {
    const item = {
      id: randomUUID(),
      filename: '香港";.txt',
      incomingBytes: 20,
      incomingDigest: 'a'.repeat(64),
    };
    const base = {
      mutationId: randomUUID(),
      requestDigest: 'b'.repeat(64),
      items: [item],
    };
    expect(initializeBatchSchema.safeParse(base).success).toBe(true);
    for (const items of [
      [item, item],
      [{ ...item, id: '../x' }],
      [{ ...item, filename: 'name\r\ninject' }],
      [{ ...item, incomingDigest: 'bad' }],
      Array.from({ length: 101 }, () => ({ ...item, id: randomUUID() })),
    ])
      expect(initializeBatchSchema.safeParse({ ...base, items }).success).toBe(
        false,
      );
    expect(downloadDisposition(item.filename)).toContain(
      "filename*=UTF-8''%E9%A6%99%E6%B8%AF__.txt",
    );
    expect(downloadDisposition('../../file.txt')).not.toContain('../');
  });
  it('accounts for concurrent disk reservations and releases capacity', () => {
    const disk = new DiskBudget('/unused', 100, () => ({
      available: 1000,
      total: 2000,
    }));
    const release = disk.claim(700);
    expect(() => disk.claim(201)).toThrow(/disk space/);
    const releaseSecond = disk.claim(200);
    releaseSecond();
    release();
    disk.claim(900)();
    const defaults = new DiskBudget('/unused', undefined, () => ({
      available: 6 * 1024 ** 3,
      total: 100 * 1024 ** 3,
    }));
    expect(() => defaults.claim(1)).toThrow(/disk space/);
  });
  it('bounds queue length, times out waiting work without executing it, and recovers on errors', async () => {
    const queue = new ImageQueue(1, 10);
    const first = queue.run(() => wait(30));
    let called = false;
    const second = queue.run(async () => {
      called = true;
    });
    await expect(queue.run(async () => {})).rejects.toThrow(/busy/);
    await expect(second).rejects.toThrow(/timed out/);
    await first;
    expect(called).toBe(false);
    await expect(
      queue.run(async () => {
        throw new Error('synthetic');
      }),
    ).rejects.toThrow('synthetic');
    expect(await queue.run(async () => 'next')).toBe('next');
  });
  it('an admitted async writer can commit while maintenance drains; its capability expires afterward', async () => {
    const gate = new WriteCoordinator();
    let commit!: () => void;
    let captured!: Parameters<Parameters<WriteCoordinator['writeAsync']>[0]>[0];
    const work = gate.writeAsync(async (lease) => {
      captured = lease;
      await new Promise<void>((resolve) => {
        commit = resolve;
      });
      return lease.write(() => 'committed');
    });
    const exclusive = gate.exclusive(async () => 'snapshot');
    expect(gate.state).toBe('draining');
    expect(() => gate.write(() => {})).toThrow(/Maintenance/);
    commit();
    expect(await work).toBe('committed');
    expect(await exclusive).toBe('snapshot');
    expect(() => captured.write(() => {})).toThrow(/expired/);
  });
});
