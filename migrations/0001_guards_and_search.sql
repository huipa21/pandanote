-- Application-owned invariant guards and derived search. Restore validation must
-- compare these exact trusted objects before opening an uploaded DB for writes.
CREATE TRIGGER notes_insert_guard BEFORE INSERT ON notes BEGIN
  SELECT CASE WHEN NEW.revision <> 1 OR typeof(NEW.revision) <> 'integer'
    OR typeof(NEW.timeline_at) <> 'integer' OR typeof(NEW.created_at) <> 'integer'
    OR typeof(NEW.updated_at) <> 'integer'
    OR (NEW.content_edited_at IS NOT NULL AND typeof(NEW.content_edited_at) <> 'integer')
    THEN RAISE(ABORT, 'invalid initial note revision or time') END;
END;
--> statement-breakpoint
CREATE TRIGGER notes_update_guard BEFORE UPDATE ON notes BEGIN
  SELECT CASE WHEN NEW.id <> OLD.id OR NEW.created_at <> OLD.created_at
    OR typeof(NEW.revision) <> 'integer' OR NEW.revision <> OLD.revision + 1
    OR NEW.updated_at < OLD.updated_at OR typeof(NEW.updated_at) <> 'integer'
    OR typeof(NEW.timeline_at) <> 'integer'
    OR (NEW.content_edited_at IS NOT NULL AND typeof(NEW.content_edited_at) <> 'integer')
    THEN RAISE(ABORT, 'immutable note identity or invalid revision/time') END;
END;
--> statement-breakpoint
CREATE TRIGGER note_attachments_insert_guard BEFORE INSERT ON note_attachments BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM attachments WHERE id = NEW.attachment_id AND readiness = 'ready')
    OR EXISTS (SELECT 1 FROM file_cleanup_jobs WHERE attachment_id = NEW.attachment_id)
    THEN RAISE(ABORT, 'attachment is not available') END;
END;
--> statement-breakpoint
CREATE TRIGGER note_attachments_update_guard BEFORE UPDATE ON note_attachments BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM attachments WHERE id = NEW.attachment_id AND readiness = 'ready')
    OR EXISTS (SELECT 1 FROM file_cleanup_jobs WHERE attachment_id = NEW.attachment_id)
    THEN RAISE(ABORT, 'attachment is not available') END;
END;
--> statement-breakpoint
CREATE TRIGGER attachments_referenced_guard BEFORE UPDATE ON attachments
WHEN EXISTS (SELECT 1 FROM note_attachments WHERE attachment_id = OLD.id) BEGIN
  SELECT RAISE(ABORT, 'referenced attachment metadata is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER cleanup_insert_guard BEFORE INSERT ON file_cleanup_jobs BEGIN
  SELECT CASE WHEN EXISTS (SELECT 1 FROM note_attachments WHERE attachment_id = NEW.attachment_id)
    THEN RAISE(ABORT, 'attachment still referenced') END;
END;
--> statement-breakpoint
CREATE TRIGGER cleanup_update_guard BEFORE UPDATE OF attachment_id ON file_cleanup_jobs BEGIN
  SELECT CASE WHEN NEW.attachment_id <> OLD.attachment_id
    THEN RAISE(ABORT, 'cleanup identity is immutable') END;
END;
--> statement-breakpoint
-- Literal separate-field predicates remain authoritative. No virtual-table write
-- triggers requiring trusted_schema=ON; synchronization uses application hooks.
CREATE VIRTUAL TABLE note_search_fts USING fts5(note_id UNINDEXED, text, tokenize='trigram case_sensitive 1');
