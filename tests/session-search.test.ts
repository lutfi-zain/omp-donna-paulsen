import { SessionSearchEngine } from "../src/search/session-search.js";
import fs from "node:fs";

async function testSessionSearch() {
  console.log("=== TEST: SESSION SEARCH ENGINE (FTS5) ===\n");

  const testDb = "/tmp/test-session-search.db";
  if (fs.existsSync(testDb)) fs.unlinkSync(testDb);

  const engine = new SessionSearchEngine(testDb);

  // Index recent sessions
  console.log("Indexing real sessions...");
  const stats = engine.indexSessions(30);
  console.log(`  Indexed: ${stats.indexed} sessions | Skipped: ${stats.skipped}`);

  if (stats.indexed === 0) {
    console.error("[FAIL] No sessions were indexed");
    process.exit(1);
  }

  // Test queries
  const testQueries = [
    { query: "meterai", expectedKeyword: "meterai" },
    { query: "thermogun", expectedKeyword: "thermogun" },
    { query: "niagamas", expectedKeyword: "niagamas" },
  ];

  for (const tc of testQueries) {
    console.log(`\nQuery: "${tc.query}"`);
    const results = engine.search(tc.query, 3);
    console.log(`  Found: ${results.length} result(s)`);

    if (results.length === 0) {
      console.error(`[FAIL] No results found for "${tc.query}"`);
      process.exit(1);
    }

    const first = results[0];
    console.log(`  Top hit [${first.project}] (${first.sessionId.slice(0, 8)}): ${first.snippet.replace(/\n/g, " ").slice(0, 100)}...`);
    if (!first.snippet.toLowerCase().includes(tc.expectedKeyword)) {
      console.error(`[FAIL] Snippet does not contain keyword "${tc.expectedKeyword}"`);
      process.exit(1);
    }
  }

  // Cleanup test db
  if (fs.existsSync(testDb)) fs.unlinkSync(testDb);

  console.log("\n[OK] SESSION SEARCH ENGINE TEST PASSED 100%!");
}

testSessionSearch().catch((err) => {
  console.error("[FAIL]", err);
  process.exit(1);
});
