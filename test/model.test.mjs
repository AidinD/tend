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
 *   A model writes NOTHING. Every pass returns a draft; a row exists only
 *   because somebody pressed something that kept it. Structure - the role map,
 *   cadences, relationships, focus - is the user's, and a model that can edit
 *   it turns the app from a mirror into an opinion.
 */

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, it } from "node:test";

import { GROUNDED, HOUSE_RULES, HOUSE_STYLE, TIERS, detectThemes, draftBrief, extractPromises } from "../src/service/model.js";
import { sourceLabel } from "../src/domain/provenance.js";
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

  it("gives every model pass the house rules, rather than each one restating them", () => {
    /*
     * A source-level check, deliberately, and the only kind that works here.
     *
     * There was already a test asserting the Swedish letters survive into the
     * prompt - written per pass, against one pass. So when a later pass typed
     * the rules out by hand instead of importing them, the copy decayed exactly
     * where nothing was looking: the sentence asking the model to keep the
     * diacritics had had its OWN diacritics stripped, reading "a, a and o with
     * their diacritics", and the same copy had silently lost the em dash rule
     * and the job title rule.
     *
     * One test per pass cannot catch that, because the pass that breaks it is
     * the one nobody wrote a test for. This checks the invariant instead: every
     * system prompt in the service layer ends in the shared constant. A pass
     * added next month is covered without anybody remembering to cover it.
     */
    const files = ["model.js", "knowledge.js", "reference.js"];
    /** @type {string[]} */
    const offenders = [];
    let inspected = 0;

    for (const file of files) {
      const source = readFileSync(join(root, "src", "service", file), "utf8");
      const declared = (source.match(/\bsystem:/g) ?? []).length;
      // Each `system:` value, up to the end of the options object - which closes
      // with `})` when the call is inline and `},` when it is the first argument
      // to `runPass`. Both shapes, because the pattern matching only one of them
      // is how this check stopped seeing a prompt the moment a pass was
      // refactored - which it did, and which the count assertion below caught.
      const found = [...source.matchAll(/\bsystem:\s*([\s\S]*?)\n\s*\}[),]/g)];

      // The check that keeps this test honest. A source-reading test whose
      // pattern stops matching does not fail - it inspects nothing and passes,
      // which is worse than not having it, because it reads as coverage.
      assert.equal(
        found.length,
        declared,
        `${file}: ${declared} system prompts in the file but the pattern matched ${found.length}`
      );

      inspected += found.length;
      for (const match of found) {
        // Either constant counts. HOUSE_RULES is style plus grounding; the one
        // pass that answers from general knowledge takes HOUSE_STYLE alone, and
        // that difference is deliberate - see GROUNDED in model.js.
        if (!/HOUSE_RULES|HOUSE_STYLE/.test(match[1])) {
          offenders.push(`${file}: a system prompt restates the rules instead of appending them`);
        }
      }
    }

    assert.ok(inspected >= 9, `only ${inspected} system prompts inspected; the passes cannot have gone away`);
    assert.deepEqual(offenders, [], offenders.join("; "));
  });

  it("spells out the Swedish letters in the rules themselves", () => {
    // The constant is the single copy now, so this is the single place the
    // letters have to actually be present as letters.
    for (const letter of ["å", "ä", "ö"]) {
      assert.ok(HOUSE_STYLE.includes(letter), `the house style does not contain ${letter} itself`);
    }
    assert.match(HOUSE_STYLE, /em dash/, "the rules no longer forbid the em dash");
    assert.match(HOUSE_STYLE, /job title/, "the rules no longer forbid writing out a job title");
  });

  it("keeps the grounding rule out of the style half, since one pass must not have it", () => {
    /*
     * The split is the point. Fold the grounding rule back into the style half
     * and the reference pass - which exists precisely to answer from general
     * knowledge when the notes did not - is told never to say anything that is
     * not in material it was never given. It then declines, politely, with
     * nothing logged.
     */
    assert.doesNotMatch(HOUSE_STYLE, /never invent a fact/i);
    assert.match(GROUNDED, /never invent a fact/i);
    assert.ok(HOUSE_RULES.includes(HOUSE_STYLE) && HOUSE_RULES.includes(GROUNDED));
  });

  it("writes nothing at all", async () => {
    /*
     * The rule used to be "themes, and nothing else, and only on a scheduled
     * pass", and this test asserted the themes half of it by passing `apply`.
     * There was no scheduled pass and no caller ever passed the flag, so the
     * one write the app permitted was a write nothing performed - while
     * Settings told the user a model might have made it.
     *
     * Removing it makes the rule absolute, and an absolute rule is the only one
     * this test can actually check: every collection, not a list somebody
     * remembered to extend.
     */
    writeNote({ id: "n1", categoryId: "c1", title: "1-1", html: "<p>talked about the build times again</p>" });
    writeNote({ id: "n2", categoryId: "c1", title: "1-1", html: "<p>build times came up once more</p>", edited: NOW - DAY_MS });
    store.create("sources", { id: "s1", person: "p-nina", categoryId: "c1", subId: null, kind: "one-to-one" });

    const before = snapshot(store);
    const found = ok(
      await detectThemes(store, {
        person: "Nina",
        now: NOW,
        nibDir,
        askImpl: fakeAsk({ themes: [{ name: "build times", evidence: "both notes", times: 2 }] })
      })
    );

    // The pass still has to have done its job, or this proves nothing: a call
    // that returned no themes would write nothing either.
    assert.equal(found.themes.length, 1, "the pass found nothing, so nothing was actually exercised");

    assert.deepEqual(snapshot(store), before, "a model pass wrote to the store");
    assert.equal(store.focus(), null, "a model pass must not touch the focus");
  });

  it("routes every model call through the one place that checks a model is there", () => {
    /*
     * The check nine passes each carried a copy of, and one of them silently
     * did not: the knowledge pass went straight to the call, so where the others
     * say "no Claude Code on this machine" it surfaced whatever the call failed
     * with. It was unreachable through the app - the view hides the button -
     * which is exactly why nobody noticed.
     *
     * Asserting the shape rather than the behaviour, because the behaviour needs
     * a machine WITHOUT Claude Code to observe, and the machine running this has
     * one. A call that does not go through `runPass` has no availability check
     * and no cost on its result, whether or not anything reaches it today.
     */
    const files = ["model.js", "knowledge.js", "reference.js"];
    const sources = new Map(
      files.map((file) => [file, readFileSync(join(root, "src", "service", file), "utf8")])
    );

    /*
     * Counted rather than located. The first version of this test tried to
     * decide whether each call sat inside `runPass` by looking at the text
     * before it, which passed for the wrong reason: every call later in the file
     * looked "after the declaration" and so looked fine. A count cannot be
     * fooled that way - there is exactly one call, and it is the one in the
     * helper.
     */
    for (const [file, source] of sources) {
      const calls = (source.match(/await askImpl\(/g) ?? []).length;
      const expected = file === "model.js" ? 1 : 0;
      assert.equal(
        calls,
        expected,
        `${file} makes ${calls} model calls directly; every pass should go through runPass`
      );
    }

    // And the passes really do use it, so this is not passing on empty files.
    const uses = ([...sources.values()].join("").match(/\brunPass\(/g) ?? []).length;
    assert.ok(uses >= 9, `only ${uses} runPass call sites found; the passes cannot have gone away`);
  });

  it("has no pass anywhere in the model layer that writes to the store", () => {
    /*
     * The invariant, rather than one pass checked by hand. Nine passes exist and
     * a tenth gets added without anybody remembering this file, so the check is
     * on the source: nothing under the model layer may call a store write.
     *
     * `noteReviewRun` is the single exception and it is not a model writing -
     * it records that a pass RAN, so the nudge to run it stops asking. It takes
     * no model output.
     */
    const source = readFileSync(join(root, "src", "service", "model.js"), "utf8");

    // Prove the file being inspected is the one with the passes in it. Without
    // this the check passes on an empty string, which is the failure mode of
    // every source-reading test: it stops looking and reports success.
    const passes = [...source.matchAll(/^export async function/gm)];
    assert.ok(passes.length >= 6, `only ${passes.length} passes found; this is not the model layer`);

    const writes = [...source.matchAll(/store\.(create|update|remove)\(/g)];

    assert.deepEqual(
      writes.map((m) => m[0]),
      [],
      "a model pass writes to the store; drafts are the user's to keep, not the model's"
    );
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

    assert.match(message, /ingen anteckningsfil/i);
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
        nibDir,
        askImpl: fakeAsk({ themes: [{ name: "Build times", evidence: "seen again", times }] })
      });

    const first = ok(await run(2));
    const second = ok(await run(4));

    // Running it twice used to be about the stored row not being duplicated.
    // With nothing stored, what matters is that a second reading simply reads
    // again - the newer count is what comes back, and neither run left anything
    // behind for the other to collide with.
    assert.equal(first.themes[0].times, 2);
    assert.equal(second.themes[0].times, 4);
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
