# Nested tags — progress

## Current state

- **Step:** planning only; NT01 **not started** (awaiting user answers to README
  open questions). No application code changed.
- **Observed baseline:** sidebar `publishedTags` orders by normalized key, not count;
  sidebar shows first 6, modal shows all with substring search. Parser rejects `/`.
  `tags`/`tag_changes` have 64-character checks. Schema version 2, backup format 2.
- **Next task:** get answers to README questions 1–6, then NT01. Read README, SPEC,
  PLAN, main PRODUCT_SPEC §2/§3.3/§7 and ARCHITECTURE §9. Validation: `npm run lint`.

## History

- Planning session: created README/SPEC/PLAN/ACCEPTANCE_TESTS/PROGRESS in
  `docs/nested-tags/`. Commands: read-only inspection (`git status`, `grep`, file
  reads). No tests run (docs only). Other sessions' uncommitted editor/e2e changes
  were left untouched.
