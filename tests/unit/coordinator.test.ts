import { expect, it } from 'vitest';
import {
  WriteCoordinator,
  type MaintenanceLease,
} from '../../src/lib/server/maintenance/coordinator.ts';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
it('drains in-flight work, rejects new writes and expires exclusive capabilities', async () => {
  const gate = new WriteCoordinator();
  const pending = deferred();
  const entered = deferred();
  const finish = deferred();
  const writer = gate.writeAsync(() => pending.promise);
  let savedLease: MaintenanceLease | undefined;
  const exclusive = gate.exclusive(async (lease) => {
    savedLease = lease;
    entered.resolve();
    expect(gate.state).toBe('exclusive');
    expect(lease.write(() => 42)).toBe(42);
    await finish.promise;
  });
  expect(gate.state).toBe('draining');
  expect(gate.activeWrites).toBe(1);
  expect(() => gate.write(() => 1)).toThrow(/Maintenance/);
  await expect(gate.writeAsync(async () => 1)).rejects.toThrow(/Maintenance/);
  await expect(gate.exclusive(async () => 1)).rejects.toThrow(/Maintenance/);
  pending.resolve();
  await writer;
  await entered.promise;
  expect(() => gate.write(() => 1)).toThrow();
  finish.resolve();
  await exclusive;
  expect(gate.state).toBe('open');
  expect(gate.activeWrites).toBe(0);
  expect(() => savedLease!.write(() => 1)).toThrow(/expired/);
  expect(gate.write(() => 1)).toBe(1);
});
it('releases failed leases, times out drains safely and closes without admitting another writer', async () => {
  const gate = new WriteCoordinator();
  expect(() =>
    gate.write(() => {
      throw new Error('test');
    }),
  ).toThrow('test');
  await expect(
    gate.writeAsync(async () => {
      throw new Error('test');
    }),
  ).rejects.toThrow('test');
  await expect(
    gate.exclusive(async () => {
      throw new Error('test');
    }),
  ).rejects.toThrow('test');
  expect(gate.state).toBe('open');
  expect(gate.activeWrites).toBe(0);
  const pending = deferred();
  const writer = gate.writeAsync(() => pending.promise);
  await expect(gate.exclusive(async () => 1, 5)).rejects.toThrow(
    /did not finish/,
  );
  expect(gate.state).toBe('open');
  pending.resolve();
  await writer;
  await gate.shutdown(async () => {});
  expect(gate.state).toBe('closed');
  expect(() => gate.write(() => 1)).toThrow();
  await gate.shutdown(async () => {
    throw new Error('should not run twice');
  });
});
