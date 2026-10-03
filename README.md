# PandaNote

A single-user, responsive, Markdown-first personal notes application.
**Currently an authentication/persistence foundation, not a usable note-taking application.**
One-time operator setup, password login/logout and private route protection are
implemented. S02 is **in progress**: optional TOTP, recovery codes, fresh-auth and
security settings are not yet implemented. Note services, uploads and backup/restore
remain future steps. Do not deploy this unfinished app as a complete product.

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
cp .env.example .env
npm run db:migrate
npm run auth:setup-token
npm run dev -- --host 127.0.0.1
```

Open `http://localhost:5173/setup` and enter the operator-held token to create
the sole account; subsequent visits use `/login`. `dev`, `start` and operator
commands load a private `.env` if present; real environment variables take precedence.
`.env.example` documents the environment contract. `/health` exposes only `{ "status": "ok" }` with no-store caching;
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
write leases and closes the database. The application now uses one lazy runtime
instance; adapter-node's post-request `sveltekit:shutdown` event drains and closes it.
Requests never initialize keys or migrate schema. Pending filesystem
journals block opening/migrating data until recovery; the S17 restore state machine
and S06/S07 cleanup worker are still future work, not implemented restore/deletion.
Initial timezone is UTC until setup/settings explicitly accepts a browser proposal.

## Authentication first slice (S02, incomplete)

`npm run auth:setup-token` requires operator/VPS filesystem access and a stopped
app with migrated private storage. It prints one random token to your terminal,
valid for one hour. Keep it out of shell history/log collectors; do not put it in
a URL. Reissue invalidates the previous token. Account creation, token consumption
and the initial session commit atomically. A lost success response can be recovered
by signing in with the chosen password. An existing account prevents token issuance;
there is no public registration or public password/MFA bypass.

Passwords use Argon2id (64 MiB, three passes, one lane), with only one hashing or
verification operation in flight and no queue. `npm run auth:benchmark` reports
synthetic latency/RSS measurements; it never prints passwords or hashes. Sessions
use a host-only HttpOnly, SameSite=Strict cookie, Secure in production, and a hashed
random bearer token in SQLite. Default expiry is seven days, without rolling renewal.
Persistent fixed-window limits apply per client IP and account, including across
restarts. All mutations require the exact configured Origin; all data/page routes
are private except the method-aware health/setup/login allowlist.

Proxy trust: keep `ADDRESS_HEADER`, `HOST_HEADER`, `PROTOCOL_HEADER` and `PORT_HEADER`
unset. Set canonical `ORIGIN` explicitly (HTTPS outside loopback, no trailing slash).
Adapter 6 no longer reads runtime ORIGIN itself; our version-checked build wrapper
supplies it through the generated adapter handoff, preserving Kit's form CSRF
checks and allowing the same build to run at a different domain. Do not configure
build-time `kit.paths.origin`. The application uses the
actual peer address unless it matches `TRUSTED_PROXY_IPS` (at most 16 exact IPs).
A trusted edge must overwrite `X-Forwarded-For` with **one** client IP, not append a
chain; missing/invalid trusted headers fail closed. Bind the Node listener privately
behind that edge. Untrusted forwarded headers are ignored.

TOTP-enabled database rows currently **fail closed** on password login; enrollment,
MFA completion, single-use recovery codes, fresh authentication, password changes,
all-device revocation, security UI and an explicit operator-only recovery command
remain the next S02 work. Do not manually toggle MFA or edit account rows. If access
is lost at this unfinished stage, stop the app and retain private data for operator
recovery; do not delete the database or reopen public setup.

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

See PROGRESS for S00/S01 and partial S02 validation results and the next task.
Production deployment, performance and independent backup/restore drills remain
part of the final S18 gate; this repository does not claim product completion.
