import argon2 from 'argon2';
import { DomainError } from '../../shared/domain.ts';
import { passwordSchema, loginPasswordSchema } from '../../shared/auth.ts';

// 64 MiB per operation, three passes, one lane. One operation per process,
// with no unbounded queue. Benchmark with auth:benchmark on the deployment host.
export const ARGON2_OPTIONS = Object.freeze({
  type: argon2.argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
  hashLength: 32,
});
let active = false;
async function bounded<T>(work: () => Promise<T>): Promise<T> {
  if (active)
    throw new DomainError('busy', 'Authentication is busy. Please retry.');
  active = true;
  try {
    return await work();
  } finally {
    active = false;
  }
}

export function hashPassword(value: unknown): Promise<string> {
  const password = passwordSchema.parse(value);
  return bounded(() => argon2.hash(password, ARGON2_OPTIONS));
}
export function verifyPassword(hash: string, value: unknown): Promise<boolean> {
  const parsed = loginPasswordSchema.safeParse(value);
  if (!parsed.success) return Promise.resolve(false);
  // Refuse corrupt/unsupported hashes instead of trusting arbitrary encoded
  // memory/CPU parameters. Future parameter upgrades need an explicit policy.
  if (
    !/^\$argon2id\$v=19\$m=65536,(?:t=3,p=1|p=1,t=3)\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/.test(
      hash,
    )
  )
    return Promise.resolve(false);
  return bounded(async () => {
    try {
      return await argon2.verify(hash, parsed.data);
    } catch {
      return false;
    }
  });
}
