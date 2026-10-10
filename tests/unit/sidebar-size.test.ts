import { describe, expect, it } from 'vitest';
import {
  clampSidebarWidth,
  DEFAULT_SIDEBAR_WIDTH,
  sidebarMaximum,
} from '../../src/lib/client/sidebar-size.ts';

describe('desktop sidebar resizing', () => {
  it('starts at 272px and clamps dragging in both directions', () => {
    expect(DEFAULT_SIDEBAR_WIDTH).toBe(272);
    expect(clampSidebarWidth(100, 1440)).toBe(240);
    expect(clampSidebarWidth(900, 1440)).toBe(480);
    expect(clampSidebarWidth(320.6, 1440)).toBe(321);
  });
  it('leaves a usable main column on narrower desktops', () => {
    expect(sidebarMaximum(900)).toBe(420);
    expect(clampSidebarWidth(480, 900)).toBe(420);
    expect(clampSidebarWidth(272, 390)).toBe(240);
  });
});
