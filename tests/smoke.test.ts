import { resolveDonnaConfig } from "../src/config.js";
import { OKFScanner } from "../src/okf/scanner.js";
import { buildIngressContext, extractCandidatePhrases } from "../src/context/ingress.js";

async function runSmokeTest() {
  console.log("=== SMOKE TEST: DONNA CONTEXT ENGINE ===");

  const cwd = process.cwd();
  const config = resolveDonnaConfig(cwd);

  console.log(`1. Bundle Path: ${config.bundlePath}`);
  console.log(`2. Principal Detected: ${config.principalName}`);

  const scanner = new OKFScanner(config.bundlePath);
  const scanStart = performance.now();
  scanner.scan();
  const scanDuration = performance.now() - scanStart;

  const concepts = scanner.getAllConcepts();
  console.log(`3. Total Concepts Indexed: ${concepts.length} (Scan took: ${scanDuration.toFixed(2)}ms)`);

  // Test Case: "Saada anak saya sepertinya hangat badannya, coba bandingkan thermogun ini"
  const testPrompt = "Saada anak saya sepertinya hangat badannya, coba bandingkan thermogun ini";
  console.log(`\n4. Simulating user prompt: "${testPrompt}"`);

  const tokens = extractCandidatePhrases(testPrompt);
  console.log(`- Extracted Tokens: [${tokens.join(", ")}]`);

  const ingressStart = performance.now();
  const ingressResult = buildIngressContext(testPrompt, scanner, config);
  const ingressDuration = performance.now() - ingressStart;

  console.log(`- Ingress Execution Time: ${ingressDuration.toFixed(2)}ms`);
  console.log(`- Matched Concepts Count: ${ingressResult.matchedConcepts.length}`);

  for (const match of ingressResult.matchedConcepts) {
    console.log(`  * Found: [${match.type}] ${match.title} (slug: ${match.slug}, rel: ${match.relationship || "none"})`);
  }

  console.log("\n5. Injected XML Context Payload:\n----------------------------------------");
  console.log(ingressResult.xmlContext);
  console.log("----------------------------------------");

  // Assertions
  if (ingressResult.matchedConcepts.length === 0) {
    throw new Error("FAIL: Saada was not matched in the concept graph!");
  }

  const matchedSaada = ingressResult.matchedConcepts.some((c) => c.slug === "saada");
  if (!matchedSaada) {
    throw new Error("FAIL: Saada concept was not found in matched entities!");
  }

  if (ingressDuration > 50) {
    throw new Error(`FAIL: Ingress latency took too long: ${ingressDuration}ms (expected < 50ms)`);
  }

  console.log("\n✅ ALL SMOKE TESTS PASSED! ZERO-LATENCY INGRESS CONTEXT READY.");
}

runSmokeTest().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
