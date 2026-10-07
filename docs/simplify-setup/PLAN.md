# Simplify setup — implementation plan

Follow the steps in order; normally one step per session. Each step ends with the
common gate unless stated otherwise:

```sh
npm run check && npm run lint && npm run test:unit && npm run test:integration && npm run build
```

plus the affected Playwright specs. Record exact commands and real outcomes in
[PROGRESS.md](PROGRESS.md). Read [SPEC.md](SPEC.md) and [DECISIONS.md](DECISIONS.md)
first. Acceptance IDs refer to [ACCEPTANCE_TESTS.md](ACCEPTANCE_TESTS.md).

Greenfield rule: existing local `data/`, `.drill/` and test databases may be deleted;
no compatibility code for pre-release data or archives except the refusal messages.

---

## SS01 — Migration baseline, data steps, pre-upgrade copy

Files: `src/lib/server/db/schema.ts`, `src/lib/server/db/migrations.ts`, new
`src/lib/server/db/data-migrations.ts`, `migrations/`, `drizzle.config.ts`,
`migrations/README.md`, `tests/integration/migrations.test.ts`,
`tests/integration/search-migration.test.ts`.

1. Schema changes in `schema.ts`: `account.username` (text, not null),
   `account.email` (text, not null); delete the `setupTokens` table.
2. Delete `migrations/0000…0004` SQL + snapshots + journal; regenerate a baseline
   with `npm run db:generate -- --name=baseline`; add one reviewed custom migration
   (`--custom --name=guards_and_search`) carrying the existing triggers and FTS5
   objects from old `0001`/`0003`. Set `SCHEMA_VERSION` accordingly.
3. Data-step registry: `Map<version, { name, run(db, ctx: { now: number }) }>`;
   run each version's SQL then its data step inside the existing single IMMEDIATE
   transaction; extend the ledger with a nullable `data_step` column (created by the
   runner). Move the old trigram backfill special case into the registry pattern
   if still needed for the baseline (fresh DBs have nothing to backfill).
4. Pre-upgrade copy (`src/lib/server/db/pre-upgrade.ts`): only when the ledger exists
   and migrations are pending. Check free space (DB size × 1.1 + disk reserve).
   Write into `pre-upgrade.tmp/` with better-sqlite3 `backup()`,
   write manifest, fsync, then atomically replace `pre-upgrade/`. Mark the folder in
   `PrivateStorage` as a known private path.
5. Clear refusal errors (SPEC §8): pre-release ledger (`0000_foundation` name),
   newer schema, hash mismatch, failure at migration N. Safe log lines only.
6. Tests: fresh create; idempotent re-run; synthetic v1→v2 migration with a data
   step (success, SQL failure, data-step throw → full rollback, ledger unchanged);
   pre-upgrade copy written/replaced/skipped on fresh DB/insufficient space refusal;
   downgrade and pre-release refusal messages.

Gate: MIG-01–MIG-07 integration cases pass (unit/integration level).

## SS02 — One startup path, environment and proxy trust

Files: `scripts/container-entry.ts`, `scripts/container-bootstrap.ts`,
`scripts/container-user.ts`, `src/hooks.server.ts` (`init`), `src/lib/server/runtime.ts`,
`src/lib/server/auth/policy.ts`, `src/lib/server/storage/private-storage.ts`,
`package.json`, `.env.example`, `vite.config.ts` if needed.

1. Extract `initializeApplication(options)` (recover → keys → migrate → settings).
   Container entry calls it after dropping privileges; SvelteKit `init` hook calls it
   for `npm run dev`/`npm start` (no-op when current). Confirm adapter-node does not
   listen before `init` resolves; otherwise keep the entry-side call authoritative and
   make `/health` 503 until ready. Requests still never migrate.
2. Defaults: `DATA_DIR=./data` outside production; container forces `/data`;
   `ORIGIN` defaults to `http://localhost:5173` (dev) / `http://localhost:3000`
   (`npm start`, `NODE_ENV!=='production'`); production without `ORIGIN` fails with a
   one-line explanation.
3. Proxy trust per SPEC §9.4: replace `trustedProxyIps` with a private-range check
   (`node:net` `BlockList`). Ignore `TRUSTED_PROXY_IPS`/`SETUP_TOKEN` with one notice.
4. Entry command dispatch: default → server; `reset-password`, `reindex` → tools.
   Tools skip the ownership walk: verify `/data` is owned by PUID/PGID, drop
   privileges, run. Remove `SETUP_TOKEN` handling.
5. `package.json`: remove `db:migrate`, `auth:setup-token`, `auth:recover`; add
   `reset-password`; keep `search:reindex`. Delete `scripts/migrate.ts`,
   `scripts/setup-token.ts`.
6. Tests: unit for proxy ranges (v4, v6, mapped v4, chains, invalid); integration for
   startup from empty folder, dev defaults, ignored legacy variables, container
   bootstrap updates.

Gate: DEP-04, DEP-05, MIG-01 via real startup; existing container-bootstrap tests adapted.

## SS03 — Accounts, setup flow and login

Files: `src/lib/shared/auth.ts`, `src/lib/server/auth/service.ts`, `policy.ts`,
`src/hooks.server.ts`, `src/routes/setup/**`, `src/routes/login/**`,
`src/routes/api/setup/**` (new; remove `api/auth/setup`), `src/routes/api/auth/login`,
`src/lib/components/AuthForm.svelte` (split into Setup/Login forms as needed),
`src/lib/shared/settings.ts`, settings repository, security settings UI.

1. Schemas: `usernameSchema`, `emailSchema`, `passwordSchema` 8–128,
   `setupAccountSchema` (with `passwordConfirm` equality), `setupPreferencesSchema`,
   `loginRequestSchema { username, password }`, fresh-auth scope `account-update`.
2. Settings JSON: add `siteTitle`, `language`, `setupCompletedAt: number | null`
   (defaults `PandaNote`, `en`, `null`).
3. AuthService: `createAccount` (no token, rejects if account exists, account +
   session atomic), `login(username, password)` with dummy verify for unknown names,
   `updateAccount` with fresh grant, remove setup-token methods. Setup window clock
   injected (process start) for tests.
4. Setup state resolution + routing table (SPEC §2) in `hooks.server.ts` and
   `isPublicAuthRoute`; `setup_required`/`already_set_up`/`setup_closed` error codes.
5. Pages: `/setup` (4 fields, client equality check, window notice/expired state),
   `/setup/preferences` (title, language, timezone prefilled; Finish setup),
   `/login` (username + password, unchanged MFA step).
6. Settings → Account (username/email, fresh auth) and password rule text.
7. Tests: unit schemas; integration auth service + HTTP routes for every routing
   cell, races (two concurrent setups → one account), window expiry, generic login
   errors, rate limits; Playwright full first-run flow, leave-after-step-1 resume,
   login redirect after completion, mobile layout.

Gate: SET-01–SET-09, ACC-01–ACC-05.

## SS04 — Language registry, site title, Settings → General

Files: new `src/lib/shared/i18n/` (`registry.ts`, `en.ts`, `zh-CN.ts`, `t()` helper,
`Accept-Language` matcher), `src/app.html`/`hooks.server.ts` (`lang`, title),
shell/sidebar/drawer components, setup/login pages, Settings General.

1. Typed catalogs: `zh-CN` keys are a partial of `en` keys (compile-time check);
   `t(key)` falls back per key. Registry exposes `{ code, nativeName, complete }`.
2. Settings `language` validated against registry; `<html lang>` set server-side.
3. Translate scope from SPEC §5 only; partial-language notice in Settings.
4. Site title in `<title>`, sidebar/mobile header, login heading (escaped, ellipsis
   with accessible full text).
5. Settings → General: title + language, immediate save, same-origin, validated.
6. Tests: unit catalog fallback/matcher; integration settings validation; Playwright
   language switch (en ↔ zh-CN) on setup/login/shell, title in tab/header, axe on new
   screens light/dark phone/desktop; update visual baselines intentionally.

Gate: LANG-01–LANG-04, SET-06.

## SS05 — Backup/restore and maintenance commands

Files: `src/lib/server/backups/{service,snapshot,trust,restore}.ts`,
`src/lib/shared/backups.ts`, `scripts/reset-password.ts` (new; replaces
`auth-recover.ts`), `scripts/reindex.ts`, `ops/Dockerfile` COPY list.

1. Archive format v2: include username/email/new settings; exclude `pre-upgrade/`;
   remove `setup_tokens` exclusions and the v4 staging path; known-older-schema restore
   runs the shared SQL + data-step runner on staging. Format v1 → clear refusal.
2. Restore keeps destination `setupCompletedAt` semantics: restored settings come from
   the archive (always complete); sessions invalidated as before.
3. `reset-password` per SPEC §9.5 (TTY, double prompt, no echo, atomic, running-app
   safe, journal/no-account refusal). Verify AuthService keeps no cached credential or
   security-revision state; fix if it does.
4. Tests: backup/restore round trip with username/email/title/language; v1 refusal;
   pre-upgrade excluded; reset-password with a live server (old sessions rejected
   immediately, new password works, MFA off) using a pseudo-TTY harness.

Gate: BAK-01–BAK-03, OPS-01–OPS-03.

## SS06 — Deployment files and image

Files: `docker-compose.yml` (new, root), `.env.example`, delete `compose.yaml`,
`ops/compose.external.yaml`, `ops/external.env.example`, `ops/production.env.example`,
`ops/Caddyfile` (move to `tests/release/`), `ops/Dockerfile`, `.dockerignore`,
`.gitignore` (`/data/`), `ops/release-drill.sh`, `ops/release-benchmark.sh`,
`tests/release/**`, `tests/integration/release-hygiene.test.ts`, `scripts/image-build.ts`.

1. Write the Compose and env files exactly as SPEC §9.1/§9.2.
2. Dockerfile: COPY the new scripts; keep HEALTHCHECK, non-root drop, labels.
3. Image name: make the documented save/load produce `pandanote:latest` on the
   server for both Docker- and Podman-built images (normalize the reference or
   document a one-line retag); verify with both engines where available.
4. Move the two-domain HTTPS drill to a test-only `tests/release/compose.drill.yaml`
   - Caddyfile using the new env (no static IPs).
5. Release-hygiene test pins: only one Compose file; no hardening keys, no
   `SETUP_TOKEN`/`TRUSTED_PROXY_IPS` anywhere in shipped files; env example has exactly
   one required key.
6. Linux image: fresh `./data` bind → setup in browser through a real Caddy with the
   minimal site block; restart; upgrade with a synthetic extra migration (pre-upgrade
   copy appears); SIGTERM exit 0; non-default PUID/PGID; capabilities of server PID = 0;
   large (>1 GiB) restore upload through minimal Caddy.

Gate: DEP-01–DEP-09 on the Linux deployment image (Windows-only results don't count).

## SS07 — Documentation and full regression

1. Replace `ops/DEPLOYMENT.md` with the content of [OPERATIONS.md](OPERATIONS.md)
   (adjusted to what was actually implemented); update `ops/RESTORE_RUNBOOK.md`
   (new VPS: deploy → setup → restore; no token; reset-password).
2. Update `README.md` (Production deployment, Local development, Authentication,
   S01/S10/S14 upgrade notes that mention `db:migrate`, operator recovery),
   `docs/PRODUCT_SPEC.md` §2/§13/§14, `docs/ARCHITECTURE.md` §3/§4.3/§12/§13/§16,
   `docs/IMPLEMENTATION_PLAN.md`, `docs/ACCEPTANCE_TESTS.md` (AUTH-01, container
   startup section), `docs/VERSIONING_PLAN.md` (Compose references),
   `migrations/README.md`, `tests/README.md`, `AGENTS.md` if commands changed.
   Remove superseded text rather than stacking notes; keep PROGRESS history.
3. Full gate: check, lint, unit, integration, build, **full** Playwright suite, Linux
   validation image run, release drill with the test-only Caddy stack.
4. Record results; mark the change done only if every ACCEPTANCE case passes or is
   explicitly blocked with a reason.

Gate: DOC-01–DOC-03 and the full regression.
