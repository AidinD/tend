#!/usr/bin/env node
/**
 * Build an installer locally, without publishing anything.
 *
 * Same cleaning and process-stopping as a release, so that the thing you test
 * is built the same way as the thing that ships. What it does not do is upload,
 * check the working tree, or care whether the version was already released.
 *
 *   node scripts/package.mjs
 */

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { stopRunningBuild } from "./stop-running-build.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const dist = join(root, "dist");

const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
console.log(`Packaging Tend ${version}\n`);

stopRunningBuild(dist);

try {
  rmSync(dist, { recursive: true, force: true });
} catch (err) {
  console.error(
    `Could not clear ${dist}: ${err instanceof Error ? err.message : String(err)}\n` +
      "A packaged Tend left running by `npm run test:app -- --keep` is the usual cause."
  );
  process.exit(1);
}

execFileSync("npx", ["electron-builder", "--win", "--publish", "never"], {
  cwd: root,
  stdio: "inherit",
  shell: true
});

const built = readdirSync(dist)
  .filter((f) => f.endsWith(".exe"))
  .map((f) => ({ f, size: statSync(join(dist, f)).size }));

console.log("");
for (const { f, size } of built) {
  console.log(`  ${f}  (${(size / 1024 / 1024).toFixed(1)} MB)`);
}
console.log(`\nIn ${dist}. Nothing was uploaded.`);
