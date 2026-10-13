import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { generateSync } from 'otplib';
import { expect, it } from 'vitest';
import { withPersistence } from '../helpers/persistence.ts';
import { createFixtureAccount } from '../helpers/auth.ts';
import { Persistence } from '../../src/lib/server/db/connection.ts';
import { account, authChallenges } from '../../src/lib/server/db/schema.ts';
import { AuthService } from '../../src/lib/server/auth/service.ts';
import { DeviceTrust } from '../../src/lib/server/auth/device-trust.ts';
import {
  AuthRateLimiter,
  DAILY_MFA_FAILURES,
  FAILURES_SINCE_SUCCESS,
  FAILURES_SINCE_SUCCESS_WINDOW_MS,
} from '../../src/lib/server/auth/rate-limits.ts';
import { tokenHash } from '../../src/lib/server/auth/tokens.ts';
import { BackupService } from '../../src/lib/server/backups/service.ts';
import { RestoreService } from '../../src/lib/server/backups/restore.ts';
import { DiskBudget } from '../../src/lib/server/attachments/resources.ts';

const password = 'synthetic-auth-restore-only password';
const destinationPassword = 'synthetic-auth-destination-only password';
const ip = '192.0.2.79';

async function sourceArchive(p: Persistence) {
  const auth = new AuthService(p);
  const initial = await createFixtureAccount(auth, password, ip);
  const fresh = await auth.freshAuth(
    auth.authenticate(initial.token)!,
    'mfa-enroll',
    password,
    undefined,
    ip,
  );
  const enrollment = auth.startEnrollment(
    auth.authenticate(initial.token)!,
    fresh.token,
  );
  const enabled = auth.confirmEnrollment(
    auth.authenticate(initial.token)!,
    enrollment.challenge,
    generateSync({ secret: enrollment.secret, epoch: Date.now() / 1000 }),
    ip,
  );
  const identity = auth.authenticate(enabled.credential.token)!;
  const backups = new BackupService(p, auth, new DiskBudget(p.storage.root, 0));
  const job = backups.create(identity, {
    id: randomUUID(),
  });
  await backups.wait();
  expect(backups.list(identity)[0].state).toBe('complete');
  return {
    bytes: readFileSync(p.storage.backupPath(job.id)),
    codes: enabled.codes,
  };
}

it('SEC-RESTORE-AUTH-1: restored keys sign device tokens immediately and preserve daily/challenge/notice counters through an actual persistence restart', async () => {
  await withPersistence(async (source) => {
    const archive = await sourceArchive(source);
    await withPersistence(async (destination) => {
      let now = Date.now();
      const live = new AuthService(destination, () => now);
      const limiter = new AuthRateLimiter(destination); // Retained across replacement, like the runtime helpers.
      const initial = await createFixtureAccount(live, destinationPassword, ip);
      const identity = live.authenticate(initial.token)!;
      const oldKey = destination.storage.readKeys().totpEncryptionKey;
      const disk = new DiskBudget(destination.storage.root, 0);
      const restores = new RestoreService(
        destination,
        live,
        new BackupService(destination, live, disk),
        disk,
      );
      const grant = async () =>
        (
          await live.freshAuth(
            identity,
            'restore',
            destinationPassword,
            undefined,
            ip,
          )
        ).token;
      const summary = await restores.upload(
        identity,
        new Request('http://localhost/api/restores', {
          method: 'POST',
          headers: {
            'x-archive-bytes': String(archive.bytes.length),
            'x-restore-grant': await grant(),
          },
          body: new Uint8Array(archive.bytes),
        }),
      );
      await restores.confirm(identity, {
        id: summary.id,
        confirmed: true,
        grant: await grant(),
      });
      const key = destination.storage.readKeys().totpEncryptionKey;
      expect(key).not.toBe(oldKey);
      expect(live.authenticate(initial.token)).toBeNull();
      const pending = await live.login('fixture', password, ip);
      const signedIn = live.completeMfa(pending.token, archive.codes[1], ip);
      const owner = destination.db.select().from(account).get()!;
      const device = signedIn.device!.token;
      const id = new DeviceTrust(key).verify(device, owner, now);
      expect(id).not.toBeNull();
      expect(new DeviceTrust(oldKey).verify(device, owner, now)).toBeNull();
      const restoredIdentity = live.authenticate(signedIn.token)!;
      // 30 real wrong codes; fixed 15-minute windows advance, the daily window does not.
      for (let window = 0; window < 3; window++) {
        now += 16 * 60_000;
        for (let challenge = 0; challenge < 2; challenge++) {
          const token = await live.login('fixture', password, ip);
          for (let i = 0; i < 5; i++)
            expect(() =>
              live.completeMfa(token.token, 'not-a-code', ip),
            ).toThrow(/Invalid username or password/);
        }
      }
      now += 16 * 60_000;
      const blocked = await live.login('fixture', password, ip);
      expect(() =>
        live.completeMfa(blocked.token, archive.codes[2], ip),
      ).toThrow(/Too many incorrect codes today/);
      expect(
        live.securityStatus(restoredIdentity).failedSecondFactorAttempts,
      ).toBe(30);
      expect(
        new AuthService(destination, () => now).securityStatus(restoredIdentity)
          .failedSecondFactorAttempts,
      ).toBe(30);
      expect(
        limiter.failureCount(destination.db, DAILY_MFA_FAILURES, now),
      ).toBe(30);
      // A partial trusted challenge must carry its first four failures across restart too.
      const partial = await live.login('fixture', password, ip, device);
      for (let i = 0; i < 4; i++)
        expect(() =>
          live.completeMfa(partial.token, 'not-a-code', ip, device),
        ).toThrow(/Invalid username or password/);
      expect(
        live.securityStatus(restoredIdentity).failedSecondFactorAttempts,
      ).toBe(34);
      // Fill the anonymous login bucket. The retained limiter must use the installed key.
      for (let i = 0; i < 29; i++)
        limiter.attempt('login', `198.51.100.${i + 1}`, now);
      await expect(
        live.login('fixture', password, '203.0.113.1'),
      ).rejects.toMatchObject({ code: 'rate-limited' });
      await destination.close();
      const reopened = new Persistence(destination.storage);
      try {
        const restarted = new AuthService(reopened, () => now);
        expect(
          restarted.securityStatus(restoredIdentity).failedSecondFactorAttempts,
        ).toBe(34);
        expect(() =>
          restarted.completeMfa(blocked.token, archive.codes[2], ip),
        ).toThrow(/Too many incorrect codes today/);
        expect(() =>
          restarted.completeMfa(partial.token, 'not-a-code', ip, device),
        ).toThrow(/Invalid username or password/);
        expect(
          reopened.db
            .select()
            .from(authChallenges)
            .all()
            .some(
              (row) => row.tokenHash === tokenHash('challenge', partial.token),
            ),
        ).toBe(false);
        expect(() =>
          restarted.completeMfa(partial.token, archive.codes[2], ip, device),
        ).toThrow(/Enter your password again/);
        await expect(
          restarted.login('fixture', password, '203.0.113.1'),
        ).rejects.toMatchObject({ code: 'rate-limited' });
        const next = await restarted.login('fixture', password, ip, device);
        const success = restarted.completeMfa(
          next.token,
          archive.codes[2],
          ip,
          device,
        );
        expect(restarted.authenticate(success.token)).not.toBeNull();
        expect(success.device!.token.split('.')[1]).toBe(id);
        expect(
          restarted.securityStatus(restarted.authenticate(success.token)!)
            .failedSecondFactorAttempts,
        ).toBe(0);
      } finally {
        await reopened.close();
      }
    });
  });
}, 60_000);

it.each(['reopened', 'committing'] as const)(
  'SEC-RESTORE-AUTH-2: failure after %s reloads rollback keys for retained auth helpers and counters',
  async (phase) => {
    await withPersistence(async (source) => {
      const archive = await sourceArchive(source);
      await withPersistence(async (destination) => {
        const auth = new AuthService(destination);
        const limiter = new AuthRateLimiter(destination);
        const initial = await createFixtureAccount(
          auth,
          destinationPassword,
          ip,
        );
        const identity = auth.authenticate(initial.token)!;
        const oldKey = destination.storage.readKeys().totpEncryptionKey;
        destination.write((tx) =>
          limiter.countFailure(
            tx,
            FAILURES_SINCE_SUCCESS,
            FAILURES_SINCE_SUCCESS_WINDOW_MS,
            Date.now(),
          ),
        );
        const disk = new DiskBudget(destination.storage.root, 0);
        const restores = new RestoreService(
          destination,
          auth,
          new BackupService(destination, auth, disk),
          disk,
          {
            checkpoint: async (current) => {
              if (current === phase)
                throw new Error('synthetic auth-key rollback');
            },
          },
        );
        const grant = async () =>
          (
            await auth.freshAuth(
              identity,
              'restore',
              destinationPassword,
              undefined,
              ip,
            )
          ).token;
        const summary = await restores.upload(
          identity,
          new Request('http://localhost/api/restores', {
            method: 'POST',
            headers: {
              'x-archive-bytes': String(archive.bytes.length),
              'x-restore-grant': await grant(),
            },
            body: new Uint8Array(archive.bytes),
          }),
        );
        await expect(
          restores.confirm(identity, {
            id: summary.id,
            confirmed: true,
            grant: await grant(),
          }),
        ).rejects.toThrow(/previous application was restored/);
        expect(destination.storage.readKeys().totpEncryptionKey).toBe(oldKey);
        expect(auth.securityStatus(identity).failedSecondFactorAttempts).toBe(
          1,
        );
        expect(
          new AuthService(destination).securityStatus(identity)
            .failedSecondFactorAttempts,
        ).toBe(1);
        expect(
          limiter.failureCount(
            destination.db,
            FAILURES_SINCE_SUCCESS,
            Date.now(),
          ),
        ).toBe(1);
        const next = await auth.login(
          'fixture',
          destinationPassword,
          ip,
          initial.device!.token,
        );
        if (next.mfaRequired)
          throw new Error('unexpected restored MFA after rollback');
        expect(next.device!.token.split('.')[1]).toBe(
          initial.device!.token.split('.')[1],
        );
        const owner = destination.db.select().from(account).get()!;
        expect(
          new DeviceTrust(oldKey).verify(next.device!.token, owner, Date.now()),
        ).not.toBeNull();
        expect(
          new DeviceTrust(source.storage.readKeys().totpEncryptionKey).verify(
            next.device!.token,
            owner,
            Date.now(),
          ),
        ).toBeNull();
      });
    });
  },
  60_000,
);
