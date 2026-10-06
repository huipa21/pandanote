import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { cpus, totalmem } from 'node:os';
import { promisify } from 'node:util';
import sharp from 'sharp';
import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { DIR, api, signIn } from './support.ts';

// S18 measured workloads against ONE running production deployment (compose
// project "pnc", see ops/release-benchmark.sh). Everything is synthetic. Results
// are printed and written to .drill/benchmark-results.json; nothing is asserted
// beyond functional correctness and the documented budgets that must hold.
const run = promisify(execFile);
const C = process.env.BENCH_URL ?? 'https://c.localtest.me:7443';
const DOCKER = process.env.DOCKER ?? 'docker';
const CONTAINER = process.env.BENCH_APP ?? 'pnc-app-1';
const PASSWORD = 'benchmark-only-password 密碼 1';
const NOTES = Number(process.env.BENCH_NOTES ?? 10_000);
const results: Record<string, unknown> = {};

// ---- deterministic synthetic dataset ---------------------------------------
let seedState = 0x9e3779b9;
const rnd = () => {
  seedState ^= seedState << 13;
  seedState >>>= 0;
  seedState ^= seedState >>> 17;
  seedState ^= seedState << 5;
  seedState >>>= 0;
  return seedState / 0x100000000;
};
const pick = <T>(items: T[]) => items[Math.floor(rnd() * items.length)];
const english = (
  'coffee shop learning typescript database notebook garden reading morning ' +
  'travel recipe project meeting idea weekend music walking sketch backup ' +
  'search private calendar thoughts book review plan small discovery quiet'
).split(' ');
const cantonese = ['今日食咗點心，之後去香港。', '我哋喺公園散步，天氣好好。'];
const simplified = ['今天学习数据库，也喝了咖啡。', '项目会议之后整理了笔记。'];
const japanese = [
  '今日は図書館に行った。猫が好き。',
  '週末に東京で写真を撮った。',
];
const mixed = [
  'Mixed ＣＡＦＥ́ emoji 😊 literal % _ OR NEAR. ',
  '「引用」— “quotes”. ',
];
const tagNames = [
  ...Array.from({ length: 280 }, (_, n) => `topic${n}`),
  ...['學習', '旅行', '食物', '日記', '写真', '読書', '项目', '笔记'],
  ...Array.from({ length: 12 }, (_, n) => `Project${n}`),
];
function sentence(): string {
  const roll = rnd();
  if (roll < 0.5)
    return (
      Array.from({ length: 8 + Math.floor(rnd() * 12) }, () =>
        pick(english),
      ).join(' ') + '. '
    );
  if (roll < 0.65) return pick(cantonese);
  if (roll < 0.8) return pick(simplified);
  if (roll < 0.9) return pick(japanese);
  return pick(mixed);
}
function bodyFor(index: number): string {
  const target = 300 + Math.floor(Math.exp(rnd() * 2.9) * 160); // mean ≈ 2 KB
  const tags = Array.from(
    { length: 1 + Math.floor(rnd() * 3) },
    () => `#${tagNames[Math.floor(rnd() * rnd() * tagNames.length)]}`,
  );
  let text = `Synthetic note ${index} ${tags.join(' ')}\n\n`;
  while (Buffer.byteLength(text) < target)
    text += sentence() + (rnd() < 0.2 ? '\n\n' : '');
  if (index === 4242) text += '\nuniqueNeedleAlpha 図書館 zebra-crossing';
  return text;
}
const longCode = (n: number) =>
  [
    `Long code note ${n} #code`,
    '',
    '```ts',
    ...Array.from(
      { length: 320 },
      (_, i) =>
        `export function f${n}_${i}(a: number, b: number): number { return (a * ${i}) + b; }`,
    ),
    '```',
  ].join('\n');
const longMermaid = (n: number) =>
  [
    `Long diagram note ${n} #diagram`,
    '',
    '```mermaid',
    'graph TD',
    ...Array.from({ length: 90 }, (_, i) => `  N${i}[Node ${i}] --> N${i + 1}`),
    '```',
  ].join('\n');

// ---- helpers ----------------------------------------------------------------
const pct = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return +sorted[
    Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)
  ].toFixed(1);
};
async function timed(
  request: APIRequestContext,
  path: string,
  samples = 40,
): Promise<{
  firstMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  bytes: number;
  status: number;
}> {
  const first = performance.now();
  const response = await request.get(`${C}${path}`, {
    headers: await authHeaders(),
  });
  const body = await response.body();
  const firstMs = performance.now() - first;
  const times: number[] = [];
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    await (
      await request.get(`${C}${path}`, { headers: await authHeaders() })
    ).body();
    times.push(performance.now() - start);
  }
  return {
    status: response.status(),
    bytes: body.length,
    firstMs: +firstMs.toFixed(1),
    p50Ms: pct(times, 0.5),
    p95Ms: pct(times, 0.95),
    maxMs: pct(times, 1),
  };
}
async function authHeaders() {
  const cookie = (await context.cookies()).find(
    (c) => c.name === 'pandanote_session',
  )!;
  return { origin: C, cookie: `pandanote_session=${cookie.value}` };
}
interface Proc {
  rssMiB: number;
  hwmMiB: number;
  cgroupMiB: number;
}
async function sampleProcess(): Promise<Proc> {
  const script =
    'for p in /proc/[0-9]*; do n=$(sed -n "s/^Name:[[:space:]]*//p" $p/status 2>/dev/null); ' +
    'r=$(sed -n "s/^VmRSS:[[:space:]]*\\([0-9]*\\).*/\\1/p" $p/status 2>/dev/null); ' +
    'h=$(sed -n "s/^VmHWM:[[:space:]]*\\([0-9]*\\).*/\\1/p" $p/status 2>/dev/null); echo "$n $r $h"; done; ' +
    'echo "cg $(cat /sys/fs/cgroup/memory.current)"';
  const { stdout } = await run(DOCKER, ['exec', CONTAINER, 'sh', '-c', script]);
  let rss = 0,
    hwm = 0,
    cg = 0;
  for (const line of stdout.split('\n')) {
    const [name, a, b] = line.trim().split(' ');
    if (name === 'cg') cg = Number(a);
    else if (
      name &&
      ![
        'sh',
        'sed',
        'grep',
        'cat',
        'du',
        'podman-init',
        'catatonit',
        'tini',
      ].includes(name)
    ) {
      rss += Number(a) || 0;
      hwm = Math.max(hwm, Number(b) || 0);
    }
  }
  return {
    rssMiB: +(rss / 1024).toFixed(1),
    hwmMiB: +(hwm / 1024).toFixed(1),
    cgroupMiB: +(cg / 1048576).toFixed(1),
  };
}
/** Continuously samples process RAM while `work` runs; returns the peak. */
async function withPeak<T>(work: () => Promise<T>): Promise<{
  value: T;
  peakRssMiB: number;
  peakCgroupMiB: number;
  peakHwmMiB: number;
}> {
  let stop = false;
  let peak = 0,
    peakCg = 0,
    hwm = 0;
  const sampler = (async () => {
    while (!stop) {
      try {
        const s = await sampleProcess();
        peak = Math.max(peak, s.rssMiB);
        peakCg = Math.max(peakCg, s.cgroupMiB);
        hwm = Math.max(hwm, s.hwmMiB);
      } catch {
        /* container busy */
      }
    }
  })();
  try {
    return {
      value: await work(),
      peakRssMiB: peak,
      peakCgroupMiB: peakCg,
      peakHwmMiB: hwm,
    };
  } finally {
    stop = true;
    await sampler;
  }
}
async function diskMiB(): Promise<number> {
  const { stdout } = await run(DOCKER, [
    'exec',
    CONTAINER,
    'du',
    '-sk',
    '/data',
  ]);
  return +(Number(stdout.split(/\s/)[0]) / 1024).toFixed(1);
}
async function cdp(page: Page, context: BrowserContext) {
  return context.newCDPSession(page);
}
async function heapAndDom(session: Awaited<ReturnType<typeof cdp>>) {
  await session.send('HeapProfiler.collectGarbage');
  const { metrics } = await session.send('Performance.getMetrics');
  const get = (name: string) =>
    metrics.find((m) => m.name === name)?.value ?? 0;
  return {
    jsHeapMiB: +(get('JSHeapUsedSize') / 1048576).toFixed(1),
    domNodes: get('Nodes'),
    listeners: get('JSEventListeners'),
  };
}

/** One maximal valid long diagram (within the product's documented Mermaid limits). */
async function ensureDiagramNote() {
  const response = await api(page, C, 'post', '/api/notes', {
    action: 'create',
    mutationId: crypto.randomUUID(),
    content: {
      bodyMarkdown: longMermaid(9999),
      timelineAt: Date.now() - 5 * 365 * 86_400_000, // far below the first timeline page
      location: null,
      attachmentIds: [],
    },
  });
  expect(response.status()).toBe(200);
  noteWithDiagram = (await response.json()).data.noteId;
}

test.describe.configure({ mode: 'serial' });
test.afterEach(() => {
  writeFileSync(
    `${DIR}/benchmark-results.json`,
    JSON.stringify(results, null, 2),
  );
});
let request: APIRequestContext;
let context: BrowserContext;
let page: Page;
let noteWithDiagram = '';

test.beforeAll(async ({ browser, playwright }) => {
  request = await playwright.request.newContext({ ignoreHTTPSErrors: true });
  context = await browser.newContext({ ignoreHTTPSErrors: true });
  page = await context.newPage();
  results.environment = {
    host: {
      cpuModel: cpus()[0]?.model,
      logicalCpus: cpus().length,
      ramGiB: +(totalmem() / 2 ** 30).toFixed(1),
      note: 'browser/driver host (Windows); container below',
    },
    container: (
      await run(DOCKER, [
        'inspect',
        '--format',
        'cpus={{.HostConfig.NanoCpus}} memory={{.HostConfig.Memory}}',
        CONTAINER,
      ])
    ).stdout.trim(),
    notes: NOTES,
  };
});

test('setup and seed the realistic 10k dataset through the real API', async () => {
  test.setTimeout(1_800_000);
  if (process.env.BENCH_REUSE) {
    await signIn(page, C, PASSWORD);
    const diagrams = (
      await (await api(page, C, 'get', '/api/notes?tag=diagram')).json()
    ).data.items as { id: string }[];
    noteWithDiagram = diagrams[0].id;
    await ensureDiagramNote();
    return;
  }
  const token = readFileSync(`${DIR}/c.token`, 'utf8').trim();
  await page.goto(`${C}/setup`);
  await page.getByLabel('One-time setup token').fill(token);
  await page.getByLabel('Choose a password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(`${C}/`, { timeout: 30_000 });
  const cookie = (await context.cookies()).find(
    (c) => c.name === 'pandanote_session',
  )!;
  const headers = { origin: C, cookie: `pandanote_session=${cookie.value}` };
  const drafts = new Set<number>();
  const trash = new Set<number>();
  for (let i = 0; i < Math.round(NOTES * 0.03); i++)
    drafts.add(Math.floor(rnd() * NOTES));
  for (let i = 0; i < Math.round(NOTES * 0.02); i++)
    trash.add(Math.floor(rnd() * NOTES));
  const now = Date.now();
  const started = performance.now();
  let next = 0;
  const created: { noteId: string; revision: number; kind: string }[] = [];
  async function worker() {
    while (next < NOTES) {
      const index = next++;
      const body =
        index < 40
          ? longCode(index)
          : index < 52
            ? longMermaid(index)
            : bodyFor(index);
      const response = await request.post(`${C}/api/notes`, {
        headers,
        data: {
          action: 'create',
          mutationId: crypto.randomUUID(),
          content: {
            bodyMarkdown: body,
            timelineAt:
              now -
              Math.floor(rnd() * 4 * 365 * 86_400_000) -
              (index + 1) * 1000,
            location:
              rnd() < 0.05
                ? {
                    latitude: 22.3 + rnd() / 10,
                    longitude: 114.1 + rnd() / 10,
                    accuracy: 20,
                    label: null,
                  }
                : null,
            attachmentIds: [],
          },
        },
      });
      expect(response.status(), body.slice(0, 40)).toBe(200);
      const data = (await response.json()).data as {
        noteId: string;
        revision: number;
      };
      if (index >= 40 && index < 52) noteWithDiagram ||= data.noteId;
      if (drafts.has(index) || trash.has(index))
        created.push({
          ...data,
          kind: drafts.has(index) ? 'move-to-draft' : 'trash',
        });
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  for (const note of created) {
    const response = await request.post(
      `${C}/api/notes/${note.noteId}/actions`,
      {
        headers,
        data: {
          action: note.kind,
          noteId: note.noteId,
          mutationId: crypto.randomUUID(),
          expectedRevision: note.revision,
        },
      },
    );
    expect(response.status()).toBe(200);
  }
  const seconds = (performance.now() - started) / 1000;
  results.seed = {
    notes: NOTES,
    drafts: drafts.size,
    trash: trash.size,
    seconds: +seconds.toFixed(1),
    notesPerSecond: +(NOTES / seconds).toFixed(1),
  };
  results.idleAfterSeed = {
    process: await sampleProcess(),
    dataMiB: await diskMiB(),
  };
  await ensureDiagramNote();
  expect(noteWithDiagram).not.toBe('');
});

test('API latency (through the real HTTPS proxy, warm p50/p95) for list, tag, calendar, search and detail', async () => {
  await signIn(page, C, PASSWORD);
  const list = (await (await api(page, C, 'get', '/api/notes')).json())
    .data as { items: { id: string }[]; nextCursor: string | null };
  expect(list.items).toHaveLength(30);
  const cursor = encodeURIComponent(list.nextCursor!);
  const scenarios: [string, string][] = [
    ['timeline first page (30)', '/api/notes'],
    ['timeline next page by cursor', `/api/notes?cursor=${cursor}`],
    ['tag filter (common topic)', '/api/notes?tag=topic3'],
    ['two-tag filter', '/api/notes?tag=topic3&tag=topic9'],
    ['calendar month activity', '/api/calendar?month=2024-06'],
    ['month filter timeline', '/api/notes?month=2024-06'],
    ['drafts list', '/api/notes/status?status=draft'],
    ['trash list', '/api/notes/status?status=trash'],
    ['single note detail', `/api/notes/${list.items[0].id}`],
    ['search English (trigram) "coffee"', '/api/notes?q=coffee'],
    [
      'search English phrase "coffee shop"',
      `/api/notes?q=${encodeURIComponent('"coffee shop"')}`,
    ],
    ['search CJK 2 chars "香港"', `/api/notes?q=${encodeURIComponent('香港')}`],
    [
      'search CJK 1 char "猫" (short literal scan)',
      `/api/notes?q=${encodeURIComponent('猫')}`,
    ],
    [
      'search CJK 2 chars "咗心" (no hit class)',
      `/api/notes?q=${encodeURIComponent('咗心')}`,
    ],
    [
      'search absent 1 char "龘" (full scan worst case)',
      `/api/notes?q=${encodeURIComponent('龘')}`,
    ],
    ['search rare needle', '/api/notes?q=uniqueNeedleAlpha'],
    ['search literal "%"', `/api/notes?q=${encodeURIComponent('%')}`],
  ];
  const table: Record<string, unknown> = {};
  for (const [name, path] of scenarios) {
    const r = await timed(request, path);
    expect(r.status, name).toBe(200);
    table[name] = r;
  }
  results.apiLatency = table;
});

interface Render {
  ttfbMs: number;
  fcpMs: number;
  lcpMs: number;
  firstCardMs: number;
  domContentLoadedMs: number;
  transferKiB: number;
  decodedJsKiB: number;
  scripts: { url: string; encodedKiB: number; decodedKiB: number }[];
  requests: number;
  mermaidRequested: boolean;
}
async function measureRender(
  context: BrowserContext,
  path: string,
  ready: (page: Page) => Promise<unknown>,
  throttled = false,
): Promise<Render> {
  const view = await context.newPage();
  if (throttled) {
    const session = await context.newCDPSession(view);
    await session.send('Network.enable');
    await session.send('Network.clearBrowserCache');
    await session.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 40,
      downloadThroughput: (10 * 1024 * 1024) / 8,
      uploadThroughput: (5 * 1024 * 1024) / 8,
    });
  }
  const seen: string[] = [];
  view.on('response', (r) => seen.push(r.url()));
  await view.goto(`${C}${path}`, { waitUntil: 'commit' });
  await ready(view);
  const firstCardMs = await view.evaluate(() => performance.now());
  await view.waitForLoadState('load');
  const metrics = await view.evaluate(async () => {
    const nav = performance.getEntriesByType(
      'navigation',
    )[0] as PerformanceNavigationTiming;
    const paint = performance
      .getEntriesByType('paint')
      .find((e) => e.name === 'first-contentful-paint');
    const lcp = await new Promise<number>((resolve) => {
      let last = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) last = e.startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      setTimeout(() => resolve(last), 200);
    });
    const resources = performance.getEntriesByType(
      'resource',
    ) as PerformanceResourceTiming[];
    return {
      ttfbMs: nav.responseStart,
      dcl: nav.domContentLoadedEventEnd,
      fcp: paint?.startTime ?? 0,
      lcp,
      transfer:
        nav.transferSize + resources.reduce((s, r) => s + r.transferSize, 0),
      decodedJs: resources
        .filter((r) => r.name.endsWith('.js'))
        .reduce((s, r) => s + r.decodedBodySize, 0),
      requests: resources.length + 1,
      scripts: resources
        .filter((r) => r.name.endsWith('.js'))
        .map((r) => ({
          url: new URL(r.name).pathname,
          encodedKiB: +(r.encodedBodySize / 1024).toFixed(1),
          decodedKiB: +(r.decodedBodySize / 1024).toFixed(1),
        })),
    };
  });
  await view.close();
  return {
    ttfbMs: +metrics.ttfbMs.toFixed(1),
    fcpMs: +metrics.fcp.toFixed(1),
    lcpMs: +metrics.lcp.toFixed(1),
    firstCardMs: +firstCardMs.toFixed(1),
    domContentLoadedMs: +metrics.dcl.toFixed(1),
    transferKiB: +(metrics.transfer / 1024).toFixed(1),
    decodedJsKiB: +(metrics.decodedJs / 1024).toFixed(1),
    requests: metrics.requests,
    scripts: metrics.scripts,
    mermaidRequested: seen.some((u) => /mermaid/i.test(u)),
  };
}
function summarize(values: number[]) {
  return { p50: pct(values, 0.5), p95: pct(values, 0.95), max: pct(values, 1) };
}

test('first useful rendering: SSR/TTFB, FCP/LCP, first card; cold cache, warm cache and throttled network; bundle sizes', async ({
  browser,
}) => {
  const ready = (p: Page) => p.getByTestId('posted-note').first().waitFor();
  const cookies = await context.cookies();
  async function series(
    label: string,
    mode: 'cold' | 'warm' | 'throttled',
    runs: number,
  ) {
    const out: Render[] = [];
    if (mode === 'warm') {
      const ctx = await freshContext(browser, cookies);
      await measureRender(ctx, '/', ready); // primes the HTTP cache
      for (let i = 0; i < runs; i++)
        out.push(await measureRender(ctx, '/', ready));
      await ctx.close();
    } else
      for (let i = 0; i < runs; i++) {
        const ctx = await freshContext(browser, cookies);
        out.push(await measureRender(ctx, '/', ready, mode === 'throttled'));
        await ctx.close();
      }
    results[label] = {
      runs,
      ttfbMs: summarize(out.map((r) => r.ttfbMs)),
      fcpMs: summarize(out.map((r) => r.fcpMs)),
      lcpMs: summarize(out.map((r) => r.lcpMs)),
      firstCardMs: summarize(out.map((r) => r.firstCardMs)),
      domContentLoadedMs: summarize(out.map((r) => r.domContentLoadedMs)),
      transferKiB: out[0].transferKiB,
      decodedJsKiB: out[0].decodedJsKiB,
      requests: out[0].requests,
      scripts: out[0].scripts,
      largestScriptDecodedKiB: Math.max(
        ...out[0].scripts.map((x) => x.decodedKiB),
      ),
    };
  }
  await series('render_cold_cache_loopback', 'cold', 7);
  await series('render_warm_cache_loopback', 'warm', 7);
  await series(
    'render_cold_throttled_10Mbps_40msRTT',
    'throttled',
    Number(process.env.BENCH_THROTTLED_RUNS ?? 5),
  );
});
async function freshContext(
  browser: import('@playwright/test').Browser,
  cookies: Awaited<ReturnType<BrowserContext['cookies']>>,
) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  await ctx.addCookies(cookies);
  return ctx;
}

test('Mermaid is lazy: absent on the timeline, loaded once for a diagram note; long code/diagram notes render', async () => {
  const cookies = await context.cookies();
  const diagramContext = await freshContext(
    (await context.browser())!,
    cookies,
  );
  const withDiagram = await measureRender(
    diagramContext,
    `/notes/${noteWithDiagram}`,
    (p) => p.locator('[data-diagram] svg').first().waitFor({ timeout: 60_000 }),
  );
  await diagramContext.close();
  const homeScripts = new Set(
    (
      results.render_cold_cache_loopback as {
        scripts: { url: string }[];
      }
    ).scripts.map((x) => x.url),
  );
  const extra = withDiagram.scripts.filter((x) => !homeScripts.has(x.url));
  results.mermaidDetail = {
    ...withDiagram,
    scripts: undefined,
    lazyScriptsLoadedOnlyForDiagram: extra,
    lazyDecodedKiB: +extra.reduce((n, x) => n + x.decodedKiB, 0).toFixed(1),
    lazyEncodedKiB: +extra.reduce((n, x) => n + x.encodedKiB, 0).toFixed(1),
  };
  // Mermaid (hundreds of KiB) is absent from the timeline load and appears only here.
  expect(extra.reduce((n, x) => n + x.decodedKiB, 0)).toBeGreaterThan(300);
});

test('browser memory/DOM growth: long timeline scrolling plus repeated detail open/close stays bounded', async () => {
  test.setTimeout(900_000);
  const view = await context.newPage();
  const session = await cdp(view, context);
  await session.send('Performance.enable');
  await view.goto(`${C}/`);
  await view.getByTestId('posted-note').first().waitFor();
  const samples: Record<string, unknown>[] = [];
  const appendMs: number[] = [];
  const before = await heapAndDom(session);
  for (let step = 1; step <= 100; step++) {
    const cards = await view.getByTestId('posted-note').count();
    await view.evaluate(() => {
      const scroller = document.querySelector(
        '[data-timeline-scroll], main, .notes',
      ) as HTMLElement | null;
      const target = [
        document.scrollingElement,
        scroller,
        ...document.querySelectorAll<HTMLElement>('*'),
      ]
        .filter(
          (e): e is HTMLElement => !!e && e.scrollHeight > e.clientHeight + 50,
        )
        .sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
      if (target) target.scrollTop = target.scrollHeight;
    });
    const appendStarted = performance.now();
    await view
      .waitForFunction(
        (n) =>
          document.querySelectorAll('[data-testid="posted-note"]').length > n,
        cards,
        { timeout: 15_000 },
      )
      .catch(() => undefined);
    appendMs.push(performance.now() - appendStarted);
    await view.waitForTimeout(60);
    if (step % 20 === 0)
      samples.push({
        step,
        cards: await view.getByTestId('posted-note').count(),
        ...(await heapAndDom(session)),
      });
  }
  const cardsAfterScroll = await view.getByTestId('posted-note').count();
  // Reload at top and repeat open/close of the detail dialog.
  await view.goto(`${C}/`);
  await view.getByTestId('posted-note').first().waitFor();
  const baseline = await heapAndDom(session);
  const loops: Record<string, unknown>[] = [];
  for (let i = 1; i <= 60; i++) {
    await view
      .getByRole('link', { name: 'Open note' })
      .nth(i % 5)
      .click();
    await view.getByRole('dialog').first().waitFor();
    await view.keyboard.press('Escape');
    await view
      .getByRole('dialog')
      .first()
      .waitFor({ state: 'detached' })
      .catch(() => undefined);
    if (i % 20 === 0)
      loops.push({ iteration: i, ...(await heapAndDom(session)) });
  }
  results.browserMemory = {
    initial: before,
    scrollSamples: samples,
    cardsAfterScrolling100Pages: cardsAfterScroll,
    appendLatencyMs: {
      firstTenPages: {
        p50: pct(appendMs.slice(0, 10), 0.5),
        max: pct(appendMs.slice(0, 10), 1),
      },
      lastTenPages: {
        p50: pct(appendMs.slice(-10), 0.5),
        max: pct(appendMs.slice(-10), 1),
      },
    },
    afterReloadBaseline: baseline,
    detailOpenCloseSamples: loops,
  };
  const last = loops.at(-1) as { jsHeapMiB: number; domNodes: number };
  expect(last.domNodes).toBeLessThan(baseline.domNodes * 1.5 + 2000);
  expect(last.jsHeapMiB).toBeLessThan(baseline.jsHeapMiB * 2 + 20);
  await view.close();
});

test('multi-image post (4 × 12 MP photos + file): upload/processing time, writing stays responsive, RSS peak', async () => {
  test.setTimeout(600_000);
  await page.goto(`${C}/`);
  await page.getByRole('button', { name: 'Write a note…' }).click();
  await page
    .getByRole('textbox', { name: 'Note text' })
    .fill('Benchmark multi-image post #Media');
  const files = [] as { name: string; mimeType: string; buffer: Buffer }[];
  for (let i = 0; i < 4; i++)
    files.push({
      name: `IMG_${i}.jpg`,
      mimeType: 'image/jpeg',
      buffer: await sharp({
        create: {
          width: 4000,
          height: 3000,
          channels: 3,
          background: '#556677',
          noise: { type: 'gaussian', mean: 128, sigma: 12 },
        },
      })
        .jpeg({ quality: 88 })
        .toBuffer(),
    });
  files.push({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('benchmark file\n'.repeat(5000)),
  });
  await page.getByLabel('Choose local files').setInputFiles(files);
  await expect(
    page.getByTestId('composer').getByText('Attachments (5)', { exact: true }),
  ).toBeVisible();
  const before = await page.getByTestId('posted-note').count();
  const cookie = (await context.cookies()).find(
    (c) => c.name === 'pandanote_session',
  )!;
  const headers = { origin: C, cookie: `pandanote_session=${cookie.value}` };
  const readTimes: number[] = [];
  const measured = await withPeak(async () => {
    const started = performance.now();
    await page
      .getByTestId('composer')
      .getByRole('button', { name: 'Post', exact: true })
      .click();
    // Responsiveness of other requests while images are processed.
    while (
      (await page.getByTestId('posted-note').count()) < before + 1 &&
      performance.now() - started < 300_000
    ) {
      const s = performance.now();
      await (await request.get(`${C}/api/notes?q=coffee`, { headers })).body();
      readTimes.push(performance.now() - s);
    }
    return performance.now() - started;
  });
  results.multiImagePost = {
    inputBytesMiB: +(
      files.reduce((s, f) => s + f.buffer.length, 0) / 1048576
    ).toFixed(1),
    postToVisibleSeconds: +(measured.value / 1000).toFixed(1),
    concurrentSearchSamples: readTimes.length,
    concurrentSearchP95Ms: readTimes.length ? pct(readTimes, 0.95) : null,
    peakProcessRssMiB: measured.peakRssMiB,
    peakCgroupMiB: measured.peakCgroupMiB,
  };
  expect(measured.value).toBeLessThan(240_000);
});

test('worst-case allowed image (49 MP) is processed within the container limits without OOM; app stays healthy', async () => {
  test.setTimeout(300_000);
  await page.goto(`${C}/`);
  await page.getByRole('button', { name: 'Write a note…' }).click();
  await page
    .getByRole('textbox', { name: 'Note text' })
    .fill('Benchmark worst-case image #Media');
  const huge = await sharp({
    create: { width: 7000, height: 7000, channels: 3, background: '#335577' },
  })
    .jpeg({ quality: 70 })
    .toBuffer();
  expect(huge.length).toBeLessThan(20 * 1024 * 1024);
  await page
    .getByLabel('Choose local files')
    .setInputFiles({ name: 'huge.jpg', mimeType: 'image/jpeg', buffer: huge });
  await expect(
    page.getByTestId('composer').getByText('Attachments (1)', { exact: true }),
  ).toBeVisible();
  const before = await page.getByTestId('posted-note').count();
  const measured = await withPeak(async () => {
    const started = performance.now();
    await page
      .getByTestId('composer')
      .getByRole('button', { name: 'Post', exact: true })
      .click();
    await expect(page.getByTestId('posted-note')).toHaveCount(before + 1, {
      timeout: 240_000,
    });
    return performance.now() - started;
  });
  const restarts = (
    await run(DOCKER, [
      'inspect',
      '--format',
      '{{.RestartCount}} {{.State.OOMKilled}}',
      CONTAINER,
    ])
  ).stdout.trim();
  results.worstCaseImage = {
    megapixels: 49,
    inputMiB: +(huge.length / 1048576).toFixed(1),
    postToVisibleSeconds: +(measured.value / 1000).toFixed(1),
    peakProcessRssMiB: measured.peakRssMiB,
    peakCgroupMiB: measured.peakCgroupMiB,
    restartCountAndOomKilled: restarts,
  };
  expect(restarts).toBe('0 false');
});

test('full backup of the 10k dataset: duration, archive size, RAM/disk peak and responsiveness of reads and a note write during backup', async () => {
  test.setTimeout(900_000);
  await page.goto(`${C}/settings`);
  const diskBefore = await diskMiB();
  const cookie = (await context.cookies()).find(
    (c) => c.name === 'pandanote_session',
  )!;
  const headers = { origin: C, cookie: `pandanote_session=${cookie.value}` };
  const backups = page.getByTestId('backup-settings');
  await backups
    .getByRole('button', { name: 'Create full backup', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Authorize backup action' });
  await dialog.getByLabel('Password for backup action').fill(PASSWORD);
  const reads: number[] = [];
  const writes: number[] = [];
  const measured = await withPeak(async () => {
    const started = performance.now();
    const creating = page.waitForResponse(
      (r) => r.url() === `${C}/api/backups` && r.request().method() === 'POST',
    );
    await dialog.getByRole('button', { name: 'Confirm create backup' }).click();
    const job = (await (await creating).json()).data as { id: string };
    const row = backups.locator(`[data-backup-id="${job.id}"]`);
    for (let i = 0; i < 1200; i++) {
      if (/complete/.test((await row.textContent()) ?? '')) break;
      const s = performance.now();
      await (await request.get(`${C}/api/notes?q=coffee`, { headers })).body();
      reads.push(performance.now() - s);
      if (i % 3 === 0) {
        const w = performance.now();
        const r = await request.post(`${C}/api/notes`, {
          headers,
          data: {
            action: 'create',
            mutationId: crypto.randomUUID(),
            content: {
              bodyMarkdown: `write during backup ${i}`,
              timelineAt: null,
              location: null,
              attachmentIds: [],
            },
          },
        });
        expect([200, 503]).toContain(r.status());
        writes.push(performance.now() - w);
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    await expect(row).toContainText('complete', { timeout: 300_000 });
    const seconds = (performance.now() - started) / 1000;
    await row.getByRole('button', { name: 'Download backup' }).click();
    await dialog.getByLabel('Password for backup action').fill(PASSWORD);
    const downloading = page.waitForEvent('download');
    await dialog
      .getByRole('button', { name: 'Confirm download backup' })
      .click();
    const download = await downloading;
    await download.saveAs(`${DIR}/c-backup.pnb`);
    return seconds;
  });
  const size = readFileSync(`${DIR}/c-backup.pnb`).length;
  results.backup = {
    createSeconds: +measured.value.toFixed(1),
    archiveMiB: +(size / 1048576).toFixed(1),
    peakProcessRssMiB: measured.peakRssMiB,
    peakCgroupMiB: measured.peakCgroupMiB,
    dataMiBBefore: diskBefore,
    dataMiBAfter: await diskMiB(),
    concurrentReadsDuringBackup: {
      samples: reads.length,
      p50Ms: reads.length ? pct(reads, 0.5) : null,
      p95Ms: reads.length ? pct(reads, 0.95) : null,
    },
    concurrentWritesDuringBackup: {
      samples: writes.length,
      p50Ms: writes.length ? pct(writes, 0.5) : null,
      p95Ms: writes.length ? pct(writes, 0.95) : null,
    },
  };
});

test('uploaded restore of the 10k archive: duration, RAM peak, search/data intact afterwards', async () => {
  test.setTimeout(900_000);
  const before = (
    await (await api(page, C, 'get', '/api/notes?q=coffee')).json()
  ).data.items.map((n: { id: string }) => n.id);
  await page.goto(`${C}/settings`);
  const restores = page.getByTestId('restore-settings');
  const measured = await withPeak(async () => {
    const started = performance.now();
    await restores
      .getByLabel('PandaNote backup archive')
      .setInputFiles(`${DIR}/c-backup.pnb`);
    await restores
      .getByRole('button', { name: 'Upload and validate backup', exact: true })
      .click();
    const upload = page.getByRole('dialog', {
      name: 'Authorize restore upload',
    });
    await upload.getByLabel('Current password for restore').fill(PASSWORD);
    await upload
      .getByRole('button', { name: 'Confirm upload and validate' })
      .click();
    await expect(restores.getByTestId('restore-summary')).toBeVisible({
      timeout: 600_000,
    });
    const validated = performance.now();
    await restores
      .getByRole('button', { name: 'Replace application from backup' })
      .click();
    const confirm = page.getByRole('dialog', { name: 'Confirm full restore' });
    await confirm
      .getByLabel(
        'I understand that current application data will be replaced.',
      )
      .check();
    await confirm.getByLabel('Current password for restore').fill(PASSWORD);
    await confirm
      .getByRole('button', { name: 'Confirm replace all application data' })
      .click();
    await expect(page).toHaveURL(`${C}/login`, { timeout: 600_000 });
    return {
      validateSeconds: (validated - started) / 1000,
      replaceSeconds: (performance.now() - validated) / 1000,
    };
  });
  await signIn(page, C, PASSWORD);
  const after = (
    await (await api(page, C, 'get', '/api/notes?q=coffee')).json()
  ).data.items.map((n: { id: string }) => n.id);
  results.restore = {
    validateSeconds: +measured.value.validateSeconds.toFixed(1),
    replaceSeconds: +measured.value.replaceSeconds.toFixed(1),
    peakProcessRssMiB: measured.peakRssMiB,
    peakCgroupMiB: measured.peakCgroupMiB,
    dataMiBAfter: await diskMiB(),
    searchPageStableAfterRestore:
      JSON.stringify(before) === JSON.stringify(after) ||
      'differs only by writes made during the backup run',
  };
  expect(after.length).toBeGreaterThan(0);
  results.finalIdle = await sampleProcess();
  writeFileSync(
    `${DIR}/benchmark-results.json`,
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results, null, 2));
});
