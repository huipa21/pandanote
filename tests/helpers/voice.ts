import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, type Locator, type Page } from '@playwright/test';

/** Chromium fake microphone: a synthetic tone, with the permission prompt auto-accepted.
 * Pass to `test.use()` (per spec, never in the global config). All voice specs share
 * this exact value, so they share one browser launch. */
export const fakeMicrophone = {
  permissions: ['microphone' as const],
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ],
  },
};

const LABELS = {
  en: { record: 'Record a voice clip', stop: 'Stop and add clip' },
  'zh-CN': { record: '录制语音', stop: '停止并添加语音' },
} as const;

/** Record one clip of at least a second through the real editor controls. */
export async function recordClip(
  scope: Locator,
  language: keyof typeof LABELS = 'en',
) {
  const label = LABELS[language];
  await scope.getByRole('button', { name: label.record }).click();
  const strip = scope.getByTestId('voice-recorder');
  await expect(strip).toHaveAttribute('data-state', 'recording');
  await expect(strip.getByTestId('voice-timer')).not.toHaveText('0:00');
  await strip.getByRole('button', { name: label.stop }).click();
  await expect(strip).toHaveCount(0);
  await acceptClipName(scope);
}

/** Keep the generated name: a freshly stopped take opens its name field; Enter accepts. */
export async function acceptClipName(scope: Locator) {
  const input = scope.getByTestId('clip-name-input');
  await expect(input).toBeVisible();
  await input.press('Enter');
  await expect(input).toHaveCount(0);
}

export const clipRows = (scope: Locator) =>
  scope.getByTestId('clip-list').getByRole('listitem');

/** Count microphone tracks opened by the page and the ones the app stopped. A stopped
 * track is `ended`, which is what turns the browser's recording indicator off. The
 * binding survives navigations, so tracks stopped during sign-out still count. */
export async function trackMicrophone(page: Page) {
  const counts = { opened: 0, stopped: 0 };
  await page.exposeFunction('__micEvent', (kind: string) => {
    if (kind === 'open') counts.opened += 1;
    else counts.stopped += 1;
  });
  await page.addInitScript(() => {
    const devices = navigator.mediaDevices;
    if (!devices) return;
    const notify = (kind: string) =>
      (window as unknown as Record<string, (k: string) => void>).__micEvent?.(
        kind,
      );
    const original = devices.getUserMedia.bind(devices);
    devices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      for (const track of stream.getAudioTracks()) {
        notify('open');
        const stop = track.stop.bind(track);
        let stopped = false;
        track.stop = () => {
          if (!stopped) {
            stopped = true;
            // Synchronous and per tab: a binding call made while the page is being
            // unloaded can be lost, session storage survives the navigation.
            const key = '__micStops';
            sessionStorage.setItem(
              key,
              String(Number(sessionStorage.getItem(key) ?? '0') + 1),
            );
            notify('stop');
          }
          stop();
        };
      }
      return stream;
    };
  });
  return {
    opened: () => counts.opened,
    live: () => counts.opened - counts.stopped,
    /** Stops recorded in this tab's session storage, across page loads. */
    stopsInTab: async () =>
      Number(
        (await page.evaluate(() => sessionStorage.getItem('__micStops'))) ??
          '0',
      ),
  };
}

/** WCAG 2.x A/AA (+2.2 AA) axe violations inside the first element matching `selector`. */
export async function axeViolationsIn(
  page: Page,
  selector: string,
): Promise<string[]> {
  await page.evaluate(
    readFileSync(
      createRequire(import.meta.url).resolve('axe-core/axe.min.js'),
      'utf8',
    ),
  );
  return page.evaluate(async (css) => {
    const axe = (
      window as unknown as {
        axe: {
          run: (
            context: Element,
            options: unknown,
          ) => Promise<{ violations: { id: string; help: string }[] }>;
        };
      }
    ).axe;
    const result = await axe.run(document.querySelector(css)!, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
      },
      resultTypes: ['violations'],
    });
    return result.violations.map((v) => `${v.id}: ${v.help}`);
  }, selector);
}
