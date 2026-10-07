import type { DonnaConfig, IngressContextResult, OKFConcept } from "../types.js";
import type { OKFScanner } from "../okf/scanner.js";

/**
 * Ingress Context Engine:
 * Analyzes incoming user prompts against the active Vault Entity Dictionary
 * and injects relevant context without blocking the LLM generation loop.
 *
 * Designed to be 100% language-agnostic: zero hardcoded stopwords or language heuristics.
 */
export function buildIngressContext(
  prompt: string,
  scanner: OKFScanner,
  config: DonnaConfig
): IngressContextResult {
  if (!config.contextPulling || !scanner.isBundleAvailable()) {
    return {
      matchedConcepts: [],
      activeCommitments: [],
      xmlContext: "",
      tokenEstimate: 0,
    };
  }

  // 1. Extract candidate phrases from the user prompt (unigrams & bigrams)
  const candidatePhrases = extractCandidatePhrases(prompt);

  // 2. Query the vault's dynamic entity index (driven entirely by user vault data)
  const matchedConcepts = scanner.findMatchingConcepts(candidatePhrases);
  const activeCommitments = scanner.getActiveCommitments(2);

  if (matchedConcepts.length === 0 && activeCommitments.length === 0) {
    return {
      matchedConcepts: [],
      activeCommitments: [],
      xmlContext: "",
      tokenEstimate: 0,
    };
  }

  // 3. Assemble high-density XML context payload
  const lines: string[] = ["<donna-context>"];
  lines.push(`  <meta bundle="${scanner.getBundlePath()}" principal="${config.principalName}" />`);

  if (matchedConcepts.length > 0) {
    lines.push("  <entities>");
    for (const concept of matchedConcepts) {
      const relAttr = concept.relationship ? ` relationship="${concept.relationship}"` : "";
      const statusAttr = concept.status ? ` status="${concept.status}"` : "";
      lines.push(`    <concept type="${concept.type}" slug="${concept.slug}" title="${concept.title}"${relAttr}${statusAttr}>`);
      if (concept.description) {
        lines.push(`      <description>${escapeXml(concept.description)}</description>`);
      }
      if (concept.contentSummary) {
        lines.push(`      <summary>${escapeXml(concept.contentSummary)}</summary>`);
      }
      lines.push("    </concept>");
    }
    lines.push("  </entities>");
  }

  if (activeCommitments.length > 0) {
    lines.push(`  <active-commitments count="${activeCommitments.length}">`);
    for (const comm of activeCommitments) {
      const dueAttr = comm.dueDate ? ` due="${comm.dueDate}"` : "";
      lines.push(`    <commitment slug="${comm.slug}" title="${comm.title}"${dueAttr}>`);
      lines.push(`      ${escapeXml(comm.contentSummary || comm.description || "")}`);
      lines.push("    </commitment>");
    }
    lines.push("  </active-commitments>");
  }

  lines.push("</donna-context>");
  const xmlContext = lines.join("\n");

  return {
    matchedConcepts,
    activeCommitments,
    xmlContext,
    tokenEstimate: Math.ceil(xmlContext.length / 4),
  };
}

/**
 * Tokenize prompt into candidate search phrases (clean words and 2-grams).
 * Completely language-agnostic: relies on Unicode word segmentation without manual dictionaries.
 */
export function extractCandidatePhrases(text: string): string[] {
  const normalized = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return [];

  const rawWords = normalized.split(" ").filter((w) => w.length >= 2);
  const phrases: string[] = [...rawWords];

  // Also include 2-word combinations for compound entities (e.g. "tech lead", "thermo gun")
  for (let i = 0; i < rawWords.length - 1; i++) {
    phrases.push(`${rawWords[i]} ${rawWords[i + 1]}`);
  }

  return phrases;
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
