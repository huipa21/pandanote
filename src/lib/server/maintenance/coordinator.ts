import { DomainError } from '../../shared/domain.ts';

export type MaintenanceState = 'open' | 'draining' | 'exclusive' | 'closed';
export interface MaintenanceLease {
  write<T>(operation: () => T): T;
}

function synchronous<T>(operation: () => T): T {
  const result = operation();
  if (result instanceof Promise)
    throw new TypeError('Use writeAsync for asynchronous work');
  return result;
}

/** One instance per application process. No queued mutations or hidden retries.
 * Async file/upload operations hold a lease; SQLite transactions stay synchronous.
 * A snapshot/restore/shutdown blocks new leases, then drains existing work.
 */
export class WriteCoordinator {
  private current: MaintenanceState = 'open';
  private active = 0;
  private drained: (() => void) | undefined;
  get state(): MaintenanceState {
    return this.current;
  }
  get activeWrites(): number {
    return this.active;
  }

  private acquire(): () => void {
    if (this.current !== 'open')
      throw new DomainError('busy', 'err.maintenanceIsInProgressPlease');
    this.active++;
    return () => {
      this.active--;
      if (this.active === 0) this.drained?.();
    };
  }
  write<T>(operation: () => T): T {
    const release = this.acquire();
    try {
      return synchronous(operation);
    } finally {
      release();
    }
  }
  async writeAsync<T>(
    operation: (lease: MaintenanceLease) => Promise<T>,
  ): Promise<T> {
    const release = this.acquire();
    let valid = true;
    const lease: MaintenanceLease = {
      write: <R>(work: () => R): R => {
        if (!valid) throw new DomainError('busy', 'err.writeLeaseHasExpired');
        return synchronous(work);
      },
    };
    try {
      return await operation(lease);
    } finally {
      valid = false;
      release();
    }
  }
  private async runExclusive<T>(
    operation: (lease: MaintenanceLease) => Promise<T>,
    timeoutMs: number,
    close: boolean,
  ): Promise<T> {
    if (this.current !== 'open')
      throw new DomainError('busy', 'err.maintenanceIsInProgressPlease');
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
      throw new TypeError('Invalid drain timeout');
    this.current = 'draining';
    let valid = false;
    let succeeded = false;
    const lease: MaintenanceLease = {
      write: <R>(work: () => R): R => {
        if (!valid)
          throw new DomainError('busy', 'err.maintenanceLeaseHasExpired');
        return synchronous(work);
      },
    };
    try {
      if (this.active > 0)
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            this.drained = undefined;
            reject(new DomainError('busy', 'err.activeWritesDidNotFinish'));
          }, timeoutMs);
          this.drained = () => {
            clearTimeout(timer);
            this.drained = undefined;
            resolve();
          };
        });
      this.current = 'exclusive';
      valid = true;
      const result = await operation(lease);
      succeeded = true;
      return result;
    } finally {
      valid = false;
      this.current = close && succeeded ? 'closed' : 'open';
    }
  }
  exclusive<T>(
    operation: (lease: MaintenanceLease) => Promise<T>,
    timeoutMs = 30_000,
  ): Promise<T> {
    return this.runExclusive(operation, timeoutMs, false);
  }
  async shutdown(
    operation: () => Promise<void>,
    timeoutMs = 30_000,
  ): Promise<void> {
    if (this.current === 'closed') return;
    await this.runExclusive(operation, timeoutMs, true);
  }
}
