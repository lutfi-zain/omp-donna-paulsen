import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import type { UserSession } from "./types.js";

export const GOOGLE_CLIENT_ID =
  "389746131392-6s6f7i2ci1sbm1gqafhqkkpmphefocte.apps.googleusercontent.com";
export const ALLOWED_EMAIL = "lutfidmz@gmail.com";
export const COOKIE_NAME = "donna_session";
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

const SECRET_PATH = path.join(os.homedir(), ".donna/session.secret");

let cachedSecret: string | null = null;

export function getSessionSecret(): string {
  if (cachedSecret) return cachedSecret;

  if (fs.existsSync(SECRET_PATH)) {
    try {
      const existing = fs.readFileSync(SECRET_PATH, "utf-8").trim();
      if (existing) {
        cachedSecret = existing;
        return cachedSecret;
      }
    } catch (err) {
      console.warn("[Auth] Failed to read session.secret, regenerating:", err);
    }
  }

  const generated = crypto.randomBytes(32).toString("hex");
  try {
    const dir = path.dirname(SECRET_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    fs.writeFileSync(SECRET_PATH, generated, { encoding: "utf-8", mode: 0o600 });
  } catch (err) {
    console.warn("[Auth] Could not persist session.secret to disk:", err);
  }

  cachedSecret = generated;
  return cachedSecret;
}

export interface GoogleTokenInfo {
  iss?: string;
  sub?: string;
  azp?: string;
  aud?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
  error?: string;
  error_description?: string;
}

/**
 * Verify Google ID Token against Google's tokeninfo endpoint
 */
export async function verifyGoogleToken(idToken: string): Promise<UserSession | null> {
  if (!idToken || typeof idToken !== "string") return null;

  try {
    const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { "Accept": "application/json" },
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn("[Auth] Google token verification failed:", response.status, errText);
      return null;
    }

    const payload = (await response.json()) as GoogleTokenInfo;

    // Check audience
    if (payload.aud !== GOOGLE_CLIENT_ID) {
      console.warn(`[Auth] Token audience mismatch: ${payload.aud} !== ${GOOGLE_CLIENT_ID}`);
      return null;
    }

    // Check email
    const email = payload.email?.toLowerCase().trim();
    if (email !== ALLOWED_EMAIL) {
      console.warn(`[Auth] Email not allowed: ${email} !== ${ALLOWED_EMAIL}`);
      return null;
    }

    // Check email verified
    const isVerified = payload.email_verified === true || payload.email_verified === "true";
    if (!isVerified) {
      console.warn("[Auth] Email not verified by Google");
      return null;
    }

    const now = Date.now();
    return {
      email,
      name: payload.name || "Lutfi Zain",
      picture: payload.picture || "",
      issuedAt: now,
      expiresAt: now + SESSION_MAX_AGE_SECONDS * 1000,
    };
  } catch (err) {
    console.error("[Auth] Error verifying Google token:", err);
    return null;
  }
}

/**
 * Sign session payload to create token string
 */
export function signSession(session: UserSession): string {
  const secret = getSessionSecret();
  const data = Buffer.from(JSON.stringify(session)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${signature}`;
}

/**
 * Verify signed token and return UserSession if valid
 */
export function verifySessionToken(token: string): UserSession | null {
  if (!token || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [dataPart, signaturePart] = parts;
  const secret = getSessionSecret();
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(dataPart)
    .digest("base64url");

  const sigBuffer = Buffer.from(signaturePart);
  const expectedSigBuffer = Buffer.from(expectedSignature);

  if (sigBuffer.length !== expectedSigBuffer.length) return null;
  if (!crypto.timingSafeEqual(sigBuffer, expectedSigBuffer)) return null;

  try {
    const rawJson = Buffer.from(dataPart, "base64url").toString("utf-8");
    const session = JSON.parse(rawJson) as UserSession;

    if (!session || typeof session !== "object") return null;
    if (session.email !== ALLOWED_EMAIL) return null;
    if (typeof session.expiresAt !== "number" || session.expiresAt <= Date.now()) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

/**
 * Extract and verify UserSession from Request Cookie header
 */
export function getSession(req: Request): UserSession | null {
  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(";");
  for (const cookie of cookies) {
    const [name, ...rest] = cookie.trim().split("=");
    if (name === COOKIE_NAME) {
      const val = rest.join("=");
      return verifySessionToken(val);
    }
  }

  return null;
}

/**
 * Create Set-Cookie header value
 */
export function createSessionCookie(session: UserSession, secure: boolean = false): string {
  const token = signSession(session);
  const secureFlag = secure ? "; Secure" : "";
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}${secureFlag}`;
}

/**
 * Create Set-Cookie header to clear the session cookie
 */
export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}
