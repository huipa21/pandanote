# Agent instructions — PandaNote

## Read before coding

Read these documents fully on the first session, and reread relevant sections before changing behavior:

1. `docs/PRODUCT_SPEC.md` — authoritative agreed requirements and UI behavior.
2. `docs/ARCHITECTURE.md` — technical contracts and proposed data model.
3. `docs/IMPLEMENTATION_PLAN.md` — ordered tasks, acceptance gates, next-step hints.
4. `docs/ACCEPTANCE_TESTS.md` — cross-feature and security tests.
5. `docs/PROGRESS.md` — actual implementation status and handoff.

Authority: explicit user requirements > PRODUCT_SPEC > ARCHITECTURE > implementation preferences. Raise contradictions before changing requirements. Defaults marked as such can be adjusted with a documented reason; major scope/stack/security changes require user approval.

## Scope and working style

- This is a single-user app. Avoid multi-user roles, microservices, Redis, Meilisearch, rich-text/block editors, offline sync, and automatic backups.
- Use the settled stack. Do not introduce a large UI kit, ORM replacement, extra state framework, or external location service just for convenience.
- Inspect existing code and git state before editing. Do not overwrite another session's uncommitted work.
- Work on the next unfinished step in `docs/IMPLEMENTATION_PLAN.md`, normally one step per session. A step may take several sessions; mark partial progress honestly.
- Write small, typed modules with explicit contracts. Keep authorization, validation, filesystem access, and SQLite code server-only.
- Do not implement only the happy path. Draft retention, retry safety, concurrent edits, private files, backup consistency, and safe restore are core requirements.
- Do not mark a placeholder, mock, TODO, or untested screen as completed functionality.
- Pin compatible dependency versions and commit the lockfile. Verify current upstream APIs; the plan does not assume a particular library minor release.
- Keep secrets, generated databases, uploads, backup archives, `.env`, and browser profiles out of git.
- No public file directories for uploads/backups. Never log note content, passwords, TOTP seeds, recovery codes, session tokens, or precise coordinates.
- Domain/base URL must be environment-configurable, not hardcoded. HTTP is permitted only for local development.
- No application coding was performed during planning. Do not assume scripts or test commands exist before S00 creates them.

## Mandatory validation

After scaffolding, the project must expose these scripts:

- `npm run check` — TypeScript/Svelte checks.
- `npm run lint` — linting and formatting checks.
- `npm run test:unit` — unit tests.
- `npm run test:integration` — actual SQLite/filesystem/server integration tests.
- `npm run test:e2e` — Playwright browser tests.
- `npm run build` — production build.

Run the relevant tests during development; run check, lint, unit/integration tests, and build before a step is declared done. Run affected end-to-end tests for user-facing steps and the full suite at milestone gates. Record exact commands and actual outcomes. A missing browser/native dependency is a blocker, not a pass.

Native Sharp/SQLite behavior and archive restore must also be validated in the Linux deployment image; passing only on a Windows development machine is insufficient.

## Session close / handoff

Update `docs/PROGRESS.md` every coding session with:

1. Current step and state: not started / in progress / blocked / done.
2. Implemented behavior and touched files.
3. Commands run and their real results, including failures/skipped checks.
4. Remaining work, known defects, and reasons for deviations.
5. Exact next task, files to read, and the next validation command.
6. New architecture decisions with rationale, reflected in the appropriate specification when necessary.

Never erase prior handoff history. Keep the current summary concise; append history entries below it. Do not claim project completion until the final acceptance gate passes.
