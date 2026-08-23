#!/usr/bin/env node
/**
 * Seed the role map from a terminal.
 *
 * The app offers the same thing on an empty store, which is the way it is meant
 * to be used. This exists for setting up a fresh data directory without opening
 * a window, and for tests.
 *
 *   node scripts/seed-role-map.mjs [--dry]
 */

import { resolveDataDir } from "../src/domain/paths.js";
import { SEED_DUTIES, SEED_SIGNALS, seedRoleMap } from "../src/service/seed.js";
import { openStore } from "../src/storage/store.js";

const dry = process.argv.includes("--dry");
const { dir, source } = resolveDataDir();
const store = openStore({ dataDir: dir, role: "app", onWarning: (m) => console.warn(m) });

console.log(`Data directory: ${dir} (${source})`);

if (dry) {
  const haveDuties = new Set(store.rows("duties").map((d) => d.id));
  const haveSignals = new Set(store.rows("signals").map((s) => s.id));
  for (const d of SEED_DUTIES) {
    console.log(`  ${haveDuties.has(d.id) ? "=" : "+"} [${d.status}] ${d.name}`);
  }
  for (const s of SEED_SIGNALS) {
    console.log(`  ${haveSignals.has(s.id) ? "=" : "+"} [question] ${s.text}`);
  }
  console.log("\nDry run: nothing was written.");
  process.exit(0);
}

const { duties, questions } = seedRoleMap(store);
console.log(`\n${duties} duties and ${questions} questions added.`);
if (duties > 0) {
  console.log("The proposed duties do nothing until you accept them in the app.");
}
