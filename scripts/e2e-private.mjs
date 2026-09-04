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

/*
 * The words, so these checks assert what the private half shows rather than
 * which language it shows it in. Same reason as the work walkthrough.
 */
import { T } from "../src/renderer/text.js";
/*
 * The private half's own vocabulary, from the definition rather than spelled
 * out here. These two checks are about which SET the dialog offers - the
 * private relationship kinds and not the management ones - and that question
 * does not change when the words do, as it just did in the translation.
 */
import { PRIVATE_RELATIONS } from "../src/domain/halves.js";

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
        // The BOX, not the attribute. This check read \`b.hidden\` and passed while
        // every work entry was on screen: the attribute was set and a stylesheet
        // rule with higher specificity kept them displayed. A check that asks the
        // element what it thinks rather than what it is is a check that cannot
        // fail - the fifth of those found in this project.
        visible: [...document.querySelectorAll('.nav-btn')]
          .filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
          .map(b => b.dataset.view),
        inDocument: [...document.querySelectorAll('.nav-btn')].map(b => b.dataset.view)
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
    if (String(state.badge).trim() !== T.shell.privateBadge) {
      throw new Error(`the badge beside the wordmark reads "${state.badge}"`);
    }
  });

  await check("the machinery that means nothing here is not on offer", () => {
    // Absent rather than dampened. A cadence over somebody you live with reads as
    // permanently fine and means nothing, and "you have not spoken to them in
    // three days" about a person in the next room is worse than useless.
    // People is here on purpose. The first version of this half left it out, which
    // is how "Add someone" got reached through Ctrl+K instead - and answered with
    // six management relationships. A person needs somewhere to be named, and
    // somewhere to carry what was promised them.
    const gone = ["now", "prep", "focus", "work", "role", "decisions"];
    const stillThere = gone.filter((v) => state.visible.includes(v));
    if (stillThere.length > 0) {
      throw new Error(`still offered: ${stillThere.join(", ")}`);
    }
    for (const kept of ["people", "journal", "reflection", "knowledge", "settings"]) {
      if (!state.visible.includes(kept)) {
        throw new Error(`${kept} should still be there and is not`);
      }
    }
    // And gone from the document rather than merely invisible, because a button
    // that exists can be clicked, styled back, found by a selector, or left
    // holding a hover highlight that makes it look like the open view.
    const lingering = state.inDocument.filter((/** @type {string} */ v) => gone.includes(v));
    if (lingering.length > 0) {
      throw new Error(`still in the document: ${lingering.join(", ")}`);
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
    if (!drawn.includes(T.journal.title)) {
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
    if (!/din egen del/.test(sub)) {
      throw new Error(`the page does not state the rule: ${sub.slice(0, 180)}`);
    }
  });

  /* ------------------------------------------------------------ Ctrl+K -- */

  /*
   * The palette, which was the widest hole in the first version of this half.
   *
   * It is bound on the window precisely so it works from anywhere, and its list
   * of views was a constant - so it offered "Go to Now" and "Go to Prep" here,
   * and going there drew the work radar over private data. Opening it and
   * pressing Enter was enough.
   */
  await evaluate(
    "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))"
  );
  await waitFor("document.querySelector('.palette-input') !== null", "the palette");
  const offered = JSON.parse(
    String(
      await evaluate(
        `JSON.stringify([...document.querySelectorAll('[class*=palette] button, [class*=palette] li')]
          .map(e => e.textContent.trim()).filter(Boolean))`
      )
    )
  );
  await check("Ctrl+K offers only what this half has", () => {
    const text = offered.join(" | ");
    for (const gone of ["Go to Now", "Go to Prep", "Go to Focus", "Go to Work", "Go to Role map", "Go to Decisions"]) {
      if (text.includes(gone)) {
        throw new Error(`the palette still offers "${gone}"`);
      }
    }
    if (!text.includes(T.palette.goTo(T.journal.title))) {
      throw new Error(`the palette offers nothing from this half: ${text.slice(0, 200)}`);
    }
  });
  await evaluate(
    "document.querySelector('.palette-input')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))"
  );

  /* ------------------------------------------------------- adding somebody -- */

  await evaluate("document.querySelector('.nav-btn[data-view=\"people\"]')?.click()");
  await waitFor("document.querySelector('.view-title') !== null", "the people view");
  await evaluate("document.querySelector('[data-act=\"addPerson\"]')?.click()");
  await waitFor("document.querySelector('.dialog') !== null", "the add dialog");

  const dialog = JSON.parse(
    String(
      await evaluate(`(() => {
        const d = document.querySelector('.dialog');
        const sel = d.querySelector('select');
        return JSON.stringify({
          intro: d.querySelector('.dialog-intro')?.textContent ?? '',
          fields: [...d.querySelectorAll('select, input')].map(e => e.name || e.type),
          options: sel ? [...sel.options].map(o => o.textContent.trim()) : []
        });
      })()`)
    )
  );
  await check("it asks who somebody is, not which management relationship they are", () => {
    // The report that started this: six management relationships offered for
    // somebody's family, because the option list was a constant in the renderer.
    const text = dialog.options.join(" | ");
    for (const gone of ["Lead and manage", "Manage, don't see", "Stakeholder", "Your manager"]) {
      if (text.includes(gone)) {
        throw new Error(`still offered: "${gone}"`);
      }
    }
    if (!text.includes(PRIVATE_RELATIONS.partner.label) || !text.includes(PRIVATE_RELATIONS["close-friend"].label)) {
      throw new Error(`the private vocabulary is missing: ${text.slice(0, 200)}`);
    }
  });
  await check("and does not ask when the relationship started, which nothing here measures", () => {
    // The date exists to give a cadence something to measure from. With no
    // cadences it is a question with no consequence, and asking it about a parent
    // is its own small absurdity.
    if (dialog.fields.includes("since")) {
      throw new Error(`the dialog still asks: ${JSON.stringify(dialog.fields)}`);
    }
  });

  await evaluate(`(() => {
    const d = document.querySelector('.dialog');
    const input = d.querySelector('input[name="name"]') || d.querySelector('input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Testnamn');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const sel = d.querySelector('select');
    sel.value = 'partner';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await evaluate("document.querySelector('.dialog [data-confirm]')?.click()");
  await waitFor("document.body.textContent.includes('Testnamn')", "the person on the roster");
  await evaluate("document.querySelector('[data-act=\"open\"]')?.click()");
  await waitFor("document.querySelector('.panel-name') !== null", "their page");

  const theirPage = JSON.parse(
    String(
      await evaluate(`(() => {
        const m = document.querySelector('#main');
        return JSON.stringify({
          buttons: [...m.querySelectorAll('.button-row .act')].map(b => b.textContent.trim()),
          blocks: [...m.querySelectorAll('.block-title')].map(b => b.textContent.trim()),
          role: m.querySelector('.panel-role')?.textContent?.trim() ?? ''
        });
      })()`)
    )
  );
  await check("their page carries what transfers and nothing that does not", () => {
    const shown = [...theirPage.buttons, ...theirPage.blocks].join(" | ");

    // A promise is owed the same way to somebody you live with.
    if (!shown.includes(T.people.logPromiseButton) || !shown.includes(T.people.promisesBlock)) {
      throw new Error(`promises are missing: ${shown}`);
    }
    // A growth thread is a direction you decided somebody should develop in, with
    // a marker you watch for. An observation records their state, which the
    // private journal's one rule forbids. Cadences and cancellations feed drift,
    // and there is none here.
    for (const gone of ["Cadences", "Log contact", "It did not happen", "Record an observation", "Growing", "What keeps coming up"]) {
      if (shown.includes(gone)) {
        throw new Error(`"${gone}" is still on the page`);
      }
    }
    if (!theirPage.role.includes(PRIVATE_RELATIONS.partner.note)) {
      throw new Error(`the relationship note is not the private one: "${theirPage.role}"`);
    }
  });

  /* ------------------------------------------------------- the mark -- */

  const mark = JSON.parse(
    String(
      await evaluate(`(() => {
        const m = document.getElementById('brand-mark');
        if (m === null) { return JSON.stringify({ missing: true }); }
        return JSON.stringify({
          file: (m.currentSrc || m.src).split('/').pop(),
          loaded: m.complete && m.naturalWidth > 0
        });
      })()`)
    )
  );
  await check("the mark is this half's own, and it actually loaded", () => {
    // A fourth signal, and the one read fastest: a shape is recognised before a
    // word is. Asserting it LOADED matters as much as which file it points at -
    // the fallback to the work mark exists so a missing file degrades to "looks
    // like the work half" rather than to a broken image, and a broken image would
    // otherwise pass a check that only read the src.
    if (mark.missing) {
      throw new Error("there is no brand mark in the header at all");
    }
    if (mark.file !== "tend-logo-private.png") {
      throw new Error(`the header shows ${mark.file}`);
    }
    if (!mark.loaded) {
      throw new Error(`${mark.file} did not load`);
    }
  });

  /* ------------------------------------------- his own goals, here -- */

  /*
   * Reflection is new to this half, and it is here for the aims on it: the goals
   * he sets outside work - as a parent, about training - had nowhere in the app,
   * which is how a second file of them came to exist beside it.
   *
   * A view added to a half and never opened by a check is a view where the first
   * error is found by accident, so it gets opened here.
   */
  await evaluate("document.querySelector('.nav-btn[data-view=\"reflection\"]')?.click()");
  await waitFor("document.querySelector('.view-title') !== null", "reflection in the private half");

  const reflectionHere = JSON.parse(
    String(
      await evaluate(`(() => {
        const titles = [...document.querySelectorAll('.group-title')].map(t => t.textContent.trim());
        return JSON.stringify({
          title: (document.querySelector('.view-title') || {}).textContent || '',
          groups: titles,
          canSetAim: document.querySelector('[data-act="setAim"]') !== null,
          errors: (window.__errors ?? []).length
        });
      })()`)
    )
  );

  await check("his own goals have a page in this half, and it draws", () => {
    if (!String(reflectionHere.title).includes(T.reflection.title)) {
      throw new Error(`the view drew "${reflectionHere.title}"`);
    }
    if (reflectionHere.errors > 0) {
      throw new Error(`${reflectionHere.errors} renderer error(s) drawing it`);
    }
    // The aims block is the reason the view is in this half at all. A page that
    // renders but cannot start one would be the work half with a tab added.
    if (!reflectionHere.canSetAim) {
      throw new Error(`no way to set an aim; groups drawn: ${JSON.stringify(reflectionHere.groups)}`);
    }
  });

  /* ------------------------------------- the moment's person picker -- */

  await evaluate("document.querySelector('.nav-btn[data-view=\"journal\"]')?.click()");
  await waitFor("document.querySelector('.view-title') !== null", "the day");
  await evaluate("document.querySelector('[data-act=\"logMoment\"]')?.click()");
  await waitFor("document.querySelector('.dialog') !== null", "the moment dialog");

  const picker = JSON.parse(
    String(
      await evaluate(`(() => {
        const d = document.querySelector('.dialog');
        const multi = d.querySelector('[data-multi]');
        return JSON.stringify({
          exists: multi !== null,
          open: multi === null ? null : multi.open,
          summary: multi === null ? '' : multi.querySelector('[data-multi-summary]').textContent.trim(),
          loose: d.querySelectorAll('.field-check').length,
          fitsWithoutScrolling: d.scrollHeight <= d.clientHeight + 1
        });
      })()`)
    )
  );
  await check("the people are picked from one collapsed list, not a row each", () => {
    // A checkbox per person put seven rows in a dialog that also holds two text
    // boxes and a date, and the two fields that matter went off the bottom.
    if (!picker.exists) {
      throw new Error("there is no collapsed picker");
    }
    if (picker.open) {
      throw new Error("it starts open, which puts the whole list back on screen");
    }
    if (picker.loose > 0) {
      throw new Error(`${picker.loose} loose checkbox rows are still in the dialog`);
    }
    if (!picker.fitsWithoutScrolling) {
      throw new Error("the dialog still has to be scrolled to reach the bottom");
    }
    if (!picker.summary.includes(T.ui.noneChosen)) {
      throw new Error(`the closed summary reads "${picker.summary}"`);
    }
  });

  await evaluate(
    "document.querySelector('.dialog [data-cancel]')?.click()"
  );
  await waitFor("document.querySelector('.dialog') === null", "the dialog to close");

  /* --------------------------------- reading across the moments -- */

  /*
   * The private half's pattern-finding, and the floor on it.
   *
   * This half has no themes on purpose: the work half's themes name patterns in
   * observations ABOUT a person, and over a family that is a character profile of
   * your own child. So the reading that does belong here reads his own part - and
   * the thing worth checking in the window is that it refuses honestly on thin
   * material rather than running and lowering its voice. One moment is exactly
   * the thin case.
   */
  await evaluate("document.querySelector('[data-act=\"logMoment\"]')?.click()");
  await waitFor("document.querySelector('.dialog') !== null", "the moment dialog again");

  await evaluate(`(() => {
    const d = document.querySelector('.dialog');
    const part = d.querySelector('[name="part"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(part, 'Jag blev otalig och gick darifran');
    part.dispatchEvent(new Event('input', { bubbles: true }));
    const box = d.querySelector('[data-multi] input[type="checkbox"]');
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await evaluate("document.querySelector('.dialog [data-confirm]')?.click()");
  await waitFor(
    "document.body.textContent.includes('Jag blev otalig')",
    "the moment on the page"
  );

  const patterns = JSON.parse(
    String(
      await evaluate(`(() => {
        const button = document.querySelector('[data-act="readMoments"]');
        const card = button === null ? null : button.closest('.card');
        return JSON.stringify({
          offered: button !== null,
          disabled: button === null ? null : button.disabled,
          why: card === null ? '' : (card.querySelector('.card-why')?.textContent ?? '').replace(/\\s+/g, ' ').trim(),
          saysNothingKept: card === null ? '' : (card.querySelector('.src')?.textContent ?? '').trim()
        });
      })()`)
    )
  );

  await check("reading across the moments is offered as soon as there is one", () => {
    if (!patterns.offered) {
      throw new Error("the block is not on the page at all, so nothing was checked");
    }
  });

  await check("and refuses one moment up front rather than as an error afterwards", () => {
    // A refusal you could have seen coming should have been a disabled button
    // with the reason on it.
    if (patterns.disabled !== true) {
      throw new Error("the button is live on a single moment");
    }
    if (!/minst fyra/.test(patterns.why)) {
      throw new Error(`the reason does not say the floor: "${patterns.why}"`);
    }
    if (!/skilda dagar/.test(patterns.why)) {
      throw new Error(`the reason does not say the spread rule: "${patterns.why}"`);
    }
  });

  await check("and says outright that nothing is written or sent", () => {
    if (!patterns.saysNothingKept.includes(T.journal.patternsNote)) {
      throw new Error(`the card says "${patterns.saysNothingKept}"`);
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
