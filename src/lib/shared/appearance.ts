import { z } from 'zod';
import { densitySchema, type AppSettings } from './settings.ts';
import { DEFAULT_LANGUAGE, type Language } from './i18n/registry.ts';

export const appearanceSchema = z.strictObject({
  theme: z.enum(['system', 'light', 'dark']),
  density: densitySchema,
  collapseLongNotes: z.boolean(),
});
export type Appearance = z.infer<typeof appearanceSchema>;
// Header theme controls send only theme; General saves density/collapse.
// Full appearance payloads remain valid for existing API callers.
export const appearanceUpdateSchema = appearanceSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Choose an appearance.');
export function appearanceFrom(settings: AppSettings): Appearance {
  return {
    theme: settings.theme,
    density: settings.density,
    collapseLongNotes: settings.collapseLongNotes,
  };
}
// Enum/boolean/registry-code values only: safe for HTML attributes, never
// user-provided CSS or text.
export function appearanceHtml(
  html: string,
  appearance: Appearance,
  language: Language = DEFAULT_LANGUAGE,
): string {
  return html
    .replace('%pandanote.lang%', language)
    .replace('%pandanote.theme%', appearance.theme)
    .replace('%pandanote.density%', appearance.density)
    .replace('%pandanote.collapse%', String(appearance.collapseLongNotes));
}
