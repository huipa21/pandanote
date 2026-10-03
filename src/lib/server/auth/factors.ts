import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { generateSecret, generateURI, verifySync } from 'otplib';
import QRCode from 'qrcode';
import type { KeyMaterial } from '../storage/private-storage.ts';

// Bind ciphertext to its account and purpose; a challenge ciphertext cannot be
// substituted for an active secret (or another account). Keys remain portable.
export function encryptSecret(
  keys: KeyMaterial,
  secret: string,
  context: string,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    'aes-256-gcm',
    Buffer.from(keys.totpEncryptionKey, 'base64'),
    iv,
  );
  cipher.setAAD(Buffer.from(`pandanote-totp-v1\0${keys.keyId}\0${context}`));
  const ciphertext = Buffer.concat([
    cipher.update(secret, 'utf8'),
    cipher.final(),
  ]);
  return [
    'v1',
    keys.keyId,
    iv.toString('base64url'),
    ciphertext.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
  ].join('.');
}
export function decryptSecret(
  keys: KeyMaterial,
  value: string,
  context: string,
): string {
  const parts = value.split('.');
  if (
    parts.length !== 5 ||
    parts[0] !== 'v1' ||
    parts[1] !== keys.keyId ||
    value.length > 512
  )
    throw new Error('Invalid encrypted secret');
  const iv = Buffer.from(parts[2], 'base64url');
  const tag = Buffer.from(parts[4], 'base64url');
  if (iv.length !== 12 || tag.length !== 16)
    throw new Error('Invalid encrypted secret');
  const cipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(keys.totpEncryptionKey, 'base64'),
    iv,
  );
  cipher.setAAD(Buffer.from(`pandanote-totp-v1\0${keys.keyId}\0${context}`));
  cipher.setAuthTag(tag);
  return Buffer.concat([
    cipher.update(Buffer.from(parts[3], 'base64url')),
    cipher.final(),
  ]).toString('utf8');
}
export function acceptedStep(
  secret: string,
  code: string,
  now: number,
  last: number | null,
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  // A backward-moving clock must reject replay, not trigger otplib's parameter
  // range error when a previously accepted future step exceeds this window.
  if (last !== null && last >= Math.floor(now / 30_000) + 1) return null;
  const result = verifySync({
    secret,
    token: code,
    epoch: Math.floor(now / 1000),
    period: 30,
    digits: 6,
    algorithm: 'sha1',
    epochTolerance: 30,
    ...(last === null ? {} : { afterTimeStep: last }),
  });
  return result.valid && 'timeStep' in result ? result.timeStep : null;
}
export function enrollmentMaterial() {
  const secret = generateSecret();
  const uri = generateURI({
    secret,
    issuer: 'PandaNote',
    label: 'Notebook',
    period: 30,
    digits: 6,
    algorithm: 'sha1',
  });
  // Local matrix only: no remote QR/image request, SVG markup or raw HTML.
  const { modules } = QRCode.create(uri, { errorCorrectionLevel: 'M' });
  const qr = Array.from({ length: modules.size }, (_, y) =>
    Array.from({ length: modules.size }, (_, x) =>
      Boolean(modules.data[y * modules.size + x]),
    ),
  );
  return { secret, uri, qr };
}
export const newRecoveryCode = (): string => {
  const hex = randomBytes(16).toString('hex');
  return hex.match(/.{8}/g)!.join('-');
};
export const normalizeRecoveryCode = (code: string): string =>
  code.trim().toLowerCase().replace(/-/g, '');
