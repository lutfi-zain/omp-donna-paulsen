import type { DonnaConfig, OKFConcept, HindsightConfig } from "../types.js";
import type { OKFScanner } from "../okf/scanner.js";

/**
 * OKF → Hindsight Sync
 *
 * Pushes structured OKF dossiers into Hindsight as world facts so they
 * become discoverable via Hindsight's 4-arm hybrid retrieval (Vector +
 * BM25 + Graph + Temporal).
 *
 * Each concept is retained with `document_id = "okf:<path>"` for upsert
 * semantics — re-syncing replaces stale chunks automatically.
 *
 * Inspired by A-MEM (NeurIPS 2025): structured knowledge notes with
 * auto-linking and evolution via the Hindsight entity graph.
 */

interface SyncResult {
  synced: number;
  skipped: number;
  errors: string[];
}

export async function syncOkfToHindsight(
  scanner: OKFScanner,
  config: DonnaConfig,
  options: { waitForCompletion?: boolean } = {}
): Promise<SyncResult> {
  const hs = config.hindsight;
  if (!hs) return { synced: 0, skipped: 0, errors: ["No Hindsight config"] };

  const concepts = scanner.getAllConcepts();
  if (concepts.length === 0) return { synced: 0, skipped: 0, errors: [] };

  // Build retain items from OKF concepts
  const items = concepts
    .filter((c) => c.contentSummary || c.description)
    .map((c) => conceptToMemoryItem(c));

  if (items.length === 0) return { synced: 0, skipped: concepts.length, errors: [] };

  // Batch retain — Hindsight handles chunking and entity extraction
  const result: SyncResult = { synced: 0, skipped: 0, errors: [] };

  // Send in batches of 10 to avoid overwhelming the API
  const BATCH_SIZE = 10;
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    try {
      const resp = await retainBatch(hs, batch, options.waitForCompletion);
      if (resp.success) {
        result.synced += batch.length;
      } else {
        result.errors.push(`Batch ${i}: retain failed`);
        result.skipped += batch.length;
      }
    } catch (err) {
      result.errors.push(`Batch ${i}: ${String(err)}`);
      result.skipped += batch.length;
    }
  }

  return result;
}

/**
 * Sync only concepts that changed since last sync.
 * Uses mtime comparison against a stored watermark.
 */
export async function syncChangedConcepts(
  scanner: OKFScanner,
  config: DonnaConfig,
  sinceMs: number
): Promise<SyncResult> {
  const hs = config.hindsight;
  if (!hs) return { synced: 0, skipped: 0, errors: ["No Hindsight config"] };

  const changed = scanner
    .getAllConcepts()
    .filter((c) => c.mtime > sinceMs && (c.contentSummary || c.description));

  if (changed.length === 0) return { synced: 0, skipped: 0, errors: [] };

  const items = changed.map((c) => conceptToMemoryItem(c));
  const result: SyncResult = { synced: 0, skipped: 0, errors: [] };

  try {
    const resp = await retainBatch(config.hindsight!, items);
    if (resp.success) {
      result.synced = items.length;
    } else {
      result.errors.push("retain failed");
      result.skipped = items.length;
    }
  } catch (err) {
    result.errors.push(String(err));
    result.skipped = items.length;
  }

  return result;
}

/**
 * Recall topically relevant memories from Hindsight.
 * Returns formatted bullet lines ready for injection.
 */
export async function recallFromHindsight(
  query: string,
  config: DonnaConfig
): Promise<string[]> {
  const hs = config.hindsight;
  if (!hs || !query.trim()) return [];

  try {
    const resp = await fetch(`${hs.apiUrl}/v1/default/banks/${hs.bankId}/memories/recall`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${hs.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        types: ["world", "observation"],
        prefer_observations: true,
        budget: "low",
        max_tokens: 800,
      }),
    });

    if (!resp.ok) return [];

    const data = (await resp.json()) as {
      results: Array<{ text: string; type: string; entities?: string[] }>;
    };

    return data.results.map((r) => {
      const entities = r.entities?.length ? ` [${r.entities.join(", ")}]` : "";
      return `- ${r.text}${entities}`;
    });
  } catch {
    return [];
  }
}

// --- Internal helpers ---

interface MemoryItem {
  content: string;
  document_id: string;
  tags: string[];
  metadata: Record<string, string>;
  timestamp: string;
}

function conceptToMemoryItem(c: OKFConcept): MemoryItem {
  const topDir = c.path.split("/")[0];

  // Build rich content string for Hindsight to extract facts from
  const parts: string[] = [];
  parts.push(`[${c.type}] ${c.title}`);
  if (c.description) parts.push(c.description);
  if (c.relationship) parts.push(`Relationship: ${c.relationship}`);
  if (c.contentSummary) parts.push(c.contentSummary);

  return {
    content: parts.join("\n"),
    document_id: `okf:${c.path}`,
    tags: ["donna-okf", topDir, ...c.tags.filter((t) => !["donna-engine"].includes(t))],
    metadata: {
      okf_type: c.type,
      okf_slug: c.slug,
      okf_path: c.path,
    },
    // OKF dossiers are reference material — use "unset" to avoid temporal decay
    timestamp: "unset",
  };
}

async function retainBatch(
  hs: HindsightConfig,
  items: MemoryItem[],
  waitForCompletion = false
): Promise<{ success: boolean }> {
  const resp = await fetch(`${hs.apiUrl}/v1/default/banks/${hs.bankId}/memories`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${hs.apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      items,
      async: !waitForCompletion,
    }),
  });

  if (!resp.ok) return { success: false };

  const data = (await resp.json()) as { success: boolean };
  return { success: data.success };
}
