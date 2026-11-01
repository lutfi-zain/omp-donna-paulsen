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

  const response = await resolve(event);

  // Prevent browser caching for HTML pages so updates are visible immediately
  if (!event.url.pathname.startsWith('/_app/immutable/')) {
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
  }

  return response;
};
