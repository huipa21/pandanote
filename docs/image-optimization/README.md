# Change: Smaller production image

**Status: implemented packaging; local gates and final state are in PROGRESS.**
The user explicitly allowed Alpine and sequential IO00–IO07 implementation. Actual
musl/native, production/browser/restore, size and transfer evidence—not just plans—
is recorded in [PROGRESS.md](PROGRESS.md). This is not an overall release claim.

## Goal

Reduce both the loaded production image and its transfer archive without removing
features, weakening security or complicating the existing-Caddy installation.

Measured starting point: `pandanote-image.tar` is **612,746,240 bytes (584.4 MiB)**.
Its largest components are production dependencies (340.2 MiB) and the Node/Debian
base (224.4 MiB); the built app is only 18.9 MiB. Gzip level 6 reduces the existing
archive to **181,377,850 bytes (173.0 MiB)**. See [SPEC.md](SPEC.md) for measurement
identity, overlapping categories and limitations.

Final matched result: **584.36→267.18MiB raw (54.28% smaller)** and canonical
gzip6 **172.98→88.14MiB (49.04% smaller)**, with actual musl/production/restore/
compressed-load gates passed. Detailed identities, components and performance:
[RESULTS.md](RESULTS.md). Manual/ARM64/exact-user-release limits remain open.

The implemented solution is:

1. A digest-pinned Node 24 Alpine production image, with native modules installed
   inside Alpine, not copied from Debian/Windows.
2. A separate, exact-pinned runtime manifest and lockfile that exclude browser-only
   packages and build-tool peers while keeping the generated server and tools usable.
3. Conservative removal of source maps before copying dependencies into runtime.
4. Compressed image export/load guidance for Docker and Podman.
5. Actual production-image native, browser, maintenance, backup/restore and transfer
   validation, followed by measured before/after results.

## Documents

This folder follows the structure of [simplify-setup](../simplify-setup/README.md).

| File                                                 | Purpose                                                        |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| [SPEC.md](SPEC.md)                                   | Scope, packaging contracts, invariants and size targets        |
| [DECISIONS.md](DECISIONS.md)                         | User authorization, proposed decisions, alternatives and risks |
| [PLAN.md](PLAN.md)                                   | Ordered IO00–IO07 implementation steps, files and done gates   |
| [ACCEPTANCE_TESTS.md](ACCEPTANCE_TESTS.md)           | Cases to implement and evidence required                       |
| [OPERATIONS.md](OPERATIONS.md)                       | Pointer to canonical validated operator/developer guidance     |
| [PROGRESS.md](PROGRESS.md)                           | Actual state, checklist and append-only implementation handoff |
| [RESULTS.md](RESULTS.md)                             | Measured matched sizes, final gate summary and performance     |
| [IMPLEMENTATION_PROMPT.md](IMPLEMENTATION_PROMPT.md) | Copyable long-session prompt for the implementing agent        |

## Authority and relationship to existing work

Explicit user requirements remain highest priority. This change authorizes the
Alpine direction; its engineering choices are defaults to verify, not prevalidated
facts. Existing product and simplify-setup requirements remain unchanged. On
implementation, reconcile the current Debian production-image description in main
ARCHITECTURE; do not rewrite historical validation evidence as Alpine evidence.

Read the main [product specification](../PRODUCT_SPEC.md),
[architecture](../ARCHITECTURE.md), [implementation plan](../IMPLEMENTATION_PLAN.md),
[acceptance matrix](../ACCEPTANCE_TESTS.md) and [progress](../PROGRESS.md), plus the
simplify-setup SPEC and current handoff before application changes.

For this explicitly requested long session, the implementing agent may complete
multiple IO steps sequentially rather than the normal one-step-per-session rule.
Each step still needs evidence and an honest progress update. The SS01 atomic
exchange clarification and S18 public-VPS/device/accessibility/exact-release gates
are independent and must not be silently resolved or marked complete here.

## Start here

Read all documents in this folder and the actual [handoff](PROGRESS.md) before
repeating gates or making changes; [PLAN.md](PLAN.md) records the implementation order.
Do not commit the user's repository, replace a deployed image or manipulate real
data without permission. Use isolated engines/resources and synthetic committed
clones when the clean-source wrapper requires a commit during validation.
