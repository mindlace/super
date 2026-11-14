import type { Handle } from '@sveltejs/kit';
import { isAllowedHost } from '$lib/server/host';

export const handle: Handle = async ({ event, resolve }) => {
  if (!isAllowedHost(event.request.headers.get('host'))) {
    return new Response('Forbidden host', { status: 403 });
  }
  return resolve(event);
};
