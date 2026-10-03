import { DraftRepository } from './repository.ts';
import { IndexedDraftBlobs } from './blobs.ts';
import {
  DraftError,
  draftSchema,
  newDraft,
  removeImageReferences,
  type LocalDraft,
  type DraftAttachment,
} from './model.ts';
import type { ImageReference } from '#lib/shared/markdown/render.ts';

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
  constructor(accountId: string) {
    this.accountId = accountId;
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
      if (this.dirty || this.busy || this.conflict) {
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
    if (!this.ready || this.busy) return;
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
    if (!this.ready || this.busy) return;
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
  async resume(id: string): Promise<boolean> {
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
      this.status =
        record.kind === 'new'
          ? 'Recovered on this device.'
          : 'Local recovery edits — server version must be checked before saving.';
      await this.loadFiles();
      this.openEditor++;
      return true;
    });
  }
  async addFiles(files: File[], start: number, end: number): Promise<void> {
    if (this.busy || !this.ready || this.conflict) return;
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
          const image =
            /^(image\/(png|jpeg|webp|gif|avif|bmp|tiff))$/i.test(file.type) ||
            /\.(png|jpe?g|webp|gif|avif|bmp|tiff?)$/i.test(file.name);
          if (file.size > (image ? 20 : 50) * 1024 * 1024)
            throw new DraftError(
              'invalid',
              `File is too large. Local limits: images 20 MB, other files 50 MB.`,
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
    if (!this.active || this.busy || this.conflict) return;
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
        const without = {
          ...draft,
          attachments: draft.attachments.filter((a) => a.id !== id),
        };
        this.active = await this.repository!.add(without, item, file);
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
    return this.enqueue(async () => {
      if (!this.active || !this.repository) return false;
      this.active = await this.repository.copy($state.snapshot(this.active));
      this.activePersisted = true;
      this.dirty = false;
      this.conflict = false;
      this.error = '';
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
  /** Typed entry point for S12/S13; callers must fetch/recheck the server base.
   * No server draft reads or writes are introduced in S05. */
  async createRecovery(seed: LocalDraft): Promise<boolean> {
    draftSchema.parse(seed);
    if (seed.kind === 'new')
      throw new DraftError(
        'invalid',
        'A recovery copy requires a server snapshot.',
      );
    if (!(await this.flush())) return false;
    return this.enqueue(async () => {
      this.active = await this.repository!.create(seed);
      this.activePersisted = true;
      this.refresh();
      await this.loadFiles();
      this.openEditor++;
      return true;
    });
  }
}
