#!/usr/bin/env node
/**
 * Publish a release: check, clean, package, upload.
 *
 * The guards live in `keel/release` now. They are the whole value of having a
 * release script rather than a chain of npm scripts - each one is a thing that
 * went wrong in one of the sibling apps - and keeping four private copies meant
 * Nib was missing two of them and found out by publishing a release that did
 * nothing and said "Published".
 *
 * What stays here is the middle: which guards Tend wants, and how Tend builds.
 *
 *   node scripts/release.mjs [--skip-tests]
 */

import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { appMeta, clean, ghToken, nodeExec, preflight, stopRunningBuild } from "keel/release";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const dist = join(root, "dist");
const skipTests = process.argv.includes("--skip-tests");

const exec = nodeExec(root);
const { name, version, tag } = appMeta(root);

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

// Tend publishes from here, so there is no tag to guard - electron-builder
// creates it. The two that matter are a tree that matches what gets built, and a
// version that is not already up.
const failures = preflight(exec, { tag, checks: ["cleanTree", "notAlreadyReleased"] });
if (failures.length > 0) {
  fail(failures.map((failure) => failure.message).join("\n\n"));
}

if (!skipTests) {
  console.log("Running tests and type check...\n");
  run("npm", ["test"]);
  run("npm", ["run", "typecheck"]);
  console.log("");
}

/* ---------------------------------------- stop only this build's processes -- */

// `dist/` cannot be cleared while a packaged Tend holds a file in it, and
// `npm run test:app -- --keep` leaves exactly such a process. Matched on the
// executable path, so an installed Tend and every other Electron app are left
// alone.
stopRunningBuild(dist);

/* --------------------------------------------------------------- clean -- */

try {
  clean(root, ["dist"]);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
console.log("");

/* ------------------------------------------------------------- publish -- */

let token;
try {
  token = ghToken(exec);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

// electron-builder's own publisher, not `gh release create`: it names the
// installer in the dashed form `latest.yml` references, and a hand-rolled upload
// produces a name with spaces that electron-updater then 404s on.
run("npx", ["electron-builder", "--win", "--publish", "always"], { ...process.env, GH_TOKEN: token });

console.log(`\nPublished ${version}. An installed copy picks it up on its next launch.`);
