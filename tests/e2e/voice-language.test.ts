import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import {
  authenticatedHeaders,
  browserSession,
} from '../helpers/browser-session.ts';
import { clipRows, fakeMicrophone, recordClip } from '../helpers/voice.ts';

/* VN06: every recorder, limit and display message in Simplified Chinese, in a real
 * browser. The shared fixture is restored to English even when a step fails. */
test.use(fakeMicrophone);

const origin = 'http://127.0.0.1:4173';

async function setLanguage(page: Page, language: 'en' | 'zh-CN') {
  const response = await page.request.patch('/api/settings/general', {
    headers: await authenticatedHeaders(page),
    data: { language, siteTitle: 'PandaNote' },
  });
  expect(response.status(), origin).toBe(200);
}

test.describe.configure({ mode: 'serial' });
test.afterEach(async ({ page }) => {
  await browserSession(page);
  await setLanguage(page, 'en');
});

test('recorder strip, status, clip rows and errors are Simplified Chinese', async ({
  page,
}) => {
  await browserSession(page);
  await setLanguage(page, 'zh-CN');
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  const composer = page.getByTestId('composer');
  const record = composer.getByRole('button', { name: '录制语音' });
  await expect(record).toHaveAttribute('title', '语音');
  await composer.getByRole('textbox', { name: '笔记文本' }).fill('语音测试');

  // Too short: the take ends before the 0.5 s minimum.
  await record.click();
  const strip = composer.getByRole('group', { name: '语音录制' });
  await expect(strip).toHaveAttribute('data-state', 'recording');
  await strip.getByRole('button', { name: '停止并添加语音' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: '录音太短，未添加片段。' }),
  ).toBeVisible();

  // A normal take: strip labels, Post blocked, announcements, pause/resume.
  await record.click();
  await expect(strip).toContainText('录音中');
  await expect(strip.getByRole('meter', { name: '麦克风音量' })).toBeVisible();
  await expect(
    composer.getByRole('button', { name: '请先停止录音' }),
  ).toBeDisabled();
  await expect(
    composer.getByRole('status').filter({ hasText: '已开始录音' }),
  ).toBeAttached();
  await strip.getByRole('button', { name: '暂停' }).click();
  await expect(strip).toContainText('已暂停');
  await expect(
    composer.getByRole('status').filter({ hasText: '录音已暂停' }),
  ).toBeAttached();
  await strip.getByRole('button', { name: '继续' }).click();
  await expect(strip).toContainText('录音中');
  await expect(strip.getByTestId('voice-timer')).not.toHaveText('0:00');
  await strip.getByRole('button', { name: '停止并添加语音' }).click();
  await expect(
    composer.getByRole('status').filter({ hasText: '已添加语音' }),
  ).toBeAttached();

  // Clip list and rows.
  const list = composer.getByRole('list', { name: '语音（1）' });
  await expect(list).toBeVisible();
  const row = clipRows(composer);
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(/voice-\d{8}-\d{6}\.(webm|ogg|m4a)/);
  await expect(row.getByRole('button', { name: /^播放 voice-/ })).toBeVisible();
  await expect(row.getByRole('button', { name: /^移除 voice-/ })).toBeVisible();
  // The reorder hint (read out for each row) is localized too.
  await expect(
    row.locator('[aria-label*="按 Alt 加方向键可移动"]'),
  ).not.toHaveCount(0);

  // Discard take.
  await record.click();
  await expect(strip).toHaveAttribute('data-state', 'recording');
  await strip.getByRole('button', { name: '放弃本次录音' }).click();
  await expect(strip).toHaveCount(0);
  await expect(
    composer.getByRole('status').filter({ hasText: '已放弃录音' }),
  ).toBeAttached();

  // Navigation guard with a take open.
  await record.click();
  await expect(strip).toHaveAttribute('data-state', 'recording');
  await page.getByRole('link', { name: '回收站', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: '未保存的更改' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: '发布' })).toBeDisabled();
  await dialog.getByRole('button', { name: '放弃' }).click();
});

test('limit, video and capability messages are Simplified Chinese', async ({
  page,
}) => {
  await browserSession(page);
  await setLanguage(page, 'zh-CN');
  await page.goto('/');
  const composer = page.getByTestId('composer');
  const input = page.getByLabel('选择本地文件');
  const record = composer.getByRole('button', { name: '录制语音' });
  const video = {
    name: 'v.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from('video bytes'),
  };

  await recordClip(composer, 'zh-CN');
  await input.setInputFiles(video);
  await expect(
    page.getByRole('alert').filter({
      hasText: '视频不能与照片或其他文件一起添加。请先移除它们。',
    }),
  ).toBeVisible();
  await clipRows(composer)
    .first()
    .getByRole('button', { name: /^移除 / })
    .click();
  await input.setInputFiles(video);
  await record.click();
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: '带视频的笔记不能同时包含语音。' }),
  ).toBeVisible();
});

test('20-clip limit and the 10:00 notice are Simplified Chinese', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.clock.install();
  await browserSession(page);
  await setLanguage(page, 'zh-CN');
  await page.goto('/');
  const composer = page.getByTestId('composer');
  const record = composer.getByRole('button', { name: '录制语音' });
  await record.click();
  const strip = composer.getByRole('group', { name: '语音录制' });
  await expect(strip.getByTestId('voice-timer')).not.toHaveText('0:00');
  await page.clock.fastForward('10:05');
  await expect(strip).toHaveCount(0);
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: '录音已在 10:00 停止，语音已添加。' }),
  ).toBeVisible();

  // The 20-clip limit: seed 19 more through the UI, then one more is refused.
  for (let i = 0; i < 19; i++) {
    await page.clock.resume();
    await recordClip(composer, 'zh-CN');
  }
  await expect(clipRows(composer)).toHaveCount(20);
  await record.click();
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: '一条笔记最多可添加 20 段语音。' }),
  ).toBeVisible();
});

test('denied, missing, insecure and unsupported microphones are Simplified Chinese', async ({
  page,
  browser,
}) => {
  await browserSession(page);
  await setLanguage(page, 'zh-CN');
  const cookies = await page.context().cookies();
  const cases = [
    {
      script: () => {
        navigator.mediaDevices.getUserMedia = () =>
          Promise.reject(new DOMException('x', 'NotAllowedError'));
      },
      alert: '麦克风权限被拒绝。请在浏览器设置中允许后重试。',
    },
    {
      script: () => {
        navigator.mediaDevices.getUserMedia = () =>
          Promise.reject(new DOMException('x', 'NotFoundError'));
      },
      alert: '未找到麦克风。',
    },
    {
      script: () => {
        navigator.mediaDevices.getUserMedia = () =>
          Promise.reject(new DOMException('x', 'NotReadableError'));
      },
      alert: '麦克风正被其他应用或标签页占用。',
    },
    {
      script: () => {
        Object.defineProperty(window, 'isSecureContext', { value: false });
      },
      title: '录音需要安全（HTTPS）连接。',
    },
    {
      script: () => {
        Object.defineProperty(window, 'MediaRecorder', { value: undefined });
      },
      title: '此浏览器无法录音。',
    },
  ];
  for (const item of cases) {
    const context = await browser.newContext({
      permissions: ['microphone'],
      baseURL: origin,
    });
    try {
      await context.addCookies(cookies);
      const other = await context.newPage();
      await other.addInitScript(item.script);
      await other.goto('/');
      const record = other
        .getByTestId('composer')
        .getByRole('button', { name: '录制语音' });
      if (item.title) {
        await expect(record).toBeDisabled();
        await expect(record).toHaveAttribute('title', item.title);
      } else {
        await record.click();
        await expect(
          other.getByRole('alert').filter({ hasText: item.alert }),
        ).toBeVisible();
      }
    } finally {
      await context.close();
    }
  }
});

test('stored clips on cards and the note page use Simplified Chinese labels', async ({
  page,
}) => {
  await browserSession(page);
  await page.goto('/');
  const composer = page.getByTestId('composer');
  const text = `语音显示 ${randomUUID()}`;
  await composer.getByRole('textbox', { name: 'Note text' }).fill(text);
  await recordClip(composer);
  await composer.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(composer.getByTestId('clip-list')).toHaveCount(0);
  const card = page.getByTestId('posted-note').filter({ hasText: text });
  const id = (await card.getAttribute('data-note-id'))!;

  await setLanguage(page, 'zh-CN');
  await page.goto('/');
  const zhCard = page.locator(
    `[data-testid="posted-note"][data-note-id="${id}"]`,
  );
  await expect(zhCard.getByRole('list', { name: '语音' })).toBeVisible();
  await expect(
    zhCard.getByRole('link', { name: /^下载 voice-/ }),
  ).toHaveAttribute('href', /\/file\?download=1$/);
  await page.goto(`/notes/${id}`);
  const detail = page.getByTestId('note-detail');
  await expect(detail.getByRole('list', { name: '语音' })).toBeVisible();
  await expect(
    detail.getByRole('link', { name: /^下载 voice-/ }),
  ).toBeVisible();
  // Inline edit shows the clip list and rows in Chinese.
  await detail.getByRole('button', { name: '编辑', exact: true }).click();
  const editor = page.getByTestId('inline-editor');
  await expect(editor.getByRole('list', { name: '语音（1）' })).toBeVisible();
});

test('a server rejection of a voice clip shows the Simplified Chinese message', async ({
  page,
}) => {
  await browserSession(page);
  // Obtain the server's real rejection (status and body) for flagged non-audio bytes.
  const bytes = Buffer.from('definitely not an audio container');
  const item = {
    id: randomUUID(),
    filename: 'voice-20260101-000000.webm',
    incomingBytes: bytes.length,
    incomingDigest: createHash('sha256').update(bytes).digest('hex'),
    voice: true,
  };
  const headers = await authenticatedHeaders(page);
  const init = await page.request.post('/api/uploads', {
    headers,
    data: {
      mutationId: randomUUID(),
      requestDigest: 'b'.repeat(64),
      items: [item],
    },
  });
  expect(init.status()).toBe(200);
  const batchId = (await init.json()).data.batch.id as string;
  const real = await page.request.put(`/api/uploads/${batchId}/${item.id}`, {
    headers: { ...headers, 'content-type': 'application/octet-stream' },
    data: bytes,
  });
  expect(real.ok()).toBe(false);
  const body = await real.text();
  expect(JSON.parse(body).error.messageKey).toBe('err.theVoiceClipIsNot');
  const status = real.status();

  // Replay it to the browser, which localizes by message key.
  await setLanguage(page, 'zh-CN');
  await page.goto('/');
  const composer = page.getByTestId('composer');
  await recordClip(composer, 'zh-CN');
  await page.route('**/api/uploads/*/*', (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({ status, contentType: 'application/json', body })
      : route.continue(),
  );
  await composer.getByRole('button', { name: '发布', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({
      hasText: '此语音片段不是受支持的音频录音（webm、mp4 或 ogg）。',
    }),
  ).toBeVisible();
  // The clip is kept for a retry.
  await expect(clipRows(composer)).toHaveCount(1);
});
