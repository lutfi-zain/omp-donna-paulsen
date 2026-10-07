import fs from "node:fs";
import path from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { DonnaConfig } from "../types.js";
import type { OKFScanner } from "../okf/scanner.js";

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
}
