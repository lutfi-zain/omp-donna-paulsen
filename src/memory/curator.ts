import fs from "node:fs";
import path from "node:path";
import type { DonnaConfig } from "../types.js";
import type { OKFScanner } from "../okf/scanner.js";

export interface CuratorResult {
  has_notable_items: boolean;
  commitments?: Array<{
    title: string;
    description: string;
    due_date?: string;
    counterparty?: string;
  }>;
  decisions?: Array<{
    title: string;
    choice: string;
    rationale: string;
  }>;
  corrections?: Array<{
    rule: string;
    context: string;
  }>;
  people?: Array<{
    name: string;
    relationship?: string;
    note: string;
  }>;
}

export class MemoryCurator {
  private gatewayUrl = "http://127.0.0.1:4000/v1/chat/completions";
  private gatewayApiKey = "sk-omp-7895476876bd366566bfee9f61f8e0b9d616d5a73c1c976d";
  private model = "google-antigravity/gemini-2.5-flash-lite";

  /**
   * Run semantic curation on a completed turn.
   * Fully non-blocking, designed to run in background timer at agent_end.
   */
  public async curateTurn(
    prompt: string,
    response: string,
    scanner: OKFScanner,
    config: DonnaConfig
  ): Promise<void> {
    if (!config.autoConsolidate || !scanner.isBundleAvailable()) return;

    // Skip trivial turns
    if (prompt.length < 20 && response.length < 50) return;

    const analysis = await this.analyzeTurnWithLLM(prompt, response);
    if (!analysis || !analysis.has_notable_items) return;

    const bundlePath = scanner.getBundlePath();
    const nowIso = new Date().toISOString();
    const today = nowIso.slice(0, 10);

    // 1. Process Commitments
    if (analysis.commitments && analysis.commitments.length > 0) {
      const commitDir = path.join(bundlePath, "commitments");
      if (!fs.existsSync(commitDir)) fs.mkdirSync(commitDir, { recursive: true });

      for (const comm of analysis.commitments) {
        const slug = slugify(comm.title);
        const fileName = `${today}-${slug}.md`;
        const filePath = path.join(commitDir, fileName);

        if (!fs.existsSync(filePath)) {
          const content = `---
type: Commitment
title: ${comm.title}
description: ${comm.description.replace(/\n/g, " ")}
tags: [commitment, auto-curated]
status: stable
commitment_state: open
owner: /profile/lutfi.md
${comm.counterparty ? `counterparty: ${comm.counterparty}\n` : ""}${comm.due_date ? `due_date: '${comm.due_date}'\n` : ""}generated:
  by: process:donna-curator
  at: '${nowIso}'
---

# Ringkasan Janji / Komitmen

${comm.description}

# Catatan
- Diekstrak secara otomatis oleh Donna Memory Curator dari percakapan.
`;
          fs.writeFileSync(filePath, content, "utf-8");
        }
      }
    }

    // 2. Process Decisions
    if (analysis.decisions && analysis.decisions.length > 0) {
      const decDir = path.join(bundlePath, "decisions");
      if (!fs.existsSync(decDir)) fs.mkdirSync(decDir, { recursive: true });

      for (const dec of analysis.decisions) {
        const slug = slugify(dec.title);
        const fileName = `${today}-${slug}.md`;
        const filePath = path.join(decDir, fileName);

        if (!fs.existsSync(filePath)) {
          const content = `---
type: Decision
title: ${dec.title}
description: ${dec.choice.replace(/\n/g, " ")}
tags: [decision, auto-curated]
status: stable
generated:
  by: process:donna-curator
  at: '${nowIso}'
---

# Keputusan

${dec.choice}

# Alasan & Konteks

${dec.rationale}
`;
          fs.writeFileSync(filePath, content, "utf-8");
        }
      }
    }

    // 3. Process Corrections
    if (analysis.corrections && analysis.corrections.length > 0) {
      const prefDir = path.join(bundlePath, "profile", "preferences");
      if (!fs.existsSync(prefDir)) fs.mkdirSync(prefDir, { recursive: true });

      for (const cor of analysis.corrections) {
        const slug = slugify(cor.rule.slice(0, 30));
        const filePath = path.join(prefDir, `${slug}.md`);

        const content = `---
type: Preference
title: Koreksi Lutfi: ${cor.rule.slice(0, 40)}
description: ${cor.rule.replace(/\n/g, " ")}
tags: [preference, correction, auto-curated]
status: stable
generated:
  by: process:donna-curator
  at: '${nowIso}'
---

# Aturan / Koreksi

${cor.rule}

# Konteks

${cor.context}
`;
        fs.writeFileSync(filePath, content, "utf-8");
      }
    }

    // 4. Process People
    if (analysis.people && analysis.people.length > 0) {
      const peopleDir = path.join(bundlePath, "people");
      if (!fs.existsSync(peopleDir)) fs.mkdirSync(peopleDir, { recursive: true });

      for (const p of analysis.people) {
        const slug = slugify(p.name);
        const filePath = path.join(peopleDir, `${slug}.md`);

        if (!fs.existsSync(filePath)) {
          const content = `---
type: Person
title: ${p.name}
description: "${p.note.replace(/"/g, '\\"')}"
tags: [people, auto-curated]
${p.relationship ? `relationship: ${p.relationship}\n` : ""}status: stable
generated:
  by: process:donna-curator
  at: '${nowIso}'
---

# Siapa

${p.note}
`;
          fs.writeFileSync(filePath, content, "utf-8");
        }
      }
    }

    // Refresh scanner after writing concepts
    scanner.scan();
  }

  private async analyzeTurnWithLLM(prompt: string, response: string): Promise<CuratorResult | null> {
    try {
      const resp = await fetch(this.gatewayUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.gatewayApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: "system",
              content: `You are Donna Paulsen's Executive Memory Curator for Lutfi.
Analyze the following completed interaction turn between Lutfi (user) and Donna (assistant).
Determine if the interaction established any notable, durable items:
1. "commitments": Agreements, contracts, promises, legal documents (e.g. lease, e-meterai, interview schedules, deadlines).
2. "decisions": Major technical, architectural, purchasing, or strategic choices made.
3. "corrections": Direct corrections from Lutfi to Donna (e.g. "bukan gitu", "jangan pakai X", "ganti aturan").
4. "people": New people introduced with their role, relation, or details.

Return JSON in this exact shape:
{
  "has_notable_items": boolean,
  "commitments": [{"title": "...", "description": "...", "due_date": "YYYY-MM-DD", "counterparty": "..."}],
  "decisions": [{"title": "...", "choice": "...", "rationale": "..."}],
  "corrections": [{"rule": "...", "context": "..."}],
  "people": [{"name": "...", "relationship": "...", "note": "..."}]
}
If this was routine coding, chit-chat, simple question answering, or debugging with no new durable commitments/decisions, return {"has_notable_items": false}.`,
            },
            {
              role: "user",
              content: `USER MESSAGE:\n${prompt.slice(0, 3000)}\n\nASSISTANT RESPONSE:\n${response.slice(0, 3000)}`,
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.1,
        }),
      });

      if (!resp.ok) return null;

      const data = (await resp.json()) as {
        choices: Array<{ message: { content: string } }>;
      };

      const raw = data.choices?.[0]?.message?.content;
      if (!raw) return null;

      // Extract JSON (stripping markdown codeblocks if any)
      const cleanJson = raw.replace(/^```json\s*/, "").replace(/\s*```$/, "").trim();
      return JSON.parse(cleanJson) as CuratorResult;
    } catch {
      return null;
    }
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}
