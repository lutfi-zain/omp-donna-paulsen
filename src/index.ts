import path from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { resolveDonnaConfig } from "./config.js";
import { OKFScanner } from "./okf/scanner.js";
import { buildIngressContext } from "./context/ingress.js";
import { EgressMemoryWorker } from "./memory/egress.js";
import { registerDonnaTools } from "./tools/index.js";
import { initializeDonnaVault } from "./init.js";

export default function donnaPaulsen(pi: ExtensionAPI) {
  pi.setLabel("Donna Paulsen Assistant");

  let config = resolveDonnaConfig(process.cwd());
  const scanner = new OKFScanner(config.bundlePath);
  const egressWorker = new EgressMemoryWorker(config);

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

  // Hot-Path Ingress: before_agent_start (< 15ms)
  pi.on("before_agent_start", async (event) => {
    if (!config.contextPulling || !scanner.isBundleAvailable()) {
      return;
    }

    const promptText = typeof event.prompt === "string" ? event.prompt : "";
    if (!promptText) return;

    const ingress = buildIngressContext(promptText, scanner, config);
    if (!ingress.xmlContext) return;

    // Append high-density context to prompt
    const basePrompt = typeof event.prompt === "string" ? event.prompt : "";
    return {
      message: {
        customType: "donna-context-injected",
        content: ingress.xmlContext,
        display: false,
        attribution: "agent",
      },
    };
  });

  // Cold-Path Egress: agent_end (asynchronous background consolidation)
  pi.on("agent_end", (event, ctx) => {
    if (!config.autoConsolidate || !scanner.isBundleAvailable()) return;

    // Use managed timer for isolation
    ctx.setTimeout(async () => {
      await egressWorker.processQueue();
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
