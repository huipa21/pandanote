import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import {
  ARGON2_OPTIONS,
  hashPassword,
  verifyPassword,
} from '../src/lib/server/auth/passwords.ts';

const password = randomBytes(32).toString('base64url');
const samples: { hashMs: number[]; verifyMs: number[] } = {
  hashMs: [],
  verifyMs: [],
};
const baselineRssMiB = process.memoryUsage().rss / 1024 ** 2;
let peakRssMiB = baselineRssMiB;
const sampler = setInterval(() => {
  peakRssMiB = Math.max(peakRssMiB, process.memoryUsage().rss / 1024 ** 2);
}, 10);
try {
  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    const hash = await hashPassword(password);
    const hashed = performance.now();
    if (!(await verifyPassword(hash, password)))
      throw new Error('Hash verification failed');
    samples.hashMs.push(hashed - start);
    samples.verifyMs.push(performance.now() - hashed);
  }
  const first = hashPassword(password);
  let rejected = false;
  try {
    await hashPassword(password);
  } catch {
    rejected = true;
  }
  await first;
  if (!rejected) throw new Error('Concurrency bound failed');
  const metrics = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return { medianMs: Math.round(sorted[2]), p95Ms: Math.round(sorted[4]) };
  };
  console.log(
    JSON.stringify(
      {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        parameters: ARGON2_OPTIONS,
        maxConcurrent: 1,
        queueLength: 0,
        samplesPerOperation: 5,
        hash: metrics(samples.hashMs),
        verify: metrics(samples.verifyMs),
        baselineRssMiB: Math.round(baselineRssMiB),
        peakRssMiB: Math.round(peakRssMiB),
        concurrentOperationRejected: rejected,
      },
      null,
      2,
    ),
  );
} finally {
  clearInterval(sampler);
}
