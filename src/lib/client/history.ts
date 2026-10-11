/**
 * Client-only record of whether this tab has navigated inside the app.
 * When true, the previous history entry is a PandaNote view (All notes or a
 * filtered list), so "back" can use history.back() and restore that view.
 */
let navigatedInApp = false;

export function markAppNavigation(): void {
  navigatedInApp = true;
}

export function canReturnInApp(): boolean {
  return navigatedInApp;
}
