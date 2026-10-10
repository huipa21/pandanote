import { describe, expect, it, vi } from 'vitest';
import { restoreAnchor } from '../../src/lib/client/timeline/scroll.ts';

describe('timeline scroll restoration', () => {
  it('keeps the scrolling composer accessible at the top after layout changes', () => {
    const querySelectorAll = vi.fn();
    const scroller = {
      scrollTop: 25,
      querySelectorAll,
    } as unknown as HTMLElement;
    restoreAnchor(scroller, { id: 'first-note', offset: 150, top: 0 });
    expect(scroller.scrollTop).toBe(0);
    expect(querySelectorAll).not.toHaveBeenCalled();
  });
  it('restores the reading card offset away from the composer', () => {
    const scroller = {
      scrollTop: 1000,
      getBoundingClientRect: () => ({ top: 0 }),
      querySelectorAll: () => [
        {
          dataset: { noteId: 'note' },
          getBoundingClientRect: () => ({ top: -100 }),
        },
      ],
    } as unknown as HTMLElement;
    restoreAnchor(scroller, { id: 'note', offset: -20, top: 500 });
    expect(scroller.scrollTop).toBe(920);
  });
});
