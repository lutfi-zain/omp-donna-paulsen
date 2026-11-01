import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { VOICE_METADATA } from '$lib/server/tts';

export const GET: RequestHandler = async () => {
  return json(VOICE_METADATA);
};
