import type { MonthActivity } from '#lib/shared/calendar.ts';
import type { ApiResult } from '#lib/shared/domain.ts';
export const CALENDAR = Symbol('month calendar');
// One owner serves desktop + drawer, preventing duplicate requests/observer loops.
export class CalendarState {
  month = $state('');
  activity = $state<MonthActivity>();
  error = $state('');
  loading = $state(false);
  private request?: AbortController;
  private generation = 0;
  constructor(initial: MonthActivity) {
    this.month = initial.month;
    this.activity = initial;
  }
  async refresh(initial?: MonthActivity) {
    this.request?.abort();
    const generation = ++this.generation;
    if (initial?.month === this.month) {
      this.activity = initial;
      this.loading = false;
      this.error = '';
      return;
    }
    const month = this.month;
    this.request = new AbortController();
    const request = this.request;
    const timer = setTimeout(() => request.abort(), 15_000);
    this.loading = true;
    this.error = '';
    try {
      const response = await fetch(
        `/api/calendar?month=${encodeURIComponent(month)}`,
        { signal: request.signal },
      );
      const result = (await response.json()) as ApiResult<MonthActivity>;
      if (generation !== this.generation || month !== this.month) return;
      if (!result.ok) throw new Error(result.error.message);
      this.activity = result.data;
    } catch (error) {
      if (generation === this.generation)
        this.error =
          error instanceof Error && error.name !== 'AbortError'
            ? error.message
            : 'Activity could not be loaded. Retry.';
    } finally {
      clearTimeout(timer);
      if (generation === this.generation) this.loading = false;
    }
  }
  dispose() {
    this.generation++;
    this.request?.abort();
  }
}
