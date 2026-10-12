import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Harness-only parser for the startup log lines (security-hardening SH2.1).
const pattern = /PandaNote setup code: ([A-Z2-9]{5}(?:-[A-Z2-9]{5}){3})/g;
const linePattern = /PandaNote setup link: \S+#code=/g;

export function setupCodesIn(output: string): string[] {
  return [...output.matchAll(pattern)].map((match) => match[1]);
}

// E2E only: the harness (scripts/e2e-server.mjs) writes the newest code of each
// fixture server to a private file. The port picks the fixture: 4175 is the
// security server, anything else the main server. Returns the display form.
export async function readSetupCode(baseURL: string): Promise<string> {
  const dir =
    new URL(baseURL).port === '4175' ? '.e2e-data/security' : '.e2e-data';
  const file = resolve(dir, 'setup-code');
  const deadline = Date.now() + 10_000;
  for (;;) {
    const code = (await readFile(file, 'utf8').catch(() => '')).trim();
    if (/^[A-Z2-9]{5}(?:-[A-Z2-9]{5}){3}$/.test(code)) return code;
    if (Date.now() > deadline)
      throw new Error('E2E setup code was not written by the fixture server');
    await delay(50);
  }
}

// Waits until `count` code lines and their link lines have been logged, then returns
// the newest code. The log can arrive a moment after /health answers.
export async function waitForSetupCode(
  read: () => string,
  count = 1,
  timeoutMs = 5000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const output = read();
    const links = output.match(linePattern)?.length ?? 0;
    const codes = setupCodesIn(output);
    if (codes.length >= count && links >= count) return codes[codes.length - 1];
    if (Date.now() > deadline)
      throw new Error(`Expected ${count} setup code line(s) in the log`);
    await delay(50);
  }
}
