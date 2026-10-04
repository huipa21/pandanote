import { statfsSync } from 'node:fs';
import { DomainError } from '../../shared/domain.ts';

export interface DiskSpace {
  available: number;
  total: number;
}
export function diskSpace(path: string): DiskSpace {
  const stat = statfsSync(path);
  return {
    available: stat.bavail * stat.bsize,
    total: stat.blocks * stat.bsize,
  };
}
export function diskReserveFromEnv(): number | undefined {
  const value = process.env.DISK_RESERVE_BYTES;
  if (value === undefined || value === '') return undefined;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new Error('Invalid DISK_RESERVE_BYTES');
  return Number(value);
}
export class DiskBudget {
  private reserved = 0;
  private readonly path: string;
  private readonly reserve: number | undefined;
  private readonly inspect: (path: string) => DiskSpace;
  constructor(
    path: string,
    reserve = diskReserveFromEnv(),
    inspect = diskSpace,
  ) {
    this.path = path;
    this.reserve = reserve;
    this.inspect = inspect;
  }
  claim(bytes: number): () => void {
    const disk = this.inspect(this.path);
    const floor =
      this.reserve ?? Math.max(5 * 1024 ** 3, Math.ceil(disk.total / 10));
    if (disk.available - this.reserved - bytes < floor)
      throw new DomainError(
        'storage-full',
        'Not enough disk space above the safety reserve. Free space and retry.',
      );
    this.reserved += bytes;
    return () => {
      this.reserved -= bytes;
    };
  }
}

/** Only two waiting jobs; deadlines remove queued work rather than running it late. */
export class ImageQueue {
  private running = false;
  private readonly waiting: Array<{
    run: () => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];
  readonly maxWaiting: number;
  readonly waitMs: number;
  constructor(maxWaiting = 2, waitMs = 30_000) {
    this.maxWaiting = maxWaiting;
    this.waitMs = waitMs;
  }
  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.running) {
      if (this.waiting.length >= this.maxWaiting)
        throw new DomainError(
          'busy',
          'Image processing is busy. Retry this upload shortly.',
        );
      await new Promise<void>((resolve, reject) => {
        const job = {
          run: resolve,
          reject,
          timer: setTimeout(() => {
            const index = this.waiting.indexOf(job);
            if (index >= 0) this.waiting.splice(index, 1);
            reject(
              new DomainError(
                'busy',
                'Image queue timed out. Retry this upload.',
              ),
            );
          }, this.waitMs),
        };
        this.waiting.push(job);
      });
    } else this.running = true;
    try {
      return await operation();
    } finally {
      const next = this.waiting.shift();
      if (next) {
        clearTimeout(next.timer);
        next.run();
      } else this.running = false;
    }
  }
}
export const imageQueue = new ImageQueue();
