import type { TTSRequest } from "./types.js";

export interface VoiceOption {
  id: string;
  name: string;
  lang: string;
  gender: string;
  description: string;
}

export const VOICE_METADATA: VoiceOption[] = [
  { id: "id-ID-GadisNeural", name: "Gadis", lang: "id-ID", gender: "Wanita", description: "Indonesia - Alami & Jernih" },
  { id: "id-ID-ArdiNeural", name: "Ardi", lang: "id-ID", gender: "Pria", description: "Indonesia - Formal & Tenang" },
  { id: "jv-ID-SitiNeural", name: "Siti", lang: "jv-ID", gender: "Wanita", description: "Jawa - Santai" },
  { id: "jv-ID-DimasNeural", name: "Dimas", lang: "jv-ID", gender: "Pria", description: "Jawa - Sopan" },
  { id: "su-ID-TutiNeural", name: "Tuti", lang: "su-ID", gender: "Wanita", description: "Sunda - Lembut" },
  { id: "su-ID-JajangNeural", name: "Jajang", lang: "su-ID", gender: "Pria", description: "Sunda - Ramah" },
  { id: "en-US-AvaMultilingualNeural", name: "Ava", lang: "en-US", gender: "Wanita", description: "Multilingual - Ekspresif" },
  { id: "en-US-AndrewMultilingualNeural", name: "Andrew", lang: "en-US", gender: "Pria", description: "Multilingual - Percaya Diri" },
  { id: "en-US-EmmaMultilingualNeural", name: "Emma", lang: "en-US", gender: "Wanita", description: "English - Ceria & Jelas" },
  { id: "en-US-BrianMultilingualNeural", name: "Brian", lang: "en-US", gender: "Pria", description: "English - Kasual & Hangat" },
  { id: "en-SG-LunaNeural", name: "Luna", lang: "en-SG", gender: "Wanita", description: "Singapore / Asia Tenggara" },
];

export const ALLOWED_VOICES: Record<string, string> = Object.fromEntries(
  VOICE_METADATA.map((v) => [v.id, v.id])
);

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
