import fs from "node:fs";
import path from "node:path";
import type { OKFConcept, CommitmentConcept } from "../types.js";

export class OKFScanner {
  private bundlePath: string;
  private cache: Map<string, OKFConcept> = new Map();
  private lastScanTime: number = 0;

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

    this.lastScanTime = Date.now();
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
   * Fast entity lookup by tokens/n-grams.
   */
  public findMatchingConcepts(tokens: string[]): OKFConcept[] {
    const all = this.getAllConcepts();
    const matched = new Set<OKFConcept>();

    for (const concept of all) {
      const titleLower = concept.title.toLowerCase();
      const slugLower = concept.slug.toLowerCase();
      const titleWords = titleLower
        .split(/[\s\-_/.,:;()]+/)
        .filter((w) => w.length >= 4 && !["agents", "json", "yaml", "index"].includes(w));

      const normTitle = titleLower.replace(/th/g, "t").replace(/[-\s]/g, "");
      const normSlug = slugLower.replace(/th/g, "t").replace(/[-\s]/g, "");

      for (const token of tokens) {
        const isPhrase = token.includes(" ");
        const normToken = token.replace(/th/g, "t").replace(/[-\s]/g, "");

        // 1. Exact match on title or slug
        if (
          titleLower === token ||
          slugLower === token ||
          normTitle === normToken ||
          normSlug === normToken
        ) {
          matched.add(concept);
          break;
        }

        // 2. Significant discrete word in title (>= 4 chars)
        if (token.length >= 4 && titleWords.includes(token)) {
          matched.add(concept);
          break;
        }

        // 3. Multi-word compound phrase match
        if (isPhrase && (titleLower.includes(token) || normTitle.includes(normToken))) {
          matched.add(concept);
          break;
        }

        // 4. Tag matching
        if (
          concept.tags.some(
            (tag) =>
              tag.toLowerCase().replace(/th/g, "t").replace(/[-\s]/g, "") === normToken ||
              tag.toLowerCase() === token
          )
        ) {
          matched.add(concept);
          break;
        }
      }
    }

    return Array.from(matched);
  }
}
