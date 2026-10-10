import { expect, it } from 'vitest';
import {
  newSession,
  commandForSession,
  remapImageReferences,
} from '../../src/lib/client/editor/model.ts';
import {
  postingAttemptSchema,
  commandDigest,
  sha256,
  type PostingAttempt,
} from '../../src/lib/client/uploads/attempt.ts';
import {
  runPosting,
  PostingError,
  type PostingTransport,
} from '../../src/lib/client/uploads/protocol.ts';
import {
  timelineInput,
  timelineInstant,
} from '../../src/lib/client/uploads/date.ts';
import type { ReadyAttachment } from '../../src/lib/shared/attachments.ts';
const result = {
  noteId: crypto.randomUUID(),
  revision: 1,
  status: 'published' as const,
  deleted: false,
};
async function fixture() {
  const id = crypto.randomUUID();
  const command = commandForSession(
    {
      ...newSession(),
      bodyMarkdown: '香港',
      attachments: [
        {
          id,
          source: 'local',
          kind: 'file',
          filename: 'quiet.txt',
          mime: 'text/plain',
          size: 5,
        },
      ],
    },
    crypto.randomUUID(),
  );
  const blob = new Blob(['exact']);
  const attempt = postingAttemptSchema.parse({
    command,
    manifest: {
      mutationId: command.mutationId,
      requestDigest: await commandDigest(command),
      items: [
        {
          id,
          filename: 'quiet.txt',
          incomingBytes: blob.size,
          incomingDigest: await sha256(blob),
        },
      ],
    },
    phase: 'frozen',
    batchId: null,
    readyIds: [],
    result: null,
  });
  let saved = attempt;
  const ready: ReadyAttachment = {
    id,
    kind: 'file',
    filename: 'quiet.txt',
    mime: 'application/octet-stream',
    incomingBytes: blob.size,
    readiness: 'ready',
    storedBytes: blob.size,
    width: null,
    height: null,
    thumbnailWidth: null,
    thumbnailHeight: null,
  };
  const calls: string[] = [];
  const transport: PostingTransport = {
    async initialize() {
      calls.push('initialize');
      return {
        state: 'batch',
        batch: { id: crypto.randomUUID(), status: 'pending', attachments: [] },
      };
    },
    async upload(_batch, _id, bytes, progress) {
      expect(await bytes.text()).toBe('exact');
      progress(bytes.size);
      calls.push('upload');
      return ready;
    },
    async commit() {
      calls.push('commit');
      return result;
    },
  };
  return {
    id,
    blob,
    attempt,
    ready,
    calls,
    transport,
    persist: async (value: PostingAttempt) => {
      saved = value;
    },
    get saved() {
      return saved;
    },
  };
}
it('persists uploading/readiness/commit/confirmation and reports byte progress', async () => {
  const f = await fixture();
  const states: string[] = [];
  expect(
    await runPosting(
      f.attempt,
      async () => f.blob,
      async (attempt) => {
        states.push(attempt.phase);
        await f.persist(attempt);
      },
      () => {},
      f.transport,
    ),
  ).toEqual(result);
  expect(f.calls).toEqual(['initialize', 'upload', 'commit']);
  expect(states).toEqual(['uploading', 'uploading', 'committing', 'confirmed']);
  expect(f.saved.result).toEqual(result);
});
it('lost commit response retries receipt first without reading or reuploading missing local bytes', async () => {
  const f = await fixture();
  f.transport.commit = async () => {
    throw new Error('response lost');
  };
  await expect(
    runPosting(
      f.attempt,
      async () => f.blob,
      f.persist,
      () => {},
      f.transport,
    ),
  ).rejects.toThrow('lost');
  expect(f.saved.phase).toBe('committing');
  f.transport.initialize = async () => ({ state: 'confirmed', result });
  expect(
    await runPosting(
      f.saved,
      async () => {
        throw new Error('must not read');
      },
      f.persist,
      () => {},
      f.transport,
    ),
  ).toEqual(result);
  expect(f.calls).toEqual(['initialize', 'upload']);
});
it('queries authoritative readiness on retry and never retransmits a completed file', async () => {
  const f = await fixture();
  f.transport.initialize = async () => ({
    state: 'batch',
    batch: {
      id: crypto.randomUUID(),
      status: 'pending',
      attachments: [f.ready],
    },
  });
  await runPosting(
    f.attempt,
    async () => undefined,
    f.persist,
    () => {},
    f.transport,
  );
  expect(f.calls).toEqual(['commit']);
});
it('retains frozen payload on upload/persistence failures and rejects same-size changed bytes', async () => {
  const f = await fixture();
  await expect(
    runPosting(
      f.attempt,
      async () => new Blob(['wrong']),
      f.persist,
      () => {},
      f.transport,
    ),
  ).rejects.toThrow(/missing or changed/);
  expect(f.calls).toEqual(['initialize']);
  await expect(
    runPosting(
      f.attempt,
      async () => f.blob,
      async () => {
        throw new Error('quota');
      },
      () => {},
      f.transport,
    ),
  ).rejects.toThrow('quota');
  expect(f.calls).toEqual(['initialize', 'initialize']);
  f.transport.upload = async () => {
    throw new Error('offline');
  };
  await expect(
    runPosting(
      f.attempt,
      async () => f.blob,
      f.persist,
      () => {},
      f.transport,
    ),
  ).rejects.toThrow('offline');
  expect(f.saved.command).toEqual(f.attempt.command);
});
it('rejects damaged digests before network and requires receipt recheck after restore', async () => {
  const f = await fixture();
  await expect(
    runPosting(
      {
        ...f.attempt,
        manifest: { ...f.attempt.manifest, requestDigest: '0'.repeat(64) },
      },
      async () => f.blob,
      f.persist,
      () => {},
      f.transport,
    ),
  ).rejects.toThrow(/damaged/);
  expect(f.calls).toEqual([]);
  await expect(
    runPosting(
      { ...f.attempt, phase: 'confirmed', result },
      async () => f.blob,
      f.persist,
      () => {},
      f.transport,
    ),
  ).rejects.toThrow(/restore/);
});
it('surfaces server validation/stale-tag/conflict messages without changing frozen content', async () => {
  const f = await fixture();
  f.transport.commit = async () => {
    throw new PostingError({
      code: 'validation',
      message: 'Retired tag requires resolution',
    });
  };
  await expect(
    runPosting(
      f.attempt,
      async () => f.blob,
      f.persist,
      () => {},
      f.transport,
    ),
  ).rejects.toThrow(/Retired tag/);
  expect(f.saved.command).toEqual(f.attempt.command);
});
it('commands choose create/update with original explicit dates and revisions', () => {
  const session = { ...newSession(1234), bodyMarkdown: 'quiet' };
  expect(commandForSession(session, crypto.randomUUID()).action).toBe('create');
  const base = {
    noteId: crypto.randomUUID(),
    revision: 7,
    snapshotDigest: '0'.repeat(64),
  };
  const command = commandForSession(
    { ...session, kind: 'edit', serverBase: base },
    crypto.randomUUID(),
  );
  expect(command).toMatchObject({
    action: 'update',
    noteId: base.noteId,
    expectedRevision: 7,
    content: { timelineAt: 1234 },
  });
});
it('copies remap only real Markdown image nodes/definitions and date entry rejects DST ambiguity/future times', () => {
  const id = crypto.randomUUID();
  const replacement = crypto.randomUUID();
  const source = `![alt](attachment:${id})\n\n![ref][a]\n\n[a]: attachment:${id}\n\n\`attachment:${id}\``;
  const copied = remapImageReferences(source, new Map([[id, replacement]]));
  expect(copied).toContain(`![alt](attachment:${replacement})`);
  expect(copied).toContain(`[a]: attachment:${replacement}`);
  expect(copied).toContain(`\`attachment:${id}\``);
  expect(timelineInput(0, 'Asia/Hong_Kong')).toBe('1970-01-01T08:00:00');
  expect(timelineInstant('1970-01-01T08:00:00', 'Asia/Hong_Kong')).toBe(0);
  expect(() =>
    timelineInstant('2024-03-10T02:30', 'America/New_York'),
  ).toThrow();
  expect(() =>
    timelineInstant('2024-11-03T01:30', 'America/New_York'),
  ).toThrow();
  expect(() => timelineInstant('2099-01-01T00:00', 'UTC', 0)).toThrow(
    /now or earlier/,
  );
});
