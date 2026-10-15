import { tr } from '#lib/client/i18n-current.ts';
import type { Nodes } from 'mdast';
import type { NoteSnapshot } from '#lib/shared/domain.ts';
import { isVoiceMime } from '#lib/shared/attachments.ts';
import type { NoteContent, NoteMutation } from '#lib/shared/notes.ts';
import type { TagAcknowledgement } from '#lib/shared/tags.ts';
import type { PostingAttempt } from '../uploads/attempt.ts';
import { parseMarkdown } from '#lib/shared/markdown/parse.ts';

export interface EditorAttachment {
  id: string;
  source: 'local' | 'server';
  /** `audio` is a voice clip (client-side classification of a server `file`). */
  kind: 'image' | 'file' | 'audio';
  filename: string;
  mime: string;
  size: number;
  /** Recorder's own duration in seconds; local clips only, display only. */
  durationSeconds?: number;
  /** Local clips: the meter heard no sound during the take (probably no voice). */
  silent?: boolean;
}
/** Server attachments are `image` or `file`; audio containers stored for a voice clip are `file`s. */
export function editorKind(file: {
  kind: 'image' | 'file';
  mime: string;
}): EditorAttachment['kind'] {
  return file.kind === 'file' && isVoiceMime(file.mime) ? 'audio' : file.kind;
}
export interface EditorSession {
  localId: string;
  kind: 'new' | 'edit';
  serverBase: {
    noteId: string;
    revision: number;
    snapshotDigest: string;
  } | null;
  bodyMarkdown: string;
  timelineAt: number;
  attachments: EditorAttachment[];
  tagAcknowledgements?: TagAcknowledgement[];
  /** At most one label; null means none. Local-only until Post/Save. */
  labelId: string | null;
  postingAttempt?: PostingAttempt;
}
export function newSession(now = Date.now()): EditorSession {
  return {
    localId: crypto.randomUUID(),
    kind: 'new',
    serverBase: null,
    bodyMarkdown: '',
    timelineAt: now,
    attachments: [],
    labelId: null,
  };
}
export function hasSessionContent(session: EditorSession | null): boolean {
  return Boolean(
    session &&
    (session.bodyMarkdown.trim() ||
      session.attachments.length ||
      session.labelId),
  );
}
export function sessionFingerprint(session: EditorSession): string {
  return JSON.stringify([
    session.kind,
    session.serverBase,
    session.bodyMarkdown,
    session.timelineAt,
    session.attachments,
    session.tagAcknowledgements ?? [],
    session.labelId,
  ]);
}
export function isSessionDirty(
  session: EditorSession | null,
  cleanSnapshot: string | null,
): boolean {
  if (!session) return false;
  // A new empty editor needs no prompt, even after typing then deleting its text.
  if (session.kind === 'new' && !hasSessionContent(session)) return false;
  return sessionFingerprint(session) !== cleanSnapshot;
}
export function commandForSession(
  session: EditorSession,
  mutationId: string,
): Extract<NoteMutation, { content: NoteContent }> {
  const content: NoteContent = {
    bodyMarkdown: session.bodyMarkdown,
    timelineAt: session.timelineAt,
    attachmentIds: session.attachments.map((a) => a.id),
    labelId: session.labelId,
    ...(session.tagAcknowledgements?.length
      ? { tagAcknowledgements: session.tagAcknowledgements }
      : {}),
  };
  if (session.kind === 'new') return { action: 'create', mutationId, content };
  if (!session.serverBase) throw new Error(tr('model.completeSnapshot'));
  return {
    action: 'update',
    mutationId,
    noteId: session.serverBase.noteId,
    expectedRevision: session.serverBase.revision,
    content,
  };
}
export function assertEditableSnapshot(note: NoteSnapshot): void {
  if (note.status === 'trash') throw new Error(tr('model.restoreFirst'));
  if (
    note.attachmentIds.length !== (note.attachments ?? []).length ||
    note.attachmentIds.some((id, i) => note.attachments?.[i]?.id !== id)
  )
    throw new Error(tr('model.metadataIncomplete'));
}

/** Remap parsed image destinations only; code, labels and unrelated text stay intact. */
export function remapImageReferences(
  source: string,
  ids: Map<string, string>,
): string {
  const spans: { start: number; end: number; value: string }[] = [];
  function visit(node: Nodes) {
    if (node.type === 'image' || node.type === 'definition') {
      const replacement = ids.get(node.url.replace(/^attachment:/, ''));
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (
        replacement &&
        node.url.startsWith('attachment:') &&
        start !== undefined &&
        end !== undefined
      ) {
        const raw = source.slice(start, end);
        let depth = 0;
        let cursor = raw.indexOf('[');
        for (; cursor < raw.length; cursor++) {
          if (raw[cursor] === '\\') {
            cursor++;
            continue;
          }
          if (raw[cursor] === '[') depth++;
          if (raw[cursor] === ']' && --depth === 0) {
            cursor++;
            break;
          }
        }
        if (raw[cursor] === (node.type === 'image' ? '(' : ':')) cursor++;
        while (/\s/.test(raw[cursor] ?? '') && cursor < raw.length) cursor++;
        if (raw[cursor] === '<') cursor++;
        const destination = raw.slice(cursor).match(/^[^\s>)]+/)?.[0] ?? '';
        if (
          destination.replace(
            /\\([\\!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~])/g,
            '$1',
          ) === node.url
        )
          spans.push({
            start: start + cursor,
            end: start + cursor + destination.length,
            value: `attachment:${replacement}`,
          });
      }
    }
    if ('children' in node) node.children.forEach(visit);
  }
  visit(parseMarkdown(source));
  for (const span of spans.sort((a, b) => b.start - a.start))
    source = source.slice(0, span.start) + span.value + source.slice(span.end);
  return source;
}
/** Remove image nodes, including reference images. The first CommonMark definition wins. */
export function removeImageReferences(source: string, id: string): string {
  const tree = parseMarkdown(source);
  const definitions = new Map<string, string>();
  const spans: [number, number][] = [];
  function definitionsIn(node: Nodes) {
    if (node.type === 'definition' && !definitions.has(node.identifier))
      definitions.set(node.identifier, node.url);
    if ('children' in node) node.children.forEach(definitionsIn);
  }
  definitionsIn(tree);
  function visit(node: Nodes) {
    if (
      (node.type === 'image' && node.url === `attachment:${id}`) ||
      (node.type === 'imageReference' &&
        definitions.get(node.identifier) === `attachment:${id}`)
    ) {
      const start = node.position?.start.offset,
        end = node.position?.end.offset;
      if (start !== undefined && end !== undefined) spans.push([start, end]);
    }
    if ('children' in node) node.children.forEach(visit);
  }
  visit(tree);
  for (const [start, end] of spans.sort((a, b) => b[0] - a[0]))
    source = source.slice(0, start) + source.slice(end);
  return source;
}
