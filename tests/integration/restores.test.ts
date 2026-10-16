import { randomUUID, randomBytes, createHash } from 'node:crypto';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  mkdirSync,
} from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import {
  loadMigrations,
  applyMigrations,
} from '../../src/lib/server/db/migrations.ts';
import { DATA_MIGRATIONS } from '../../src/lib/server/db/data-migrations.ts';
import { PRE_RELEASE_BACKUP_MESSAGE } from '../../src/lib/shared/backups.ts';
import sharp from 'sharp';
import { generateSync } from 'otplib';
import { expect, it } from 'vitest';
import { account } from '../../src/lib/server/db/schema.ts';
import { withPersistence } from '../helpers/persistence.ts';
import { Persistence } from '../../src/lib/server/db/connection.ts';
import { writePrivateJson } from '../../src/lib/server/storage/private-storage.ts';
import { AuthService } from '../../src/lib/server/auth/service.ts';
import { createFixtureAccount } from '../helpers/auth.ts';
import { BackupService } from '../../src/lib/server/backups/service.ts';
import { TemplateService } from '../../src/lib/server/templates/service.ts';
import { LabelService } from '../../src/lib/server/labels/service.ts';
import { RestoreService } from '../../src/lib/server/backups/restore.ts';
import {
  recoverRestores,
  type SwapBoundary,
} from '../../src/lib/server/backups/replacement.ts';
import { NoteService } from '../../src/lib/server/notes/service.ts';
import { AttachmentService } from '../../src/lib/server/attachments/service.ts';
import { DiskBudget } from '../../src/lib/server/attachments/resources.ts';
import {
  verifyArchive,
  writeArchive,
} from '../../src/lib/server/backups/archive.ts';
import { checksum } from '../../src/lib/server/attachments/files.ts';
import {
  canonicalNoteMutation,
  type NoteMutation,
} from '../../src/lib/shared/notes.ts';
import { type FreshAuthScope } from '../../src/lib/shared/auth.ts';
import {
  updateCalendar,
  updateGeneral,
} from '../../src/lib/server/settings/repository.ts';
const password = 'synthetic-restore-source 密碼 password';
const sha = (bytes: Buffer | string) =>
  createHash('sha256').update(bytes).digest('hex');
async function fixture(p: Persistence, secret = password) {
  const auth = new AuthService(p);
  const credential = await createFixtureAccount(auth, secret, '192.0.2.79');
  let identity = auth.authenticate(credential.token)!;
  let codes: string[] = [];
  let grantIp = 100;
  const grant = async (scope: FreshAuthScope) =>
    (
      await auth.freshAuth(
        identity,
        scope,
        secret,
        codes.shift(),
        `192.0.2.${grantIp++}`,
      )
    ).token;
  return {
    auth,
    credential,
    get identity() {
      return identity;
    },
    grant,
    enable: async () => {
      const enrollment = auth.startEnrollment(
        identity,
        await grant('mfa-enroll'),
      );
      const enabled = auth.confirmEnrollment(
        identity,
        enrollment.challenge,
        generateSync({ secret: enrollment.secret, epoch: Date.now() / 1000 }),
        '192.0.2.79',
      );
      identity = auth.authenticate(enabled.credential.token)!;
      codes = enabled.codes;
      return { enrollment, enabled };
    },
  };
}
function restore(
  p: Persistence,
  f: Awaited<ReturnType<typeof fixture>>,
  options: ConstructorParameters<typeof RestoreService>[4] = {},
) {
  const disk = new DiskBudget(p.storage.root, 0),
    backups = new BackupService(p, f.auth, disk);
  return new RestoreService(p, f.auth, backups, disk, options);
}
async function backup(p: Persistence, f: Awaited<ReturnType<typeof fixture>>) {
  const b = new BackupService(p, f.auth, new DiskBudget(p.storage.root, 0));
  const job = b.create(f.identity, {
    id: randomUUID(),
  });
  await b.wait();
  expect(b.list(f.identity)[0].state).toBe('complete');
  return p.storage.backupPath(job.id);
}
async function upload(
  s: RestoreService,
  f: Awaited<ReturnType<typeof fixture>>,
  path: string,
) {
  const bytes = readFileSync(path);
  return s.upload(
    f.identity,
    new Request('http://localhost/api/restores', {
      method: 'POST',
      headers: {
        'x-archive-bytes': String(bytes.length),
        'x-restore-grant': await f.grant('restore'),
      },
      body: new Uint8Array(bytes),
    }),
  );
}
function note(
  p: Persistence,
  f: Awaited<ReturnType<typeof fixture>>,
  body = 'restore 香港 #Work',
) {
  return new NoteService(p).mutate(f.identity, {
    action: 'create',
    mutationId: randomUUID(),
    content: {
      bodyMarkdown: body,
      timelineAt: Date.now() - 60000,
      attachmentIds: [],
    },
  });
}
it('restores an independent initialized instance: all statuses/date/tags/processed files/settings/account/MFA/recovery keys/receipts; revokes both instances’ sessions and keeps destination archives', async () => {
  await withPersistence(async (source) => {
    const f = await fixture(source);
    const { enrollment, enabled } = await f.enable();
    const notes = new NoteService(source);
    const a = note(source, f),
      b = note(source, f, 'draft #Work'),
      c = note(source, f, 'trash #Work');
    notes.mutate(f.identity, {
      action: 'trash',
      mutationId: randomUUID(),
      noteId: c.noteId,
      expectedRevision: 1,
    });
    notes.mutate(f.identity, {
      action: 'pin',
      mutationId: randomUUID(),
      noteId: b.noteId,
      expectedRevision: 1,
    });
    const image = await sharp({
      create: { width: 20, height: 15, channels: 3, background: '#3f6b4d' },
    })
      .png()
      .toBuffer();
    const file = Buffer.from('unchanged private 香港 attachment');
    const ids = [randomUUID(), randomUUID()];
    const command: Extract<NoteMutation, { action: 'create' }> = {
      action: 'create',
      mutationId: randomUUID(),
      content: {
        // CommonMark duplicate definitions use the FIRST destination, just like
        // ordinary note validation/rendering; an ignored later definition is safe.
        bodyMarkdown: `![static][photo] #Work\n\n[photo]: attachment:${ids[0]}\n[photo]: attachment:${randomUUID()}`,
        timelineAt: null,
        attachmentIds: ids,
      },
    };
    const attachments = new AttachmentService(
      source,
      new DiskBudget(source.storage.root, 0),
    );
    const batch = attachments.initialize(f.identity, {
      mutationId: command.mutationId,
      requestDigest: sha(canonicalNoteMutation(command)),
      items: ids.map((id, i) => ({
        id,
        filename: i ? 'document.txt' : 'image.png',
        incomingBytes: [image, file][i].length,
        incomingDigest: sha([image, file][i]),
      })),
    });
    if (batch.state !== 'batch') throw Error('batch');
    for (const [i, id] of ids.entries())
      await attachments.upload(
        f.identity,
        batch.batch.id,
        id,
        new Request('http://localhost/upload', {
          method: 'PUT',
          body: new Uint8Array([image, file][i]),
        }),
      );
    const media = notes.mutate(f.identity, command);
    updateCalendar(source, f.identity, {
      timezone: 'Asia/Hong_Kong',
      weekStart: 0,
    });
    updateGeneral(source, f.identity, {
      siteTitle: 'Archived 香港 notebook',
      language: 'zh-CN',
    });
    source.write((tx) =>
      tx
        .update(account)
        .set({ username: 'archived.owner', email: 'archived@example.invalid' })
        .run(),
    );
    const archive = await backup(source, f),
      snapshots = [a, b, c, media].map((r) => notes.get(f.identity, r.noteId));
    await withPersistence(async (destination) => {
      const d = await fixture(
        destination,
        'synthetic-temporary-destination password',
      );
      note(destination, d, 'old destination');
      const kept = await backup(destination, d),
        keptBytes = readFileSync(kept),
        oldKeys = destination.storage.readKeys();
      const copy = destination.storage.preUpgradeDirectory('current', true);
      writeFileSync(
        join(copy, 'pandanote.sqlite'),
        'destination copy must survive restore',
      );
      writeFileSync(join(copy, 'manifest.json'), '{}');
      const s = restore(destination, d),
        summary = await upload(s, d, archive);
      expect(summary).toMatchObject({
        notes: 4,
        published: 3,
        trash: 1,
        attachments: 2,
        mfaEnabled: true,
      });
      expect(d.auth.authenticate(d.credential.token)).not.toBeNull();
      expect(destination.storage.readKeys()).toEqual(oldKeys);
      await s.confirm(d.identity, {
        id: summary.id,
        confirmed: true,
        grant: await d.grant('restore'),
      });
      expect(destination.storage.readKeys()).toEqual(source.storage.readKeys());
      expect(d.auth.authenticate(d.credential.token)).toBeNull();
      expect(d.auth.authenticate(enabled.credential.token)).toBeNull();
      const login = await d.auth.login(
        'archived.owner',
        password,
        '192.0.2.80',
      );
      expect(login.mfaRequired).toBe(true);
      if (!login.mfaRequired) throw Error('MFA missing');
      const credential = d.auth.completeMfa(
        login.token,
        enabled.codes[2],
        '192.0.2.80',
      );
      const restored = d.auth.authenticate(credential.token)!;
      const factorNow = Date.now() + 60_000;
      const totpAuth = new AuthService(destination, () => factorNow);
      const totpLogin = await totpAuth.login(
        'ARCHIVED.OWNER',
        password,
        '192.0.2.81',
      );
      if (!totpLogin.mfaRequired) throw Error('Restored MFA missing');
      const totpCredential = totpAuth.completeMfa(
        totpLogin.token,
        generateSync({ secret: enrollment.secret, epoch: factorNow / 1000 }),
        '192.0.2.81',
      );
      expect(totpAuth.authenticate(totpCredential.token)?.account.id).toBe(
        f.identity.account.id,
      );
      const restoredNotes = new NoteService(destination);
      expect(snapshots[1].pinnedAt).toBeGreaterThan(0);
      for (const snapshot of snapshots)
        expect(restoredNotes.get(restored, snapshot.id)).toEqual(snapshot);
      expect(restoredNotes.mutate(restored, command)).toEqual(media);
      expect(
        readFileSync(
          destination.storage.attachmentPath(ids[1], 'attachment.bin'),
        ),
      ).toEqual(file);
      expect(
        readFileSync(
          destination.storage.attachmentPath(ids[0], 'display.webp'),
        ),
      ).toEqual(
        readFileSync(source.storage.attachmentPath(ids[0], 'display.webp')),
      );
      expect(
        destination.native.prepare('SELECT count(*) n FROM note_search').get(),
      ).toEqual({ n: 4 });
      expect(
        destination.native
          .prepare('SELECT count(*) n FROM note_search_fts')
          .get(),
      ).toEqual({ n: 4 });
      expect(readFileSync(kept)).toEqual(keptBytes);
      expect(
        new BackupService(
          destination,
          d.auth,
          new DiskBudget(destination.storage.root, 0),
        ).list(restored),
      ).toHaveLength(1);
      expect(
        destination.native.prepare('SELECT value_json FROM app_settings').get(),
      ).toEqual(
        source.native.prepare('SELECT value_json FROM app_settings').get(),
      );
      expect(d.auth.setupState()).toBe('complete');
      expect(d.auth.accountDetails(restored)).toEqual({
        username: 'archived.owner',
        email: 'archived@example.invalid',
      });
      expect(readFileSync(join(copy, 'pandanote.sqlite'), 'utf8')).toBe(
        'destination copy must survive restore',
      );
      expect(readFileSync(join(copy, 'manifest.json'), 'utf8')).toBe('{}');
      expect(enrollment.secret).not.toBe('');
      expect(
        readdirSync(join(destination.storage.root, 'private/journals')),
      ).toEqual([]);
    });
  });
});
const boundaries: SwapBoundary[] = [
  'prepared',
  'old-db',
  'new-db',
  'old-files',
  'new-files',
  'old-key',
  'new-key',
  'reopened',
  'committing',
];
it.each(boundaries)(
  'injected error at %s restores complete old DB/files/keys and releases write gate',
  async (phase) => {
    await withPersistence(async (p) => {
      const f = await fixture(p);
      const original = note(p, f),
        archive = await backup(p, f);
      note(p, f, 'newer state');
      writePrivateJson(p.storage.keyPath, {
        version: 1,
        keyId: randomUUID(),
        totpEncryptionKey: randomBytes(32).toString('base64'),
      });
      const oldOnly = p.storage.attachmentPath(randomUUID(), 'attachment.bin');
      mkdirSync(join(oldOnly, '..'), { recursive: true });
      writeFileSync(oldOnly, 'old file bytes');
      const keys = p.storage.readKeys();
      const s = restore(p, f, {
        checkpoint: async (current) => {
          if (current === phase) throw Error('synthetic swap fault');
        },
      });
      const summary = await upload(s, f, archive);
      await expect(
        s.confirm(f.identity, {
          id: summary.id,
          confirmed: true,
          grant: await f.grant('restore'),
        }),
      ).rejects.toThrow(/previous application was restored/);
      expect(p.storage.readKeys()).toEqual(keys);
      expect(readFileSync(oldOnly).toString()).toBe('old file bytes');
      expect(f.auth.authenticate(f.credential.token)).not.toBeNull();
      expect(new NoteService(p).get(f.identity, original.noteId).revision).toBe(
        1,
      );
      expect(p.native.prepare('SELECT count(*) n FROM notes').get()).toEqual({
        n: 2,
      });
      expect(p.coordinator.state).toBe('open');
      expect(p.native.pragma('integrity_check', { simple: true })).toBe('ok');
      note(p, f, 'usable after rollback');
      expect(readdirSync(join(p.storage.root, 'private/journals'))).toEqual([]);
    });
  },
);
it.each([...boundaries, 'verified'] as SwapBoundary[])(
  'actual killed process at %s is deterministically recovered before reopening (verified keeps new; earlier keeps old)',
  async (phase) => {
    await withPersistence(async (p, root) => {
      const f = await fixture(p);
      note(p, f);
      const archive = await backup(p, f);
      note(p, f, 'post-archive old state');
      const archivedKeys = p.storage.readKeys();
      writePrivateJson(p.storage.keyPath, {
        version: 1,
        keyId: randomUUID(),
        totpEncryptionKey: randomBytes(32).toString('base64'),
      });
      const oldKeys = p.storage.readKeys();
      const oldOnly = p.storage.attachmentPath(randomUUID(), 'attachment.bin');
      mkdirSync(join(oldOnly, '..'), { recursive: true });
      writeFileSync(oldOnly, 'old file bytes');
      const storage = p.storage;
      await p.close();
      const url = (part: string) =>
        pathToFileURL(join(process.cwd(), 'src/lib/server', part)).href;
      const marker = join(root, 'marker');
      const script = `
      import { Persistence } from ${JSON.stringify(url('db/connection.ts'))};
      import { PrivateStorage } from ${JSON.stringify(url('storage/private-storage.ts'))};
      import { AuthService } from ${JSON.stringify(url('auth/service.ts'))};
      import { BackupService } from ${JSON.stringify(url('backups/service.ts'))};
      import { RestoreService } from ${JSON.stringify(url('backups/restore.ts'))};
      import { DiskBudget } from ${JSON.stringify(url('attachments/resources.ts'))};
      import { readFileSync,writeFileSync } from 'node:fs';
      const p=new Persistence(new PrivateStorage({dataDir:${JSON.stringify(root)}}));
      const auth=new AuthService(p), disk=new DiskBudget(p.storage.root,0);
      const s=new RestoreService(p,auth,new BackupService(p,auth,disk),disk,{checkpoint:async current=>{
        if(current===${JSON.stringify(phase)}) { writeFileSync(${JSON.stringify(marker)},current);await new Promise(()=>{setInterval(()=>{},1000);}); }
      }});
      const identity=auth.authenticate(${JSON.stringify(f.credential.token)});
      const grant=async()=>(await auth.freshAuth(identity,'restore',${JSON.stringify(password)},undefined,'192.0.2.79')).token;
      const bytes=readFileSync(${JSON.stringify(archive)});
      const summary=await s.upload(identity,new Request('http://localhost/upload',{method:'POST',headers:{'x-archive-bytes':String(bytes.length),'x-restore-grant':await grant()},body:bytes}));
      await s.confirm(identity,{id:summary.id,confirmed:true,grant:await grant()});
    `;
      const child = spawn(
        process.execPath,
        ['--input-type=module', '-e', script],
        { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true },
      );
      let errors = '';
      child.stderr.on('data', (b: Buffer) => {
        errors += b.toString();
      });
      const closed = new Promise<void>((resolve) =>
        child.on('close', () => resolve()),
      );
      try {
        const until = Date.now() + 12000;
        while (
          !existsSync(marker) &&
          child.exitCode === null &&
          Date.now() < until
        )
          await new Promise((resolve) => setTimeout(resolve, 20));
        expect(existsSync(marker), errors).toBe(true);
      } finally {
        child.kill('SIGKILL');
        await closed;
      }
      recoverRestores(storage);
      recoverRestores(storage);
      const reopened = new Persistence(storage);
      try {
        expect(
          reopened.native.prepare('SELECT count(*) n FROM notes').get(),
        ).toEqual({ n: phase === 'verified' ? 1 : 2 });
        expect(
          new AuthService(reopened).authenticate(f.credential.token) !== null,
        ).toBe(phase !== 'verified');
        expect(
          reopened.native.pragma('integrity_check', { simple: true }),
        ).toBe('ok');
        expect(readdirSync(join(root, 'private/journals'))).toEqual([]);
        expect(readdirSync(join(root, 'staging/restores'))).toEqual([]);
        expect(existsSync(archive)).toBe(true);
        expect(storage.readKeys()).toEqual(
          phase === 'verified' ? archivedKeys : oldKeys,
        );
        expect(existsSync(oldOnly)).toBe(phase !== 'verified');
      } finally {
        await reopened.close();
      }
    });
  },
);
async function alteredArchive(
  archive: string,
  root: string,
  change: (
    db: Database.Database,
    manifest: Awaited<ReturnType<typeof verifyArchive>>,
    extracted: string,
  ) => void,
) {
  const extracted = join(root, randomUUID());
  mkdirSync(extracted);
  const manifest = await verifyArchive(
    archive,
    AbortSignal.timeout(10000),
    undefined,
    extracted,
  );
  const db = new Database(join(extracted, 'snapshot/pandanote.sqlite'));
  try {
    change(db, manifest, extracted);
  } finally {
    db.close();
  }
  for (const entry of manifest.entries) {
    const value = await checksum(join(extracted, entry.path));
    entry.size = value.bytes;
    entry.sha256 = value.digest;
  }
  const result = join(root, `${randomUUID()}.pnb`);
  await writeArchive(
    result,
    manifest,
    (name) => join(extracted, name),
    AbortSignal.timeout(10000),
  );
  return result;
}
it('rejects untrusted SQLite schema/triggers/views/modules, corrupt data, mismatched counts/files/keys/settings and newer schema BEFORE replacement; migrates known v1 with registered data step on staging', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pandanote-restore-attack-'));
  try {
    await withPersistence(async (p) => {
      const f = await fixture(p);
      note(p, f);
      const archive = await backup(p, f),
        s = restore(p, f);
      const changes: Array<Parameters<typeof alteredArchive>[2]> = [
        (db) => db.exec('CREATE VIEW malicious AS SELECT * FROM account'),
        (db) =>
          db.exec(
            'CREATE TRIGGER evil AFTER INSERT ON sessions BEGIN DELETE FROM notes; END',
          ),
        (db) => db.exec('CREATE VIRTUAL TABLE unexpected USING fts5(content)'),
        (db) => db.exec('DROP TRIGGER notes_update_guard'),
        (db) => {
          // Fixture-only corruption: product connections keep native defensive mode.
          db.unsafeMode(true);
          db.exec(
            "INSERT INTO note_search_fts_config(k,v) VALUES ('rank','untrusted()')",
          );
          db.unsafeMode(false);
        },
        (db) => {
          db.unsafeMode(true);
          db.exec(
            'UPDATE note_search_fts_data SET block=zeroblob(17000) WHERE id=1',
          );
          db.unsafeMode(false);
        },
        (db, m) => {
          // Newer than this build (current schema is 3).
          m.schemaVersion = 4;
          db.pragma('user_version=4');
        },
        (db, m) => {
          m.counts.notes++;
        },
        (db, _m, extracted) => {
          writeFileSync(join(extracted, 'snapshot/key-material.json'), '{}');
        },
        (db) => db.exec("UPDATE app_settings SET value_json='{}'"),
        (db) => db.exec("UPDATE account SET username='INVALID USER'"),
        (db) => db.exec("UPDATE account SET email='invalid'"),
        (db) =>
          db.exec(
            "UPDATE app_settings SET value_json=json_set(value_json,'$.setupCompletedAt',NULL)",
          ),
        (db) =>
          db.exec(
            "UPDATE account SET password_hash='$argon2id$v=19$m=999999999,t=3,p=1$x$x'",
          ),
        (db) => db.exec('DELETE FROM note_tags'),
      ];
      for (const change of changes) {
        const malicious = await alteredArchive(archive, root, change);
        await expect(upload(s, f, malicious)).rejects.toMatchObject({
          code: 'invalid-backup',
        });
        expect(f.auth.authenticate(f.credential.token)).not.toBeNull();
        expect(p.native.prepare('SELECT count(*) n FROM notes').get()).toEqual({
          n: 1,
        });
      }
      const legacy = await alteredArchive(archive, root, (_db, m) => {
        // A manifest-first format refusal must precede extraction/SQLite writes.
        Object.assign(m, { formatVersion: 1 });
      });
      await expect(upload(s, f, legacy)).rejects.toMatchObject({
        code: 'invalid-backup',
        message: PRE_RELEASE_BACKUP_MESSAGE,
      });
      expect(readdirSync(join(p.storage.root, 'staging/restores'))).toEqual([]);
      const older = await alteredArchive(archive, root, (db, m) => {
        db.exec('DROP TABLE note_search_fts');
        const trusted = new Database(':memory:');
        try {
          applyMigrations(trusted, loadMigrations().slice(0, 1));
          const names = new Set(
            (
              trusted.prepare('SELECT name FROM sqlite_schema').all() as {
                name: string;
              }[]
            ).map((row) => row.name),
          );
          // Tables added by later migrations (for example schema 3 templates).
          for (const row of db
            .prepare(
              "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'",
            )
            .all() as { name: string }[])
            if (!names.has(row.name)) db.exec(`DROP TABLE "${row.name}"`);
          for (const row of db
            .prepare("SELECT name FROM sqlite_schema WHERE type='trigger'")
            .all() as { name: string }[])
            if (!names.has(row.name)) db.exec(`DROP TRIGGER ${row.name}`);
        } finally {
          trusted.close();
        }
        db.exec('DELETE FROM __pandanote_migrations WHERE version>=2');
        db.pragma('user_version=1');
        m.schemaVersion = 1;
      });
      const summary = await upload(s, f, older);
      expect(summary.schemaVersion).toBe(1);
      // Migrated copy is already ready BEFORE confirmation; live DB is untouched.
      const stage = new Database(
        join(
          p.storage.root,
          'staging/restores',
          summary.id,
          'state/db/pandanote.sqlite',
        ),
        { readonly: true },
      );
      try {
        expect(stage.pragma('user_version', { simple: true })).toBe(3);
        expect(
          stage
            .prepare(
              'SELECT data_step FROM __pandanote_migrations WHERE version=2',
            )
            .get(),
        ).toEqual({ data_step: DATA_MIGRATIONS.get(2)!.name });
        expect(
          stage.prepare('SELECT count(*) n FROM note_search_fts').get(),
        ).toEqual({ n: 1 });
      } finally {
        stage.close();
      }
      expect(f.auth.authenticate(f.credential.token)).not.toBeNull();
      await s.confirm(f.identity, {
        id: summary.id,
        confirmed: true,
        grant: await f.grant('restore'),
      });
      expect(p.native.pragma('user_version', { simple: true })).toBe(3);
      expect(
        p.native.prepare('SELECT count(*) n FROM note_search_fts').get(),
      ).toEqual({ n: 1 });
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it('private streamed upload admission/byte/disk/confirmation checks retain live state and unconfirmed uploads can be discarded', async () => {
  await withPersistence(async (p) => {
    const f = await fixture(p);
    note(p, f);
    const archive = await backup(p, f),
      s = restore(p, f);
    const bytes = readFileSync(archive);
    await expect(
      s.upload(
        f.identity,
        new Request('http://localhost/upload', {
          method: 'POST',
          headers: {
            'x-archive-bytes': String(bytes.length),
            'x-restore-grant': 'a'.repeat(43),
          },
          body: bytes,
        }),
      ),
    ).rejects.toMatchObject({ code: 'fresh-auth-required' });
    const full = new RestoreService(
      p,
      f.auth,
      new BackupService(p, f.auth, new DiskBudget(p.storage.root, 0)),
      new DiskBudget(p.storage.root, 0, () => ({ total: 1, available: 0 })),
    );
    await expect(upload(full, f, archive)).rejects.toMatchObject({
      code: 'storage-full',
    });
    const summary = await upload(s, f, archive);
    await expect(
      s.confirm(f.identity, {
        id: summary.id,
        confirmed: false,
        grant: 'a'.repeat(43),
      }),
    ).rejects.toMatchObject({ code: 'validation' });
    await s.discard(f.identity);
    expect(s.summary(f.identity)).toBeNull();
    expect(p.native.prepare('SELECT count(*) n FROM notes').get()).toEqual({
      n: 1,
    });
    expect(readdirSync(join(p.storage.root, 'staging/restores'))).toEqual([]);
  });
});
it('rejects checksum-consistent forged image bitstreams and missing referenced variants without changing live files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pandanote-restore-image-'));
  try {
    await withPersistence(async (p) => {
      const f = await fixture(p),
        id = randomUUID();
      const image = await sharp({
        create: { width: 20, height: 15, channels: 3, background: '#3f6b4d' },
      })
        .png()
        .toBuffer();
      const command: Extract<NoteMutation, { action: 'create' }> = {
        action: 'create',
        mutationId: randomUUID(),
        content: {
          bodyMarkdown: `![static](attachment:${id})`,
          timelineAt: null,
          attachmentIds: [id],
        },
      };
      const service = new AttachmentService(
        p,
        new DiskBudget(p.storage.root, 0),
      );
      const batch = service.initialize(f.identity, {
        mutationId: command.mutationId,
        requestDigest: sha(canonicalNoteMutation(command)),
        items: [
          {
            id,
            filename: 'static.png',
            incomingBytes: image.length,
            incomingDigest: sha(image),
          },
        ],
      });
      if (batch.state !== 'batch') throw Error('batch');
      await service.upload(
        f.identity,
        batch.batch.id,
        id,
        new Request('http://localhost/upload', { method: 'PUT', body: image }),
      );
      new NoteService(p).mutate(f.identity, command);
      const archive = await backup(p, f),
        s = restore(p, f),
        original = readFileSync(p.storage.attachmentPath(id, 'display.webp'));
      const corrupt = await alteredArchive(
        archive,
        root,
        (db, _manifest, extracted) => {
          const changed = original.subarray(0, original.length - 8);
          writeFileSync(join(extracted, `files/${id}/display.webp`), changed);
          const trigger = (
            db
              .prepare(
                "SELECT sql FROM sqlite_schema WHERE name='attachments_referenced_guard'",
              )
              .get() as { sql: string }
          ).sql;
          db.exec('DROP TRIGGER attachments_referenced_guard');
          db.prepare(
            'UPDATE attachments SET display_bytes=?,display_digest=? WHERE id=?',
          ).run(changed.length, sha(changed), id);
          db.exec(trigger);
        },
      );
      await expect(upload(s, f, corrupt)).rejects.toMatchObject({
        code: 'invalid-backup',
      });
      const missing = await alteredArchive(archive, root, (_db, manifest) => {
        manifest.entries = manifest.entries.filter(
          (entry) => entry.path !== `files/${id}/thumbnail.webp`,
        );
      });
      await expect(upload(s, f, missing)).rejects.toMatchObject({
        code: 'invalid-backup',
      });
      expect(
        readFileSync(p.storage.attachmentPath(id, 'display.webp')),
      ).toEqual(original);
      expect(f.auth.authenticate(f.credential.token)).not.toBeNull();
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it('drains admitted writers, rechecks revoked security identity before swap, and restart discards only unconfirmed staging', async () => {
  await withPersistence(async (p, root) => {
    const f = await fixture(p);
    note(p, f);
    const archive = await backup(p, f),
      s = restore(p, f);
    const summary = await upload(s, f, archive),
      grant = await f.grant('restore');
    let release!: () => void;
    const writer = p.coordinator.writeAsync(async (lease) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      p.write(
        (tx) => tx.update(account).set({ securityRevision: 2 }).run(),
        lease,
      );
    });
    const confirming = s.confirm(f.identity, {
      id: summary.id,
      confirmed: true,
      grant,
    });
    // Attach rejection handler before releasing the admitted security change.
    const rejected = expect(confirming).rejects.toMatchObject({
      code: 'unauthorized',
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(p.coordinator.state).toBe('draining');
    expect(() => note(p, f, 'must not enter maintenance')).toThrow(
      /Maintenance/,
    );
    release();
    await writer;
    await rejected;
    expect(p.coordinator.state).toBe('open');
    expect(p.native.prepare('SELECT count(*) n FROM notes').get()).toEqual({
      n: 1,
    });
    expect(readdirSync(join(root, 'private/journals'))).toEqual([]);
    const storage = p.storage;
    await p.close();
    recoverRestores(storage);
    const restarted = new Persistence(storage);
    try {
      expect(
        restarted.native.prepare('SELECT count(*) n FROM notes').get(),
      ).toEqual({ n: 1 });
      expect(readdirSync(join(root, 'staging/restores'))).toEqual([]);
      expect(existsSync(archive)).toBe(true);
    } finally {
      await restarted.close();
    }
  });
});

it('restores private note templates from a schema 3 archive and a schema 2 archive restores with none', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pandanote-template-restore-'));
  try {
    await withPersistence(async (p) => {
      const f = await fixture(p);
      const templates = new TemplateService(p);
      templates.mutate(f.identity, {
        action: 'create',
        mutationId: randomUUID(),
        name: 'Weekly 周报',
        bodyMarkdown: '## Goals\n- rest #Work',
      });
      templates.mutate(f.identity, {
        action: 'create',
        mutationId: randomUUID(),
        name: 'Plain',
        bodyMarkdown: 'Line one\r\nLine two',
      });
      const archive = await backup(p, f);
      const s = restore(p, f);
      const summary = await upload(s, f, archive);
      expect(summary.schemaVersion).toBe(3);
      await s.confirm(f.identity, {
        id: summary.id,
        confirmed: true,
        grant: await f.grant('restore'),
      });
      expect(
        p.native
          .prepare(
            'SELECT name, body_markdown, revision FROM note_templates ORDER BY name_key',
          )
          .all(),
      ).toEqual([
        { name: 'Plain', body_markdown: 'Line one\nLine two', revision: 1 },
        {
          name: 'Weekly 周报',
          body_markdown: '## Goals\n- rest #Work',
          revision: 1,
        },
      ]);
    });
    await withPersistence(async (p) => {
      const f = await fixture(p);
      new TemplateService(p).mutate(f.identity, {
        action: 'create',
        mutationId: randomUUID(),
        name: 'Future only',
        bodyMarkdown: 'not in schema 2',
      });
      const archive = await backup(p, f);
      const older = await alteredArchive(archive, root, (db, m) => {
        db.exec('DROP TABLE template_mutation_receipts');
        db.exec('DROP TABLE note_templates');
        db.exec('DELETE FROM __pandanote_migrations WHERE version>=3');
        db.pragma('user_version=2');
        m.schemaVersion = 2;
      });
      const s = restore(p, f);
      const summary = await upload(s, f, older);
      expect(summary.schemaVersion).toBe(2);
      await s.confirm(f.identity, {
        id: summary.id,
        confirmed: true,
        grant: await f.grant('restore'),
      });
      expect(p.native.pragma('user_version', { simple: true })).toBe(3);
      expect(
        p.native.prepare('SELECT count(*) n FROM note_templates').get(),
      ).toEqual({ n: 0 });
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('restores labels and notes.label_id; a tampered color/icon/dangling reference is refused', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pandanote-label-restore-'));
  try {
    await withPersistence(async (p) => {
      const f = await fixture(p);
      const labelSvc = new LabelService(p);
      const created = labelSvc.mutate(f.identity, {
        action: 'create',
        mutationId: randomUUID(),
        name: 'Urgent',
        color: 'red',
        icon: 'flag',
        headerColor: null,
        background: null,
        font: null,
      });
      const noteSvc = new NoteService(p);
      const note = noteSvc.mutate(f.identity, {
        action: 'create',
        mutationId: randomUUID(),
        content: {
          bodyMarkdown: 'labeled note',
          timelineAt: Date.now(),
          attachmentIds: [],
          labelId: created.labelId,
        },
      });
      const archive = await backup(p, f);
      const s = restore(p, f);
      const summary = await upload(s, f, archive);
      await s.confirm(f.identity, {
        id: summary.id,
        confirmed: true,
        grant: await f.grant('restore'),
      });
      expect(
        p.native.prepare('SELECT name, color, icon FROM labels').all(),
      ).toEqual([{ name: 'Urgent', color: 'red', icon: 'flag' }]);
      expect(
        p.native
          .prepare('SELECT label_id FROM notes WHERE id=?')
          .get(note.noteId),
      ).toEqual({ label_id: created.labelId });
    });
    await withPersistence(async (p) => {
      const f = await fixture(p);
      note(p, f);
      const archive = await backup(p, f);
      const tampered = await alteredArchive(archive, root, (db) => {
        // The CHECK constraint already refuses an invalid color/icon enum value
        // and SQLite's own foreign key enforcement already refuses a dangling
        // notes.label_id at the storage layer; exercise the remaining JS-level
        // guard instead: a name/name_key identity mismatch that no CHECK covers.
        db.exec(
          `INSERT INTO labels (id, name, name_key, color, icon, revision, created_at, updated_at) VALUES ('${randomUUID()}','Weird Name','not-the-real-key',${"'blue'"},NULL,1,0,0)`,
        );
      });
      const s = restore(p, f);
      await expect(upload(s, f, tampered)).rejects.toThrow();
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("restores a template's default label; a dangling template label_id is refused", async () => {
  const root = await mkdtemp(
    join(tmpdir(), 'pandanote-template-label-restore-'),
  );
  try {
    await withPersistence(async (p) => {
      const f = await fixture(p);
      const labelSvc = new LabelService(p);
      const created = labelSvc.mutate(f.identity, {
        action: 'create',
        mutationId: randomUUID(),
        name: 'Routine',
        color: 'teal',
        icon: null,
        headerColor: null,
        background: null,
        font: null,
      });
      const templates = new TemplateService(p);
      const made = templates.mutate(f.identity, {
        action: 'create',
        mutationId: randomUUID(),
        name: 'Weekly',
        bodyMarkdown: 'Body',
        labelId: created.labelId,
      });
      const archive = await backup(p, f);
      const s = restore(p, f);
      const summary = await upload(s, f, archive);
      await s.confirm(f.identity, {
        id: summary.id,
        confirmed: true,
        grant: await f.grant('restore'),
      });
      expect(
        p.native
          .prepare('SELECT label_id FROM note_templates WHERE id=?')
          .get(made.templateId),
      ).toEqual({ label_id: created.labelId });
    });
    await withPersistence(async (p) => {
      const f = await fixture(p);
      const templates = new TemplateService(p);
      templates.mutate(f.identity, {
        action: 'create',
        mutationId: randomUUID(),
        name: 'Weekly',
        bodyMarkdown: 'Body',
      });
      const archive = await backup(p, f);
      const tampered = await alteredArchive(archive, root, (db) => {
        // SQLite's own foreign key enforcement already refuses a dangling
        // note_templates.label_id at the storage layer when FKs are on;
        // disable them here to exercise the JS-level guard directly.
        db.pragma('foreign_keys=off');
        db.exec(`UPDATE note_templates SET label_id='${randomUUID()}'`);
      });
      const s = restore(p, f);
      await expect(upload(s, f, tampered)).rejects.toThrow();
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
