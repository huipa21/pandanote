import { MAX_VOICE_SECONDS } from '../uploads/file-kind.ts';

/* Voice capture. Audio is held in memory only (never localStorage/IndexedDB) and
 * nothing leaves the browser until Post. Browser APIs come in through RecorderEnv so
 * the state machine is unit-testable without a browser. */

/** Preferred recording types in order; the stored MIME has codec parameters stripped. */
export const RECORDING_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/mp4',
  'audio/ogg;codecs=opus',
] as const;

export function pickRecordingMime(
  isTypeSupported: (mime: string) => boolean,
): string | null {
  for (const candidate of RECORDING_MIME_CANDIDATES)
    if (isTypeSupported(candidate)) return candidate;
  return null;
}
export const storedMime = (mime: string): string =>
  (mime.split(';')[0] ?? '').trim().toLowerCase();

const EXTENSIONS: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
};
export const extensionForMime = (mime: string): string =>
  EXTENSIONS[storedMime(mime)] ?? 'webm';

/** `voice-YYYYMMDD-HHMMSS.<ext>` in the configured app timezone. */
export function voiceFilename(
  at: number,
  timeZone: string,
  mime: string,
): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(at)
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});
  return `voice-${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}${parts.second}.${extensionForMime(mime)}`;
}

/** Elapsed seconds as `m:ss`. */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export type RecorderErrorCode =
  | 'insecure'
  | 'unsupported'
  | 'denied'
  | 'no-device'
  | 'busy'
  /** The take was cancelled, or already ended on its own (limit/failure). */
  | 'ended'
  | 'empty'
  | 'failed';
export class RecorderError extends Error {
  readonly code: RecorderErrorCode;
  constructor(code: RecorderErrorCode, options?: { cause?: unknown }) {
    super(code, options);
    this.code = code;
  }
}
/** Map a getUserMedia/MediaRecorder failure to a stable code. */
export function classifyMediaError(error: unknown): RecorderErrorCode {
  const name = (error as { name?: string } | null)?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (
    name === 'NotFoundError' ||
    name === 'DevicesNotFoundError' ||
    name === 'OverconstrainedError'
  )
    return 'no-device';
  if (
    name === 'NotReadableError' ||
    name === 'TrackStartError' ||
    name === 'AbortError'
  )
    return 'busy';
  if (name === 'TypeError') return 'unsupported';
  return 'failed';
}

/** Why recording cannot start in this environment, or null when it can. */
export function recordingSupport(env: RecorderEnv): RecorderErrorCode | null {
  if (!env.isSecureContext) return 'insecure';
  if (!env.hasMediaRecorder) return 'unsupported';
  return pickRecordingMime((m) => env.isTypeSupported(m))
    ? null
    : 'unsupported';
}

export interface RecordedClip {
  blob: Blob;
  /** Container MIME without codec parameters. */
  mime: string;
  /** Recorder's own timer; never `audio.duration` (Chrome webm reports Infinity). */
  durationSeconds: number;
  /** Epoch ms when recording started (used for the filename). */
  startedAt: number;
}
export type RecorderState =
  'idle' | 'starting' | 'recording' | 'paused' | 'stopped';
/** An unrequested end. `clip` is whatever was captured, if anything. */
export interface RecorderEnd {
  reason: 'limit' | 'size' | 'error';
  clip: RecordedClip | null;
  error?: RecorderError;
}
export interface RecorderEvents {
  onState?(state: RecorderState): void;
  /** About every 100 ms while recording; `level` is 0..1. */
  onProgress?(progress: { elapsedMs: number; level: number }): void;
  /** Recording ended without a user Stop (time/size limit or failure). */
  onEnd?(end: RecorderEnd): void;
}

/** Minimal views of the browser objects the recorder uses. */
export interface TrackLike {
  stop(): void;
  addEventListener?(type: 'ended', listener: () => void): void;
}
export interface StreamLike {
  getTracks(): TrackLike[];
}
export interface MediaRecorderLike {
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onstop: (() => void) | null;
  start(timeslice?: number): void;
  stop(): void;
  pause(): void;
  resume(): void;
}
export interface MeterLike {
  /** Current level 0..1. */
  read(): number;
  close(): void;
}
export interface RecorderEnv {
  isSecureContext: boolean;
  hasMediaRecorder: boolean;
  isTypeSupported(mime: string): boolean;
  getUserMedia(): Promise<StreamLike>;
  createRecorder(stream: StreamLike, mimeType: string): MediaRecorderLike;
  /** Optional; a failing meter never fails the recording. */
  createMeter?(stream: StreamLike): MeterLike | null;
  /** Monotonic milliseconds. */
  now(): number;
  /** Epoch milliseconds. */
  wallClock(): number;
  setTimeout(handler: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(handler: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}
export interface RecorderOptions {
  maxSeconds?: number;
  /** Safety cap on in-memory bytes (the per-file upload limit). */
  maxBytes: number;
  timesliceMs?: number;
  progressMs?: number;
}

type EndReason = RecorderEnd['reason'] | 'user';

export class VoiceRecorder {
  private readonly env: RecorderEnv;
  private readonly events: RecorderEvents;
  private readonly maxMs: number;
  private readonly maxBytes: number;
  private readonly timeslice: number;
  private readonly progressMs: number;

  private current: RecorderState = 'idle';
  /** Bumped by start() and cancel() so stale async continuations can tell. */
  private generation = 0;
  private stream: StreamLike | null = null;
  private recorder: MediaRecorderLike | null = null;
  private meter: MeterLike | null = null;
  private chunks: Blob[] = [];
  private bytes = 0;
  private overflow = false;
  private mime = 'audio/webm';
  private startedAt = 0;
  private accumulated = 0;
  private segmentStart = 0;
  private limitTimer: unknown = null;
  private ticker: unknown = null;
  private finish: (() => void) | null = null;
  private ending: EndReason | null = null;
  private endError: RecorderError | undefined;

  constructor(
    env: RecorderEnv,
    options: RecorderOptions,
    events: RecorderEvents = {},
  ) {
    this.env = env;
    this.events = events;
    this.maxMs = (options.maxSeconds ?? MAX_VOICE_SECONDS) * 1000;
    this.maxBytes = options.maxBytes;
    this.timeslice = options.timesliceMs ?? 1000;
    this.progressMs = options.progressMs ?? 100;
  }

  get state(): RecorderState {
    return this.current;
  }
  get active(): boolean {
    return (
      this.current === 'starting' ||
      this.current === 'recording' ||
      this.current === 'paused'
    );
  }
  get elapsedMs(): number {
    return this.current === 'recording' && !this.ending
      ? this.accumulated + (this.env.now() - this.segmentStart)
      : this.accumulated;
  }

  private setState(state: RecorderState) {
    this.current = state;
    this.events.onState?.(state);
  }

  /** Request the microphone and begin recording. Never called automatically. */
  async start(): Promise<void> {
    if (this.active) throw new RecorderError('busy');
    const unsupported = recordingSupport(this.env);
    if (unsupported) throw new RecorderError(unsupported);
    const mimeType = pickRecordingMime((m) => this.env.isTypeSupported(m))!;

    this.reset();
    const generation = ++this.generation;
    this.setState('starting');
    let stream: StreamLike;
    try {
      stream = await this.env.getUserMedia();
    } catch (error) {
      if (generation === this.generation) this.setState('idle');
      throw new RecorderError(classifyMediaError(error), { cause: error });
    }
    if (generation !== this.generation) {
      // Cancelled while the permission prompt was open: release at once.
      for (const track of stream.getTracks()) track.stop();
      throw new RecorderError('ended');
    }
    this.stream = stream;
    try {
      const recorder = this.env.createRecorder(stream, mimeType);
      this.recorder = recorder;
      this.mime = storedMime(mimeType);
      recorder.ondataavailable = (event) => this.onData(event.data);
      recorder.onerror = (event) => this.onRecorderError(event);
      recorder.onstop = () => this.onRecorderStop();
      for (const track of stream.getTracks())
        track.addEventListener?.('ended', () => this.onTrackEnded());
      try {
        this.meter = this.env.createMeter?.(stream) ?? null;
      } catch {
        this.meter = null;
      }
      recorder.start(this.timeslice);
    } catch (error) {
      this.release();
      this.recorder = null;
      this.setState('idle');
      throw new RecorderError(classifyMediaError(error), { cause: error });
    }
    this.startedAt = this.env.wallClock();
    this.segmentStart = this.env.now();
    this.armTimers();
    this.setState('recording');
  }

  pause(): void {
    if (this.current !== 'recording' || !this.recorder || this.ending) return;
    this.accumulated += this.env.now() - this.segmentStart;
    this.disarmTimers();
    try {
      this.recorder.pause();
    } catch {
      /* A stuck pause still leaves the take stoppable. */
    }
    this.setState('paused');
    this.events.onProgress?.({ elapsedMs: this.accumulated, level: 0 });
  }

  resume(): void {
    if (this.current !== 'paused' || !this.recorder || this.ending) return;
    try {
      this.recorder.resume();
    } catch (error) {
      this.fail(new RecorderError('failed', { cause: error }));
      return;
    }
    this.segmentStart = this.env.now();
    this.armTimers();
    this.setState('recording');
  }

  /** User Stop: resolves with the clip. Rejects with `empty` if nothing was captured,
   * or `ended` if the take already ended itself or was cancelled. */
  async stop(): Promise<RecordedClip> {
    if (this.current !== 'recording' && this.current !== 'paused')
      throw new RecorderError('ended');
    if (this.ending) throw new RecorderError('ended');
    const generation = this.generation;
    await this.endTake('user');
    if (generation !== this.generation) throw new RecorderError('ended');
    const clip = this.buildClip();
    this.reset();
    this.setState('stopped');
    if (!clip) throw new RecorderError('empty');
    return clip;
  }

  /** Discard the current take and release the microphone. Safe in any state. */
  cancel(): void {
    if (!this.active) return;
    this.generation++;
    const recorder = this.recorder;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onerror = null;
      recorder.onstop = null;
    }
    this.release();
    try {
      recorder?.stop();
    } catch {
      /* Already inactive. */
    }
    // Unblock a stop() that is waiting for the final chunk; it sees the new generation.
    this.finish?.();
    this.reset();
    this.setState('idle');
  }

  // --- internals --------------------------------------------------------

  private reset() {
    this.chunks = [];
    this.bytes = 0;
    this.overflow = false;
    this.accumulated = 0;
    this.segmentStart = 0;
    this.finish = null;
    this.ending = null;
    this.endError = undefined;
    this.recorder = null;
  }

  private armTimers() {
    this.disarmTimers();
    const remaining = Math.max(0, this.maxMs - this.accumulated);
    this.limitTimer = this.env.setTimeout(() => {
      this.limitTimer = null;
      void this.endAutomatically('limit');
    }, remaining);
    this.ticker = this.env.setInterval(() => {
      this.events.onProgress?.({
        elapsedMs: Math.min(this.elapsedMs, this.maxMs),
        level: this.safeLevel(),
      });
    }, this.progressMs);
  }
  private disarmTimers() {
    if (this.limitTimer !== null) this.env.clearTimeout(this.limitTimer);
    if (this.ticker !== null) this.env.clearInterval(this.ticker);
    this.limitTimer = this.ticker = null;
  }
  private safeLevel(): number {
    try {
      const level = this.meter?.read() ?? 0;
      return Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
    } catch {
      return 0;
    }
  }

  /** Stop the MediaRecorder, wait for its final chunk, release the microphone. */
  private async endTake(reason: EndReason): Promise<void> {
    this.ending = reason;
    if (this.current === 'recording') {
      this.accumulated += this.env.now() - this.segmentStart;
      // The limit timer is authoritative: never report more than the cap.
      if (reason === 'limit') this.accumulated = this.maxMs;
    }
    this.disarmTimers();
    const done = new Promise<void>((resolve) => {
      this.finish = resolve;
    });
    try {
      if (!this.recorder) throw new Error('no recorder');
      this.recorder.stop();
    } catch {
      // Already inactive: no stop event will come.
      this.finish?.();
    }
    await done;
    this.release();
  }

  private async endAutomatically(reason: 'limit' | 'size' | 'error') {
    if (
      this.ending ||
      !(this.current === 'recording' || this.current === 'paused')
    )
      return;
    const generation = this.generation;
    const error = this.endError;
    await this.endTake(reason);
    if (generation !== this.generation) return;
    const clip = this.buildClip();
    this.reset();
    this.setState('stopped');
    this.events.onEnd?.({ reason, clip, ...(error ? { error } : {}) });
  }

  private fail(error: RecorderError) {
    if (this.ending) return;
    this.endError = error;
    void this.endAutomatically('error');
  }

  private onData(data: Blob) {
    // After an overflow no later chunk may be kept: that would leave a hole.
    if (this.overflow || !data.size) return;
    if (this.bytes + data.size > this.maxBytes) {
      this.overflow = true;
      void this.endAutomatically('size');
      return;
    }
    this.chunks.push(data);
    this.bytes += data.size;
  }
  private onRecorderError(event: unknown) {
    const inner = (event as { error?: unknown } | null)?.error ?? event;
    this.fail(new RecorderError('failed', { cause: inner }));
  }
  private onTrackEnded() {
    // Device unplugged / permission revoked mid-take.
    if (this.current === 'recording' || this.current === 'paused')
      this.fail(new RecorderError('failed'));
  }
  private onRecorderStop() {
    if (this.ending) this.finish?.();
    else this.fail(new RecorderError('failed'));
  }

  private buildClip(): RecordedClip | null {
    if (!this.chunks.length) return null;
    const ms = Math.min(this.accumulated, this.maxMs);
    return {
      blob: new Blob(this.chunks, { type: this.mime }),
      mime: this.mime,
      durationSeconds: Math.round(ms / 100) / 10,
      startedAt: this.startedAt,
    };
  }

  /** Stop the meter and every microphone track (indicator off). Idempotent. */
  private release() {
    this.disarmTimers();
    try {
      this.meter?.close();
    } catch {
      /* Meter teardown must not mask the recording result. */
    }
    this.meter = null;
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
  }
}

/** AudioContext-based level meter; closed with the take. Returns null if unavailable. */
export function createAudioMeter(stream: MediaStream): MeterLike | null {
  if (typeof AudioContext === 'undefined') return null;
  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const samples = new Uint8Array(analyser.fftSize);
  return {
    read() {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const value of samples) {
        const centered = (value - 128) / 128;
        sum += centered * centered;
      }
      return Math.min(1, Math.sqrt(sum / samples.length) * 2.5);
    },
    close() {
      source.disconnect();
      void context.close().catch(() => {});
    },
  };
}

/** Real browser bindings. Only call in the browser. */
export function browserRecorderEnv(): RecorderEnv {
  return {
    isSecureContext: window.isSecureContext,
    hasMediaRecorder:
      typeof MediaRecorder !== 'undefined' &&
      typeof navigator.mediaDevices?.getUserMedia === 'function',
    isTypeSupported: (mime) =>
      typeof MediaRecorder !== 'undefined' &&
      MediaRecorder.isTypeSupported(mime),
    getUserMedia: () => navigator.mediaDevices.getUserMedia({ audio: true }),
    createRecorder: (stream, mimeType) =>
      new MediaRecorder(stream as MediaStream, {
        mimeType,
      }) as unknown as MediaRecorderLike,
    createMeter: (stream) => createAudioMeter(stream as MediaStream),
    now: () => performance.now(),
    wallClock: () => Date.now(),
    setTimeout: (handler, ms) => window.setTimeout(handler, ms),
    clearTimeout: (handle) => window.clearTimeout(handle as number),
    setInterval: (handler, ms) => window.setInterval(handler, ms),
    clearInterval: (handle) => window.clearInterval(handle as number),
  };
}
