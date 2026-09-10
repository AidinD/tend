/**
 * The day the job ends: the scores go, the fact a round ran stays.
 *
 * Alternative B on the assessments epic, chosen 2026-09-10 out of three that had
 * been written on the card and left for him. It is the one that needed building
 * rather than deciding: a round was DERIVED by grouping answers, so deleting the
 * answers deleted the rounds with them, and B needs a round that outlives its
 * own.
 *
 * ## The test that matters most
 *
 * "leaves nothing about anybody behind". What survives has to be a record of how
 * he worked - that he ran rounds, this often, with these sets - and not a record
 * about the people he ran them on. Keeping the subject would mean carrying "this
 * named colleague was assessed" out of a job he has left, which is the exact
 * thing B exists to stop.
 *
 * ## The limit these tests also pin down
 *
 * The log is append-only and `remove` is a tombstone. After this, nothing in the
 * app can read a score by any path - and the original event is still in the
 * file. There is a test for each half of that, because the second one is the
 * sentence it would be comfortable to leave out.
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import * as api from "../src/service/api.js";
import { TOOLS, callTool } from "../src/mcp/tools.js";
import { roundSummaries } from "../src/domain/assessments.js";
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
  dir = mkdtempSync(join(tmpdir(), "tend-retire-"));
  let t = NOW - 1_000_000;
  store = openStore({ dataDir: dir, role: "app", host: "test", now: () => t++ });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** @param {string} name */
function person(name) {
  return String(ok(api.addPerson(store, { name, relation: "lead-and-manage", now: NOW })).id);
}

/** @param {string} who @param {object} [over] */
function record(who, over = {}) {
  return ok(
    api.recordAssessment(store, {
      person: who,
      assessor: "Testproducent",
      assessorRole: "producent på projektet",
      set: "producentrond",
      setName: "Producentrond",
      scores: [{ axis: "Kommunikation", score: 4 }],
      note: "Skrev en hel del om hur det gick",
      now: NOW,
      ...over
    })
  );
}

/** Two people, two rounds, on two days. */
function twoRounds() {
  const one = person("Testkodare");
  const two = person("Testanimatör");
  record(one, { at: daysAgo(200), assessor: "Testregissör" });
  record(two, { at: daysAgo(200), assessor: "Testregissör" });
  record(one, { at: NOW, assessor: "Testproducent", note: "" });
  return { one, two };
}

/** Every byte the store has written, for asking what the log still holds. */
function logBytes() {
  const events = join(dir, "events");
  return readdirSync(events)
    .map((f) => readFileSync(join(events, f), "utf8"))
    .join("\n");
}

describe("retiring the answers and keeping the rounds", () => {
  it("keeps one round per day and question set, with what came back", () => {
    twoRounds();
    const out = ok(api.retireAssessments(store, { now: NOW }));
    assert.equal(out.rounds, 2, "two occasions did not survive as two rounds");
    assert.equal(out.answers, 3);

    const kept = api.roundsRan(store);
    assert.equal(kept.length, 2);
    const [newest, oldest] = kept;
    assert.equal(newest.day, new Date(NOW).toISOString().slice(0, 10));
    assert.equal(oldest.answers, 2, "the older round lost one of its answers");
    assert.equal(oldest.people, 2, "the older round covered two people and does not say so");
    assert.equal(newest.silent, 1, "the answer that said nothing is not counted");
  });

  it("leaves nothing about anybody behind", () => {
    /*
     * THE test. What survives is his record of how he worked. A person, an
     * assessor, a score, a note or a weight on a surviving row would be carrying
     * something about somebody else out of a job he has left.
     */
    twoRounds();
    ok(api.retireAssessments(store, { now: NOW }));

    const rows = store.rows("roundsRan");
    assert.ok(rows.length > 0, "nothing survived, so this proved nothing");
    for (const row of rows) {
      const text = JSON.stringify(row);
      for (const forbidden of [
        "Testkodare",
        "Testanimatör",
        "Testproducent",
        "Testregissör",
        "Kommunikation",
        "hur det gick"
      ]) {
        assert.equal(
          text.includes(forbidden),
          false,
          `a surviving round carries "${forbidden}": ${text}`
        );
      }
      for (const field of ["person", "assessor", "scores", "note", "weighWhy", "assessorWeight"]) {
        assert.equal(field in row, false, `a surviving round has a "${field}" field`);
      }
    }
  });

  it("makes the numbers unreachable by every path the app has", () => {
    const { one } = twoRounds();
    ok(api.retireAssessments(store, { now: NOW }));

    /* The person's page. */
    const page = ok(api.person(store, one, NOW));
    assert.equal(page.assessments, null, "the person page still reports rounds");

    /* The full read, and the agent's. */
    const read = ok(api.assessments(store, one, NOW));
    assert.equal(read.answers.length, 0);
    assert.equal(read.byAxis.length, 0);
    assert.equal(read.roundHistory.length, 0);
    assert.equal(read.series.length, 0);

    const over = ok(callTool(store, "tend_assessments", { person: one }, NOW));
    assert.equal(over.answers.length, 0, "an agent can still read the answers");

    /* And the reduced state itself, not only the filtered view: a tombstone
       keeps its fields, so blanking them first is what makes this true. */
    for (const row of Object.values(store.state().c.assessments ?? {})) {
      const text = JSON.stringify(row);
      assert.equal(text.includes("Testregissör"), false, `a tombstone kept its assessor: ${text}`);
      assert.equal(text.includes("hur det gick"), false, `a tombstone kept its note: ${text}`);
    }
  });

  it("and the log still holds the original event, which nothing here can change", () => {
    /*
     * The sentence it would be comfortable to leave out. `remove` tombstones and
     * the log is append-only, so the original `assessments.create` is still in
     * the file with the scores and the names in it. A replay ends with nothing
     * readable because the fields are blanked first - but the bytes are there,
     * and getting rid of them is compaction, which this project refuses on the
     * grounds that it is the only operation that destroys data.
     *
     * Asserted rather than documented, so nobody can later believe the numbers
     * were shredded.
     */
    twoRounds();
    ok(api.retireAssessments(store, { now: NOW }));

    const bytes = logBytes();
    assert.ok(
      bytes.includes("Testregissör"),
      "the log no longer holds the original event - if that is now true, this app grew a " +
        "compaction step and the honest wording in the service and in Settings has to change"
    );
  });

  it("says what it would do without doing it", () => {
    twoRounds();
    const dry = ok(api.retireAssessments(store, { now: NOW, dry: true }));
    assert.equal(dry.rounds, 2);
    assert.equal(dry.answers, 3);
    assert.equal(store.rows("assessments").length, 3, "the dry run wrote something");
    assert.equal(api.roundsRan(store).length, 0, "the dry run kept a round");
  });

  it("can be run twice without doubling a round or reporting work it did not do", () => {
    twoRounds();
    ok(api.retireAssessments(store, { now: NOW }));

    const again = ok(api.retireAssessments(store, { now: NOW + 1000 }));
    assert.equal(again.answers, 0, "it claimed to retire answers that were already gone");
    assert.equal(again.rounds, 0);
    assert.equal(api.roundsRan(store).length, 2, "a second pass wrote the rounds again");
  });

  it("keeps a round retired earlier exactly as it was", () => {
    // A deterministic id means a later pass leaves an existing round alone
    // rather than restamping it - the day it ran is a fact about then.
    twoRounds();
    ok(api.retireAssessments(store, { now: NOW }));
    const first = api.roundsRan(store).map((r) => r.retiredAt);

    record(person("Testtredje"), { at: NOW, assessor: "Testproducent" });
    ok(api.retireAssessments(store, { now: NOW + 5 * DAY_MS }));

    const after = api.roundsRan(store);
    assert.equal(after.length, 2, "the new answer landed on a day that already had a round");
    assert.deepEqual(
      after.map((r) => r.retiredAt).sort(),
      first.sort(),
      "an earlier round was restamped by a later pass"
    );
  });

  it("survives a store with nothing in it rather than reporting success", () => {
    const out = ok(api.retireAssessments(store, { now: NOW }));
    assert.equal(out.rounds, 0);
    assert.equal(out.answers, 0);
    assert.deepEqual(out.kept, []);
  });
});

describe("who may retire them", () => {
  it("nobody over MCP, and no agent can read what survived either way", () => {
    /*
     * Irreversible and about the whole store, so it is the window's alone - the
     * same class as the bulk archive, and further along it: that one promises
     * nothing is removed and this one removes.
     */
    const names = TOOLS.map((t) => t.name);
    const forbidden = names.filter((n) => /retire|purge|forget_all|wipe/i.test(n));
    assert.deepEqual(forbidden, [], `an MCP tool is named as if it retires them: ${forbidden}`);

    twoRounds();
    const before = store.state().applied;
    for (const name of names.filter((n) => /assess|round/i.test(n))) {
      callTool(store, name, { dry: false }, NOW);
    }
    assert.equal(store.state().applied, before, "an MCP call retired something");
    assert.equal(store.rows("assessments").length, 3);
  });
});

describe("the summary underneath", () => {
  it("groups on the day and the set, never across sets", () => {
    /*
     * The invariant the whole feature has carried from the start: two sets can
     * ask about the same thing and mean different things by it, so a round is a
     * day AND a set - collapsing them would make one surviving row stand for two
     * different measurements.
     */
    const rows = [
      { at: NOW, set: "a", setName: "A", assessor: "en", person: "p1", saidAnything: true },
      { at: NOW, set: "b", setName: "B", assessor: "en", person: "p1", saidAnything: true }
    ];
    const out = roundSummaries(/** @type {any} */ (rows));
    assert.equal(out.length, 2, "two sets on one day became one round");
  });

  it("counts people and assessors rather than naming them", () => {
    const rows = [
      { at: NOW, set: "a", setName: "A", assessor: "en", person: "p1", saidAnything: true },
      { at: NOW, set: "a", setName: "A", assessor: "en", person: "p2", saidAnything: false }
    ];
    const [round] = roundSummaries(/** @type {any} */ (rows));
    assert.equal(round.answers, 2);
    assert.equal(round.assessors, 1, "one assessor answering twice is not two assessors");
    assert.equal(round.people, 2);
    assert.equal(round.silent, 1);
  });

  it("drops an answer with no date rather than inventing a round in 1970", () => {
    const out = roundSummaries(
      /** @type {any} */ ([
        { at: 0, set: "a", setName: "A", assessor: "en", person: "p1", saidAnything: true }
      ])
    );
    assert.deepEqual(out, []);
  });
});
