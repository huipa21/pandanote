# PandaNote — operations

The implemented operator guide is now maintained in one place:
**[ops/DEPLOYMENT.md](../../ops/DEPLOYMENT.md)**.

It covers clean-source Docker/Podman build, export/load to the same local image
reference, ORIGIN configured in Compose with existing Caddy, automatic startup migrations,
pre-upgrade DB copy and immediate rollback, interactive live-safe password reset,
manual downloaded backup/uploaded restore, troubleshooting and test-only drills.

For whole-state recovery and crash phases use
[ops/RESTORE_RUNBOOK.md](../../ops/RESTORE_RUNBOOK.md).
Actual validation and remaining SS01/S18 gates: [PROGRESS.md](PROGRESS.md).
