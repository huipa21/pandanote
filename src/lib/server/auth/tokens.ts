import { createHash, randomBytes } from 'node:crypto';

export const newAuthToken = (): string => randomBytes(32).toString('base64url');
// Domain-separated digests; plaintext bearer tokens are never persisted.
export const tokenHash = (kind: 'setup' | 'session', token: string): string =>
  createHash('sha256').update(`${kind}\0${token}`).digest('hex');
