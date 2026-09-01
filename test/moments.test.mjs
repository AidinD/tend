/**
 * Tests for reading across the moments - the private half's pattern-finding.
 *
 * No model is called. What matters here is not what a model says about somebody's
 * evenings; it is the properties the design rests on, and each one lives in the
 * code around the call:
 *
 *   The subject is always the writer. The work half's themes name patterns in
 *   observations ABOUT a person, and over a family that is a character profile of
 *   your own child - which is why this half has no themes. The schema has nowhere
 *   to put a claim about anybody else, and the system prompt says so twice.
 *
 *   The floor is enforced, not hedged. Three moments logged in one nine-minute
 *   sitting are one data point, and a pass that ran on them anyway would name a
 *   pattern from a single afternoon that gets read as fact a month later. Spread
 *   in days is the honest denominator.
 *
 *   The floor is shared with the journal pass rather than restated, so the two
 *   cannot drift apart.
 *
 *   Nothing is written. Not even the "a pass ran" row the journal review keeps,
 *   because that row exists to silence a nudge and there is no nudge here.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { momentCoverage, momentLines, momentReadiness, momentsSince } from "../src/domain/moments.js";
import { MIN_ENTRIES, MIN_SPREAD } from "../src/domain/review.js";
import { readOwnPatterns } from "../src/service/model.js";
import { openStore } from "../src/storage/store.js";
import { DAY_MS } from "../src/domain/time.js";
import { failed, ok } from "./helpers.mjs";

const NOW = 1_800_000_000_000;
/** @param {number} n */
const daysAgo = (n) => NOW - n * DAY_MS;

/** A full, valid answer, for the tests that are about something else. */
const ANSWER = {
  recurs: [
    { what: "I go quiet when the evening runs late", days: 3, evidence: "jag blev tyst igen" },
    { what: "I take over instead of waiting", days: 2, evidence: "jag tog över" }
  ],
  wentWell: "You came back and said something about it afterwards, more than once.",
  questions: ["What is the quiet protecting?"],
  nothingToSay: ""
};

/**
 * A stand-in for keel's `ask`, recording what it was asked.
 *
 * @param {any} value
 * @param {{ ok?: boolean, reason?: string }} [outcome]
 */
function stub(value, outcome = {}) {
  /** @type {{ prompt: string, system: string, model: string, schema: any }[]} */
  const calls = [];
  /** @type {any} */
  const askImpl = async (/** @type {any} */ args) => {
    calls.push({ prompt: args.prompt, system: args.system, model: args.model, schema: args.schema });
    if (outcome.ok === false) {
      return { ok: false, reason: outcome.reason ?? "no" };
    }
    return { ok: true, value, model: "claude-sonnet-5", costUsd: 0.004 };
  };
  askImpl.calls = calls;
  return askImpl;
}

/** @type {string} */
let dir;
/** @type {import("../src/storage/store.js").TendStore} */
let store;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tend-mom-"));
  let t = NOW - 1_000_000;
  store = openStore({ dataDir: dir, role: "app", host: "test", half: "private", now: () => t++ });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Four moments across four separate days - enough to read. */
function enoughLogged() {
  for (const n of [1, 4, 9, 15]) {
    store.create("moments", {
      id: `m-${n}`,
      people: ["p1"],
      what: `something happened ${n}`,
      part: `jag blev kort, dag ${n}`,
      at: daysAgo(n)
    });
  }
}

describe("how much there is to read across", () => {
  it("counts separate days rather than rows, because one sitting is one data point", () => {
    // His real data, exactly: three logged inside nine minutes on one afternoon.
    const sameAfternoon = [
      { at: NOW - 5 * DAY_MS, part: "a" },
      { at: NOW - 5 * DAY_MS + 180_000, part: "b" },
      { at: NOW - 5 * DAY_MS + 540_000, part: "c" }
    ];
    const cover = momentCoverage(sameAfternoon, 30);
    assert.equal(cover.moments, 3);
    assert.equal(cover.spread, 1, "three rows on one day are one day");
  });

  it("drops a moment with no part in it, since the part is the half being read", () => {
    const rows = [
      { at: daysAgo(1), part: "jag stannade kvar" },
      { at: daysAgo(2), part: "   " },
      { at: daysAgo(3) }
    ];
    assert.equal(momentsSince(rows, NOW, 30).length, 1);
  });

  it("leaves out what falls outside the window", () => {
    const rows = [
      { at: daysAgo(2), part: "inside" },
      { at: daysAgo(40), part: "outside" }
    ];
    assert.deepEqual(momentsSince(rows, NOW, 30).map((m) => m.part), ["inside"]);
  });

  it("sorts newest first", () => {
    const rows = [
      { at: daysAgo(9), part: "older" },
      { at: daysAgo(1), part: "newer" }
    ];
    assert.deepEqual(momentsSince(rows, NOW, 30).map((m) => m.part), ["newer", "older"]);
  });
});

describe("the floor on reading across them", () => {
  it("refuses when nothing is logged, and says why", () => {
    const r = momentReadiness({ moments: 0, spread: 0, days: 30 });
    assert.equal(r.ready, false);
    assert.match(r.why, /nothing to read across/);
  });

  it("refuses too few, and says how many more", () => {
    const r = momentReadiness({ moments: 2, spread: 2, days: 30 });
    assert.equal(r.ready, false);
    assert.match(r.why, /at least 4/);
    assert.match(r.why, /2 more/);
  });

  it("refuses enough rows written on too few days", () => {
    // The case the row count alone would wave through, and the one his real data
    // is in: plenty written, all of it one afternoon.
    const r = momentReadiness({ moments: 6, spread: 1, days: 30 });
    assert.equal(r.ready, false);
    assert.match(r.why, /only 1 day/);
    assert.match(r.why, /one sitting/);
  });

  it("uses the journal pass's floors rather than its own numbers", () => {
    // Imported rather than restated. Two copies of a floor agree until one is
    // edited, and this project has been bitten by exactly that more than once.
    assert.match(
      momentReadiness({ moments: 1, spread: 1, days: 30 }).why,
      new RegExp(`at least ${MIN_ENTRIES}`)
    );
    assert.match(
      momentReadiness({ moments: MIN_ENTRIES, spread: 1, days: 30 }).why,
      new RegExp(`at least ${MIN_SPREAD}`)
    );
  });

  it("lets through enough across enough days", () => {
    assert.equal(momentReadiness({ moments: 4, spread: 3, days: 30 }).ready, true);
  });
});

describe("what one moment looks like to the pass", () => {
  it("sends his own words unedited, and the date", () => {
    const line = momentLines({ at: daysAgo(3), what: "brak vid laggning", part: "jag hojde rosten" });
    assert.match(line, /brak vid laggning/);
    assert.match(line, /jag hojde rosten/);
    assert.match(line, /\d{4}-\d{2}-\d{2}/);
  });

  it("leaves the line out entirely when what-happened was left blank", () => {
    const line = momentLines({ at: daysAgo(3), part: "jag hojde rosten" });
    assert.equal(/what happened/.test(line), false);
    assert.match(line, /my part/);
  });

  it("keeps the Swedish letters intact", () => {
    const line = momentLines({
      at: daysAgo(1),
      what: "sängdags",
      part: "jag blev otålig och gick därifrån"
    });
    assert.match(line, /sängdags/);
    assert.match(line, /otålig och gick därifrån/);
  });
});

describe("reading across the moments", () => {
  it("refuses before spending anything when there is too little", async () => {
    store.create("moments", { id: "m1", people: ["p1"], part: "jag blev kort", at: daysAgo(2) });
    const askImpl = stub(ANSWER);
    assert.match(failed(await readOwnPatterns(store, { now: NOW, askImpl })), /at least 4/);
    assert.equal(askImpl.calls.length, 0, "it paid for a call it had already decided to refuse");
  });

  it("refuses a sitting even when the row count is fine", async () => {
    for (const i of [0, 1, 2, 3]) {
      store.create("moments", {
        id: `s-${i}`,
        people: ["p1"],
        part: `rad ${i}`,
        at: daysAgo(5) + i * 60_000
      });
    }
    const askImpl = stub(ANSWER);
    assert.match(failed(await readOwnPatterns(store, { now: NOW, askImpl })), /one sitting/);
    assert.equal(askImpl.calls.length, 0);
  });

  it("sends every moment in the window, with his own words", async () => {
    enoughLogged();
    const askImpl = stub(ANSWER);
    ok(await readOwnPatterns(store, { now: NOW, askImpl }));

    const { prompt } = askImpl.calls[0];
    for (const n of [1, 4, 9, 15]) {
      assert.match(prompt, new RegExp(`jag blev kort, dag ${n}`), `moment ${n} was not sent`);
    }
    assert.match(prompt, /4 moments logged over 4 separate days/);
  });

  it("tells the model the subject is always the writer, and says it about others too", async () => {
    // The load-bearing constraint of the whole private half. Stated twice on
    // purpose: once as what to do, once as what not to - and the second half has
    // to survive an entry that itself describes somebody else, because his own
    // entries do.
    enoughLogged();
    const askImpl = stub(ANSWER);
    ok(await readOwnPatterns(store, { now: NOW, askImpl }));

    const { system } = askImpl.calls[0];
    assert.match(system, /THEIR\s+OWN conduct/);
    assert.match(system, /has them as its subject/);
    assert.match(system, /never say what anybody else/i);
    assert.match(system, /even where the entries\s+themselves say it/);
  });

  it("gives the schema nowhere to put a claim about anybody else", async () => {
    enoughLogged();
    const askImpl = stub(ANSWER);
    ok(await readOwnPatterns(store, { now: NOW, askImpl }));

    const { schema } = askImpl.calls[0];
    assert.deepEqual(Object.keys(schema.properties).sort(), [
      "nothingToSay",
      "questions",
      "recurs",
      "wentWell"
    ]);
    assert.equal(schema.additionalProperties, false, "an extra field could carry exactly that claim");
  });

  it("keeps the diacritic rule on the way out", async () => {
    enoughLogged();
    const askImpl = stub(ANSWER);
    ok(await readOwnPatterns(store, { now: NOW, askImpl }));
    assert.match(askImpl.calls[0].system, /å, ä and ö/);
  });

  it("uses the writing tier, because the cheap tier's failure here is fluency", async () => {
    enoughLogged();
    const askImpl = stub(ANSWER);
    ok(await readOwnPatterns(store, { now: NOW, askImpl }));
    assert.match(askImpl.calls[0].model, /sonnet/);
  });

  it("drops a pattern the model claims on one day only", async () => {
    // A floor stated in a prompt is a request. Applied to the answer it is a rule.
    enoughLogged();
    const askImpl = stub({
      recurs: [
        { what: "real", days: 2, evidence: "x" },
        { what: "one afternoon", days: 1, evidence: "y" }
      ],
      questions: []
    });
    const r = ok(await readOwnPatterns(store, { now: NOW, askImpl }));
    assert.deepEqual(r.recurs.map((/** @type {any} */ p) => p.what), ["real"]);
  });

  it("drops a pattern with nothing in it", async () => {
    enoughLogged();
    const askImpl = stub({ recurs: [{ what: "   ", days: 4, evidence: "x" }], questions: [] });
    assert.deepEqual(ok(await readOwnPatterns(store, { now: NOW, askImpl })).recurs, []);
  });

  it("carries nothing-to-say through rather than inventing a pattern", async () => {
    enoughLogged();
    const askImpl = stub({
      recurs: [],
      questions: [],
      nothingToSay: "Four evenings, no thread across them."
    });
    const r = ok(await readOwnPatterns(store, { now: NOW, askImpl }));
    assert.deepEqual(r.recurs, []);
    assert.match(r.nothingToSay, /no thread/);
  });

  it("reports the model and what it cost, so the answer can be read with the right scepticism", async () => {
    enoughLogged();
    const r = ok(await readOwnPatterns(store, { now: NOW, askImpl: stub(ANSWER) }));
    assert.equal(r.model, "claude-sonnet-5");
    assert.equal(r.costUsd, 0.004);
    assert.match(String(r.coverage.summary), /4 moments across 4 days/);
  });

  it("passes a failure through as data rather than throwing", async () => {
    enoughLogged();
    const askImpl = stub(ANSWER, { ok: false, reason: "the model could not be reached" });
    assert.match(failed(await readOwnPatterns(store, { now: NOW, askImpl })), /could not be reached/);
  });

  it("writes nothing at all, not even that it ran", async () => {
    /*
     * The journal review keeps a row saying a pass happened, because a nudge
     * depends on it. There is no nudge over this half by design - no cadence,
     * no streak, no reminder - so a row here would be a record kept for nobody.
     */
    enoughLogged();
    const before = store.rows("moments").length;
    const collections = ["reviews", "reviewRuns", "themes", "evidence"];
    const countsBefore = collections.map((c) => store.rows(c).length);

    ok(await readOwnPatterns(store, { now: NOW, askImpl: stub(ANSWER) }));

    assert.equal(store.rows("moments").length, before, "it edited the material it was reading");
    assert.deepEqual(collections.map((c) => store.rows(c).length), countsBefore);
  });
});
