import { Temporal } from '@js-temporal/polyfill';
import { z } from 'zod';
import { languages } from './i18n/registry.ts';

export const siteTitleSchema = z
  .string()
  .trim()
  .refine(
    (value) =>
      [...value].length >= 1 &&
      [...value].length <= 60 &&
      ![...value].some(
        (c) =>
          c.codePointAt(0)! < 32 ||
          (c.codePointAt(0)! >= 127 && c.codePointAt(0)! <= 159),
      ),
    'Use 1–60 characters without control characters.',
  );
export const languageSchema = z.enum(
  languages.map((language) => language.code),
);

export const settingsSchema = z.strictObject({
  schemaVersion: z.literal(1),
  siteTitle: siteTitleSchema,
  language: languageSchema,
  setupCompletedAt: z
    .number()
    .int()
    .min(0)
    .max(Number.MAX_SAFE_INTEGER)
    .nullable(),
  timezone: z
    .string()
    .max(100)
    .refine((value) => {
      // Require a named timezone, not a fixed offset. Temporal validates IANA data.
      if (/^[+-]/.test(value)) return false;
      try {
        Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(value);
        return true;
      } catch {
        return false;
      }
    }, 'Use a valid IANA timezone'),
  theme: z.enum(['system', 'light', 'dark']),
  density: z.enum(['comfortable', 'compact']),
  collapseLongNotes: z.boolean(),
  weekStart: z.union([z.literal(1), z.literal(0)]),
  sessionLifetimeDays: z.number().int().min(1).max(30),
  imageInputMaxBytes: z
    .number()
    .int()
    .min(1024)
    .max(100 * 1024 * 1024),
  fileMaxBytes: z
    .number()
    .int()
    .min(1024)
    .max(500 * 1024 * 1024),
  imageMaxPixels: z.number().int().min(1).max(50_000_000),
  displayMaxEdge: z.number().int().min(1).max(4096),
  displayQuality: z.number().int().min(1).max(100),
  thumbnailMaxEdge: z.number().int().min(1).max(1024),
  thumbnailQuality: z.number().int().min(1).max(100),
  markdownMaxBytes: z
    .number()
    .int()
    .min(1)
    .max(1024 * 1024),
  maxAttachmentsPerNote: z.number().int().min(1).max(100),
});
export type AppSettings = z.infer<typeof settingsSchema>;
// UTC until S11 Settings explicitly accepts the browser's proposal/manual choice.
// Do not derive this from the VPS timezone or overwrite it at runtime.
export const DEFAULT_SETTINGS: Readonly<AppSettings> = Object.freeze(
  settingsSchema.parse({
    schemaVersion: 1,
    siteTitle: 'PandaNote',
    language: 'en',
    setupCompletedAt: null,
    timezone: 'UTC',
    theme: 'system',
    density: 'comfortable',
    collapseLongNotes: true,
    weekStart: 1,
    sessionLifetimeDays: 7,
    imageInputMaxBytes: 20 * 1024 * 1024,
    fileMaxBytes: 50 * 1024 * 1024,
    imageMaxPixels: 50_000_000,
    displayMaxEdge: 2560,
    displayQuality: 85,
    thumbnailMaxEdge: 480,
    thumbnailQuality: 75,
    markdownMaxBytes: 1024 * 1024,
    maxAttachmentsPerNote: 100,
  }),
);
