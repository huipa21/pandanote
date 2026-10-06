# Commit-derived release versioning

## Status and authority

User-approved post-S18 enhancement; this plan was recorded before coding.
V01–V03 behavior is implemented. V04 is **in progress / environment-blocked**:
Windows full gates pass; cached Linux production metadata/native/UI and partial
Linux regressions pass, but four Linux Git integration cases and a cold production
build remain blocked by dependency/apt download problems. Exact evidence and the
new low-severity dependency advisories are in `PROGRESS.md`.
This does not close S18's outstanding real-VPS/device/accessibility release gates.
Authority: user decisions in the versioning interview, then PRODUCT_SPEC and ARCHITECTURE.

## Agreed behavior

- Display format: `YYMMDD-N` (for example `261006-2`), with a positive, unpadded daily sequence starting at 1.
- Date comes from the target Git commit's **committer timestamp converted to UTC**, never author time, build time, host timezone or the notebook's calendar timezone.
- Walk **first-parent ancestors of the target commit, including that commit**. Count entries whose UTC committer date equals the target's date. Merge commits count once; merged side-branch commits are not counted separately. Documentation-only commits count.
- Releases are built from the user's main development line; feature branches are merged before versioning. Detached checkouts of older releases remain supported. No branch-name dependency or server-side registry is necessary.
- The same hash and complete, unmodified Git history always yield the same version. Later descendants cannot renumber an older commit. Amending/rebasing changes commit identity; date/sequence is not globally unique across branches or rewritten history. Store the full hash alongside the readable version.
- Reject staged changes, unstaged changes and untracked **non-ignored** files for release image builds. Ignored `.env`, build output and runtime data neither block builds nor enter the source snapshot.
- Reject missing Git history and shallow checkouts rather than inventing a sequence. Do not use Git replacement objects when deriving provenance.
- Per the user's follow-up, every build tags `pandanote:latest` and `pandanote:<version>`. `latest` is a mutable convenience alias, not release metadata. The wrapper probes running Docker then Podman automatically, with optional `--engine docker|podman|auto` override. Both install stages include native compilation prerequisites, excluded from runtime. Standard OCI version/revision/created labels contain the readable version, full hash and **UTC commit time**, respectively. `created` is the source commit time, not wall-clock build time.
- Embed identical public metadata into the SSR and browser application at build time. Runtime environment changes, restarts, domain changes and data restores cannot override it. Git and `.git` are not needed in the final image.
- Show a small version label at the sidebar footer and the mobile drawer footer. Settings → About shows version, full commit and UTC commit time. No version is added to public login/setup or `/health`.
- Ordinary local development and non-release `npm run build` remain possible, explicitly labeled **Development**, not falsely labeled as a clean release.
- Release identity is separate from package semver (`0.0.0`), note revisions, database migrations and backup-format compatibility. No schema/archive compatibility change is included.

### Existing-history example

`4828cb0` has committer time `2026-10-06T00:43:59Z` and maps to `261006-1`.
Its parent `123aec8` has UTC time `2026-10-05T16:29:41Z`, not October 6.
The date rule is UTC even though the original Git timestamps use `+08:00`.

## Implementation sequence

### V01 — Typed metadata and deterministic Git derivation

1. Add a pure, strict build-info contract with development/release variants, full hash, canonical UTC timestamp and readable version validation.
2. Add server/build-tool-only Git derivation using Node built-ins and explicit subprocess argument arrays, no new dependencies.
3. Read complete first-parent history rooted at a captured HEAD, compare UTC dates directly (no time-based Git pruning), and reject dirty/shallow/missing repositories.
4. Expose an operator command to inspect the clean checkout's release metadata.
5. Unit tests cover UTC midnight, author-versus-committer date, daily reset, multi-digit sequence, invalid metadata and timezone independence. Real temporary-Git integration tests cover merges, older commits, later descendants, same-hash repetition and dirty/shallow failures.

### V02 — Safe single-command image build

1. Add `npm run image:build -- --platform linux/amd64` (default platform `linux/amd64`; optional `linux/arm64`; auto Docker/Podman detection with explicit engine override).
2. Derive metadata, capture **only committed source** with `git archive` into an OS temporary directory, and recheck cleanliness/HEAD before invoking the engine. Build from that immutable tar snapshot, not mutable working-tree files; this prevents ignored-file inclusion and source/metadata races.
3. Use `ops/Dockerfile`, tag both `pandanote:latest` and `pandanote:<version>` and pass the version/hash/UTC commit time as build arguments. Do not accept arbitrary arguments that can override provenance. Propagate engine failures; always close handles and delete temporary snapshots.
4. Require complete validated release metadata in the production Dockerfile; direct Docker/Compose builds without metadata fail with an actionable error instead of publishing Development as a release. Add OCI labels without shipping Git history or adding runtime environment overrides.
5. Add Compose build-argument plumbing for explicitly documented low-level builds; recommend the versioned image command plus `docker compose ... --no-build` for deployment. Adapt release verification harnesses to the versioned workflow.
6. Integration tests use temporary real Git repositories and a typed recording engine boundary to verify tag/arguments/committed tar, ignored files, no engine call on dirty state and failure propagation. Exercise actual CLI rejection separately, then the actual CLI/engine on a clean synthetic container-verification snapshot. This avoids introducing shell-based mock executables on Windows.

### V03 — Embedded application metadata and UI

1. Inject validated metadata through Vite's build-time constants; use a typed shared accessor with no runtime filesystem/Git/env/database access.
2. Reuse the same accessor in sidebar and Settings About. Plain escaped text, semantic labels, wrapping full hash and readable secondary color; no extra endpoint, remote request or click-only tooltip needed.
3. Verify release and development SSR/browser output match. Desktop/mobile drawer, short viewport, dark/light contrast and no-JavaScript About must remain usable. Review affected visual baselines rather than hiding layout changes.

### V04 — Documentation, regression and Linux gate

1. Update PRODUCT_SPEC, ARCHITECTURE, IMPLEMENTATION_PLAN, ACCEPTANCE_TESTS, deployment guide, README and PROGRESS. Preserve handoff history.
2. Document the local build/save/scp/load flow, exact image inspection, stable proxy IP, one app container with existing Caddy, stopped-app migrations and image pinning. Pin before upgrade/rollback; retain pre-upgrade manual backup requirements.
3. Run `npm run check`, `npm run lint`, `npm run test:unit`, `npm run test:integration`, `npm run build`, affected Playwright and full browser regressions where feasible.
4. Validate native Sharp/SQLite and embedded metadata in the Linux production image. Since this enhancement is uncommitted during development, do not bypass dirty-source rejection or create a user-repository commit without approval. Use an explicitly synthetic, isolated **clean Git snapshot** containing the implementation for container verification; record that it is not a final release commit.
5. Record exact commands, real failures/blockers, files changed and next task in PROGRESS. After the user commits, build the actual release with the new command and verify image label/UI equality on that exact hash.

## Acceptance matrix

| ID     | Requirement                                                                    | Verification                                                                     |
| ------ | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| VER-01 | UTC committer date and first-parent daily count                                | Pure unit fixtures and real Git repositories, including offset dates and a merge |
| VER-02 | Same commit stable across rebuilds/later descendants/host timezone             | Old-commit derivation and repeated CLI tests                                     |
| VER-03 | Dirty, missing and shallow sources fail clearly                                | Real CLI tests; engine must not be invoked                                       |
| VER-04 | Committed source, no ignored data; engine errors propagate                     | Immutable-tar integration and synthetic container build                          |
| VER-05 | Latest/version tags reference one image; OCI labels, SSR and hydrated UI agree | Container inspect plus browser/SSR tests                                         |
| VER-06 | No runtime override, Git requirement, schema/restore identity coupling         | Build-level contract, image inspection and code review                           |
| VER-07 | Sidebar/drawer/About responsive, accessible; dev clearly labeled               | Desktop/mobile/no-JS Playwright and accessibility regressions                    |
| VER-08 | Release Dockerfile rejects missing/partial/invalid metadata                    | Actual validation CLI and production build checks                                |

## Scope exclusions and limits

No automatic commits/tags, CI service, registry upload, semantic-version migration,
changelog generation, public version endpoint, multi-container expansion or data migration.
Identical release version does **not** guarantee byte-identical Docker image digests:
base/platform/toolchain changes can still change image bytes. Full hash remains the provenance key.
