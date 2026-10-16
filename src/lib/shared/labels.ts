import { z } from 'zod';
import { idSchema, revisionSchema } from './domain.ts';

/** Shared label rules: pure functions only, no server or browser imports. */

export const LABEL_NAME_MAX_CHARS = 40;
export const MAX_LABELS = 40;

/** Fixed accessible color palette (no free color picker). */
export const LABEL_COLORS = [
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'blue',
  'purple',
  'gray',
] as const;
export type LabelColor = (typeof LABEL_COLORS)[number];

/** Fixed icon set (no upload); a label may also have no icon at all. */
export const LABEL_ICONS = [
  'star',
  'heart',
  'flag',
  'bookmark',
  'folder',
  'briefcase',
  'book',
  'home',
  'warning',
  'info',
  'check-circle',
  'camera',
  'lightbulb',
  'rocket',
  'target',
  'clock',
  'calendar',
  'mail',
  'phone',
  'chat',
  'code',
  'lock',
  'key',
  'chart',
  'trophy',
  'coffee',
  'price-tag',
  'car',
  'plane',
  'leaf',
  'music',
  'gift',
  'cart',
  'umbrella',
  'compass',
  'paw',
] as const;
export type LabelIcon = (typeof LABEL_ICONS)[number];

/** Fixed set of body-text font choices for notes carrying a label; `null` keeps
 * the default UI font (--font-body). No custom font upload/URL. */
export const LABEL_FONTS = ['serif', 'mono', 'rounded'] as const;
export type LabelFont = (typeof LABEL_FONTS)[number];

export interface NoteLabel {
  id: string;
  name: string;
  color: LabelColor;
  icon: LabelIcon | null;
  /** Optional override: note card/detail header background+text (same fixed
   * 8-tint palette as `color`). `null` = no header tint. */
  headerColor: LabelColor | null;
  /** Optional override: note card/detail whole-surface background tint. */
  background: LabelColor | null;
  /** Optional override: note body font. `null` = default UI font. */
  font: LabelFont | null;
  revision: number;
  createdAt: number;
  updatedAt: number;
}

/** A label plus how many published notes currently carry it (sidebar/management page). */
export interface LabelSummary extends NoteLabel {
  noteCount: number;
}

export interface LabelPage {
  items: LabelSummary[];
}

export interface LabelMutationResult {
  labelId: string;
  revision: number;
  deleted: boolean;
}

const CONTROL_CHARACTER = /\p{Cc}/u;

/** NFC, trimmed, internal whitespace collapsed. Null when empty, too long or
 * containing control characters. */
export function normalizeLabelName(raw: string): string | null {
  const name = raw.normalize('NFC').trim().replace(/\s+/g, ' ');
  const chars = [...name].length;
  if (chars < 1 || chars > LABEL_NAME_MAX_CHARS) return null;
  if (CONTROL_CHARACTER.test(name)) return null;
  return name;
}

/** Case/width-insensitive identity: names differing only by case/width/spacing clash. */
export function labelNameKey(name: string): string {
  return name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function isLabelColor(value: string): value is LabelColor {
  return (LABEL_COLORS as readonly string[]).includes(value);
}
export function isLabelIcon(value: string): value is LabelIcon {
  return (LABEL_ICONS as readonly string[]).includes(value);
}
export function isLabelFont(value: string): value is LabelFont {
  return (LABEL_FONTS as readonly string[]).includes(value);
}

/** Wire commands. Names are re-normalized and checked by the server. */
const nameInput = z.string().max(1000);
const colorInput = z.enum(LABEL_COLORS);
const iconInput = z.enum(LABEL_ICONS).nullable();
const optionalColorInput = colorInput.nullable();
const fontInput = z.enum(LABEL_FONTS).nullable();
export const labelCommandSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('create'),
    mutationId: idSchema,
    name: nameInput,
    color: colorInput,
    icon: iconInput,
    headerColor: optionalColorInput,
    background: optionalColorInput,
    font: fontInput,
  }),
  z.strictObject({
    action: z.literal('update'),
    mutationId: idSchema,
    labelId: idSchema,
    expectedRevision: revisionSchema,
    name: nameInput,
    color: colorInput,
    icon: iconInput,
    headerColor: optionalColorInput,
    background: optionalColorInput,
    font: fontInput,
  }),
  z.strictObject({
    action: z.literal('delete'),
    mutationId: idSchema,
    labelId: idSchema,
    expectedRevision: revisionSchema,
    confirmed: z.literal(true),
  }),
]);
export type LabelCommand = z.infer<typeof labelCommandSchema>;
