import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { DonnaConfig } from "./types.js";

export function resolveDonnaConfig(cwd: string, overrides: Partial<DonnaConfig> = {}): DonnaConfig {
  const envBundle = process.env.DONNA_BUNDLE_PATH;
  let resolvedBundle = "";

  if (overrides.bundlePath) {
    resolvedBundle = path.isAbsolute(overrides.bundlePath)
      ? overrides.bundlePath
      : path.resolve(cwd, overrides.bundlePath);
  } else if (envBundle) {
    resolvedBundle = path.isAbsolute(envBundle)
      ? envBundle
      : path.resolve(cwd, envBundle);
  } else {
    const cwdOkf = path.join(cwd, ".okf");
    if (fs.existsSync(cwdOkf) && fs.statSync(cwdOkf).isDirectory()) {
      resolvedBundle = cwdOkf;
    } else {
      const homeBrain = path.join(os.homedir(), ".donna", "brain");
      resolvedBundle = homeBrain;
    }
  }

  // Detect principal name if set to auto or empty
  let principalName = overrides.principalName || process.env.DONNA_PRINCIPAL || "";
  if (!principalName || principalName === "auto") {
    principalName = detectPrincipalName(resolvedBundle) || "Lutfi";
  }

  return {
    bundlePath: resolvedBundle,
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

function detectPrincipalName(bundlePath: string): string | null {
  try {
    const profileDir = path.join(bundlePath, "profile");
    if (!fs.existsSync(profileDir)) return null;

    const files = fs.readdirSync(profileDir);
    for (const file of files) {
      if (file.endsWith(".md") && file !== "index.md") {
        const basename = path.basename(file, ".md");
        // Capitalize first letter
        return basename.charAt(0).toUpperCase() + basename.slice(1);
      }
    }
  } catch {
    // Ignore detection error
  }
  return null;
}
