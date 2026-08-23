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
 * Two rules it follows, both learned the hard way:
 *
 *   It launches its OWN Electron instance and kills only that PID. Never kill
 *   by name - other Electron apps are often running and a broad kill closes
 *   whatever someone is working in.
 *
 *   It always points TEND_DATA_DIR at a scratch folder, so a test run can never
 *   write into real notes about real colleagues.
 *
 *   node scripts/e2e-app.mjs [--keep] [--packaged]
 *
 * `--packaged` runs against dist/win-unpacked/Tend.exe instead of the
 * development Electron. Worth its own mode: Tend ships its source unbuilt, so
 * the packaged app resolves the preload and the renderer from inside an asar
 * archive, and a path that works in development can fail there with nothing but
 * a blank window.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const PORT = 9411;
const keep = process.argv.includes("--keep");
const packaged = process.argv.includes("--packaged");
const scratch = mkdtempSync(join(tmpdir(), "tend-app-"));
const nibScratch = mkdtempSync(join(tmpdir(), "tend-app-nib-"));

let failures = 0;
let checks = 0;

/** @param {number} ms */
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

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

/** @param {string} label */
function step(label) {
  console.log(`\n  — ${label}`);
}

async function findPage() {
  for (let attempt = 0; attempt < 60; attempt++) {
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

  /** @param {string} method @param {object} [params] */
  const send = (method, params = {}) =>
    new Promise((done, fail) => {
      const id = nextId++;
      pending.set(id, { done, fail });
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
   * @param {Record<string, string | boolean>} values
   */
  const fillDialog = async (values) => {
    await waitFor("document.querySelector('.dialog') !== null", "a dialog");
    const script = `(() => {
      const values = ${JSON.stringify(values)};
      const dialog = document.querySelector('.dialog');
      for (const [name, value] of Object.entries(values)) {
        const el = dialog.querySelector('[name="' + name + '"]');
        if (!el) { return 'no field named ' + name; }
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

  const screenshot = async (/** @type {string} */ path) => {
    const shot = /** @type {any} */ (await send("Page.captureScreenshot", { format: "png" }));
    writeFileSync(path, Buffer.from(shot.data, "base64"));
    return path;
  };

  return {
    evaluate,
    waitFor,
    click,
    text,
    texts,
    fillDialog,
    dialogOptions,
    dismissDialog,
    screenshot,
    close: () => socket.close()
  };
}

/** A Nib index in the shape Nib itself writes, so the binding has something real. */
function writeNibFixture() {
  const day = 86_400_000;
  const now = Date.now();
  writeFileSync(
    join(nibScratch, "index.json"),
    JSON.stringify({
      version: 1,
      categories: [
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

const args = packaged ? [`--remote-debugging-port=${PORT}`] : [root, `--remote-debugging-port=${PORT}`];
console.log(packaged ? "Mode: packaged build" : "Mode: development");

const child = spawn(exe, args, {
  cwd: root,
  env: {
    ...process.env,
    TEND_DATA_DIR: scratch,
    NIB_DATA_DIR: nibScratch,
    ELECTRON_ENABLE_LOGGING: "0"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

/** @type {string[]} */
const mainOutput = [];
child.stdout?.on("data", (d) => mainOutput.push(String(d)));
child.stderr?.on("data", (d) => mainOutput.push(String(d)));

/** @type {Awaited<ReturnType<typeof connect>> | null} */
let page = null;

try {
  const target = await findPage();
  page = await connect(target.webSocketDebuggerUrl);
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
    if (proposedCount !== 5) {
      throw new Error(`expected 5 proposals, saw ${proposedCount}`);
    }
    if (activeCount !== 3) {
      throw new Error(`expected 3 active duties, saw ${activeCount}`);
    }
  });

  const questions = await page.evaluate(
    "document.querySelectorAll('.group .rows .row.static').length"
  );
  check("and three monthly questions, not six", () => {
    if (questions !== 3) {
      throw new Error(`expected 3 questions, saw ${questions}`);
    }
  });

  await page.click('.card.sev-proposed [data-act="accept"]');
  await page.waitFor(
    "document.querySelectorAll('.card.sev-proposed').length === 4",
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
  const personOption = (await page.dialogOptions("person"))[0];
  await page.fillDialog({
    folder: folder?.value ?? "",
    person: personOption?.value ?? "",
    kind: "one-to-one"
  });
  await page.waitFor("document.body.textContent.includes('one-to-one')", "the binding");
  check("a folder can be bound to a person without leaving the app", () => {});

  await page.click('[data-act="index"]');
  await page.waitFor("document.querySelector('.dialog') !== null", "the import result");
  const importResult = await page.text(".dialog-intro");
  check("importing brings in the note and the flagged action point", () => {
    if (!/1 contact record/.test(importResult) || !/1 promise/.test(importResult)) {
      throw new Error(`import said: "${importResult}"`);
    }
  });
  await page.dismissDialog();

  await page.click('.nav-btn[data-view="now"]');
  await page.waitFor("document.querySelector('.view-title') !== null", "Now");
  const afterImport = await page.evaluate("document.body.textContent");
  check("and the promise from Nib keeps its Swedish text", () => {
    if (!/Kolla med Nina om konferensen/.test(String(afterImport))) {
      throw new Error("the imported promise is missing or mangled");
    }
  });

  /* ------------------------------------------------------------- exit -- */

  step("Finishing up");

  const shot = await page.screenshot(join(root, "docs", "now-view.png"));
  console.log(`  --   screenshot: ${shot}`);

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
  } else {
    console.log(`\nLeft running (pid ${child.pid}), data in ${scratch}`);
  }
}

console.log(
  failures === 0 ? `\nAll ${checks} app checks passed.` : `\n${failures} of ${checks} check(s) failed.`
);
process.exit(failures === 0 ? 0 : 1);
