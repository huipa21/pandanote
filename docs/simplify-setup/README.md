# Change: Simplify setup and deployment

**Status:** approved on 2026-10-06; SS07 documentation/full local regression done,
implementation locally verified. Browser setup, username login/account edits,
language/title, startup migrations/copy, format-v2 backup/restore, interactive live
reset and minimal existing-Caddy deployment are implemented. SS01's literal atomic
directory-exchange clarification and S18 manual/exact-release-commit checks remain
open; no overall release completion is claimed.
Actual validation and constraints: [PROGRESS.md](PROGRESS.md).
**Type:** user-approved post-S18 change. It **supersedes** the setup-token, manual
migration, hardened-Compose and fixed-proxy-IP parts of earlier documents (see
[SPEC §10](SPEC.md#10-documentation-reconciliation)). It does not close S18's outstanding
real-VPS/device/accessibility gates.

## Goal

Setting up PandaNote should be easy:

1. Load the image, put `docker-compose.yml` and `.env` (one required line: `ORIGIN`) in a folder,
   run `docker compose up -d`.
2. Open the domain → you are sent to **Setup**: username, email, password, re-enter password.
3. Next page: site title, language, timezone → done.
4. From then on, the domain opens **Login**.

The database is created and upgraded automatically on every start, including future
data migrations. Nobody has to run any other command.

## Documents in this folder

| File                                       | Purpose                                                                 |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| [SPEC.md](SPEC.md)                         | Agreed behavior: setup flow, accounts, language, deployment, migrations |
| [PLAN.md](PLAN.md)                         | Ordered implementation steps SS01–SS07 with done gates                  |
| [ACCEPTANCE_TESTS.md](ACCEPTANCE_TESTS.md) | Verification cases SET-_, ACC-_, MIG-_, DEP-_, OPS-_, DOC-_             |
| [OPERATIONS.md](OPERATIONS.md)             | Link to canonical ops/DEPLOYMENT.md (install/upgrade/rollback/reset)    |
| [PROGRESS.md](PROGRESS.md)                 | Status, decision log, handoff for this change                           |
| [DECISIONS.md](DECISIONS.md)               | Interview record and design decisions with rationale                    |

Authority for this change: user interview answers (DECISIONS.md) > SPEC.md >
main `docs/PRODUCT_SPEC.md` / `docs/ARCHITECTURE.md` where they conflict.
Main guidance is reconciled by SS07; historical outcomes remain in PROGRESS, not
as alternative installation instructions. The canonical guide is
[ops/DEPLOYMENT.md](../../ops/DEPLOYMENT.md).
