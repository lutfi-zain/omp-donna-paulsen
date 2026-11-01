import type { TTSRequest } from "./types.js";

export const ALLOWED_VOICES: Record<string, string> = {
  "id-ID-GadisNeural": "id-ID-GadisNeural",
  "id-ID-ArdiNeural": "id-ID-ArdiNeural",
};

export const DEFAULT_VOICE = "id-ID-GadisNeural";
export const DEFAULT_RATE = "+0%";
const MAX_TEXT_LENGTH = 5000;

/**
 * Validates and normalizes voice name
 */
export function normalizeVoice(voice?: string): string {
  if (voice && ALLOWED_VOICES[voice]) {
    return voice;
  }
  return DEFAULT_VOICE;
}

/**
 * Validates rate format (e.g. '+0%', '+10%', '-15%')
 */
export function normalizeRate(rate?: string): string {
  if (rate && /^[+-]?\d{1,3}%$/.test(rate)) {
    return rate;
  }
  return DEFAULT_RATE;
}

/**
 * Streams Edge-TTS audio using uv run edge-tts directly via Bun.spawn
 */
export function streamTTS(request: TTSRequest): Response {
  const cleanText = (request.text || "").trim().slice(0, MAX_TEXT_LENGTH);
  if (!cleanText) {
    return new Response(JSON.stringify({ error: "Missing or empty 'text' parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const voice = normalizeVoice(request.voice);
  const rate = normalizeRate(request.rate);

  try {
    const proc = Bun.spawn(
      [
        "uv",
        "run",
        "--with",
        "edge-tts",
        "edge-tts",
        "--voice",
        voice,
        "--rate",
        rate,
        "--text",
        cleanText,
        "--write-media",
        "-",
      ],
      {
        stdout: "pipe",
        stderr: "pipe",
      }
    );

    return new Response(proc.stdout, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-cache, no-store",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (err) {
    console.error("[TTS] Failed to spawn edge-tts process:", err);
    return new Response(JSON.stringify({ error: "Internal TTS execution failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
