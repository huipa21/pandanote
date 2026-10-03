# PandaNote

A single-user, responsive, Markdown-first personal notes application.
**Currently a technical bootstrap, not a usable note-taking application.**
The only application routes are a small shell and `/health` (process liveness).
No account, notes, uploads, backups or persistent product schema exist yet.

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

Open `http://localhost:5173`. `.env.example` documents the eventual environment
contract. `/health` exposes only `{ "status": "ok" }` with no-store caching;
it does **not** yet check database/storage readiness. This scaffold is not
ready for an Internet-facing deployment.

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

See PROGRESS for S00 validation results and the next implementation task.
Production deployment, performance and independent backup/restore drills remain
part of the final S18 gate; this repository does not claim product completion.
