/**
 * Whether a decision was actually followed.
 *
 * The test the file exists for is "a broken decision still stands, and says it
 * was broken". A decision agreed and then not followed was none of the three
 * things the app could say: it still holds as an agreement, it has not been
 * changed, and reversing it would say he had given it up. So the record went on
 * reading `recorded` with a revisit months away, and read then, it read as
 * working.
 *
 * The rest guards the two things that will erode: the counts must never be added
 * together, and a mark must never restate what an observation already says.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import * as api from "../src/service/api.js";
import { TOOLS, callTool } from "../src/mcp/tools.js";
import { BROKEN_ENOUGH, markStanding, revisitShape } from "../src/domain/decisionmarks.js";
import { openStore } from "../src/storage/store.js";
import { DAY_MS } from "../src/domain/time.js";
import { failed, ok } from "./helpers.mjs";

const NOW = 1_800_000_000_000;
/** @param {number} n */
const daysAgo = (n) => NOW - n * DAY_MS;

/** @type {string} */
let dir;
/** @type {import("../src/storage/store.js").TendStore} */
let store;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tend-marks-"));
  let t = NOW - 1_000_000;
  store = openStore({ dataDir: dir, role: "app", host: "test", now: () => t++ });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** @param {object} [over] */
function decision(over = {}) {
  return ok(
    api.logDecision(store, {
      what: "Chefen tar statussamtalet, vi formulerar åtgärden ihop, jag levererar den",
      because: "Att lämna över en färdig plan tar bort just det jag behöver öva på",
      status: "recorded",
      revisitDays: 90,
      now: daysAgo(5),
      ...over
    })
  );
}

/** @param {string} id @param {boolean} held @param {object} [over] */
function mark(id, held, over = {}) {
  return api.markDecision(store, { decision: id, held, now: NOW, ...over });
}

/** @param {string} id */
function read(id) {
  const all = api.decisions(store, NOW);
  const found = all.find((/** @type {any} */ d) => String(d.id) === String(id));
  assert.ok(found, "the decision disappeared from the ledger");
  return found;
}

describe("a decision that was agreed and then not followed", () => {
  it("still stands, and says it was broken", () => {
    /*
     * THE test. Before this the only ways to say anything were to reverse it -
     * which claims he gave it up - or to write the breach into `because`, which
     * destroys the one field that still means anything in a year.
     */
    const made = decision();
    ok(mark(String(made.id), false, { why: "gick direkt till utvecklaren", at: NOW }));

    const d = read(String(made.id));
    assert.equal(d.status, "recorded", "noting a breach changed the decision's status");
    assert.equal(d.standing.broken, 1);
    assert.equal(d.standing.kept, 0);
    assert.equal(d.because, "Att lämna över en färdig plan tar bort just det jag behöver öva på");
  });

  it("keeps the two counts apart, so nine kept and one broken is not two out of two", () => {
    /*
     * The whole reason there are two counters. A log that counted only breaches
     * could not tell these apart, and they are different objects.
     */
    const steady = decision();
    for (const i of [1, 2, 3]) {
      ok(mark(String(steady.id), true, { at: daysAgo(i) }));
    }
    ok(mark(String(steady.id), false, { at: NOW }));

    const rocky = decision({ what: "Ett annat beslut" });
    ok(mark(String(rocky.id), false, { at: daysAgo(2) }));
    ok(mark(String(rocky.id), false, { at: NOW }));

    assert.equal(read(String(steady.id)).standing.broken, 1);
    assert.equal(read(String(steady.id)).standing.kept, 3);
    assert.equal(read(String(steady.id)).standing.mostlyBroken, false);

    assert.equal(read(String(rocky.id)).standing.broken, 2);
    assert.equal(read(String(rocky.id)).standing.kept, 0);
    assert.equal(read(String(rocky.id)).standing.mostlyBroken, true);
  });

  it("asks a different question depending on how it has gone", () => {
    /*
     * The consequence that makes the card worth it: "does this still hold?" in
     * December is a memory exercise, and these write themselves from the counts.
     */
    const never = decision();
    ok(mark(String(never.id), false, { at: NOW }));
    assert.equal(read(String(never.id)).shape, "never-followed");

    const slipped = decision({ what: "Nyligen brutet en gång", now: daysAgo(5) });
    ok(mark(String(slipped.id), true, { at: daysAgo(4) }));
    ok(mark(String(slipped.id), false, { at: NOW }));
    assert.equal(read(String(slipped.id)).shape, "slipped-once");

    const old = decision({ what: "Har stått länge", now: daysAgo(120) });
    ok(mark(String(old.id), true, { at: daysAgo(100) }));
    ok(mark(String(old.id), false, { at: daysAgo(90) }));
    assert.equal(
      read(String(old.id)).shape,
      "holding",
      "one slip three months ago asks the same question as one slip this week"
    );
  });

  it("says nothing at all until something has been noted", () => {
    // A pair of zeroes on every card reads as a failure to record rather than as
    // an absence of occasions.
    const made = decision();
    const d = read(String(made.id));
    assert.equal(d.marks.length, 0);
    assert.equal(d.shape, null);
  });
});

describe("a mark points at an observation and never restates one", () => {
  it("carries the observation's own text, read from the row that owns it", () => {
    /*
     * The constraint on the card. "Somebody broke this" is a statement about a
     * person and already lives on their page; copying it here would rebuild the
     * duplication that the replace-an-observation work exists to remove.
     */
    const who = ok(
      api.addPerson(store, { name: "Testkollega ett", relation: "equal-lead", now: NOW })
    );
    const seen = ok(
      api.logEvidence(store, {
        person: String(who.id),
        text: "Gick direkt till utvecklaren med en färdig åtgärd utan att säga till mig.",
        now: NOW
      })
    );
    const made = decision();
    ok(mark(String(made.id), false, { observation: String(seen.id), at: NOW }));

    const d = read(String(made.id));
    const points = d.marks[0].observation;
    assert.ok(points, "the mark points at nothing");
    assert.equal(String(points.id), String(seen.id));
    assert.match(points.text, /utan att säga till mig/);
    assert.equal(points.person, "Testkollega ett");

    /* And the mark itself holds no copy of it. */
    const row = store.rows("decisionMarks")[0];
    assert.equal(row.why, null, "the sentence was copied onto the mark as well");
  });

  it("refuses a pointer at an observation that is not there", () => {
    // A pointer at nothing reads on the page as though there is evidence to
    // look at. The id comes from a picker, so a stale one means the row was
    // erased between opening the dialog and confirming it.
    const made = decision();
    assert.match(failed(mark(String(made.id), false, { observation: "inte-ett-id" })), /finns inte/);
    assert.equal(store.rows("decisionMarks").length, 0);
  });

  it("survives the observation being erased afterwards", () => {
    /*
     * The pointer's target can go: an observation pasted in by mistake is
     * removable inside its window. The mark stays as the dated fact it is and
     * the pointer resolves to nothing, rather than to a stale sentence.
     */
    const who = ok(
      api.addPerson(store, { name: "Testkollega ett", relation: "equal-lead", now: NOW })
    );
    const seen = ok(
      api.logEvidence(store, { person: String(who.id), text: "En rad som ska bort.", now: NOW })
    );
    const made = decision();
    ok(mark(String(made.id), false, { observation: String(seen.id), at: NOW }));

    ok(api.forgetObservation(store, { id: String(seen.id), now: NOW + 60_000 }));

    const d = read(String(made.id));
    assert.equal(d.standing.broken, 1, "the mark went with the observation");
    assert.equal(d.marks[0].observation, null, "a dangling pointer still reads as evidence");
  });
});

describe("taking a mark back", () => {
  it("removes the mark and leaves the observation alone", () => {
    const who = ok(
      api.addPerson(store, { name: "Testkollega ett", relation: "equal-lead", now: NOW })
    );
    const seen = ok(
      api.logEvidence(store, { person: String(who.id), text: "Något som faktiskt hände.", now: NOW })
    );
    const made = decision();
    const noted = ok(mark(String(made.id), false, { observation: String(seen.id), at: NOW }));

    ok(api.unmarkDecision(store, String(noted.id)));

    assert.equal(read(String(made.id)).standing.broken, 0);
    assert.equal(
      store.rows("evidence").filter((e) => String(e.id) === String(seen.id)).length,
      1,
      "removing the mark took the observation with it"
    );
  });

  it("refuses a mark that is not there rather than reporting success", () => {
    assert.match(failed(api.unmarkDecision(store, "inte-ett-id")), /Ingen notering/);
  });
});

describe("what a mark may not be", () => {
  it("refuses one against a decision that does not exist", () => {
    assert.match(failed(mark("inte-ett-id", true)), /Inget beslut/);
  });

  it("refuses one that does not say which of the two kinds it is", () => {
    // The flag is the whole mechanism. A mark with no kind would be counted as
    // neither and would make both totals wrong at once.
    const made = decision();
    assert.match(
      failed(api.markDecision(store, { decision: String(made.id), held: /** @type {any} */ ("ja"), now: NOW })),
      /hållet eller brutet/
    );
  });

  it("and no agent can write one, checked on names and on what a call writes", () => {
    /*
     * A deviation is an assertion about another person, which is the same class
     * of row as writing an assessment - parked on the assessments epic, and
     * answered "no" for observations on 2026-09-09. Left closed here rather than
     * settled, and on the card as a question.
     */
    const names = TOOLS.map((t) => t.name);
    const writers = names.filter(
      (n) =>
        /^tend_(add|update|remove|delete|set|write|mark|log|record)_/i.test(n) &&
        /decision/i.test(n)
    );
    assert.deepEqual(writers, [], `an MCP tool is named as if it marks one: ${writers.join(", ")}`);

    const made = decision();
    ok(mark(String(made.id), false, { at: NOW }));
    const before = store.state().applied;

    for (const name of names.filter((n) => /decision/i.test(n))) {
      callTool(store, name, { id: String(made.id), decision: String(made.id), held: true }, NOW);
    }

    assert.equal(store.state().applied, before, "an MCP call wrote a mark");
    assert.equal(store.rows("decisionMarks").length, 1);
  });

  it("but an agent still reads how a decision has gone", () => {
    // The read half has to work: a session asked whether a decision holds should
    // see that it was broken twice, or it advises from a picture nobody shares.
    const made = decision();
    ok(mark(String(made.id), false, { at: NOW }));

    const out = ok(callTool(store, "tend_decisions", {}, NOW));
    const row = out.find((/** @type {any} */ d) => String(d.id) === String(made.id));
    assert.ok(row, "the decision is not in the agent's read");
    assert.equal(row.standing.broken, 1);
    assert.equal(row.shape, "never-followed");
  });
});

describe("the pieces underneath", () => {
  it("needs more than one breach before it calls a decision mostly broken", () => {
    // One break out of one is not yet a pattern, and one out of ten is not one
    // either. Both halves of that are the test.
    assert.equal(markStanding([{ held: false, at: NOW }]).mostlyBroken, false);
    assert.equal(
      markStanding([
        { held: false, at: NOW },
        { held: false, at: NOW }
      ]).mostlyBroken,
      true
    );
    assert.equal(
      markStanding([
        ...Array.from({ length: 8 }, () => ({ held: true, at: NOW })),
        { held: false, at: NOW },
        { held: false, at: NOW }
      ]).mostlyBroken,
      false
    );
    assert.ok(BROKEN_ENOUGH >= 2, "one slip should never be a pattern on its own");
  });

  it("says nothing rather than something obvious when there is nothing to say", () => {
    assert.equal(revisitShape(markStanding([]), 10), null);
  });
});
