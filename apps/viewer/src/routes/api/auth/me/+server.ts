import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  if (locals.session) {
    return json({
      authenticated: true,
      user: {
        email: locals.session.email,
        name: locals.session.name,
        picture: locals.session.picture,
      },
    });
  }
  return json({ authenticated: false });
};
