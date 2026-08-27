#!/usr/bin/env node
/**
 * Drive the app in the private half.
 *
 * ## Why this is a second script rather than a section of the first one
 *
 * The mode is chosen at launch and switching it relaunches the app - which is
 * deliberate, and which means the main harness cannot reach the private half at
 * all: the switch would end its own run half-way through. So this launches a
 * second instance whose remembered mode is already private, and asks the
 * questions that only have answers over there.
 *
 * It is short on purpose. The private half has one view of its own today, and
 * every general claim about the app - navigation, dialogs, the palette - is
 * already covered by the work-half suite against the same code. What is asserted
 * here is only what differs, which is the mode itself.
 *
 * ## The four things worth proving
 *
 * That the choice survives a launch. That the store it opens is the private one
 * and is beside the work store rather than inside it. That the mode is visible
 * without opening anything. And that none of the machinery which means nothing
 * over there is still on offer - drift, cadences, prep, a focus budget.
 *
 * ## Same rules as the work-half harness
 *
 * It launches its own Electron and kills only that process, and it points both
 * data directories at scratch folders so a run can never write into real notes
 * about real people.
 *
 * It gives Electron its own user directory as well, because unlike the work
 * harness it is testing the remembered choice itself: the mode file has to be
 * somewhere, and the real one must not be written to. That flag is why this is
 * the only harness that may not check window chrome - a fresh Chromium profile
 * leaves the window unpresented, so maximising it does nothing measurable and a
 * screenshot never returns. Neither is asserted here, and the work harness covers
 * both against the same code.
 *
 *   node scripts/e2e-private.mjs [--port=N]
 */

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_PORT, describeListener, parsePort, portInUse, refusalMessage } from "./e2e-port.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const chosen = parsePort(process.argv);
if (chosen.error !== undefined) {
  console.error(chosen.error);
  process.exit(1);
}
// One above the work harness's default, so the two can run back to back without
// either waiting for the other's port to be released.
const PORT = chosen.port === DEFAULT_PORT ? DEFAULT_PORT + 1 : chosen.port;

if (await portInUse(PORT)) {
  // Named rather than guessed at. Attaching to whatever already holds the port
  // would drive the wrong app and fail checks that have nothing to do with the
  // code - the reason e2e-port.mjs exists at all.
  console.error(refusalMessage(PORT, describeListener(PORT), chosen.port !== DEFAULT_PORT));
  process.exit(1);
}

const scratch = mkdtempSync(join(tmpdir(), "tend-private-"));
const userData = join(scratch, "electron-user-data");
const work = join(scratch, "store");
mkdirSync(userData, { recursive: true });
mkdirSync(work, { recursive: true });

// The whole premise of the run: an app that was left in the private half.
writeFileSync(join(userData, "mode.json"), JSON.stringify({ mode: "private" }), "utf8");

console.log(`Scratch data: ${work}`);
console.log(`Expecting:    ${work}-private\n`);

const exe = join(root, "node_modules", "electron", "dist", "electron.exe");
const child = spawn(exe, [root, `--remote-debugging-port=${PORT}`, `--user-data-dir=${userData}`], {
  cwd: root,
  env: { ...process.env, TEND_DATA_DIR: work, NIB_DATA_DIR: join(scratch, "nib") },
  stdio: ["ignore", "pipe", "pipe"]
});

/** Everything the app said, kept for the case where it never opens a window. */
let log = "";
child.stdout.on("data", (d) => (log += String(d)));
child.stderr.on("data", (d) => (log += String(d)));

const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));

let failed = 0;

/**
 * `await`ed, always.
 *
 * A check whose body is async and is not awaited cannot fail: the assertion
 * rejects into nothing and the line prints ok. That has happened in this project
 * more than once, so this signature is async on purpose even where a body is not.
 *
 * @param {string} name
 * @param {() => void | Promise<void>} fn
 */
async function check(name, fn) {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  FAIL ${name}\n       ${error instanceof Error ? error.message : String(error)}`);
  }
}

try {
  /** @type {any} */
  let page = null;
  for (let attempt = 0; attempt < 60 && page === null; attempt += 1) {
    await sleep(500);
    try {
      const listed = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      page = /** @type {any[]} */ (listed).find((t) => t.type === "page") ?? null;
    } catch {
      page = null;
    }
  }
  if (page === null) {
    throw new Error(`The app never opened a window. What it said:\n${log}`);
  }

  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve) => (socket.onopen = resolve));

  let nextId = 0;
  /** @type {Map<number, (value: any) => void>} */
  const pending = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data));
    pending.get(message.id)?.(message.result);
    pending.delete(message.id);
  };

  /** @param {string} expression */
  const evaluate = (expression) =>
    new Promise((done) => {
      const id = ++nextId;
      pending.set(id, (result) => done(result?.result?.value));
      socket.send(
        JSON.stringify({
          id,
          method: "Runtime.evaluate",
          params: { expression, awaitPromise: true, returnByValue: true }
        })
      );
    });

  /**
   * Wait until the page can answer a question, and say what was being waited for
   * when it never could.
   *
   * The trap this exists for: the debugging target appears, and the socket opens,
   * before the page has a document. Evaluating `1` answers instantly while
   * `document.documentElement` is still null - so a readiness check on the former
   * proves nothing about the latter. Both a missing document and a thrown
   * expression come back as a reply carrying no value, which is
   * indistinguishable from a command that was never answered at all, so the
   * symptom was a stray parse error pointing at a line that was not the problem.
   *
   * @param {string} expression
   * @param {string} label
   */
  const waitFor = async (expression, label) => {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (await evaluate(expression)) {
        return;
      }
      await sleep(250);
    }
    throw new Error(`Timed out waiting for ${label}. What the app said:\n${log}`);
  };

  await waitFor("document.readyState === 'complete' && !!document.documentElement", "the document");
  // And then for the first draw, which is what puts the mode on the document.
  await waitFor("!!(document.documentElement.dataset.mode || '')", "the mode to be applied");

  const state = JSON.parse(
    String(
      await evaluate(`JSON.stringify({
        mode: document.documentElement.dataset.mode ?? "",
        badge: (document.getElementById('mode-badge') || {}).textContent || "",
        visible: [...document.querySelectorAll('.nav-btn')].filter(b => !b.hidden).map(b => b.dataset.view)
      })`)
    )
  );
  const status = JSON.parse(
    String(await evaluate(`window.tend.invoke('status').then(s => JSON.stringify(s))`))
  );

  console.log("");

  await check("the app remembers it was left in the private half", () => {
    if (status.mode !== "private") {
      throw new Error(`status says "${status.mode}"`);
    }
    if (state.mode !== "private") {
      throw new Error(`the document says "${state.mode}"`);
    }
  });

  await check("it opened the private store, beside the work one and not inside it", () => {
    // Nested, a backup or a sync of the work store would carry the private one
    // along - and the entire reason there are two is that they never travel
    // together.
    const expected = `${work}-private`;
    if (status.dataDir !== expected) {
      throw new Error(`opened ${status.dataDir}, expected ${expected}`);
    }
    if (status.dataDir.startsWith(`${work}\\`)) {
      throw new Error("the private store is nested inside the work store");
    }
  });

  await check("the mode is visible without opening anything", () => {
    if (String(state.badge).trim() !== "private") {
      throw new Error(`the badge beside the wordmark reads "${state.badge}"`);
    }
  });

  await check("the machinery that means nothing here is not on offer", () => {
    // Absent rather than dampened. A cadence over somebody you live with reads as
    // permanently fine and means nothing, and "you have not spoken to them in
    // three days" about a person in the next room is worse than useless.
    const gone = ["now", "prep", "focus", "people", "work", "role", "decisions"];
    const stillThere = gone.filter((v) => state.visible.includes(v));
    if (stillThere.length > 0) {
      throw new Error(`still offered: ${stillThere.join(", ")}`);
    }
    for (const kept of ["journal", "knowledge", "settings"]) {
      if (!state.visible.includes(kept)) {
        throw new Error(`${kept} should still be there and is not`);
      }
    }
  });

  const drawn = String(await evaluate("document.querySelector('.view-title')?.textContent ?? ''"));
  const current = String(
    await evaluate("document.querySelector('.nav-btn[aria-current=\"true\"]')?.dataset.view ?? ''")
  );
  await check("it landed on a view that exists here rather than drawing a work one", () => {
    // The assertion is about what got DRAWN, not about what the rail offers.
    // Drawing a work view over private data is the failure this whole
    // arrangement exists to prevent.
    if (!/The day/.test(drawn)) {
      throw new Error(`the drawn view is "${drawn}"`);
    }
    if (current !== "journal") {
      throw new Error(`the rail marks "${current}" as current`);
    }
  });

  const sub = String(await evaluate("document.querySelector('.view-sub')?.textContent ?? ''"));
  await check("and the page states the rule the private half is written under", () => {
    // In the form rather than only in a check afterwards: the rule said while the
    // entry is being written is worth more than any amount of reading it back.
    if (!/your own part/.test(sub)) {
      throw new Error(`the page does not state the rule: ${sub.slice(0, 180)}`);
    }
  });

  const errors = JSON.parse(String(await evaluate("JSON.stringify(window.__errors ?? [])")));
  await check("no uncaught renderer errors in any of that", () => {
    if (errors.length > 0) {
      throw new Error(errors.join(" | "));
    }
  });

  socket.close();
} finally {
  child.kill();
  // Windows keeps the directory open for a moment after the process goes, and a
  // temporary folder left behind must not decide the exit code.
  await sleep(1200);
  try {
    rmSync(scratch, { recursive: true, force: true });
  } catch {
    console.log(`  --   left ${scratch} behind; Windows still had it open`);
  }
}

console.log(
  failed === 0 ? "\nAll private-half checks passed." : `\n${failed} private-half check(s) failed.`
);
process.exit(failed === 0 ? 0 : 1);
