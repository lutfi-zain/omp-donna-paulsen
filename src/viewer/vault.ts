import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import * as yaml from "js-yaml";
import type { OKFConcept, OKFEdge, OKFGraph, OKFGraphStats } from "./types.js";

export const DEFAULT_VAULT_PATH =
  process.env.DONNA_VAULT_PATH || path.join(os.homedir(), ".donna/vault/.okf");

/**
 * Recursively find all markdown files in directory, ignoring hidden files, index.md and log.md
 */
export function findMarkdownFiles(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) return fileList;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findMarkdownFiles(fullPath, fileList);
    } else if (
      entry.isFile() &&
      entry.name.endsWith(".md") &&
      entry.name !== "index.md" &&
      entry.name !== "log.md"
    ) {
      fileList.push(fullPath);
    }
  }

  return fileList;
}

/**
 * Parse frontmatter and body from markdown content
 */
export function parseConceptFile(
  filePath: string,
  vaultDir: string = DEFAULT_VAULT_PATH
): OKFConcept {
  const content = fs.readFileSync(filePath, "utf-8");
  const relPath = path.relative(vaultDir, filePath);
  const id = relPath.replace(/\.md$/, "");
  const slug = path.basename(filePath, ".md");

  let metadata: Record<string, unknown> = {};
  let body = content;

  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (match) {
    try {
      const parsed = yaml.load(match[1]);
      if (parsed && typeof parsed === "object") {
        metadata = parsed as Record<string, unknown>;
      }
      body = content.slice(match[0].length);
    } catch (err) {
      console.warn(`[Vault] Failed to parse frontmatter in ${relPath}:`, err);
    }
  }

  // Derive title from metadata or fallback to first markdown header or slug
  let title = (metadata.title as string) || "";
  if (!title) {
    const headingMatch = body.match(/^#\s+(.+)$/m);
    if (headingMatch) {
      title = headingMatch[1].trim();
    } else {
      title = slug.replace(/[-_]/g, " ");
    }
  }

  // Derive type from metadata or folder
  let type = (metadata.type as string) || "";
  if (!type) {
    const dirName = path.dirname(relPath);
    if (dirName && dirName !== ".") {
      type = dirName.charAt(0).toUpperCase() + dirName.slice(1);
    } else {
      type = "Concept";
    }
  }

  const tags: string[] = Array.isArray(metadata.tags)
    ? (metadata.tags as unknown[]).map(String)
    : typeof metadata.tags === "string"
    ? [metadata.tags]
    : [];

  const status = typeof metadata.status === "string" ? metadata.status : "unverified";
  const stale_after =
    typeof metadata.stale_after === "string" ? metadata.stale_after : undefined;
  const description =
    typeof metadata.description === "string" ? metadata.description : undefined;

  return {
    id,
    slug,
    path: relPath,
    title,
    type,
    description,
    tags,
    status,
    stale_after,
    sources: metadata.sources,
    body,
    raw: content,
    links: [],
    backlinks: [],
    metadata,
  };
}

/**
 * Builds the OKF graph from vault files
 */
export function buildGraph(vaultDir: string = DEFAULT_VAULT_PATH): OKFGraph {
  const files = findMarkdownFiles(vaultDir);

  const concepts: OKFConcept[] = [];
  const conceptByPath = new Map<string, OKFConcept>();
  const conceptById = new Map<string, OKFConcept>();
  const conceptBySlug = new Map<string, OKFConcept>();

  for (const f of files) {
    const concept = parseConceptFile(f, vaultDir);
    concepts.push(concept);
    conceptByPath.set(concept.path, concept);
    conceptById.set(concept.id, concept);
    conceptBySlug.set(concept.slug, concept);
  }

  const edges: OKFEdge[] = [];
  const edgeSet = new Set<string>();

  for (const c of concepts) {
    const targets = new Set<string>();

    // 1. Markdown links: [text](target)
    const mdRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
    let m: RegExpExecArray | null;
    while ((m = mdRegex.exec(c.raw)) !== null) {
      const rawUrl = m[2].trim().split("#")[0].split("?")[0];
      if (
        !rawUrl ||
        rawUrl.startsWith("http://") ||
        rawUrl.startsWith("https://") ||
        rawUrl.startsWith("mailto:")
      ) {
        continue;
      }
      targets.add(rawUrl);
    }

    // 2. Wikilinks: [[target]] or [[target|alias]]
    const wikiRegex = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
    while ((m = wikiRegex.exec(c.raw)) !== null) {
      const target = m[1].trim();
      if (target) targets.add(target);
    }

    // 3. Frontmatter links: e.g. owner
    if (c.metadata?.owner && typeof c.metadata.owner === "string") {
      targets.add(c.metadata.owner.trim());
    }

    // Resolve each target to canonical concept ID
    for (const rawTarget of targets) {
      let clean = rawTarget.replace(/^\//, "");
      let matched =
        conceptByPath.get(clean) ||
        conceptById.get(clean) ||
        conceptByPath.get(clean + ".md") ||
        conceptBySlug.get(clean) ||
        conceptBySlug.get(clean.replace(/\.md$/, ""));

      // Try relative to current concept directory
      if (!matched) {
        const dir = path.dirname(c.path);
        const relResolved = path.normalize(path.join(dir, clean));
        matched =
          conceptByPath.get(relResolved) ||
          conceptById.get(relResolved) ||
          conceptByPath.get(relResolved + ".md");
      }

      if (matched && matched.id !== c.id) {
        if (!c.links!.includes(matched.id)) {
          c.links!.push(matched.id);
        }
        if (!matched.backlinks!.includes(c.id)) {
          matched.backlinks!.push(c.id);
        }

        const edgeKey = `${c.id}->${matched.id}`;
        if (!edgeSet.has(edgeKey)) {
          edgeSet.add(edgeKey);
          edges.push({
            source: c.id,
            target: matched.id,
          });
        }
      }
    }
  }

  const types = Array.from(new Set(concepts.map((n) => n.type))).sort();

  const stats: OKFGraphStats = {
    concepts: concepts.length,
    edges: edges.length,
    types,
  };

  return {
    nodes: concepts,
    edges,
    stats,
  };
}

/**
 * VaultManager maintains in-memory cached graph and handles fast retrieval
 */
export class VaultManager {
  private vaultDir: string;
  private cachedGraph: OKFGraph | null = null;
  private conceptMap: Map<string, OKFConcept> = new Map();
  private unwatchFn: (() => void) | null = null;

  constructor(vaultDir: string = DEFAULT_VAULT_PATH) {
    this.vaultDir = vaultDir;
  }

  public getVaultDir(): string {
    return this.vaultDir;
  }

  public reload(): OKFGraph {
    const graph = buildGraph(this.vaultDir);
    this.cachedGraph = graph;
    this.conceptMap.clear();

    for (const node of graph.nodes) {
      this.conceptMap.set(node.id, node);
      this.conceptMap.set(node.slug, node);
      this.conceptMap.set(node.path, node);
      this.conceptMap.set(node.id.toLowerCase(), node);
      this.conceptMap.set(node.slug.toLowerCase(), node);
    }

    return graph;
  }

  public getGraph(): OKFGraph {
    if (!this.cachedGraph) {
      return this.reload();
    }
    return this.cachedGraph;
  }

  public getConcept(idOrSlug: string): OKFConcept | null {
    if (!this.cachedGraph) {
      this.reload();
    }

    const clean = idOrSlug.replace(/^\//, "").replace(/\.md$/, "");
    return (
      this.conceptMap.get(clean) ||
      this.conceptMap.get(idOrSlug) ||
      this.conceptMap.get(clean.toLowerCase()) ||
      null
    );
  }

  public watch(onUpdate: () => void): () => void {
    if (this.unwatchFn) {
      this.unwatchFn();
    }

    this.unwatchFn = watchVault(this.vaultDir, () => {
      this.reload();
      onUpdate();
    });

    return () => {
      if (this.unwatchFn) {
        this.unwatchFn();
        this.unwatchFn = null;
      }
    };
  }

  public close(): void {
    if (this.unwatchFn) {
      this.unwatchFn();
      this.unwatchFn = null;
    }
  }
}

/**
 * Watch vault directory recursively with 300ms debounce
 */
export function watchVault(vaultDir: string, onUpdate: () => void): () => void {
  if (!fs.existsSync(vaultDir)) {
    console.warn(`[Vault] Watcher warning: directory ${vaultDir} does not exist.`);
    return () => {};
  }

  let debounceTimer: NodeJS.Timeout | undefined;

  const watcher = fs.watch(vaultDir, { recursive: true }, (_eventType, filename) => {
    // Ignore index.md, log.md, hidden files or git changes
    if (filename) {
      const base = path.basename(filename);
      if (base.startsWith(".") || base === "index.md" || base === "log.md") {
        return;
      }
    }

    clearTimeout(debounceTimer);

    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      try {
        onUpdate();
      } catch (err) {
        console.error("[Vault] Error in watchVault callback:", err);
      }
    }, 300);
  });

  return () => {
    clearTimeout(debounceTimer);
    debounceTimer = undefined;
    watcher.close();
  };
}
