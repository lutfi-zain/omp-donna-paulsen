import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import * as yaml from "js-yaml";
import type { OKFConcept, OKFEdge, OKFGraph, OKFGraphStats, VaultTreeNode } from "$lib/types";

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
 * Recursively find all directories in vault
 */
export function findDirectories(dir: string, baseDir: string = dir, dirList: string[] = []): string[] {
  if (!fs.existsSync(dir)) return dirList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const rel = path.relative(baseDir, fullPath);
      if (rel) dirList.push(rel);
      findDirectories(fullPath, baseDir, dirList);
    }
  }
  return dirList;
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
 * Write updated markdown body to an existing concept file while preserving YAML frontmatter
 */
export async function writeConceptFile(
  conceptId: string,
  body: string,
  vaultDir?: string
): Promise<void> {
  const baseDir = path.resolve(vaultDir ?? DEFAULT_VAULT_PATH);
  const cleanId = decodeURIComponent(conceptId).replace(/^\//, "").replace(/\.md$/, "");
  const resolvedPath = path.resolve(path.join(baseDir, ...cleanId.split("/"))) + ".md";

  if (!resolvedPath.startsWith(baseDir + path.sep)) {
    throw new Error("Path traversal rejected");
  }

  if (!fs.existsSync(resolvedPath)) {
    throw new Error("Concept file not found: " + conceptId);
  }

  const existing = fs.readFileSync(resolvedPath, "utf-8");
  const match = existing.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);
  const newContent = match ? `${match[0]}${body}` : body;

  fs.writeFileSync(resolvedPath, newContent, "utf-8");
}

export interface CreateVaultFileOptions {
  folderPath?: string;
  fileName: string;
  title?: string;
  type?: string;
  kind?: 'document' | 'mermaid' | 'drawing';
  content?: string;
  vaultDir?: string;
}

export async function createVaultFile(opts: CreateVaultFileOptions): Promise<OKFConcept> {
  const baseDir = path.resolve(opts.vaultDir ?? DEFAULT_VAULT_PATH);
  const folder = (opts.folderPath || "").replace(/^\/+|\/+$/g, "");
  const rawName = opts.fileName.trim();
  if (!rawName) throw new Error("Nama berkas tidak boleh kosong");

  const slug = rawName
    .replace(/\.md$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-|-$/g, "") || `dokumen-${Date.now()}`;

  const targetDir = folder ? path.resolve(path.join(baseDir, ...folder.split("/"))) : baseDir;
  if (!targetDir.startsWith(baseDir)) {
    throw new Error("Path traversal rejected");
  }

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const mdFilePath = path.join(targetDir, `${slug}.md`);
  if (fs.existsSync(mdFilePath)) {
    throw new Error(`Berkas "${slug}.md" sudah ada di folder ini`);
  }

  const displayTitle = (opts.title || "").trim() || rawName.replace(/[-_]/g, " ");
  const kind = opts.kind || "document";
  let fileContent = opts.content || "";

  if (!fileContent) {
    if (kind === "mermaid") {
      fileContent = [
        "---",
        `title: "${displayTitle.replace(/"/g, '\\"')}"`,
        "type: Diagram",
        "status: verified",
        "tags:",
        "  - mermaid",
        "  - diagram",
        `description: "Diagram Mermaid: ${displayTitle.replace(/"/g, '\\"')}"`,
        "---",
        "",
        `# ${displayTitle}`,
        "",
        "```mermaid",
        "flowchart TD",
        "  A[Mulai] --> B[Proses]",
        "  B --> C[Selesai]",
        "```",
        "",
      ].join("\n");
    } else if (kind === "drawing") {
      const tldrPath = path.join(targetDir, `${slug}.tldr`);
      const initialTldr = {
        title: displayTitle,
        updatedAt: new Date().toISOString(),
        snapshot: {},
      };
      fs.writeFileSync(tldrPath, JSON.stringify(initialTldr, null, 2), "utf-8");

      fileContent = [
        "---",
        `title: "${displayTitle.replace(/"/g, '\\"')}"`,
        "type: Drawing",
        "status: verified",
        "tags:",
        "  - canvas",
        "  - tldraw",
        `description: "Whiteboard Kanvas (${slug}.tldr)"`,
        "---",
        "",
        `# ${displayTitle}`,
        "",
        `Kanvas whiteboard ini disimpan di \`${folder ? folder + "/" : ""}${slug}.tldr\`. Buka menu **Kanvas** untuk menggambar.`,
        "",
      ].join("\n");
    } else {
      const typeName = opts.type || (folder ? folder.charAt(0).toUpperCase() + folder.slice(1) : "Concept");
      fileContent = [
        "---",
        `title: "${displayTitle.replace(/"/g, '\\"')}"`,
        `type: ${typeName}`,
        "status: unverified",
        "tags:",
        `  - ${typeName.toLowerCase()}`,
        `description: "Dokumen ${displayTitle.replace(/"/g, '\\"')}"`,
        "---",
        "",
        `# ${displayTitle}`,
        "",
        "Tulis konten dokumen di sini...",
        "",
      ].join("\n");
    }
  }

  fs.writeFileSync(mdFilePath, fileContent, "utf-8");
  return parseConceptFile(mdFilePath, baseDir);
}

export async function createVaultFolder(parentFolder: string, folderName: string, vaultDir?: string): Promise<string> {
  const baseDir = path.resolve(vaultDir ?? DEFAULT_VAULT_PATH);
  const parent = (parentFolder || "").replace(/^\/+|\/+$/g, "");
  const cleanName = folderName.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "");
  if (!cleanName) throw new Error("Nama folder tidak boleh kosong");

  const targetDir = parent ? path.resolve(path.join(baseDir, ...parent.split("/"), cleanName)) : path.resolve(path.join(baseDir, cleanName));
  if (!targetDir.startsWith(baseDir + path.sep)) {
    throw new Error("Path traversal rejected");
  }

  if (fs.existsSync(targetDir)) {
    throw new Error(`Folder "${cleanName}" sudah ada`);
  }

  fs.mkdirSync(targetDir, { recursive: true });
  return path.relative(baseDir, targetDir);
}

export async function renameVaultItem(
  targetPath: string,
  newName: string,
  isDirectory: boolean,
  vaultDir?: string
): Promise<{ oldId: string; newId: string }> {
  const baseDir = path.resolve(vaultDir ?? DEFAULT_VAULT_PATH);
  const cleanTarget = targetPath.replace(/^\/+|\/+$/g, "");
  const fullTargetPath = path.resolve(path.join(baseDir, ...cleanTarget.split("/")));
  if (!fullTargetPath.startsWith(baseDir + path.sep)) {
    throw new Error("Path traversal rejected");
  }

  if (!fs.existsSync(fullTargetPath)) {
    throw new Error("Target tidak ditemukan: " + targetPath);
  }

  const parentDir = path.dirname(fullTargetPath);
  const cleanNewName = newName.trim();
  if (!cleanNewName) throw new Error("Nama baru tidak boleh kosong");

  if (isDirectory) {
    const safeDirName = cleanNewName.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "");
    const newFullPath = path.join(parentDir, safeDirName);
    if (fs.existsSync(newFullPath)) throw new Error(`Folder "${safeDirName}" sudah ada`);
    fs.renameSync(fullTargetPath, newFullPath);
    return {
      oldId: cleanTarget,
      newId: path.relative(baseDir, newFullPath),
    };
  } else {
    const oldSlug = path.basename(fullTargetPath, ".md");
    const newSlug = cleanNewName.replace(/\.md$/, "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "");
    const newFullPath = path.join(parentDir, `${newSlug}.md`);
    if (fs.existsSync(newFullPath) && newFullPath !== fullTargetPath) {
      throw new Error(`Berkas "${newSlug}.md" sudah ada`);
    }

    fs.renameSync(fullTargetPath, newFullPath);

    // Also rename companion .tldr or .svg if they exist
    const companionTldr = path.join(parentDir, `${oldSlug}.tldr`);
    if (fs.existsSync(companionTldr)) {
      fs.renameSync(companionTldr, path.join(parentDir, `${newSlug}.tldr`));
    }
    const companionSvg = path.join(parentDir, `${oldSlug}.svg`);
    if (fs.existsSync(companionSvg)) {
      fs.renameSync(companionSvg, path.join(parentDir, `${newSlug}.svg`));
    }

    // Update frontmatter title to match new name
    try {
      const content = fs.readFileSync(newFullPath, "utf-8");
      const niceTitle = cleanNewName.replace(/\.md$/, "").replace(/[-_]/g, " ");
      const updated = content.replace(/^title:\s*".*?"/m, `title: "${niceTitle.replace(/"/g, '\\"')}"`);
      if (updated !== content) {
        fs.writeFileSync(newFullPath, updated, "utf-8");
      }
    } catch {}

    return {
      oldId: cleanTarget.replace(/\.md$/, ""),
      newId: path.relative(baseDir, newFullPath).replace(/\.md$/, ""),
    };
  }
}

export async function deleteVaultItem(targetPath: string, isDirectory: boolean, vaultDir?: string): Promise<void> {
  const baseDir = path.resolve(vaultDir ?? DEFAULT_VAULT_PATH);
  const cleanTarget = targetPath.replace(/^\/+|\/+$/g, "");
  const fullTargetPath = path.resolve(path.join(baseDir, ...cleanTarget.split("/")));
  if (!fullTargetPath.startsWith(baseDir + path.sep)) {
    throw new Error("Path traversal rejected");
  }

  if (!fs.existsSync(fullTargetPath)) {
    return;
  }

  if (isDirectory) {
    fs.rmSync(fullTargetPath, { recursive: true, force: true });
  } else {
    const baseName = path.basename(fullTargetPath, ".md");
    const dir = path.dirname(fullTargetPath);
    fs.unlinkSync(fullTargetPath);

    // Clean up companion drawings files
    const companionTldr = path.join(dir, `${baseName}.tldr`);
    if (fs.existsSync(companionTldr)) {
      try { fs.unlinkSync(companionTldr); } catch {}
    }
    const companionSvg = path.join(dir, `${baseName}.svg`);
    if (fs.existsSync(companionSvg)) {
      try { fs.unlinkSync(companionSvg); } catch {}
    }
  }
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
      const clean = rawTarget.replace(/^\//, "");
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

  const tree = buildVaultTree(concepts, vaultDir);

  return {
    nodes: concepts,
    edges,
    stats,
    tree,
  };
}

/**
 * Build recursive folder tree from concepts
 */
export function buildVaultTree(concepts: OKFConcept[], vaultDir: string = DEFAULT_VAULT_PATH): VaultTreeNode[] {
  interface TempDir {
    id: string;
    name: string;
    path: string;
    dirs: Map<string, TempDir>;
    files: VaultTreeNode[];
  }

  const root: TempDir = {
    id: "",
    name: "root",
    path: "",
    dirs: new Map(),
    files: [],
  };

  // Seed root with all existing physical directories in vault
  const diskDirs = findDirectories(vaultDir);
  for (const dirRel of diskDirs) {
    const segments = dirRel.split(path.sep);
    let currentDir = root;
    let accumulatedPath = "";
    for (const segment of segments) {
      accumulatedPath = accumulatedPath ? `${accumulatedPath}/${segment}` : segment;
      if (!currentDir.dirs.has(segment)) {
        currentDir.dirs.set(segment, {
          id: accumulatedPath,
          name: segment,
          path: accumulatedPath,
          dirs: new Map(),
          files: [],
        });
      }
      currentDir = currentDir.dirs.get(segment)!;
    }
  }
  for (const concept of concepts) {
    const segments = concept.id.split("/");
    const fileName = segments.pop() || concept.id;
    let currentDir = root;

    let accumulatedPath = "";
    for (const segment of segments) {
      accumulatedPath = accumulatedPath ? `${accumulatedPath}/${segment}` : segment;
      if (!currentDir.dirs.has(segment)) {
        currentDir.dirs.set(segment, {
          id: accumulatedPath,
          name: segment,
          path: accumulatedPath,
          dirs: new Map(),
          files: [],
        });
      }
      currentDir = currentDir.dirs.get(segment)!;
    }

    currentDir.files.push({
      id: concept.id,
      name: fileName,
      path: concept.path,
      type: "file",
      conceptId: concept.id,
      conceptType: concept.type,
      title: concept.title,
    });
  }

  function convert(dir: TempDir): VaultTreeNode {
    const childrenDirs = Array.from(dir.dirs.values())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(convert);

    const sortedFiles = dir.files.sort((a, b) =>
      (a.title || a.name).localeCompare(b.title || b.name)
    );

    let totalCount = sortedFiles.length;
    for (const childDir of childrenDirs) {
      totalCount += childDir.count || 0;
    }

    return {
      id: dir.id,
      name: dir.name,
      path: dir.path,
      type: "directory",
      count: totalCount,
      children: [...childrenDirs, ...sortedFiles],
    };
  }

  return convert(root).children || [];
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

  public getTree(): VaultTreeNode[] {
    return this.getGraph().tree || [];
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
