import type { Handle } from '@sveltejs/kit';
import { getSession } from '$lib/server/auth';

const PUBLIC_PATHS = ['/api/auth/google', '/api/auth/config', '/api/auth/logout', '/api/auth/me'];

export const handle: Handle = async ({ event, resolve }) => {
  const session = getSession(event.request);
  event.locals.session = session ?? null;

  // Protect all /api/* routes except public auth paths
  if (event.url.pathname.startsWith('/api/') && !PUBLIC_PATHS.includes(event.url.pathname)) {
    if (!session) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  return resolve(event);
};
