# PandaNote

A single-user, responsive, Markdown-first personal notes application.
**Currently a persistence foundation, not a usable note-taking application.**
The only application routes are a small shell and `/health` (process liveness).
Explicit migrations, private storage/key initialization and typed server contracts
exist; account setup, note services, uploads and backup/restore are not implemented.

## Start here

1. [`AGENTS.md`](AGENTS.md) — working rules and handoff protocol.
2. [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md) — authoritative product behavior.
3. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — storage/security contracts and validated API decisions.
4. [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) — S00–S18 acceptance gates.
5. [`docs/ACCEPTANCE_TESTS.md`](docs/ACCEPTANCE_TESTS.md) — integrated verification matrix.
6. [`docs/PROGRESS.md`](docs/PROGRESS.md) — actual status, command results and exact next task.

The product specification takes precedence over architectural suggestions.
Subsequent sessions must follow the **next unfinished step in PROGRESS**, not
redesign settled requirements or assume a capability probe is a product feature.

## Local development

Use **Node 24.21.0 LTS** (`.node-version`) and npm 11. Exact dependencies are
pinned in `package.json` and `package-lock.json`. On Windows, verify the Node
version used by both npm and its child processes; don't run with an older Node
installation earlier in PATH.

```sh
node --version
npm ci
npm run dev -- --host 127.0.0.1
```

Open `http://localhost:5173`. `.env.example` documents the environment
contract. `/health` exposes only `{ "status": "ok" }` with no-store caching;
it does **not** yet check database/storage readiness. This scaffold is not
ready for an Internet-facing deployment.

## Private persistence initialization (S01)

```sh
# Set DATA_DIR in your environment or a private .env (see .env.example).
# Stop the app before migrating; run from the repository root.
npm run db:migrate
```

This creates private directories, random portable key material, the current SQLite
schema and validated settings defaults. **It creates no account or demo content.**
Production requires an absolute `DATA_DIR` outside source/build/public assets, on
persistent local disk. Keep `migrations/` with the trusted application installation.
Do not use schema-push or copy a live SQLite file without its WAL.
See [`migrations/README.md`](migrations/README.md) for generation/upgrade rules.

Linux directories are owner-only `0700`; keys/database/WAL/SHM are `0600`. On
Windows, POSIX mode bits are not ACL protection: restrict the data directory's
NTFS ACL to the operator/application account. Symlink/junction paths and
user-controlled filenames are rejected as storage paths. Losing key material for
an existing database fails closed rather than silently generating a replacement.
No browser/file access endpoint exposes this tree.

`Persistence.write` combines the maintenance gate with a synchronous IMMEDIATE
transaction. Use it for every domain mutation; `Persistence.close()` drains active
write leases and closes the database. The S02 application lifecycle must wire this
foundation into setup/authentication and process shutdown. Pending filesystem
journals block opening/migrating data until recovery; the S17 restore state machine
and S06/S07 cleanup worker are still future work, not implemented restore/deletion.
Initial timezone is UTC until setup/settings explicitly accepts a browser proposal.

## Validation

```sh
npx playwright install chromium
npm run check
npm run lint
npm run test:unit
npm run test:integration
npm run test:e2e
npm run build
```

- `check` includes strict application **and test/tooling** TypeScript checks.
- `lint` runs ESLint and Prettier checks; `npm run format` applies formatting.
- Integration tests use real isolated SQLite, Sharp and streamed archives.
- Playwright starts the **built adapter-node app**, plus a separate test-only
  Mermaid/CSP harness; it owns/cleans its synthetic test data and never reuses
  a user's running server.
- See [`tests/README.md`](tests/README.md) for coverage, probe limits and Linux
  validation commands using `ops/Dockerfile.validation`.

Never disable TLS verification to install dependencies. Never place secrets,
application data, browser profiles or backup archives in git or public assets.

## Settled stack

- SvelteKit 3 + Svelte 5 + TypeScript 6, Vite 8 and adapter-node.
- SQLite + Drizzle + better-sqlite3; FTS5 trigram plus literal short-query fallback.
- remark/rehype, Shiki and dynamically loaded Mermaid; plain CSS, no large UI kit.
- Sharp and private local filesystem storage; browser-local unpublished drafts.
- One Node application instance behind HTTPS on the target 2-core/4 GB VPS.
- No external search service, Redis, cloud storage requirement or automatic backups.

## Start a coding session

> Read AGENTS.md and the planning documents. Inspect git and docs/PROGRESS.md.
> Implement only the next unfinished step, with its tests. Preserve existing
> work and settled requirements. Run the prescribed checks, record actual
> outcomes including failures, and leave an exact handoff in PROGRESS.
> A blocked native/browser/Linux check is not a pass.

See PROGRESS for S00/S01 validation results and the next implementation task.
Production deployment, performance and independent backup/restore drills remain
part of the final S18 gate; this repository does not claim product completion.
