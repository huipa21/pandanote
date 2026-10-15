import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorWorkspace } from '../../src/lib/client/editor/workspace.svelte.ts';
import {
  commandForSession,
  editorKind,
  hasSessionContent,
  isSessionDirty,
  newSession,
  sessionFingerprint,
  type EditorAttachment,
} from '../../src/lib/client/editor/model.ts';
import {
  clipRejection,
  isClip,
  renamedClipFilename,
  splitClipName,
} from '../../src/lib/client/recording/clips.ts';
import type {
  MediaRecorderLike,
  RecorderEnv,
  StreamLike,
} from '../../src/lib/client/recording/recorder.ts';
import {
  commandDigest,
  postingAttemptSchema,
  sha256,
  uploadItemFor,
} from '../../src/lib/client/uploads/attempt.ts';
import { runPosting } from '../../src/lib/client/uploads/protocol.ts';
import type { PostingTransport } from '../../src/lib/client/uploads/protocol.ts';
import { MAX_VOICE_CLIPS } from '../../src/lib/client/uploads/file-kind.ts';
import { storageLimitsFrom } from '../../src/lib/shared/storage.ts';
import { DEFAULT_SETTINGS } from '../../src/lib/shared/settings.ts';
import { uploadItemSchema } from '../../src/lib/shared/attachments.ts';

const att = (
  kind: EditorAttachment['kind'],
  extra: Partial<EditorAttachment> = {},
): EditorAttachment => ({
  id: crypto.randomUUID(),
  source: 'local',
  kind,
  filename: kind === 'audio' ? 'voice-20250101-000000.webm' : 'x.bin',
  mime: kind === 'audio' ? 'audio/webm' : 'application/octet-stream',
  size: 3,
  ...extra,
});

describe('clip limit rules', () => {
  it('allows a first clip and clips beside up to nine photos', () => {
    expect(clipRejection([], 100)).toBeNull();
    const photos = Array.from({ length: 9 }, () => att('image'));
    expect(clipRejection(photos, 100)).toBeNull();
    expect(
      clipRejection([...photos, att('audio'), att('audio')], 100),
    ).toBeNull();
  });
  it('a video excludes clips', () => {
    const video = att('file', { filename: 'a.mp4', mime: 'video/mp4' });
    expect(clipRejection([video], 100)?.key).toBe('rec.videoClips');
    // A .webm clip is not a video: it is classified as audio, not as a file.
    expect(clipRejection([att('audio')], 100)).toBeNull();
  });
  it('rejects the 21st clip', () => {
    const twenty = Array.from({ length: MAX_VOICE_CLIPS }, () => att('audio'));
    expect(clipRejection(twenty.slice(0, 19), 100)).toBeNull();
    expect(clipRejection(twenty, 100)).toEqual({
      key: 'rec.maxClips',
      params: { count: 20 },
    });
  });
  it('counts a reserved slot (a take in progress) against the clip limit', () => {
    const eighteen = Array.from({ length: 18 }, () => att('audio'));
    expect(clipRejection(eighteen, 100, 1)).toBeNull();
    expect(clipRejection(eighteen, 100, 2)?.key).toBe('rec.maxClips');
  });
  it('clips count toward the per-note attachment cap', () => {
    const items = [att('image'), att('image'), att('audio')];
    expect(clipRejection(items, 4)).toBeNull();
    expect(clipRejection(items, 3)?.key).toBe('work.maxFiles');
    expect(clipRejection(items, 4, 1)?.key).toBe('work.maxFiles');
  });
  it('isClip', () => {
    expect(isClip(att('audio'))).toBe(true);
    expect(isClip(att('image'))).toBe(false);
  });
});

describe('clip names', () => {
  it('splits the fixed extension off', () => {
    expect(splitClipName('voice-1.webm')).toEqual({
      base: 'voice-1',
      extension: '.webm',
    });
    expect(splitClipName('plain').extension).toBe('');
  });
  it('keeps the extension and cleans the typed name', () => {
    const old = 'voice-20250101-000000.webm';
    expect(renamedClipFilename(old, 'Meeting notes')).toBe(
      'Meeting notes.webm',
    );
    expect(renamedClipFilename(old, '  Meeting.WEBM ')).toBe('Meeting.webm');
    expect(renamedClipFilename(old, 'a/b\\c:d')).toBe('a-b-c-d.webm');
    expect(renamedClipFilename(old, '..hidden')).toBe('hidden.webm');
    expect(renamedClipFilename(old, 'bell‮')).toBe('bell.webm');
    expect(renamedClipFilename(old, '会议 记录')).toBe('会议 记录.webm');
  });
  it('rejects an empty name and stays within the 255 character limit', () => {
    const old = 'voice-1.m4a';
    expect(renamedClipFilename(old, '   ')).toBeNull();
    expect(renamedClipFilename(old, '.webm')).toBe('webm.m4a');
    expect(renamedClipFilename(old, 'x'.repeat(400))!).toHaveLength(255);
    expect(
      uploadItemSchema.safeParse({
        id: crypto.randomUUID(),
        filename: renamedClipFilename(old, 'x'.repeat(400)),
        incomingBytes: 1,
        incomingDigest: 'a'.repeat(64),
      }).success,
    ).toBe(true);
  });
});

describe('session model with clips', () => {
  it('a clip-only note is content and a valid command', () => {
    const clip = att('audio', { durationSeconds: 4 });
    const session = { ...newSession(1000), attachments: [clip] };
    expect(hasSessionContent(session)).toBe(true);
    const command = commandForSession(session, crypto.randomUUID());
    expect(command.content.bodyMarkdown).toBe('');
    expect(command.content.attachmentIds).toEqual([clip.id]);
  });
  it('adding or removing a clip makes a new editor dirty/clean', () => {
    const empty = newSession(1000);
    const clean = sessionFingerprint(empty);
    const withClip = { ...empty, attachments: [att('audio')] };
    expect(isSessionDirty(withClip, clean)).toBe(true);
    expect(isSessionDirty({ ...withClip, attachments: [] }, clean)).toBe(false);
  });
  it('reordering clips changes the fingerprint (attachment order is the truth)', () => {
    const a = att('audio'),
      b = att('audio');
    const session = { ...newSession(1000), attachments: [a, b] };
    const reordered = { ...session, attachments: [b, a] };
    expect(sessionFingerprint(reordered)).not.toBe(sessionFingerprint(session));
    expect(
      commandForSession(reordered, crypto.randomUUID()).content.attachmentIds,
    ).toEqual([b.id, a.id]);
  });
  it('server files with an audio MIME open as clips; other files stay files', () => {
    expect(editorKind({ kind: 'file', mime: 'audio/webm' })).toBe('audio');
    expect(editorKind({ kind: 'file', mime: 'audio/mp4' })).toBe('audio');
    expect(editorKind({ kind: 'file', mime: 'audio/ogg' })).toBe('audio');
    expect(editorKind({ kind: 'file', mime: 'application/octet-stream' })).toBe(
      'file',
    );
    expect(editorKind({ kind: 'file', mime: 'video/webm' })).toBe('file');
    expect(editorKind({ kind: 'image', mime: 'image/jpeg' })).toBe('image');
  });
});

describe('upload items', () => {
  it('voice clips carry voice: true; others do not', async () => {
    const blob = new Blob(['abc']);
    const clip = await uploadItemFor(att('audio'), blob);
    expect(clip.voice).toBe(true);
    expect(clip.incomingBytes).toBe(3);
    expect(clip.incomingDigest).toBe(await sha256(blob));
    expect(uploadItemSchema.parse(clip)).toEqual(clip);
    for (const kind of ['image', 'file'] as const)
      expect('voice' in (await uploadItemFor(att(kind), blob))).toBe(false);
  });

  it('a frozen attempt keeps the flag through the whole retry-safe protocol', async () => {
    const clip = att('audio', { size: 3 });
    const blob = new Blob(['abc']);
    const command = commandForSession(
      { ...newSession(), attachments: [clip] },
      crypto.randomUUID(),
    );
    const attempt = postingAttemptSchema.parse({
      command,
      manifest: {
        mutationId: command.mutationId,
        requestDigest: await commandDigest(command),
        items: [await uploadItemFor(clip, blob)],
      },
      phase: 'frozen',
      batchId: null,
      readyIds: [],
      result: null,
    });
    expect(attempt.manifest.items[0]!.voice).toBe(true);
    const sent: unknown[] = [];
    const transport: PostingTransport = {
      async initialize(a) {
        sent.push(a.manifest.items);
        return {
          state: 'batch',
          batch: {
            id: crypto.randomUUID(),
            status: 'pending',
            attachments: [],
          },
        };
      },
      async upload(_b, id) {
        return {
          id,
          kind: 'file',
          filename: clip.filename,
          mime: 'audio/webm',
          incomingBytes: 3,
          readiness: 'ready',
          storedBytes: 3,
          width: null,
          height: null,
          thumbnailWidth: null,
          thumbnailHeight: null,
        };
      },
      async commit() {
        return {
          noteId: crypto.randomUUID(),
          revision: 1,
          status: 'published',
          deleted: false,
        };
      },
    };
    await runPosting(
      attempt,
      async () => blob,
      async () => {},
      () => {},
      transport,
    );
    expect((sent[0] as { voice?: boolean }[])[0]!.voice).toBe(true);
  });
});

/** Fake browser: records into memory; counts released microphone tracks. */
function fakeEnv() {
  const state = {
    tracksStopped: 0,
    pendingPrompt: null as null | ((s: StreamLike) => void),
    recorder: null as MediaRecorderLike | null,
    timers: new Map<number, () => void>(),
    next: 1,
    /** Each now() reading advances this much, so a start→stop take spans `step` ms. */
    clock: 0,
    step: 1_000,
    /** What the level meter reads. */
    level: 0.5,
    ticks: [] as (() => void)[],
  };
  const env: RecorderEnv = {
    isSecureContext: true,
    hasMediaRecorder: true,
    isTypeSupported: (m) => m === 'audio/webm;codecs=opus',
    getUserMedia: async () => ({
      getTracks: () => [{ stop: () => void state.tracksStopped++ }],
    }),
    createRecorder: () => {
      const rec: MediaRecorderLike = {
        ondataavailable: null,
        onerror: null,
        onstop: null,
        start() {},
        pause() {},
        resume() {},
        stop() {
          queueMicrotask(() => {
            rec.ondataavailable?.({ data: new Blob(['audio-bytes']) });
            rec.onstop?.();
          });
        },
      };
      state.recorder = rec;
      return rec;
    },
    createMeter: () => ({ read: () => state.level, close() {} }),
    now: () => (state.clock += state.step),
    wallClock: () => Date.UTC(2025, 2, 4, 5, 6, 7),
    setTimeout: (h, ms) => {
      const id = state.next++;
      state.timers.set(id, h);
      void ms;
      return id;
    },
    clearTimeout: (id) => void state.timers.delete(id as number),
    setInterval: (h, ms) => {
      const id = state.next++;
      state.ticks.push(h);
      void ms;
      return id;
    },
    clearInterval: (id) => void state.timers.delete(id as number),
  };
  return { env, state };
}

describe('EditorWorkspace voice clips', () => {
  const created: string[] = [];
  const revoked: string[] = [];
  const listeners = new Map<string, Set<() => void>>();
  beforeEach(() => {
    created.length = revoked.length = 0;
    listeners.clear();
    vi.stubGlobal('window', {
      addEventListener: (t: string, l: () => void) =>
        (listeners.get(t) ?? listeners.set(t, new Set()).get(t)!).add(l),
      removeEventListener: (t: string, l: () => void) =>
        listeners.get(t)?.delete(l),
    });
    let n = 0;
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      const url = `blob:test/${++n}`;
      created.push(url);
      return url;
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => {
      revoked.push(url);
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function setup() {
    const workspace = new EditorWorkspace('acct', 'Asia/Shanghai');
    const f = fakeEnv();
    workspace.recorderEnv = () => f.env;
    const dispose = await workspace.start();
    return { workspace, f, dispose };
  }

  it('records a clip that becomes a local audio attachment with a tz filename', async () => {
    const { workspace, f, dispose } = await setup();
    expect(await workspace.startRecording()).toBe(true);
    expect(workspace.recording).toBe(true);
    expect(workspace.recorder.state).toBe('recording');
    expect(await workspace.stopRecording()).toBe(true);
    expect(workspace.recording).toBe(false);
    const [clip] = workspace.active!.attachments;
    expect(clip).toMatchObject({
      source: 'local',
      kind: 'audio',
      mime: 'audio/webm',
      size: 11,
      // 2025-03-04T05:06:07Z in Asia/Shanghai (UTC+8)
      filename: 'voice-20250304-130607.webm',
    });
    expect(clip!.durationSeconds).toBeTypeOf('number');
    expect(f.state.tracksStopped).toBe(1);
    expect(workspace.dirty).toBe(true);
    expect(workspace.clipUrls[clip!.id]).toMatch(/^blob:/);
    dispose();
  });

  it('after Stop the new clip is offered for naming; renaming keeps the extension', async () => {
    const { workspace, dispose } = await setup();
    await workspace.startRecording();
    await workspace.stopRecording();
    const [clip] = workspace.active!.attachments;
    expect(workspace.renamingId).toBe(clip!.id);
    expect(workspace.renameClip(clip!.id, 'Standup')).toBe(true);
    expect(workspace.active!.attachments[0]!.filename).toBe('Standup.webm');
    // An unusable name changes nothing.
    expect(workspace.renameClip(clip!.id, '  ')).toBe(false);
    expect(workspace.active!.attachments[0]!.filename).toBe('Standup.webm');
    // Only unsaved (local) clips can be renamed.
    expect(workspace.renameClip('nope', 'x')).toBe(false);
    // Removing the clip closes the naming field.
    await workspace.removeAttachment(clip!.id);
    expect(workspace.renamingId).toBeNull();
    dispose();
  });

  it('warns when the microphone stays silent and flags a silent clip', async () => {
    const { workspace, f, dispose } = await setup();
    f.state.step = 1_000;
    f.state.level = 0;
    await workspace.startRecording();
    const tick = f.state.ticks.at(-1)!;
    tick();
    expect(workspace.recorder.quiet).toBe(false); // not silent long enough yet
    for (let i = 0; i < 4; i++) tick();
    expect(workspace.recorder.quiet).toBe(true);
    expect(workspace.recorder.level).toBe(0);
    // Sound clears the warning.
    f.state.level = 0.6;
    tick();
    expect(workspace.recorder.quiet).toBe(false);
    expect(workspace.recorder.level).toBe(0.6);
    f.state.level = 0;
    expect(await workspace.stopRecording()).toBe(true);
    // The take did contain sound at some point, so the clip is not flagged.
    expect(workspace.active!.attachments[0]!.silent).toBeUndefined();

    // A take that never heard anything is flagged on its row.
    await workspace.startRecording();
    const silentTick = f.state.ticks.at(-1)!;
    for (let i = 0; i < 3; i++) silentTick();
    expect(await workspace.stopRecording()).toBe(true);
    expect(workspace.active!.attachments[1]!.silent).toBe(true);
    dispose();
  });

  it('a take stopped before the minimum length adds nothing and says why', async () => {
    const { workspace, f, dispose } = await setup();
    f.state.step = 100; // Stop pressed ~100 ms after start
    expect(await workspace.startRecording()).toBe(true);
    expect(await workspace.stopRecording()).toBe(false);
    expect(workspace.active!.attachments).toHaveLength(0);
    expect(workspace.error).toBe(
      'The recording was too short, so no clip was added.',
    );
    expect(workspace.recording).toBe(false);
    expect(f.state.tracksStopped).toBe(1);
    expect(created).toHaveLength(0);
    // The next, long-enough take works and clears the message.
    f.state.step = 1_000;
    expect(await workspace.startRecording()).toBe(true);
    expect(workspace.error).toBe('');
    expect(await workspace.stopRecording()).toBe(true);
    expect(workspace.active!.attachments).toHaveLength(1);
    dispose();
  });

  it('a clip-only note can be posted once the take is stopped', async () => {
    const { workspace, dispose } = await setup();
    workspace.ready = true;
    await workspace.startRecording();
    expect(workspace.canPost).toBe(false);
    expect(workspace.postBlockedReason).not.toBe('');
    await workspace.stopRecording();
    expect(workspace.postBlockedReason).toBe('');
    expect(workspace.canPost).toBe(true);
    dispose();
  });

  it('an active take is unsaved work and blocks Post while text editing still works', async () => {
    const { workspace, dispose } = await setup();
    await workspace.startRecording();
    expect(workspace.dirty).toBe(true);
    expect(workspace.canPost).toBe(false);
    workspace.change('typing while recording');
    expect(workspace.active!.bodyMarkdown).toBe('typing while recording');
    workspace.pauseRecording();
    expect(workspace.recorder.state).toBe('paused');
    expect(workspace.recording).toBe(true);
    workspace.resumeRecording();
    expect(workspace.recorder.state).toBe('recording');
    workspace.cancelRecording();
    dispose();
  });

  it('cancel discards the take, releases the microphone and adds nothing', async () => {
    const { workspace, f, dispose } = await setup();
    await workspace.startRecording();
    workspace.cancelRecording();
    expect(workspace.recording).toBe(false);
    expect(workspace.active!.attachments).toEqual([]);
    expect(f.state.tracksStopped).toBe(1);
    expect(workspace.dirty).toBe(false);
    dispose();
  });

  it('discarding the session, or disposing the workspace, releases the microphone', async () => {
    const a = await setup();
    await a.workspace.startRecording();
    await a.workspace.discard();
    expect(a.f.state.tracksStopped).toBe(1);
    expect(a.workspace.recording).toBe(false);
    a.dispose();

    const b = await setup();
    await b.workspace.startRecording();
    b.dispose();
    expect(b.f.state.tracksStopped).toBe(1);
  });

  it('pagehide releases the microphone', async () => {
    const { workspace, f, dispose } = await setup();
    await workspace.startRecording();
    for (const listener of listeners.get('pagehide') ?? []) listener();
    expect(f.state.tracksStopped).toBe(1);
    expect(workspace.recording).toBe(false);
    dispose();
  });

  it('only one recorder is active at a time', async () => {
    const { workspace, dispose } = await setup();
    expect(await workspace.startRecording()).toBe(true);
    expect(await workspace.startRecording()).toBe(false);
    workspace.cancelRecording();
    dispose();
  });

  it('reports start failures and stays idle', async () => {
    const { workspace, f, dispose } = await setup();
    f.env.getUserMedia = () =>
      Promise.reject(
        Object.assign(new Error('x'), { name: 'NotAllowedError' }),
      );
    expect(await workspace.startRecording()).toBe(false);
    expect(workspace.error).toMatch(/denied/i);
    expect(workspace.recording).toBe(false);
    dispose();
  });

  it('refuses to start for a video, a 21st clip, or a full note', async () => {
    const { workspace, dispose } = await setup();
    workspace.active = {
      ...workspace.active!,
      attachments: [att('file', { filename: 'a.mp4', mime: 'video/mp4' })],
    };
    expect(await workspace.startRecording()).toBe(false);
    expect(workspace.error).toMatch(/video/i);

    workspace.active = {
      ...workspace.active!,
      attachments: Array.from({ length: MAX_VOICE_CLIPS }, () => att('audio')),
    };
    expect(await workspace.startRecording()).toBe(false);
    expect(workspace.error).toMatch(/20/);
    expect(workspace.recording).toBe(false);

    workspace.limits = {
      ...storageLimitsFrom(DEFAULT_SETTINGS),
      maxAttachmentsPerNote: 2,
    };
    workspace.active = {
      ...workspace.active!,
      attachments: [att('image'), att('image')],
    };
    expect(await workspace.startRecording()).toBe(false);
    dispose();
  });

  it('a recording takes a slot: files that would not fit are refused', async () => {
    const { workspace, dispose } = await setup();
    workspace.limits = {
      ...storageLimitsFrom(DEFAULT_SETTINGS),
      maxAttachmentsPerNote: 2,
    };
    await workspace.startRecording();
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'a.png', {
      type: 'image/png',
    });
    await workspace.addFiles([png, png]);
    expect(workspace.active!.attachments).toHaveLength(0);
    await workspace.addFiles([png]);
    expect(workspace.active!.attachments).toHaveLength(1);
    // and a video cannot join a note with a take in progress
    await workspace.addFiles([new File(['v'], 'v.mp4', { type: 'video/mp4' })]);
    expect(workspace.active!.attachments).toHaveLength(1);
    expect(await workspace.stopRecording()).toBe(true);
    expect(workspace.active!.attachments.map((a) => a.kind)).toEqual([
      'image',
      'audio',
    ]);
    dispose();
  });

  it('removing a clip drops its blob and revokes its object URL; reset revokes the rest', async () => {
    const { workspace, dispose } = await setup();
    for (let i = 0; i < 2; i++) {
      await workspace.startRecording();
      await workspace.stopRecording();
    }
    const [first, second] = workspace.active!.attachments;
    const firstUrl = workspace.clipUrls[first!.id]!;
    const secondUrl = workspace.clipUrls[second!.id]!;
    expect(created).toEqual([firstUrl, secondUrl]);
    await workspace.removeAttachment(first!.id);
    expect(revoked).toEqual([firstUrl]);
    expect(workspace.clipUrls[first!.id]).toBeUndefined();
    await workspace.discard();
    expect(revoked).toEqual([firstUrl, secondUrl]);
    expect(workspace.clipUrls).toEqual({});
    dispose();
  });

  it('clips can be reordered with the shared attachment order', async () => {
    const { workspace, dispose } = await setup();
    for (let i = 0; i < 2; i++) {
      await workspace.startRecording();
      await workspace.stopRecording();
    }
    const [a, b] = workspace.active!.attachments.map((x) => x.id);
    await workspace.moveAttachment(b!, 0);
    expect(workspace.active!.attachments.map((x) => x.id)).toEqual([b, a]);
    dispose();
  });

  it('server clips are playable from the file route', async () => {
    const { workspace, dispose } = await setup();
    const note = {
      id: crypto.randomUUID(),
      status: 'published' as const,
      priorStatus: null,
      bodyMarkdown: 'n',
      timelineAt: 1000,
      createdAt: 1000,
      updatedAt: 1000,
      contentEditedAt: null,
      pinnedAt: null,
      revision: 1,
      attachmentIds: [] as string[],
      attachments: [] as never[],
      tags: [],
    };
    const id = crypto.randomUUID();
    note.attachmentIds = [id];
    note.attachments = [
      {
        id,
        kind: 'file',
        filename: 'voice-20250101-000000.webm',
        mime: 'audio/webm',
        storedBytes: 10,
        incomingBytes: 10,
        readiness: 'ready',
        width: null,
        height: null,
        thumbnailWidth: null,
        thumbnailHeight: null,
      },
    ] as never[];
    expect(await workspace.editNote(note)).toBe(true);
    expect(workspace.active!.attachments[0]!.kind).toBe('audio');
    expect(workspace.clipUrls[id]).toBe(`/api/attachments/${id}/file`);
    // An untouched edit of a note with a clip is not dirty; a fresh clip is not required.
    expect(workspace.dirty).toBe(false);
    dispose();
  });
});
