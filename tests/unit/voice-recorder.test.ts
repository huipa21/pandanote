import { describe, expect, it } from 'vitest';
import {
  classifyMediaError,
  formatClock,
  pickRecordingMime,
  RecorderError,
  recordingSupport,
  storedMime,
  VoiceRecorder,
  voiceFilename,
  type MediaRecorderLike,
  type MeterLike,
  type RecorderEnd,
  type RecorderEnv,
  type StreamLike,
} from '../../src/lib/client/recording/recorder.ts';

describe('MIME selection', () => {
  const cases: [string[], string | null][] = [
    [['audio/webm;codecs=opus', 'audio/mp4'], 'audio/webm;codecs=opus'],
    [['audio/mp4', 'audio/ogg;codecs=opus'], 'audio/mp4'],
    [['audio/ogg;codecs=opus'], 'audio/ogg;codecs=opus'],
    [['audio/webm'], null], // bare webm is not a listed candidate
    [[], null],
  ];
  it.each(cases)('%j -> %s', (supported, expected) => {
    expect(pickRecordingMime((m) => supported.includes(m))).toBe(expected);
  });
  it('strips codec parameters for the stored MIME', () => {
    expect(storedMime('audio/webm;codecs=opus')).toBe('audio/webm');
    expect(storedMime('Audio/MP4; codecs=mp4a.40.2')).toBe('audio/mp4');
    expect(storedMime('audio/ogg')).toBe('audio/ogg');
  });
});

describe('filename and clock', () => {
  it('formats the name in the app timezone, not the host timezone', () => {
    const at = Date.UTC(2025, 0, 31, 23, 5, 9);
    expect(voiceFilename(at, 'UTC', 'audio/webm;codecs=opus')).toBe(
      'voice-20250131-230509.webm',
    );
    // Asia/Shanghai is UTC+8: next day, 07:05:09.
    expect(voiceFilename(at, 'Asia/Shanghai', 'audio/mp4')).toBe(
      'voice-20250201-070509.m4a',
    );
    expect(voiceFilename(at, 'America/Los_Angeles', 'audio/ogg')).toBe(
      'voice-20250131-150509.ogg',
    );
  });
  it('uses 24-hour time at midnight', () => {
    const at = Date.UTC(2025, 5, 1, 0, 0, 0);
    expect(voiceFilename(at, 'UTC', 'audio/webm')).toBe(
      'voice-20250601-000000.webm',
    );
  });
  it('formats m:ss', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(59.9)).toBe('0:59');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(600)).toBe('10:00');
    expect(formatClock(-3)).toBe('0:00');
  });
});

describe('error classification', () => {
  it.each([
    ['NotAllowedError', 'denied'],
    ['SecurityError', 'denied'],
    ['NotFoundError', 'no-device'],
    ['OverconstrainedError', 'no-device'],
    ['NotReadableError', 'busy'],
    ['AbortError', 'busy'],
    ['TypeError', 'unsupported'],
    ['Whatever', 'failed'],
  ])('%s -> %s', (name, code) => {
    expect(classifyMediaError({ name })).toBe(code);
  });
  it('tolerates non-errors', () => {
    expect(classifyMediaError(null)).toBe('failed');
    expect(classifyMediaError('x')).toBe('failed');
  });
});

type FakeRecorder = MediaRecorderLike & {
  emit(kind: 'data' | 'error', payload?: string | number): void;
};
interface FakeOptions {
  supported?: string[];
  secure?: boolean;
  media?: boolean;
  getUserMedia?: () => Promise<StreamLike>;
  meter?: () => MeterLike;
}

/** A manual clock plus fake browser objects. */
function fakes(options: FakeOptions = {}) {
  let clock = 0;
  let nextTimer = 1;
  const timeouts = new Map<number, { at: number; run: () => void }>();
  const intervals = new Map<
    number,
    { every: number; next: number; run: () => void }
  >();
  const log = {
    trackStops: 0,
    meterClosed: 0,
    streams: 0,
    pauses: 0,
    resumes: 0,
    recorderStops: 0,
    started: 0,
    mimeTypes: [] as string[],
  };
  const holder: { recorder: FakeRecorder | null } = { recorder: null };
  const ended: (() => void)[] = [];
  const stream = (): StreamLike => {
    log.streams++;
    return {
      getTracks: () => [
        {
          stop: () => void log.trackStops++,
          addEventListener: (_: 'ended', l: () => void) => void ended.push(l),
        },
      ],
    };
  };
  const env: RecorderEnv = {
    isSecureContext: options.secure ?? true,
    hasMediaRecorder: options.media ?? true,
    isTypeSupported: (m) =>
      (options.supported ?? ['audio/webm;codecs=opus']).includes(m),
    getUserMedia: options.getUserMedia ?? (async () => stream()),
    createRecorder: (_stream, mimeType) => {
      log.mimeTypes.push(mimeType);
      const rec: FakeRecorder = {
        ondataavailable: null,
        onerror: null,
        onstop: null,
        start() {
          log.started++;
        },
        stop() {
          log.recorderStops++;
          // Browsers emit one last chunk, then stop.
          queueMicrotask(() => {
            rec.emit('data', 'final');
            rec.onstop?.();
          });
        },
        pause() {
          log.pauses++;
        },
        resume() {
          log.resumes++;
        },
        emit(kind, payload = 'x') {
          if (kind === 'data')
            rec.ondataavailable?.({
              data: new Blob([
                typeof payload === 'number' ? 'x'.repeat(payload) : payload,
              ]),
            });
          else rec.onerror?.({ error: { name: 'UnknownError' } });
        },
      };
      holder.recorder = rec;
      return rec;
    },
    createMeter: () =>
      options.meter
        ? options.meter()
        : { read: () => 0.5, close: () => void log.meterClosed++ },
    now: () => clock,
    wallClock: () => 1_700_000_000_000 + clock,
    setTimeout: (run, ms) => {
      const id = nextTimer++;
      timeouts.set(id, { at: clock + ms, run });
      return id;
    },
    clearTimeout: (id) => void timeouts.delete(id as number),
    setInterval: (run, every) => {
      const id = nextTimer++;
      intervals.set(id, { every, next: clock + every, run });
      return id;
    },
    clearInterval: (id) => void intervals.delete(id as number),
  };
  /** Advance the manual clock, firing timers in order. */
  async function advance(ms: number) {
    const target = clock + ms;
    for (;;) {
      const due = [
        ...[...timeouts.entries()].map(([id, t]) => ({
          id,
          at: t.at,
          kind: 'timeout' as const,
        })),
        ...[...intervals.entries()].map(([id, t]) => ({
          id,
          at: t.next,
          kind: 'interval' as const,
        })),
      ]
        .filter((t) => t.at <= target)
        .sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      clock = due.at;
      if (due.kind === 'timeout') {
        const t = timeouts.get(due.id)!;
        timeouts.delete(due.id);
        t.run();
      } else {
        const t = intervals.get(due.id)!;
        t.next += t.every;
        t.run();
      }
      await Promise.resolve();
    }
    clock = target;
    await new Promise((resolve) => setImmediate(resolve));
  }
  return {
    env,
    log,
    advance,
    recorder: () => holder.recorder!,
    unplug: () => ended.forEach((l) => l()),
    timers: () => timeouts.size + intervals.size,
  };
}

const opts = { maxBytes: 50 * 1024 * 1024 };

describe('VoiceRecorder', () => {
  it('records, stops, and returns a clip with its own duration and stored MIME', async () => {
    const f = fakes();
    const states: string[] = [];
    const r = new VoiceRecorder(f.env, opts, {
      onState: (s) => states.push(s),
    });
    await r.start();
    expect(r.state).toBe('recording');
    expect(f.log.mimeTypes).toEqual(['audio/webm;codecs=opus']);
    f.recorder().emit('data', 'hello');
    await f.advance(3_400);
    const clip = await r.stop();
    expect(clip.mime).toBe('audio/webm');
    expect(clip.blob.type).toBe('audio/webm');
    expect(await clip.blob.text()).toBe('hellofinal');
    expect(clip.durationSeconds).toBe(3.4);
    expect(clip.startedAt).toBe(1_700_000_000_000);
    expect(states).toEqual(['starting', 'recording', 'stopped']);
    // Everything released, nothing left running.
    expect(f.log.trackStops).toBe(1);
    expect(f.log.meterClosed).toBe(1);
    expect(f.timers()).toBe(0);
  });

  it('excludes paused time from the duration', async () => {
    const f = fakes();
    const r = new VoiceRecorder(f.env, opts);
    await r.start();
    await f.advance(2_000);
    r.pause();
    expect(r.state).toBe('paused');
    await f.advance(30_000);
    expect(r.elapsedMs).toBe(2_000);
    r.resume();
    await f.advance(1_000);
    f.recorder().emit('data', 'a');
    const clip = await r.stop();
    expect(clip.durationSeconds).toBe(3);
    expect(f.log.pauses).toBe(1);
    expect(f.log.resumes).toBe(1);
  });

  it('can be stopped while paused', async () => {
    const f = fakes();
    const r = new VoiceRecorder(f.env, opts);
    await r.start();
    await f.advance(1_000);
    f.recorder().emit('data', 'a');
    r.pause();
    const clip = await r.stop();
    expect(clip.durationSeconds).toBe(1);
    expect(f.log.trackStops).toBe(1);
  });

  it('reports progress about every 100 ms with a clamped level', async () => {
    const f = fakes({ meter: () => ({ read: () => 7, close() {} }) });
    const seen: { elapsedMs: number; level: number }[] = [];
    const r = new VoiceRecorder(f.env, opts, {
      onProgress: (p) => seen.push(p),
    });
    await r.start();
    await f.advance(350);
    expect(seen.map((p) => p.elapsedMs)).toEqual([100, 200, 300]);
    expect(seen.every((p) => p.level === 1)).toBe(true);
    r.cancel();
  });

  it('stops by itself at 10:00 and keeps the take', async () => {
    const f = fakes();
    const ends: RecorderEnd[] = [];
    const r = new VoiceRecorder(f.env, opts, { onEnd: (e) => ends.push(e) });
    await r.start();
    f.recorder().emit('data', 'abc');
    await f.advance(599_000);
    expect(ends).toHaveLength(0);
    await f.advance(1_000);
    expect(ends).toHaveLength(1);
    expect(ends[0]!.reason).toBe('limit');
    expect(ends[0]!.clip!.durationSeconds).toBe(600);
    expect(await ends[0]!.clip!.blob.text()).toBe('abcfinal');
    expect(r.state).toBe('stopped');
    expect(f.log.trackStops).toBe(1);
    expect(f.timers()).toBe(0);
  });

  it('counts only recorded time toward 10:00 across pauses', async () => {
    const f = fakes();
    const ends: RecorderEnd[] = [];
    const r = new VoiceRecorder(f.env, opts, { onEnd: (e) => ends.push(e) });
    await r.start();
    await f.advance(500_000);
    r.pause();
    await f.advance(3_600_000);
    expect(ends).toHaveLength(0);
    r.resume();
    f.recorder().emit('data', 'a');
    await f.advance(99_000);
    expect(ends).toHaveLength(0);
    await f.advance(1_000);
    expect(ends[0]!.reason).toBe('limit');
    expect(ends[0]!.clip!.durationSeconds).toBe(600);
  });

  it('honours a custom time limit', async () => {
    const f = fakes();
    const ends: RecorderEnd[] = [];
    const r = new VoiceRecorder(
      f.env,
      { ...opts, maxSeconds: 5 },
      { onEnd: (e) => ends.push(e) },
    );
    await r.start();
    f.recorder().emit('data', 'a');
    await f.advance(5_000);
    expect(ends[0]!.reason).toBe('limit');
  });

  it('enforces the byte cap without leaving a hole', async () => {
    const f = fakes();
    const ends: RecorderEnd[] = [];
    const r = new VoiceRecorder(
      f.env,
      { maxBytes: 10 },
      { onEnd: (e) => ends.push(e) },
    );
    await r.start();
    f.recorder().emit('data', 6);
    f.recorder().emit('data', 6); // would exceed: dropped, take ends
    f.recorder().emit('data', 1); // a smaller later chunk must not be kept
    await f.advance(10);
    expect(ends).toHaveLength(1);
    expect(ends[0]!.reason).toBe('size');
    expect(ends[0]!.clip!.blob.size).toBe(6);
    expect(f.log.trackStops).toBe(1);
  });

  it('keeps captured audio when the recorder fails mid-way', async () => {
    const f = fakes();
    const ends: RecorderEnd[] = [];
    const r = new VoiceRecorder(f.env, opts, { onEnd: (e) => ends.push(e) });
    await r.start();
    f.recorder().emit('data', 'kept');
    await f.advance(2_000);
    f.recorder().emit('error');
    await f.advance(10);
    expect(ends[0]!.reason).toBe('error');
    expect(ends[0]!.error!.code).toBe('failed');
    expect(ends[0]!.clip!.durationSeconds).toBe(2);
    expect(f.log.trackStops).toBe(1);
  });

  it('treats an unplugged device as a failure that keeps the take', async () => {
    const f = fakes();
    const ends: RecorderEnd[] = [];
    const r = new VoiceRecorder(f.env, opts, { onEnd: (e) => ends.push(e) });
    await r.start();
    f.recorder().emit('data', 'kept');
    f.unplug();
    await f.advance(10);
    expect(ends).toHaveLength(1);
    expect(ends[0]!.reason).toBe('error');
    expect(ends[0]!.clip).not.toBeNull();
  });

  it('stop() with no data rejects as empty', async () => {
    const f = fakes();
    const r = new VoiceRecorder(f.env, opts);
    await r.start();
    // The browser emits no chunk at all.
    f.recorder().stop = function (this: MediaRecorderLike) {
      queueMicrotask(() => this.onstop?.());
    };
    await expect(r.stop()).rejects.toMatchObject({ code: 'empty' });
    expect(f.log.trackStops).toBe(1);
    expect(r.state).toBe('stopped');
  });

  it('cancel discards the take and releases everything', async () => {
    const f = fakes();
    const ends: RecorderEnd[] = [];
    const r = new VoiceRecorder(f.env, opts, { onEnd: (e) => ends.push(e) });
    await r.start();
    f.recorder().emit('data', 'secret');
    r.cancel();
    expect(r.state).toBe('idle');
    expect(f.log.trackStops).toBe(1);
    expect(f.log.meterClosed).toBe(1);
    expect(f.timers()).toBe(0);
    await f.advance(700_000);
    expect(ends).toHaveLength(0);
    // Reusable afterwards, and nothing of the old take leaks into the new one.
    await r.start();
    f.recorder().emit('data', 'next');
    const clip = await r.stop();
    expect(await clip.blob.text()).toBe('nextfinal');
  });

  it('cancel while the permission prompt is open releases the stream when it arrives', async () => {
    let grant!: (s: StreamLike) => void;
    const f = fakes({
      getUserMedia: () => new Promise((resolve) => (grant = resolve)),
    });
    const r = new VoiceRecorder(f.env, opts);
    const started = r.start();
    expect(r.state).toBe('starting');
    r.cancel();
    expect(r.state).toBe('idle');
    let stops = 0;
    grant({ getTracks: () => [{ stop: () => void stops++ }] });
    await expect(started).rejects.toMatchObject({ code: 'ended' });
    expect(stops).toBe(1);
    expect(f.log.started).toBe(0);
  });

  it('cancel while stopping lets stop() settle as ended without a clip', async () => {
    const f = fakes();
    const r = new VoiceRecorder(f.env, opts);
    await r.start();
    f.recorder().emit('data', 'x');
    const stopped = r.stop();
    r.cancel();
    await expect(stopped).rejects.toMatchObject({ code: 'ended' });
    expect(f.log.trackStops).toBe(1);
  });

  it('a user stop racing an automatic end yields one clip only', async () => {
    const f = fakes();
    const ends: RecorderEnd[] = [];
    const r = new VoiceRecorder(f.env, opts, { onEnd: (e) => ends.push(e) });
    await r.start();
    f.recorder().emit('data', 'x');
    await f.advance(599_999);
    const racing = f.advance(1); // limit fires synchronously; its stop is in flight
    await expect(r.stop()).rejects.toMatchObject({ code: 'ended' });
    await racing;
    expect(ends).toHaveLength(1);
  });

  it('maps getUserMedia failures and starts nothing', async () => {
    for (const [name, code] of [
      ['NotAllowedError', 'denied'],
      ['NotFoundError', 'no-device'],
      ['NotReadableError', 'busy'],
    ] as const) {
      const f = fakes({
        getUserMedia: () =>
          Promise.reject(Object.assign(new Error(), { name })),
      });
      const r = new VoiceRecorder(f.env, opts);
      await expect(r.start()).rejects.toMatchObject({ code });
      expect(r.state).toBe('idle');
      expect(f.log.started).toBe(0);
    }
  });

  it('refuses insecure and unsupported environments before asking for the microphone', async () => {
    const cases: [FakeOptions, string][] = [
      [{ secure: false }, 'insecure'],
      [{ media: false }, 'unsupported'],
      [{ supported: [] }, 'unsupported'],
    ];
    for (const [o, code] of cases) {
      const f = fakes(o);
      expect(recordingSupport(f.env)).toBe(code);
      const r = new VoiceRecorder(f.env, opts);
      await expect(r.start()).rejects.toMatchObject({ code });
      expect(f.log.streams).toBe(0);
    }
    expect(recordingSupport(fakes().env)).toBeNull();
  });

  it('releases the microphone if the MediaRecorder cannot start', async () => {
    const f = fakes();
    const create = f.env.createRecorder;
    f.env.createRecorder = (s, m) => {
      const rec = create(s, m);
      rec.start = () => {
        throw Object.assign(new Error(), { name: 'NotSupportedError' });
      };
      return rec;
    };
    const r = new VoiceRecorder(f.env, opts);
    await expect(r.start()).rejects.toBeInstanceOf(RecorderError);
    expect(f.log.trackStops).toBe(1);
    expect(r.state).toBe('idle');
  });

  it('a failing level meter never fails the recording', async () => {
    const f = fakes({
      meter: () => ({
        read() {
          throw new Error('nope');
        },
        close() {
          throw new Error('nope');
        },
      }),
    });
    const levels: number[] = [];
    const r = new VoiceRecorder(f.env, opts, {
      onProgress: (p) => levels.push(p.level),
    });
    await r.start();
    f.recorder().emit('data', 'x');
    await f.advance(250);
    expect(levels.every((l) => l === 0)).toBe(true);
    await expect(r.stop()).resolves.toBeTruthy();
    expect(f.log.trackStops).toBe(1);
  });

  it('only one take at a time per recorder', async () => {
    const f = fakes();
    const r = new VoiceRecorder(f.env, opts);
    await r.start();
    await expect(r.start()).rejects.toMatchObject({ code: 'busy' });
    r.cancel();
  });
});
