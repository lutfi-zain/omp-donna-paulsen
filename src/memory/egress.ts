import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DonnaConfig } from "../types.js";

const execFileAsync = promisify(execFile);

export class EgressMemoryWorker {
  private config: DonnaConfig;
  private isProcessing: boolean = false;
  private pendingQueue: Array<{
    turnId: string;
    prompt: string;
    responsePreview: string;
    timestamp: number;
  }> = [];

  constructor(config: DonnaConfig) {
    this.config = config;
  }

  public updateConfig(config: DonnaConfig): void {
    this.config = config;
  }

  public enqueueTurn(turnId: string, prompt: string, responsePreview: string): void {
    if (!this.config.autoConsolidate) return;

    this.pendingQueue.push({
      turnId,
      prompt,
      responsePreview,
      timestamp: Date.now(),
    });
  }

  public async processQueue(): Promise<void> {
    if (this.isProcessing || this.pendingQueue.length === 0) return;
    this.isProcessing = true;

    try {
      const itemsToProcess = [...this.pendingQueue];
      this.pendingQueue = [];

      for (const item of itemsToProcess) {
        if (this.config.autoJournal) {
          await this.recordTurnInJournal(item);
        }
      }

      if (this.config.autoGitCommit) {
        await this.syncGitRepository();
      }
    } catch {
      // Background worker catches errors cleanly to protect session
    } finally {
      this.isProcessing = false;
    }
  }

  private async recordTurnInJournal(item: { prompt: string; responsePreview: string; timestamp: number }): Promise<void> {
    const bundlePath = this.config.bundlePath;
    if (!fs.existsSync(bundlePath)) return;

    // Use Asia/Jakarta time (WIB)
    const now = new Date(item.timestamp);
    const wibFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const dateStr = wibFormatter.format(now); // "YYYY-MM-DD"
    const [year, month] = dateStr.split("-");

    const journalDir = path.join(bundlePath, "journal", year, month);
    if (!fs.existsSync(journalDir)) {
      fs.mkdirSync(journalDir, { recursive: true });
    }

    const journalFile = path.join(journalDir, `${dateStr}.md`);
    const timeFormatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const timeStr = timeFormatter.format(now);

    const logEntry = `- **${timeStr} WIB**: ${item.prompt.slice(0, 150).replace(/\n/g, " ")}\n`;

    if (!fs.existsSync(journalFile)) {
      const initialContent = `---
type: Journal Entry
title: Jurnal ${dateStr}
description: Aktivitas dan ringkasan interaksi pada ${dateStr}.
tags:
  - journal
date: '${dateStr}'
generated:
  by: donna-engine
  at: '${now.toISOString()}'
---

# Aktivitas

${logEntry}
# Catatan Donna

`;
      fs.writeFileSync(journalFile, initialContent, "utf-8");
    } else {
      const existing = fs.readFileSync(journalFile, "utf-8");
      if (existing.includes("# Aktivitas")) {
        const updated = existing.replace("# Aktivitas\n", `# Aktivitas\n\n${logEntry}`);
        fs.writeFileSync(journalFile, updated, "utf-8");
      } else {
        fs.appendFileSync(journalFile, `\n# Aktivitas\n\n${logEntry}`, "utf-8");
      }
    }
  }

  private async syncGitRepository(): Promise<void> {
    const bundlePath = this.config.bundlePath;
    const gitDir = path.join(bundlePath, ".git");
    const parentGitDir = path.join(bundlePath, "..", ".git");

    if (!fs.existsSync(gitDir) && !fs.existsSync(parentGitDir)) {
      return;
    }

    try {
      const targetDir = fs.existsSync(gitDir) ? bundlePath : path.dirname(bundlePath);
      await execFileAsync("git", ["-C", targetDir, "add", bundlePath]);
      await execFileAsync("git", [
        "-C",
        targetDir,
        "commit",
        "-m",
        "donna: auto background memory consolidation",
        "--quiet",
      ]);
    } catch {
      // Ignore if there's nothing to commit
    }
  }
}
