import type { BuildInfo } from './build-info.ts';

// Replaced by Vite in both SSR and browser bundles; never read at runtime.
declare const __PANDANOTE_BUILD__: BuildInfo;
export const buildInfo: Readonly<BuildInfo> =
  Object.freeze(__PANDANOTE_BUILD__);
