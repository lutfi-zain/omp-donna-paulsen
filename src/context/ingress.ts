import type { DonnaConfig, IngressContextResult, OKFConcept } from "../types.js";
import type { OKFScanner } from "../okf/scanner.js";

const STOPWORDS: Record<string, true> = {
  ada: true,
  adalah: true,
  agent: true,
  agents: true,
  akan: true,
  aku: true,
  anak: true,
  apa: true,
  apakah: true,
  atau: true,
  bagaimana: true,
  bahkan: true,
  bahwa: true,
  baik: true,
  banyak: true,
  bisa: true,
  buat: true,
  coba: true,
  dan: true,
  dari: true,
  dengan: true,
  di: true,
  dia: true,
  doang: true,
  gimana: true,
  gitu: true,
  ini: true,
  itu: true,
  jadinya: true,
  jika: true,
  juga: true,
  kalau: true,
  kamu: true,
  karena: true,
  ke: true,
  kita: true,
  lagi: true,
  mana: true,
  mau: true,
  misal: true,
  mungkin: true,
  nanti: true,
  ngga: true,
  omp: true,
  pada: true,
  pengen: true,
  pilih: true,
  sama: true,
  saya: true,
  sebagai: true,
  sebuah: true,
  seperti: true,
  sepertinya: true,
  soalnya: true,
  sudah: true,
  tapi: true,
  tentang: true,
  tidak: true,
  tuh: true,
  untuk: true,
  yang: true,
};

export function extractPromptTokens(prompt: string): string[] {
  // Extract words and 2-grams, stripping punctuation
  const clean = prompt
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  const words = clean.split(" ").filter((w) => w.length >= 3 && !STOPWORDS[w]);
  const tokens: string[] = [...words];

  // Generate 2-grams for compound names (e.g., "tech lead", "siloam hospitals")
  for (let i = 0; i < words.length - 1; i++) {
    tokens.push(`${words[i]} ${words[i + 1]}`);
  }

  return tokens;
}

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

  const tokens = extractPromptTokens(prompt);
  const matchedConcepts = scanner.findMatchingConcepts(tokens);
  const activeCommitments = scanner.getActiveCommitments(2);

  // If nothing matched and no imminent commitments, return empty
  if (matchedConcepts.length === 0 && activeCommitments.length === 0) {
    return {
      matchedConcepts: [],
      activeCommitments: [],
      xmlContext: "",
      tokenEstimate: 0,
    };
  }

  // Assemble high-density XML block
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

  // Rough token estimate: ~4 chars per token
  const tokenEstimate = Math.ceil(xmlContext.length / 4);

  return {
    matchedConcepts,
    activeCommitments,
    xmlContext,
    tokenEstimate,
  };
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
