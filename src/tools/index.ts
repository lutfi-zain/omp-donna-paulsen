import fs from "node:fs";
import path from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { DonnaConfig } from "../types.js";
import type { OKFScanner } from "../okf/scanner.js";
import { recallFromHindsight } from "../memory/hindsight-sync.js";
import { SessionSearchEngine } from "../search/session-search.js";
export function registerDonnaTools(
  pi: ExtensionAPI,
  scanner: OKFScanner,
  config: DonnaConfig
): void {
  const z = pi.zod;

  pi.registerTool({
    name: "donna_context_pull",
    label: "Donna Context Pull",
    description:
      "Pull detailed concepts, background, or relationships from the OKF knowledge graph for specific entities or topics.",
    parameters: z.object({
      query: z.string().describe("Search keyword, person name, or project topic to query"),
      category: z
        .enum(["all", "people", "projects", "goals", "organizations", "profile", "commitments"])
        .default("all")
        .describe("Concept category filter"),
    }),
    async execute(_toolCallId, params) {
      if (!scanner.isBundleAvailable()) {
        return {
          content: [
            {
              type: "text",
              text: `OKF Knowledge bundle not found at: ${scanner.getBundlePath()}`,
            },
          ],
        };
      }

      scanner.scan();
      const all = scanner.getAllConcepts();
      const queryLower = params.query.toLowerCase().trim();

      const matched = all.filter((c) => {
        if (params.category !== "all" && !c.path.startsWith(`${params.category}/`)) {
          return false;
        }
        return (
          c.title.toLowerCase().includes(queryLower) ||
          c.slug.toLowerCase().includes(queryLower) ||
          c.tags.some((t) => t.toLowerCase().includes(queryLower)) ||
          c.rawContent.toLowerCase().includes(queryLower)
        );
      });

      if (matched.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No matching concepts found for query: "${params.query}" in category: "${params.category}".`,
            },
          ],
        };
      }

      const results = matched.slice(0, 5).map((m) => {
        return `### [${m.type}] ${m.title} (${m.path})\n${m.description ? `*${m.description}*\n\n` : ""}${m.rawContent.slice(0, 800)}`;
      });

      return {
        content: [
          {
            type: "text",
            text: `Found ${matched.length} concept(s):\n\n${results.join("\n\n---\n\n")}`,
          },
        ],
        details: { count: matched.length },
      };
    },
  });

  pi.registerTool({
    name: "donna_remember",
    label: "Donna Remember",
    description:
      "Atomically record a new fact, entity, or relationship into the OKF second brain without manual multi-file edits.",
    parameters: z.object({
      category: z
        .enum(["people", "projects", "goals", "preferences", "general"])
        .describe("Memory category"),
      name: z.string().describe("Entity name or identifier (e.g. 'Saada', 'Niagamas')"),
      fact: z.string().describe("Durable truth or note to record"),
      relationship: z
        .string()
        .optional()
        .describe("Relationship to principal (e.g. 'anak', 'klien', 'rekan')"),
    }),
    async execute(_toolCallId, params) {
      const bundlePath = scanner.getBundlePath();
      if (!fs.existsSync(bundlePath)) {
        return {
          content: [{ type: "text", text: `Bundle directory does not exist: ${bundlePath}` }],
        };
      }

      const slug = params.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const nowIso = new Date().toISOString();

      let targetFolder = path.join(bundlePath, params.category);
      if (params.category === "preferences") {
        targetFolder = path.join(bundlePath, "profile", "preferences");
      } else if (params.category === "general") {
        targetFolder = path.join(bundlePath, "knowledge");
      }

      if (!fs.existsSync(targetFolder)) {
        fs.mkdirSync(targetFolder, { recursive: true });
      }

      const targetFile = path.join(targetFolder, `${slug}.md`);
      const typeName =
        params.category === "people"
          ? "Person"
          : params.category === "projects"
          ? "Project"
          : params.category === "goals"
          ? "Goal"
          : "Concept";

      let fileContent = "";
      if (fs.existsSync(targetFile)) {
        // Append fact to existing concept
        const existing = fs.readFileSync(targetFile, "utf-8");
        fileContent = `${existing.trim()}\n\n- ${params.fact}\n`;
      } else {
        // Create new concept file
        const relLine = params.relationship ? `relationship: ${params.relationship}\n` : "";
        fileContent = `---
type: ${typeName}
title: ${params.name}
description: ${params.fact.slice(0, 100)}
tags: [${params.category}, donna-engine]
${relLine}generated:
  by: donna-engine
  at: '${nowIso}'
---

# Ringkasan

${params.fact}
`;
      }

      fs.writeFileSync(targetFile, fileContent, "utf-8");
      scanner.scan(); // Refresh in-memory cache

      return {
        content: [
          {
            type: "text",
            text: `Successfully remembered: ${params.name} (${path.relative(bundlePath, targetFile)}).`,
          },
        ],
        details: { targetFile, slug },
      };
    },
  });

  // On-Demand Semantic Recall via Hindsight 4-Arm Hybrid Retrieval
  pi.registerTool({
    name: "donna_recall",
    label: "Donna Recall",
    description:
      "Actively recall semantic memories, past decisions, facts, or context from Hindsight's 4-arm hybrid engine (vector + BM25 + graph + temporal) and OKF dossiers.",
    parameters: z.object({
      query: z
        .string()
        .describe("The question, topic, entity, or decision to search for (e.g. 'alasan penolakan Dokploy', 'jadwal interview Niagamas')"),
      limit: z
        .number()
        .optional()
        .default(5)
        .describe("Maximum number of memories to return (1-10)"),
    }),
    async execute(_toolCallId, params) {
      const query = params.query.trim();
      if (!query) {
        return { content: [{ type: "text", text: "Query cannot be empty." }] };
      }

      const facts = await recallFromHindsight(query, config);

      // Also check OKF concepts matching query
      scanner.scan();
      const qLower = query.toLowerCase();
      const okfMatches = scanner.getAllConcepts().filter(
        (c) =>
          c.title.toLowerCase().includes(qLower) ||
          c.slug.toLowerCase().includes(qLower) ||
          c.tags.some((t) => t.toLowerCase().includes(qLower))
      ).slice(0, 3);

      const lines: string[] = [];

      if (okfMatches.length > 0) {
        lines.push("### OKF Knowledge Dossiers:");
        for (const m of okfMatches) {
          lines.push(`- **[${m.type}] ${m.title}** (${m.path}): ${m.description || m.contentSummary.slice(0, 150)}`);
        }
        lines.push("");
      }

      if (facts.length > 0) {
        lines.push("### Semantic Temporal Memories (Hindsight):");
        for (const f of facts.slice(0, params.limit)) {
          lines.push(f);
        }
      }

      if (lines.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No memories found matching "${params.query}".`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: lines.join("\n"),
          },
        ],
        details: { okfCount: okfMatches.length, factsCount: facts.length },
      };
    },
  });

  // Session Search across past conversation transcripts using SQLite FTS5
  const sessionEngine = new SessionSearchEngine();

  pi.registerTool({
    name: "donna_session_search",
    label: "Donna Session Search",
    description:
      "Full-text search (SQLite FTS5) across all past conversation transcripts. Use this to find specific chats, commands, past errors, or discussions from earlier sessions.",
    parameters: z.object({
      query: z
        .string()
        .describe("Search phrase or terms to find across past conversations (e.g. 'e-meterai sewa rumah', 'docker compose postgres')"),
      project: z
        .string()
        .optional()
        .describe("Optional project filter (e.g. '-.donna', '-infra', '-projects-lz-maniy')"),
      limit: z
        .number()
        .optional()
        .default(5)
        .describe("Maximum number of results (1-15)"),
    }),
    async execute(_toolCallId, params) {
      const query = params.query.trim();
      if (!query) {
        return { content: [{ type: "text", text: "Query cannot be empty." }] };
      }

      // Incremental index of recent session files
      sessionEngine.indexSessions(30);

      const matches = sessionEngine.search(query, params.limit, params.project);

      if (matches.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No past conversation messages found matching "${params.query}".`,
            },
          ],
        };
      }

      const formatted = matches.map((m, idx) => {
        return `**${idx + 1}. [${m.project}] ${m.role.toUpperCase()} (Session: ${m.sessionId})**\n> ${m.snippet.replace(/\n/g, " ")}\n`;
      });

      return {
        content: [
          {
            type: "text",
            text: `Found ${matches.length} matching message(s) in past sessions:\n\n${formatted.join("\n")}`,
          },
        ],
        details: { count: matches.length },
      };
    },
  });
}
