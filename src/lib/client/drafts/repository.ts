import { idSchema } from '#lib/shared/domain.ts';
import {
  decodeRecord,
  draftSchema,
  DraftError,
  newDraft,
  type LocalDraft,
  type DraftRecord,
  type DraftAttachment,
} from './model.ts';
import type { BinaryRepository } from './blobs.ts';

export const draftPrefix = (accountId: string) =>
  `pandanote:drafts:v1:${accountId}:`;
export type ExclusiveLock = <T>(
  name: string,
  action: () => Promise<T>,
) => Promise<T>;
export interface DraftListing {
  drafts: LocalDraft[];
  warnings: string[];
}
/** All cooperating tabs use a Web Lock around read/compare/write and blob
 * reconciliation. localStorage alone is not a compare-and-swap mechanism. */
export class DraftRepository {
  readonly prefix: string;
  readonly accountId: string;
  readonly blobs: BinaryRepository;
  private readonly storage: Storage;
  private readonly lock: ExclusiveLock;
  private readonly notify: () => void;
  constructor(
    accountId: string,
    storage: Storage,
    blobs: BinaryRepository,
    lock: ExclusiveLock,
    notify: () => void = () => {},
  ) {
    idSchema.parse(accountId);
    this.prefix = draftPrefix(accountId);
    this.accountId = accountId;
    this.storage = storage;
    this.blobs = blobs;
    this.lock = lock;
    this.notify = notify;
  }
  private exclusive<T>(action: () => Promise<T>): Promise<T> {
    return this.lock(this.prefix, action);
  }
  private key(id: string) {
    return `${this.prefix}record:${idSchema.parse(id)}`;
  }
  read(id: string): DraftRecord | null {
    try {
      const raw = this.storage.getItem(this.key(id));
      return raw === null ? null : decodeRecord(raw, this.accountId, id);
    } catch (error) {
      if (error instanceof DraftError) throw error;
      throw new DraftError(
        'storage',
        'Browser text storage is unavailable. Keep a copy of your text and retry.',
      );
    }
  }
  private assertCurrent(draft: LocalDraft): LocalDraft {
    draftSchema.parse(draft);
    if (draft.accountId !== this.accountId)
      throw new DraftError('invalid', 'Draft account does not match.');
    const record = this.read(draft.localDraftId);
    if (!record || record.deleted || record.revision !== draft.revision)
      throw new DraftError(
        'conflict',
        'This draft changed or was discarded in another tab. Your edits are still here.',
      );
    return record;
  }
  private store(record: DraftRecord): void {
    try {
      this.storage.setItem(
        this.key(record.localDraftId),
        JSON.stringify(record),
      );
    } catch {
      throw new DraftError(
        'storage',
        'Browser text storage failed or is full. Changes are not saved; keep a copy and retry.',
      );
    }
    this.notify();
  }
  list(): DraftListing {
    const drafts: LocalDraft[] = [];
    const warnings: string[] = [];
    try {
      // Records, not the index, are authoritative. Unknown/corrupt records remain
      // untouched. A crash between record and index writes cannot hide work.
      for (let i = 0; i < this.storage.length; i++) {
        const key = this.storage.key(i);
        if (!key?.startsWith(`${this.prefix}record:`)) continue;
        try {
          const record = this.read(key.slice(`${this.prefix}record:`.length));
          if (record && !record.deleted) drafts.push(record);
        } catch (error) {
          warnings.push(
            error instanceof DraftError
              ? error.message
              : 'An invalid draft record was kept.',
          );
        }
      }
      drafts.sort(
        (a, b) =>
          b.modifiedLocallyAt - a.modifiedLocallyAt ||
          a.localDraftId.localeCompare(b.localDraftId),
      );
      const index = JSON.stringify({
        schemaVersion: 1,
        ids: drafts.map((d) => d.localDraftId),
      });
      // Index is a best-effort listing cache; failing it must not undo a record.
      if (this.storage.getItem(`${this.prefix}index`) !== index)
        this.storage.setItem(`${this.prefix}index`, index);
    } catch {
      warnings.push(
        'The draft list cache could not be saved. Browser storage may be unavailable or full.',
      );
    }
    return { drafts, warnings: [...new Set(warnings)] };
  }
  async create(
    seed: LocalDraft = newDraft(this.accountId),
  ): Promise<LocalDraft> {
    const draft = draftSchema.parse(seed);
    if (draft.accountId !== this.accountId)
      throw new DraftError('invalid', 'Draft account does not match.');
    return this.exclusive(async () => {
      if (this.read(draft.localDraftId))
        throw new DraftError('conflict', 'Draft identifier is already in use.');
      this.store(draft);
      return draft;
    });
  }
  async save(draft: LocalDraft): Promise<LocalDraft> {
    draftSchema.parse(draft);
    return this.exclusive(async () => {
      this.assertCurrent(draft);
      const saved = draftSchema.parse({
        ...draft,
        revision: draft.revision + 1,
        modifiedLocallyAt: Date.now(),
      });
      this.store(saved);
      return saved;
    });
  }
  async add(
    draft: LocalDraft,
    descriptor: DraftAttachment,
    blob: Blob,
  ): Promise<LocalDraft> {
    const candidate = draftSchema.parse({
      ...draft,
      attachments: [...draft.attachments, descriptor],
    });
    if (descriptor.source !== 'local' || descriptor.size !== blob.size)
      throw new DraftError('invalid', 'File metadata does not match.');
    return this.exclusive(async () => {
      this.assertCurrent(draft);
      // Persist bytes first. If text storage fails, this is a recoverable orphan,
      // never a successful descriptor pointing at missing bytes.
      await this.blobs.put(
        this.accountId,
        draft.localDraftId,
        descriptor.id,
        blob,
      );
      const saved = draftSchema.parse({
        ...candidate,
        revision: draft.revision + 1,
        modifiedLocallyAt: Date.now(),
      });
      this.store(saved);
      return saved;
    });
  }
  async reconcile(id: string): Promise<{ missing: string[]; warning: string }> {
    return this.exclusive(async () => {
      const record = this.read(id);
      // Missing record + readable storage means an orphan. Unknown/corrupt or
      // unavailable text storage throws above and preserves its bytes instead.
      const referenced =
        !record || record.deleted
          ? []
          : record.attachments.filter((a) => a.source === 'local');
      const keys = await this.blobs.list(this.accountId, id);
      const missing: string[] = [];
      for (const item of referenced) {
        const blob = await this.blobs.get(this.accountId, id, item.id);
        if (!blob || blob.size !== item.size) missing.push(item.id);
      }
      let warning = '';
      for (const key of keys)
        if (!referenced.some((a) => a.id === key)) {
          try {
            await this.blobs.remove(this.accountId, id, key);
          } catch {
            warning =
              'Unused local files could not be cleaned up. Retry when browser storage is available.';
          }
        }
      return { missing, warning };
    });
  }
  async discard(draft: LocalDraft): Promise<string> {
    return this.exclusive(async () => {
      this.assertCurrent(draft);
      // A tombstone prevents a stale tab resurrecting a discarded draft.
      this.store({
        schemaVersion: 1,
        accountId: this.accountId,
        localDraftId: draft.localDraftId,
        revision: draft.revision + 1,
        createdLocallyAt: draft.createdLocallyAt,
        modifiedLocallyAt: Date.now(),
        deleted: true,
      });
      try {
        for (const id of await this.blobs.list(
          this.accountId,
          draft.localDraftId,
        ))
          await this.blobs.remove(this.accountId, draft.localDraftId, id);
        return '';
      } catch {
        return 'Draft text was discarded, but local files could not be cleaned up. Cleanup will retry when you reopen the app.';
      }
    });
  }
  async copy(draft: LocalDraft): Promise<LocalDraft> {
    draftSchema.parse(draft);
    if (draft.accountId !== this.accountId)
      throw new DraftError('invalid', 'Draft account does not match.');
    return this.exclusive(async () => {
      const copy = draftSchema.parse({
        ...draft,
        localDraftId: crypto.randomUUID(),
        revision: 1,
        createdLocallyAt: Date.now(),
        modifiedLocallyAt: Date.now(),
      });
      for (const item of copy.attachments)
        if (item.source === 'local') {
          const blob = await this.blobs.get(
            this.accountId,
            draft.localDraftId,
            item.id,
          );
          // Preserve the losing text and descriptors even if browser eviction
          // or an explicit removal in another tab lost a blob. Reopening the
          // copy reports missing bytes and requires repair/removal, never posting
          // a broken reference. A missing file must not trap recoverable text.
          if (!blob || blob.size !== item.size) continue;
          await this.blobs.put(
            this.accountId,
            copy.localDraftId,
            item.id,
            blob,
          );
        }
      this.store(copy);
      return copy;
    });
  }
  async cleanupOrphans(): Promise<string[]> {
    const ids = await this.blobs.listDraftIds(this.accountId);
    const warnings: string[] = [];
    for (const id of ids) {
      try {
        const result = await this.reconcile(id);
        if (result.warning) warnings.push(result.warning);
      } catch (error) {
        // Never delete the bytes associated with an unsupported/corrupt record.
        warnings.push(
          error instanceof DraftError
            ? error.message
            : 'Local file cleanup failed. Keep the original files and retry.',
        );
      }
    }
    return [...new Set(warnings)];
  }
}
