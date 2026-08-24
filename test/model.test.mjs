/**
 * Tests for the model layer.
 *
 * No model is called. Every test injects a stand-in for `ask`, because what is
 * worth testing here is not what a model says - it is everything around it: the
 * refusals that happen before a call, the filtering that happens after one, and
 * the two rules that the rest of the app depends on being true.
 *
 * Those two rules get a test each and neither is about output quality:
 *
 *   Nothing model-shaped runs when the window opens. It is stated in a comment
 *   in three files, which is exactly the kind of rule that survives until
 *   somebody warms a cache on startup and nobody notices the window now costs
 *   four seconds and a few cents to open.
 *
 *   A model may write themes and nothing else. Structure - the role map,
 *   cadences, relationships, focus - is the user's, and a model that can edit
 *   it turns the app from a mirror into an opinion.
 */

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, it } from "node:test";

import { TIERS, detectThemes, draftBrief, extractPromises, sourceLabel } from "../src/service/model.js";
import { htmlToText, noteBody } from "../src/service/nib.js";
import { openStore } from "../src/storage/store.js";
import { DAY_MS } from "../src/domain/time.js";
import { failed, ok } from "./helpers.mjs";

const NOW = 1_800_000_000_000;
/** @param {number} n */
const daysAgo = (n) => NOW - n * DAY_MS;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** @type {string} */
let dir;
/** @type {string} */
let nibDir;
/** @type {import("../src/storage/store.js").TendStore} */
let store;

/**
 * A stand-in for keel's `ask`, recording what it was asked and answering with
 * whatever the test wants back.
 *
 * @param {any} value What the model "returns".
 * @param {{ ok?: boolean, reason?: string }} [outcome]
 */
function fakeAsk(value, outcome = {}) {
  /** @type {any[]} */
  const calls = [];
  /** @type {any} */
  const impl = async (/** @type {any} */ options) => {
    calls.push(options);
    if (outcome.ok === false) {
      return { ok: false, reason: outcome.reason ?? "no" };
    }
    return { ok: true, value, model: "test-model", costUsd: 0.002 };
  };
  impl.calls = calls;
  return impl;
}

/**
 * Write a Nib note the way Nib does: metadata in index.json, body in its own
 * file. Both halves, because reading only one of them is the bug this catches.
 *
 * @param {{ id: string, categoryId: string, title: string, html: string, edited?: number }} note
 */
function writeNote(note) {
  const indexPath = join(nibDir, "index.json");
  /** @type {any} */
  let index = { categories: [] };
  try {
    index = JSON.parse(readFileSync(indexPath, "utf8"));
  } catch {
    index = { categories: [] };
  }
  let category = index.categories.find((/** @type {any} */ c) => c.id === note.categoryId);
  if (!category) {
    category = { id: note.categoryId, name: "Nina", subs: [], notes: [] };
    index.categories.push(category);
  }
  category.notes.push({
    id: note.id,
    categoryId: note.categoryId,
    subId: null,
    title: note.title,
    created: note.edited ?? NOW,
    edited: note.edited ?? NOW,
    alerts: []
  });
  writeFileSync(indexPath, JSON.stringify(index), "utf8");
  writeFileSync(
    join(nibDir, "notes", `${note.id}.json`),
    JSON.stringify({ id: note.id, title: note.title, html: note.html }),
    "utf8"
  );
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tend-model-"));
  nibDir = mkdtempSync(join(tmpdir(), "tend-model-nib-"));
  mkdirSync(join(nibDir, "notes"), { recursive: true });

  let t = NOW - 1_000_000;
  store = openStore({ dataDir: dir, role: "app", host: "test", now: () => t++ });

  store.create("duties", {
    id: "d-1to1",
    name: "1-1",
    subjectKind: "person",
    cadenceDays: 14,
    evidenceKinds: ["one-to-one"],
    relations: ["lead-and-manage"],
    status: "active"
  });
  store.create("people", { id: "p-nina", name: "Nina Berg", relation: "lead-and-manage", since: daysAgo(200) });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(nibDir, { recursive: true, force: true });
});

describe("the rules the rest of the app relies on", () => {
  it("never runs a model call when the window opens", () => {
    const main = readFileSync(join(root, "src", "main", "index.js"), "utf8");
    const startup = main.slice(main.indexOf("app.whenReady()"));

    assert.ok(startup.length > 0, "app.whenReady() should exist in the main process");
    assert.equal(
      /\bmodel\.\w+\(/.test(startup),
      false,
      "a model call on the startup path makes opening the window cost money and seconds"
    );
  });

  it("writes themes and nothing else", async () => {
    writeNote({ id: "n1", categoryId: "c1", title: "1-1", html: "<p>talked about the build times again</p>" });
    writeNote({ id: "n2", categoryId: "c1", title: "1-1", html: "<p>build times came up once more</p>", edited: NOW - DAY_MS });
    store.create("sources", { id: "s1", person: "p-nina", categoryId: "c1", subId: null, kind: "one-to-one" });

    const before = snapshot(store);
    ok(
      await detectThemes(store, {
        person: "Nina",
        now: NOW,
        apply: true,
        nibDir,
        askImpl: fakeAsk({ themes: [{ name: "build times", evidence: "both notes", times: 2 }] })
      })
    );
    const after = snapshot(store);

    assert.equal(after.themes, before.themes + 1);
    for (const collection of ["people", "duties", "promises", "workstreams", "sources"]) {
      assert.equal(
        after[collection],
        before[collection],
        `a model pass changed ${collection}, which is the user's to decide`
      );
    }
    assert.equal(store.focus(), null, "a model pass must not touch the focus");
  });
});

describe("drafting a brief", () => {
  it("refuses before spending anything when there is nothing to brief on", async () => {
    // Nina was spoken to this morning and owes nothing, so no card exists.
    store.create("touches", { id: "t1", subject: "p-nina", kind: "one-to-one", at: NOW - 1000 });

    const impl = fakeAsk({});
    const message = failed(await draftBrief(store, { person: "Nina", now: NOW, askImpl: impl }));

    assert.match(message, /nothing here to brief/);
    assert.equal(impl.calls.length, 0, "the refusal must come before the call, not after it");
  });

  it("sends the prep card and nothing it had to go and fetch", async () => {
    const impl = fakeAsk({ opening: "catch up", raise: [], ask: [], watch: "" });
    ok(await draftBrief(store, { person: "Nina Berg", now: NOW, askImpl: impl }));

    assert.equal(impl.calls.length, 1);
    assert.match(impl.calls[0].prompt, /Nina Berg/);
    assert.equal(impl.calls[0].model, TIERS.write, "a brief is writing, so it goes to the writing tier");
  });

  it("passes a failure through as a reason rather than an empty brief", async () => {
    const message = failed(
      await draftBrief(store, {
        person: "Nina",
        now: NOW,
        askImpl: fakeAsk(null, { ok: false, reason: "Claude Code did not answer within 90 seconds." })
      })
    );
    assert.match(message, /did not answer/);
  });

  it("stores nothing, because the facts under a brief change daily", async () => {
    const before = snapshot(store);
    ok(
      await draftBrief(store, {
        person: "Nina",
        now: NOW,
        askImpl: fakeAsk({ opening: "catch up", raise: [], ask: [], watch: "" })
      })
    );
    assert.deepEqual(snapshot(store), before);
  });
});

describe("extracting promises from prose", () => {
  it("returns candidates and writes none of them", async () => {
    writeNote({ id: "n1", categoryId: "c1", title: "1-1", html: "<p>I said I would look at the render pass.</p>" });

    const before = snapshot(store);
    const result = ok(
      await extractPromises(store, {
        noteId: "n1",
        nibDir,
        askImpl: fakeAsk({ promises: [{ text: "look at the render pass", confidence: "clear" }] })
      })
    );

    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].confidence, "clear");
    assert.equal(snapshot(store).promises, before.promises, "a candidate is not a promise until somebody keeps it");
  });

  it("drops an empty suggestion rather than logging a blank promise", async () => {
    writeNote({ id: "n1", categoryId: "c1", title: "1-1", html: "<p>nothing much</p>" });

    const result = ok(
      await extractPromises(store, {
        noteId: "n1",
        nibDir,
        askImpl: fakeAsk({ promises: [{ text: "   ", confidence: "clear" }, { text: "ask Nina", confidence: "possible" }] })
      })
    );

    assert.deepEqual(
      result.candidates.map((/** @type {any} */ c) => c.text),
      ["ask Nina"]
    );
  });

  it("says so rather than asking about a note that does not exist", async () => {
    const impl = fakeAsk({ promises: [] });
    const message = failed(await extractPromises(store, { noteId: "missing", nibDir, askImpl: impl }));

    assert.match(message, /no note file/i);
    assert.equal(impl.calls.length, 0);
  });

  it("uses the cheap tier, because this is parsing rather than writing", async () => {
    writeNote({ id: "n1", categoryId: "c1", title: "1-1", html: "<p>I will check with Tom.</p>" });

    const impl = fakeAsk({ promises: [] });
    ok(await extractPromises(store, { noteId: "n1", nibDir, askImpl: impl }));

    assert.equal(impl.calls[0].model, TIERS.extract);
    assert.equal(impl.calls[0].effort, "low");
  });
});

describe("themes", () => {
  it("refuses on one note, where a pattern cannot exist", async () => {
    writeNote({ id: "n1", categoryId: "c1", title: "1-1", html: "<p>build times</p>" });
    store.create("sources", { id: "s1", person: "p-nina", categoryId: "c1", subId: null, kind: "one-to-one" });

    const impl = fakeAsk({ themes: [] });
    const message = failed(await detectThemes(store, { person: "Nina", now: NOW, nibDir, askImpl: impl }));

    assert.match(message, /at least two/);
    assert.equal(impl.calls.length, 0, "the refusal is arithmetic, so it costs nothing");
  });

  it("throws away a theme the model saw only once", async () => {
    writeNote({ id: "n1", categoryId: "c1", title: "1-1", html: "<p>build times</p>" });
    writeNote({ id: "n2", categoryId: "c1", title: "1-1", html: "<p>build times again</p>", edited: NOW - DAY_MS });
    store.create("sources", { id: "s1", person: "p-nina", categoryId: "c1", subId: null, kind: "one-to-one" });

    const result = ok(
      await detectThemes(store, {
        person: "Nina",
        now: NOW,
        nibDir,
        askImpl: fakeAsk({
          themes: [
            { name: "build times", evidence: "both", times: 2 },
            { name: "a mood on one day", evidence: "note 1", times: 1 }
          ]
        })
      })
    );

    assert.deepEqual(
      result.themes.map((/** @type {any} */ t) => t.name),
      ["build times"]
    );
  });

  it("says which folder to bind rather than silently finding nothing", async () => {
    // Nib is there and has notes; what is missing is the binding that says
    // whose they are. Those two are different problems and the message has to
    // say which one, because "no themes" looks the same from the outside.
    writeNote({ id: "n1", categoryId: "c1", title: "1-1", html: "<p>build times</p>" });

    const message = failed(await detectThemes(store, { person: "Nina", now: NOW, nibDir, askImpl: fakeAsk({}) }));
    assert.match(message, /No Nib folder is bound/);
  });

  it("updates the same row on a second pass instead of stacking copies", async () => {
    writeNote({ id: "n1", categoryId: "c1", title: "1-1", html: "<p>build times</p>" });
    writeNote({ id: "n2", categoryId: "c1", title: "1-1", html: "<p>build times again</p>", edited: NOW - DAY_MS });
    store.create("sources", { id: "s1", person: "p-nina", categoryId: "c1", subId: null, kind: "one-to-one" });

    const run = (/** @type {number} */ times) =>
      detectThemes(store, {
        person: "Nina",
        now: NOW,
        apply: true,
        nibDir,
        askImpl: fakeAsk({ themes: [{ name: "Build times", evidence: "seen again", times }] })
      });

    ok(await run(2));
    ok(await run(4));

    const themes = store.rows("themes");
    assert.equal(themes.length, 1, "a weekly pass must not leave a new copy every Monday");
    assert.equal(themes[0].times, 4, "and it must carry the newer count");
    assert.match(String(themes[0].source), /^model:/);
  });
});

describe("labelling", () => {
  it("records the origin, which is not the same as the writer", () => {
    assert.equal(sourceLabel("claude-haiku-4-5"), "model:claude-haiku-4-5");
  });
});

describe("reading a Nib note body", () => {
  it("keeps the line breaks that carry meaning", () => {
    const text = htmlToText("<ul><li>one</li><li>two</li></ul><p>after</p>");
    assert.equal(text, "- one\n- two\nafter");
  });

  it("unescapes an ampersand without turning it into another entity", () => {
    // &amp;lt; in the source is a literal "&lt;", not a less-than sign. Doing
    // the ampersand first would produce one.
    assert.equal(htmlToText("<p>&amp;lt; and R&amp;D</p>"), "&lt; and R&D");
  });

  it("keeps Swedish letters exactly as written", () => {
    writeNote({ id: "n1", categoryId: "c1", title: "1-1", html: "<p>segare än tidigare, så här</p>" });
    const body = noteBody("n1", nibDir);
    assert.equal(body.available, true);
    assert.equal(body.available && body.text, "segare än tidigare, så här");
  });
});

/**
 * How many live rows each collection holds, so a test can assert that a pass
 * changed exactly one of them.
 *
 * @param {import("../src/storage/store.js").TendStore} s
 * @returns {Record<string, number>}
 */
function snapshot(s) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const name of ["people", "promises", "projects", "duties", "touches", "evidence", "themes", "workstreams", "signals", "sources", "decisions"]) {
    counts[name] = s.rows(name).length;
  }
  return counts;
}
