import type { Nodes } from 'mdast';
import { z } from 'zod';
import { idSchema } from './domain.ts';
import { parseMarkdown } from './markdown/parse.ts';

/** Shared template rules: pure functions only, no server or browser imports. */

export const TEMPLATE_NAME_MAX_CHARS = 60;

/** A template as the page and the note editor see it. Bodies are small text. */
export interface NoteTemplate {
  id: string;
  name: string;
  bodyMarkdown: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
}

/** Result of a successful create/update/delete. */
export interface TemplateMutationResult {
  templateId: string;
  revision: number;
  deleted: boolean;
}

export interface TemplatePage {
  items: NoteTemplate[];
}

const CONTROL_CHARACTER = /\p{Cc}/u;

/** NFC, trimmed. Null when empty, too long (in code points) or containing controls. */
export function normalizeTemplateName(raw: string): string | null {
  const name = raw.normalize('NFC').trim();
  const chars = [...name].length;
  if (chars < 1 || chars > TEMPLATE_NAME_MAX_CHARS) return null;
  if (CONTROL_CHARACTER.test(name)) return null;
  return name;
}

/** Case-insensitive identity: names differing only by case/width/extra spaces clash. */
export function templateNameKey(name: string): string {
  return name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Stored bodies use LF line endings; leading/trailing blank lines are kept as typed. */
export function normalizeTemplateBody(raw: string): string {
  return raw.replace(/\r\n?/g, '\n');
}

export function isBlankTemplateBody(body: string): boolean {
  return body.trim() === '';
}

/** True when the Markdown links or embeds an attached image/file (`attachment:`). */
export function referencesAttachment(body: string): boolean {
  const visit = (node: Nodes): boolean => {
    if (
      'url' in node &&
      typeof node.url === 'string' &&
      node.url.startsWith('attachment:')
    )
      return true;
    return 'children' in node && node.children.some(visit);
  };
  return visit(parseMarkdown(body));
}

/**
 * Template search: every whitespace-separated term must appear (case-insensitively,
 * after NFKC) in the name or the body. Literal text only, no operators.
 */
export function templateMatches(
  template: Pick<NoteTemplate, 'name' | 'bodyMarkdown'>,
  query: string,
): boolean {
  const terms = query
    .normalize('NFKC')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (!terms.length) return true;
  const haystack = `${template.name}\n${template.bodyMarkdown}`
    .normalize('NFKC')
    .toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

/** Short one-line preview for list rows. */
export function templateExcerpt(body: string, max = 120): string {
  const line =
    body
      .split('\n')
      .map((part) => part.trim())
      .find((part) => part.length > 0) ?? '';
  return [...line].length > max ? `${[...line].slice(0, max).join('')}…` : line;
}

/**
 * Inserts a template at the caret. Non-blank text on either side is separated from
 * the template by one blank line; surrounding newlines in the template are dropped.
 */
export function insertTemplateText(
  source: string,
  start: number,
  end: number,
  body: string,
): { text: string; caret: number } {
  const before = source.slice(0, start);
  const after = source.slice(end);
  const insert = body.replace(/^\n+/, '').replace(/\n+$/, '');
  const lead =
    before.trim() === ''
      ? ''
      : before.endsWith('\n\n')
        ? ''
        : before.endsWith('\n')
          ? '\n'
          : '\n\n';
  const tail =
    after.trim() === ''
      ? ''
      : after.startsWith('\n\n')
        ? ''
        : after.startsWith('\n')
          ? '\n'
          : '\n\n';
  const text = `${before}${lead}${insert}${tail}${after}`;
  return { text, caret: before.length + lead.length + insert.length };
}

/** Wire commands. Names/bodies are re-normalized and checked by the server. */
const revisionSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const nameInput = z.string().max(1000);
const bodyInput = z.string().max(6 * 1024 * 1024);
export const templateCommandSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('create'),
    mutationId: idSchema,
    name: nameInput,
    bodyMarkdown: bodyInput,
  }),
  z.strictObject({
    action: z.literal('update'),
    mutationId: idSchema,
    templateId: idSchema,
    expectedRevision: revisionSchema,
    name: nameInput,
    bodyMarkdown: bodyInput,
  }),
  z.strictObject({
    action: z.literal('delete'),
    mutationId: idSchema,
    templateId: idSchema,
    expectedRevision: revisionSchema,
    confirmed: z.literal(true),
  }),
]);
export type TemplateCommand = z.infer<typeof templateCommandSchema>;
