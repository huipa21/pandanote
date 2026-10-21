// Desktop-only bounds keep both the calendar and the reading column usable.
export const DEFAULT_SIDEBAR_WIDTH = 272;
export const MIN_SIDEBAR_WIDTH = 240;
export const MAX_SIDEBAR_WIDTH = 480;
export const SIDEBAR_WIDTH_KEY = 'pandanote:sidebar-width';
const MIN_MAIN_WIDTH = 480;

export function sidebarMaximum(viewportWidth: number): number {
  return Math.max(
    MIN_SIDEBAR_WIDTH,
    Math.min(MAX_SIDEBAR_WIDTH, viewportWidth - MIN_MAIN_WIDTH),
  );
}

export function clampSidebarWidth(
  width: number,
  viewportWidth: number,
): number {
  return Math.round(
    Math.max(MIN_SIDEBAR_WIDTH, Math.min(sidebarMaximum(viewportWidth), width)),
  );
}
