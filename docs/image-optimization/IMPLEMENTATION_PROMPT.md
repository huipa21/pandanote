# Copyable long-session implementation prompt

Original long-session authorization, retained for reproducibility. It authorizes
sequential IO work, not a user-repository commit, deployment, deletion of real data
or unrelated scope. Implementation has since proceeded; consult PROGRESS for actual
state/evidence before reusing it. The prompt's original planning language is not a
current status claim.

```text
Implement the complete image-optimization change for PandaNote in one long session,
following docs/image-optimization/PLAN.md, steps IO00 through IO07 in order.

Read AGENTS.md and the required main PRODUCT_SPEC, ARCHITECTURE,
IMPLEMENTATION_PLAN, ACCEPTANCE_TESTS and PROGRESS documents before application
coding. Read docs/simplify-setup/SPEC.md and its current PROGRESS handoff to preserve
existing setup, migration, maintenance and deployment behavior. Read every document
in docs/image-optimization/, especially SPEC, DECISIONS, PLAN, ACCEPTANCE_TESTS and
PROGRESS. Treat the folder as a plan, not evidence of implemented or tested behavior.

I explicitly allow Alpine for the production base. You may complete multiple IO
steps sequentially in this session, instead of the usual one-step-per-session rule.
Keep per-step gates and honest handoff updates. Do not spend the session producing
another plan: inspect prerequisites, then implement and validate the planned change.

Objectives:
1. Capture/preserve the existing image archive and a matched baseline with exact
   source/platform/Node/npm/engine/size identity. Add a small read-only streaming
   size reporter and real tests. Distinguish raw tar, gzip, image-engine size and
   payload totals; avoid double-counting aliases and overlapping map/package sizes.
2. Add ops/runtime/package.json and its committed lockfile, exact runtime roots,
   automated drift checks and a documented regeneration workflow. Audit generated
   server, native/deferred imports, source bootstrap/maintenance and worker paths.
   Exclude browser-only Mermaid/DOMPurify and unused build-tool peers; retain Kit,
   Svelte, Shiki and all actual runtime dependencies. Preserve optional Sharp musl/
   libvips packages, final ESM/#lib mappings and Node native TS tooling.
3. Verify a published supported Node 24 Alpine image and pin the real tag/digest.
   Prove musl native installation and linked libraries before switching all three
   production stages. Keep CA/Python/make/g++ in both install stages and only
   required shared libraries in runtime. No host/Debian native copy or unexplained
   glibc compatibility shim. Do not lower the existing Node engine minimum.
4. Remove dependency source maps before runtime COPY, keeping executable/native/
   grammar/WASM/metadata/license assets and client gzip/Brotli assets. Preserve
   trusted source tools/workers/migrations/build-info, healthcheck and provenance.
5. Add actual Alpine common/native validation and production-image probes. Keep a
   supported Debian/host browser driver if appropriate. Verify default/non-default
   PUID/PGID, private modes, PID1/zero capabilities, readiness/recovery, TLS/timezones,
   shutdown, deferred native work, PTY live reset and stopped-app reindex.
6. Validate browser setup/auth/MFA/notes/private files, lazy sanitized Mermaid and
   server/browser highlighting, existing pending migration/copy/rollback tests,
   backup/download/upload/two-domain restore, interruption recovery and >1 GiB TLS
   restore through unchanged minimal Caddy/root Compose.
7. Verify actual Docker and Podman build/save/gzip/Docker-load paths, including
   Podman's localhost retag, identity/native smoke after load and corrupt-archive
   safety. Document compressed transfer/checksums and retain the raw alternative.
8. Measure comparable before/after raw/gzip/layer/package sizes and representative
   performance, run final full regression and reconcile canonical docs/progress.

Working constraints:
- Inspect Git status before editing; preserve unrelated work and all prior handoff
  history. Never delete the supplied pandanote-image.tar or real application data.
- Use the supported Node executable AND PATH. The default executable observed in
  analysis was Node 24.15.0, below this repository's 24.21.0 minimum; verify locally.
- Pin compatible versions and include lockfiles among the tracked file changes;
  do not create a Git commit in the user's repository without permission. Avoid unrelated
  dependency upgrades, stack changes or force audit repairs.
- Do not bypass TLS checks, provenance/dirty/shallow guards, sanitization, auth,
  ownership, disk/image/archive limits, journal safety or test assertions.
- Use isolated engines, aliases, temporary clones and synthetic data/resources.
  For the clean-source build wrapper while this tree is dirty, use an isolated
  full-history clone with explicitly copied reviewed changes and a synthetic commit
  only there. Record its identity/source relationship. Never call it a user release.
  Do not replace a deployed image or overwrite another session's latest alias.
- No broad engine prune, deletion of unrelated containers/volumes/data or secret/
  content logging. Clean up only resources created by this session.
- Do not change root Compose/env/Caddy simplicity to make tests pass. Do not add
  new production config requirements, network startup installers or extra services.
- SS01 literal atomic exchange and S18 real-VPS/device/accessibility/exact-user-
  release gates remain independent and open; this task does not resolve them.
- Initial mandatory platform is Linux AMD64. Preserve the ARM64 option; test it if
  available, otherwise document it as unvalidated rather than passed.

Validation:
Run targeted tests during development. Before declaring each code-bearing step
complete run npm run check, npm run lint, npm run test:unit,
npm run test:integration and npm run build, plus affected e2e/Linux/image gates.
Run shared build/browser/release commands sequentially. At final completion run
full e2e, full Alpine common/native tests and the actual production-image deployment,
PTY/worker/upgrade/restore/large-upload/drill/cross-engine cases. Missing engine,
registry package, browser, native dependency, PTY or disk is blocked, not a pass.
Do not credit Debian-native/host-only tests as musl production evidence. Preserve
unreviewed visual/manual checks separately; do not auto-update snapshots to pass.

Keep docs/image-optimization/PROGRESS.md and docs/PROGRESS.md current at every
completed step and whenever blocked/interrupted. Record touched files, exact
commands, source/image identities, outcomes/counts/failures/retries/skips,
acceptance mapping, measured sizes, decisions and the exact next task. No guessed
results or completion claims based only on generated files. Engineering size
thresholds are defaults; investigate/document misses without deleting features.

Continue through all steps that can be completed safely with available tools. If
a mandatory prerequisite/gate is blocked, diagnose safe workarounds within scope,
record the blocker, and stop dependent completion claims; independent work may
continue. Ask only for genuinely necessary scope/security/compatibility approval.
Do not silently lower requirements to finish the session.

Final response: summarize implementation and changed paths, measured before/after
sizes, actual validation outcomes, all blockers/manual/ARM64/exact-commit limits,
cleanup state and the next command. Declare image optimization locally complete
only if its mandatory local gates pass; do not claim overall PandaNote release.
```
