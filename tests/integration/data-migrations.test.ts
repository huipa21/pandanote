import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import {
  applyMigrations,
  assertMigrationState,
  migrationState,
  NEWER_DATABASE_MESSAGE,
  PRE_RELEASE_DATABASE_MESSAGE,
  type Migration,
} from '../../src/lib/server/db/migrations.ts';
import type { DataMigrationRegistry } from '../../src/lib/server/db/data-migrations.ts';

const history: Migration[] = [
  {
    version: 1,
    name: '0000_synthetic',
    hash: 'a'.repeat(64),
    statements: [
      'CREATE TABLE sample (id INTEGER PRIMARY KEY, value TEXT NOT NULL)',
      "INSERT INTO sample VALUES (1, 'before')",
    ],
  },
  {
    version: 2,
    name: '0001_synthetic',
    hash: 'b'.repeat(64),
    statements: ['ALTER TABLE sample ADD COLUMN changed_at INTEGER'],
  },
  {
    version: 3,
    name: '0002_synthetic',
    hash: 'c'.repeat(64),
    statements: ['CREATE INDEX sample_value ON sample(value)'],
  },
];
const steps: DataMigrationRegistry = new Map([
  [
    2,
    {
      name: 'sample-upgrade-v1',
      run: (db, ctx) => {
        db.prepare('UPDATE sample SET value=?, changed_at=?').run(
          'after',
          ctx.now,
        );
      },
    },
  ],
  [
    3,
    {
      name: 'sample-final-v1',
      run: (db, ctx) => {
        db.prepare('INSERT INTO sample VALUES (2, ?, ?)').run(
          'second',
          ctx.now,
        );
      },
    },
  ],
]);
const snapshot = (db: Database.Database) => ({
  schema: db.prepare('SELECT * FROM sqlite_schema ORDER BY type,name').all(),
  rows: db.prepare('SELECT * FROM sample ORDER BY id').all(),
  ledger: db
    .prepare('SELECT * FROM __pandanote_migrations ORDER BY version')
    .all(),
  version: db.pragma('user_version', { simple: true }),
});
it('runs each SQL before its data step, with one fixed now; records identities and repeats as a no-op', () => {
  const db = new Database(':memory:');
  try {
    applyMigrations(db, history.slice(0, 1), { dataSteps: steps, now: 1 });
    expect(migrationState(db, history, { dataSteps: steps }).pending).toBe(2);
    applyMigrations(db, history, { dataSteps: steps, now: 123 });
    expect(db.prepare('SELECT * FROM sample ORDER BY id').all()).toEqual([
      { id: 1, value: 'after', changed_at: 123 },
      { id: 2, value: 'second', changed_at: 123 },
    ]);
    expect(
      db
        .prepare(
          'SELECT version, applied_at, data_step FROM __pandanote_migrations ORDER BY version',
        )
        .all(),
    ).toEqual([
      { version: 1, applied_at: 1, data_step: null },
      { version: 2, applied_at: 123, data_step: 'sample-upgrade-v1' },
      { version: 3, applied_at: 123, data_step: 'sample-final-v1' },
    ]);
    const before = snapshot(db);
    applyMigrations(db, history, { dataSteps: steps, now: 999 });
    expect(snapshot(db)).toEqual(before);
    assertMigrationState(db, history, { dataSteps: steps });
    for (const changed of [
      new Map(),
      new Map([[2, { ...steps.get(2)!, name: 'changed' }]]),
    ])
      expect(() =>
        applyMigrations(db, history, { dataSteps: changed }),
      ).toThrow(/data step changed/);
    db.exec(
      "UPDATE __pandanote_migrations SET data_step='tampered' WHERE version=1",
    );
    expect(() =>
      assertMigrationState(db, history, { dataSteps: steps }),
    ).toThrow(/history/);
  } finally {
    db.close();
  }
});
it.each(['sql', 'data'] as const)(
  'rolls back ALL pending SQL, data, user_version and ledger on %s failure, without leaking the cause',
  (failure) => {
    const db = new Database(':memory:');
    try {
      applyMigrations(db, history.slice(0, 1), { dataSteps: steps, now: 1 });
      const before = snapshot(db);
      const failedHistory = history.map((m) =>
        m.version === 3 && failure === 'sql'
          ? {
              ...m,
              statements: [...m.statements, 'INSERT INTO missing VALUES (1)'],
            }
          : m,
      );
      const failedSteps =
        failure === 'data'
          ? new Map([
              ...steps,
              [
                3,
                {
                  name: 'sample-final-v1',
                  run: () => {
                    throw new Error('private synthetic note content');
                  },
                },
              ],
            ])
          : steps;
      expect(() =>
        applyMigrations(db, failedHistory, {
          dataSteps: failedSteps,
          now: 123,
        }),
      ).toThrow(
        'Database upgrade failed at migration 3 (0002_synthetic); data unchanged.',
      );
      expect(snapshot(db)).toEqual(before);
      applyMigrations(db, history, { dataSteps: steps, now: 456 });
      expect(db.pragma('user_version', { simple: true })).toBe(3);
    } finally {
      db.close();
    }
  },
);
it('rejects async/non-void steps and validates integrity inside the same transaction', () => {
  const db = new Database(':memory:');
  try {
    applyMigrations(db, history.slice(0, 1), { dataSteps: steps });
    const before = snapshot(db);
    const asyncSteps: DataMigrationRegistry = new Map([
      [2, { name: 'async', run: async () => {} }],
    ]);
    expect(() =>
      applyMigrations(db, history, { dataSteps: asyncSteps }),
    ).toThrow(/registry/);
    const invalidSteps: DataMigrationRegistry = new Map([
      [2, { name: 'returning', run: () => 123 }],
    ]);
    expect(() =>
      applyMigrations(db, history, { dataSteps: invalidSteps }),
    ).toThrow(/data unchanged/);
    db.pragma('foreign_keys=ON');
    const foreignKeyHistory = history.slice(0, 2).map((m) =>
      m.version === 2
        ? {
            ...m,
            statements: [
              ...m.statements,
              'CREATE TABLE bad_reference (parent INTEGER REFERENCES sample(id) DEFERRABLE INITIALLY DEFERRED)',
              'INSERT INTO bad_reference VALUES (999)',
            ],
          }
        : m,
    );
    expect(() =>
      applyMigrations(db, foreignKeyHistory, { dataSteps: steps }),
    ).toThrow(/data unchanged/);
    expect(snapshot(db)).toEqual(before);
    expect(db.pragma('foreign_key_check')).toEqual([]);
  } finally {
    db.close();
  }
});
it('refuses pre-release ledgers, downgrade, hash drift and unknown databases before changing anything', () => {
  const db = new Database(':memory:');
  const empty = new Map();
  try {
    db.exec(
      'CREATE TABLE __pandanote_migrations (version INTEGER PRIMARY KEY, name TEXT, hash TEXT, applied_at INTEGER)',
    );
    db.prepare('INSERT INTO __pandanote_migrations VALUES (1, ?, ?, 1)').run(
      '0000_foundation',
      'a'.repeat(64),
    );
    db.pragma('user_version=1');
    expect(() => applyMigrations(db, history, { dataSteps: empty })).toThrow(
      PRE_RELEASE_DATABASE_MESSAGE,
    );
    db.exec('DROP TABLE __pandanote_migrations');
    db.pragma('user_version=0');
    applyMigrations(db, history, { dataSteps: steps });
    expect(() =>
      applyMigrations(db, history.slice(0, 1), { dataSteps: steps }),
    ).toThrow(NEWER_DATABASE_MESSAGE);
    expect(() =>
      applyMigrations(
        db,
        [{ ...history[0], hash: '0'.repeat(64) }, ...history.slice(1)],
        { dataSteps: steps },
      ),
    ).toThrow(/SQL hash/);
    db.exec(
      "UPDATE __pandanote_migrations SET name='0000_foundation' WHERE version=1",
    );
    expect(() => applyMigrations(db, history, { dataSteps: steps })).toThrow(
      PRE_RELEASE_DATABASE_MESSAGE,
    );
  } finally {
    db.close();
  }
  const unknown = new Database(':memory:');
  try {
    unknown.exec('CREATE TABLE unknown (id INTEGER)');
    expect(() =>
      applyMigrations(unknown, history, { dataSteps: empty }),
    ).toThrow(/unrecognized/);
    expect(unknown.prepare('SELECT name FROM sqlite_schema').all()).toEqual([
      { name: 'unknown' },
    ]);
  } finally {
    unknown.close();
  }
});
