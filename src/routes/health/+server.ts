import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRuntime } from '#lib/server/runtime.ts';

// Public, read-only readiness. It reveals only coarse state: no counts, versions,
// account state, paths or error text. Initialization/migration failures return 503.
// Restore maintenance is reported as 200 so edge health checks do not extend the
// outage after the app is back; ordinary routes return their own retryable 503.
export const GET: RequestHandler = async () => {
  const headers = { 'cache-control': 'no-store' };
  try {
    const runtime = getRuntime();
    await runtime.ready;
    if (!runtime.persistence.available)
      return json({ status: 'maintenance' }, { headers });
    runtime.persistence.native.prepare('SELECT 1').get();
    return json({ status: 'ok' }, { headers });
  } catch {
    console.error('Readiness check failed: private persistence unavailable.');
    return json({ status: 'unavailable' }, { status: 503, headers });
  }
};
