# Image optimization — specification

**Status: approved specification; packaging implemented.** Alpine is explicitly
permitted by the user. Actual local validation, completion and remaining release/
manual limits are recorded in PROGRESS; these requirements remain authoritative. Actual results belong in [PROGRESS.md](PROGRESS.md).

## 1. Scope and success

Optimize packaging and transfer of the existing single-user application. Preserve
all current note, Markdown, Mermaid, highlighting, authentication, private-file,
search, setup, migration, maintenance, backup/restore and release-identity behavior.
No schema, archive-format or deployment-topology change is intended.

Success requires a reproducibly smaller production image and compressed archive,
plus the affected and full regression gates. A smaller artifact that cannot reset a
password, decode images or recover an interrupted restore is not success.

## 2. Observed baseline

The analysis inspected the actual local Docker-format archive, not host
`node_modules`. Its manifest contains one `linux/amd64` image:

- Tag: `localhost/pandanote:latest`.
- Version label: `261007-7`.
- Revision label: `287d4bef540dff761c129cdc7fcb001bac92de96`.
- Commit-time label: `2026-10-07T23:21:04.000Z`.
- File size: **612,746,240 bytes = 584.3603515625 MiB**.
- Streaming gzip level 6: **181,377,850 bytes = 172.97539710998535 MiB**;
  **70.39919004643748%** smaller for transfer.

| Component           | Uncompressed layer tar, MiB | Meaning                                                      |
| ------------------- | --------------------------: | ------------------------------------------------------------ |
| Node/Debian base    |                       224.4 | Includes OS, Node, npm/headers and Yarn                      |
| `/app/node_modules` |                       340.2 | Full production installation including peer-retained tooling |
| `/app/build`        |                        18.9 | Server/client output, including precompressed browser assets |
| Other app layers    |                          <1 | Source tools/library, migrations and metadata                |

Layer tar sizes include headers/padding. File payload totals are different:
`node_modules` payload is 324.3 MiB; its maps are 97.8 MiB, or approximately
99.1 MiB including their own tar headers/padding. Mermaid payload alone is
116.6 MiB, including 79.1 MiB of maps. These are **overlapping categories**, not
additive savings. Legacy archive layer aliases are symlinks, not duplicate payloads.

Other observed dependency payloads: TypeScript 23.2 MiB, Rolldown binding 18.6 MiB,
esbuild binary 10.9 MiB, Lightning CSS binding 9.6 MiB, Vite 2.3 MiB. The Node binary
is 120.7 MiB. A slim tag does not mean a small Node executable.

This archive is historical evidence, not a guarantee about the next checkout.
IO00 must capture the current Git/source identity and obtain a comparable control
build if application/dependency versions differ. Preserve the existing archive.

## 3. Production base and native modules

1. Use one verified, exact-tag and digest-pinned Node 24 Alpine base for production
   build, dependency-install and runtime stages. Prefer the current Node 24.21.0
   baseline when its Alpine image exists and supports the required platforms.
2. Resolve the tag/digest from the actual registry with TLS verification; record
   Node/npm/Alpine versions, manifest/index digest and platform. Never invent a
   digest or silently lower the existing Node engine minimum.
3. If a different supported Node 24 patch is necessary, document compatibility and
   update all affected pins/contracts together. An unavailable compatible base is
   a blocker, not permission to substitute an unsupported runtime.
4. Install CA certificates, Python, make and g++ in **both installation stages**
   before npm, because native downloads may need compilation fallback. Runtime
   may have required shared libraries/certificates, not an added compiler toolchain.
5. Install native modules afresh in Alpine. Never copy host or Debian-built native
   artifacts. Keep Sharp's musl platform packages and matching libvips payload.
6. Check actual dynamic-library resolution for the native objects. Do not use a
   glibc compatibility shim as the default workaround or mask a missing library.
7. Production must not depend on network/package installation at startup.

Runtime library defaults are `ca-certificates` and `libstdc++`; verify whether
`libgcc` or any additional library is required. Do not add a system libvips or SQLite
package merely because their npm modules exist: verify the selected packaging.
Check non-UTC/DST behavior; add OS timezone data only when actual behavior requires
it rather than assume musl and Node's ICU have identical responsibilities.

## 4. Runtime manifest and lockfile

### 4.1 Separate dependency contract

Add `ops/runtime/package.json` and `ops/runtime/package-lock.json`. This is a small
packaging manifest, **not a workspace, new service or replacement application**.
It has no application build/prepare script and no development dependencies.

Select exact direct versions from the main manifest and record why each runtime
root exists. A typed verifier and tests must prevent version drift, unexpected roots,
missing explicit runtime peers and stale manifest/lockfile agreement. Transitive
resolutions are committed in the runtime lockfile; no unlocked production install.

Prefer preserving root-lock transitive resolutions when feasible. If the smaller
graph necessarily resolves differently, review and record those differences and
check root `overrides` relevant to the runtime graph. Do not assume exact direct
pins also freeze transitive versions. Lock regeneration is an explicit maintenance
operation, not a network mutation during ordinary validation/build.

### 4.2 Initial dependency classification

**Candidate runtime roots to verify:** `@js-temporal/polyfill`, `@sveltejs/kit`,
`svelte`, `argon2`, `better-sqlite3`, `drizzle-orm`, `otplib`, `qrcode`,
`rehype-sanitize`, `rehype-stringify`, `remark-gfm`, `remark-parse`, `remark-rehype`,
`sharp`, `shiki`, `tar-stream`, `unified`, `zod`.

**Exclude from the runtime roots:** `mermaid`, `dompurify`,
`@sveltejs/adapter-node`, Vite, the Svelte Vite plugin, TypeScript, linters, test tools
and migration-generation tooling. Preserve browser bundling of Mermaid/DOMPurify.
Root build-only dependency reclassification is permitted with a reviewed lockfile
update, but is not a substitute for a small runtime graph.

This list is an initial classification, not a proven complete allowlist. Audit the
actual generated server, source bootstrap/maintenance imports, dynamically loaded
modules and worker processes. In particular, the image worker uses Sharp through
runtime loading even if a superficial external-import scan does not list it.

### 4.3 Peer handling

Install the dedicated runtime manifest with the intended command:

```sh
npm ci --omit=dev --omit=peer
```

Explicitly declare peers the **running code** requires (notably `svelte`). Kit's
build-tool peers must not install Vite/TypeScript/native build tooling just to satisfy
metadata for an already-built server. Verify actual npm 11 behavior and final
inventory; flags alone are not evidence. If this strategy cannot produce a working
minimal runtime, record the failure and design a deterministic alternative without
silently bundling dev tools back in.

**Never blanket-omit optional dependencies.** Sharp's native packages are optional
platform dependencies. Inspect remaining optional peers/roots and import behavior
rather than remove all of them.

### 4.4 Final application metadata and source tooling

The final `/app/package.json` must retain the main application's ESM `type` and
`#lib`/`#lib/*` mappings. Do not accidentally replace it with the staging manifest.
Keep Node 24 native TypeScript stripping and the explicit `.ts` source contracts;
do not add TypeScript/tsx to production merely to run existing tools.

Preserve the trusted migrations, `src/lib`, bootstrap/user/entry scripts,
reset-password, reindex, build-info JSON and any referenced worker paths. Avoid an
aggressive source-tree trim in the first implementation. A full `npm ls` against
main package metadata is not a sufficient inventory test when it also lists
build-only dependencies; validate against the reviewed runtime contract and actual
imports/behavior.

## 5. Pruning and layer construction

After native installation succeeds, remove dependency `*.map` files in the
production-deps stage **before** its `node_modules` tree is copied into runtime.
Keep package metadata, executable JS/ESM/CJS, required native objects, WASM/grammar
assets, license notices and platform packages. No broad extension-based deletion of
`.ts`, `.json`, `.wasm` or native files.

Do not prune arbitrary source/test/demo directories without per-package evidence.
Compiler-only SQLite source can be investigated later but is not necessary to meet
this first scope. Deleting files in a later layer cannot remove their bytes from an
earlier copy layer. Never squash layers to hide an uncontrolled copy.

Retain the built app's `.gz` and `.br` browser assets (observed total approximately
4.6 MiB). Do not disable precompression, drop diagrams/languages/fonts or relax CSP
just to improve image numbers. Application build/server maps may be reviewed
separately; dependency maps are the first pruning target.

## 6. Unchanged runtime and deployment invariants

- Keep root `docker-compose.yml`, one ORIGIN-required env template and existing Caddy.
- Keep configurable ORIGIN/host data bind/image and default/non-default PUID/PGID.
- Entry starts as root solely for private bind preparation, then permanently drops
  privileges before keys/SQLite. Node remains PID 1 with no server capabilities.
- Preserve `/data`, private modes, ownership/path refusals, healthcheck, body limit,
  readiness-before-listen, automatic startup migrations and recovery order.
- Keep named reset-password/reindex semantics, no-echo PTY reset, live revocation,
  signal handling/default idle shutdown and interrupted backup/restore recovery.
- Preserve immutable Git-derived OCI/UI/build-info identity and dirty/shallow-source
  rejection. No runtime metadata override, test fixture or Git history in runtime.
- Make no database/archive compatibility changes. Never reuse real application data
  for this validation. Earlier greenfield permission is not permission to delete
  current user data or the supplied image archive.

## 7. Measurement and export contract

Add a reproducible read-only size report for Docker-format `.tar` and `.tar.gz`
archives. Proposed CLI and tests are in PLAN. It must report bytes and MiB distinctly,
image identity/platform, layer sizes, file-payload categories, largest packages and
source-map totals without extracting files or logging content. Handle Podman's
legacy layer aliases without double-counting; clearly label overlapping categories.
Docker containerd exports may store gzip/zstd layer blobs in their Docker manifest:
report stored blob size separately from streamed decoded layer tar bytes. Continue
to refuse standalone OCI archives rather than infer an unreviewed OCI graph.

Record engine-reported image size separately from saved tar size and compressed
size. These are not interchangeable and do not describe running application RSS.
Use the same gzip level (6) and architecture for comparisons; note any runtime or
source differences. Gzip only improves transfer/storage, not the loaded image.

Publish reproducible Docker/Podman export, gzip, checksum, transfer and Docker-load
instructions, including the Podman localhost namespace/retag. Preserve uncompressed
export commands as supported alternatives. No app backup encryption/format change.

## 8. Size targets and completion rules

Required: a measured reduction in both comparable raw and gzip archive sizes,
with native/browser/data-safety gates passing and no loss of supported behavior.

**Default engineering targets:** at least 25% smaller raw archive and 20% smaller
gzip archive than the matched baseline. Investigate misses before completion;
default targets may be adjusted only with measured rationale in DECISIONS/PROGRESS,
never by weakening functionality or hiding a comparison mismatch. No fixed final
MiB promise is made before the optimized image exists.

AMD64 is the initial mandatory platform. The existing ARM64 build option must not
be gratuitously removed. Run its native gates if resources are available; otherwise
mark ARM64 unvalidated, not passed. The final exact user release commit still needs
its release gate when commit approval is available. Synthetic clone results can
prove packaging locally but cannot close that provenance gate.

## 9. Out of scope

New features/services, editor changes, virtualization, broad dependency upgrades,
security-policy weakening, automatic backups, schema resets, resolving SS01 atomic
exchange, bundling a proxy, deploying to the user's VPS, introducing a registry/CI
service, or eliminating browser assets/grammars to chase size. Do not make the
browser test driver Alpine solely because the production app is Alpine.
