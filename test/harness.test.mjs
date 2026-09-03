/**
 * The app harness's two gates against driving the wrong app.
 *
 * `scripts/e2e-app.mjs` is the evidence gate before every release, so a run that
 * fails for reasons unrelated to the code is worse than no run: it teaches
 * everybody to re-run until green. On 2026-08-25 a stale Electron on the
 * debugging port produced four such failures. These tests are what stop the two
 * gates added for it from being quietly weakened later - particularly the one
 * that matters most, which is that neither gate is allowed to kill anything.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  DEFAULT_PORT,
  describeListener,
  listenerScript,
  parsePort,
  portInUse,
  refusalMessage,
  samePath,
  wrongInstance
} from "../scripts/e2e-port.mjs";

test("the port defaults to the documented one and --port overrides it", () => {
  assert.equal(parsePort(["node", "e2e-app.mjs"]).port, DEFAULT_PORT);
  assert.equal(parsePort(["node", "e2e-app.mjs", "--keep"]).port, DEFAULT_PORT);
  assert.equal(parsePort(["node", "e2e-app.mjs", "--port=9500"]).port, 9500);
  assert.equal(parsePort(["--packaged", "--port=12345", "--keep"]).port, 12345);
});

test("a --port that is not a usable port is refused rather than coerced", () => {
  for (const bad of ["", "abc", "80", "0", "70000", "9411.5", "-1", "9411abc", " 9411"]) {
    const parsed = parsePort([`--port=${bad}`]);
    assert.equal(parsed.port, undefined, `--port=${bad} should not have parsed`);
    assert.match(String(parsed.error), /whole number between 1024 and 65535/);
  }
});

test("nothing is listening on a port nobody opened", async () => {
  // Picked high and odd rather than random: a run of this suite must not depend
  // on what else the machine happens to have open, and 9411 itself is exactly
  // the port that might legitimately be busy while somebody works.
  assert.equal(await portInUse(59737), false);
});

test("a port with a listener on it is reported as in use", async () => {
  const { createServer } = await import("node:net");
  const server = createServer();
  await new Promise((done) => server.listen(0, "127.0.0.1", () => done(undefined)));
  const address = server.address();
  assert.ok(address && typeof address === "object", "the test server has no port");

  try {
    assert.equal(await portInUse(address.port), true);
  } finally {
    await new Promise((done) => server.close(() => done(undefined)));
  }
});

test("the lookup only ever reads - it can never stop a process", () => {
  const script = listenerScript(9411);

  // The whole point. The process holding the port is by definition one the
  // harness did not start, and this repo has already had a broad kill close
  // somebody's work. Reporting is allowed; stopping is not.
  assert.doesNotMatch(script, /Stop-Process|taskkill|Kill\(\)/i);
  assert.match(script, /Get-NetTCPConnection/);
  assert.match(script, /-State Listen/);
  assert.match(script, /\$port = 9411/);
});

test("the lookup asks about one port and not about a process name", () => {
  const script = listenerScript(9500);
  assert.match(script, /\$port = 9500/);
  assert.doesNotMatch(script, /9411/);

  // Matching on a name is the other half of the same mistake: several Electron
  // apps are usually running, and only the one holding this port is relevant.
  assert.doesNotMatch(script, /electron/i);
  assert.doesNotMatch(script, /-Name\b/);
});

test("the Windows lookup turns PowerShell output into lines for the message", () => {
  /** @type {Array<{ command: string, args: string[] }>} */
  const ran = [];
  const owners = describeListener(9411, {
    platform: "win32",
    run: (command, args) => {
      ran.push({ command, args });
      return "pid 1234: D:\\Repo\\Tools\\tend\\node_modules\\electron\\dist\\electron.exe\r\n\r\n";
    }
  });

  assert.deepEqual(owners, ["pid 1234: D:\\Repo\\Tools\\tend\\node_modules\\electron\\dist\\electron.exe"]);
  assert.equal(ran.length, 1);
  assert.equal(ran[0].command, "powershell.exe");
  assert.ok(ran[0].args.includes("-NonInteractive"), "PowerShell must not be able to prompt");
});

test("a lookup that fails leaves the refusal intact instead of replacing it", () => {
  const owners = describeListener(9411, {
    platform: "win32",
    run: () => {
      throw new Error("Get-NetTCPConnection is not recognised");
    }
  });
  assert.equal(owners, null);

  // The refusal is the safety property and the PID is the courtesy. Losing the
  // courtesy must not turn a clear "the port is taken" into a tooling error.
  const message = refusalMessage(9411, owners);
  assert.match(message, /Port 9411 is already in use/);
  assert.match(message, /could not identify the process/);
});

test("the refusal names the port, the PID and what to do about it", () => {
  const message = refusalMessage(9411, ["pid 1234: D:\\...\\electron.exe"]);

  assert.match(message, /Port 9411 is already in use/);
  assert.match(message, /pid 1234/);
  assert.match(message, /--port=9412/);
  assert.match(message, /will not stop a process it did not start/);
});

test("an explicit --port is not answered with a different number", () => {
  // Somebody who passed --port=9500 chose that port. Telling them to try 9501
  // reads as advice from a script that did not notice they had already decided.
  const message = refusalMessage(9500, ["pid 7"], true);
  assert.match(message, /pass a different --port/);
  assert.doesNotMatch(message, /--port=9501/);
});

test("the scratch directory this run made is what proves the app is ours", () => {
  const scratch = "/tmp/tend-app-a1b2c3";
  assert.equal(
    wrongInstance({
      port: 9411,
      expected: scratch,
      status: { dataDir: scratch, dataDirFrom: "env", version: "0.0.7" },
      platform: "linux"
    }),
    null
  );
});

test("an app on some other data directory stops the run with one clear reason", () => {
  const reason = wrongInstance({
    port: 9411,
    expected: "/tmp/tend-app-new",
    status: { dataDir: "/tmp/tend-app-stale", dataDirFrom: "env" },
    platform: "linux"
  });

  assert.ok(reason, "a stale instance has to be caught");
  assert.match(reason, /did not start/);
  assert.match(reason, /tend-app-stale/);
  assert.match(reason, /tend-app-new/);
  assert.match(reason, /will not stop a process it did not start/);
});

test("the real data directory is caught too, which is the case that matters most", () => {
  // This is the one worth being sure about: attaching to the installed app would
  // run every check against real notes about real colleagues.
  const reason = wrongInstance({
    port: 9411,
    expected: "C:\\Users\\me\\AppData\\Local\\Temp\\tend-app-x1",
    status: { dataDir: "D:\\Dropbox\\tend" },
    platform: "win32"
  });

  assert.ok(reason, "the real app has to be caught");
  assert.match(reason, /Dropbox/);
});

test("an app that answers nothing useful is not treated as ours", () => {
  for (const status of [null, undefined, "boom", 7, {}, { dataDir: "" }, { dataDir: 5 }]) {
    const reason = wrongInstance({
      port: 9411,
      expected: "/tmp/tend-app-new",
      status,
      platform: "linux"
    });
    assert.ok(reason, `status ${JSON.stringify(status)} should not have passed`);
    assert.match(reason, /did not start/);
  }
});

test("a difference in spelling is not read as a difference in identity", () => {
  // Failing a perfectly good run over a capital letter or a trailing slash would
  // be this bug wearing the other hat.
  assert.equal(samePath("C:\\Temp\\Tend-App-X", "c:\\temp\\tend-app-x", "win32"), true);
  assert.equal(samePath("/tmp/tend-app-x/", "/tmp/tend-app-x", "linux"), true);
  assert.equal(samePath("  /tmp/tend-app-x  ", "/tmp/tend-app-x", "linux"), true);

  // And case still matters where the filesystem says it does.
  assert.equal(samePath("/tmp/Tend-App-X", "/tmp/tend-app-x", "linux"), false);
  assert.equal(samePath("/tmp/tend-app-x", "/tmp/tend-app-y", "linux"), false);
});

/*
 * No check in either walkthrough may have an empty body.
 *
 * CLAUDE.md has said "a check that asserts nothing is worse than no check" and
 * "if a check() body is empty, it is a bug" since the first three were found.
 * Sixteen have now been found in this project: those three, ten more landed as
 * a batch on 2026-09-03, one written the same day and caught only by mutating
 * the feature away and noticing the suite stayed green, and two others earlier.
 *
 * Every one of them reported `ok` on every run from the day it was written. That
 * is the specific harm: not a missing check, which shows up as a gap, but a
 * check that testifies. It is the most expensive shape of bug this harness can
 * carry, because the whole point of the suite is to be believed.
 *
 * So the rule stops being a sentence. A sentence in a document does not survive
 * a session that is busy finishing something else - which is exactly how ten of
 * them accumulated under a document that forbade them.
 *
 * Deliberately a source check rather than a runtime one. An empty body cannot be
 * detected by running it: it passes, which is the problem.
 */
test("no walkthrough check has an empty body", () => {
  const files = ["../scripts/e2e-app.mjs", "../scripts/e2e-private.mjs"];
  /** @type {string[]} */
  const empty = [];
  let found = 0;

  for (const file of files) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");

    /*
     * `check("name", () => {})` and the same with an await in front, allowing
     * whitespace and newlines between the braces. Nothing else counts: a body
     * holding only a comment is a decision somebody wrote down, and a body
     * holding a `return` is doing something.
     */
    for (const m of source.matchAll(/check\(\s*(["'`])((?:(?!\1).)*)\1\s*,\s*(?:async\s*)?\(\s*\)\s*=>\s*\{\s*\}\s*\)/g)) {
      empty.push(`${file.replace("../", "")}: ${m[2]}`);
    }
    found += [...source.matchAll(/\bcheck\(\s*["'`]/g)].length;
  }

  /*
   * The vacuous case, and it is the same fault this test is about: a regex that
   * matches nothing would pass here for ever while proving nothing.
   */
  assert.ok(found > 150, `only ${found} checks found across the two walkthroughs, so the parse is wrong`);

  assert.deepEqual(empty, [], `these checks assert nothing:\n  ${empty.join("\n  ")}`);
});
