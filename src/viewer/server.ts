import path from "node:path";
import { VaultManager, DEFAULT_VAULT_PATH } from "./vault.js";
import {
  getSession,
  verifyGoogleToken,
  verifyPasscode,
  createSessionCookie,
  clearSessionCookie,
  GOOGLE_CLIENT_ID,
} from "./auth.js";
import { streamTTS } from "./tts.js";
import type { SSEEvent } from "./types.js";

const PORT = Number(process.env.PORT || 3456);
const PUBLIC_DIR = path.join(import.meta.dir, "public");
const VAULT_PATH = process.env.DONNA_VAULT_PATH || DEFAULT_VAULT_PATH;

const vaultManager = new VaultManager(VAULT_PATH);
const sseClients = new Set<ReadableStreamDefaultController>();

/**
 * Broadcast an event to all connected SSE clients
 */
export function broadcastSSE(event: SSEEvent): void {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  const textEncoder = new TextEncoder();
  const bytes = textEncoder.encode(payload);

  for (const controller of sseClients) {
    try {
      controller.enqueue(bytes);
    } catch {
      sseClients.delete(controller);
    }
  }
}

// Start vault watcher
const unwatch = vaultManager.watch(() => {
  console.log("[Server] Vault change detected, broadcasting update to clients...");
  broadcastSSE({ type: "vault_updated" });
});

// Periodic SSE keepalive ping every 30s
const pingInterval: NodeJS.Timeout = setInterval(() => {
  broadcastSSE({ type: "ping" });
}, 30000);

/**
 * Main HTTP request handler
 */
export async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname;
  const method = req.method;

  // 1. Google OAuth Token Exchange
  if (method === "POST" && pathname === "/api/auth/google") {
    try {
      const body = (await req.json()) as { credential?: string };
      if (!body?.credential) {
        return Response.json({ ok: false, error: "Missing credential token" }, { status: 400 });
      }

      const session = await verifyGoogleToken(body.credential);
      if (!session) {
        return Response.json(
          { ok: false, error: "Forbidden: Unauthorized Google user" },
          { status: 403 }
        );
      }

      const isSecure = url.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
      const cookieHeader = createSessionCookie(session, isSecure);

      return Response.json(
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
            "Set-Cookie": cookieHeader,
          },
        }
      );
    } catch (err) {
      console.error("[Server] Google auth error:", err);
      return Response.json({ ok: false, error: "Authentication failed" }, { status: 500 });
    }
  }
  // Passcode Authentication Fallback
  if (method === "POST" && pathname === "/api/auth/passcode") {
    try {
      const body = (await req.json()) as { passcode?: string };
      const session = verifyPasscode(body.passcode || "");
      if (!session) {
        return Response.json({ ok: false, error: "Executive Passcode salah." }, { status: 401 });
      }
      const cookieHeader = createSessionCookie(session);
      return Response.json(
        {
          ok: true,
          user: {
            email: session.email,
            name: session.name,
          },
        },
        {
          headers: {
            "Set-Cookie": cookieHeader,
          },
        }
      );
    } catch (err) {
      return Response.json({ ok: false, error: "Permintaan tidak valid." }, { status: 400 });
    }
  }


  // Auth Config
  if (method === "GET" && pathname === "/api/auth/config") {
    return Response.json({
      clientId: GOOGLE_CLIENT_ID,
    });
  }

  // 2. Current Session Check
  if (method === "GET" && pathname === "/api/auth/me") {
    const session = getSession(req);
    if (session) {
      return Response.json({
        authenticated: true,
        user: {
          email: session.email,
          name: session.name,
          picture: session.picture,
        },
      });
    }
    return Response.json({ authenticated: false });
  }

  // 3. Logout
  if (method === "POST" && pathname === "/api/auth/logout") {
    return Response.json(
      { ok: true },
      {
        headers: {
          "Set-Cookie": clearSessionCookie(),
        },
      }
    );
  }

  // 4. Protected API Route Guard
  if (pathname.startsWith("/api/")) {
    const session = getSession(req);
    if (!session) {
      return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // Graph API
    if (method === "GET" && pathname === "/api/vault/graph") {
      const graph = vaultManager.getGraph();
      return Response.json(graph);
    }

    // Single Concept API
    if (method === "GET" && pathname.startsWith("/api/vault/concept/")) {
      const conceptId = decodeURIComponent(pathname.slice("/api/vault/concept/".length));
      const concept = vaultManager.getConcept(conceptId);
      if (!concept) {
        return Response.json({ error: "Concept not found" }, { status: 404 });
      }
      return Response.json(concept);
    }

    // Text to Speech
    if (method === "GET" && pathname === "/api/tts") {
      const text = url.searchParams.get("text") || "";
      const voice = url.searchParams.get("voice") || undefined;
      const rate = url.searchParams.get("rate") || undefined;
      return streamTTS({ text, voice, rate });
    }

    // SSE Events Stream
    if (method === "GET" && pathname === "/api/events") {
      const textEncoder = new TextEncoder();
      let clientController: ReadableStreamDefaultController | null = null;

      const stream = new ReadableStream({
        start(controller) {
          clientController = controller;
          sseClients.add(controller);
          controller.enqueue(textEncoder.encode(`data: ${JSON.stringify({ type: "connected" })}\n\n`));
        },
        cancel() {
          if (clientController) {
            sseClients.delete(clientController);
          }
        },
      });

      req.signal.addEventListener("abort", () => {
        if (clientController) {
          sseClients.delete(clientController);
        }
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
        },
      });
    }

    return Response.json({ error: "API endpoint not found" }, { status: 404 });
  }

  // 5. Static File Serving from public directory
  let filePath = path.join(PUBLIC_DIR, pathname === "/" ? "index.html" : pathname);

  // Security check to avoid path traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    return new Response("Forbidden", { status: 403 });
  }

  let file = Bun.file(filePath);
  if (await file.exists()) {
    return new Response(file);
  }

  // SPA fallback for non-API routes
  const indexHtml = Bun.file(path.join(PUBLIC_DIR, "index.html"));
  if (await indexHtml.exists()) {
    return new Response(indexHtml, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return new Response("Not Found", { status: 404 });
}

// Start Bun HTTP server
export const server = Bun.serve({
  port: PORT,
  fetch: handleRequest,
});

console.log(`[Donna OKF Viewer] Server running at http://localhost:${server.port}`);

// Graceful shutdown handling
function shutdown(): void {
  console.log("\n[Server] Shutting down Donna OKF Viewer...");
  clearInterval(pingInterval);
  unwatch();
  for (const client of sseClients) {
    try {
      client.close();
    } catch {}
  }
  sseClients.clear();
  server.stop();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
