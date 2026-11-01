import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { VaultManager, DEFAULT_VAULT_PATH } from "$lib/server/vault";
import type { SSEEvent, VaultInfo } from "$lib/types";

export const sseClients = new Set<ReadableStreamDefaultController>();

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

export interface RegisteredVault {
  info: VaultInfo;
  manager: VaultManager;
  unwatch: () => void;
}

export class MultiVaultManager {
  private vaults: Map<string, RegisteredVault> = new Map();
  private configPath: string = path.join(os.homedir(), ".donna/vaults.json");

  constructor() {
    this.discoverKnownVaults();
  }

  private discoverKnownVaults(): void {
    // 1. Primary Global Vault
    this.register("global", "Donna Global Vault", DEFAULT_VAULT_PATH, true);

    // 2. Projects OKF Vault if it exists
    const projectsOkf = "/home/ubuntu/projects/.okf";
    if (fs.existsSync(projectsOkf)) {
      this.register("projects", "Projects OKF", projectsOkf, false);
    }

    // 3. Scan subdirectories in /home/ubuntu/projects for .okf folders
    try {
      const projectsDir = "/home/ubuntu/projects";
      if (fs.existsSync(projectsDir)) {
        const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const subOkf = path.join(projectsDir, entry.name, ".okf");
            if (fs.existsSync(subOkf)) {
              const id = `proj-${entry.name}`;
              if (!this.vaults.has(id)) {
                this.register(id, `Project: ${entry.name}`, subOkf, false);
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn("[MultiVault] Project scan warning:", err);
    }

    // 4. Load custom user-registered vaults from ~/.donna/vaults.json
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, "utf-8");
        const custom = JSON.parse(raw) as Array<{ id: string; name: string; path: string }>;
        for (const v of custom) {
          if (fs.existsSync(v.path) && !this.vaults.has(v.id)) {
            this.register(v.id, v.name, v.path, false);
          }
        }
      }
    } catch (err) {
      console.warn("[MultiVault] Could not read custom vaults.json:", err);
    }
  }

  public register(
    id: string,
    name: string,
    absPath: string,
    isDefault = false
  ): VaultInfo {
    const manager = new VaultManager(absPath);
    const unwatch = manager.watch(() => {
      broadcastSSE({ type: "vault_updated", data: { vaultId: id } });
    });

    let count = 0;
    try {
      count = manager.getGraph().stats.concepts;
    } catch (e) {
      console.warn(`[MultiVault] Could not get concept count for ${id}:`, e);
    }

    const info: VaultInfo = {
      id,
      name,
      path: absPath,
      conceptCount: count,
      isDefault,
    };

    this.vaults.set(id, { info, manager, unwatch });
    return info;
  }

  public getVaultList(): VaultInfo[] {
    const list: VaultInfo[] = [];
    for (const [, item] of this.vaults.entries()) {
      try {
        item.info.conceptCount = item.manager.getGraph().stats.concepts;
      } catch {}
      list.push(item.info);
    }
    return list;
  }

  public getVault(id?: string | null): { info: VaultInfo; manager: VaultManager } {
    if (id && this.vaults.has(id)) {
      return this.vaults.get(id)!;
    }
    return this.vaults.get("global")!;
  }

  public addCustomVault(name: string, folderPath: string): VaultInfo {
    const resolved = path.resolve(folderPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Folder tidak ditemukan: ${resolved}`);
    }
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      throw new Error(`Path bukan merupakan direktori: ${resolved}`);
    }

    // Slugify id
    const cleanId = name
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-|-$/g, "") || `vault-${Date.now()}`;

    if (this.vaults.has(cleanId)) {
      throw new Error(`Vault dengan nama tersebut sudah ada (${cleanId})`);
    }

    const info = this.register(cleanId, name, resolved, false);

    // Save to ~/.donna/vaults.json
    try {
      const customList = this.getVaultList()
        .filter((v) => v.id !== "global" && v.id !== "projects" && !v.id.startsWith("proj-"))
        .map((v) => ({ id: v.id, name: v.name, path: v.path }));
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.configPath, JSON.stringify(customList, null, 2), "utf-8");
    } catch (err) {
      console.warn("[MultiVault] Failed to persist vaults.json:", err);
    }

    return info;
  }
}

export const multiVault = new MultiVaultManager();

// Backwards compatibility for single-vault calls
export const vaultManager = multiVault.getVault("global").manager;

// Keepalive ping every 30s
setInterval(() => {
  broadcastSSE({ type: "ping" });
}, 30000);
