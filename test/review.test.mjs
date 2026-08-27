/**
 * Tests for the pass that reads the journal.
 *
 * Two things are worth testing here and neither is the prose. The first is the
 * floor: a reading built on two evenings is one evening restated with
 * confidence, and it gets remembered next month as a fact - so the refusal has
 * to be a rule rather than a hint in a prompt. The second is that the counts the
 * reading is set against are the counts, because the whole reason they travel
 * with the prose is that a memory of a month is not checkable and they are.
 *
 * The model itself is stubbed. What it writes is not this app's behaviour; what
 * it is given, what is enforced on the way out, and what is stored are.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  MIN_ENTRIES,
  MIN_SPREAD,
  declared,
  ledger,
  ledgerLines,
  readiness
} from "../src/domain/review.js";
import { reviewJournal } from "../src/service/model.js";
import { journalMaterial, keepReview, logEntry, reviews } from "../src/service/api.js";
import { openStore } from "../src/storage/store.js";
import { DAY_MS } from "../src/domain/time.js";
import { failed, ok } from "./helpers.mjs";

const NOW = Date.parse("2026-08-27T20:00:00Z");

/** @type {string} */
let dir;
/** @type {import("../src/storage/store.js").TendStore} */
let store;

/** A stub that records what it was asked and answers with whatever is handed in. */
function stub(/** @type {any} */ value, { model = "claude-sonnet-5", costUsd = 0.04 } = {}) {
  /** @type {{ prompt: string, system: string, model: string }[]} */
  const calls = [];
  /** @type {any} */
  const askImpl = async (/** @type {any} */ args) => {
    calls.push({ prompt: args.prompt, system: args.system, model: args.model });
    return { ok: true, value, model, costUsd };
  };
  askImpl.calls = calls;
  return askImpl;
}

/** N entries on N separate days, all with content. */
function writeEntries(/** @type {number} */ count, first = 1) {
  for (let i = 0; i < count; i += 1) {
    ok(
      logEntry(store, {
        now: NOW,
        at: NOW - (first + i) * DAY_MS,
        took: `Day ${i} went into the migration`,
        avoided: i % 2 === 0 ? "The conversation about the roadmap" : ""
      })
    );
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tend-review-"));
  let t = NOW - 1_000_000;
  store = openStore({ dataDir: dir, role: "app", host: "test", now: () => t++ });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("the floor", () => {
  it("refuses an empty window and says so plainly", () => {
    const r = readiness({ entries: 0, spread: 0, days: 30 });
    assert.equal(r.ready, false);
    assert.match(r.why, /Nothing was written/);
  });

  it("refuses too few entries and says how many more would do it", () => {
    const r = readiness({ entries: MIN_ENTRIES - 1, spread: MIN_ENTRIES - 1, days: 30 });
    assert.equal(r.ready, false);
    // The refusal has to be actionable. "Not enough data" is a dead end; "one
    // more evening" is a thing somebody can do tonight.
    assert.match(r.why, /1 more evening/);
  });

  it("refuses entries that all landed in one sitting, however many there are", () => {
    // Four entries written in one evening about one week are one data point, and
    // a catch-up evening produces exactly that shape. Counting rows rather than
    // days would let it through.
    const r = readiness({ entries: 8, spread: MIN_SPREAD - 1, days: 30 });
    assert.equal(r.ready, false);
    assert.match(r.why, /one data point/);
  });

  it("allows a window that clears both", () => {
    assert.equal(readiness({ entries: MIN_ENTRIES, spread: MIN_SPREAD, days: 30 }).ready, true);
  });

  it("is enforced by the service, not only offered as advice", async () => {
    writeEntries(2);
    const askImpl = stub({ wentInto: [], avoidance: [], saidVsDid: "", questions: [], nothingToSay: "" });

    const result = failed(await reviewJournal(store, { now: NOW, askImpl }));

    assert.match(result, /at least 4/);
    // And no call was made. A refusal that still pays for a model call is a
    // refusal in name only.
    assert.equal(askImpl.calls.length, 0);
  });
});

describe("the counts the prose is set against", () => {
  it("counts only what happened inside the window", () => {
    store.create("people", { id: "p-a", name: "Someone", relation: "lead-and-manage" });
    store.create("touches", { id: "t-in", subject: "p-a", kind: "1-1", at: NOW - 5 * DAY_MS });
    store.create("touches", { id: "t-out", subject: "p-a", kind: "1-1", at: NOW - 90 * DAY_MS });

    const l = ledger({ touches: store.rows("touches") }, NOW, 30);

    assert.equal(l.conversations, 1);
  });

  it("does not count a row that was removed", () => {
    store.create("touches", { id: "t-1", subject: "p-a", kind: "1-1", at: NOW - DAY_MS });
    store.remove("touches", "t-1");

    assert.equal(ledger({ touches: store.rows("touches") }, NOW, 30).conversations, 0);
  });

  it("reads promises made in the window separately from promises open now", () => {
    store.create("promises", {
      id: "pr-old",
      person: "p-a",
      text: "Something from months ago",
      madeAt: NOW - 90 * DAY_MS,
      state: "open"
    });
    store.create("promises", {
      id: "pr-new",
      person: "p-a",
      text: "Something recent",
      madeAt: NOW - 3 * DAY_MS,
      state: "resolved"
    });

    const l = ledger({ promises: store.rows("promises") }, NOW, 30);

    assert.equal(l.promisesMade, 1);
    assert.equal(l.promisesKept, 1);
    // The old one is still owed today, which is the number that matters when
    // reading a month back - it is not scoped to the window on purpose.
    assert.equal(l.promisesStillOpen, 1);
  });

  it("counts talking about a growth thread separately from having seen anything", () => {
    // The gap between the two is the whole reading elsewhere in the app, so it
    // must survive into this one rather than collapsing into one number.
    store.create("growthNotes", { id: "g-1", growth: "gr-a", at: NOW - DAY_MS, observed: false });
    store.create("growthNotes", { id: "g-2", growth: "gr-a", at: NOW - 2 * DAY_MS, observed: true });

    const l = ledger({ growthNotes: store.rows("growthNotes") }, NOW, 30);

    assert.equal(l.growthNotes, 2);
    assert.equal(l.growthObserved, 1);
  });

  it("counts days journalled rather than entries, since one day can be edited twice", () => {
    writeEntries(3);
    const l = ledger({ entries: store.rows("entries") }, NOW, 30);
    assert.equal(l.journalled, 3);
  });

  it("states a zero rather than leaving it out", () => {
    const lines = ledgerLines(ledger({}, NOW, 30));
    assert.match(lines.join("\n"), /Decisions recorded: 0\./);
    // "No decisions in a month" is one of the more interesting things a month
    // can say, and a list of only what happened cannot say it.
    assert.match(lines.join("\n"), /Meetings that did not happen: 0\./);
  });
});

describe("what was declared for the window", () => {
  it("returns nothing when no focus was in force, rather than inventing an intention", () => {
    assert.equal(declared(null, NOW, 30), null);
    assert.equal(declared({ id: "f", name: "   " }, NOW, 30), null);
  });

  it("returns nothing for a focus that ended before the window started", () => {
    const focus = {
      id: "f",
      name: "Something old",
      startedAt: NOW - 200 * DAY_MS,
      endsAt: NOW - 100 * DAY_MS
    };
    assert.equal(declared(focus, NOW, 30), null);
  });

  it("says how much of the window the focus actually covered", () => {
    // A focus that ran for four of thirty days is a much weaker thing to hold
    // the month up against, and a reading that does not say so overstates it.
    const focus = {
      id: "f",
      name: "The migration",
      budget: 0.8,
      startedAt: NOW - 10 * DAY_MS,
      endsAt: NOW + 10 * DAY_MS
    };
    const d = declared(focus, NOW, 30, "Average drift has gone from 3.0 to 5.0 days.");

    assert.equal(d?.overlapDays, 10);
    assert.equal(d?.budgetOfWeek, 0.8);
    assert.match(String(d?.cost), /3\.0 to 5\.0/);
  });

  it("says outright when the cost was never measured", () => {
    const focus = { id: "f", name: "The migration", startedAt: NOW - 5 * DAY_MS, endsAt: NOW };
    assert.match(String(declared(focus, NOW, 30)?.cost), /not measured/);
  });
});

describe("the reading itself", () => {
  const answer = {
    wentInto: [
      { what: "The migration", evenings: 4, evidence: "went into the migration" },
      { what: "One meeting", evenings: 1, evidence: "a single Tuesday" }
    ],
    avoidance: [{ what: "The roadmap conversation", evenings: 3, evidence: "avoided it again" }],
    saidVsDid: "The declared focus and the entries agree.",
    questions: ["What makes the roadmap conversation the one you put off?", "  "],
    nothingToSay: ""
  };

  it("drops anything that only happened once, whatever the model claimed", async () => {
    writeEntries(6);
    const result = ok(await reviewJournal(store, { now: NOW, askImpl: stub(answer) }));

    // A floor stated in a prompt is a request; a floor applied to the result is
    // a rule. The single-evening item is not a pattern and does not survive.
    assert.deepEqual(
      result.wentInto.map((/** @type {any} */ w) => w.what),
      ["The migration"]
    );
  });

  it("drops empty questions rather than rendering a blank bullet", async () => {
    writeEntries(6);
    const result = ok(await reviewJournal(store, { now: NOW, askImpl: stub(answer) }));
    assert.equal(result.questions.length, 1);
  });

  it("gives the model the entries with their own labels", async () => {
    writeEntries(6);
    const askImpl = stub(answer);
    ok(await reviewJournal(store, { now: NOW, askImpl }));

    const prompt = askImpl.calls[0].prompt;
    // The boxes are not interchangeable - "what took the day" and "what I
    // avoided" are different claims - so flattening them into prose would throw
    // away the entire value of the avoidance field.
    assert.match(prompt, /What took the day:/);
    assert.match(prompt, /What I avoided:/);
  });

  it("gives the model the counts as well as the prose", async () => {
    writeEntries(6);
    store.create("touches", { id: "t-1", subject: "p-a", kind: "1-1", at: NOW - 2 * DAY_MS });
    const askImpl = stub(answer);
    ok(await reviewJournal(store, { now: NOW, askImpl }));

    assert.match(askImpl.calls[0].prompt, /Conversations recorded: 1\./);
    assert.match(askImpl.calls[0].system, /where the entries and the counts disagree/i);
  });

  it("tells the model to leave the comparison out when nothing was declared", async () => {
    writeEntries(6);
    const askImpl = stub(answer);
    ok(await reviewJournal(store, { now: NOW, askImpl }));

    assert.match(askImpl.calls[0].prompt, /No focus was in force/);
  });

  it("carries the coverage back with it, so the reading cannot be quoted without it", async () => {
    writeEntries(6);
    const result = ok(await reviewJournal(store, { now: NOW, askImpl: stub(answer) }));

    assert.equal(result.coverage.entries, 6);
    assert.equal(result.coverage.spread, 6);
  });

  it("writes nothing on its own", async () => {
    writeEntries(6);
    ok(await reviewJournal(store, { now: NOW, askImpl: stub(answer) }));

    // The rule the whole model layer follows: nothing a model produced enters
    // the store without somebody having read it first.
    assert.equal(store.rows("reviews").length, 0);
  });
});

describe("keeping a reading", () => {
  const kept = {
    at: NOW,
    days: 30,
    coverage: { entries: 6, spread: 6, days: 30, thin: true, summary: "6 entries across 6 days." },
    wentInto: [{ what: "The migration", evenings: 4, evidence: "x" }],
    avoidance: [{ what: "The roadmap conversation", evenings: 3, evidence: "y" }],
    saidVsDid: "",
    questions: ["What makes it the one you put off?"],
    ledger: { days: 30, conversations: 1 },
    declared: null,
    model: "claude-sonnet-5"
  };

  it("stores it with the coverage it was built on", () => {
    ok(keepReview(store, kept));

    const [row] = reviews(store);
    // Recomputing the coverage later would answer for a window that has since
    // moved, which is how a reading built on six evenings ends up looking like
    // one built on twenty-six.
    assert.equal(row.entries, 6);
    assert.equal(row.spread, 6);
    assert.equal(row.source, "model:claude-sonnet-5");
  });

  it("refuses something that is not a reading", () => {
    assert.match(failed(keepReview(store, {})), /not a review/);
  });

  it("refuses a reading that found nothing", () => {
    const empty = { ...kept, wentInto: [], avoidance: [], questions: [], saidVsDid: "" };
    assert.match(failed(keepReview(store, empty)), /nothing worth keeping/);
  });

  it("lists the readings newest first", () => {
    ok(keepReview(store, { ...kept, at: NOW - 60 * DAY_MS }));
    ok(keepReview(store, kept));

    const rows = reviews(store);
    assert.equal(rows.length, 2);
    assert.ok(rows[0].at > rows[1].at);
  });
});

describe("the material, without a model", () => {
  it("hands over the entries, the readiness and the counts in one call", () => {
    writeEntries(6);
    store.create("touches", { id: "t-1", subject: "p-a", kind: "1-1", at: NOW - DAY_MS });

    const material = journalMaterial(store, NOW);

    assert.equal(material.entries.length, 6);
    assert.equal(material.readiness.ready, true);
    assert.equal(material.recorded.conversations, 1);
    assert.match(material.recordedLines.join("\n"), /Conversations recorded: 1\./);
    // Nothing was declared, and the field says so rather than being absent -
    // absent reads as "not looked at".
    assert.equal(material.declared, null);
  });

  it("says outright when there is too little to read", () => {
    writeEntries(2);
    const material = journalMaterial(store, NOW);

    assert.equal(material.readiness.ready, false);
    assert.match(material.readiness.why, /at least 4/);
  });
});
