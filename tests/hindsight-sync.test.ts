import { resolveDonnaConfig } from "../src/config.js";
import { OKFScanner } from "../src/okf/scanner.js";
import { syncOkfToHindsight, recallFromHindsight } from "../src/memory/hindsight-sync.js";

const VAULT = "/home/ubuntu/.donna/vault/.okf";

async function testHindsightSync() {
  console.log("=== TEST: OKF → HINDSIGHT SYNC & RECALL ===\n");

  // 1. Resolve config
  const config = resolveDonnaConfig("/home/ubuntu/.donna");
  console.log(`Hindsight: ${config.hindsight ? `${config.hindsight.apiUrl} (bank: ${config.hindsight.bankId})` : "NOT FOUND"}`);
  if (!config.hindsight) {
    console.error("[FAIL] Hindsight config not resolved");
    process.exit(1);
  }

  // 2. Scan vault
  const scanner = new OKFScanner(VAULT);
  scanner.scan();
  console.log(`Vault concepts: ${scanner.getAllConcepts().length}\n`);

  // 3. Sync OKF → Hindsight (async — fires and forgets, Hindsight processes in background)
  console.log("Syncing OKF → Hindsight (async mode)...");
  const result = await syncOkfToHindsight(scanner, config);
  console.log(`  Accepted: ${result.synced} | Skipped: ${result.skipped} | Errors: ${result.errors.length}`);
  if (result.errors.length > 0) {
    console.log(`  Error details: ${result.errors.join(", ")}`);
  }
  if (result.synced === 0 && result.errors.length > 0) {
    console.error("[FAIL] Sync returned no accepted items");
    process.exit(1);
  }
  console.log("  ✅ Retain accepted by Hindsight");

  // 4. Test recall against existing Hindsight facts (14K+ already indexed)
  //    These queries test that Hindsight has topical knowledge Donna OKF entity
  //    resolution alone cannot provide.
  const testCases: { prompt: string; shouldRecall: string[] }[] = [
    {
      prompt: "jadwal interview Niagamas kapan ya?",
      shouldRecall: ["niagamas", "eko", "interview", "tech lead"],
    },
    {
      prompt: "saada demam, thermogun mana yang bagus?",
      shouldRecall: ["saada", "thermogun", "demam", "anak"],
    },
    {
      prompt: "bagaimana arsitektur VPS kita?",
      shouldRecall: ["vps", "server", "ubuntu", "postgres", "docker"],
    },
  ];

  let allPassed = true;
  for (const tc of testCases) {
    console.log(`\n--- Recall: "${tc.prompt}" ---`);
    const recalled = await recallFromHindsight(tc.prompt, config);
    console.log(`  Results: ${recalled.length}`);
    for (const line of recalled.slice(0, 3)) {
      console.log(`  ${line.slice(0, 160)}`);
    }

    const anyMatch = tc.shouldRecall.some((kw) =>
      recalled.some((r) => r.toLowerCase().includes(kw))
    );
    if (recalled.length > 0 && anyMatch) {
      console.log(`  ✅ Relevant recall confirmed`);
    } else if (recalled.length > 0) {
      console.log(`  ⚠️ Recalled ${recalled.length} items but none matched expected keywords`);
    } else {
      console.log(`  ❌ No recall results`);
      allPassed = false;
    }
  }

  console.log(`\n${allPassed ? "[OK]" : "[WARN]"} Hindsight sync & recall test complete.`);
}

testHindsightSync().catch((err) => {
  console.error("[FAIL]", err);
  process.exit(1);
});
