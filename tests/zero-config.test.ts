import fs from "node:fs";
import path from "node:path";
import { resolveDonnaConfig } from "../src/config.js";
import { OKFScanner } from "../src/okf/scanner.js";
import { initializeDonnaVault } from "../src/init.js";

async function testZeroConfig() {
  console.log("=== TEST: ZERO-CONFIG FIRST RUN BOOTSTRAP ===");

  const fakeHome = "/tmp/test-fresh-machine";
  if (fs.existsSync(fakeHome)) fs.rmSync(fakeHome, { recursive: true });
  fs.mkdirSync(fakeHome, { recursive: true });

  const fakeGlobalVault = path.join(fakeHome, ".donna", "vault", ".okf");
  process.env.DONNA_GLOBAL_VAULT = fakeGlobalVault;

  const someRandomProject = path.join(fakeHome, "random-project");
  fs.mkdirSync(someRandomProject, { recursive: true });

  // 1. Resolve config on clean machine
  const config = resolveDonnaConfig(someRandomProject);
  console.log("Initial state on clean machine:", {
    bundlePath: config.bundlePath,
    exists: fs.existsSync(config.bundlePath),
    principal: config.principalName
  });

  const scanner = new OKFScanner(config.bundlePath);
  console.log("Is bundle available before bootstrap?", scanner.isBundleAvailable());

  if (!scanner.isBundleAvailable()) {
    console.log("Triggering auto-bootstrap...");
    const targetDir = path.dirname(config.globalVaultPath);
    const initRes = initializeDonnaVault(targetDir, config.principalName);
    console.log("Auto-bootstrap result:", initRes.message);

    scanner.setBundlePath(config.globalVaultPath);
    scanner.scan();
  }

  console.log("Is bundle available after bootstrap?", scanner.isBundleAvailable());
  const concepts = scanner.getAllConcepts();
  console.log("Concepts indexed automatically:", concepts.map(c => c.title));

  if (!scanner.isBundleAvailable() || concepts.length === 0) {
    throw new Error("FAIL: Zero-config auto-bootstrap did not initialize concepts!");
  }

  // Cleanup
  fs.rmSync(fakeHome, { recursive: true });
  delete process.env.DONNA_GLOBAL_VAULT;

  console.log("\n✅ ZERO-CONFIG AUTO-BOOTSTRAP PASSED 100%!");
}

testZeroConfig().catch(err => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
