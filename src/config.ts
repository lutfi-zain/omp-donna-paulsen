import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { DonnaConfig } from "./types.js";

export function resolveDonnaConfig(cwd: string, overrides: Partial<DonnaConfig> = {}): DonnaConfig {
  const globalVaultPath =
    process.env.DONNA_GLOBAL_VAULT ||
    path.join(os.homedir(), ".donna", "vault", ".okf");

  const envBundle = process.env.DONNA_BUNDLE_PATH;
  let resolvedBundle = "";
  let scope: "project" | "global" = "global";

  if (overrides.bundlePath) {
    resolvedBundle = path.isAbsolute(overrides.bundlePath)
      ? overrides.bundlePath
      : path.resolve(cwd, overrides.bundlePath);
    scope = "project";
  } else if (envBundle) {
    resolvedBundle = path.isAbsolute(envBundle)
      ? envBundle
      : path.resolve(cwd, envBundle);
    scope = "project";
  } else {
    // 1. Ancestor Walk: look for project vault from cwd climbing upwards
    const projectVault = findNearestProjectVault(cwd);
    if (projectVault) {
      resolvedBundle = projectVault;
      scope = "project";
    } else {
      // 2. Fallback: User Global Vault
      resolvedBundle = globalVaultPath;
      scope = "global";
    }
  }

  // Detect principal name
  let principalName = overrides.principalName || process.env.DONNA_PRINCIPAL || "";
  if (!principalName || principalName === "auto") {
    principalName =
      detectPrincipalName(resolvedBundle) ||
      detectPrincipalName(globalVaultPath) ||
      "Lutfi";
  }

  return {
    bundlePath: resolvedBundle,
    globalVaultPath,
    scope,
    personaName: overrides.personaName || process.env.DONNA_PERSONA || "Donna",
    principalName,
    contextPulling: overrides.contextPulling ?? true,
    maxContextTokens: overrides.maxContextTokens ?? 2500,
    entityMatching: overrides.entityMatching ?? "hybrid",
    autoConsolidate: overrides.autoConsolidate ?? true,
    autoJournal: overrides.autoJournal ?? true,
    autoGitCommit: overrides.autoGitCommit ?? true,
    consolidationDelayMs: overrides.consolidationDelayMs ?? 250,
  };
}

/**
 * Climb upward from current directory to repository root / home directory
 * looking for the nearest non-empty .okf directory (mirroring OMP's AGENTS.md resolution).
 */
export function findNearestProjectVault(startDir: string): string | null {
  let current = path.resolve(startDir);
  const home = path.resolve(os.homedir());

  while (true) {
    const candidate = path.join(current, ".okf");
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }

    // Stop climbing if we hit home or filesystem root
    if (current === home || current === path.dirname(current)) {
      break;
    }

    current = path.dirname(current);
  }

  return null;
}

function detectPrincipalName(bundlePath: string): string | null {
  try {
    const profileDir = path.join(bundlePath, "profile");
    if (!fs.existsSync(profileDir)) return null;

    const files = fs.readdirSync(profileDir);
    for (const file of files) {
      if (file.endsWith(".md") && file !== "index.md") {
        const basename = path.basename(file, ".md");
        return basename.charAt(0).toUpperCase() + basename.slice(1);
      }
    }
  } catch {
    // Ignore detection error
  }
  return null;
}
