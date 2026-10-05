import { DraftRepository } from './repository.ts';
import { DEFAULT_SETTINGS } from '#lib/shared/settings.ts';
import { storageLimitsFrom, type StorageLimits } from '#lib/shared/storage.ts';
import { SvelteMap } from 'svelte/reactivity';
import { IndexedDraftBlobs } from './blobs.ts';
import {
  DraftError,
  draftSchema,
  commandForDraft,
  hasContent,
  newDraft,
  removeImageReferences,
  type LocalDraft,
  type DraftAttachment,
} from './model.ts';
import type { ImageReference } from '#lib/shared/markdown/render.ts';

import {
  commandDigest,
  sha256,
  postingAttemptSchema,
  type PostingAttempt,
} from '../uploads/attempt.ts';
import {
  runPosting,
  PostingError,
  type PostingProgress,
} from '../uploads/protocol.ts';
import type { ApiResult, NoteSnapshot } from '#lib/shared/domain.ts';
import { canonicalNoteSnapshot } from '#lib/shared/notes.ts';
import { browserPostingTransport } from '../uploads/protocol.ts';
import { localImage } from '../uploads/file-kind.ts';
import { recoveryDraft } from './recovery.ts';
import { recoveryMatches } from './model.ts';
import { extractTags } from '#lib/shared/markdown/tags.ts';
import { rewriteTagKeys, type StaleTag } from '#lib/shared/tags.ts';

export const DRAFT_WORKSPACE = Symbol('draft workspace');
export class DraftWorkspace {
  active = $state<LocalDraft | null>(null);
  drafts = $state<LocalDraft[]>([]);
  images = $state<ImageReference[]>([]);
  missing = $state<string[]>([]);
  error = $state('');
  warnings = $state<string[]>([]);
  status = $state('');
  persistence = $state('');
  ready = $state(false);
  busy = $state(false);
  dirty = $state(false);
  conflict = $state(false);
  openEditor = $state(0);
  posting = $state(false);
  postError = $state('');
  postRequiresLogin = $state(false);
  postConflict = $state<NoteSnapshot | null>(null);
  staleTagChoices = $state<StaleTag[]>([]);
  staleTagDraftId = $state('');
  tagsChanged = $state(0);
  knownTags = $state<{ key: string; display: string }[]>([]);
  postProgress = $state<PostingProgress | null>(null);
  saved = $state<{
    serial: number;
    result: import('#lib/shared/domain.ts').MutationResult;
    snapshot?: NoteSnapshot;
  } | null>(null);
  recentMutations = $state<import('#lib/shared/domain.ts').MutationResult[]>(
    [],
  );
  get frozen() {
    return Boolean(this.active?.postingAttempt);
  }
  get canPost() {
    return (
      this.ready &&
      !this.busy &&
      !this.posting &&
      !this.conflict &&
      Boolean(this.active && hasContent(this.active)) &&
      (!this.missing.length || this.frozen)
    );
  }
  private repository?: DraftRepository;
  private timer?: ReturnType<typeof setTimeout>;
  private queue: Promise<void> = Promise.resolve();
  private epoch = 0;
  private activePersisted = false;
  private previewRequested = false;
  private disposed = false;
  private channel?: BroadcastChannel;
  private urlGeneration = 0;
  readonly accountId: string;
  timezone = $state('UTC');
  limits = $state<StorageLimits>(storageLimitsFrom(DEFAULT_SETTINGS));
  constructor(accountId: string, timezone = 'UTC') {
    this.accountId = accountId;
    this.timezone = timezone;
  }

  async start(): Promise<() => void> {
    this.disposed = false;
    try {
      // No racy localStorage-only fallback: unsupported browsers can read/copy
      // their drafts but must not falsely promise safe multi-tab writes.
      const storage = window.localStorage;
      const locks = navigator.locks;
      const blobs = new IndexedDraftBlobs(window.indexedDB);
      if (!locks)
        this.error =
          'Safe draft writes need browser Web Locks support. Use a current browser; keep a copy of your text.';
      this.channel =
        typeof BroadcastChannel !== 'undefined'
          ? new BroadcastChannel(`pandanote:drafts:${this.accountId}`)
          : undefined;
      this.repository = new DraftRepository(
        this.accountId,
        storage,
        blobs,
        (name, action) => {
          if (!locks)
            throw new DraftError(
              'unsupported',
              'Safe draft storage is not supported by this browser. Keep a copy of your text.',
            );
          return locks.request(name, action);
        },
        () => this.channel?.postMessage('changed'),
      );
      this.refresh();
      const first = this.drafts.find((d) => d.kind === 'new');
      if (first) {
        this.active = first;
        this.activePersisted = true;
        await this.loadFiles();
        this.status = 'Recovered on this device.';
      }
      this.ready = true;
      void this.repository
        .cleanupOrphans()
        .then((warnings) => {
          if (!this.disposed)
            this.warnings = [
              ...this.warnings,
              ...warnings.filter((warning) => !this.warnings.includes(warning)),
            ];
        })
        .catch(() => {
          if (!this.disposed)
            this.warnings = [
              ...this.warnings,
              'Unused local files could not be cleaned up. Retry after freeing browser storage.',
            ];
        });
      if (navigator.storage?.persisted) {
        const granted = await navigator.storage.persisted();
        if (!this.disposed)
          this.persistence = granted
            ? 'Persistent browser storage is enabled; it is not a backup.'
            : 'Browser storage may be evicted. You can request persistent storage.';
      }
    } catch (error) {
      this.fail(error);
      this.ready = true;
    }
    const changed = () => {
      if (this.disposed || !this.repository) return;
      this.refresh();
      if (this.active && this.activePersisted) {
        try {
          const record = this.repository.read(this.active.localDraftId);
          if (
            !record ||
            record.deleted ||
            record.revision !== this.active.revision
          ) {
            this.conflict = true;
            this.status = '';
            this.error =
              'This draft changed or was discarded in another tab. Your version is still here; choose how to keep it.';
          }
        } catch (error) {
          this.fail(error);
        }
      }
    };
    const storageChanged = (event: StorageEvent) => {
      if (
        event.key === null ||
        event.key.startsWith(this.repository?.prefix ?? '\u0000')
      )
        changed();
    };
    window.addEventListener('storage', storageChanged);
    if (this.channel) this.channel.onmessage = changed;
    const flush = () => {
      void this.flush();
    };
    const visibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (this.dirty || this.busy || this.conflict || this.posting) {
        flush();
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', unload);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      this.disposed = true;
      clearTimeout(this.timer);
      this.revokeUrls();
      this.channel?.close();
      this.repository?.blobs.close();
      window.removeEventListener('storage', storageChanged);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('visibilitychange', visibility);
    };
  }
  private refresh() {
    if (!this.repository) return;
    const listing = this.repository.list();
    this.drafts = listing.drafts;
    this.warnings = listing.warnings;
  }
  private fail(error: unknown) {
    this.error =
      error instanceof DraftError
        ? error.message
        : 'Draft storage failed. Keep a copy of your text/files and retry.';
    this.status = '';
    if (error instanceof DraftError && error.code === 'conflict')
      this.conflict = true;
  }
  change(bodyMarkdown: string) {
    if (!this.ready || this.busy || this.frozen || this.posting) return;
    if (!this.active) {
      this.active = newDraft(this.accountId);
      this.activePersisted = false;
    }
    this.active = { ...this.active, bodyMarkdown };
    this.epoch++;
    this.dirty = true;
    this.status = 'Saving on this device…';
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush();
    }, 300);
  }
  updateMetadata(values: Pick<LocalDraft, 'timelineAt' | 'location'>) {
    if (!this.ready || this.busy || this.frozen || this.posting) return;
    if (!this.active) {
      this.active = newDraft(this.accountId);
      this.activePersisted = false;
    }
    this.active = { ...this.active, ...values };
    this.epoch++;
    this.dirty = true;
    void this.flush();
  }
  private enqueue(action: () => Promise<boolean>): Promise<boolean> {
    const result = this.queue.then(action).catch((error) => {
      if (!this.disposed) this.fail(error);
      return false;
    });
    this.queue = result.then(() => {});
    return result;
  }
  flush(): Promise<boolean> {
    clearTimeout(this.timer);
    return this.enqueue(async () => {
      if (this.disposed) return false;
      if (!this.dirty) return !this.conflict;
      if (!this.active || !this.repository || this.conflict) return false;
      const snapshot = $state.snapshot(this.active);
      const epoch = this.epoch;
      const record = this.repository.read(snapshot.localDraftId);
      const saved =
        record === null && !this.activePersisted
          ? await this.repository.create(snapshot)
          : await this.repository.save(snapshot);
      if (this.disposed) return false;
      // Text typed while a write awaited the lock remains dirty; only adopt the
      // committed revision, never replace that newer in-memory text.
      this.active =
        this.epoch === epoch
          ? saved
          : { ...this.active, revision: saved.revision };
      this.activePersisted = true;
      this.dirty = this.epoch !== epoch;
      this.error = '';
      this.status = this.dirty
        ? 'Saving on this device…'
        : 'Saved on this device.';
      this.refresh();
      return !this.dirty;
    });
  }
  async createAnother(): Promise<boolean> {
    if (this.busy || !(await this.flush())) return false;
    return this.enqueue(async () => {
      if (!this.repository || this.disposed) return false;
      const draft = await this.repository.create();
      this.active = draft;
      this.activePersisted = true;
      this.dirty = false;
      this.conflict = false;
      this.error = '';
      this.status = 'Saved on this device.';
      this.missing = [];
      this.revokeUrls();
      this.refresh();
      this.openEditor++;
      return true;
    });
  }
  async resume(id: string, reveal = true): Promise<boolean> {
    if (this.busy || !(await this.flush())) return false;
    return this.enqueue(async () => {
      const record = this.repository?.read(id);
      if (!record || record.deleted)
        throw new DraftError(
          'conflict',
          'This draft was discarded in another tab.',
        );
      this.active = record;
      this.activePersisted = true;
      this.dirty = false;
      this.conflict = false;
      this.error = '';
      this.postError = '';
      this.postConflict = null;
      this.status =
        record.kind === 'new'
          ? 'Recovered on this device.'
          : 'Local recovery edits — server version must be checked before saving.';
      await this.loadFiles();
      if (reveal) this.openEditor++;
      return true;
    });
  }
  async addFiles(files: File[], start: number, end: number): Promise<void> {
    if (
      this.busy ||
      !this.ready ||
      this.conflict ||
      this.frozen ||
      this.posting
    )
      return;
    this.busy = true;
    try {
      if (!this.active) {
        this.active = newDraft(this.accountId);
        this.activePersisted = false;
        this.dirty = true;
      }
      if (!(await this.flush())) return;
      await this.enqueue(async () => {
        if (!this.repository || !this.active || this.disposed) return false;
        for (const file of files) {
          const image = await localImage(file);
          if (
            this.active.attachments.length >= this.limits.maxAttachmentsPerNote
          )
            throw new DraftError(
              'invalid',
              'This draft has reached the configured attachment count limit.',
            );
          if (
            file.size >
            (image ? this.limits.imageInputMaxBytes : this.limits.fileMaxBytes)
          )
            throw new DraftError(
              'invalid',
              'File exceeds the saved upload limit. Choose a smaller file or change the Storage setting.',
            );
          const descriptor: DraftAttachment = {
            id: crypto.randomUUID(),
            source: 'local',
            kind: image ? 'image' : 'file',
            filename: file.name.slice(0, 255),
            mime: file.type.slice(0, 200),
            size: file.size,
          };
          const prior = $state.snapshot(this.active);
          this.active = await this.repository.add(prior, descriptor, file);
          if (image) {
            const alt = descriptor.filename.replace(/[[\]\\\r\n]/g, ' ');
            const insertion = `![${alt}](attachment:${descriptor.id})`;
            this.active = {
              ...this.active,
              bodyMarkdown:
                this.active.bodyMarkdown.slice(0, start) +
                insertion +
                this.active.bodyMarkdown.slice(end),
            };
            // Persist insertion separately: a crash still leaves a recoverable
            // image descriptor/blob even if the insertion fails quota validation.
            this.dirty = true;
            this.epoch++;
            this.active = await this.repository.save(
              $state.snapshot(this.active),
            );
            this.dirty = false;
            start += insertion.length;
            end = start;
          }
          this.refresh();
        }
        this.status = 'Saved on this device.';
        this.error = '';
        return true;
      });
      await this.loadFiles();
    } finally {
      this.busy = false;
    }
  }
  async removeAttachment(id: string) {
    if (
      !this.active ||
      this.busy ||
      this.conflict ||
      this.frozen ||
      this.posting
    )
      return;
    this.active = {
      ...this.active,
      attachments: this.active.attachments.filter((a) => a.id !== id),
      bodyMarkdown: removeImageReferences(this.active.bodyMarkdown, id),
    };
    this.epoch++;
    this.dirty = true;
    if (await this.flush()) await this.loadFiles();
  }
  async repairAttachment(id: string, file: File) {
    if (!this.active || this.busy || this.conflict || !(await this.flush()))
      return;
    this.busy = true;
    try {
      await this.enqueue(async () => {
        const draft = $state.snapshot(this.active!);
        const item = draft.attachments.find(
          (a) => a.id === id && a.source === 'local',
        );
        if (!item || file.size !== item.size || file.name !== item.filename)
          throw new DraftError(
            'invalid',
            'Choose the original file with the same filename and size, or remove the missing attachment.',
          );
        // Restoring bytes requires the same revision guard as adding bytes.
        this.active = await this.repository!.repair(draft, item, file);
        this.status = 'Saved on this device.';
        this.error = '';
        this.refresh();
        return true;
      });
      await this.loadFiles();
    } finally {
      this.busy = false;
    }
  }
  async discard(draft: LocalDraft): Promise<boolean> {
    if (this.busy) return false;
    if (
      this.active?.localDraftId === draft.localDraftId &&
      !(await this.flush())
    )
      return false;
    return this.enqueue(async () => {
      const current =
        this.active?.localDraftId === draft.localDraftId
          ? $state.snapshot(this.active)
          : draft;
      const warning = await this.repository!.discard(current);
      if (warning) this.error = warning;
      if (this.active?.localDraftId === draft.localDraftId) {
        this.active = null;
        this.dirty = false;
        this.revokeUrls();
        this.missing = [];
        this.status = '';
      }
      this.refresh();
      return true;
    });
  }
  async keepSeparate(): Promise<boolean> {
    if (this.busy || this.posting) return false;
    return this.enqueue(async () => {
      if (!this.active || !this.repository) return false;
      this.active = await this.repository.copy($state.snapshot(this.active));
      this.activePersisted = true;
      this.dirty = false;
      this.conflict = false;
      this.error = '';
      this.postError = '';
      this.postConflict = null;
      this.status = 'Saved your version as another local draft.';
      this.refresh();
      await this.loadFiles();
      if (this.missing.length)
        this.status =
          'Saved text as another local draft. Missing files need repair or removal.';
      return true;
    });
  }
  async loadSaved(): Promise<boolean> {
    if (this.busy || this.posting) return false;
    return this.enqueue(async () => {
      const record =
        this.active && this.repository?.read(this.active.localDraftId);
      this.active = record && !record.deleted ? record : null;
      this.activePersisted = Boolean(this.active);
      this.dirty = false;
      this.conflict = false;
      this.error = '';
      this.status =
        record && !record.deleted
          ? 'Loaded saved version.'
          : 'The other tab discarded this draft.';
      this.refresh();
      await this.loadFiles();
      return true;
    });
  }
  async reorderAttachment(id: string, direction: -1 | 1) {
    if (!this.active || this.busy || this.frozen || this.conflict) return;
    const attachments = [...this.active.attachments];
    const index = attachments.findIndex((a) => a.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= attachments.length) return;
    [attachments[index], attachments[target]] = [
      attachments[target],
      attachments[index],
    ];
    this.active = { ...this.active, attachments };
    this.epoch++;
    this.dirty = true;
    await this.flush();
  }
  async post(): Promise<boolean> {
    if (!this.canPost || !this.repository || !this.active) return false;
    this.busy = true;
    this.posting = true;
    this.postError = '';
    this.postRequiresLogin = false;
    this.postConflict = null;
    let savedSuccessfully = false;
    this.postProgress = {
      stage: 'Preparing frozen save…',
      completed: 0,
      total: this.active.attachments.length,
      loaded: 0,
      bytes: 0,
    };
    try {
      if (!(await this.flush())) return false;
      const repository = this.repository;
      const draftId = this.active!.localDraftId;
      await navigator.locks.request(
        `${repository.prefix}post:${draftId}`,
        { ifAvailable: true },
        async (lock) => {
          if (!lock)
            throw new DraftError(
              'conflict',
              'This draft is posting in another tab. Keep your work and check that tab.',
            );
          let draft = $state.snapshot(this.active!);
          if (!draft.postingAttempt) {
            if (!(await this.checkTags(draft))) return;
            const command = commandForDraft(draft, crypto.randomUUID());
            const items = [];
            for (const item of draft.attachments.filter(
              (a) => a.source === 'local',
            )) {
              const blob = await repository.blobs.get(
                this.accountId,
                draftId,
                item.id,
              );
              if (!blob || blob.size !== item.size)
                throw new DraftError(
                  'invalid',
                  'A local file is missing. Repair it or remove it before posting.',
                );
              items.push({
                id: item.id,
                filename: item.filename,
                incomingBytes: blob.size,
                incomingDigest: await sha256(blob),
              });
            }
            const attempt = postingAttemptSchema.parse({
              command,
              manifest: {
                mutationId: command.mutationId,
                requestDigest: await commandDigest(command),
                items,
              },
              phase: 'frozen',
              batchId: null,
              readyIds: [],
              result: null,
            });
            draft = await repository.save({
              ...draft,
              postingAttempt: attempt,
            });
            this.active = draft;
            this.refresh();
          }
          const persist = async (postingAttempt: PostingAttempt) => {
            draft = await repository.save({ ...draft, postingAttempt });
            if (!this.disposed) {
              this.active = draft;
              this.refresh();
            }
          };
          const result = await runPosting(
            draft.postingAttempt!,
            (id) => repository.blobs.get(this.accountId, draftId, id),
            persist,
            (progress) => {
              if (!this.disposed) this.postProgress = progress;
            },
            browserPostingTransport,
            async () => {
              if (!(await this.checkTags(draft)))
                throw new PostingError({
                  code: 'validation',
                  message:
                    'Review tag changes before retrying this frozen save.',
                });
              if (!draft.serverBase) return;
              const response = await fetch(
                `/api/notes/${draft.serverBase.noteId}`,
                { signal: AbortSignal.timeout(30_000) },
              );
              const payload =
                (await response.json()) as ApiResult<NoteSnapshot>;
              if (!payload.ok) throw new PostingError(payload.error);
              const note = payload.data;
              if (
                note.revision !== draft.serverBase.revision ||
                (await sha256(canonicalNoteSnapshot(note))) !==
                  draft.serverBase.snapshotDigest
              )
                throw new PostingError({
                  code: 'conflict',
                  message:
                    'The server base changed (possibly after restore). Compare the server version before replacing it.',
                  conflict: note,
                });
            },
          );
          let snapshot: NoteSnapshot | undefined;
          try {
            const response = await fetch(`/api/notes/${result.noteId}`, {
              signal: AbortSignal.timeout(10_000),
            });
            const payload = (await response.json()) as ApiResult<NoteSnapshot>;
            if (payload.ok) snapshot = payload.data;
          } catch {
            /* Receipt is authoritative even if the follow-up GET is lost. */
          }
          const warning = await repository.complete(draft);
          savedSuccessfully = true;
          if (!this.disposed) {
            this.rememberMutation(result);
            this.saved = {
              serial: (this.saved?.serial ?? 0) + 1,
              result,
              snapshot,
            };
            this.active = null;
            this.activePersisted = false;
            this.dirty = false;
            this.missing = [];
            this.revokeUrls();
            this.error = warning;
            this.status = 'Saved on server.';
            this.refresh();
          }
        },
      );
      return savedSuccessfully;
    } catch (error) {
      if (!this.disposed) {
        if (error instanceof DraftError) this.fail(error);
        this.postError =
          error instanceof PostingError
            ? `${error.message} Your draft and files are kept. Retry this save or edit a separate copy.`
            : error instanceof DraftError
              ? error.message
              : 'Save interrupted or confirmation unavailable. Your draft and files are kept. Retry the same save to check for success safely.';
        this.postRequiresLogin =
          error instanceof PostingError && error.detail.code === 'unauthorized';
        this.postConflict =
          error instanceof PostingError
            ? (error.detail.conflict ?? null)
            : null;
        this.status = '';
      }
      return false;
    } finally {
      if (!this.disposed) {
        this.busy = false;
        this.posting = false;
        this.postProgress = null;
      }
    }
  }
  private async checkTags(draft: LocalDraft): Promise<boolean> {
    const keys = extractTags(draft.bodyMarkdown).map((t) => t.key);
    const response = await fetch('/api/tags/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ keys, acknowledged: draft.tagAcknowledgements }),
      signal: AbortSignal.timeout(15000),
    });
    const result = (await response.json()) as ApiResult<StaleTag[]>;
    if (!result.ok) throw new PostingError(result.error);
    this.staleTagDraftId = draft.localDraftId;
    this.staleTagChoices = result.data;
    if (result.data.length)
      this.postError =
        'Retired tags need an explicit choice. Your draft and files have not been changed.';
    return result.data.length === 0;
  }
  async resolveStaleTags(
    choice: 'history' | 'remove' | 'recreate',
  ): Promise<boolean> {
    if (
      !this.active ||
      this.active.localDraftId !== this.staleTagDraftId ||
      !this.repository ||
      this.busy ||
      this.posting ||
      this.conflict ||
      !this.staleTagChoices.length
    )
      return false;
    if (!(await this.flush())) return false;
    const choices = $state.snapshot(this.staleTagChoices);
    this.busy = true;
    try {
      // Never modify frozen retries. Fork preserves the original and remaps local
      // upload IDs; the new copy still requires explicit Post/Save changes.
      let draft = $state.snapshot(this.active);
      if (draft.postingAttempt) draft = await this.repository.copy(draft);
      const bodyMarkdown =
        choice === 'recreate'
          ? draft.bodyMarkdown
          : rewriteTagKeys(
              draft.bodyMarkdown,
              new SvelteMap(
                choices.map((t) => [
                  t.key,
                  choice === 'remove' ? null : t.target,
                ]),
              ),
            );
      const acknowledgements =
        choice === 'recreate'
          ? [
              ...(draft.tagAcknowledgements ?? []).filter(
                (a) => !choices.some((t) => t.key === a.key),
              ),
              ...choices.map((t) => ({ key: t.key, generation: t.generation })),
            ]
          : (draft.tagAcknowledgements ?? []).filter(
              (a) => !choices.some((t) => t.key === a.key),
            );
      this.active = await this.repository.save({
        ...draft,
        bodyMarkdown,
        tagAcknowledgements: acknowledgements,
      });
      this.activePersisted = true;
      this.dirty = false;
      this.staleTagChoices = [];
      this.postError = '';
      this.status =
        'Tag choice saved locally. Review the source, then explicitly Post or Save changes.';
      this.refresh();
      await this.loadFiles();
      return true;
    } catch (error) {
      this.fail(error);
      return false;
    } finally {
      this.busy = false;
    }
  }
  private revokeUrls() {
    this.urlGeneration++;
    for (const image of this.images)
      if (image.url.startsWith('blob:')) URL.revokeObjectURL(image.url);
    this.images = [];
  }
  setPreviewVisible(visible: boolean) {
    this.previewRequested = visible;
    if (visible) void this.loadFiles();
    else this.revokeUrls();
  }
  async loadFiles() {
    this.revokeUrls();
    this.missing = [];
    const generation = this.urlGeneration;
    const draft = this.active && $state.snapshot(this.active);
    if (!draft || !this.repository) return;
    const images: ImageReference[] = [];
    try {
      const reconciliation = await this.repository.reconcile(
        draft.localDraftId,
      );
      if (generation !== this.urlGeneration || this.disposed) return;
      this.missing = reconciliation.missing;
      if (reconciliation.warning)
        this.warnings = [...this.warnings, reconciliation.warning];
      if (!this.previewRequested) return;
      for (const item of draft.attachments)
        if (item.kind === 'image' && !this.missing.includes(item.id)) {
          if (item.source === 'server')
            images.push({
              id: item.id,
              url: `/api/attachments/${item.id}/display`,
            });
          else {
            const blob = await this.repository.blobs.get(
              this.accountId,
              draft.localDraftId,
              item.id,
            );
            if (generation !== this.urlGeneration || this.disposed) {
              for (const image of images)
                if (image.url.startsWith('blob:'))
                  URL.revokeObjectURL(image.url);
              return;
            }
            if (blob)
              images.push({ id: item.id, url: URL.createObjectURL(blob) });
          }
        }
      this.images = images;
    } catch (error) {
      for (const image of images)
        if (image.url.startsWith('blob:')) URL.revokeObjectURL(image.url);
      if (!this.disposed) this.fail(error);
    }
  }
  async requestPersistence() {
    try {
      if (!navigator.storage?.persist) {
        this.persistence =
          'This browser cannot request persistent storage. Keep another copy of important work.';
        return;
      }
      const granted = await navigator.storage.persist();
      this.persistence = granted
        ? 'Persistent browser storage is enabled; it is not a backup.'
        : 'Persistent storage was not granted. Drafts can still be evicted; keep another copy of important work.';
    } catch {
      this.persistence =
        'Persistent storage could not be requested. Drafts can still be lost; keep another copy.';
    }
  }
  /** Shared invalidation event for confirmed lifecycle receipts. */
  private rememberMutation(
    result: import('#lib/shared/domain.ts').MutationResult,
  ) {
    this.recentMutations = [
      ...this.recentMutations.filter((item) => item.noteId !== result.noteId),
      result,
    ].slice(-100);
  }
  recordMutation(result: import('#lib/shared/domain.ts').MutationResult) {
    this.rememberMutation(result);
    this.saved = { serial: (this.saved?.serial ?? 0) + 1, result };
  }
  /** Resume device-local work even when stale; never silently adopt server text. */
  async editNote(note: NoteSnapshot, reveal = true): Promise<boolean> {
    if (!this.ready || this.busy || this.posting || !this.repository)
      return false;
    try {
      const seed = await recoveryDraft(this.accountId, note);
      this.refresh();
      const candidates = this.drafts.filter(
        (draft) => draft.serverBase?.noteId === note.id,
      );
      // Prefer the active choice, then a matching base, then the most recent
      // recovery. Every other losing/frozen copy remains explicitly listed.
      const existing =
        candidates.find(
          (draft) => draft.localDraftId === this.active?.localDraftId,
        ) ??
        candidates.find((draft) => recoveryMatches(draft, seed.serverBase!)) ??
        candidates[0];
      if (existing) {
        if (!(await this.resume(existing.localDraftId, reveal))) return false;
        if (!recoveryMatches(existing, seed.serverBase!)) {
          this.postConflict = note;
          this.postError =
            'Recovered local edits are based on a different server version. Your text and files are retained.';
        }
        return true;
      }
      return await this.createRecovery(seed, reveal);
    } catch (error) {
      this.fail(error);
      return false;
    }
  }
  /** Fork, never rewrite a frozen identity. Original losing recovery remains in Drafts. */
  async resolveServerConflict(
    choice: 'load' | 'copy' | 'replace',
    observed: NoteSnapshot,
  ): Promise<boolean> {
    if (
      !this.active ||
      !this.repository ||
      this.busy ||
      this.posting ||
      this.conflict
    )
      return false;
    if (!(await this.flush())) return false;
    this.busy = true;
    try {
      const local = $state.snapshot(this.active);
      let seed: LocalDraft | undefined;
      if (choice !== 'copy') {
        let note = observed;
        if (choice === 'load') {
          const response = await fetch(`/api/notes/${observed.id}`, {
            signal: AbortSignal.timeout(15_000),
          });
          const payload = (await response.json()) as ApiResult<NoteSnapshot>;
          if (!payload.ok) throw new Error(payload.error.message);
          note = payload.data;
        }
        seed = await recoveryDraft(this.accountId, note);
      }
      const ok = await this.enqueue(async () => {
        this.active =
          choice === 'load'
            ? await this.repository!.create(seed!)
            : await this.repository!.copy(
                local,
                choice === 'copy'
                  ? { kind: 'new', serverBase: null }
                  : { kind: seed!.kind, serverBase: seed!.serverBase },
              );
        this.activePersisted = true;
        this.dirty = false;
        this.error = '';
        this.postError = '';
        this.postConflict = null;
        this.status =
          choice === 'load'
            ? 'Loaded server version. Losing edits remain in local Drafts.'
            : 'Local copy prepared. Original recovery remains in Drafts.';
        this.refresh();
        await this.loadFiles();
        return true;
      });
      this.busy = false;
      // The confirmed choice is explicit publication, using a fresh mutation ID
      // and (for replacement) precisely the observed revision. A new race conflicts.
      return ok && (choice === 'load' || (await this.post()));
    } catch (error) {
      this.error =
        error instanceof Error
          ? error.message
          : 'Conflict resolution failed. Your recovery is kept.';
      return false;
    } finally {
      this.busy = false;
    }
  }
  /** Typed entry point for S12/S13; callers must fetch/recheck the server base.
   * No server draft reads or writes are introduced in S05. */
  async createRecovery(seed: LocalDraft, reveal = true): Promise<boolean> {
    draftSchema.parse(seed);
    if (seed.kind === 'new')
      throw new DraftError(
        'invalid',
        'A recovery copy requires a server snapshot.',
      );
    if (
      !this.ready ||
      !this.repository ||
      this.busy ||
      this.posting ||
      !(await this.flush())
    )
      return false;
    return this.enqueue(async () => {
      this.active = await this.repository!.create(seed);
      this.activePersisted = true;
      this.dirty = false;
      this.error = '';
      this.postError = '';
      this.postConflict = null;
      this.status =
        'Local recovery edits — not saved on server until explicit Save changes or Post.';
      this.refresh();
      await this.loadFiles();
      if (reveal) this.openEditor++;
      return true;
    });
  }
}
