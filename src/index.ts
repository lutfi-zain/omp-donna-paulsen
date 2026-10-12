import path from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { resolveDonnaConfig } from "./config.js";
import { OKFScanner } from "./okf/scanner.js";
import { buildIngressContext } from "./context/ingress.js";
import { EgressMemoryWorker } from "./memory/egress.js";
import { syncChangedConcepts, recallFromHindsight } from "./memory/hindsight-sync.js";
import { registerDonnaTools } from "./tools/index.js";
import { initializeDonnaVault } from "./init.js";

export default function donnaPaulsen(pi: ExtensionAPI) {
  pi.setLabel("Donna Paulsen Assistant");

  let config = resolveDonnaConfig(process.cwd());
  const scanner = new OKFScanner(config.bundlePath);
  const egressWorker = new EgressMemoryWorker(config);

  let lastSyncMs = 0;
  // Initial warm-up scan
  scanner.scan();

  // Lifecycle: session_start
  pi.on("session_start", async (_event, ctx) => {
    config = resolveDonnaConfig(ctx.cwd);
    scanner.setBundlePath(config.bundlePath);
    egressWorker.updateConfig(config);

    // Zero-config first run: if no vault exists yet, Donna proactively bootstraps the global vault!
    if (!scanner.isBundleAvailable()) {
      const vaultTargetDir = path.dirname(config.globalVaultPath);
      initializeDonnaVault(vaultTargetDir, config.principalName);
      config = resolveDonnaConfig(ctx.cwd);
      scanner.setBundlePath(config.bundlePath);
      egressWorker.updateConfig(config);
      scanner.scan();

      if (ctx.hasUI) {
        ctx.ui.notify(
          `Donna Paulsen: I'm Donna. I've set up your executive vault at ${vaultTargetDir}. I know everything.`,
          "info"
        );
      }
      return;
    }

    scanner.scan();
    const count = scanner.getAllConcepts().length;
    if (ctx.hasUI) {
      ctx.ui.notify(
        `Donna Paulsen Assistant: ${count} concepts active (${config.principalName})`,
        "info"
      );
    }
  });

  let currentTurnPrompt = "";
  let currentTurnResponse = "";

  // Hot-Path Ingress: before_agent_start
  // 1. Entity resolution from OKF (< 5ms) — people, orgs, commitments
  // 2. Hindsight recall (< 500ms) — topical semantic memory
  pi.on("before_agent_start", async (event) => {
    currentTurnPrompt = typeof event.prompt === "string" ? event.prompt : "";
    currentTurnResponse = "";

    if (!config.contextPulling || !scanner.isBundleAvailable()) {
      return;
    }

    const promptText = typeof event.prompt === "string" ? event.prompt : "";
    if (!promptText) return;

    // Layer 1: OKF entity resolution (people, orgs, commitments — 0% noise)
    const ingress = buildIngressContext(promptText, scanner, config);

    // Layer 2: Hindsight topical recall (semantic + temporal + graph)
    let hindsightBlock = "";
    if (config.hindsight) {
      const recalled = await recallFromHindsight(promptText, config);
      if (recalled.length > 0) {
        hindsightBlock = [
          "<donna-recall source=\"hindsight\">",
          ...recalled,
          "</donna-recall>",
        ].join("\n");
      }
    }

    const combined = [ingress.xmlContext, hindsightBlock].filter(Boolean).join("\n");
    if (!combined) return;

    return {
      message: {
        customType: "donna-context-injected",
        content: combined,
        display: false,
        attribution: "agent",
      },
    };
  });

  // Collect assistant response text for turn recording
  pi.on("assistant_message", async (event) => {
    if (event?.message?.content && Array.isArray(event.message.content)) {
      for (const block of event.message.content) {
        if (block && block.type === "text" && typeof block.text === "string") {
          currentTurnResponse += block.text;
        }
      }
    }
  });

  // Cold-Path Egress: agent_end (asynchronous background consolidation)
  pi.on("agent_end", (event, ctx) => {
    if (!config.autoConsolidate || !scanner.isBundleAvailable()) return;

    if (currentTurnPrompt) {
      egressWorker.enqueueTurn(Date.now().toString(), currentTurnPrompt, currentTurnResponse);
      currentTurnPrompt = "";
      currentTurnResponse = "";
    }

    // Use managed timer for isolation
    ctx.setTimeout(async () => {
      await egressWorker.processQueue();

      // Sync changed OKF concepts to Hindsight (background, non-blocking)
      if (config.hindsight) {
        scanner.scan();
        await syncChangedConcepts(scanner, config, lastSyncMs).catch(() => {});
        lastSyncMs = Date.now();
      }
    }, config.consolidationDelayMs);
  });

  // Register Native Custom Tools
  registerDonnaTools(pi, scanner, config);

  // Register Slash Command: /donna
  pi.registerCommand("donna", {
    description: "Donna Engine status and controls",
    handler: async (args, ctx) => {
      const sub = (args || "").trim();
      scanner.scan();
      const count = scanner.getAllConcepts().length;
      const commitments = scanner.getActiveCommitments(2).length;

      if (sub.startsWith("init")) {
        const parts = sub.split(" ");
        const targetName = parts[1] || config.principalName || "Principal";
        const result = initializeDonnaVault(ctx.cwd, targetName);
        config = resolveDonnaConfig(ctx.cwd);
        scanner.setBundlePath(config.bundlePath);
        scanner.scan();
        ctx.ui.notify(result.message, "info");
        return;
      }

      if (sub === "rescan") {
        scanner.scan();
        ctx.ui.notify(`Rescanned: ${count} concepts indexed.`, "info");
        return;
      }

      ctx.ui.notify(
        `Donna Paulsen Assistant Status:\n- Bundle: ${scanner.getBundlePath()}\n- Principal: ${config.principalName}\n- Concepts: ${count}\n- Active Commitments: ${commitments}`,
        "info"
      );
    },
  });
}
