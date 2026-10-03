import { DraftError } from './model.ts';

const DATABASE = 'pandanote-draft-blobs';
const STORE = 'blobs';
interface BlobRow {
  accountId: string;
  draftId: string;
  attachmentId: string;
  blob: Blob;
}
export interface BinaryRepository {
  put(
    accountId: string,
    draftId: string,
    id: string,
    blob: Blob,
  ): Promise<void>;
  get(
    accountId: string,
    draftId: string,
    id: string,
  ): Promise<Blob | undefined>;
  list(accountId: string, draftId: string): Promise<string[]>;
  listDraftIds(accountId: string): Promise<string[]>;
  remove(accountId: string, draftId: string, id: string): Promise<void>;
  close(): void;
}

export class IndexedDraftBlobs implements BinaryRepository {
  private opened: Promise<IDBDatabase> | undefined;
  private readonly factory: IDBFactory;
  constructor(factory: IDBFactory) {
    this.factory = factory;
  }
  private open(): Promise<IDBDatabase> {
    return (this.opened ??= new Promise((resolve, reject) => {
      const request = this.factory.open(DATABASE, 1);
      let abandoned = false;
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE, {
          keyPath: ['accountId', 'draftId', 'attachmentId'],
        });
      };
      request.onerror = () => {
        this.opened = undefined;
        reject(
          new DraftError(
            'storage',
            'Browser file storage could not open. Keep the original files and retry.',
          ),
        );
      };
      request.onblocked = () => {
        abandoned = true;
        this.opened = undefined;
        reject(
          new DraftError(
            'storage',
            'Browser file storage is blocked by another tab. Close older tabs and retry.',
          ),
        );
      };
      request.onsuccess = () => {
        const db = request.result;
        if (abandoned) {
          db.close();
          return;
        }
        db.onversionchange = () => {
          db.close();
          this.opened = undefined;
        };
        resolve(db);
      };
    }));
  }
  private async transaction<T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      // oncomplete, not request success, is the durability boundary.
      const tx = db.transaction(STORE, mode);
      const request = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = tx.onerror = () =>
        reject(
          new DraftError(
            'storage',
            'Browser file storage failed or is full. The file was not added; keep its original and retry.',
          ),
        );
    });
  }
  async put(
    accountId: string,
    draftId: string,
    attachmentId: string,
    blob: Blob,
  ): Promise<void> {
    await this.transaction('readwrite', (store) =>
      store.put({ accountId, draftId, attachmentId, blob } satisfies BlobRow),
    );
  }
  async get(
    accountId: string,
    draftId: string,
    id: string,
  ): Promise<Blob | undefined> {
    const row = await this.transaction<BlobRow | undefined>(
      'readonly',
      (store) => store.get([accountId, draftId, id]),
    );
    return row?.blob;
  }
  async list(accountId: string, draftId: string): Promise<string[]> {
    const keys = await this.transaction<IDBValidKey[]>('readonly', (store) =>
      store.getAllKeys(
        IDBKeyRange.bound(
          [accountId, draftId, ''],
          [accountId, draftId, '\uffff'],
        ),
      ),
    );
    return keys.map((key) => (key as string[])[2]);
  }
  async listDraftIds(accountId: string): Promise<string[]> {
    const keys = await this.transaction<IDBValidKey[]>('readonly', (store) =>
      store.getAllKeys(
        IDBKeyRange.bound([accountId, ''], [accountId, '\uffff']),
      ),
    );
    return [...new Set(keys.map((key) => (key as string[])[1]))];
  }
  async remove(accountId: string, draftId: string, id: string): Promise<void> {
    await this.transaction('readwrite', (store) =>
      store.delete([accountId, draftId, id]),
    );
  }
  close(): void {
    void this.opened?.then(
      (db) => db.close(),
      () => {},
    );
    this.opened = undefined;
  }
}
