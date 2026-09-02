#!/usr/bin/env node
/**
 * Drive the real app, without touching the mouse.
 *
 * The obvious way to test a desktop app is to move the pointer and click
 * things, and it is the wrong way: it fights whoever is using the machine, it
 * steals focus, and every coordinate is a guess that goes stale the moment a
 * layout shifts. This talks to the running renderer over the Chrome DevTools
 * Protocol instead - it reads the DOM and dispatches real clicks on elements it
 * found by selector.
 *
 * It walks the whole product the way a person would on their first day: empty
 * app, set up the role map, add people, log things, run a focus, hand work
 * over. If any of that can only be done from a terminal, this fails.
 *
 * Three rules it follows, all learned the hard way:
 *
 *   It launches its OWN Electron instance and kills only that PID. Never kill
 *   by name - other Electron apps are often running and a broad kill closes
 *   whatever someone is working in.
 *
 *   It always points TEND_DATA_DIR at a scratch folder, so a test run can never
 *   write into real notes about real colleagues.
 *
 *   It only ever drives the instance it started. It refuses to begin when
 *   something already holds the debugging port, and once attached it asks the
 *   app which data directory it is using and stops unless the answer is this
 *   run's scratch folder. See scripts/e2e-port.mjs for why - the short version
 *   is that a stale Electron on the port produced four failures about the code
 *   and none of them were real.
 *
 *   node scripts/e2e-app.mjs [--keep] [--packaged] [--port=N]
 *
 * `--packaged` runs against dist/win-unpacked/Tend.exe instead of the
 * development Electron. Worth its own mode: Tend ships its source unbuilt, so
 * the packaged app resolves the preload and the renderer from inside an asar
 * archive, and a path that works in development can fail there with nothing but
 * a blank window.
 *
 * `--port` moves the debugging port, which is how two runs go at once and how a
 * run gets past a port something else has taken for good.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { RELATIONS } from "../src/domain/cadence.js";
import {
  DEFAULT_PORT,
  describeListener,
  parsePort,
  portInUse,
  refusalMessage,
  wrongInstance
} from "./e2e-port.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const keep = process.argv.includes("--keep");
const packaged = process.argv.includes("--packaged");

const chosen = parsePort(process.argv);
if (chosen.error !== undefined) {
  console.error(chosen.error);
  process.exit(1);
}
const PORT = chosen.port;

// Before anything is created, and before Electron is started. A refused run has
// to leave nothing behind: no scratch folders, no fixtures, and above all no
// half a run's worth of failures about code that is fine.
if (await portInUse(PORT)) {
  console.error(refusalMessage(PORT, describeListener(PORT), PORT !== DEFAULT_PORT));
  process.exit(1);
}

const scratch = mkdtempSync(join(tmpdir(), "tend-app-"));
const nibScratch = mkdtempSync(join(tmpdir(), "tend-app-nib-"));
const jotScratch = mkdtempSync(join(tmpdir(), "tend-app-jot-"));

let failures = 0;
let checks = 0;
// Checks the machine would not let this run make. Counted separately and named
// in the summary, because a run that quietly has one check fewer than the last
// one reads exactly like a run that passed everything.
let unmeasured = 0;

// The step the run is currently inside, and whether it ever reached a verdict.
// Both exist only for the exit guard installed further down, which is the one
// thing that can speak for a run that ends without printing a summary.
let currentStep = "attaching to the app";
let summarised = false;

/** @param {number} ms */
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

// The window manager animates a maximise and a restore, so for a few hundred
// milliseconds after the click the width is a moving target rather than a fact.
// Three equal reads eighty milliseconds apart is "it has stopped moving"; six
// seconds is long enough that only a click which never arrived runs out of it.
const SETTLE_STEP = 80;
const SETTLE_HOLDS = 3;
const SETTLE_TIMEOUT = 6000;

/** @param {string} label @param {() => void} fn */
function check(label, fn) {
  checks += 1;
  try {
    fn();
    console.log(`  ok   ${label}`);
  } catch (err) {
    failures += 1;
    console.error(`  FAIL ${label}`);
    console.error(`       ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * A check the machine could not be asked to answer, said out loud.
 *
 * Deliberately neither `ok` nor `FAIL`: it does not touch `checks`, so it can
 * never be read as something that passed, and it does not touch `failures`, so
 * it cannot fail a release over somebody's screen being locked. It prints the
 * reason on its own line, in the same shape as any other aside, because the
 * only thing worse than a check that cannot run is one that cannot run silently.
 *
 * @param {string} label @param {string} why
 */
function skip(label, why) {
  unmeasured += 1;
  console.log(`  --   not measured: ${label}`);
  console.log(`       ${why}`);
}

/** @param {string} label */
function step(label) {
  currentStep = label;
  console.log(`\n  - ${label}`);
}

/**
 * A group heading needs air above it, and the only honest way to know is to
 * measure the rendered pixels.
 *
 * A heading is a small uppercase label and a hairline rule. With nothing above
 * it, that rule reads as the underside of whatever came before rather than the
 * top of a new section - which is what happened when a card and a group ended
 * up as bare siblings, since a card carries no margin of its own and the gap
 * everywhere else comes from a flex parent neither of them had. Asserting the
 * stylesheet has the rule would pass with the rule deleted; asserting the
 * distance would not.
 *
 * Sixteen is well under the twenty-eight the rhythm actually uses, so this
 * fails on "glued" and stays quiet about a deliberate change of spacing.
 */
const MIN_GROUP_GAP = 16;

/**
 * Every group heading on the current view, and the gap above it.
 *
 * @param {{ evaluate: (script: string) => Promise<unknown> }} page
 * @returns {Promise<{ title: string, after: string, gap: number }[]>}
 */
async function groupGaps(page) {
  const raw = await page.evaluate(`JSON.stringify(
    [...document.querySelectorAll('.group')]
      .map((group) => {
        const above = group.previousElementSibling;
        const head = group.querySelector('.group-head');
        if (above === null || head === null) { return null; }
        const top = above.getBoundingClientRect();
        const bottom = head.getBoundingClientRect();
        // A collapsed box is either hidden or not laid out yet, and the
        // distance to it means nothing either way.
        if (top.height === 0 || bottom.height === 0) { return null; }
        return {
          title: ((group.querySelector('.group-title') || {}).textContent || '(untitled)').trim(),
          after: String(above.className || above.tagName.toLowerCase()),
          gap: Math.round(bottom.top - top.bottom)
        };
      })
      .filter((seen) => seen !== null)
  )`);
  return JSON.parse(String(raw));
}

/**
 * @param {{ title: string, after: string, gap: number }[]} gaps
 * @param {string} where
 */
function checkGroupGaps(gaps, where) {
  check(`no group heading is glued to what sits above it on ${where}`, () => {
    if (gaps.length === 0) {
      throw new Error("no group heading had anything above it to measure against");
    }
    const glued = gaps.filter((seen) => seen.gap < MIN_GROUP_GAP);
    if (glued.length > 0) {
      throw new Error(
        `${glued.length} of ${gaps.length} heading(s) under ${MIN_GROUP_GAP}px: ${JSON.stringify(glued)}`
      );
    }
  });
}

/**
 * Wait for the renderer to show up on the debugging port.
 *
 * `gone` lets it give up the moment the Electron it started has died, rather
 * than polling out the full fifteen seconds and then reporting a timeout. An
 * Electron that cannot bind the port exits almost at once, and "it never
 * appeared" is a much worse description of that than "it exited with 1".
 *
 * @param {() => string | null} gone Why the spawned process is no longer running.
 */
async function findPage(gone) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const dead = gone();
    if (dead) {
      throw new Error(`The app exited before the renderer appeared (${dead})`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const targets = /** @type {any[]} */ (await response.json());
      const page = targets.find((t) => t.type === "page");
      if (page) {
        return page;
      }
    } catch {
      // Port not up yet.
    }
    await sleep(250);
  }
  throw new Error("The renderer never appeared on the debugging port");
}

/** @param {string} url */
async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((done, fail) => {
    socket.addEventListener("open", () => done(undefined), { once: true });
    socket.addEventListener("error", () => fail(new Error("CDP socket failed")), { once: true });
  });

  let nextId = 1;
  /** @type {Map<number, { done: (v: any) => void, fail: (e: Error) => void }>} */
  const pending = new Map();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    const waiter = pending.get(message.id);
    if (!waiter) {
      return;
    }
    pending.delete(message.id);
    if (message.error) {
      waiter.fail(new Error(message.error.message));
    } else {
      waiter.done(message.result);
    }
  });

  /**
   * How long a single protocol command may take before it is called a failure.
   *
   * Generous, because `Runtime.evaluate` occasionally waits on the renderer, and
   * finite, because the alternative was this harness hanging forever. Every
   * command used to be a promise with nothing to settle it if the reply never
   * arrived, and one command reliably does not reply: `Page.captureScreenshot`
   * never answers while the window is not being presented - minimised, fully
   * occluded, or on a machine that has just locked. The run then sat there until
   * somebody noticed, with every check already passed and nothing said.
   *
   * A hang is the worst shape a test harness can fail in. It looks like slowness,
   * so it gets waited on; it produces no output, so there is nothing to read; and
   * it is intermittent, so it is blamed on the machine.
   */
  const COMMAND_MS = 30_000;

  /** @param {string} method @param {object} [params] */
  const send = (method, params = {}) =>
    new Promise((done, fail) => {
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        fail(new Error(`${method} did not answer within ${COMMAND_MS / 1000}s`));
      }, COMMAND_MS);
      pending.set(id, {
        done: (/** @type {any} */ value) => {
          clearTimeout(timer);
          done(value);
        },
        fail: (/** @type {any} */ reason) => {
          clearTimeout(timer);
          fail(reason);
        }
      });
      socket.send(JSON.stringify({ id, method, params }));
    });

  /** @param {string} expression */
  const evaluate = async (expression) => {
    const result = /** @type {any} */ (
      await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })
    );
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? "page threw");
    }
    return result.result.value;
  };

  /** @param {string} expression @param {string} label */
  const waitFor = async (expression, label) => {
    for (let attempt = 0; attempt < 60; attempt++) {
      if (await evaluate(expression)) {
        return;
      }
      await sleep(150);
    }
    throw new Error(`Timed out waiting for ${label}`);
  };

  /**
   * Is this renderer being drawn right now - and therefore in a position to
   * know how big its own window is?
   *
   * Asked by requesting one animation frame. A renderer whose window is
   * occluded, minimised or on a locked session is not composited, so no frame
   * ever arrives and the fallback timer answers instead. That is the same bit
   * of state that decides whether the browser process bothers pushing the
   * window's new size down to the renderer, which is why this is the question
   * worth asking rather than `document.visibilityState` on its own - though the
   * visibility is reported too, because it is the readable half of the answer
   * when this has to be printed.
   *
   * The fallback is a page timer, and a hidden page's timers are throttled to
   * about a second, so a "no" costs roughly a second rather than the 600ms
   * asked for. That is bounded and it is fine; the alternative, capturing a
   * frame, is what this replaced - it does not answer at all while the window
   * is not being presented, so it cost thirty seconds a go.
   *
   * @returns {Promise<{ frames: boolean, visibility: string }>}
   */
  const composited = async () => {
    const answer = await evaluate(`new Promise((done) => {
      let answered = false;
      const finish = (frames) => {
        if (answered) { return; }
        answered = true;
        done(JSON.stringify({ frames, visibility: document.visibilityState }));
      };
      requestAnimationFrame(() => finish(true));
      setTimeout(() => finish(false), 600);
    })`);
    return /** @type {{ frames: boolean, visibility: string }} */ (JSON.parse(String(answer)));
  };

  /**
   * Read the window's outer width until it holds still and satisfies `wanted`.
   *
   * Sampling once after a fixed sleep reads a width mid-flight: this check has
   * seen 1180 -> 160, which is neither a maximised width nor a restored one, and
   * then passed on an immediate re-run. Sleeping longer would only make that
   * rarer, and the harness is the thing that is supposed to catch races. A check
   * that cries wolf is worse than a missing one here, because it teaches
   * everybody to re-run until green, and that is how a real failure gets waved
   * through the gate before a release.
   *
   * `window.outerWidth` is the renderer's copy of a number the browser process
   * owns, and the push that keeps that copy current stops when the window stops
   * being composited. So the renderer is asked whether it is being drawn before
   * every read, and this gives up the moment it is not: `observable: false` says
   * the widths below are the last ones the renderer happened to be told, not the
   * window's size, and no length of waiting will turn one into the other. Every
   * width this returns with `observable: true` was read while the renderer was
   * in a position to know it.
   *
   * It never throws. It returns what it saw, widths passed through included, so
   * the caller can fail with the whole trace rather than with one misleading
   * number.
   *
   * @param {(width: number) => boolean} wanted
   * @returns {Promise<{ width: number, settled: boolean, observable: boolean,
   *   visibility: string, waited: number, trace: number[] }>}
   */
  const settledWidth = async (wanted) => {
    const started = Date.now();
    /** @type {number[]} */
    const trace = [];
    let last = NaN;
    let holds = 0;
    let visibility = "visible";

    while (Date.now() - started < SETTLE_TIMEOUT) {
      const live = await composited();
      visibility = live.visibility;
      if (!live.frames) {
        return {
          width: last,
          settled: false,
          observable: false,
          visibility,
          waited: Date.now() - started,
          trace
        };
      }

      const width = Number(await evaluate("window.outerWidth"));
      if (width === last) {
        holds += 1;
      } else {
        holds = 1;
        last = width;
        trace.push(width);
      }
      if (holds >= SETTLE_HOLDS && wanted(width)) {
        return {
          width,
          settled: true,
          observable: true,
          visibility,
          waited: Date.now() - started,
          trace
        };
      }
      await sleep(SETTLE_STEP);
    }

    return {
      width: last,
      settled: false,
      observable: true,
      visibility,
      waited: Date.now() - started,
      trace
    };
  };

  /** @param {string} selector */
  const click = async (selector) => {
    const clicked = await evaluate(
      `(() => { const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) { return false; } el.click(); return true; })()`
    );
    if (!clicked) {
      throw new Error(`Nothing matched ${selector}`);
    }
    await sleep(220);
  };

  /** Text content of the first match, or "" when there is none. */
  const text = async (/** @type {string} */ selector) =>
    String(
      await evaluate(
        `(document.querySelector(${JSON.stringify(selector)}) || {}).textContent || ""`
      )
    );

  /** Text of every match, as an array. */
  const texts = async (/** @type {string} */ selector) =>
    /** @type {string[]} */ (
      await evaluate(
        `JSON.stringify([...document.querySelectorAll(${JSON.stringify(selector)})].map(n => n.textContent))`
      ).then((v) => JSON.parse(String(v)))
    );

  /**
   * Fill the open dialog and confirm it.
   *
   * Values are set through the native property setter and followed by an input
   * event, which is what a framework-free page needs to see a change it did not
   * cause itself.
   *
   * @param {Record<string, string | boolean | string[]>} values An array value
   *   means a checkbox group: exactly the listed values are ticked.
   */
  const fillDialog = async (values) => {
    await waitFor("document.querySelector('.dialog') !== null", "a dialog");
    const script = `(() => {
      const values = ${JSON.stringify(values)};
      const dialog = document.querySelector('.dialog');
      for (const [name, value] of Object.entries(values)) {
        const all = dialog.querySelectorAll('[name="' + name + '"]');
        if (all.length === 0) { return 'no field named ' + name; }
        // An array means a checkbox group - a multiselect field renders one box
        // per option, all under the same name. Setting the first one, which is
        // what the single-element path does, silently ticks whoever happens to
        // be at the top of the roster instead of the person asked for.
        if (Array.isArray(value)) {
          for (const box of all) {
            box.checked = value.includes(box.value);
            box.dispatchEvent(new Event('change', { bubbles: true }));
          }
          continue;
        }
        const el = all[0];
        if (el.type === 'checkbox') { el.checked = Boolean(value); }
        else {
          const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
            : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, String(value));
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return 'ok';
    })()`;
    const result = await evaluate(script);
    if (result !== "ok") {
      throw new Error(String(result));
    }
    await click(".dialog [data-confirm]");
    await sleep(320);
  };

  /** Options offered by a multiselect (checkboxes) in the open dialog. */
  const dialogChoices = async (/** @type {string} */ name) =>
    /** @type {{ value: string, label: string }[]} */ (
      JSON.parse(
        String(
          await evaluate(
            `JSON.stringify([...document.querySelectorAll('.dialog [data-multi="${name}"] .multi-option')].map(l => ({ value: l.querySelector('input').value, label: l.textContent.trim() })))`
          )
        )
      )
    );

  /** Options offered by a select in the open dialog. */
  const dialogOptions = async (/** @type {string} */ name) =>
    /** @type {{ value: string, label: string }[]} */ (
      JSON.parse(
        String(
          await evaluate(
            `JSON.stringify([...document.querySelectorAll('.dialog [name="${name}"] option')].map(o => ({ value: o.value, label: o.textContent })))`
          )
        )
      )
    );

  const dismissDialog = async () => {
    if (await evaluate("document.querySelector('.dialog') !== null")) {
      await click(".dialog [data-cancel]");
      await sleep(200);
    }
  };

  /**
   * A picture, if one can be had.
   *
   * Returns null rather than throwing. These screenshots are documentation - they
   * end up in docs/ - and not one check depends on them, so a machine that cannot
   * present the window must not be able to fail a run where every check passed.
   * With the timeout above, the worst case is now thirty seconds and a line
   * saying why, instead of a harness that never returns.
   *
   * @param {string} path
   * @returns {Promise<string | null>}
   */
  const screenshot = async (path) => {
    try {
      const shot = /** @type {any} */ (await send("Page.captureScreenshot", { format: "png" }));
      writeFileSync(path, Buffer.from(shot.data, "base64"));
      return path;
    } catch (error) {
      console.log(`  --   no screenshot: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  };

  return {
    evaluate,
    waitFor,
    settledWidth,
    click,
    text,
    texts,
    fillDialog,
    dialogOptions,
    dialogChoices,
    dismissDialog,
    screenshot,
    close: () => socket.close()
  };
}

/** A Nib index in the shape Nib itself writes, so the binding has something real. */
/** A board shaped like Jot's, so Prep has open work to join against. */
function writeJotFixture() {
  writeFileSync(
    join(jotScratch, "todos.json"),
    JSON.stringify({
      categories: [{ id: "c-render", name: "Renderingen", domain: "work" }],
      todos: [
        {
          id: "j-1",
          text: "Byt ut rasteriseraren",
          status: "in-progress",
          categoryId: "c-render",
          priority: 0
        }
      ]
    }),
    "utf8"
  );
}

function writeNibFixture() {
  const day = 86_400_000;
  const now = Date.now();

  // Nib keeps metadata in index.json and every body in its own file. Both
  // halves, because reading only the first is exactly the mistake the model
  // layer would make invisibly - it would simply find nothing to read.
  mkdirSync(join(nibScratch, "notes"), { recursive: true });
  writeFileSync(
    join(nibScratch, "notes", "note-1.json"),
    JSON.stringify({
      id: "note-1",
      title: "1-1, senaste",
      html: "<p>Vi pratade om renderingen. Jag sa att jag skulle kolla med Nina om konferensen.</p>"
    }),
    "utf8"
  );

  writeFileSync(
    join(nibScratch, "index.json"),
    JSON.stringify({
      version: 1,
      // Nib's own tag catalog, in the shape Nib seeds it. Tend maps these onto
      // contact kinds; the names stay Nib's and the ids are what get stored.
      tags: [
        { id: "tag-one-to-one", name: "1-1", color: "#6f9cff", description: "" },
        { id: "tag-second-hand", name: "Second-hand", color: "#b98cff", description: "" },
        { id: "tag-principle", name: "Principle", color: "#e0b062", description: "" },
        { id: "tag-meeting", name: "Meeting", color: "#7fd1a8", description: "" }
      ],
      categories: [
        {
          // Principles, so the Knowledge view has something to search that is
          // not a note about a person - which is the whole point of it.
          id: "cat-books",
          name: "Books",
          subs: [{ id: "sub-htwf", name: "HTWF" }],
          notes: [
            {
              id: "note-p1",
              categoryId: "cat-books",
              subId: "sub-htwf",
              title: "1.1 · Kritisera inte - fråga i stället",
              preview: "Kritik får folk att försvara sig.",
              created: 1,
              edited: 1,
              // Tagged and flagged: a principle he is currently working on, plus
              // an action point he wrote on it and has not finished. Tend reads
              // both out of Nib rather than keeping its own copy.
              alerts: [{ id: "alert-1", text: "Använd den i tre veckor innan jag dömer", done: false }],
              flag: "open",
              tags: ["tag-principle"]
            },
            {
              id: "note-p2",
              categoryId: "cat-books",
              subId: "sub-htwf",
              title: "2.4 · Lyssna längre än det är bekvämt",
              preview: "Tystnaden efter frågan är där svaret kommer.",
              created: 1,
              edited: 1,
              alerts: [],
              flag: "",
              tags: []
            }
          ]
        },
        {
          id: "cat-1to1",
          name: "1-1",
          color: "#6f9cff",
          scope: "W",
          open: true,
          subs: [{ id: "sub-a", name: "Testperson" }],
          notes: [
            {
              id: "note-1",
              categoryId: "cat-1to1",
              subId: "sub-a",
              title: "1-1, senaste",
              preview: "",
              created: now - 20 * day,
              edited: now - 20 * day,
              pinned: false,
              tint: "",
              alerts: [{ id: "al-1", text: "Kolla med Nina om konferensen", done: false }],
              flag: "",
              tags: ["tag-second-hand"],
              hasImage: false,
              hasDrawing: false
            }
          ]
        },
        {
          /*
           * A standing meeting, written up once, with two other people in it.
           *
           * The folder that cannot be one person's: two of its flagged blocks
           * are commitments and there is nothing in the note saying whose. That
           * is the case the shared binding exists for, and the reason its
           * commitments wait instead of being copied onto everybody.
           */
          id: "cat-org",
          name: "Org",
          color: "#7fd1a8",
          scope: "W",
          open: true,
          subs: [{ id: "sub-sync", name: "Tuesday sync" }],
          notes: [
            {
              id: "note-sync",
              categoryId: "cat-org",
              subId: "sub-sync",
              title: "Tuesday sync",
              preview: "",
              created: now - 4 * day,
              edited: now - 4 * day,
              pinned: false,
              tint: "",
              alerts: [
                { id: "al-s1", text: "Skriva ihop en överlämningsplan", done: false },
                { id: "al-s2", text: "Boka rummet för workshopen", done: false }
              ],
              flag: "",
              tags: ["tag-meeting"],
              hasImage: false,
              hasDrawing: false
            }
          ]
        }
      ]
    }),
    "utf8"
  );
}

console.log(`Scratch data: ${scratch}`);
console.log(`Scratch Nib:  ${nibScratch}\n`);
writeNibFixture();
writeJotFixture();

const devElectron =
  process.platform === "win32"
    ? join(root, "node_modules", "electron", "dist", "electron.exe")
    : join(root, "node_modules", ".bin", "electron");
const packagedExe = join(root, "dist", "win-unpacked", "Tend.exe");

const exe = packaged ? packagedExe : devElectron;
if (packaged && !existsSync(exe)) {
  console.error(`No packaged build at ${exe}. Run \`npm run package\` first.`);
  process.exit(1);
}

const args = [...(packaged ? [] : [root]), `--remote-debugging-port=${PORT}`];
console.log(packaged ? "Mode: packaged build" : "Mode: development");

const child = spawn(exe, args, {
  cwd: root,
  env: {
    ...process.env,
    TEND_DATA_DIR: scratch,
    NIB_DATA_DIR: nibScratch,
    // Prep reads Jot's board, so the board has to be a fixture too. Without
    // this the run reads the real one: harmless in that it only reads, and
    // still wrong - the test would depend on whatever is on the board today,
    // and the same default-to-real habit is what put a real book title in a
    // Brief fixture earlier today.
    JOT_DATA_DIR: jotScratch,
    /*
     * Which half to drive, stated rather than inherited.
     *
     * The app remembers the half it was last left in, and every check below is
     * written against the work one - so a run started after somebody had been in
     * the private half would fail in a screenful of ways with nothing in the
     * output naming the cause.
     *
     * Said in the environment rather than by giving Electron its own user
     * directory, which was the first attempt and cost an hour: a fresh Chromium
     * profile made the window stop being presented, so maximising it did nothing
     * measurable and capturing a screenshot never returned. Two failures with no
     * connection to the change that caused them, in the part of the harness that
     * is hardest to reason about.
     */
    TEND_MODE: "work",
    ELECTRON_ENABLE_LOGGING: "0"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

console.log(`Debugging port: ${PORT} (pid ${child.pid})`);

/** @type {string[]} */
const mainOutput = [];
child.stdout?.on("data", (d) => mainOutput.push(String(d)));
child.stderr?.on("data", (d) => mainOutput.push(String(d)));

/** Why the spawned Electron is no longer running, or null while it is. */
let exitedBecause = /** @type {string | null} */ (null);
child.on("exit", (code, signal) => {
  exitedBecause = signal ? `signal ${signal}` : `exit code ${code}`;
});
child.on("error", (err) => {
  exitedBecause = `could not be started: ${err.message}`;
});

/** @type {Awaited<ReturnType<typeof connect>> | null} */
let page = null;

// A harness that can stop in the middle without failing is worse than no harness.
// A run once hung on a screenshot, printed a warning about an unsettled top-level
// await, and ended with no failing check and no summary - and the re-run went
// green, so the only evidence the gate had been cut short was a warning nobody was
// looking for. Anything that ends this process before the summary is a failure now,
// and it names the step it died in.
//
// Installed here rather than at the top of the file on purpose: the refusals above
// this line - a busy port, a missing packaged build - exit deliberately, and those
// are not a run that died.
process.on("exit", (code) => {
  if (summarised) {
    return;
  }
  console.error(`
The run ended during "${currentStep}" without reaching the end.`);
  console.error(`Node exited with ${code} and printed no summary, so nothing here passed.`);
  if (code === 0) {
    process.exitCode = 1;
  }
});

try {
  const target = await findPage(() => exitedBecause);
  page = await connect(target.webSocketDebuggerUrl);

  // Before a single check runs. The port was free a moment ago, which makes it
  // very likely this is ours, and "very likely" is not what a release gate
  // should be built on: the app hands back the data directory it opened, this
  // run made that directory with mkdtemp seconds ago, and no other instance on
  // the machine can name it. Anything else is somebody else's window.
  await page.waitFor("typeof window.tend?.invoke === 'function'", "the preload bridge");
  const reported = await page.evaluate(
    "window.tend.invoke('status').then((s) => JSON.stringify(s))"
  );
  const notOurs = wrongInstance({
    port: PORT,
    expected: scratch,
    status: JSON.parse(String(reported))
  });
  if (notOurs) {
    throw new Error(notOurs);
  }

  await page.waitFor("document.querySelector('.view-title') !== null", "the first view");
  console.log("App is up.");

  /* ------------------------------------------------------------ setup -- */

  step("A fresh install");

  check("uses the scratch data directory, not the real one", () => {
    if (!mainOutput.join("").includes(scratch)) {
      throw new Error(`main never reported the scratch dir: ${mainOutput.join("").slice(0, 300)}`);
    }
  });

  const emptyTitle = await page.text(".view-title");
  check("an empty app explains what it needs rather than looking serene", () => {
    if (!/Nothing to watch yet/.test(emptyTitle)) {
      throw new Error(`expected the first-run view, saw "${emptyTitle}"`);
    }
  });

  const firstRunActions = await page.texts(".card-foot .act");
  check("and offers both setup steps without mentioning a terminal", () => {
    const all = firstRunActions.join(" ");
    if (!/Add someone/.test(all) || !/Set up the role map/.test(all)) {
      throw new Error(`missing a setup action: ${all}`);
    }
    if (/npm|terminal|command|Claude/i.test(all)) {
      throw new Error(`a setup action mentions tooling: ${all}`);
    }
  });

  step("Setting up the role map from the window");

  await page.click('[data-act="seed"]');
  await page.waitFor("document.querySelector('.card.sev-proposed') !== null", "the proposals");

  const roleTitle = await page.text(".view-title");
  const proposedCount = await page.evaluate("document.querySelectorAll('.card.sev-proposed').length");
  const activeCount = await page.evaluate("document.querySelectorAll('.card.sev-ok').length");
  check("seeding lands you in the role map with proposals to decide", () => {
    if (!/Role map/.test(roleTitle)) {
      throw new Error(`expected the role map, saw "${roleTitle}"`);
    }
    // Six, not five: the stakeholder duty joined the set. This number is a
    // deliberate tripwire - a duty that arrives already active rather than
    // proposed is a duty the user never agreed to, and a missing status field
    // reads as active.
    if (proposedCount !== 6) {
      throw new Error(`expected 6 proposals, saw ${proposedCount}`);
    }
    if (activeCount !== 3) {
      throw new Error(`expected 3 active duties, saw ${activeCount}`);
    }
  });

  const questions = await page.evaluate(
    "document.querySelectorAll('[data-group=\"questions\"] .rows .row.static').length"
  );
  check("and three monthly questions, not six", () => {
    if (questions !== 3) {
      throw new Error(`expected 3 questions, saw ${questions}`);
    }
  });

  // Topics arrive with the same seed and are decided the same way. They are
  // counted separately from the questions on purpose: both render as plain
  // rows, and a selector that catches either would go green while showing the
  // wrong group.
  const topicRows = await page.evaluate(
    "document.querySelectorAll('[data-group=\"topics\"] .rows .row.static').length"
  );
  const topicProposals = await page.evaluate(
    "document.querySelectorAll('[data-group=\"topics\"] [data-act=\"acceptTopic\"]').length"
  );
  check("topics to raise are seeded too, all of them undecided", () => {
    if (topicRows === 0) {
      throw new Error("no topics were seeded");
    }
    if (topicProposals !== topicRows) {
      throw new Error(`${topicRows} topics but ${topicProposals} awaiting a decision`);
    }
  });

  const topicWhy = await page.evaluate(
    "document.querySelector('[data-group=\"topics\"] .row-name .src').textContent.trim().length"
  );
  check("and each says why it is worth the minutes", () => {
    if (topicWhy < 40) {
      throw new Error(`the reason is ${topicWhy} characters long, which is not a reason`);
    }
  });

  // Open the edit form on the stakeholder duty and check the subject survives a
  // round trip. This is the failure it catches: the select's option list was
  // hand-written and missing "stake", so the stored value matched nothing, the
  // browser showed the first option, and saving rewrote the duty to apply to
  // every colleague while consuming evidence that can never be about a person.
  // Nothing failed, and the duty then reported each person as never done with no
  // action in the app able to clear it.
  await page.click('[data-act="editDuty"][data-id="duty-stakeholder-update"]');
  const subjectOptions = await page.dialogOptions("subjectKind");
  const subjectSelected = await page.evaluate('document.querySelector(\'[name="subjectKind"]\').value');
  const cadenceShown = await page.evaluate('document.querySelector(\'[name="cadenceDays"]\').value');
  await page.click("[data-cancel]");
  await sleep(200);

  check("the duty form keeps the subject it was given, whatever it is", () => {
    if (!subjectOptions.some((o) => o.value === "stake")) {
      throw new Error(`"stake" is not offered: ${JSON.stringify(subjectOptions.map((o) => o.value))}`);
    }
    if (subjectSelected !== "stake") {
      throw new Error(`the form opened showing "${subjectSelected}", so saving would have rewritten it`);
    }
  });

  check("and prefills the interval as a number rather than scraping it from prose", () => {
    if (Number(cadenceShown) !== 30) {
      throw new Error(`the interval came back as "${cadenceShown}", expected 30`);
    }
  });

  await page.click('.card.sev-proposed [data-act="accept"]');
  // One fewer than whatever was there, read rather than hardcoded. The literal
  // that used to be here had to be edited every time the seed set changed, and
  // it fails as a timeout - which reads like a broken click rather than a
  // stale number.
  await page.waitFor(
    `document.querySelectorAll('.card.sev-proposed').length === ${proposedCount - 1}`,
    "one fewer proposal"
  );
  check("a proposal can be accepted with one click", () => {});

  /* ----------------------------------------------------------- people -- */

  step("Adding people");

  await page.click('.nav-btn[data-view="people"]');
  await page.waitFor("document.querySelector('.view-title') !== null", "the people view");
  await page.click('[data-act="addPerson"]');

  const relationOptions = await page.dialogOptions("relation");
  check("the add form explains what each relationship type means", () => {
    const remote = relationOptions.find((o) => o.value === "manage-remotely");
    if (!remote || !/without the observation/i.test(remote.label)) {
      throw new Error(`relationship options are bare: ${JSON.stringify(relationOptions)}`);
    }
  });

  // Counted against the domain rather than spot-checked. The renderer used to
  // keep its own copy of this list, so a relationship type added to the domain
  // was accepted by the service and simply absent from this dropdown, with
  // nothing failing anywhere: a stakeholder existed and could not be picked.
  check("and offers every relationship type the domain has", () => {
    const missing = Object.keys(RELATIONS).filter(
      (value) => !relationOptions.some((o) => o.value === value)
    );
    if (missing.length > 0) {
      throw new Error(`not offered in the window: ${missing.join(", ")}`);
    }
  });

  const longAgo = new Date(Date.now() - 200 * 86_400_000).toISOString().slice(0, 10);
  await page.fillDialog({ name: "Testperson Ström", relation: "manage-remotely", since: longAgo });
  await page.waitFor("document.querySelector('.row-name') !== null", "the roster");

  const roster = await page.texts(".row-name");
  check("the person appears, with Swedish characters intact", () => {
    if (!roster.some((n) => n.includes("Testperson Ström"))) {
      throw new Error(`roster is ${JSON.stringify(roster)}`);
    }
  });

  const groups = await page.texts(".group-title");
  check("and is grouped by relationship rather than listed flat", () => {
    if (!groups.some((g) => /Manage, don't see/.test(g))) {
      throw new Error(`groups are ${JSON.stringify(groups)}`);
    }
  });

  step("Someone neglected for months surfaces on their own");

  await page.click('.nav-btn[data-view="now"]');
  await page.waitFor("document.querySelector('.card') !== null", "something needing attention");

  const nowCards = await page.texts(".card-title");
  check("the neglected report is on the Now view unprompted", () => {
    if (!nowCards.some((c) => /Testperson/.test(c))) {
      throw new Error(`Now shows ${JSON.stringify(nowCards)}`);
    }
  });

  check("so are the monthly questions", () => {
    if (!nowCards.some((c) => /pushing back|retros|not seen/i.test(c))) {
      throw new Error(`no question on Now: ${JSON.stringify(nowCards)}`);
    }
  });

  /* --------------------------------------------------------- the loop -- */

  step("Doing the work from the window");

  await page.click('.card [data-act="logContact"]');
  await page.fillDialog({ kind: "second-hand", note: "Their lead says it is going well" });
  await sleep(400);

  const afterSecondHand = await page.texts(".card-title");
  check("a second-hand report satisfies only its own cadence", () => {
    if (!afterSecondHand.some((c) => /Testperson/.test(c) && /1-1/.test(c))) {
      throw new Error(
        "hearing about someone silenced the whole person, which is the confusion this model exists to prevent: " +
          JSON.stringify(afterSecondHand)
      );
    }
  });

  const questionCard = await page.evaluate(
    `(() => { const cards = [...document.querySelectorAll('.card')];
      const q = cards.find(c => c.querySelector('[data-act="answerNo"]'));
      return q ? q.querySelector('.card-title').textContent : null; })()`
  );
  await page.click('[data-act="answerNo"]');
  await sleep(500);
  const stillAsking = await page.texts(".card-title");
  check("answering a monthly question takes it off the board", () => {
    if (questionCard && stillAsking.includes(String(questionCard))) {
      throw new Error(`"${questionCard}" is still being asked`);
    }
  });

  /* ------------------------------------------------ taking it back -- */

  step("Undoing a mislogged contact, and going on leave");

  await page.click('.nav-btn[data-view="people"]');
  await page.waitFor("document.querySelector('.row-name') !== null", "the roster");
  await page.click('[data-act="open"]');
  await page.waitFor("document.querySelector('.line') !== null", "the contact history");

  // A contact logged against the wrong person or as the wrong kind is worse than
  // no log: it moves a clock and then looks identical to a real one. The history
  // was read-only, so there was no way to undo it - which is how a wrong entry
  // becomes permanent.
  const linesBefore = await page.evaluate("document.querySelectorAll('.line .act.danger').length");
  check("every logged contact can be taken back", () => {
    if (Number(linesBefore) === 0) {
      throw new Error("the contact history offers no way to undo an entry");
    }
  });

  /*
   * One structural invariant, checked here because this is the page where the
   * undo controls actually exist.
   *
   * `line-right` carries `flex: none`. A control put straight into a `line` is a
   * shrinkable flex item beside text that can be a paragraph, so a long note
   * squeezed the button until its label wrapped onto two lines and the row grew
   * to fit - which is how the contact, cancellation and moment rows all shipped
   * looking broken. Every row type is drawn by its own template, so a check per
   * row type is a check the fourth one will not have; this asserts the shape.
   *
   * Note the selector the checks around it use: `.line .act.danger` is a
   * DESCENDANT match, so it is satisfied either way. That is exactly why the
   * bug survived a page this walkthrough already clicked through.
   */
  const rowShape = await page.evaluate(`(() => {
    const bare = [...document.querySelectorAll('.line > button, .line > .pill, .line > select')];
    return JSON.stringify({
      loose: bare.map((el) => el.dataset.act ?? el.className),
      rows: document.querySelectorAll('.line').length,
      wrapped: document.querySelectorAll('.line > .line-right').length
    });
  })()`);
  /*
   * The other half of the provenance marker, and it needs this moment: nothing
   * has been imported yet, so every row here was typed by hand.
   *
   * Checked because a marker on every row stops being read. "Typed by hand" is
   * the assumption anyway; what needs marking is the row nobody typed. The
   * positive half is at the import step further down.
   */
  const markedTooEarly = await page.evaluate(
    "/from a note/.test(document.body.textContent)"
  );
  check("a hand-typed contact does not claim to come from a note", () => {
    if (markedTooEarly === true || String(markedTooEarly) === "true") {
      throw new Error("rows nobody imported are marked as derived, so the marker says nothing");
    }
  });

  check("and the undo button is wrapped, so a long note cannot squeeze it", () => {
    const shape = JSON.parse(String(rowShape));
    // A search for a shape passes perfectly against an empty page while proving
    // nothing, which is how the first version of this check passed against the
    // very bug it was written for. So an unexercised check fails.
    if (shape.wrapped === 0) {
      throw new Error(
        `nothing to check: ${shape.rows} rows on the page and no controls wrapped in any of them`
      );
    }
    if (shape.loose.length > 0) {
      throw new Error(`controls outside line-right: ${JSON.stringify(shape.loose)}`);
    }
  });

  await page.click(".line .act.danger");
  await page.click("[data-confirm]");
  await sleep(400);
  const linesAfter = await page.evaluate("document.querySelectorAll('.line .act.danger').length");
  check("and taking one back removes it from the history", () => {
    if (Number(linesAfter) !== Number(linesBefore) - 1) {
      throw new Error(`${linesBefore} entries before, ${linesAfter} after`);
    }
  });

  // A cancelled meeting, recorded as one. The guarantee that matters is the
  // negative: writing down that a 1-1 did not happen must NOT satisfy the 1-1
  // cadence, because the conversation still has not taken place. If it did, the
  // act of being honest about a cancellation would quiet the page that was
  // telling the truth.
  const cadencesBefore = await page.texts(".block .line-text");
  await page.click('[data-act="logSkip"]');
  await page.fillDialog({ kind: "one-to-one", why: "Release week, I moved it" });
  await page.waitFor(
    "document.body.textContent.includes('did not happen')",
    "the cancellation on the page"
  );

  const skipBlock = await page.evaluate(
    `(() => { const blocks = [...document.querySelectorAll('.block')];
      const b = blocks.find(x => /Booked and did not happen/.test(x.textContent));
      return b === undefined ? null : b.querySelectorAll('.line').length; })()`
  );
  check("a cancelled meeting is recorded in its own block, not among the contact", () => {
    if (Number(skipBlock) !== 1) {
      throw new Error(`the skip block holds ${skipBlock} entries`);
    }
  });

  const cadencesAfter = await page.texts(".block .line-text");
  check("and it satisfies nothing, because the conversation still has not happened", () => {
    const oneToOne = (/** @type {string[]} */ list) =>
      list.find((t) => /1-1/.test(t) && /never|ago/.test(t)) ?? "";
    if (oneToOne(cadencesAfter) !== oneToOne(cadencesBefore)) {
      throw new Error(
        `the cadence moved: "${oneToOne(cadencesBefore)}" became "${oneToOne(cadencesAfter)}"`
      );
    }
  });

  // Parental leave, a sabbatical, a long illness. Left unmodelled this produces
  // a red item that is not true and that nothing can clear, which is the one
  // failure this page must never have.
  await page.click('.nav-btn[data-view="now"]');
  await page.waitFor("document.querySelector('.card') !== null", "the Now view");
  const beforeLeave = await page.texts(".card-title");

  await page.click('.nav-btn[data-view="people"]');
  await page.waitFor("document.querySelector('.row-name') !== null", "the roster");
  await page.click('[data-act="open"]');
  await page.waitFor('document.querySelector(\'[data-act="edit"]\') !== null', "the person page");
  await page.click('[data-act="edit"]');
  const backSoon = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);
  await page.fillDialog({ awayUntil: backSoon });
  await sleep(400);

  await page.click('.nav-btn[data-view="now"]');
  await sleep(400);
  const afterLeave = await page.texts(".card-title");
  check("somebody on leave stops being reported as behind", () => {
    const named = (/** @type {string[]} */ list) => list.filter((c) => /Testperson/.test(c)).length;
    if (named(beforeLeave) === 0) {
      throw new Error("nothing was reported before the leave, so this proves nothing");
    }
    if (named(afterLeave) !== 0) {
      throw new Error(`still reported while away: ${JSON.stringify(afterLeave)}`);
    }
  });

  // Cleared again, so the rest of the walkthrough sees the person it expects.
  await page.click('.nav-btn[data-view="people"]');
  await page.waitFor("document.querySelector('.row-name') !== null", "the roster");
  const awayPill = await page.texts(".row-right .pill.plain");
  check("and the roster says why, rather than showing them as having no duties", () => {
    if (!awayPill.some((t) => /away/.test(t))) {
      throw new Error(`no marker on the row: ${JSON.stringify(awayPill)}`);
    }
  });

  await page.click('[data-act="open"]');
  await page.waitFor('document.querySelector(\'[data-act="edit"]\') !== null', "the person page");
  await page.click('[data-act="edit"]');
  await page.fillDialog({ awayUntil: "" });
  await sleep(400);
  await page.click('.nav-btn[data-view="now"]');
  await sleep(400);
  const afterReturn = await page.texts(".card-title");
  check("clearing the date brings them back, so an early return is sayable", () => {
    if (!afterReturn.some((c) => /Testperson/.test(c))) {
      throw new Error(`still hidden after clearing the date: ${JSON.stringify(afterReturn)}`);
    }
  });

  step("Promises");

  await page.click('.nav-btn[data-view="people"]');
  await page.waitFor("document.querySelector('.row-name') !== null", "the roster");
  await page.click('[data-act="open"]');
  await page.waitFor("document.querySelector('.panel-name') !== null", "the person page");

  const panelRole = await page.text(".panel-role");
  check("the person page explains the relationship in plain words", () => {
    if (!/mandate and none of the observation/.test(panelRole)) {
      throw new Error(`relationship not explained: "${panelRole}"`);
    }
  });

  await page.click('[data-act="logPromise"]');
  const threeWeeksAgo = new Date(Date.now() - 21 * 86_400_000).toISOString().slice(0, 10);
  await page.fillDialog({ text: "Kolla lönerevisionen och återkom", madeAt: threeWeeksAgo });
  await page.waitFor("document.body.textContent.includes('lönerevisionen')", "the promise");

  check("a backdated promise is logged and keeps its Swedish text", () => {});

  await page.click('.nav-btn[data-view="now"]');
  await page.waitFor("document.querySelector('.card') !== null", "Now");
  const withPromise = await page.texts(".card-title");
  check("and a three-week-old promise escalates on its own", () => {
    if (!withPromise.some((c) => /You owe/.test(c))) {
      throw new Error(`no promise on Now: ${JSON.stringify(withPromise)}`);
    }
  });

  await page.click('[data-act="resolvePromise"]');
  await sleep(500);
  const afterResolve = await page.texts(".card-title");
  check("and can be closed from the same card", () => {
    if (afterResolve.some((c) => /You owe/.test(c))) {
      throw new Error("the promise is still open");
    }
  });

  /* ----------------------------------------------------------- growth -- */

  step("A direction for somebody");

  await page.click('.nav-btn[data-view="people"]');
  await page.waitFor("document.querySelector('.row-name') !== null", "the roster");
  await page.click('[data-act="open"]');
  await page.waitFor("document.querySelector('.panel-name') !== null", "the person page");

  const beforeThread = await page.text(".panel");
  check("the person page offers a direction, and says why it is not for everybody", () => {
    if (!/Open a direction/.test(beforeThread)) {
      throw new Error("no way to open a direction from the person page");
    }
    if (!/not for everybody/.test(beforeThread)) {
      throw new Error("the empty state does not say the feature is selective");
    }
  });

  await page.click('[data-act="openThread"]');

  const openText = await page.text(".dialog");
  check("opening asks for his own view of the direction, and nothing else yet", () => {
    // The field used to be labelled "The direction, in one sentence" with a
    // second "what do you think the direction is" further down. Reading it, you
    // could not tell whether it wanted his description or the other person's
    // answer - which is exactly the distinction the two sittings exist to keep.
    if (!/What you think the direction is/.test(openText)) {
      throw new Error("the direction field does not say it is his own view");
    }
    if (/What do you think the direction is/.test(openText)) {
      throw new Error("the same question is still being asked twice on one screen");
    }
    if (/Do they want this, or does the job need it\?/.test(openText)) {
      throw new Error("opening still asks the driver question up front");
    }
    if (!/can wait/.test(openText)) {
      throw new Error("opening does not say the rest of the preparation can wait");
    }
  });

  check("stage one never asks him what the other person wants", () => {
    if (/in their words/i.test(openText)) {
      throw new Error("the opening form is asking a question only they can answer");
    }
  });

  await page.fillDialog({ aim: "Leder designgenomgången utan mig i rummet" });
  await page.waitFor("document.body.textContent.includes('designgenomgången')", "the thread");

  await page.click('[data-act="threadPrepare"]');
  const drivers = await page.dialogOptions("driver");
  check("preparing later asks whether they want it or the job needs it", () => {
    const values = drivers.map((d) => d.value);
    for (const expected of ["wants", "needs", "unknown"]) {
      if (!values.includes(expected)) {
        throw new Error(`driver "${expected}" is not offered: ${JSON.stringify(values)}`);
      }
    }
  });

  // Asserted on the field's own hidden state rather than on the dialog's text:
  // textContent carries hidden elements too, so a check written against the
  // words would pass whatever the form actually showed.
  const needHiddenAtFirst = await page.evaluate(
    "document.querySelector('.dialog [data-field=\"need\"]').hidden"
  );
  check("a question that does not apply is not on the screen", () => {
    if (needHiddenAtFirst !== true) {
      throw new Error("'whose need is it' is shown under an answer of 'I do not know yet'");
    }
  });

  await page.evaluate(`(() => {
    const el = document.querySelector('.dialog [name="driver"]');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, 'needs');
    el.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await sleep(150);

  const needShown = await page.evaluate(
    "!document.querySelector('.dialog [data-field=\"need\"]').hidden && " +
      "!document.querySelector('.dialog [data-field=\"ifNothingChanges\"]').hidden"
  );
  check("and appears the moment the answer it belongs to is chosen", () => {
    if (needShown !== true) {
      throw new Error("choosing 'the job needs it' did not reveal its own questions");
    }
  });

  const consequence = await page.text(".dialog");
  check("the needs branch asks what happens if nothing changes", () => {
    if (!/What happens if nothing changes/.test(consequence)) {
      throw new Error("the consequence question is missing from the form");
    }
    if (!/this is a wish/.test(consequence)) {
      throw new Error("the form does not say what an empty answer means");
    }
  });

  await page.fillDialog({
    driver: "needs",
    need: "teamet stannar av när jag är borta",
    ifNothingChanges: "jag är kvar som flaskhals och han står still",
    alreadySeen: "tog över retrot i juni utan att bli tillfrågad",
    offering: "arkitekturgenomgången, och jag slutar skriva migreringsplanen själv"
  });
  await page.waitFor("document.body.textContent.includes('flaskhals')", "the preparation");

  const opened = await page.text(".panel");
  check("a thread nobody has been asked yet does not offer to log a conversation", () => {
    // The two are not interchangeable, and only one of them is the next step: the
    // first conversation has somewhere better to go than a bare tally.
    if (/It came up/.test(opened)) {
      throw new Error("offered to count a conversation before their view is on record");
    }
    if (!/After the conversation/.test(opened)) {
      throw new Error("the next step is not offered at all");
    }
  });

  check("the thread is opened and keeps its Swedish text", () => {
    if (!/designgenomgången utan mig/.test(opened)) {
      throw new Error("the aim did not survive");
    }
  });

  // Read off the one line the thread POSES rather than off the whole panel: the
  // marker also appears in the "still to ask them" checklist, quite correctly, so
  // a panel-wide match cannot tell the two apart.
  const posed = await page.text(".thread .card-why.warn-text");
  check("and asks him to take it to the person, not to invent their yardstick", () => {
    if (!/Ask them/.test(posed)) {
      throw new Error(`a fresh thread posed something else: "${posed}"`);
    }
    if (/see in three months/.test(posed)) {
      throw new Error("it asked for the marker before the conversation that produces it");
    }
  });

  check("it does not offer 'I saw it' while there is nothing to have seen", () => {
    // Read off the rendered text, not the markup: an attribute never appears in
    // textContent, so a check written against `data-act` would pass whatever the
    // page did - which is exactly how a test ends up proving nothing.
    if (/I saw it/.test(opened)) {
      throw new Error("observing is offered before a marker exists");
    }
  });

  await page.click('[data-act="threadAsked"]');
  const stances = await page.dialogOptions("stance");
  check("the second sitting records how it landed, including no interest at all", () => {
    if (!stances.map((s) => s.value).includes("declined")) {
      throw new Error(`no way to record a declined direction: ${JSON.stringify(stances)}`);
    }
  });

  await page.fillDialog({
    theirWords: "jag vill hellre gå djupt på rendering",
    stance: "agreed",
    assignment: "äger migreringen hela vägen",
    marker: "Håller genomgången en gång med mig frånvarande"
  });
  await page.waitFor("document.body.textContent.includes('rendering')", "their words");

  const filled = await page.text(".panel");
  check("their words reach the thread", () => {
    if (!/hellre gå djupt på rendering/.test(filled)) {
      throw new Error("their words are not shown");
    }
  });

  check("the guess is not printed twice while it is still word for word the aim", () => {
    // One sentence written at the start is both the thread's name and the record
    // of what he thought. Until the aim is reworded they are the same string, and
    // showing both would read as the tool having lost track of which is which.
    if (/My guess before asking/.test(filled)) {
      throw new Error("the aim is being shown a second time as the guess");
    }
  });

  // Rewording the aim is what makes the two diverge, and the guess has to survive
  // it: that pair is the whole reason the field is kept.
  await page.click('[data-act="threadReword"]');
  await page.fillDialog({ aim: "Går djupt på rendering och äger den delen själv" });
  await page.waitFor("document.body.textContent.includes('Går djupt på rendering')", "the reworded aim");

  const reworded = await page.text(".panel");
  check("rewording the direction keeps what he thought before he asked", () => {
    if (!/Går djupt på rendering och äger den delen själv/.test(reworded)) {
      throw new Error("the aim was not reworded");
    }
    if (!/Leder designgenomgången utan mig i rummet/.test(reworded)) {
      throw new Error("the original guess was lost when the aim changed");
    }
  });

  check("and observing becomes possible once there is a marker", () => {
    if (!/I saw it/.test(filled)) {
      throw new Error("still no way to record an observation");
    }
  });

  const afterAsking = await page.text(".panel");
  check("recording what they said counts as having spoken to them", () => {
    // Otherwise the obvious way to use the form leaves the thread believing it
    // was never discussed - clock running, count at zero - and the stall reading
    // can never fire at all.
    if (!/discussed 1×/.test(afterAsking)) {
      throw new Error(`the conversation was not counted: ${afterAsking.slice(0, 300)}`);
    }
  });

  // Two more conversations, no observation. The reading this whole feature exists
  // for, and the one no calendar or task list can produce.
  for (const daysAgo of [45, 20]) {
    await page.click('[data-act="threadTalked"]');
    await page.fillDialog({
      note: "kom upp",
      at: new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10)
    });
    await sleep(200);
  }
  await page.waitFor("document.body.textContent.includes('discussed 3')", "the counts");

  const stalled = await page.text(".panel");
  check("three conversations and nothing observed reads as stalled, not as late", () => {
    if (!/aim wrong, or is the support missing/.test(stalled)) {
      throw new Error(`no stall question: ${stalled.slice(0, 400)}`);
    }
  });

  check("and both counts are shown, since either alone says nothing", () => {
    if (!/discussed 3×, seen 0×/.test(stalled)) {
      throw new Error("the two counts are not shown together");
    }
  });

  await page.click('.nav-btn[data-view="now"]');
  await page.waitFor("document.querySelector('.view-title') !== null", "Now");
  const nowText = await page.text("#main");
  check("a stalled direction stays off Now, where everything is a deviation to act on", () => {
    if (/aim wrong, or is the support missing/.test(nowText)) {
      throw new Error("the growth question reached Now");
    }
  });

  await page.click('.nav-btn[data-view="prep"]');
  await page.waitFor("document.querySelector('.view-title') !== null", "Prep");
  const growthOnCard = await page.text("#main");
  check("but it does reach the card you read before talking to them", () => {
    if (!/Growing/.test(growthOnCard)) {
      throw new Error("no growth block on the prep card");
    }
    if (!/aim wrong, or is the support missing/.test(growthOnCard)) {
      throw new Error("the question is not on the card");
    }
  });

  step("Letting a direction go");

  await page.click('.nav-btn[data-view="people"]');
  await page.waitFor("document.querySelector('.row-name') !== null", "the roster");
  await page.click('[data-act="open"]');
  await page.waitFor("document.querySelector('.panel-name') !== null", "the person page");

  await page.click('[data-act="threadEnd"]');
  const endings = await page.dialogOptions("status");
  check("every ending is offered, including stating it as an expectation", () => {
    const values = endings.map((e) => e.value);
    for (const expected of ["reached", "dropped", "expectation"]) {
      if (!values.includes(expected)) {
        throw new Error(`ending "${expected}" is not offered: ${JSON.stringify(values)}`);
      }
    }
  });

  // Deliberately leaving "I have told them" unchecked, which is the case that
  // matters: a direction let go in silence is the one that costs the relationship.
  await page.fillDialog({ status: "dropped", why: "han vill inte, och jobbet kräver det inte", said: false });
  await sleep(300);

  const ended = await page.text(".panel");
  check("a let-go direction keeps its reason where it can be read", () => {
    if (!/han vill inte, och jobbet kräver det inte/.test(ended)) {
      throw new Error("the reason was not kept");
    }
  });

  check("and keeps asking until he confirms he actually said it", () => {
    if (!/told them you let this go/.test(ended)) {
      throw new Error("a silent ending was accepted without a word");
    }
  });

  await page.click('[data-act="threadSaid"]');
  await sleep(300);
  const settled = await page.text(".panel");
  check("confirming it settles the thread without deleting the decision", () => {
    if (/told them you let this go/.test(settled)) {
      throw new Error("still asking after he said he told them");
    }
    if (!/han vill inte, och jobbet kräver det inte/.test(settled)) {
      throw new Error("the reason disappeared once it was settled");
    }
  });

  /* ------------------------------------------------------------- work -- */

  step("Handing work over");

  await page.click('.nav-btn[data-view="work"]');
  await page.waitFor("document.querySelector('.view-title') !== null", "the work view");

  await page.click('[data-act="addProject"]');
  await page.fillDialog({ name: "Bergsklyftan", since: longAgo });
  await page.waitFor("document.body.textContent.includes('Bergsklyftan')", "the project");
  check("a project can be added and backdated", () => {});

  await page.click('[data-act="addStream"]');
  const ownerOptions = await page.dialogOptions("owner");
  check("the workstream form offers the people you added as owners", () => {
    if (!ownerOptions.some((o) => /Testperson/.test(o.label))) {
      throw new Error(`owners offered: ${JSON.stringify(ownerOptions.map((o) => o.label))}`);
    }
  });
  const owner = ownerOptions.find((o) => /Testperson/.test(o.label));
  const project = (await page.dialogOptions("project")).find((o) => /Bergsklyftan/.test(o.label));
  await page.fillDialog({
    name: "Renderingen",
    owner: owner?.value ?? "",
    project: project?.value ?? "",
    level: "theirs"
  });
  await page.waitFor("document.body.textContent.includes('Renderingen')", "the workstream");

  const streamText = await page.text(".card .src");
  check("a workstream records its owner and its review interval", () => {
    if (!/Testperson/.test(streamText)) {
      throw new Error(`owner missing: "${streamText}"`);
    }
  });

  // A stakeholder is the one direction with no duty behind the person: they are
  // neither a report nor a peer, so nothing else in the app would ever mention
  // them. Driven from the window because the sibling feature - a delegation
  // review - had a button that could never work, and only the window showed it.
  await page.click('[data-act="addStake"]');
  const stakePeople = await page.dialogOptions("person");
  check("the stakeholder form offers the roster and the projects", () => {
    if (!stakePeople.some((o) => /Testperson/.test(o.label))) {
      throw new Error(`people offered: ${JSON.stringify(stakePeople.map((o) => o.label))}`);
    }
  });
  const stakeProject = (await page.dialogOptions("project")).find((o) => /Bergsklyftan/.test(o.label));
  await page.fillDialog({
    person: stakePeople.find((o) => /Testperson/.test(o.label))?.value ?? "",
    project: stakeProject?.value ?? "",
    cadenceDays: "30",
    what: "Whether it lands before the quarter closes",
    since: longAgo
  });
  await page.waitFor(
    "document.querySelector('[data-group=\"stakeholders\"] .row') !== null",
    "the stakeholder row"
  );

  const waiting = await page.text('[data-group="stakeholders"] .row-meta');
  check("somebody nobody has updated reads as never, not as zero days ago", () => {
    if (!/last never/.test(waiting)) {
      throw new Error(`the row says "${waiting}"`);
    }
    if (!/every 30 days/.test(waiting)) {
      throw new Error(`the interval is missing: "${waiting}"`);
    }
  });

  await page.click('[data-group="stakeholders"] [data-act="logUpdate"]');
  await page.fillDialog({ note: "Told them the import is done" });
  await page.waitFor(
    "/last today/.test(document.querySelector('[data-group=\"stakeholders\"] .row-meta').textContent)",
    "the update to land on the pair"
  );
  check("an update can be recorded against the person-and-project pair", () => {});

  // A delegation review is contact with a piece of WORK, not with a person or a
  // project. It used to answer "No project matching <uuid>" - the button was
  // there, the duty that consumes reviews existed, and nothing could ever
  // satisfy it. Driven from the window rather than the service layer, because
  // that is where it was broken.
  await page.click('[data-act="review"]');
  await page.fillDialog({ note: "Went through it with them" });
  await page.waitFor(
    "document.body.textContent.includes('reviewed today')",
    "the review to land on the workstream"
  );
  check("a delegation review can be recorded against a piece of work", () => {});

  /*
   * A project's own page.
   *
   * The list above answers "which project is drifting" and nothing else. What
   * was actually SAID at those looks was in the event log and reachable from
   * nowhere - reading the check-ins on one project meant grepping the log by its
   * id. So the claim under test is that one page gathers the check-ins, the work
   * inside it, and who is waiting to hear about it.
   */
  await page.click('[data-act="checkIn"]');
  await page.fillDialog({ note: "Gick igenom omfattningen, ligger kvar i tid" });
  await page.waitFor("document.body.textContent.includes('last looked at')", "the look to land");

  await page.click('[data-act="openProject"]');
  await page.waitFor("document.querySelector('.panel-name') !== null", "the project page");

  const projectPage = String(await page.evaluate("document.querySelector('.panel').textContent"));

  check("a project opens its own page from the row, without a click target on Remove", () => {
    if (!/Bergsklyftan/.test(projectPage)) {
      throw new Error(`the page does not say which project it is: ${projectPage.slice(0, 200)}`);
    }
  });

  check("and the check-in that was only in the log is readable on it", () => {
    // Swedish included on purpose: this text makes the round trip through a
    // dialog, the store and a template, and a stripped å looks like his words
    // while not being them.
    if (!/Gick igenom omfattningen, ligger kvar i tid/.test(projectPage)) {
      throw new Error(`the check-in note is not on the page: ${projectPage.slice(0, 400)}`);
    }
  });

  check("with the work inside it and who is waiting to hear about it", () => {
    if (!/Renderingen/.test(projectPage)) {
      throw new Error("the workstream inside the project is missing");
    }
    if (!/Testperson/.test(projectPage)) {
      throw new Error("nobody is listed as waiting to hear about it");
    }
  });

  await page.click('[data-act="backToWork"]');
  await page.waitFor(
    "document.querySelector('[data-act=\"addProject\"]') !== null",
    "the work lists again"
  );
  check("and the way back is one press, like the person page", () => {});

  /* ------------------------------------------------------------- prep -- */

  step("Preparing for a conversation");

  await page.click('.nav-btn[data-view="prep"]');
  await page.waitFor("document.querySelector('.view-title') !== null", "the prep view");

  const prepText = await page.text("#main");
  check("the card pulls the person, the promise and what they own into one place", () => {
    // The whole claim of this view: four sources without leaving the window.
    for (const wanted of ["Testperson", "Renderingen"]) {
      if (!prepText.includes(wanted)) {
        throw new Error(`"${wanted}" is not on the card: ${prepText.slice(0, 300)}`);
      }
    }
  });

  check("and says why the card is there rather than just listing them", () => {
    if (!/Last spoke/.test(prepText)) {
      throw new Error("the card does not say when they last spoke");
    }
    if (!/behind|promise/i.test(prepText)) {
      throw new Error("the card does not say why it is showing this person");
    }
  });

  const prepMandate = await page.texts(".prep-list .src");
  check("the mandate on the card says who DECIDES, not how closely you follow", () => {
    // The distinction the whole field rests on. Follow-up closeness implies
    // authority without stating it, which is how "you own this" ends up meaning
    // two different things to the two people in the conversation.
    if (!prepMandate.some((t) => /You decide|Ask me before|I decide/i.test(String(t)))) {
      throw new Error(`the mandate does not say who decides: ${prepMandate.join(" | ")}`);
    }
  });

  const prepHeads = await page.texts(".prep-head");
  check("open work from the Jot board reaches the card", () => {
    if (!prepHeads.some((h) => /Open on the board/.test(String(h)))) {
      throw new Error(`no board section: ${prepHeads.join(" | ")}`);
    }
    if (!prepText.includes("Byt ut rasteriseraren")) {
      throw new Error("the board fixture's task is not on the card");
    }
  });

  check("and the card does not say \"today ago\"", () => {
    if (/today ago/.test(prepText)) {
      throw new Error("humanDays returns \"today\", so the suffix has to know that");
    }
  });

  const practiceCard = await page.evaluate(
    `(() => { const c = document.querySelector('.prep-practice');
      if (c === null) { return null; }
      return JSON.stringify({
        title: c.querySelector('.card-title').textContent.trim(),
        lines: [...c.querySelectorAll('.prep-list li')].map(li => li.textContent.trim()),
        heads: [...c.querySelectorAll('.prep-head')].map(h => h.textContent.trim())
      }); })()`
  );
  check("the principles he is working on are above the cards, once for the page", () => {
    // Once rather than per card. They are about him, not about any one person,
    // and printing the same lines beside six names is how a card stops being
    // read at all.
    if (practiceCard === null) {
      throw new Error("no practice block on the prep page");
    }
    const block = JSON.parse(String(practiceCard));
    if (!block.lines.some((/** @type {string} */ l) => /Kritisera inte/.test(l))) {
      throw new Error(`the flagged principle is missing: ${JSON.stringify(block.lines)}`);
    }
    if (!block.heads.some((/** @type {string} */ h) => /said you would do/.test(h))) {
      throw new Error(`the unfinished action point has no home: ${JSON.stringify(block.heads)}`);
    }
    if (!block.lines.some((/** @type {string} */ l) => /tre veckor/.test(l))) {
      throw new Error(`the action point's own words are missing: ${JSON.stringify(block.lines)}`);
    }
  });

  const practiceCount = await page.evaluate("document.querySelectorAll('.prep-practice').length");
  check("and exactly once, not beside every name", () => {
    if (Number(practiceCount) !== 1) {
      throw new Error(`the block appears ${practiceCount} times`);
    }
  });

  const prepMissing = (await page.texts(".prep-missing")).length;
  check("and it says when a source could not be read, rather than looking calm", () => {
    // The harness binds a scratch Nib and points JOT_DATA_DIR at a scratch board,
    // so both should be readable here. If this fires, an integration is silently
    // returning nothing - which is the failure that sits unnoticed for weeks.
    if (prepMissing !== 0) {
      const why = prepText.match(/Could not read[^.]*\./)?.[0] ?? "unknown";
      throw new Error(`a source was unreadable: ${why}`);
    }
  });

  /* ------------------------------------------------------------ upward -- */

  step("What to raise with your own manager");

  // The direction nothing else in the app covers. No duty lists own-manager, so
  // before topics existed there was no path by which this person could ever
  // appear on a page - the whole upward half was unreachable from the window.

  await page.click('.nav-btn[data-view="people"]');
  await page.waitFor("document.querySelector('.view-title') !== null", "the people view");
  await page.click('[data-act="addPerson"]');
  const twoYears = new Date(Date.now() - 700 * 86_400_000).toISOString().slice(0, 10);
  await page.fillDialog({ name: "Chefen Testsson", relation: "own-manager", since: twoYears });
  await page.waitFor(
    "[...document.querySelectorAll('.row-name')].some(n => /Chefen/.test(n.textContent))",
    "the manager on the roster"
  );

  await page.click('.nav-btn[data-view="role"]');
  await page.waitFor(
    "document.querySelector('[data-act=\"acceptTopic\"][data-id=\"topic-next-level\"]') !== null",
    "the upward topic"
  );
  await page.click('[data-act="acceptTopic"][data-id="topic-next-level"]');
  await page.waitFor(
    "document.querySelector('[data-act=\"acceptTopic\"][data-id=\"topic-next-level\"]') === null",
    "the topic to leave the undecided pile"
  );

  await page.click('.nav-btn[data-view="prep"]');
  await page.waitFor("document.querySelector('.prep-card') !== null", "the prep cards");

  /* ------------------------------------------- the page has a shape to scan -- */

  const stripes = JSON.parse(
    String(
      await page.evaluate(`(() => {
        const cards = [...document.querySelectorAll('.prep-card')];
        return JSON.stringify({
          cards: cards.length,
          withSeverity: cards.filter((c) => /\\bsev-/.test(c.className)).length,
          classes: cards.map((c) => (c.className.match(/sev-[a-z]+/) ?? ['none'])[0]),
          headColour: (() => {
            const head = document.querySelector('.prep-head');
            return head === null ? '' : getComputedStyle(head).color;
          })(),
          badges: cards.map((c) => {
            const pill = c.querySelector(".card-top .pill");
            return pill === null ? "plain" : (pill.className.match(/(critical|warn|watch|ok)/) ?? ["none"])[0];
          }),
          smallPrintColour: (() => {
            const src = document.querySelector('.prep-card .src');
            return src === null ? '' : getComputedStyle(src).color;
          })(),
          // The page behind the cards and one card, as actually rendered, so
          // the gap between them is measured rather than asserted from the
          // token values - which is the difference between checking the design
          // and checking that somebody typed a hex code.
          pageGround: getComputedStyle(document.body).backgroundColor,
          cardGround: cards.length === 0 ? '' : getComputedStyle(cards[0]).backgroundColor
        });
      })()`)
    )
  );

  check("every prep card says how bad it is, not just that it exists", () => {
    /*
     * `.card.sev-*` was in the stylesheet long before this page existed and
     * this page never set the class, so a card 62 weeks behind and one a day
     * behind were the same colour - on a list whose entire order is worst first.
     */
    if (stripes.cards === 0) {
      throw new Error("no prep cards on the page, so nothing was checked");
    }
    if (stripes.withSeverity !== stripes.cards) {
      throw new Error(
        `${stripes.withSeverity} of ${stripes.cards} cards carry a severity: ${JSON.stringify(stripes.classes)}`
      );
    }
  });

  check("the drift number carries its severity, not just its value", () => {
    /*
     * `.badge` has no styling in the stylesheet at all, so "+62w" and "+3d"
     * rendered as identical plain text on a page whose whole order is worst
     * first. The number is the thing that gets scanned.
     *
     * A card with no number keeps a plain badge on purpose: the fallback text is
     * a sentence, and a sentence inside a tabular-nums pill looks broken.
     */
    const coloured = stripes.badges.filter((/** @type {string} */ b) => b !== "plain" && b !== "none");
    if (coloured.length === 0) {
      throw new Error(`no card shows a severity-coloured number: ${JSON.stringify(stripes.badges)}`);
    }
  });

  check("a card sits on a lighter ground than the page behind it", () => {
    /*
     * It used to be eight per channel, which reads as one continuous field of
     * grey once two cards are adjacent - a single card in isolation always
     * looks fine, which is why this went unnoticed.
     *
     * Ten is the floor rather than the target. The value in use is eleven to
     * fifteen depending on channel, and the point of a floor is to catch the
     * ladder being flattened back rather than to pin the exact shade.
     */
    const parse = (/** @type {string} */ c) =>
      (c.match(/\d+/g) ?? []).slice(0, 3).map((n) => Number(n));

    const page = parse(stripes.pageGround);
    const card = parse(stripes.cardGround);
    if (page.length !== 3 || card.length !== 3) {
      throw new Error(`could not read both grounds: page ${stripes.pageGround}, card ${stripes.cardGround}`);
    }

    const gap = card.map((n, i) => n - page[i]);
    if (gap.some((n) => n < 10)) {
      throw new Error(`the card is only ${JSON.stringify(gap)} above the page; cards run together below ten`);
    }
  });

  check("a section label is a step brighter than the small print under it", () => {
    // They were the same colour and size, so a heading, a hint and a date were
    // indistinguishable and the page had no structure to read.
    if (stripes.headColour === "" || stripes.smallPrintColour === "") {
      throw new Error("could not read both colours, so nothing was compared");
    }
    if (stripes.headColour === stripes.smallPrintColour) {
      throw new Error(`both render as ${stripes.headColour}`);
    }
  });

  await page.screenshot(join(root, "docs", "prep-view.png"));

  const managerCard = await page.evaluate(
    "JSON.stringify((() => {" +
      "const card = [...document.querySelectorAll('.prep-card')]" +
        ".find(c => /Chefen/.test(c.querySelector('.card-title').textContent));" +
      "if (card === undefined) { return { found: false }; }" +
      "return {" +
        "found: true," +
        "why: card.querySelector('.card-why').textContent.trim()," +
        "topics: card.querySelectorAll('.prep-topic').length," +
        "text: card.querySelector('.topic-text') === null ? '' : card.querySelector('.topic-text').textContent.trim()" +
      "}; })())"
  );
  const manager = JSON.parse(String(managerCard));
  check("a standing question is enough to put someone on the prep page", () => {
    if (!manager.found) {
      throw new Error("the manager has no card, so the upward half is still unreachable");
    }
    if (manager.topics !== 1) {
      throw new Error(`expected one topic on the card, saw ${manager.topics}`);
    }
    if (!/topic worth raising/.test(manager.why)) {
      throw new Error(`the card does not say why it is there: "${manager.why}"`);
    }
    if (!/next level/i.test(manager.text)) {
      throw new Error(`the wrong topic is on the card: "${manager.text}"`);
    }
  });

  await page.click('.prep-card [data-act="markRaised"]');
  await page.waitFor(
    "[...document.querySelectorAll('.prep-card .card-title')].every(t => !/Chefen/.test(t.textContent))",
    "the card to go once the question has been asked"
  );
  check("marking it raised clears it, so the block cannot become wallpaper", () => {});

  /* -------------------------------------------------------- decisions -- */

  /* ---------------------------------------------------- the day -- */

  step("Writing the day down");

  await page.click('.nav-btn[data-view="journal"]');
  await page.waitFor("document.querySelector('.view-title') !== null", "the journal view");

  const emptyJournal = await page.text("#main");
  check("an empty journal says which questions it asks and why it asks them", () => {
    if (!/took the day/.test(emptyJournal) || !/avoided/.test(emptyJournal)) {
      throw new Error(`the empty state names no questions: ${emptyJournal.slice(0, 200)}`);
    }
    // The load-bearing phrase, not a paraphrase of it. The app asks only for
    // what it cannot derive, and the empty state has to say so - otherwise the
    // form reads as three chores rather than three questions worth answering.
    if (!/only reason it asks/.test(emptyJournal)) {
      throw new Error("it does not say why it is asking rather than deriving");
    }
  });

  // One box, and nothing else. Three required fields would produce something
  // invented at eleven at night, and invented data reads like a fact afterwards.
  await page.click('[data-act="writeEntry"]');
  await page.fillDialog({ avoided: "Feedbackrundorna, igen" });
  await page.waitFor(
    "document.body.textContent.includes('Feedbackrundorna')",
    "the entry on the page"
  );

  // `[data-entry]`, not `.card`. The page also carries a reading card, and
  // "the first card" answered about that one instead the moment it appeared.
  const oneBox = await page.evaluate(
    `(() => { const card = document.querySelector('[data-entry]');
      return JSON.stringify({
        heads: [...card.querySelectorAll('.prep-head')].map(h => h.textContent.trim()),
        text: card.textContent
      }); })()`
  );
  check("an entry with one box filled is a whole entry", () => {
    const card = JSON.parse(String(oneBox));
    if (card.heads.length !== 1) {
      throw new Error(`an empty box was rendered anyway: ${JSON.stringify(card.heads)}`);
    }
    if (!/What I avoided/.test(card.heads[0])) {
      throw new Error(`the wrong box survived: ${JSON.stringify(card.heads)}`);
    }
  });

  const coverageLine = await page.text(".prep-dropped");
  check("and the page says how thin the record is, before any summary exists", () => {
    if (!/1 entry across 1 day/.test(coverageLine)) {
      throw new Error(`coverage reads "${coverageLine}"`);
    }
    if (!/pattern/.test(coverageLine)) {
      throw new Error("it does not warn that this is too little to read a pattern into");
    }
  });

  // Same day again: an edit, not a second row. Three partial entries for one
  // Tuesday would make every count over days wrong.
  await page.click('[data-act="writeEntry"]');
  await page.fillDialog({ avoided: "Feedbackrundorna, igen", took: "Sjöhästen hela dagen" });
  await page.waitFor("document.body.textContent.includes('Sjöhästen hela dagen')", "the edit");

  const cardsAfter = await page.evaluate("document.querySelectorAll('[data-entry]').length");
  check("writing the same day again edits it rather than adding a second", () => {
    if (Number(cardsAfter) !== 1) {
      throw new Error(`${cardsAfter} entries for one day`);
    }
  });

  const nowAfterJournal = await page.evaluate(
    `(() => { const b = document.querySelector('.nav-btn[data-view="journal"] .nav-count');
      return b === null ? "none" : b.textContent; })()`
  );
  check("the rail carries no count for it, because nothing here is waiting", () => {
    // Every other entry in the rail earns a number because something waits. A
    // badge on an optional habit is only ever a reproach, and a tool that
    // reproaches you every evening is one you stop opening.
    if (String(nowAfterJournal).trim() !== "none" && String(nowAfterJournal).trim() !== "") {
      throw new Error(`the rail shows "${nowAfterJournal}"`);
    }
  });

  // The reading is the product and the entries were always the means, so the
  // offer has to be visible from the page - and refused out loud while there is
  // too little written, rather than being a button that fails when pressed.
  const reading = await page.evaluate(
    `(() => { const btn = document.querySelector('[data-act="readJournal"]');
      const card = btn === null ? null : btn.closest('.card');
      return JSON.stringify({
        offered: btn !== null,
        disabled: btn === null ? null : btn.disabled,
        why: card === null ? "" : card.textContent
      }); })()`
  );
  check("the page offers to read the entries, and says why it will not yet", () => {
    const r = JSON.parse(String(reading));
    if (!r.offered) {
      throw new Error("no reading is offered at all");
    }
    if (r.disabled !== true) {
      throw new Error("one entry over one day is below the floor and the button was live anyway");
    }
    // The floor stated before the press rather than as an error after it. A
    // refusal you could have seen coming should have been a disabled button
    // with a reason on it.
    if (!/four entries/.test(r.why) || !/three separate days/.test(r.why)) {
      throw new Error(`it does not say what would make a reading possible: ${r.why.slice(0, 220)}`);
    }
  });

  step("A weekly reflection");

  await page.click('.nav-btn[data-view="reflection"]');
  await page.waitFor("document.querySelector('.view-title') !== null", "the reflection view");

  const emptyReflection = await page.text("#main");
  check("an empty reflection page names the two questions it asks", () => {
    if (!/went well/i.test(emptyReflection) || !/differently/i.test(emptyReflection)) {
      throw new Error(`the empty state does not name the two questions: ${emptyReflection.slice(0, 200)}`);
    }
  });

  // The habit reminder itself is not checked here. It only fires once the store
  // holds activity older than the cadence, which this run's fixture never
  // reaches, so there is no point in the harness where it is live - asserting it
  // here would be asserting a blank. Its firing, clearing, weight, absence of a
  // severity and the `habit` flag Now reads are covered in
  // test/myattention.test.mjs, where the dates can be set to make it true.
  //
  // One question answered, the other left out - this is still a whole
  // reflection. The two questions are not a pair of required fields.
  await page.click('[data-act="addReflection"]');
  await page.fillDialog({ wellDone: "Skeppet höll kursen genom hela veckan" });
  await page.waitFor(
    "document.body.textContent.includes('Skeppet höll kursen genom hela veckan')",
    "the reflection on the page"
  );

  const reflectionCards = await page.evaluate("document.querySelectorAll('[data-reflection]').length");
  check("a reflection with only one question answered is still kept", () => {
    if (Number(reflectionCards) !== 1) {
      throw new Error(`${reflectionCards} reflection cards, expected 1`);
    }
  });

  const railCountReflection = await page.evaluate(
    `(() => { const b = document.querySelector('.nav-btn[data-view="reflection"] .nav-count');
      return b === null ? "none" : b.textContent; })()`
  );
  check("the rail carries no count for it either, same reasoning as the day", () => {
    if (String(railCountReflection).trim() !== "none" && String(railCountReflection).trim() !== "") {
      throw new Error(`the rail shows "${railCountReflection}"`);
    }
  });

  step("Recording a decision");

  await page.click('.nav-btn[data-view="decisions"]');
  await page.waitFor("document.querySelector('.view-title') !== null", "the decisions view");

  const ledgerEmpty = await page.text("#main");
  check("an empty log says which decisions are worth recording", () => {
    if (!/renegotiated/.test(ledgerEmpty)) {
      throw new Error("the empty state does not say what belongs here");
    }
  });

  await page.click('[data-act="add"]');
  await page.fillDialog({
    what: "Renderingen bemannas inte om",
    because: "Teamet klarar den med två, och en tredje skulle betala för sig först nästa kvartal",
    rejected: "Låna in någon från plattformsteamet i sex veckor",
    consulted: "Testperson",
    revisitDays: "60"
  });
  await page.waitFor("document.body.textContent.includes('bemannas inte om')", "the decision");

  const ledgerText = await page.text("#main");
  check("the decision keeps its reasoning and what was rejected", () => {
    // The two fields people skip, and the only ones that make the record
    // readable by somebody who was not there.
    if (!/klarar den med två/.test(ledgerText)) {
      throw new Error("the reasoning is missing from the card");
    }
    if (!/plattformsteamet/.test(ledgerText)) {
      throw new Error("what was rejected is missing from the card");
    }
  });

  check("and resolves who was consulted against the roster", () => {
    if (!/Consulted: Testperson/.test(ledgerText)) {
      throw new Error(`consulted was not resolved: ${ledgerText.slice(0, 200)}`);
    }
  });

  check("and says when it comes back, which is what makes it a tool", () => {
    if (!/back on \d{4}-\d{2}-\d{2}/.test(ledgerText)) {
      throw new Error("no revisit date on the card");
    }
  });

  const ledgerMissing = await page.texts(".card-why.warn-text");
  check("a complete record is not nagged about", () => {
    if (ledgerMissing.length > 0) {
      throw new Error(`told off for a complete decision: ${ledgerMissing.join(" | ")}`);
    }
  });

  /* ------------------------------------------------------------ focus -- */

  step("Running a focus");

  await page.click('.nav-btn[data-view="focus"]');
  await page.waitFor("document.querySelector('.view-title') !== null", "the focus view");

  const focusIntro = await page.texts(".card-why");
  check("the focus view states the contract before you start one", () => {
    const all = focusIntro.join(" ");
    if (!/never/i.test(all) || !/critical/i.test(all)) {
      throw new Error(`the contract is not stated: ${all.slice(0, 200)}`);
    }
  });

  await page.click('[data-act="start"]');
  const inTwoWeeks = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  await page.fillDialog({ name: "Få igång Skiff", endsAt: inTwoWeeks, budgetPercent: "50" });
  await page.waitFor("document.querySelector('.metrics') !== null", "the running focus");

  const focusTitle = await page.text(".view-title");
  const heldBack = await page.text(".metric-value");
  check("a focus starts and reports what it is holding back", () => {
    if (!/Skiff/.test(focusTitle)) {
      throw new Error(`expected the focus, saw "${focusTitle}"`);
    }
    if (heldBack === "") {
      throw new Error("no metrics shown");
    }
  });

  // The guarded list sits directly under a card here, with no flex parent
  // between them - the one place in the app where a group and a card are bare
  // siblings, and so the place the gap goes missing first.
  checkGroupGaps(await groupGaps(page), "the focus view");

  await page.click('.nav-btn[data-view="now"]');
  await page.waitFor("document.querySelector('.view-title') !== null", "Now");
  const underFocus = await page.texts(".card-title");
  check("and never hides the neglected report while it runs", () => {
    if (!underFocus.some((c) => /Testperson/.test(c))) {
      throw new Error(`the focus buried a guarded duty: ${JSON.stringify(underFocus)}`);
    }
  });

  /* -------------------------------------------------------------- nib -- */

  step("Binding Nib");

  await page.click('.nav-btn[data-view="settings"]');
  await page.waitFor("document.querySelector('.view-title') !== null", "settings");

  /*
   * The mode, before anything else on this page.
   *
   * Deliberately only read, never switched: switching relaunches the app, which
   * would end this run. What has to be true is that a fresh install is in the
   * work half and looks exactly as it always did - the private half is opt-in,
   * and a default that ever came up private would be the worst possible bug in
   * this feature.
   */
  const modeState = await page.evaluate(
    `(() => {
      const btn = document.querySelector('[data-act="switchMode"]');
      const badge = document.getElementById('mode-badge');
      const hidden = [...document.querySelectorAll('.nav-btn')].filter(b => b.hidden).length;
      return JSON.stringify({
        mode: document.documentElement.dataset.mode ?? "",
        offersPrivate: btn === null ? null : btn.dataset.to,
        badge: badge === null ? "missing" : badge.textContent.trim(),
        hiddenRailButtons: hidden
      }); })()`
  );
  check("a fresh install is in the work half, and says which half it is in", () => {
    const m = JSON.parse(String(modeState));
    if (m.mode !== "work") {
      throw new Error(`the app came up in "${m.mode}" mode`);
    }
    if (m.offersPrivate !== "private") {
      throw new Error(`the switch offers "${m.offersPrivate}" rather than the private half`);
    }
    // Empty in the work half on purpose. A badge that is always there stops
    // being read, which is the trap the rail counts are already arranged around.
    if (m.badge !== "") {
      throw new Error(`the mode badge reads "${m.badge}" in work mode`);
    }
    if (m.hiddenRailButtons !== 0) {
      throw new Error(`${m.hiddenRailButtons} rail entries are hidden in the work half`);
    }
  });

  const settingsText = await page.evaluate("document.body.textContent");
  check("settings finds the Nib folders", () => {
    if (!/folder\(s\) found in Nib/.test(String(settingsText))) {
      throw new Error("Nib was not readable from the app");
    }
  });

  await page.click('[data-act="bind"]');
  const folderOptions = await page.dialogOptions("folder");
  check("and offers them with their note counts", () => {
    if (!folderOptions.some((o) => /Testperson/.test(o.label) && /1 note/.test(o.label))) {
      throw new Error(`folders offered: ${JSON.stringify(folderOptions.map((o) => o.label))}`);
    }
  });

  const folder = folderOptions.find((o) => /1-1 \/ Testperson/.test(o.label));
  const personOption = (await page.dialogChoices("people"))[0];

  // The rows are Tend's OWN kinds, answered with a Nib tag - not Nib's tags
  // asked what they mean. The other way round put the notebook's vocabulary in
  // charge of the question, so a folder of conversations with a colleague got
  // asked about a book tag.
  const kindRow = await page.dialogOptions("kind:second-hand");
  check("the dialog asks Tend's kinds and offers Nib's tags as answers", () => {
    if (!kindRow.some((o) => /Second-hand/.test(o.label))) {
      throw new Error(`offered: ${JSON.stringify(kindRow.map((o) => o.label))}`);
    }
    if (!kindRow.some((o) => o.value === "")) {
      throw new Error("there is no way to leave a kind unmapped");
    }
  });

  const noSurvey = await page.evaluate(
    "document.querySelector('[name=\"kind:survey\"]') === null"
  );
  check("and it does not ask about kinds a note can never be evidence of", () => {
    if (noSurvey !== true) {
      throw new Error("a survey round is a form going out, not something a note carries");
    }
  });

  check("the roster is offered as a list you can name more than one of", () => {
    // The field became a multiselect when a folder was allowed to be a meeting
    // rather than a person. One name is still the ordinary answer.
    if (personOption === undefined) {
      throw new Error("no people offered, so nothing was actually exercised");
    }
  });

  await page.fillDialog({
    folder: folder?.value ?? "",
    people: [personOption?.value ?? ""],
    "kind:second-hand": "tag-second-hand",
    "kind:one-to-one": ""
  });
  // The row reads "as second-hand", not "as one-to-one": the folder no longer
  // has a kind of its own, so what it counts as IS the mapping on it.
  await page.waitFor("document.body.textContent.includes('second-hand')", "the binding");
  check("a folder can be bound to a person without leaving the app", () => {});

  const boundRow = String(await page.evaluate("document.body.textContent"));
  check("and the row says what it counts as, which is now the mapping itself", () => {
    if (!/as second-hand/.test(boundRow)) {
      throw new Error("the binding does not report the mapping saved with it");
    }
  });

  check("and Settings says which notebook it read", () => {
    if (!/Reading /.test(boundRow)) {
      throw new Error("no notebook path on screen; two notebooks cannot be told apart");
    }
  });

  // Counted before and after the import, because the walkthrough logs contact
  // by hand earlier in the run. What matters is what the IMPORT added.
  const driver = page;
  const kindCounts = () =>
    driver
      .evaluate(
        "window.tend.invoke('person', { person: 'Testperson' }).then((p) => JSON.stringify(p.recentContact.map((t) => t.kind)))"
      )
      .then((raw) =>
        JSON.parse(String(raw)).reduce((/** @type {any} */ tally, /** @type {string} */ kind) => {
          tally[kind] = (tally[kind] ?? 0) + 1;
          return tally;
        }, {})
      );

  const kindsBefore = await kindCounts();
  await page.click('[data-act="index"]');
  await page.waitFor("document.querySelector('.dialog') !== null", "the import result");
  const importResult = await page.text(".dialog-intro");
  check("importing brings in the note and the flagged action point", () => {
    if (!/1 contact record/.test(importResult) || !/1 promise/.test(importResult)) {
      throw new Error(`import said: "${importResult}"`);
    }
  });
  await page.dismissDialog();

  // The failure this whole feature fixes: the fixture note is tagged
  // second-hand, and the folder's default is 1-1. Counting it as a 1-1 would
  // reset the clock on having spoken to them and nothing would look wrong.
  const kindsAfter = await kindCounts();
  check("a tagged note counts as its tag, not as the folder's default", () => {
    const added = (/** @type {string} */ kind) => (kindsAfter[kind] ?? 0) - (kindsBefore[kind] ?? 0);
    if (added("second-hand") !== 1) {
      throw new Error(
        `the import added ${added("second-hand")} second-hand contacts; ${JSON.stringify({ kindsBefore, kindsAfter })}`
      );
    }
    if (added("one-to-one") !== 0) {
      throw new Error(`a tagged note still reset the 1-1 clock; ${JSON.stringify({ kindsBefore, kindsAfter })}`);
    }
  });

  /*
   * An imported row says it was imported.
   *
   * The store has recorded `from: "nib"` since the importer was written and the
   * page could never say it, so two rows about one conversation - one typed by
   * hand, one derived from the note - were indistinguishable at exactly the
   * moment somebody was deciding which of them was wrong. Answering that took
   * reading the event log by hand.
   *
   * Both halves are checked, because a marker on every row stops being read: the
   * derived row carries it and a hand-typed one does not.
   */
  await page.click('.nav-btn[data-view="people"]');
  await page.waitFor("document.querySelector('.row-name') !== null", "the roster");
  await page.click('[data-act="open"]');
  await page.waitFor("document.querySelector('.line') !== null", "the contact history");

  const marked = await page.evaluate(`(() => {
    const rows = [...document.querySelectorAll('.line')].filter(
      (line) => line.querySelector('[data-act="unlogContact"]') !== null
    );
    return JSON.stringify(
      rows.map((line) => ({
        text: line.querySelector('.line-text')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
        derived: /from a note/.test(line.textContent ?? '')
      }))
    );
  })()`);
  const contactRows = JSON.parse(String(marked));

  check("a contact derived from a note says so", () => {
    if (contactRows.length === 0) {
      throw new Error("no contact rows on the page, so nothing was checked");
    }
    if (!contactRows.some((/** @type {any} */ r) => r.derived)) {
      throw new Error(`no row says where it came from: ${JSON.stringify(contactRows)}`);
    }
  });

  await page.click('.nav-btn[data-view="now"]');
  await page.waitFor("document.querySelector('.view-title') !== null", "Now");
  const afterImport = await page.evaluate("document.body.textContent");
  check("and the promise from Nib keeps its Swedish text", () => {
    if (!/Kolla med Nina om konferensen/.test(String(afterImport))) {
      throw new Error("the imported promise is missing or mangled");
    }
  });

  /* --------------------------------------------- a note several people were in -- */

  step("One note, several people in it");

  /*
   * The case a per-person folder cannot hold: a standing meeting written up
   * once. Two things have to be true at the same time and they pull in opposite
   * directions - the contact has to reach EVERYBODY, because everybody there was
   * spoken to, and the commitments must reach NOBODY until he says whose they
   * are, because one flagged block is one obligation however many people were in
   * the room.
   */
  await page.click('.nav-btn[data-view="settings"]');
  await page.waitFor("document.querySelector('[data-act=\"bind\"]') !== null", "the bind button");
  await page.click('[data-act="bind"]');

  const syncFolder = (await page.dialogOptions("folder")).find((o) => /Tuesday sync/.test(o.label));
  const syncRoster = await page.dialogChoices("people");
  const both = syncRoster
    .filter((o) => /Testperson|Chefen/.test(o.label))
    .map((o) => o.value);

  check("the binding dialog can name more than one person", () => {
    if (syncFolder === undefined) {
      throw new Error("the shared meeting folder was not offered, so nothing was exercised");
    }
    if (both.length < 2) {
      throw new Error(`only ${both.length} of the roster was offered as a checkbox`);
    }
  });

  await page.fillDialog({
    folder: syncFolder?.value ?? "",
    people: both,
    name: "Tuesday sync",
    "kind:meeting": "tag-meeting"
  });
  await page.waitFor("document.body.textContent.includes('Tuesday sync')", "the shared binding");

  const boundShared = String(await page.evaluate("document.body.textContent"));
  check("and the row names everybody it covers, not just the first", () => {
    if (!/Testperson[^\n]*Chefen|Chefen[^\n]*Testperson/.test(boundShared)) {
      throw new Error("the binding row does not name both people");
    }
  });

  await page.click('[data-act="index"]');
  await page.waitFor("document.querySelector('.dialog') !== null", "the second import result");
  const sharedImport = await page.text(".dialog-intro");
  await page.dismissDialog();

  check("one note becomes contact with everybody who was there", () => {
    if (!/2 contact records/.test(sharedImport)) {
      throw new Error(`the shared note did not reach both people: "${sharedImport}"`);
    }
  });

  check("and its commitments are held rather than copied onto each of them", () => {
    // Two action points across two attendees would be four promises. That is
    // the bug this whole shape exists to avoid, so the import must report them
    // as waiting and must not report any promise at all.
    if (/[1-9]\d* promise/.test(sharedImport)) {
      throw new Error(`a shared note guessed an owner: "${sharedImport}"`);
    }
    if (!/2 commitments are waiting/.test(sharedImport)) {
      throw new Error(`the commitments were not queued: "${sharedImport}"`);
    }
  });

  await page.click('.nav-btn[data-view="now"]');
  await page.waitFor("document.querySelector('.view-title') !== null", "Now");
  const unfiledCard = String(await page.evaluate("document.body.textContent"));
  check("the daily page says the queue exists, once for the meeting", () => {
    if (!/2 commitments from Tuesday sync/.test(unfiledCard)) {
      throw new Error("Now does not mention the unfiled commitments");
    }
  });

  await page.click('[data-act="fileCommitments"]');
  await page.waitFor("document.querySelector('.dialog') !== null", "the filing dialog");

  const owners = await page.dialogOptions("c0");
  check("filing offers only the people who were actually in that meeting", () => {
    if (owners.length === 0) {
      throw new Error("no options offered, so nothing was exercised");
    }
    if (!owners.some((o) => o.value === "")) {
      throw new Error("there is no way to leave one unanswered");
    }
    if (!owners.some((o) => o.value === "none")) {
      throw new Error("there is no way to say it is nobody's promise");
    }
    const named = owners.filter((o) => o.value !== "" && o.value !== "none");
    if (named.length !== 2) {
      throw new Error(`offered ${named.length} candidates for a two-person meeting`);
    }
  });

  const firstOwner = owners.find((o) => /Testperson/.test(o.label));
  await page.fillDialog({ c0: firstOwner?.value ?? "", c1: "none" });
  await page.waitFor(
    "document.body.textContent.includes('Skriva ihop') || !document.body.textContent.includes('commitments from Tuesday sync')",
    "the queue to clear"
  );

  const afterFiling = String(await page.evaluate("document.body.textContent"));
  check("filing one and discarding the other empties the queue", () => {
    if (/commitments from Tuesday sync/.test(afterFiling)) {
      throw new Error("the queue card is still on Now after every row was answered");
    }
  });

  const filed = JSON.parse(
    String(
      await page.evaluate(
        "window.tend.invoke('promises', {}).then((p) => JSON.stringify(p.map((x) => x.text)))"
      )
    )
  );
  check("the one he named became a real promise, and the other did not", () => {
    if (!filed.some((/** @type {string} */ t) => /Skriva ihop en/.test(t))) {
      throw new Error(`the filed commitment is not a promise: ${JSON.stringify(filed)}`);
    }
    if (filed.some((/** @type {string} */ t) => /Boka rummet/.test(t))) {
      throw new Error("the discarded commitment was filed anyway");
    }
  });

  /* ------------------------------------------------------------- tags -- */

  step("Tags decide what a note counts as");

  // The failure this fixes is invisible: a folder holds every sort of note
  // about ONE PERSON, so a note about what somebody else said sat with the 1-1
  // notes and reset the 1-1 clock. The app then said they were in step.
  await page.click('.nav-btn[data-view="settings"]');
  await page.waitFor("document.querySelector('[data-act=\"rules\"]') !== null", "the tag button");

  await page.click('[data-act="rules"]');
  const tagOptions = await page.dialogOptions("kind:second-hand");
  check("Nib's own tags are offered as the answers, read from its catalog", () => {
    if (!tagOptions.some((o) => /Second-hand/.test(o.label))) {
      throw new Error(`offered: ${JSON.stringify(tagOptions.map((o) => o.label))}`);
    }
  });

  await page.fillDialog({ "kind:second-hand": "tag-second-hand", "kind:one-to-one": "" });
  await page.waitFor("document.body.textContent.includes('tag rule')", "the saved rule");
  check("the mapping can also be reopened and changed from the binding's row", () => {});

  /* ------------------------------------------------------------ model -- */

  step("Drafting");

  // Nothing here presses a model button. A real call costs money and seconds
  // and would make the suite depend on being signed in - so what is checked is
  // everything around it: that the app can tell whether drafting is possible,
  // that it says so either way, and that the buttons follow that answer rather
  // than appearing and then failing.
  // A returned promise, not a top-level await: Runtime.evaluate compiles the
  // expression as an ordinary one and resolves whatever it yields, so `await`
  // written directly in it is a syntax error rather than a wait.
  const modelState = String(
    await page.evaluate("window.tend.invoke('modelStatus').then((s) => JSON.stringify(s))")
  );
  const model = JSON.parse(modelState);
  check("the app can tell whether a model is reachable at all", () => {
    if (typeof model.available !== "boolean") {
      throw new Error(`modelStatus answered: ${modelState}`);
    }
    if (!model.available && !model.why) {
      throw new Error("drafting is off and the app cannot say why, which reads as a broken build");
    }
  });

  await page.click('.nav-btn[data-view="settings"]');
  await page.waitFor("document.body.textContent.includes('Drafting')", "the drafting section");
  const draftingText = String(await page.evaluate("document.body.textContent"));
  check("settings says what a model may and may not do here", () => {
    /*
     * It used to say "the only thing a model may write is a theme, and only on
     * a scheduled pass", and both halves were untrue - there was no scheduled
     * pass and nothing ever wrote a theme. The sentence a user reads about the
     * model boundary is the one thing here that must not be aspirational, so
     * this now asks for the absolute version.
     */
    if (!/a model writes nothing here/i.test(draftingText)) {
      throw new Error("the boundary is not stated where somebody would look for it");
    }
    if (/may write is a theme/i.test(draftingText)) {
      throw new Error("the old, untrue version of the boundary is still on screen");
    }
  });

  await page.click('.nav-btn[data-view="prep"]');
  await page.waitFor("document.querySelector('.view-title') !== null", "Prep");
  const prepButtons = String(
    await page.evaluate(
      "JSON.stringify(Array.from(document.querySelectorAll('.prep-card [data-act]')).map((b) => b.dataset.act))"
    )
  );
  const draftingCards = String(await page.evaluate("document.body.textContent"));
  check("a card offers drafting, or says why it cannot", () => {
    if (model.available) {
      if (!prepButtons.includes("draftBrief")) {
        throw new Error(`no draft button on any card; found ${prepButtons}`);
      }
      return;
    }
    if (!/Drafting is off/.test(draftingCards)) {
      throw new Error("drafting is off and no card says so");
    }
  });

  check("the note behind a card is reachable, so it can be read for promises", () => {
    if (!model.available) {
      return;
    }
    if (!prepButtons.includes("readNote")) {
      throw new Error(`the bound note did not reach the card; buttons were ${prepButtons}`);
    }
  });

  /* -------------------------------------------------------- knowledge -- */

  step("Asking about a situation");

  await page.click('.nav-btn[data-view="knowledge"]');
  await page.waitFor("document.getElementById('situation') !== null", "the knowledge view");

  const opensEmpty = await page.evaluate("document.querySelectorAll('.row.static').length");
  check("it opens waiting rather than showing something", () => {
    if (Number(opensEmpty) !== 0) {
      throw new Error("the view listed notes before being asked anything");
    }
  });

  await page.evaluate(`(() => {
    const field = document.getElementById('situation');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(
      field, 'han lyssnar men säger aldrig emot'
    );
    field.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await page.click('[data-act="search"]');
  await sleep(400);

  const shortlist = String(await page.evaluate("document.body.textContent"));
  check("a situation finds the principle, not the note that shares a person", () => {
    if (!/Lyssna längre/.test(shortlist)) {
      throw new Error("the inflected form was not reached; the reading pass would never see it");
    }
    if (/Kritisera inte/.test(shortlist)) {
      throw new Error("it matched a principle that shares no wording with the situation");
    }
  });

  check("and it offers to read them properly rather than doing it unasked", () => {
    if (!/Read them properly|Reading is off/.test(shortlist)) {
      throw new Error("no way to go from the word match to an actual answer");
    }
  });

  /*
   * Reference material sits under the notes and stays under them. Every check
   * here is about rank and framing rather than about content: the answer itself
   * comes from a model and is not asserted, but where it sits on the page, what
   * the button claims it sends, and the fact that nothing ran unasked are all
   * the app's own doing and all load-bearing.
   */
  const generalOffer = await page.evaluate(`(() => {
    const buttons = [...document.querySelectorAll('[data-act="general"]')];
    return JSON.stringify({
      count: buttons.length,
      primary: buttons.some((b) => b.classList.contains('primary')),
      // Whitespace-collapsed first: textContent keeps the source's line breaks
      // and indentation, so a sentence wrapped across two lines in the template
      // does not match itself.
      told: /Only the sentence you typed is sent/.test(
        document.body.textContent.replace(/\\s+/g, ' ')
      ),
      ran: document.querySelectorAll('.draft.general').length
    });
  })()`);
  const offer = JSON.parse(String(generalOffer));

  check("it offers general knowledge as a second answer, below your own notes", () => {
    if (!model.available) {
      return;
    }
    if (offer.count !== 1) {
      throw new Error(`expected one general-knowledge offer, found ${offer.count}`);
    }
    if (offer.ran !== 0) {
      throw new Error("a general answer was produced without anybody pressing anything");
    }
  });

  check("it is not the brightest button on a page where the notes answered", () => {
    if (!model.available) {
      return;
    }
    // The ranking is the point. A page where the model's answer is the primary
    // action teaches the opposite of what this view is for.
    if (offer.primary) {
      throw new Error("the general-knowledge button was primary while notes had matched");
    }
  });

  check("and it says that only the typed sentence leaves the machine", () => {
    if (!model.available) {
      return;
    }
    if (!offer.told) {
      throw new Error("the button did not say what it sends, on a page where every other one opens notes");
    }
  });

  // The case the feature exists for: the notebook has nothing, so general
  // knowledge is the only thing left on the page that can help.
  await page.evaluate(`(() => {
    const field = document.getElementById('situation');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(
      field, 'kvartsvarv kring hydrauliken i en ubåtslucka'
    );
    field.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await page.click('[data-act="search"]');
  await sleep(400);

  const whenEmpty = await page.evaluate(`(() => {
    const button = document.querySelector('[data-act="general"]');
    return JSON.stringify({
      offered: button !== null,
      primary: button !== null && button.classList.contains('primary'),
      shortlist: document.querySelectorAll('.row.static').length
    });
  })()`);
  const empty = JSON.parse(String(whenEmpty));

  check("when nothing you wrote matches, the general answer becomes the primary offer", () => {
    if (!model.available) {
      return;
    }
    if (empty.shortlist !== 0) {
      throw new Error(`that situation was meant to match nothing, and matched ${empty.shortlist}`);
    }
    if (!empty.offered) {
      throw new Error("the empty state was a dead end - no offer to answer it at all");
    }
    if (!empty.primary) {
      throw new Error("the only thing left that can help was not the primary action");
    }
  });

  /* ---------------------------------------------------------- palette -- */

  step("Ctrl+K");

  // The one thing in the app that is meant to work from anywhere, so it is
  // opened from wherever the walkthrough happens to have left off rather than
  // from a known page.
  await page.evaluate(
    "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))"
  );
  await page.waitFor("document.querySelector('.palette-input') !== null", "the palette");
  check("Ctrl+K opens it from wherever you are", () => {});

  await page.evaluate(`(() => {
    const input = document.querySelector('.palette-input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(
      input, 'Testperson: kolla renderingen'
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await sleep(150);

  const topRow = await page.text(".palette-row");
  check("a name, a colon and the thing becomes a promise, top of the list", () => {
    if (!/Promise to Testperson Ström/.test(topRow)) {
      throw new Error(`the first row said: "${topRow}"`);
    }
    if (!/kolla renderingen/.test(topRow)) {
      throw new Error("the Swedish text did not survive the parse");
    }
  });

  await page.evaluate(`(() => {
    document.querySelector('.palette-input').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    );
  })()`);
  await page.waitFor("document.querySelector('.palette-input') === null", "the palette to close");
  await sleep(400);

  // Asked of the data rather than of the screen. A promise logged a second ago
  // is not late, and Now shows only what has drifted - so reading the page here
  // would test the Now view's filtering and call it a capture failure.
  const logged = String(
    await page.evaluate("window.tend.invoke('promises').then((p) => JSON.stringify(p))")
  );
  check("and it is logged without having gone anywhere to do it", () => {
    const promise = JSON.parse(logged).find((/** @type {any} */ p) => /kolla renderingen/.test(p.text));
    if (!promise) {
      throw new Error(`the promise never reached the log; found ${logged}`);
    }
    if (promise.to !== "Testperson Ström") {
      throw new Error(`it was logged against "${promise.to}"`);
    }
  });

  // A sentence that merely mentions somebody is a note about them, not a
  // commitment to them. Getting this wrong is invisible until the day it is
  // read back to the person.
  await page.evaluate(
    "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))"
  );
  await page.waitFor("document.querySelector('.palette-input') !== null", "the palette");
  await page.evaluate(`(() => {
    const input = document.querySelector('.palette-input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(
      input, 'Testperson said the build is slow'
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await sleep(150);

  const looseRow = await page.text(".palette-row");
  check("a sentence about somebody is not offered as a promise to them", () => {
    if (/^Promise to/.test(looseRow.trim())) {
      throw new Error(`the first row said: "${looseRow}"`);
    }
  });

  // Kept as a picture as well as a set of assertions. The DOM being right and
  // the overlay being legible are different questions, and only one of them a
  // selector can answer.
  await page.screenshot(join(root, "docs", "palette.png"));

  await page.evaluate(
    "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))"
  );
  await sleep(200);
  const gone = await page.evaluate("document.querySelector('.palette-input') === null");
  check("Escape closes it", () => {
    if (!gone) {
      throw new Error("the palette is still open");
    }
  });

  /* ---------------------------------------------------- window chrome -- */

  step("The title bar buttons");

  // Worth its own step even though it is three lines of product. These come
  // from keel rather than from Tend's own operation whitelist, which means the
  // preload has to resolve a bare specifier out of node_modules - and in the
  // packaged app, out of an asar archive. A resolution failure there is silent
  // from the outside: the buttons simply stop doing anything.
  const bridge = await page.evaluate(
    "JSON.stringify(['minimizeWindow','toggleMaximizeWindow','closeWindow'].filter((k) => typeof window.tend[k] !== 'function'))"
  );
  check("the window controls reached the renderer from keel", () => {
    const missing = JSON.parse(String(bridge));
    if (missing.length > 0) {
      throw new Error(`the preload did not expose: ${missing.join(", ")}`);
    }
  });

  // Maximise is the one of the three a renderer can observe, so it is the one
  // that proves the whole path: click, preload send, main handler, window. Then
  // click again to put the window back where it was.
  // Every width here is waited for rather than sampled, including the baseline:
  // a number read while the window manager is still moving the frame is not a
  // width, and this check exists to catch a click that never arrived, not to
  // race an animation.
  /*
   * The baseline, and it has to be a width the window could actually have.
   *
   * `settledWidth(() => true)` returns as soon as any value holds still for a
   * step, and during window setup a transient does hold still: one run measured
   * a baseline of 160px, maximised correctly to the screen's 3440, restored
   * correctly to 1180 - and failed, because it was comparing against the
   * transient. The message then said the restore "never came back", which is a
   * true statement about a number that was never real.
   *
   * The floor is the window's own `minWidth` from main/index.js rather than a
   * number invented here. No width below it is a width this app can have, so
   * anything below it is something else being measured.
   */
  const MIN_WINDOW_WIDTH = 720;
  const start = await page.settledWidth((width) => width >= MIN_WINDOW_WIDTH);
  const before = start.width;
  await page.click('[data-window="maximize"]');
  const maximised = await page.settledWidth((width) => width > before);
  await page.click('[data-window="maximize"]');
  const restored = await page.settledWidth((width) => width === before);

  const RESIZES = "clicking maximise actually resizes the window, and again restores it";

  /*
   * When the window is not being drawn, this check is not weak - it is blind,
   * and it now says so instead of failing.
   *
   * It used to fail intermittently: six runs in a day, two failed and both went
   * green on an immediate re-run with nothing changed in between. The message
   * blamed the preload bridge, and it was wrong. Measured directly, with the
   * main process asked for the truth alongside the renderer: with the window
   * covered by another window, `BrowserWindow.getBounds().width` went 1180 ->
   * 3456 and `isMaximized()` went true, while the renderer's `window.outerWidth`
   * stayed at 1180 - and stayed there, unmoving, for as long as the cover was
   * up. Uncover the window and it snapped to the real number within a second.
   *
   * So the maximise happened. The renderer simply could not see it: `outerWidth`
   * is its copy of a size the browser process owns, and the browser process
   * stops pushing that down to a renderer it is not compositing. The stale value
   * is stable, not in flight, which is the part that matters here - a longer
   * wait, more holds, a wider settle window, all of it would have failed exactly
   * the same way, only slower. There was never an animation to out-wait.
   *
   * That rules out strengthening the wait, and it leaves the question of whether
   * the width could be had some other way. It cannot, in this harness: every
   * read here goes to the renderer, and every renderer-side answer comes down
   * the same frozen pipe - `innerWidth`, `Page.getLayoutMetrics` and
   * `getBoundingClientRect` all agreed with the stale `outerWidth` while the
   * window was covered. The one honest source is the main process, and Electron
   * does not implement the CDP browser domain that would expose it
   * (`Browser.getWindowForTarget` answers "wasn't found"), so reaching it would
   * mean adding an IPC channel to the product for the benefit of a test.
   *
   * Which makes this the same category as the screenshot helper above: a check
   * that depends on the machine presenting a window, on a harness that must not
   * steal focus from whoever is using that machine. So it degrades the same way.
   * Not measured, said out loud with the reason, and not counted as a pass.
   *
   * What it does NOT do is soften when the window IS being drawn. `observable`
   * is proven per read rather than guessed after the fact, so a window that is
   * on screen and does not resize still fails, as loudly as before.
   */
  const blind = [start, maximised, restored].find((seen) => !seen.observable);

  if (blind !== undefined) {
    const seen =
      blind.trace.length > 0
        ? `The last widths it did read were ${blind.trace.join(" -> ")}, and they are the ` +
          `renderer's last copy rather than the window's size.`
        : `It was blind before it read a single width.`;
    skip(
      RESIZES,
      `the window stopped being drawn (document.visibilityState is "${blind.visibility}") - ` +
        `covered by another window, minimised, or a locked session. window.outerWidth is the ` +
        `renderer's copy of a size the browser process owns, and it freezes while that is true, ` +
        `so the maximise cannot be observed from here however long this waits. ${seen}`
    );
  } else {
    check(RESIZES, () => {
      if (!start.settled) {
        throw new Error(
          `the window never held a plausible width before the click: ${start.trace.join(" -> ")}` +
            `. Anything under ${MIN_WINDOW_WIDTH} is not a width this window can have.`
        );
      }
      if (!maximised.settled) {
        if (maximised.trace.length === 1) {
          throw new Error(
            `width held at ${maximised.width} for ${maximised.waited}ms while the window was ` +
              `being drawn; the click did not reach the main process`
          );
        }
        throw new Error(
          `width went ${maximised.trace.join(" -> ")} in ${maximised.waited}ms and never held above ${before}`
        );
      }
      if (!restored.settled) {
        throw new Error(
          `width went ${restored.trace.join(" -> ")} in ${restored.waited}ms and never came back to ${before}`
        );
      }
    });
  }

  // Printed because this check is entirely about timing. If the window manager
  // starts taking longer than the settle window, the log says so on a run that
  // still passes, rather than the check turning flaky with nobody able to see
  // how close it had been getting. Suppressed when the run was blind, where the
  // numbers are the renderer's last guess and printing them as widths is the
  // very thing that sent the last reader after the preload bridge.
  if (blind === undefined) {
    console.log(
      `  --   widths: ${before} -> ${maximised.width} in ${maximised.waited}ms -> ${restored.width} in ${restored.waited}ms`
    );
  }

  /* --------------------------------------------------------- scrolling -- */

  step("Scrolling");

  await page.click('.nav-btn[data-view="people"]');
  await page.waitFor("document.querySelector('.view-title') !== null", "a long view");

  const scrolled = JSON.parse(
    String(
      await page.evaluate(`(() => {
        const box = document.querySelector('main');
        box.scrollTop = box.scrollHeight;
        const header = document.querySelector('.app-header').getBoundingClientRect();
        const rail = document.querySelector('.rail').getBoundingClientRect();
        return JSON.stringify({
          headerTop: Math.round(header.top),
          railTop: Math.round(rail.top),
          bodyOverflows: document.body.scrollHeight > document.body.clientHeight + 1,
          shellLoaded: getComputedStyle(document.body).display === 'flex'
        });
      })()`)
    )
  );

  // The mark is an <img>, and an <img> that cannot be found renders as nothing
  // at all - no console error, no exception, just a gap where the logo was.
  // In the packaged app it has to resolve out of the asar, which is precisely
  // where that goes wrong. naturalWidth is the only honest answer.
  const markWidth = Number(
    await page.evaluate("(document.querySelector('.brand-mark') || {}).naturalWidth || 0")
  );
  check("the wordmark's logo actually decoded", () => {
    if (!(markWidth > 0)) {
      throw new Error("the brand mark did not load; in a packaged build this means the asar path is wrong");
    }
  });

  check("keel's shell stylesheet actually loaded", () => {
    // A <link> into node_modules resolves in development and is the thing that
    // can fail silently in the packaged app, where it has to come out of the
    // asar. If this is false, nothing below means anything.
    if (scrolled.shellLoaded !== true) {
      throw new Error("body is not a flex column, so keel/shell.css did not load");
    }
  });

  check("the window never scrolls, so the header cannot leave", () => {
    // The open P0 this closes. In a frameless window that row is the drag
    // handle and the only close button.
    if (scrolled.bodyOverflows) {
      throw new Error("the document itself overflows, which is what took the header with it");
    }
    if (scrolled.headerTop !== 0) {
      throw new Error(`the header moved to ${scrolled.headerTop}px`);
    }
  });

  check("and the rail stays too, since only the right column scrolls", () => {
    if (scrolled.railTop < 0) {
      throw new Error(`the rail scrolled to ${scrolled.railTop}px; seven buttons need not leave`);
    }
  });

  /* ------------------------------------------------------- archiving -- */

  // Archiving is the answer to "this stopped being mine" - a job change, a
  // project ending, somebody leaving. The whole point is that it is NOT a
  // delete: the person drops out of every forward-looking view while every
  // 1-1, promise and decision about them stays readable. So each check here
  // is a round trip, not a one-way assertion - anything that leaves has to be
  // able to come back, because a one-way archive is a delete with a nicer name.
  //
  // This runs last on purpose. The bulk action at the end empties every active
  // list, so nothing after it would have data to walk through.

  step("Archiving what you have left behind");

  await page.click('.nav-btn[data-view="now"]');
  await page.waitFor("document.querySelector('.card') !== null", "the Now view");
  const nowBeforeArchive = await page.texts(".card-title");

  await page.click('.nav-btn[data-view="people"]');
  await page.waitFor("document.querySelector('.row-name') !== null", "the roster");
  const rosterBeforeArchive = await page.texts(".row-name");
  await page.click('[data-act="open"]');
  await page.waitFor('document.querySelector(\'[data-act="archive"]\') !== null', "the person page");

  await page.click('[data-act="archive"]');
  await page.waitFor("document.querySelector('.dialog') !== null", "the archive confirmation");
  const archiveIntro = await page.text(".dialog-intro");
  check("archiving asks first, and says the history survives it", () => {
    // Deliberately not asserting the exact wording - that is copy, and a test
    // that pins copy gets edited to match rather than read. What must be true
    // is that the dialog explains reversibility somewhere, because this is the
    // moment somebody decides whether they dare press it.
    if (archiveIntro.trim() === "") {
      throw new Error("the confirmation had no body text at all");
    }
    if (!/revers|back|stays|any time/i.test(archiveIntro)) {
      throw new Error(`nothing in the dialog says this can be undone: "${archiveIntro}"`);
    }
  });
  await page.fillDialog({});
  await sleep(400);

  const flipped = await page.evaluate(
    "document.querySelector('[data-act=\"unarchive\"]') !== null && document.querySelector('[data-act=\"archive\"]') === null"
  );
  check("the person's own page stays reachable, and now offers to undo it", () => {
    if (String(flipped) !== "true") {
      throw new Error("the page still offers Archive, so nothing changed or the page went away");
    }
  });

  const panelAfterArchive = await page.text(".panel-name");
  check("and it still shows whose page it is, rather than an empty shell", () => {
    if (panelAfterArchive.trim() === "") {
      throw new Error("the person page rendered without a name");
    }
  });

  await page.click('.nav-btn[data-view="now"]');
  await sleep(400);
  const nowAfterArchive = await page.texts(".card-title");
  check("an archived person stops being reported as work that is owed", () => {
    const named = (/** @type {string[]} */ list) => list.filter((c) => /Testperson/.test(c)).length;
    if (named(nowBeforeArchive) === 0) {
      throw new Error("nothing was reported before archiving, so this proves nothing");
    }
    if (named(nowAfterArchive) !== 0) {
      throw new Error(`still reported after archiving: ${JSON.stringify(nowAfterArchive)}`);
    }
  });

  await page.click('.nav-btn[data-view="people"]');
  await page.waitFor("document.querySelector('.group') !== null", "the roster");
  const archivedGroupCount = await page.evaluate(
    "String(document.querySelectorAll('.archived-group .row-name').length)"
  );
  check("they are findable again in an archived group, not simply gone", () => {
    if (Number(archivedGroupCount) < 1) {
      throw new Error("the roster has no archived group, so an archived person is unreachable");
    }
  });

  // The archived group is the newest heading in the app, and it lands at the
  // bottom of a roster rather than between two others - a spot with nothing
  // above it to inherit spacing from.
  checkGroupGaps(await groupGaps(page), "the roster with an archived group");

  await page.click('.archived-group [data-act="unarchive"]');
  await sleep(400);
  const rosterAfterUndo = await page.texts(".row-name");
  check("unarchiving puts them back on the roster", () => {
    if (rosterAfterUndo.length !== rosterBeforeArchive.length) {
      throw new Error(
        `roster went from ${rosterBeforeArchive.length} to ${rosterAfterUndo.length} names across the round trip`
      );
    }
  });

  /* -- the same round trip for the two things that are not people ------- */

  await page.click('.nav-btn[data-view="work"]');
  await page.waitFor('document.querySelector(\'[data-act="archiveProject"]\') !== null', "the Work view");
  const projectsBefore = await page.evaluate(
    "String(document.querySelectorAll('[data-act=\"archiveProject\"]').length)"
  );
  const streamsBefore = await page.evaluate(
    "String(document.querySelectorAll('[data-act=\"archiveStream\"]').length)"
  );

  await page.click('[data-act="archiveProject"]');
  await page.fillDialog({});
  await sleep(400);
  const projectsAfter = await page.evaluate(
    "String(document.querySelectorAll('[data-act=\"archiveProject\"]').length)"
  );
  const projectUndo = await page.evaluate(
    "String(document.querySelectorAll('.archived-group [data-act=\"unarchiveProject\"]').length)"
  );
  check("a project leaves the active list and turns up in an archived one", () => {
    if (Number(projectsBefore) === 0) {
      throw new Error("there were no projects to archive, so this proves nothing");
    }
    if (Number(projectsAfter) !== Number(projectsBefore) - 1) {
      throw new Error(`active projects went ${projectsBefore} -> ${projectsAfter}`);
    }
    if (Number(projectUndo) < 1) {
      throw new Error("no archived project row offers Unarchive");
    }
  });

  await page.click('.archived-group [data-act="unarchiveProject"]');
  await sleep(400);
  const projectsRestored = await page.evaluate(
    "String(document.querySelectorAll('[data-act=\"archiveProject\"]').length)"
  );
  check("and comes back when the work does", () => {
    if (Number(projectsRestored) !== Number(projectsBefore)) {
      throw new Error(`projects ended at ${projectsRestored}, started at ${projectsBefore}`);
    }
  });

  await page.click('[data-act="archiveStream"]');
  await page.fillDialog({});
  await sleep(400);
  const streamsAfter = await page.evaluate(
    "String(document.querySelectorAll('[data-act=\"archiveStream\"]').length)"
  );
  const streamUndo = await page.evaluate(
    "String(document.querySelectorAll('.archived-group [data-act=\"unarchiveStream\"]').length)"
  );
  check("a workstream does the same round trip", () => {
    if (Number(streamsBefore) === 0) {
      throw new Error("there were no workstreams to archive, so this proves nothing");
    }
    if (Number(streamsAfter) !== Number(streamsBefore) - 1) {
      throw new Error(`active workstreams went ${streamsBefore} -> ${streamsAfter}`);
    }
    if (Number(streamUndo) < 1) {
      throw new Error("no archived workstream row offers Unarchive");
    }
  });

  await page.click('.archived-group [data-act="unarchiveStream"]');
  await sleep(400);

  /* -- the bulk trigger, which is the one that sounds frightening ------- */

  // The per-item dialogs above are checked for shape only. This one is checked
  // for its actual words, because it is the button that reads like a delete-
  // everything and is the one place where being wrong about what it does is
  // expensive rather than annoying.

  await page.click('.nav-btn[data-view="settings"]');
  await page.waitFor('document.querySelector(\'[data-act="archiveEverything"]\') !== null', "Settings");
  await page.click('[data-act="archiveEverything"]');
  await page.waitFor("document.querySelector('.dialog') !== null", "the bulk confirmation");
  const bulkIntro = await page.text(".dialog-intro");
  check("the bulk action states, before you confirm, that nothing is deleted", () => {
    if (bulkIntro.trim() === "") {
      throw new Error("the bulk confirmation had no body text at all");
    }
    if (!/not deleted|nothing is deleted/i.test(bulkIntro)) {
      throw new Error(`it never says nothing is deleted: "${bulkIntro}"`);
    }
    if (!/brought back|individually|archived list/i.test(bulkIntro)) {
      throw new Error(`it never says the items can be brought back: "${bulkIntro}"`);
    }
  });
  await page.fillDialog({});
  await sleep(600);

  await page.click('.nav-btn[data-view="people"]');
  await sleep(400);
  const activeAfterBulk = await page.evaluate(
    "String(document.querySelectorAll('.group:not(.archived-group) .row-name').length)"
  );
  const archivedAfterBulk = await page.evaluate(
    "String(document.querySelectorAll('.archived-group .row-name').length)"
  );
  check("afterwards the roster holds nobody active, and everybody archived", () => {
    if (Number(activeAfterBulk) !== 0) {
      throw new Error(`${activeAfterBulk} people are still listed as active`);
    }
    if (Number(archivedAfterBulk) === 0) {
      throw new Error("nobody is in the archived group either, so the rows went somewhere else");
    }
  });

  await page.click('.nav-btn[data-view="work"]');
  await sleep(400);
  const workActiveAfterBulk = await page.evaluate(
    "String(document.querySelectorAll('[data-act=\"archiveProject\"]').length + document.querySelectorAll('[data-act=\"archiveStream\"]').length)"
  );
  check("and Work has nothing active left either", () => {
    if (Number(workActiveAfterBulk) !== 0) {
      throw new Error(`${workActiveAfterBulk} projects/workstreams are still active`);
    }
  });

  // Work stacks two archived groups where the active lists used to be, so every
  // heading here has a different kind of neighbour above it.
  checkGroupGaps(await groupGaps(page), "Work with everything archived");

  await page.click('.nav-btn[data-view="now"]');
  await sleep(400);
  const nowAfterBulk = await page.texts(".card-title");
  check("Now stops asking for anything, rather than reporting on archived people", () => {
    const named = (/** @type {string[]} */ list) => list.filter((c) => /Testperson/.test(c)).length;
    if (named(nowAfterBulk) !== 0) {
      throw new Error(`still asking about archived people: ${JSON.stringify(nowAfterBulk)}`);
    }
  });

  // Every subject is archived, so nothing can be behind on anything. A habit
  // reminder is allowed to be on the page but not to change its headline - it
  // used to, for as long as a week went unreflected on.
  const nowHeadline = await page.text(".view-title");
  const nowSub = await page.text(".view-sub");
  check("an archived roster reads as archived, not as an empty install", () => {
    if (/Nothing to watch yet/i.test(nowHeadline)) {
      throw new Error("the first-run instructions were shown to a store full of history");
    }
    if (!/Nothing needs you/i.test(nowHeadline)) {
      throw new Error(`expected the quiet page, saw "${nowHeadline}"`);
    }
    if (!/archived/i.test(nowSub) || !/nothing has been deleted|exactly where it was/i.test(nowSub)) {
      throw new Error(`the page does not say the record is intact: "${nowSub}"`);
    }
  });

  // The reason this mechanism exists at all: the record has to outlive the
  // relationship. If an archived person's page came back empty, archiving
  // would be a delete and the whole design would be a lie.
  await page.click('.nav-btn[data-view="people"]');
  await page.waitFor("document.querySelector('.archived-group') !== null", "the archived group");
  await page.click('.archived-group [data-act="open"]');
  await page.waitFor("document.querySelector('.panel-name') !== null", "an archived person's page");
  const archivedName = await page.text(".panel-name");
  const archivedBody = await page.evaluate(
    "String(document.querySelector('.panel')?.textContent ?? '')"
  );
  check("an archived person's page still resolves, with their history intact", () => {
    if (archivedName.trim() === "") {
      throw new Error("the page rendered without a name");
    }
    if (archivedBody.length < 200) {
      throw new Error(`the page came back nearly empty (${archivedBody.length} chars)`);
    }
  });
  check("and the history is the part that survived, not just the name", () => {
    if (!/promise|1-1|decision|contact|logged|thread/i.test(archivedBody)) {
      throw new Error("nothing on the page refers to anything that was recorded about them");
    }
  });

  /* ------------------------------------------------------- undo the bulk -- */

  await page.click('.nav-btn[data-view="settings"]');
  await page.waitFor('document.querySelector(\'[data-act="undoBulkArchive"]\') !== null', "the undo offer");
  const undoText = await page.evaluate(
    "String(document.querySelector('[data-act=\"undoBulkArchive\"]')?.closest('.card')?.textContent ?? '')"
  );
  check("the undo says what it will put back, and what it will leave alone", () => {
    if (!/still archived/i.test(undoText)) {
      throw new Error(`the offer does not say it only restores what is still archived: ${undoText.slice(0, 200)}`);
    }
    if (!/\d+\s+(person|people|project|projects|workstream|workstreams)/i.test(undoText)) {
      throw new Error(`the offer does not say how much it would restore: ${undoText.slice(0, 200)}`);
    }
  });

  await page.click('[data-act="undoBulkArchive"]');
  await page.waitFor("document.querySelector('.dialog') !== null", "the undo confirmation");
  await page.click(".dialog [data-confirm]");
  await sleep(700);

  await page.click('.nav-btn[data-view="people"]');
  await sleep(400);
  const rosterAfterUndo2 = await page.evaluate(
    "String(document.querySelectorAll('.group:not(.archived-group) .row-name').length)"
  );
  check("one press puts the whole roster back, rather than one row at a time", () => {
    if (Number(rosterAfterUndo2) < 1) {
      throw new Error("the undo restored nobody");
    }
  });

  await page.click('.nav-btn[data-view="settings"]');
  await sleep(400);
  const undoGone = await page.evaluate(
    "String(document.querySelector('[data-act=\"undoBulkArchive\"]') === null)"
  );
  check("and the offer is spent, rather than standing there restoring nothing", () => {
    if (undoGone !== "true") {
      throw new Error("the undo is still offered after it was used");
    }
  });

  /* ------------------------------------------------------------- exit -- */

  step("Finishing up");

  /*
   * One shot per view, rather than one shot of wherever the run happened to
   * end. A view nobody clicked is a view where a contrast or layout mistake
   * lives until it is noticed by accident, and these are cheap.
   *
   * It also widens the renderer-error check below at no cost: that check runs
   * after this loop, so it now covers every view instead of only the last one
   * the checks left us on.
   */
  const VIEWS = [
    "now",
    "prep",
    "focus",
    "people",
    "work",
    "journal",
    "reflection",
    "role",
    "decisions",
    "knowledge",
    "settings"
  ];

  for (const view of VIEWS) {
    await page.click(`.nav-btn[data-view="${view}"]`);
    await sleep(350);
    const name = view === "now" ? "now-view" : `view-${view}`;
    const shot = await page.screenshot(join(root, "docs", `${name}.png`));
    if (shot !== null) {
      console.log(`  --   ${view}: ${shot}`);
    }
  }

  const rendererErrors = await page.evaluate("JSON.stringify(window.__errors ?? ['__errors missing'])");
  check("no uncaught renderer errors anywhere in that", () => {
    const list = JSON.parse(String(rendererErrors));
    if (list.length > 0) {
      throw new Error(list.join("; "));
    }
  });
} catch (err) {
  failures += 1;
  console.error(`\nHarness failed: ${err instanceof Error ? err.message : String(err)}`);
  if (mainOutput.length) {
    console.error(`\nApp output:\n${mainOutput.join("").slice(0, 2000)}`);
  }
} finally {
  page?.close();
  if (!keep) {
    // Only this PID. Never by name.
    child.kill();
    await sleep(400);
    rmSync(scratch, { recursive: true, force: true });
    rmSync(nibScratch, { recursive: true, force: true });
    rmSync(jotScratch, { recursive: true, force: true });
  } else {
    // Say how to put it down, here, where somebody reads it. This is the
    // process that broke a later run: it keeps holding the debugging port, and
    // until this printed the next run had no idea it was there.
    console.log(`\nLeft running (pid ${child.pid}), data in ${scratch}`);
    console.log(`It is holding port ${PORT}. Stop that pid before the next run,`);
    console.log(`or run the next one with --port=${PORT + 1}.`);
  }
}

summarised = true;
// The count is the whole summary for most readers, and a run with a check
// missing from it looks identical to a run with nothing missing. So the skips
// are named on the same breath as the passes rather than left in the scrollback.
const blindNote =
  unmeasured === 0
    ? ""
    : ` ${unmeasured} check(s) could not be measured on this machine - see "not measured" above.`;
console.log(
  (failures === 0
    ? `\nAll ${checks} app checks passed.`
    : `\n${failures} of ${checks} check(s) failed.`) + blindNote
);
process.exit(failures === 0 ? 0 : 1);
