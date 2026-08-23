#!/usr/bin/env node
/**
 * Publish a release: check, clean, package, upload.
 *
 * A script rather than a chain of npm scripts, because four things have gone
 * wrong in the sibling apps and each one is guarded here.
 *
 *  - `dist/` MUST be cleared first, and it cannot be cleared while a packaged
 *    Tend is running. The app test harness starts one, so a release straight
 *    after a test run fails on a locked file.
 *  - Only processes running THIS build are stopped, matched on their executable
 *    path. Never by name: other Electron apps are open, and a broad kill closes
 *    whatever someone is working in.
 *  - The upload has to be electron-builder's own publisher. It names the
 *    installer in the dashed form `latest.yml` references; a hand-rolled
 *    `gh release create` produces a name with spaces, and electron-updater then
 *    404s on an asset in a release that looks perfectly published.
 *  - The token comes from the gh CLI at release time, so no long-lived GH_TOKEN
 *    sits in a shell profile or a file.
 *
 *   node scripts/release.mjs [--skip-tests]
 */

import { execFileSync, execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { stopRunningBuild } from "./stop-running-build.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const dist = join(root, "dist");
const skipTests = process.argv.includes("--skip-tests");

const { version, name } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

/** @param {string} command @param {string[]} args @param {NodeJS.ProcessEnv} [env] */
function run(command, args, env = process.env) {
  execFileSync(command, args, { cwd: root, stdio: "inherit", shell: true, env });
}

/** @param {string} message */
function fail(message) {
  console.error(`\n${message}`);
  process.exit(1);
}

console.log(`Releasing ${name} ${version}\n`);

/* ------------------------------------------------------- sanity checks -- */

const dirty = execSync("git status --porcelain", { cwd: root, encoding: "utf8" }).trim();
if (dirty) {
  fail(
    "The working tree has uncommitted changes. Release what is committed, or the\n" +
      "published build will not match any commit:\n\n" +
      dirty
  );
}

try {
  const existing = execSync(`gh release view v${version} --json tagName`, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  if (existing.trim()) {
    fail(
      `v${version} is already released on GitHub. Bump the version in package.json,\n` +
        "commit, and run this again."
    );
  }
} catch {
  // No such release, which is what we want.
}

if (!skipTests) {
  console.log("Running tests and type check...\n");
  run("npm", ["test"]);
  run("npm", ["run", "typecheck"]);
  console.log("");
}

/* ---------------------------------------- stop only this build's processes -- */

stopRunningBuild(dist);

/* --------------------------------------------------------------- clean -- */

// Old installers are deleted rather than left to pile up: a folder holding three
// versions makes it far too easy to hand someone the wrong one.
if (existsSync(dist)) {
  const stale = readdirSync(dist).filter((f) => /\.(exe|blockmap|yml)$/.test(f));
  if (stale.length) {
    console.log(`Removing ${stale.length} file(s) from a previous build.`);
  }
}

try {
  rmSync(dist, { recursive: true, force: true });
} catch (err) {
  fail(
    `Could not clear ${dist}: ${err instanceof Error ? err.message : String(err)}\n\n` +
      "Something still holds a file there. A packaged Tend left running by\n" +
      "`npm run test:app -- --keep` is the usual cause."
  );
}
console.log("Cleaned dist/\n");

/* ------------------------------------------------------------- publish -- */

let token;
try {
  token = execSync("gh auth token", { cwd: root, encoding: "utf8" }).trim();
} catch {
  fail("Could not get a token from `gh auth token` - is the gh CLI logged in?");
}
if (!token) {
  fail("`gh auth token` returned nothing.");
}

run("npx", ["electron-builder", "--win", "--publish", "always"], { ...process.env, GH_TOKEN: token });

console.log(`\nPublished ${version}. An installed copy picks it up on its next launch.`);
