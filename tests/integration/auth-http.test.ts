import { expect, it } from 'vitest';
import {
  authErrorResponse,
  readAuthJson,
} from '../../src/lib/server/auth/http.ts';
import { DomainError } from '../../src/lib/shared/domain.ts';

it('bounds authentication JSON by actual streamed bytes, not just Content-Length', async () => {
  const request = (body: string, headers: Record<string, string> = {}) =>
    new Request('https://notes.example.org/api/auth/login', {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json', ...headers },
    });
  expect(await readAuthJson(request('{"password":"synthetic"}'))).toEqual({
    password: 'synthetic',
  });
  await expect(readAuthJson(request('invalid'))).rejects.toMatchObject({
    code: 'validation',
  });
  await expect(
    readAuthJson(request('{}', { 'content-type': 'text/plain' })),
  ).rejects.toMatchObject({ code: 'validation' });
  await expect(
    readAuthJson(request('{}', { 'content-length': '9000' })),
  ).rejects.toMatchObject({ code: 'validation' });
  await expect(
    readAuthJson(request('x'.repeat(5000), { 'content-length': '1' })),
  ).rejects.toMatchObject({ code: 'validation' });
  const encoder = new TextEncoder();
  const chunks = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('x'.repeat(3000)));
      controller.enqueue(encoder.encode('x'.repeat(3000)));
      controller.close();
    },
  });
  const streamed = new Request('https://notes.example.org/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: chunks,
    duplex: 'half',
  } as RequestInit);
  await expect(readAuthJson(streamed)).rejects.toMatchObject({
    code: 'validation',
  });
});
it('unknown errors never send SQL, paths, stacks or credential material; rate failures have retry headers', async () => {
  const response = authErrorResponse(
    new Error('synthetic-secret C:/private.sqlite SQL stack'),
  );
  expect(response.status).toBe(503);
  expect(await response.text()).not.toMatch(
    /synthetic-secret|private.sqlite|SQL|stack/,
  );
  const limited = authErrorResponse(
    new DomainError('rate-limited', { text: 'Too many attempts.' }),
  );
  expect(limited.status).toBe(429);
  expect(limited.headers.get('retry-after')).toBe('900');
  expect(limited.headers.get('cache-control')).toBe('no-store');
});
