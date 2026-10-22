import { tr, trError } from '#lib/client/i18n-current.ts';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { DEFAULT_SETTINGS } from '#lib/shared/settings.ts';
import { storageLimitsFrom, type StorageLimits } from '#lib/shared/storage.ts';
import type { ImageReference } from '#lib/shared/markdown/render.ts';
import {
  commandDigest,
  sha256,
  postingAttemptSchema,
  uploadItemFor,
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
import {
  isVideoMeta,
  localImage,
  MAX_NOTE_PHOTOS,
  MAX_VOICE_SECONDS,
} from '../uploads/file-kind.ts';
import {
  browserRecorderEnv,
  formatClock,
  recordingSupport,
  RecorderError,
  VoiceRecorder,
  voiceFilename,
  SOUND_LEVEL,
  type RecordedClip,
  type RecorderEnd,
  type RecorderEnv,
  type RecorderErrorCode,
  type RecorderState,
} from '../recording/recorder.ts';
import {
  clipRejection,
  renamedClipFilename,
  isVideoAttachment,
  RECORDER_ERROR_KEYS,
} from '../recording/clips.ts';
import {
  renameSavedClip,
  savedClipNames,
} from '../recording/saved-names.svelte.ts';
import { extractTags } from '#lib/shared/markdown/tags.ts';
import { rewriteTagKeys, type StaleTag } from '#lib/shared/tags.ts';

import {
  newSession,
  sessionFingerprint as getSessionDigest,
  isSessionDirty,
  hasSessionContent,
  commandForSession,
  assertEditableSnapshot,
  editorKind,
  remapImageReferences,
  removeImageReferences,
  type EditorSession,
  type EditorAttachment,
} from './model.ts';

/** Without sound for this long while recording, the strip warns that the microphone
 * may be muted. */
const QUIET_AFTER_MS = 3000;

/* In-memory editor; never writes note content or files to browser storage. */
export const EDITOR_WORKSPACE = Symbol('editor workspace');

export class EditorWorkspace {
  private cleanSnapshot = $state<string | null>(null);
  active = $state<EditorSession | null>(null);
  /** Note whose card/page hosts the session. It survives "save as separate note"
   * (the session becomes new) so that view keeps showing the editor and errors. */
  editOrigin = $state<string | null>(null);
  images = $state<ImageReference[]>([]);
  thumbs = $state<Record<string, string>>({});
  /** Playable URL per voice clip: an object URL (local) or the file route (server). */
  clipUrls = $state<Record<string, string>>({});
  private blobUrls = new SvelteMap<string, { blob: Blob; url: string }>();
  missing = $state<string[]>([]);
  error = $state('');
  status = $state<'' | 'saved'>('');
  ready = $state(false);
  /** True once the user saved a timeline date in this composer session. */
  timelineSet = $state(false);
  busy = $state(false);
  /** Voice take in progress. It lives here, not in a component, so focus mode and the
   * compact editor share it and opening/closing either never stops a recording. */
  recorder = $state<{
    state: 'idle' | 'starting' | 'recording' | 'paused';
    elapsedMs: number;
    level: number;
    /** A meter is running and heard nothing for a while: the microphone may be muted. */
    quiet: boolean;
  }>({ state: 'idle', elapsedMs: 0, level: 0, quiet: false });
  /** The clip whose name the user is choosing (just recorded, or being renamed). */
  renamingId = $state<string | null>(null);
  /** Non-error recorder information (e.g. the 10:00 limit was reached). */
  notice = $state('');
  /** An active take is unsaved work, like clips and text. */
  dirty = $derived(
    isSessionDirty(this.active, this.cleanSnapshot) ||
      this.recorder.state !== 'idle',
  );
  conflict = $state(false);
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

  get recording() {
    return this.recorder.state !== 'idle';
  }

  /** Why Post/Save changes is disabled for a reason the user can fix, or ''. */
  get postBlockedReason(): string {
    return this.recording ? tr('rec.stopFirst') : '';
  }

  /** Why recording cannot start here (insecure context, no MediaRecorder), or null. */
  get recordingUnsupported(): RecorderErrorCode | null {
    return recordingSupport(this.recorderEnv());
  }

  get canPost() {
    return (
      this.ready &&
      !this.recording &&
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
  private voice: VoiceRecorder | null = null;
  /** Elapsed ms of the take at the last audible reading. */
  private lastSoundMs = 0;
  private lastAddedClipId: string | null = null;
  /** Browser bindings; replaceable so the recorder can be driven without a browser. */
  recorderEnv: () => RecorderEnv = browserRecorderEnv;
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
    // Release the microphone on page unload (and bfcache entry) as well.
    const release = () => this.cancelRecording();
    window.addEventListener('beforeunload', unload);
    window.addEventListener('pagehide', release);

    return () => {
      this.disposed = true;
      this.cancelRecording();
      this.revokeUrls();
      this.localBlobs.clear();
      this.cancelConfirm();
      window.removeEventListener('beforeunload', unload);
      window.removeEventListener('pagehide', release);
    };
  }

  resetSession() {
    this.cancelRecording();
    this.revokeUrls();
    this.localBlobs.clear();
    this.active = newSession();
    this.timelineSet = false;
    this.editOrigin = null;
    this.cleanSnapshot = getSessionDigest(this.active);
    this.missing = [];
    this.error = '';
    this.postError = '';
    this.postConflict = null;
    this.conflict = false;
    this.status = '';
    this.notice = '';
    this.staleTagChoices = [];
  }

  change(bodyMarkdown: string) {
    if (!this.ready || this.busy || this.frozen || this.posting || !this.active)
      return;
    this.active = { ...this.active, bodyMarkdown };
  }

  updateMetadata(values: Pick<EditorSession, 'timelineAt'>) {
    if (!this.ready || this.busy || this.frozen || this.posting || !this.active)
      return;
    this.active = { ...this.active, ...values };
    this.timelineSet = true;
  }

  togglePrivacy() {
    if (
      !this.ready ||
      this.busy ||
      this.frozen ||
      this.posting ||
      this.conflict ||
      !this.active
    )
      return;
    this.active = { ...this.active, isPrivate: !this.active.isPrivate };
  }

  async addFiles(files: File[]): Promise<void> {
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

    // A take in progress will become a clip: reserve its slot.
    const reserved = this.recording ? 1 : 0;
    const currentCount = this.active.attachments.length + reserved;
    if (currentCount + files.length > this.limits.maxAttachmentsPerNote) {
      this.error = tr('work.maxFiles', {
        count: this.limits.maxAttachmentsPerNote,
      });
      return;
    }

    const session = this.active;
    this.error = '';
    const additions: EditorAttachment[] = [];
    const blobs: [string, Blob][] = [];
    this.busy = true;
    try {
      const kinds = await Promise.all(files.map((file) => localImage(file)));
      const videos = files.filter(
        (file, i) => !kinds[i] && isVideoMeta(file),
      ).length;
      const photos = kinds.filter(Boolean).length;
      // Anything else (documents, archives, plain audio files, etc.) becomes a
      // plain downloadable attachment and does not count toward photo/video limits.
      const existingPhotos = session.attachments.filter(
        (a) => a.kind === 'image',
      ).length;
      const existingVideos =
        session.attachments.filter(isVideoAttachment).length;
      if (videos > 1) {
        this.error = tr('work.oneVideo');
        return;
      }
      if (videos && (session.attachments.length || reserved)) {
        this.error = tr('work.videoMix');
        return;
      }
      if (photos && existingVideos) {
        this.error = tr('work.videoPhotos');
        return;
      }
      if (existingPhotos + photos > MAX_NOTE_PHOTOS) {
        this.error = tr('work.maxPhotos', { count: MAX_NOTE_PHOTOS });
        return;
      }
      for (const [index, file] of files.entries()) {
        const isImg = kinds[index]!;
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
      }

      if (this.disposed || this.active?.localId !== session.localId) return;
      for (const [id, blob] of blobs) this.localBlobs.set(id, blob);
      this.active = {
        ...session,
        attachments: [...session.attachments, ...additions],
      };
      await this.loadFiles();
    } catch {
      this.error = tr('work.addFailed');
    } finally {
      this.busy = false;
    }
  }

  // --- voice recording -------------------------------------------------

  private recorderText(code: RecorderErrorCode): string {
    return tr(RECORDER_ERROR_KEYS[code]);
  }

  /** Request the microphone and start a take. Nothing starts automatically. */
  async startRecording(): Promise<boolean> {
    const session = this.active;
    if (
      !session ||
      !this.ready ||
      this.busy ||
      this.conflict ||
      this.frozen ||
      this.posting ||
      this.recording
    )
      return false;
    this.error = '';
    this.notice = '';
    const rejection = clipRejection(
      session.attachments,
      this.limits.maxAttachmentsPerNote,
    );
    if (rejection) {
      this.error = tr(rejection.key, rejection.params);
      return false;
    }
    const voice: VoiceRecorder = new VoiceRecorder(
      this.recorderEnv(),
      { maxBytes: this.limits.fileMaxBytes },
      {
        onState: (state: RecorderState) => {
          if (this.voice !== voice) return;
          this.recorder =
            state === 'stopped' || state === 'idle'
              ? { state: 'idle', elapsedMs: 0, level: 0, quiet: false }
              : { ...this.recorder, state };
        },
        onProgress: ({ elapsedMs, level }) => {
          if (this.voice !== voice || !this.recording) return;
          if (level >= SOUND_LEVEL || elapsedMs < this.lastSoundMs)
            this.lastSoundMs = elapsedMs;
          // Only a running meter can tell silence from "cannot measure".
          const quiet =
            voice.hasMeter &&
            this.recorder.state === 'recording' &&
            elapsedMs - this.lastSoundMs >= QUIET_AFTER_MS;
          this.recorder = { ...this.recorder, elapsedMs, level, quiet };
        },
        onEnd: (end) => void this.finishUnrequested(end),
      },
    );
    this.voice = voice;
    this.lastSoundMs = 0;
    try {
      await voice.start();
      return true;
    } catch (error) {
      if (this.voice === voice) this.voice = null;
      if (!(error instanceof RecorderError && error.code === 'ended'))
        this.error = this.recorderText(
          error instanceof RecorderError ? error.code : 'failed',
        );
      return false;
    }
  }

  pauseRecording() {
    this.voice?.pause();
  }
  resumeRecording() {
    this.voice?.resume();
  }

  /** Stop and add the clip to the session. */
  async stopRecording(): Promise<boolean> {
    const voice = this.voice;
    if (!voice?.active) return false;
    try {
      const added = await this.addClip(await voice.stop());
      // Offer the generated name for editing; Enter/Save keeps or changes it.
      if (added && this.lastAddedClipId) this.renamingId = this.lastAddedClipId;
      return added;
    } catch (error) {
      // `ended`: it already finished itself (limit/failure) or was cancelled.
      if (!(error instanceof RecorderError && error.code === 'ended'))
        this.error = this.recorderText(
          error instanceof RecorderError ? error.code : 'failed',
        );
      return false;
    }
  }

  /** Discard the current take; asks nothing and releases the microphone. */
  cancelRecording() {
    const voice = this.voice;
    this.voice = null;
    voice?.cancel();
    if (this.recorder.state !== 'idle')
      this.recorder = { state: 'idle', elapsedMs: 0, level: 0, quiet: false };
  }

  /** The 10:00 / size limit or a mid-take failure ended the take: keep what exists. */
  private async finishUnrequested(end: RecorderEnd) {
    if (!end.clip) {
      if (end.reason === 'error')
        this.error = this.recorderText(end.error?.code ?? 'failed');
      return;
    }
    if (!(await this.addClip(end.clip))) return;
    if (end.reason === 'limit')
      this.notice = tr('rec.limitReached', {
        time: formatClock(MAX_VOICE_SECONDS),
      });
    else if (end.reason === 'size') this.notice = tr('rec.sizeReached');
    else this.error = tr('rec.errFailedKept');
  }

  /** Add a recorded clip as a local attachment. Violations add nothing. */
  async addClip(clip: RecordedClip): Promise<boolean> {
    // A concurrent addFiles replaces `active` when it finishes; let it land first.
    for (
      let i = 0;
      this.busy && !this.posting && !this.disposed && i < 100;
      i++
    )
      await new Promise((resolve) => setTimeout(resolve, 20));
    const session = this.active;
    if (
      !session ||
      this.disposed ||
      !this.ready ||
      this.busy ||
      this.conflict ||
      this.frozen ||
      this.posting
    ) {
      this.error = tr('work.addFailed');
      return false;
    }
    const rejection = clipRejection(
      session.attachments,
      this.limits.maxAttachmentsPerNote,
    );
    if (rejection) {
      this.error = tr(rejection.key, rejection.params);
      return false;
    }
    if (clip.blob.size > this.limits.fileMaxBytes) {
      this.error = tr('rec.tooLarge', {
        size: Math.round(this.limits.fileMaxBytes / (1024 * 1024)),
      });
      return false;
    }
    const id = crypto.randomUUID();
    this.localBlobs.set(id, clip.blob);
    this.lastAddedClipId = id;
    this.active = {
      ...session,
      attachments: [
        ...session.attachments,
        {
          id,
          source: 'local',
          kind: 'audio',
          filename: voiceFilename(clip.startedAt, this.timezone, clip.mime),
          mime: clip.mime,
          size: clip.blob.size,
          durationSeconds: clip.durationSeconds,
          ...(clip.peakLevel !== undefined && clip.peakLevel < SOUND_LEVEL
            ? { silent: true }
            : {}),
        },
      ],
    };
    this.error = '';
    await this.loadFiles();
    return true;
  }

  /** Rename a clip that has not been saved yet. The extension stays; returns false when
   * the name is empty or the attachment is a saved (server) file. */
  renameClip(id: string, input: string): boolean {
    const session = this.active;
    const clip = session?.attachments.find((a) => a.id === id);
    if (
      !session ||
      !clip ||
      clip.kind !== 'audio' ||
      clip.source !== 'local' ||
      this.conflict ||
      this.frozen ||
      this.posting
    )
      return false;
    const filename = renamedClipFilename(clip.filename, input);
    if (!filename) return false;
    if (filename !== clip.filename)
      this.active = {
        ...session,
        attachments: session.attachments.map((a) =>
          a.id === id ? { ...a, filename } : a,
        ),
      };
    return true;
  }

  /** Rename a saved clip of the note being edited. The name is stored at once (it is
   * not part of the draft), so a session that was clean stays clean. */
  async renameSavedClip(id: string, input: string): Promise<boolean> {
    const session = this.active;
    const clip = session?.attachments.find((a) => a.id === id);
    if (
      !session ||
      !clip ||
      clip.kind !== 'audio' ||
      clip.source !== 'server' ||
      this.conflict ||
      this.frozen ||
      this.posting
    )
      return false;
    const filename = renamedClipFilename(clip.filename, input);
    if (!filename) return false;
    if (filename === clip.filename) return true;
    const result = await renameSavedClip(id, filename);
    if (!result.ok) {
      this.error = result.message;
      return false;
    }
    const current = this.active;
    if (!current || current.localId !== session.localId) return true;
    const wasClean = this.cleanSnapshot === getSessionDigest(current);
    this.active = {
      ...current,
      attachments: current.attachments.map((a) =>
        a.id === id ? { ...a, filename: result.filename } : a,
      ),
    };
    if (wasClean) this.cleanSnapshot = getSessionDigest(this.active);
    return true;
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
    if (this.renamingId === id) this.renamingId = null;
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
      this.error = tr('work.sizeMismatch', { name: item.filename });
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

  async moveAttachment(id: string, toIndex: number) {
    if (
      !this.active ||
      this.busy ||
      this.frozen ||
      this.posting ||
      this.conflict
    )
      return;
    const attachments = [...this.active.attachments];
    const index = attachments.findIndex((a) => a.id === id);
    const target = Math.max(0, Math.min(attachments.length - 1, toIndex));
    if (index < 0 || target === index) return;
    const [item] = attachments.splice(index, 1);
    attachments.splice(target, 0, item);
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
      stage: tr('work.stagePreparing'),
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
            throw new Error(tr('work.fileMissing', { name: item.filename }));
          }
          items.push(await uploadItemFor(item, blob));
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
              message: tr('work.reviewTags'),
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
              message: tr('work.baseChanged'),
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
        this.status = 'saved';
      }
      return true;
    } catch (error) {
      if (!this.disposed) {
        this.postError =
          error instanceof PostingError
            ? error.message
            : error instanceof Error
              ? error.message
              : tr('work.saveFailed');
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
    if (result.data.length) this.postError = tr('work.retiredChoice');
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
    for (const { url } of this.blobUrls.values()) URL.revokeObjectURL(url);
    this.blobUrls.clear();
    this.images = [];
    this.thumbs = {};
    this.clipUrls = {};
    this.renamingId = null;
  }

  private blobUrl(id: string, blob: Blob): string {
    const cached = this.blobUrls.get(id);
    if (cached?.blob === blob) return cached.url;
    if (cached) URL.revokeObjectURL(cached.url);
    const url = URL.createObjectURL(blob);
    this.blobUrls.set(id, { blob, url });
    return url;
  }

  setPreviewVisible(visible: boolean) {
    this.previewRequested = visible;
    void this.loadFiles();
  }

  /** Thumbnails are always resolved; Markdown preview images only when shown. */
  async loadFiles() {
    this.missing = [];
    if (!this.active) {
      this.revokeUrls();
      return;
    }
    const images: ImageReference[] = [];
    const thumbs: Record<string, string> = {};
    const clips: Record<string, string> = {};
    const live = new SvelteSet<string>();
    for (const item of this.active.attachments) {
      if (item.source === 'local' && !this.localBlobs.has(item.id))
        this.missing.push(item.id);
      if (item.kind === 'audio') {
        if (item.source === 'server')
          clips[item.id] = `/api/attachments/${item.id}/file`;
        else {
          const blob = this.localBlobs.get(item.id);
          if (blob) {
            live.add(item.id);
            clips[item.id] = this.blobUrl(item.id, blob);
          }
        }
        continue;
      }
      if (item.kind !== 'image') continue;
      let url: string | undefined;
      if (item.source === 'server') {
        url = `/api/attachments/${item.id}/${this.previewRequested ? 'display' : 'thumbnail'}`;
        thumbs[item.id] = `/api/attachments/${item.id}/thumbnail`;
      } else {
        const blob = this.localBlobs.get(item.id);
        if (blob) {
          live.add(item.id);
          url = this.blobUrl(item.id, blob);
          thumbs[item.id] = url;
        }
      }
      if (url && this.previewRequested) images.push({ id: item.id, url });
    }
    for (const [id, { url }] of this.blobUrls)
      if (!live.has(id)) {
        URL.revokeObjectURL(url);
        this.blobUrls.delete(id);
      }
    this.images = images;
    this.thumbs = thumbs;
    this.clipUrls = clips;
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
  async editNote(note: NoteSnapshot): Promise<boolean> {
    if (!this.ready || this.busy || this.posting) return false;
    try {
      assertEditableSnapshot(note);
    } catch (error) {
      this.error =
        error instanceof Error ? error.message : tr('work.openFailed');
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
      isPrivate: note.isPrivate ?? false,
      basePrivate: note.isPrivate ?? false,
      timelineAt: note.timelineAt,
      attachments: (note.attachments ?? []).map((file) => ({
        id: file.id,
        source: 'server',
        kind: editorKind(file),
        filename: savedClipNames.get(file.id) ?? file.filename,
        mime: file.mime,
        size: file.storedBytes,
      })),
    };
    this.editOrigin = note.id;
    this.cleanSnapshot = getSessionDigest(this.active);
    await this.loadFiles();
    return true;
  }

  /** Does this note's card/page host the one in-memory session? */
  isEditing(noteId: string): boolean {
    return this.editOrigin === noteId && this.active !== null;
  }

  /** Called when the view showing an edit session goes away. An untouched edit
   * session is dropped; one with changes stays until the user decides (guards). */
  releaseEdit(noteId: string) {
    if (
      this.isEditing(noteId) &&
      !this.dirty &&
      !this.busy &&
      !this.posting &&
      !this.frozen
    )
      this.resetSession();
  }

  /** Save started by `commitEdit` (a click outside an inline edit), until it settles. */
  autosave: Promise<boolean> | null = null;

  /** Finish an inline edit without asking: save a changed edit, close an unchanged
   * one. Resolves false (the editor stays open) when it cannot be saved now, e.g.
   * while recording, with an empty body, missing files or a save error. */
  commitEdit(): Promise<boolean> {
    if (this.autosave) return this.autosave;
    if (this.editOrigin === null || this.busy || this.posting)
      return Promise.resolve(false);
    if (!this.dirty && !this.frozen) {
      this.resetSession();
      return Promise.resolve(true);
    }
    if (!this.canPost) return Promise.resolve(false);
    const run = this.post().finally(() => {
      this.autosave = null;
    });
    this.autosave = run;
    return run;
  }

  /** Make the one session a fresh new-note session. An edit of a note that is open
   * elsewhere goes through the unsaved-changes guard first. */
  async startNew(): Promise<boolean> {
    if (this.editOrigin === null) return true;
    if (!(await this.promptUnsavedChanges())) return false;
    if (this.editOrigin !== null) this.resetSession();
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
          this.postError = trError(result.error);
          return false;
        }
        try {
          assertEditableSnapshot(result.data);
        } catch {
          return false;
        }
        this.resetSession();
        return this.editNote(result.data);
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
      this.postError = tr('work.conflictFailed');
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
