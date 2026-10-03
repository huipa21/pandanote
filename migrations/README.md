# Trusted SQLite migrations

`0000_foundation.sql` is generated from `src/lib/server/db/schema.ts` by Drizzle
Kit 0.31.11. `0001_invariant_guards.sql` is a reviewed custom migration for
revision/identity, ready-reference and reference-safe cleanup triggers. Drizzle
snapshots describe tables/indexes/checks, not these custom triggers.
`0002_setup_tokens.sql` adds the singleton hashed, expiring operator setup token
(S02 first slice). Schema version is now 3. Pending setup tokens are runtime
credentials and must be excluded from S16 full backup snapshots.

- Generate table changes: `npm run db:generate -- --name=<name>`.
- Generate custom SQL: `npm run db:generate -- --custom --name=<name>`.
- Review and commit SQL, snapshots and `meta/_journal.json` together; update
  `SCHEMA_VERSION` in `src/lib/server/db/migrations.ts`.
- Stop the application, then run **`npm run db:migrate`** from the repository
  root with the configured private `DATA_DIR` before serving requests.
- Never use `drizzle-kit push`, auto-migrate in a request, edit already-applied
  SQL, execute SQL from an uploaded archive, or run a second application writer.

The application runner uses Drizzle's versioned SQL/journal format but owns a
contiguous, SHA-256 checked `__pandanote_migrations` ledger plus SQLite
`user_version` (journal index + 1). SHA-256 uses LF-normalized SQL so Windows and
Linux checkouts agree. All pending migrations run under one IMMEDIATE
transaction, including the ledger and integrity/foreign-key verification.
Failures roll back to the old schema. Unknown databases, modified applied
history and downgrades are rejected. Rollback is transaction rollback on failure,
not a destructive down-migration feature.

Runtime `Persistence` requires the current trusted migration history; it does
not create schema. This check is not archive schema validation: S17 must compare
all schema objects, including these triggers, before opening untrusted restore
content through normal persistence/migrations.

The schema reserves `note_search` with separately normalized body and JSON
arrays for tag/filename fields. S10 adds FTS5 trigram and synchronization/reindex;
there is no product search implementation in S01.
