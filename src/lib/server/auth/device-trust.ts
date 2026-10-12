import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Trusted-device token: a signed, stateless marker that the browser completed a
// full sign-in before. It is NOT an authentication credential. Its only effect is
// that login/MFA attempts are counted against a per-device bucket instead of the
// shared account-wide one, so anonymous junk attempts cannot lock the owner out.
// Binding to the account id and security revision means a password/MFA change or
// reset invalidates every issued token.
export const DEVICE_COOKIE = 'pandanote_device';
export const DEVICE_LIFETIME_MS = 180 * 86_400_000;
const ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export interface DeviceToken {
  token: string;
  expiresAt: number;
}
export interface DeviceIdentity {
  id: string;
  accountId: string;
  revision: number;
}

export class DeviceTrust {
  private readonly readKey: () => string;
  // Runtime callers supply a provider tied to the open persistence/key snapshot,
  // so a successful restore or rollback cannot leave this signer on an old key.
  constructor(totpEncryptionKey: string | (() => string)) {
    this.readKey =
      typeof totpEncryptionKey === 'string'
        ? () => totpEncryptionKey
        : totpEncryptionKey;
  }
  private mac(
    accountId: string,
    id: string,
    expiresAt: number,
    revision: number,
  ): string {
    return createHmac('sha256', Buffer.from(this.readKey(), 'base64'))
      .update(`device-trust-v1\0${accountId}\0${id}\0${expiresAt}\0${revision}`)
      .digest('base64url');
  }
  issue(
    accountId: string,
    revision: number,
    now: number,
    existingId?: string,
  ): DeviceToken {
    const id = existingId ?? randomBytes(16).toString('base64url');
    const expiresAt = now + DEVICE_LIFETIME_MS;
    return {
      token: `v1.${id}.${expiresAt}.${revision}.${this.mac(accountId, id, expiresAt, revision)}`,
      expiresAt,
    };
  }
  // Returns the device id only for an unexpired, untampered token that matches the
  // current account and security revision; otherwise null (treated as unknown).
  verify(
    token: string | undefined,
    owner: { id: string; securityRevision: number } | undefined,
    now: number,
  ): string | null {
    if (!token || !owner || token.length > 200) return null;
    const parts = token.split('.');
    if (parts.length !== 5 || parts[0] !== 'v1') return null;
    const [, id, expires, revision, mac] = parts;
    if (!ID_PATTERN.test(id) || !/^\d{1,16}$/.test(expires)) return null;
    if (!/^\d{1,10}$/.test(revision)) return null;
    const expiresAt = Number(expires);
    if (expiresAt <= now || Number(revision) !== owner.securityRevision)
      return null;
    const expected = Buffer.from(
      this.mac(owner.id, id, expiresAt, owner.securityRevision),
    );
    const given = Buffer.from(mac);
    return given.length === expected.length && timingSafeEqual(given, expected)
      ? id
      : null;
  }
}
