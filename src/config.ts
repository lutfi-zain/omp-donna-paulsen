import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { DonnaConfig, HindsightConfig } from "./types.js";

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
      detectSystemUserName() ||
      "Principal";
  }

  // Resolve Hindsight config from OMP agent config or env
  const hindsight = resolveHindsightConfig();

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
    hindsight,
  };
}

function resolveHindsightConfig(): HindsightConfig | null {
  // Check env vars first
  const envUrl = process.env.HINDSIGHT_API_URL;
  const envToken = process.env.HINDSIGHT_API_TOKEN;
  if (envUrl && envToken) {
    return {
      apiUrl: envUrl,
      apiToken: envToken,
      bankId: process.env.HINDSIGHT_BANK_ID || "omp",
    };
  }

  // Try reading from OMP agent config.yml
  try {
    const configPath = path.join(os.homedir(), ".omp", "agent", "config.yml");
    if (!fs.existsSync(configPath)) return null;
    const raw = fs.readFileSync(configPath, "utf-8");

    // Simple extraction — avoid YAML parser dependency
    const urlMatch = raw.match(/apiUrl:\s*(.+)/);
    const tokenMatch = raw.match(/apiToken:\s*(.+)/);
    if (!urlMatch || !tokenMatch) return null;

    const apiUrl = urlMatch[1].trim();
    const apiToken = tokenMatch[1].trim();
    if (!apiUrl.startsWith("http") || !apiToken.startsWith("hs_")) return null;

    return { apiUrl, apiToken, bankId: "omp" };
  } catch {
    return null;
  }
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

function detectSystemUserName(): string | null {
  try {
    const { execSync } = require("node:child_process");
    const gitName = execSync("git config user.name", { encoding: "utf-8", timeout: 500 }).trim();
    if (gitName) return gitName;
  } catch {}
  try {
    const user = os.userInfo().username;
    if (user && user !== "root") {
      return user.charAt(0).toUpperCase() + user.slice(1);
    }
  } catch {}
  return null;
}
