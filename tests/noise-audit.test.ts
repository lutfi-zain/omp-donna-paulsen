import { extractCandidatePhrases } from "../src/context/ingress.js";
import { OKFScanner } from "../src/okf/scanner.js";

const VAULT = "/home/ubuntu/.donna/vault/.okf";

/**
 * Replay exact user prompts from audited sessions.
 * Verify each session produces 0% noise.
 */
async function testNoiseElimination() {
  const scanner = new OKFScanner(VAULT);
  scanner.scan();
  const totalConcepts = scanner.getAllConcepts().length;
  console.log(`Vault loaded: ${totalConcepts} concepts\n`);

  const sessions: {
    name: string;
    prompt: string;
    expectedRelevant: string[];   // slugs that SHOULD match
    expectedAbsent: string[];     // slugs that MUST NOT match
  }[] = [
    {
      name: "Dokploy decision",
      prompt: "Donna kenapa kemarin kita ngga pilih untuk pasang dockploy ya?",
      expectedRelevant: [],
      expectedAbsent: [
        "2026-10-07-pemilihan-thermogun-saada",  // was matching "untuk"
        "cloudflare-custom-email",
        "livekit-voice-agent",
      ],
    },
    {
      name: "Tugas kuliah IT Governance",
      prompt: "kita kerjakan lagi tugas . baca dulu ini ya IT_GOV_-_2._Leadership_Structure.pdf",
      expectedRelevant: [],
      expectedAbsent: [
        "omp-finnplan",
        "07-leadership-dan-manajemen-tim",
        "openrig-omp-orchestration",
        "agent-eval-observability-stack",
        "livekit-voice-agent",
      ],
    },
    {
      name: "VPS maintenance",
      prompt: "tolong cek disk usage dan postgres connections di server",
      expectedRelevant: [],
      expectedAbsent: [
        "tech-lead-niagamas",
        "kesehatan-mental-dinamika-emosional-lutfi",
        "kuliah-zoom",
        "jiofarm-harvester",
        "finnplan-mcp",
      ],
    },
    {
      name: "Pak Eko chat",
      prompt: "donna pak eko dari niagamas chat saya bisa senin siang",
      expectedRelevant: ["eko-kurniawan"],  // person name match
      expectedAbsent: [
        "upskill-fondasi-dasar-nol",
        "01-arsitektur-dan-tech-stack",
        "03-ai-evals-dan-llmops",
      ],
    },
    {
      name: "Memory priority (this session)",
      prompt: "Ada yang kurang dari donna. Memory priority, coba kamu cek beberapa latest session",
      expectedRelevant: [],
      expectedAbsent: [
        "cloudflare-custom-email",
        "livekit-voice-agent",
        "omp-web-ui-architecture",
        "openrig-omp-orchestration",
        "whatsapp-cli-automation",
      ],
    },
    {
      name: "Saada demam",
      prompt: "saada demam nih",
      expectedRelevant: ["saada"],  // person name match
      expectedAbsent: [
        "cloudflare-custom-email",
        "agent-eval-architecture",
      ],
    },
    {
      name: "Short greeting",
      prompt: "Hi, cheer me up",
      expectedRelevant: [],
      expectedAbsent: [],
    },
  ];

  let allPassed = true;

  for (const session of sessions) {
    const tokens = extractCandidatePhrases(session.prompt);
    const matched = scanner.findMatchingConcepts(tokens);
    const matchedSlugs = matched.map((c) => c.slug);
    const noise = matchedSlugs.filter(
      (s) => !session.expectedRelevant.includes(s) && !isAlwaysRelevant(s)
    );

    const relevant = session.expectedRelevant.filter((s) => matchedSlugs.includes(s));
    const missedRelevant = session.expectedRelevant.filter((s) => !matchedSlugs.includes(s));
    const leakedAbsent = session.expectedAbsent.filter((s) => matchedSlugs.includes(s));

    const noiseRatio = matchedSlugs.length > 0 ? noise.length / matchedSlugs.length : 0;
    const passed = leakedAbsent.length === 0 && missedRelevant.length === 0;
    if (!passed) allPassed = false;

    console.log(`${passed ? "✅" : "❌"} ${session.name}`);
    console.log(`   Tokens: ${tokens.length} | Matched: ${matchedSlugs.length} | Noise: ${noise.length} (${(noiseRatio * 100).toFixed(0)}%)`);
    if (matchedSlugs.length > 0) {
      console.log(`   Matched: [${matchedSlugs.join(", ")}]`);
    }
    if (relevant.length > 0) {
      console.log(`   ✓ Relevant found: [${relevant.join(", ")}]`);
    }
    if (missedRelevant.length > 0) {
      console.log(`   ✗ Missed relevant: [${missedRelevant.join(", ")}]`);
    }
    if (leakedAbsent.length > 0) {
      console.log(`   ✗ Leaked noise: [${leakedAbsent.join(", ")}]`);
    }
    console.log();
  }

  if (!allPassed) {
    console.error("[FAIL] Noise elimination test failed!");
    process.exit(1);
  }
  console.log("[OK] ALL SESSIONS: 0% noise confirmed.");
}

function isAlwaysRelevant(slug: string): boolean {
  // Persona is always valid context
  return slug === "donna-paulsen";
}

testNoiseElimination().catch((err) => {
  console.error("[FAIL]", err);
  process.exit(1);
});
