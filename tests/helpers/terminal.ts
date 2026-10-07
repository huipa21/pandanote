import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

/** util-linux script owns a real pseudo-TTY for the child. No node-pty runtime
 * dependency or production test hook. Missing script is a failed Linux gate. */
export function terminal(args: string[], env: NodeJS.ProcessEnv) {
  const quote = (text: string) => `'${text.replaceAll("'", "'\\''")}'`;
  const child = spawn(
    'script',
    [
      '-qef',
      '-E',
      'never',
      '-c',
      [process.execPath, ...args].map(quote).join(' '),
      '/dev/null',
    ],
    {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  let output = '';
  let failure: Error | undefined;
  child.stdout.on('data', (bytes: Buffer) => {
    output += bytes.toString('utf8');
  });
  child.stderr.on('data', (bytes: Buffer) => {
    output += bytes.toString('utf8');
  });
  child.on('error', (error) => {
    failure = error;
  });
  const closed = new Promise<number | null>((resolve) =>
    child.once('close', resolve),
  );
  return {
    get output() {
      return output;
    },
    send(value: string) {
      child.stdin.write(value);
    },
    async wait(text: string, offset = 0) {
      const until = Date.now() + 10000;
      while (!output.slice(offset).includes(text)) {
        if (failure) throw failure;
        if (child.exitCode !== null || Date.now() > until)
          throw new Error(`Terminal did not reach ${text}; output: ${output}`);
        await delay(20);
      }
      return output.indexOf(text, offset) + text.length;
    },
    async exit() {
      return await Promise.race([
        closed,
        delay(10000).then(() => {
          throw new Error('Terminal did not exit');
        }),
      ]);
    },
    async stop() {
      if (child.exitCode === null) child.kill('SIGKILL');
      await closed;
    },
  };
}
