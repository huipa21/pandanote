import { sql } from 'drizzle-orm';
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  primaryKey,
  check,
} from 'drizzle-orm/sqlite-core';

// UUIDs and UTC milliseconds use the same representation in all tables.
const id = () => text('id').primaryKey().notNull();
const created = () => integer('created_at').notNull();
export const account = sqliteTable(
  'account',
  {
    id: id(),
    singleton: integer('singleton').notNull().default(1),
    username: text('username').notNull(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    totpSecretEncrypted: text('totp_secret_encrypted'),
    totpEnabled: integer('totp_enabled').notNull().default(0),
    lastTotpStep: integer('last_totp_step'),
    securityRevision: integer('security_revision').notNull().default(1),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex('account_singleton').on(t.singleton),
    check('account_singleton_check', sql`${t.singleton} = 1`),
    check(
      'account_security_check',
      sql`${t.securityRevision} >= 1 AND ${t.totpEnabled} IN (0,1) AND (${t.totpEnabled} = 0 OR ${t.totpSecretEncrypted} IS NOT NULL) AND (${t.lastTotpStep} IS NULL OR ${t.lastTotpStep} >= 0)`,
    ),
  ],
);
export const sessions = sqliteTable(
  'sessions',
  {
    tokenHash: text('token_hash').primaryKey().notNull(),
    accountId: text('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    expiresAt: integer('expires_at').notNull(),
    revokedAt: integer('revoked_at'),
    securityRevision: integer('security_revision').notNull(),
    createdAt: created(),
  },
  (t) => [
    index('sessions_expiry').on(t.expiresAt),
    check(
      'session_hash_check',
      sql`length(${t.tokenHash}) = 64 AND ${t.tokenHash} NOT GLOB '*[^0-9a-f]*'`,
    ),
  ],
);
export const authChallenges = sqliteTable(
  'auth_challenges',
  {
    tokenHash: text('token_hash').primaryKey().notNull(),
    accountId: text('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['mfa', 'fresh-auth', 'enrollment'] }).notNull(),
    scope: text('scope').notNull(),
    sessionHash: text('session_hash').references(() => sessions.tokenHash, {
      onDelete: 'cascade',
    }),
    securityRevision: integer('security_revision').notNull(),
    payloadEncrypted: text('payload_encrypted'),
    expiresAt: integer('expires_at').notNull(),
    consumedAt: integer('consumed_at'),
    createdAt: created(),
  },
  (t) => [
    index('auth_challenges_expiry').on(t.expiresAt),
    check(
      'challenge_kind_check',
      sql`${t.kind} IN ('mfa','fresh-auth','enrollment')`,
    ),
    check(
      'challenge_hash_check',
      sql`length(${t.tokenHash}) = 64 AND ${t.tokenHash} NOT GLOB '*[^0-9a-f]*'`,
    ),
  ],
);
export const recoveryCodes = sqliteTable(
  'recovery_codes',
  {
    id: id(),
    accountId: text('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    consumedAt: integer('consumed_at'),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex('recovery_code_unique').on(t.accountId, t.codeHash),
    index('recovery_unconsumed').on(t.accountId, t.consumedAt),
  ],
);
export const authRateLimits = sqliteTable(
  'auth_rate_limits',
  {
    keyHash: text('key_hash').primaryKey().notNull(),
    attempts: integer('attempts').notNull(),
    windowStartedAt: integer('window_started_at').notNull(),
    blockedUntil: integer('blocked_until'),
    expiresAt: integer('expires_at').notNull(),
  },
  (t) => [
    index('auth_rate_limits_expiry').on(t.expiresAt),
    check('rate_attempts_check', sql`${t.attempts} >= 0`),
  ],
);
export const notes = sqliteTable(
  'notes',
  {
    id: id(),
    bodyMarkdown: text('body_markdown').notNull(),
    status: text('status', { enum: ['published', 'trash'] }).notNull(),
    priorStatus: text('prior_status', { enum: ['published'] }),
    timelineAt: integer('timeline_at').notNull(),
    createdAt: created(),
    updatedAt: integer('updated_at').notNull(),
    contentEditedAt: integer('content_edited_at'),
    revision: integer('revision').notNull().default(1),
    // UTC ms the note was pinned; only published notes can be pinned.
    pinnedAt: integer('pinned_at'),
    // At most one color/icon label; null clears it. Carried unchanged through
    // pin/trash/restore; cleared automatically if the label is deleted.
    labelId: text('label_id').references(() => labels.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [
    index('notes_status_timeline').on(
      t.status,
      sql`${t.timelineAt} DESC`,
      sql`${t.id} DESC`,
    ),
    index('notes_pinned')
      .on(sql`${t.pinnedAt} DESC`, sql`${t.id} DESC`)
      .where(sql`${t.pinnedAt} IS NOT NULL`),
    index('notes_label')
      .on(t.labelId, sql`${t.timelineAt} DESC`, sql`${t.id} DESC`)
      .where(sql`${t.labelId} IS NOT NULL`),
    check(
      'note_pinned_check',
      sql`${t.pinnedAt} IS NULL OR (${t.status} = 'published' AND ${t.pinnedAt} BETWEEN 0 AND 8640000000000000)`,
    ),
    check('note_status_check', sql`${t.status} IN ('published','trash')`),
    check(
      'note_trash_check',
      sql`(${t.status} = 'trash' AND ${t.priorStatus} IS NOT NULL AND ${t.priorStatus} = 'published') OR (${t.status} <> 'trash' AND ${t.priorStatus} IS NULL)`,
    ),
    check(
      'note_revision_check',
      sql`${t.revision} BETWEEN 1 AND 9007199254740991`,
    ),
    check(
      'note_time_check',
      sql`${t.timelineAt} BETWEEN 0 AND 8640000000000000 AND ${t.createdAt} BETWEEN 0 AND 8640000000000000 AND ${t.updatedAt} BETWEEN ${t.createdAt} AND 8640000000000000 AND (${t.contentEditedAt} IS NULL OR ${t.contentEditedAt} BETWEEN ${t.createdAt} AND ${t.updatedAt})`,
    ),
  ],
);
// Private user-named classifiers: a fixed color plus an optional fixed icon. At
// most one per note (notes.label_id). Deleting a label clears it from notes
// (ON DELETE SET NULL); no note is ever deleted by a label change.
export const labels = sqliteTable(
  'labels',
  {
    id: id(),
    name: text('name').notNull(),
    nameKey: text('name_key').notNull(),
    color: text('color').notNull(),
    icon: text('icon'),
    // Optional per-label visual overrides for the note card/detail: a header
    // tint, a whole-card background tint (same 8-key palette as `color`) and a
    // body font. All three are independently nullable; null means "not set".
    headerColor: text('header_color'),
    background: text('background'),
    font: text('font'),
    revision: integer('revision').notNull().default(1),
    createdAt: created(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('labels_name_key').on(t.nameKey),
    check(
      'label_check',
      sql`length(${t.name}) BETWEEN 1 AND 40 AND length(${t.nameKey}) BETWEEN 1 AND 160 AND ${t.color} IN ('red','orange','amber','green','teal','blue','purple','gray') AND (${t.icon} IS NULL OR ${t.icon} IN ('star','heart','flag','bookmark','folder','briefcase','book','home','warning','info','check-circle','camera','lightbulb','rocket','target','clock','calendar','mail','phone','chat','code','lock','key','chart','trophy','coffee','price-tag','car','plane','leaf','music','gift','cart','umbrella','compass','paw')) AND (${t.headerColor} IS NULL OR ${t.headerColor} IN ('red','orange','amber','green','teal','blue','purple','gray')) AND (${t.background} IS NULL OR ${t.background} IN ('red','orange','amber','green','teal','blue','purple','gray')) AND (${t.font} IS NULL OR ${t.font} IN ('serif','mono','rounded')) AND ${t.revision} BETWEEN 1 AND 9007199254740991 AND ${t.createdAt} BETWEEN 0 AND 8640000000000000 AND ${t.updatedAt} BETWEEN ${t.createdAt} AND 8640000000000000`,
    ),
  ],
);
// Receipts for label create/update/delete, separate from note and template
// receipts whose result schemas describe different mutations. Same retry rule:
// a matching ID returns the original result even after later edits or deletion.
export const labelMutationReceipts = sqliteTable('label_mutation_receipts', {
  mutationId: text('mutation_id').primaryKey().notNull(),
  accountId: text('account_id')
    .notNull()
    .references(() => account.id, { onDelete: 'restrict' }),
  requestDigest: text('request_digest').notNull(),
  resultJson: text('result_json').notNull(),
  createdAt: created(),
});
export const tags = sqliteTable(
  'tags',
  {
    id: id(),
    normalizedKey: text('normalized_key').notNull(),
    display: text('display').notNull(),
  },
  (t) => [
    uniqueIndex('tags_normalized_key').on(t.normalizedKey),
    check(
      'tag_length_check',
      sql`length(${t.normalizedKey}) BETWEEN 1 AND 64 AND length(${t.display}) BETWEEN 1 AND 64`,
    ),
  ],
);
export const noteTags = sqliteTable(
  'note_tags',
  {
    noteId: text('note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'restrict' }),
  },
  (t) => [
    primaryKey({ columns: [t.noteId, t.tagId] }),
    index('note_tags_tag_note').on(t.tagId, t.noteId),
  ],
);
export const tagChanges = sqliteTable(
  'tag_changes',
  {
    generation: integer('generation').primaryKey({ autoIncrement: true }),
    oldKey: text('old_key').notNull(),
    action: text('action', { enum: ['rename', 'merge', 'remove'] }).notNull(),
    targetKey: text('target_key'),
    createdAt: created(),
  },
  (t) => [
    index('tag_changes_old_key').on(t.oldKey, t.generation),
    check(
      'tag_change_check',
      sql`(${t.action} = 'remove' AND ${t.targetKey} IS NULL) OR (${t.action} IN ('rename','merge') AND ${t.targetKey} IS NOT NULL)`,
    ),
  ],
);
export const tagMutationReceipts = sqliteTable('tag_mutation_receipts', {
  mutationId: text('mutation_id').primaryKey(),
  accountId: text('account_id')
    .notNull()
    .references(() => account.id, { onDelete: 'restrict' }),
  requestDigest: text('request_digest').notNull(),
  resultJson: text('result_json').notNull(),
  createdAt: created(),
});
export const uploadBatches = sqliteTable(
  'upload_batches',
  {
    id: id(),
    accountId: text('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'restrict' }),
    mutationId: text('mutation_id').notNull(),
    requestDigest: text('request_digest').notNull(),
    status: text('status', {
      enum: ['pending', 'committed', 'abandoned'],
    }).notNull(),
    createdAt: created(),
    activityAt: integer('activity_at').notNull(),
  },
  (t) => [
    uniqueIndex('upload_batches_mutation').on(t.mutationId),
    index('upload_batches_activity').on(t.status, t.activityAt),
    check(
      'batch_status_check',
      sql`${t.status} IN ('pending','committed','abandoned')`,
    ),
  ],
);
export const attachments = sqliteTable(
  'attachments',
  {
    id: id(),
    kind: text('kind', { enum: ['image', 'file'] }).notNull(),
    originalFilename: text('original_filename').notNull(),
    detectedMime: text('detected_mime').notNull(),
    incomingDigest: text('incoming_digest').notNull(),
    incomingBytes: integer('incoming_bytes').notNull(),
    readiness: text('readiness', {
      enum: ['pending', 'ready', 'failed'],
    }).notNull(),
    batchId: text('batch_id').references(() => uploadBatches.id, {
      onDelete: 'restrict',
    }),
    displayBytes: integer('display_bytes'),
    displayDigest: text('display_digest'),
    width: integer('width'),
    height: integer('height'),
    thumbnailBytes: integer('thumbnail_bytes'),
    thumbnailDigest: text('thumbnail_digest'),
    thumbnailWidth: integer('thumbnail_width'),
    thumbnailHeight: integer('thumbnail_height'),
    fileBytes: integer('file_bytes'),
    fileDigest: text('file_digest'),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex('attachments_batch_identity').on(t.batchId, t.id),
    index('attachments_readiness').on(t.readiness, t.createdAt),
    check(
      'attachment_kind_check',
      sql`${t.kind} IN ('image','file') AND ${t.readiness} IN ('pending','ready','failed') AND ${t.incomingBytes} >= 0`,
    ),
    check(
      'attachment_ready_check',
      sql`${t.readiness} <> 'ready' OR (${t.kind} = 'file' AND ${t.fileBytes} IS NOT NULL AND ${t.fileBytes} >= 0 AND ${t.fileDigest} IS NOT NULL AND length(${t.fileDigest}) = 64 AND ${t.displayBytes} IS NULL AND ${t.thumbnailBytes} IS NULL AND ${t.width} IS NULL AND ${t.height} IS NULL) OR (${t.kind} = 'image' AND ${t.fileBytes} IS NULL AND ${t.fileDigest} IS NULL AND ${t.displayBytes} IS NOT NULL AND ${t.displayBytes} > 0 AND ${t.displayDigest} IS NOT NULL AND length(${t.displayDigest}) = 64 AND ${t.thumbnailBytes} IS NOT NULL AND ${t.thumbnailBytes} > 0 AND ${t.thumbnailDigest} IS NOT NULL AND length(${t.thumbnailDigest}) = 64 AND ${t.width} IS NOT NULL AND ${t.width} > 0 AND ${t.height} IS NOT NULL AND ${t.height} > 0 AND ${t.thumbnailWidth} IS NOT NULL AND ${t.thumbnailWidth} > 0 AND ${t.thumbnailHeight} IS NOT NULL AND ${t.thumbnailHeight} > 0)`,
    ),
  ],
);
export const noteAttachments = sqliteTable(
  'note_attachments',
  {
    noteId: text('note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    attachmentId: text('attachment_id')
      .notNull()
      .references(() => attachments.id, { onDelete: 'restrict' }),
    ordinal: integer('ordinal').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.noteId, t.attachmentId] }),
    uniqueIndex('note_attachments_order').on(t.noteId, t.ordinal),
    index('note_attachments_attachment_note').on(t.attachmentId, t.noteId),
    check('attachment_order_check', sql`${t.ordinal} >= 0`),
  ],
);
export const mutationReceipts = sqliteTable(
  'mutation_receipts',
  {
    mutationId: text('mutation_id').primaryKey().notNull(),
    accountId: text('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'restrict' }),
    requestDigest: text('request_digest').notNull(),
    resultJson: text('result_json').notNull(),
    createdAt: created(),
  },
  (t) => [
    index('mutation_receipts_created').on(t.createdAt),
    check('receipt_json_check', sql`json_valid(${t.resultJson})`),
  ],
);
// Private reusable Markdown starting texts. Notes copy the text when created from
// a template, so there is no foreign key to notes and no Trash lifecycle. A template
// may carry a default label, applied to the note when the template is inserted;
// deleting that label just clears the reference.
export const noteTemplates = sqliteTable(
  'note_templates',
  {
    id: id(),
    name: text('name').notNull(),
    nameKey: text('name_key').notNull(),
    bodyMarkdown: text('body_markdown').notNull(),
    labelId: text('label_id').references(() => labels.id, {
      onDelete: 'set null',
    }),
    revision: integer('revision').notNull().default(1),
    createdAt: created(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('note_templates_name_key').on(t.nameKey),
    check(
      'note_template_check',
      sql`length(${t.name}) BETWEEN 1 AND 60 AND length(${t.nameKey}) BETWEEN 1 AND 240 AND length(${t.bodyMarkdown}) > 0 AND ${t.revision} BETWEEN 1 AND 9007199254740991 AND ${t.createdAt} BETWEEN 0 AND 8640000000000000 AND ${t.updatedAt} BETWEEN ${t.createdAt} AND 8640000000000000`,
    ),
  ],
);
// Receipts for template create/update/delete, separate from note receipts whose
// result schema describes note mutations. Same retry rule: a matching ID returns
// the original result even after later edits or deletion.
export const templateMutationReceipts = sqliteTable(
  'template_mutation_receipts',
  {
    mutationId: text('mutation_id').primaryKey().notNull(),
    accountId: text('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'restrict' }),
    requestDigest: text('request_digest').notNull(),
    resultJson: text('result_json').notNull(),
    createdAt: created(),
  },
);
export const appSettings = sqliteTable(
  'app_settings',
  {
    singleton: integer('singleton').primaryKey().notNull(),
    valueJson: text('value_json').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    check('settings_singleton_check', sql`${t.singleton} = 1`),
    check('settings_json_check', sql`json_valid(${t.valueJson})`),
  ],
);
export const backupJobs = sqliteTable(
  'backup_jobs',
  {
    id: id(),
    state: text('state', {
      enum: ['pending', 'capturing', 'archiving', 'complete', 'failed'],
    }).notNull(),
    archiveId: text('archive_id'),
    bytes: integer('bytes'),
    progress: integer('progress').notNull().default(0),
    errorCode: text('error_code'),
    createdAt: created(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    index('backup_jobs_state').on(t.state, t.createdAt),
    check(
      'backup_state_check',
      sql`${t.state} IN ('pending','capturing','archiving','complete','failed') AND ${t.progress} BETWEEN 0 AND 100 AND (${t.state} <> 'complete' OR (${t.archiveId} IS NOT NULL AND ${t.bytes} IS NOT NULL AND ${t.bytes} > 0))`,
    ),
  ],
);
export const fileCleanupJobs = sqliteTable(
  'file_cleanup_jobs',
  {
    id: id(),
    attachmentId: text('attachment_id')
      .notNull()
      .references(() => attachments.id, { onDelete: 'restrict' }),
    state: text('state', { enum: ['pending', 'running', 'failed'] })
      .notNull()
      .default('pending'),
    attempts: integer('attempts').notNull().default(0),
    errorCode: text('error_code'),
    createdAt: created(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('cleanup_attachment_unique').on(t.attachmentId),
    index('cleanup_pending').on(t.state, t.createdAt),
    check(
      'cleanup_state_check',
      sql`${t.state} IN ('pending','running','failed') AND ${t.attempts} >= 0`,
    ),
  ],
);
// Derived fields remain separate so a phrase can never bridge unrelated fields.
// FTS5 is application-owned custom SQL; its synchronization is explicit.
export const noteSearch = sqliteTable(
  'note_search',
  {
    noteId: text('note_id')
      .primaryKey()
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    bodyNormalized: text('body_normalized').notNull(),
    tagFieldsJson: text('tag_fields_json').notNull(),
    filenameFieldsJson: text('filename_fields_json').notNull(),
    sourceRevision: integer('source_revision').notNull(),
  },
  (t) => [
    check(
      'search_fields_check',
      sql`json_valid(${t.tagFieldsJson}) AND json_type(${t.tagFieldsJson}) = 'array' AND json_valid(${t.filenameFieldsJson}) AND json_type(${t.filenameFieldsJson}) = 'array' AND ${t.sourceRevision} >= 1`,
    ),
  ],
);
