# Nested tags — acceptance tests

Existing TAG-01..03, SEARCH and archive cases must keep passing (with the flat-only
wording replaced by NT01).

## NT-PARSE — Grammar (unit)

`#a/b/c` → key `a/b/c`. `#A/B` ≡ `#a/b`. `#a/` → `a`. `#a//b` → `a`. `#/a` → none.
6 segments, a 65-codepoint segment or a path > 128 → note validation error (same as
today's over-long tag; never silent truncation). `#香港/美食` works. Code spans, `\#a/b`, URLs
(`https://x.test/#a/b`), link destinations, headings unaffected. Right-to-left
rewrite of nested spans preserves surrounding Markdown byte-for-byte.

## NT-COUNT — Counts and ordering (unit + integration)

Notes: N1 `#work`, N2 `#work/meeting`, N3 `#work #work/meeting`, N4 `#home`,
N5 (Trash) `#work/x`. Sidebar: `work (3)` before `home (1)`; `work` children:
`meeting (2)`; `work/x` hidden. Equal counts sort by key. Implicit parent from only
`#a/b` appears as `a (1)` with display from the descendant spelling.

## NT-FILTER — Filtering (integration + e2e)

`?tag=work` → N1–N3; `?tag=work/meeting` → N2, N3; `?tag=work&tag=home` → none.
`?tag=wor` does not match `work`. Keys containing `%`/`_` behave literally. Search +
subtree tag + day combine with AND; cursor pages stable.

## NT-SIDEBAR / NT-UI — Interface (e2e)

Roots ordered by count; expand/collapse by mouse, keyboard and touch; active filter's
ancestors auto-expanded; full-path accessible names; top-6 + Show all modal with
segment search; mobile drawer; 200% zoom/short height usable; card/filter chips show
full path; autocomplete after `#work/` lists children.

## NT-MANAGE — Management (integration + e2e)

Rename `work → job` rewrites `#Work/Meeting` to `#job/Meeting` (suffix spelling
kept), revisions +1 once per affected note, Trash included. Rename into own subtree
refused. Collision (`job/meeting` exists) requires merge confirmation and dedupes.
Remove `exact` keeps `#work/meeting`; remove `subtree` removes all. Resulting path
over limits refused without changes. Stale preview token refused. Response-loss
retry returns original receipt.

## NT-STALE — History (unit + e2e)

After `work → job`, editor body `#work/new` gets stale dialog offering `#job/new`;
chain `work → job`, `job/new → misc` maps `work/new` → `misc`. Subtree removal maps
descendants to removal. Exact removal of `work` does not flag `work/meeting`.
Acknowledged recreation still requires matching generation.

## NT-BASE — Fresh baseline (integration, Linux image)

Fresh DB accepts a 128-character key and `scope` history rows; rejects 129
characters, unknown scopes and rename/merge with `exact` scope. Databases created by
the previous baseline are refused by the hash check (no wipe). Backup create/restore
round-trip retains nested tags and scoped history.

## NT-PERF

10,000 notes, several hundred tags with depth up to 5: sidebar tree load and subtree
filter first page p95 < 100 ms server-side on the reference fixture.
