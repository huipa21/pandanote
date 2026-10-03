import type { Handle } from '@sveltejs/kit/hooks';

export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('referrer-policy', 'same-origin');
  return response;
};
