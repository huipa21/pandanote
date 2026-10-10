import { SvelteMap } from 'svelte/reactivity';
import { DEFAULT_SETTINGS } from '#lib/shared/settings.ts';
import { storageLimitsFrom, type StorageLimits } from '#lib/shared/storage.ts';
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
  browserPostingTransport,
} from '../uploads/protocol.ts';
import type {
  ApiResult,
  MutationResult,
  NoteSnapshot,
} from '#lib/shared/domain.ts';
import { canonicalNoteSnapshot } from '#lib/shared/notes.ts';
import { localImage } from '../uploads/file-kind.ts';
import { extractTags } from '#lib/shared/markdown/tags.ts';
import { rewriteTagKeys, type StaleTag } from '#lib/shared/tags.ts';

import {
  newSession,
  sessionFingerprint as getSessionDigest,
  isSessionDirty,
  hasSessionContent,
  commandForSession,
  assertEditableSnapshot,
  remapImageReferences,
  removeImageReferences,
  type EditorSession,
  type EditorAttachment,
} from './model.ts';

/* In-memory editor; never writes note content or files to browser storage. */
export const EDITOR_WORKSPACE = Symbol('editor workspace');

export class EditorWorkspace {
  private cleanSnapshot = $state<string | null>(null);
  active = $state<EditorSession | null>(null);
  images = $state<ImageReference[]>([]);
  missing = $state<string[]>([]);
  error = $state('');
  status = $state('');
  ready = $state(false);
  busy = $state(false);
  dirty = $derived(isSessionDirty(this.active, this.cleanSnapshot));
  conflict = $state(false);
  openEditor = $state(0);
  posting = $state(false);
  postError = $state('');
  postRequiresLogin = $state(false);
  postConflict = $state<NoteSnapshot | null>(null);
  staleTagChoices = $state<StaleTag[]>([]);
  tagsChanged = $state(0);
  knownTags = $state<{ key: string; display: string }[]>([]);
  postProgress = $state<PostingProgress | null>(null);
  saved = $state<{
    serial: number;
    result: MutationResult;
    snapshot?: NoteSnapshot;
  } | null>(null);
  recentMutations = $state<MutationResult[]>([]);

  confirmModalOpen = $state(false);
  private confirmation: Promise<boolean> | null = null;
  private resolveConfirmation: ((proceed: boolean) => void) | null = null;

  get frozen() {
    return Boolean(this.active?.postingAttempt);
  }

  get canPost() {
    return (
      this.ready &&
      !this.busy &&
      !this.posting &&
      !this.conflict &&
      hasSessionContent(this.active) &&
      (!this.missing.length || this.frozen) &&
      (this.dirty || this.frozen)
    );
  }

  readonly accountId: string;
  timezone = $state('UTC');
  limits = $state<StorageLimits>(storageLimitsFrom(DEFAULT_SETTINGS));

  private localBlobs = new SvelteMap<string, Blob>();
  private previewRequested = false;
  private disposed = false;

  constructor(accountId: string, timezone = 'UTC') {
    this.accountId = accountId;
    this.timezone = timezone;
  }

  async start(): Promise<() => void> {
    this.disposed = false;
    this.ready = true;
    this.resetSession();

    const unload = (event: BeforeUnloadEvent) => {
      if (this.dirty || this.busy || this.posting) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', unload);

    return () => {
      this.disposed = true;
      this.revokeUrls();
      this.localBlobs.clear();
      this.cancelConfirm();
      window.removeEventListener('beforeunload', unload);
    };
  }

  resetSession() {
    this.revokeUrls();
    this.localBlobs.clear();
    this.active = newSession();
    this.cleanSnapshot = getSessionDigest(this.active);
    this.missing = [];
    this.error = '';
    this.postError = '';
    this.postConflict = null;
    this.conflict = false;
    this.status = '';
    this.staleTagChoices = [];
  }

  change(bodyMarkdown: string) {
    if (!this.ready || this.busy || this.frozen || this.posting || !this.active)
      return;
    this.active = { ...this.active, bodyMarkdown };
  }

  updateMetadata(values: Pick<EditorSession, 'timelineAt' | 'location'>) {
    if (!this.ready || this.busy || this.frozen || this.posting || !this.active)
      return;
    this.active = { ...this.active, ...values };
  }

  async addFiles(files: File[], start: number, end: number): Promise<void> {
    if (
      this.busy ||
      !this.ready ||
      this.conflict ||
      this.frozen ||
      this.posting ||
      !this.active ||
      !files.length
    )
      return;

    const currentCount = this.active.attachments.length;
    if (currentCount + files.length > this.limits.maxAttachmentsPerNote) {
      this.error = `You can attach at most ${this.limits.maxAttachmentsPerNote} files to one note.`;
      return;
    }

    const session = this.active;
    const additions: EditorAttachment[] = [];
    const blobs: [string, Blob][] = [];
    let imageMarkdown = '';
    this.busy = true;
    try {
      for (const file of files) {
        const isImg = await localImage(file);
        const limit = isImg
          ? this.limits.imageInputMaxBytes
          : this.limits.fileMaxBytes;
        if (file.size > limit) {
          this.error = `${file.name} exceeds the ${Math.round(limit / (1024 * 1024))} MiB size limit.`;
          return;
        }
        const id = crypto.randomUUID();
        blobs.push([id, file]);
        additions.push({
          id,
          source: 'local',
          kind: isImg ? 'image' : 'file',
          filename: file.name,
          mime: file.type || 'application/octet-stream',
          size: file.size,
        });
        if (isImg) {
          const label = file.name.replace(/[\\[\]\r\n]/g, ' ');
          imageMarkdown += `\n![${label}](attachment:${id})\n`;
        }
      }

      const bodyMarkdown = imageMarkdown
        ? session.bodyMarkdown.slice(0, start) +
          imageMarkdown +
          session.bodyMarkdown.slice(end)
        : session.bodyMarkdown;
      if (
        new TextEncoder().encode(bodyMarkdown).byteLength >
        this.limits.markdownMaxBytes
      ) {
        this.error = 'Adding images would exceed the note text limit.';
        return;
      }
      if (this.disposed || this.active?.localId !== session.localId) return;
      for (const [id, blob] of blobs) this.localBlobs.set(id, blob);
      this.active = {
        ...session,
        bodyMarkdown,
        attachments: [...session.attachments, ...additions],
      };
      await this.loadFiles();
    } catch {
      this.error = 'Files could not be added. Keep the originals and retry.';
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
    this.localBlobs.delete(id);
    const attachments = this.active.attachments.filter((a) => a.id !== id);
    const bodyMarkdown = removeImageReferences(this.active.bodyMarkdown, id);
    this.active = { ...this.active, attachments, bodyMarkdown };
    await this.loadFiles();
  }

  async repairAttachment(id: string, file: File) {
    if (this.busy || this.posting) return;
    const item = this.active?.attachments.find(
      (a) => a.id === id && a.source === 'local',
    );
    if (!item) return;
    if (file.size !== item.size) {
      this.error = `File size does not match ${item.filename}.`;
      return;
    }
    this.localBlobs.set(id, file);
    await this.loadFiles();
  }

  async discard(): Promise<boolean> {
    if (this.busy || this.posting) return false;
    this.resetSession();
    return true;
  }

  /** New attempts must remap local IDs already bound to an earlier upload batch. */
  private forkAttempt(kind: 'new' | 'edit' = this.active!.kind): void {
    const session = this.active!;
    const ids = new SvelteMap<string, string>();
    const attachments = session.attachments.map((item) => {
      if (item.source === 'server') return item;
      const id = crypto.randomUUID();
      ids.set(item.id, id);
      const blob = this.localBlobs.get(item.id);
      if (blob) this.localBlobs.set(id, blob);
      return { ...item, id };
    });
    const bodyMarkdown = remapImageReferences(session.bodyMarkdown, ids);
    for (const id of ids.keys()) this.localBlobs.delete(id);
    this.active = {
      ...session,
      localId: crypto.randomUUID(),
      kind,
      serverBase: kind === 'new' ? null : session.serverBase,
      attachments,
      bodyMarkdown,
      postingAttempt: undefined,
    };
  }

  async keepSeparate(): Promise<boolean> {
    if (!this.active || this.busy || this.posting) return false;
    this.forkAttempt();
    this.postError = '';
    this.postConflict = null;
    await this.loadFiles();
    return true;
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
  }

  async post(): Promise<boolean> {
    if (!this.canPost || !this.active) return false;
    this.busy = true;
    this.posting = true;
    this.postError = '';
    this.postRequiresLogin = false;
    this.postConflict = null;

    this.postProgress = {
      stage: 'Preparing save…',
      completed: 0,
      total: this.active.attachments.length,
      loaded: 0,
      bytes: 0,
    };

    try {
      const active = this.active;
      if (!active.postingAttempt) {
        if (!(await this.checkTags(active))) return false;
        const mutationId = crypto.randomUUID();
        const command = commandForSession(active, mutationId);

        const items = [];
        for (const item of active.attachments.filter(
          (a) => a.source === 'local',
        )) {
          const blob = this.localBlobs.get(item.id);
          if (!blob || blob.size !== item.size) {
            throw new Error(`File ${item.filename} is missing.`);
          }
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
            mutationId,
            requestDigest: await commandDigest(command),
            items,
          },
          phase: 'frozen',
          batchId: null,
          readyIds: [],
          result: null,
        });
        active.postingAttempt = attempt;
      }

      const persist = async (attempt: PostingAttempt) => {
        if (this.active) this.active.postingAttempt = attempt;
      };

      const result = await runPosting(
        active.postingAttempt!,
        async (id) => this.localBlobs.get(id),
        persist,
        (progress) => {
          if (!this.disposed) this.postProgress = progress;
        },
        browserPostingTransport,
        async () => {
          if (!(await this.checkTags(active)))
            throw new PostingError({
              code: 'validation',
              message: 'Review retired tags before retrying.',
            });
          if (!active.serverBase) return;
          const response = await fetch(
            `/api/notes/${active.serverBase.noteId}`,
            {
              signal: AbortSignal.timeout(30_000),
            },
          );
          const payload = (await response.json()) as ApiResult<NoteSnapshot>;
          if (!payload.ok) throw new PostingError(payload.error);
          const note = payload.data;
          if (
            note.revision !== active.serverBase.revision ||
            (await sha256(canonicalNoteSnapshot(note))) !==
              active.serverBase.snapshotDigest
          ) {
            throw new PostingError({
              code: 'conflict',
              message:
                'The server base changed. Compare the server version before replacing it.',
              conflict: note,
            });
          }
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
        /* Receipt is authoritative */
      }

      if (!this.disposed) {
        this.rememberMutation(result);
        this.saved = {
          serial: (this.saved?.serial ?? 0) + 1,
          result,
          snapshot,
        };
        this.resetSession();
        this.status = 'Saved on server.';
      }
      return true;
    } catch (error) {
      if (!this.disposed) {
        this.postError =
          error instanceof PostingError
            ? error.message
            : error instanceof Error
              ? error.message
              : 'Save failed.';
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

  private async checkTags(session: EditorSession): Promise<boolean> {
    const keys = extractTags(session.bodyMarkdown).map((t) => t.key);
    const response = await fetch('/api/tags/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ keys, acknowledged: session.tagAcknowledgements }),
      signal: AbortSignal.timeout(15000),
    });
    const result = (await response.json()) as ApiResult<StaleTag[]>;
    if (!result.ok) throw new PostingError(result.error);
    this.staleTagChoices = result.data;
    if (result.data.length)
      this.postError = 'Retired tags need an explicit choice.';
    return result.data.length === 0;
  }

  async resolveStaleTags(
    choice: 'history' | 'remove' | 'recreate',
  ): Promise<boolean> {
    if (
      !this.active ||
      this.busy ||
      this.posting ||
      !this.staleTagChoices.length
    )
      return false;
    const choices = this.staleTagChoices;
    if (this.frozen) this.forkAttempt();
    const session = this.active;
    const bodyMarkdown =
      choice === 'recreate'
        ? session.bodyMarkdown
        : rewriteTagKeys(
            session.bodyMarkdown,
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
            ...(session.tagAcknowledgements ?? []).filter(
              (a) => !choices.some((t) => t.key === a.key),
            ),
            ...choices.map((t) => ({ key: t.key, generation: t.generation })),
          ]
        : (session.tagAcknowledgements ?? []).filter(
            (a) => !choices.some((t) => t.key === a.key),
          );

    this.active = {
      ...session,
      bodyMarkdown,
      tagAcknowledgements: acknowledgements,
      postingAttempt: undefined,
    };
    this.staleTagChoices = [];
    this.postError = '';
    return true;
  }

  private revokeUrls() {
    for (const image of this.images) {
      if (image.url.startsWith('blob:')) URL.revokeObjectURL(image.url);
    }
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
    if (!this.active) return;
    const images: ImageReference[] = [];
    for (const item of this.active.attachments) {
      if (item.source === 'local' && !this.localBlobs.has(item.id))
        this.missing.push(item.id);
      if (item.kind === 'image' && this.previewRequested) {
        if (item.source === 'server') {
          images.push({
            id: item.id,
            url: `/api/attachments/${item.id}/display`,
          });
        } else {
          const blob = this.localBlobs.get(item.id);
          if (blob) {
            images.push({ id: item.id, url: URL.createObjectURL(blob) });
          }
        }
      }
    }
    this.images = images;
  }

  private rememberMutation(result: MutationResult) {
    this.recentMutations = [
      ...this.recentMutations.filter((item) => item.noteId !== result.noteId),
      result,
    ].slice(-100);
  }

  recordMutation(result: MutationResult) {
    this.rememberMutation(result);
    this.saved = { serial: (this.saved?.serial ?? 0) + 1, result };
  }

  /** Open note for editing in memory */
  async editNote(note: NoteSnapshot, reveal = true): Promise<boolean> {
    if (!this.ready || this.busy || this.posting) return false;
    try {
      assertEditableSnapshot(note);
    } catch (error) {
      this.error =
        error instanceof Error ? error.message : 'Could not open the editor.';
      return false;
    }
    if (!(await this.promptUnsavedChanges())) return false;
    const snapshotDigest = await sha256(canonicalNoteSnapshot(note));
    if (this.disposed || this.busy || this.posting) return false;
    this.resetSession();
    this.active = {
      localId: crypto.randomUUID(),
      kind: 'edit',
      serverBase: {
        noteId: note.id,
        revision: note.revision,
        snapshotDigest,
      },
      bodyMarkdown: note.bodyMarkdown,
      timelineAt: note.timelineAt,
      location: note.location,
      attachments: (note.attachments ?? []).map((file) => ({
        id: file.id,
        source: 'server',
        kind: file.kind,
        filename: file.filename,
        mime: file.mime,
        size: file.storedBytes,
      })),
    };
    this.cleanSnapshot = getSessionDigest(this.active);
    await this.loadFiles();
    if (reveal) this.openEditor++;
    return true;
  }

  async resolveServerConflict(
    choice: 'load' | 'copy' | 'replace',
    observed: NoteSnapshot,
  ): Promise<boolean> {
    if (!this.active || this.busy || this.posting) return false;
    try {
      if (choice === 'load') {
        // The conflict dialog already confirms discarding the losing editor.
        const response = await fetch(`/api/notes/${observed.id}`, {
          signal: AbortSignal.timeout(15_000),
        });
        const result = (await response.json()) as ApiResult<NoteSnapshot>;
        if (!result.ok) {
          this.postError = result.error.message;
          return false;
        }
        try {
          assertEditableSnapshot(result.data);
        } catch {
          return false;
        }
        this.resetSession();
        return this.editNote(result.data, false);
      }
      if (choice === 'replace' && observed.status === 'trash') return false;
      this.forkAttempt(choice === 'copy' ? 'new' : 'edit');
      if (choice === 'replace')
        this.active = {
          ...this.active!,
          serverBase: {
            noteId: observed.id,
            revision: observed.revision,
            snapshotDigest: await sha256(canonicalNoteSnapshot(observed)),
          },
        };
      this.postConflict = null;
      await this.loadFiles();
      return this.post();
    } catch {
      this.postError =
        'Conflict resolution could not finish. Your editor and files are retained; retry.';
      return false;
    }
  }

  /** Intercepts actions to ask user if dirty */
  promptUnsavedChanges(): Promise<boolean> {
    if (!this.dirty && !this.busy && !this.posting && !this.frozen)
      return Promise.resolve(true);
    if (this.confirmation) return this.confirmation;
    this.confirmModalOpen = true;
    this.confirmation = new Promise((resolve) => {
      this.resolveConfirmation = resolve;
    });
    return this.confirmation;
  }
  private finishConfirmation(proceed: boolean) {
    this.confirmModalOpen = false;
    const resolve = this.resolveConfirmation;
    this.resolveConfirmation = null;
    this.confirmation = null;
    resolve?.(proceed);
  }
  confirmDiscard() {
    if (this.busy || this.posting) return;
    this.resetSession();
    this.finishConfirmation(true);
  }
  async confirmSaveAndProceed() {
    if (await this.post()) this.finishConfirmation(true);
  }
  cancelConfirm() {
    if (this.posting) return;
    this.finishConfirmation(false);
  }
}
