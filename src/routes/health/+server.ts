import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// S00 process liveness only; persistence readiness is added with S01.
export const GET: RequestHandler = () =>
  json({ status: 'ok' }, { headers: { 'cache-control': 'no-store' } });
