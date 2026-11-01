import fs from "node:fs";
import path from "node:path";
import type { OKFConcept, CommitmentConcept } from "../types.js";

export class OKFScanner {
  private bundlePath: string;
  private cache: Map<string, OKFConcept> = new Map();
  private lastScanTime: number = 0;
  private titleWordFrequency: Map<string, number> = new Map();

  constructor(bundlePath: string) {
    this.bundlePath = bundlePath;
  }

  public setBundlePath(bundlePath: string): void {
    if (this.bundlePath !== bundlePath) {
      this.bundlePath = bundlePath;
      this.cache.clear();
      this.lastScanTime = 0;
    }
  }

  public getBundlePath(): string {
    return this.bundlePath;
  }

  public isBundleAvailable(): boolean {
    return fs.existsSync(this.bundlePath) && fs.statSync(this.bundlePath).isDirectory();
  }

  /**
   * Fast scan across known OKF directories with mtime caching.
   * Execution time < 5ms when cached.
   */
  public scan(): void {
    if (!this.isBundleAvailable()) return;

    const directoriesToScan = [
      "people",
      "projects",
      "goals",
      "organizations",
      "profile",
      "commitments",
      "decisions",
      "knowledge",
      "persona",
    ];

    for (const dirName of directoriesToScan) {
      const fullDir = path.join(this.bundlePath, dirName);
      if (!fs.existsSync(fullDir)) continue;

      this.scanDirectoryRecursively(fullDir);
    }

    this.computeTitleWordFrequencies();
    this.lastScanTime = Date.now();
  }

  private computeTitleWordFrequencies(): void {
    this.titleWordFrequency.clear();
    for (const concept of this.cache.values()) {
      const words = new Set(
        concept.title
          .toLowerCase()
          .split(/[^\p{L}\p{N}]+/gu)
          .filter((w) => w.length >= 2)
      );
      for (const w of words) {
        this.titleWordFrequency.set(w, (this.titleWordFrequency.get(w) || 0) + 1);
      }
    }
  }

  private scanDirectoryRecursively(dirPath: string): void {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          this.scanDirectoryRecursively(fullPath);
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          if (entry.name === "index.md" || entry.name === "log.md") continue;
          this.indexFile(fullPath);
        }
      }
    } catch {
      // Ignore read errors gracefully
    }
  }

  private indexFile(filePath: string): void {
    try {
      const stats = fs.statSync(filePath);
      const existing = this.cache.get(filePath);

      if (existing && existing.mtime === stats.mtimeMs) {
        return; // Cache valid
      }

      const content = fs.readFileSync(filePath, "utf-8");
      const parsed = this.parseConceptFile(filePath, content, stats.mtimeMs);
      if (parsed) {
        this.cache.set(filePath, parsed);
      }
    } catch {
      // Ignore parse failure
    }
  }

  private parseConceptFile(filePath: string, content: string, mtime: number): OKFConcept | null {
    const relativePath = path.relative(this.bundlePath, filePath);
    const slug = path.basename(filePath, ".md");

    // Extract frontmatter
    let frontmatter: Record<string, unknown> = {};
    let body = content;

    if (content.startsWith("---")) {
      const parts = content.split("---");
      if (parts.length >= 3) {
        const fmText = parts[1];
        body = parts.slice(2).join("---").trim();
        frontmatter = this.parseSimpleYaml(fmText);
      }
    }

    const type = String(frontmatter.type || "Concept");
    const title = String(frontmatter.title || slug);
    const description = frontmatter.description ? String(frontmatter.description) : undefined;
    const relationship = frontmatter.relationship ? String(frontmatter.relationship) : undefined;
    const status = frontmatter.status ? String(frontmatter.status) : undefined;

    let tags: string[] = [];
    if (Array.isArray(frontmatter.tags)) {
      tags = frontmatter.tags.map(String);
    }

    // Generate concise summary (first 2 paragraphs of body, max 400 chars)
    const paragraphs = body
      .split("\n\n")
      .map((p) => p.trim())
      .filter((p) => p.length > 0 && !p.startsWith("#"));
    const contentSummary = paragraphs.slice(0, 2).join("\n").slice(0, 400);

    return {
      path: relativePath,
      slug,
      type,
      title,
      description,
      tags,
      relationship,
      status,
      frontmatter,
      contentSummary,
      rawContent: body,
      mtime,
    };
  }

  private parseSimpleYaml(yamlText: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const lines = yamlText.split("\n");

    for (const line of lines) {
      // Only parse top-level YAML keys (zero indentation)
      if (!line || line.startsWith(" ") || line.startsWith("\t")) continue;
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const colonIdx = trimmed.indexOf(":");
      if (colonIdx === -1) continue;

      const key = trimmed.slice(0, colonIdx).trim();
      let value = trimmed.slice(colonIdx + 1).trim();

      if (value.startsWith("[") && value.endsWith("]")) {
        // Simple inline array: [a, b, c]
        const items = value
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
          .filter(Boolean);
        result[key] = items;
      } else {
        // Strip quotes
        value = value.replace(/^['"]|['"]$/g, "");
        result[key] = value;
      }
    }

    return result;
  }

  public getAllConcepts(): OKFConcept[] {
    this.scan();
    return Array.from(this.cache.values());
  }

  public getConceptsByType(type: string): OKFConcept[] {
    return this.getAllConcepts().filter(
      (c) => c.type.toLowerCase() === type.toLowerCase()
    );
  }

  public getActiveCommitments(withinDays: number = 2): CommitmentConcept[] {
    const commitments = this.getAllConcepts().filter(
      (c) => c.type.toLowerCase() === "commitment" || c.path.startsWith("commitments/")
    );

    const now = new Date();
    const futureLimit = new Date();
    futureLimit.setDate(now.getDate() + withinDays);

    const active: CommitmentConcept[] = [];

    for (const c of commitments) {
      const state = String(c.frontmatter.commitment_state || "open").toLowerCase();
      if (state !== "open") continue;

      const dueDateStr = c.frontmatter.due_date ? String(c.frontmatter.due_date) : undefined;
      let dueDate: Date | undefined;
      if (dueDateStr) {
        dueDate = new Date(dueDateStr);
      }

      // Check if due within range
      if (!dueDate || dueDate <= futureLimit) {
        active.push({
          ...c,
          dueDate: dueDateStr,
          state: "open",
        });
      }
    }

    return active;
  }

  /**
   * Entity Resolution — not topic search.
   *
   * Donna knows people and deadlines. She does NOT compete with Hindsight
   * on topical/semantic retrieval.
   *
   * Matchable concept types (high-touch entities):
   *   people, organizations, persona, projects, decisions, commitments
   *
   * NOT matched (Hindsight handles these):
   *   knowledge/*, guides, architecture research, playbooks, preferences
   *
   * Matching rules (scored, ranked, capped):
   *   +3  Exact slug or title match
   *   +2  Person first/last name match (proper noun)
   *   +1  Bigram phrase found in title
   *
   * Max 5 results, sorted by score descending.
   */
  public findMatchingConcepts(tokens: string[]): OKFConcept[] {
    const ENTITY_DIRS = new Set([
      "people", "organizations", "persona", "projects", "decisions", "commitments",
    ]);
    const MAX_RESULTS = 5;

    const scored: { concept: OKFConcept; score: number }[] = [];

    for (const concept of this.cache.values()) {
      // Only match high-touch entity types
      const topDir = concept.path.split("/")[0];
      if (!ENTITY_DIRS.has(topDir)) continue;

      const titleLower = concept.title.toLowerCase();
      const slugLower = concept.slug.toLowerCase();
      const normTitle = titleLower.replace(/th/g, "t").replace(/[-\s]/g, "");
      const normSlug = slugLower.replace(/th/g, "t").replace(/[-\s]/g, "");
      const isPerson = topDir === "people" || topDir === "persona";
      const titleWords = titleLower.split(/[^\p{L}\p{N}]+/gu).filter((w) => w.length >= 2);
      const nWords = titleWords.length;

      let bestScore = 0;

      for (const token of tokens) {
        const normToken = token.replace(/th/g, "t").replace(/[-\s]/g, "");
        const isPhrase = token.includes(" ");

        // Rule 1: Exact slug or title match (+10)
        if (
          titleLower === token ||
          slugLower === token ||
          normTitle === normToken ||
          normSlug === normToken
        ) {
          bestScore = Math.max(bestScore, 10);
          continue;
        }

        // Rule 2: Multi-word phrase (bigram) found in title (+5)
        if (isPhrase && (titleLower.includes(token) || normTitle.includes(normToken))) {
          bestScore = Math.max(bestScore, 5);
          continue;
        }

        // Rule 3: Distinctive proper name for short entities (<= 3 words) (+3)
        // Language-Agnostic: evaluated against dynamic corpus document frequency (IDF).
        // Any word appearing across > 2 concepts (e.g. "pak", "dan", "for", "the", "system")
        // is automatically treated as generic in this vault, without any hardcoded dictionary.
        if (isPerson && nWords <= 3 && !isPhrase) {
          if (titleWords.includes(token)) {
            const freq = this.titleWordFrequency.get(token) || 0;
            if (freq <= 2) {
              bestScore = Math.max(bestScore, 3);
              continue;
            }
          }
        }
      }

      if (bestScore > 0) {
        scored.push({ concept, score: bestScore });
      }
    }

    // Sort by score descending, then by mtime (most recent first)
    scored.sort((a, b) => b.score - a.score || b.concept.mtime - a.concept.mtime);

    return scored.slice(0, MAX_RESULTS).map((s) => s.concept);
  }
}
