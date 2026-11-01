import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { GOOGLE_CLIENT_ID } from '$lib/server/auth';

export const GET: RequestHandler = async () => {
  return json({ clientId: GOOGLE_CLIENT_ID });
};
