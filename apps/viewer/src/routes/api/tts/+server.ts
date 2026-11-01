import type { RequestHandler } from './$types';
import { streamTTS } from '$lib/server/tts';

export const GET: RequestHandler = async ({ url }) => {
  const text = url.searchParams.get('text') || '';
  const voice = url.searchParams.get('voice') || undefined;
  const rate = url.searchParams.get('rate') || undefined;
  return await streamTTS({ text, voice, rate });
};
