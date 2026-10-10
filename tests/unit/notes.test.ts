import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  canonicalNoteMutation,
  noteMutationSchema,
  type NoteMutation,
} from '../../src/lib/shared/notes.ts';
import { inspectContent } from '../../src/lib/server/notes/content.ts';
import {
  noteErrorResponse,
  readNoteJson,
  MAX_NOTE_JSON_BYTES,
} from '../../src/lib/server/notes/http.ts';

const content = {
  bodyMarkdown: '#Work 香港',
  timelineAt: 1,
  location: null,
  attachmentIds: [],
};
describe('note boundary contracts', () => {
  it('canonical digest input ignores object order/mutation ID but binds operation, target, revision and full content', () => {
    const value: NoteMutation = {
      action: 'update',
      mutationId: randomUUID(),
      noteId: randomUUID(),
      expectedRevision: 1,
      content,
    };
    const canonical = canonicalNoteMutation(value);
    expect(
      canonicalNoteMutation({
        ...value,
        mutationId: randomUUID(),
        content: {
          attachmentIds: [],
          location: null,
          timelineAt: 1,
          bodyMarkdown: '#Work 香港',
        },
      }),
    ).toBe(canonical);
    for (const changed of [
      { ...value, action: 'trash' as const },
      { ...value, expectedRevision: 2 },
      { ...value, noteId: randomUUID() },
      { ...value, content: { ...content, bodyMarkdown: 'different' } },
      { ...value, content: { ...content, timelineAt: 2 } },
      {
        ...value,
        content: {
          ...content,
          location: {
            latitude: 0,
            longitude: 0,
            accuracy: null,
            label: 'manual',
          },
        },
      },
      { ...value, content: { ...content, attachmentIds: [randomUUID()] } },
    ])
      expect(canonicalNoteMutation(changed)).not.toBe(canonical);
    const ids = [randomUUID(), randomUUID()];
    expect(
      canonicalNoteMutation({
        ...value,
        content: { ...content, attachmentIds: ids },
      }),
    ).not.toBe(
      canonicalNoteMutation({
        ...value,
        content: { ...content, attachmentIds: [...ids].reverse() },
      }),
    );
  });
  it('rejects unknown fields, missing revisions/confirmation, duplicate IDs, invalid coordinates and excessive UTF-8 content', () => {
    const base = { action: 'create', mutationId: randomUUID(), content };
    const id = randomUUID();
    for (const bad of [
      { ...base, title: 'not a product field' },
      { ...base, requestDigest: 'a'.repeat(64) },
      { ...base, content: { ...content, attachmentIds: [id, id] } },
      { ...base, content: { ...content, bodyMarkdown: '猫'.repeat(400_000) } },
      {
        ...base,
        content: {
          ...content,
          location: { latitude: 91, longitude: 0, accuracy: null, label: null },
        },
      },
      { action: 'trash', noteId: id, mutationId: randomUUID() },
      {
        action: 'permanent-delete',
        noteId: id,
        mutationId: randomUUID(),
        expectedRevision: 1,
        confirmed: false,
      },
    ])
      expect(noteMutationSchema.safeParse(bad).success).toBe(false);
  });
  it('checks Markdown image nodes and reference definitions without mistaking code for links', () => {
    const id = randomUUID();
    expect(
      inspectContent(
        `![x](attachment:${id})\n![y][img]\n\n[img]: attachment:${id}\n\n\`![code](attachment:bad)\` #Work`,
        new Set([id]),
      ),
    ).toEqual([{ key: 'work', spelling: 'Work' }]);
    for (const body of [
      `![x](attachment:${randomUUID()})`,
      '![x](attachment:bad)',
      '![x](https://attacker.invalid/image)',
      `![x][a]\n\n[a]: attachment:${id}`,
    ])
      expect(() => inspectContent(body, new Set())).toThrow(
        /Every Markdown image/,
      );
    expect(() => inspectContent('#' + 'ﬄ'.repeat(30), new Set())).toThrow(
      /normalized tag/,
    );
  });
  it('streams capped JSON and returns only safe errors', async () => {
    expect(
      await readNoteJson(
        new Request('http://localhost', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ body: '香港' }),
        }),
      ),
    ).toEqual({ body: '香港' });
    for (const body of ['{', 'x'.repeat(MAX_NOTE_JSON_BYTES + 1)])
      await expect(
        readNoteJson(
          new Request('http://localhost', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body,
          }),
        ),
      ).rejects.toMatchObject({ code: 'validation' });
    const response = noteErrorResponse(new Error('SQL private-path secret'));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toMatch(/SQL|private-path|secret|stack/);
  });
});
