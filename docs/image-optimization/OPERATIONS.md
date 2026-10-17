# Image optimization — operations pointer

The canonical operator guide is [ops/DEPLOYMENT.md](../../ops/DEPLOYMENT.md):

- §1–2: clean-source build, Docker/Podman save, gzip6/checksum transfer and actual
  Docker compressed load. Both engines export `localhost/pandanote:latest`; raw
  transfer remains supported.
- §5–6: retain the prior image/downloaded full backup, upgrade and immediate DB-copy
  rollback limits. Image compression is not application backup or encryption.
- §14: dedicated runtime manifest/lock regeneration, reviewed drift/override/transitive
  checks, native/worker/CLI validation and streaming size reporting.

Normal deployment needs root Compose with ORIGIN configured and existing Caddy; no
`.env`, extra service or startup installer. Do not use test topology as installation.
For actual full-state recovery use [RESTORE_RUNBOOK.md](../../ops/RESTORE_RUNBOOK.md).

Repeatable Alpine common/native/fallback, supported browser, external production
image/PTY/deferred content, copied-root/large restore/upgrade and cross-engine gates:
[tests/release/README.md](../../tests/release/README.md).

Measured sizes, exact commands/identities, real failures/retries, cleanup and the
remaining ARM64/manual/exact-user-release limits: [PROGRESS.md](PROGRESS.md).
Keep archives/reports/profiles private and ignored; never replace another session's
image alias or manipulate real data for validation. A checksum detects corruption,
not authenticity of an untrusted image. No TLS/provenance/security bypass is supported.
