import { expect, type Page } from '@playwright/test';

/** Settings sections are tabs; retry the click until hydration selects the tab. */
export async function openSettingsTab(page: Page, name: string) {
  const tab = page.getByRole('tab', { name, exact: true });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true', {
      timeout: 1000,
    });
  }).toPass();
}
