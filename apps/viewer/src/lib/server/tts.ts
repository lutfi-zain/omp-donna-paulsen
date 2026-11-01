import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { TTSRequest } from "$lib/types";

const execFileAsync = promisify(execFile);

const CACHE_DIR = path.join(os.homedir(), ".donna/cache/tts");

function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true, mode: 0o700 });
  }
}

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
 * Streams Edge-TTS audio with persistent SHA-256 disk cache and exact Content-Length.
 * Detects text changes automatically via SHA-256 hash.
 */
export async function streamTTS(request: TTSRequest): Promise<Response> {
  const cleanText = (request.text || "").trim().slice(0, MAX_TEXT_LENGTH);
  if (!cleanText) {
    return new Response(JSON.stringify({ error: "Missing or empty 'text' parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const voice = normalizeVoice(request.voice);
  const rate = normalizeRate(request.rate);

  // Hash captures voice, rate, and exact text
  const hash = crypto
    .createHash("sha256")
    .update(`${voice}:${rate}:${cleanText}`)
    .digest("hex");

  ensureCacheDir();
  const cacheFilePath = path.join(CACHE_DIR, `${hash}.mp3`);

  // 1. CACHE HIT: Return existing audio file with exact Content-Length!
  if (fs.existsSync(cacheFilePath)) {
    const stat = fs.statSync(cacheFilePath);
    if (stat.size > 0) {
      const buffer = fs.readFileSync(cacheFilePath);
      return new Response(buffer, {
        headers: {
          "Content-Type": "audio/mpeg",
          "Content-Length": String(buffer.byteLength),
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-TTS-Cache": "HIT",
        },
      });
    }
  }

  // 2. CACHE MISS: Generate audio directly to cache file via edge-tts
  const tempPath = path.join(CACHE_DIR, `${hash}.tmp.${Date.now()}`);
  try {
    await execFileAsync("uv", [
      "run",
      "--with",
      "edge-tts",
      "edge-tts",
      "--voice",
      voice,
      `--rate=${rate}`,
      "--text",
      cleanText,
      "--write-media",
      tempPath,
    ]);

    // Atomically commit temp file to cache file
    fs.renameSync(tempPath, cacheFilePath);

    const buffer = fs.readFileSync(cacheFilePath);
    return new Response(buffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-TTS-Cache": "MISS",
      },
    });
  } catch (err) {
    console.error("[TTS] Failed to execute TTS:", err);
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {
      // ignore cleanup error
    }
    return new Response(JSON.stringify({ error: "Internal TTS execution failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
