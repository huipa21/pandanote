import type { ReadStream, WriteStream } from 'node:tty';

/** Read a bounded secret directly from a terminal in raw/no-echo mode. Never
 * forward input, masking characters, native errors or the secret to output. */
export async function readSecret(
  prompt: string,
  signal: AbortSignal,
  input: ReadStream = process.stdin,
  output: WriteStream = process.stdout,
): Promise<string> {
  if (!input.isTTY || !output.isTTY)
    throw new Error('Interactive terminal required');
  signal.throwIfAborted();
  const wasRaw = input.isRaw;
  let value = '';
  let escape = false;
  input.setEncoding('utf8');
  input.setRawMode(true);
  try {
    output.write(prompt);
    return await new Promise<string>((resolve, reject) => {
      const cleanup = () => {
        input.off('data', data);
        input.off('end', end);
        input.off('error', end);
        signal.removeEventListener('abort', abort);
      };
      const end = () => {
        cleanup();
        reject(new Error('Terminal closed'));
      };
      const abort = () => {
        cleanup();
        reject(new Error('Cancelled'));
      };
      const data = (chunk: string) => {
        for (const char of chunk) {
          if (char === '\u0003' || char === '\u0004') {
            abort();
            return;
          }
          if (char === '\r' || char === '\n') {
            cleanup();
            resolve(value);
            return;
          }
          // Ignore terminal escape sequences (arrows, function keys), not text.
          if (char === '\u001b') {
            escape = true;
            continue;
          }
          if (escape) {
            if (/[A-Za-z~]/.test(char)) escape = false;
            continue;
          }
          if (char === '\u007f' || char === '\b') {
            value = [...value].slice(0, -1).join('');
          } else if (char >= ' ' && char !== '\u007f') {
            value += char;
            if (Buffer.byteLength(value, 'utf8') > 2048) {
              cleanup();
              reject(new Error('Terminal input too long'));
              return;
            }
          }
        }
      };
      input.on('data', data);
      input.once('end', end);
      input.once('error', end);
      signal.addEventListener('abort', abort, { once: true });
      input.resume();
    });
  } finally {
    value = '';
    input.setRawMode(wasRaw);
    input.pause();
    output.write('\n');
  }
}
