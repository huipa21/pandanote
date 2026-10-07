# Change: Simplify setup and deployment

**Status:** SS01/SS02 core implemented / full gates blocked — approved on 2026-10-06.
Schema-v2 migrations, private pre-upgrade copies and shared startup/proxy trust are
implemented. Account/setup and archive/recovery integration remain SS03/SS05.
Do not deploy this intermediate checkout for note-taking.
Actual validation and constraints: [PROGRESS.md](PROGRESS.md).
**Type:** user-approved post-S18 change. It **supersedes** the setup-token, manual
migration, hardened-Compose and fixed-proxy-IP parts of earlier documents (see
[SPEC §10](SPEC.md#10-superseded-requirements)). It does not close S18's outstanding
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
| [OPERATIONS.md](OPERATIONS.md)             | Target operator guide (install, upgrade, rollback, reset password)      |
| [PROGRESS.md](PROGRESS.md)                 | Status, decision log, handoff for this change                           |
| [DECISIONS.md](DECISIONS.md)               | Interview record and design decisions with rationale                    |

Authority for this change: user interview answers (DECISIONS.md) > SPEC.md >
main `docs/PRODUCT_SPEC.md` / `docs/ARCHITECTURE.md` where they conflict.
After implementation, the main documents are rewritten so they no longer conflict
(PLAN step SS07).
