-- Derived, rebuildable candidate index. Literal separate-field predicates remain
-- authoritative; no FTS triggers requiring trusted_schema=ON.
CREATE VIRTUAL TABLE note_search_fts USING fts5(note_id UNINDEXED, text, tokenize='trigram case_sensitive 1');
