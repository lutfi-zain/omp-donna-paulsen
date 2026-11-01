import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyGoogleToken, createSessionCookie } from '$lib/server/auth';

export const POST: RequestHandler = async ({ request, url }) => {
  try {
    const body = (await request.json()) as { credential?: string };
    if (!body?.credential) {
      return json({ ok: false, error: 'Missing credential token' }, { status: 400 });
    }

    const session = await verifyGoogleToken(body.credential);
    if (!session) {
      return json(
        { ok: false, error: 'Forbidden: Unauthorized Google user' },
        { status: 403 }
      );
    }

    const isSecure =
      url.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';
    const cookieHeader = createSessionCookie(session, isSecure);

    return json(
      {
        ok: true,
        user: {
          email: session.email,
          name: session.name,
          picture: session.picture,
        },
      },
      {
        headers: {
          'Set-Cookie': cookieHeader,
        },
      }
    );
  } catch (err) {
    console.error('[Server] Google auth error:', err);
    return json({ ok: false, error: 'Authentication failed' }, { status: 500 });
  }
};
