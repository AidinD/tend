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
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
const jotScratch = mkdtempSync(join(tmpdir(), "tend-app-jot-"));

let failures = 0;
let checks = 0;

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
   * It never throws. It returns what it saw, widths passed through included, so
   * the caller can fail with the whole trace rather than with one misleading
   * number.
   *
   * @param {(width: number) => boolean} wanted
   * @returns {Promise<{ width: number, settled: boolean, waited: number, trace: number[] }>}
   */
  const settledWidth = async (wanted) => {
    const started = Date.now();
    /** @type {number[]} */
    const trace = [];
    let last = NaN;
    let holds = 0;

    while (Date.now() - started < SETTLE_TIMEOUT) {
      const width = Number(await evaluate("window.outerWidth"));
      if (width === last) {
        holds += 1;
      } else {
        holds = 1;
        last = width;
        trace.push(width);
      }
      if (holds >= SETTLE_HOLDS && wanted(width)) {
        return { width, settled: true, waited: Date.now() - started, trace };
      }
      await sleep(SETTLE_STEP);
    }

    return { width: last, settled: false, waited: Date.now() - started, trace };
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
    settledWidth,
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
        { id: "tag-second-hand", name: "Second-hand", color: "#b98cff", description: "" }
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
              alerts: [],
              flag: "",
              tags: []
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

const args = packaged ? [`--remote-debugging-port=${PORT}`] : [root, `--remote-debugging-port=${PORT}`];
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

  await page.fillDialog({
    folder: folder?.value ?? "",
    person: personOption?.value ?? "",
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

  await page.click('.nav-btn[data-view="now"]');
  await page.waitFor("document.querySelector('.view-title') !== null", "Now");
  const afterImport = await page.evaluate("document.body.textContent");
  check("and the promise from Nib keeps its Swedish text", () => {
    if (!/Kolla med Nina om konferensen/.test(String(afterImport))) {
      throw new Error("the imported promise is missing or mangled");
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
    if (!/only thing a model may write is a theme/i.test(draftingText)) {
      throw new Error("the boundary is not stated where somebody would look for it");
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
  // Every width here is waited for rather than sampled, including the bassignee:
  // a number read while the window manager is still moving the frame is not a
  // width, and this check exists to catch a click that never arrived, not to
  // race an animation.
  const start = await page.settledWidth(() => true);
  const before = start.width;
  await page.click('[data-window="maximize"]');
  const maximised = await page.settledWidth((width) => width > before);
  await page.click('[data-window="maximize"]');
  const restored = await page.settledWidth((width) => width === before);

  check("clicking maximise actually resizes the window, and again restores it", () => {
    if (!start.settled) {
      throw new Error(`the window was still moving before the click: ${start.trace.join(" -> ")}`);
    }
    if (!maximised.settled) {
      if (maximised.trace.length === 1) {
        throw new Error(
          `width held at ${maximised.width} for ${maximised.waited}ms; the click did not reach the main process`
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

  // Printed because this check is entirely about timing. If the window manager
  // starts taking longer than the settle window, the log says so on a run that
  // still passes, rather than the check turning flaky with nobody able to see
  // how close it had been getting.
  console.log(
    `  --   widths: ${before} -> ${maximised.width} in ${maximised.waited}ms -> ${restored.width} in ${restored.waited}ms`
  );

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
    rmSync(jotScratch, { recursive: true, force: true });
  } else {
    console.log(`\nLeft running (pid ${child.pid}), data in ${scratch}`);
  }
}

console.log(
  failures === 0 ? `\nAll ${checks} app checks passed.` : `\n${failures} of ${checks} check(s) failed.`
);
process.exit(failures === 0 ? 0 : 1);
