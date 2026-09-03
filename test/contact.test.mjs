/**
 * Tests for which kinds of contact can be about which sort of subject.
 *
 * The failure being prevented is the quietest one in the app. A kind filed
 * against the wrong sort of subject satisfies no cadence, so it records
 * something, says "Logged", and leaves the thing it was meant to answer exactly
 * as behind as it was. Nothing errors and nothing looks wrong.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import * as api from "../src/service/api.js";
import { openStore } from "../src/storage/store.js";
import { DAY_MS } from "../src/domain/time.js";
import { contactSummary } from "../src/domain/contact.js";
import {
  CONTACT_KINDS,
  NOTE_CONTACT_KINDS,
  SUBJECT_KINDS,
  evidenceFor,
  fitsSubject,
  kindsFor,
  subjectOf
} from "../src/domain/contact.js";
import { SEED_DUTIES } from "../src/service/seed.js";
import { ok, failed } from "./helpers.mjs";

describe("what a kind can be about", () => {
  it("offers a person only the kinds that can be about a person", () => {
    const values = kindsFor("person").map((k) => k.value);
    assert.ok(values.includes("one-to-one"));
    assert.ok(values.includes("casual"));
    assert.ok(!values.includes("check-in"), "a person is not a project");
    assert.ok(!values.includes("delegation-review"), "a person is not a piece of work");
    assert.ok(!values.includes("update"), "an update is about a person AND a project, not a person");
  });

  it("offers a project exactly one kind, since only one is about a project", () => {
    assert.deepEqual(
      kindsFor("project").map((k) => k.value),
      ["check-in"]
    );
  });

  it("offers a stake the update that its duty consumes", () => {
    assert.deepEqual(
      kindsFor("stake").map((k) => k.value),
      ["update"]
    );
  });

  it("offers a workstream the review that its duty consumes", () => {
    assert.deepEqual(
      kindsFor("workstream").map((k) => k.value),
      ["delegation-review"]
    );
  });

  it("keeps casual on the list even though it satisfies nothing", () => {
    // The tempting filter is "only kinds that would move a clock", which would
    // delete the one way to record that you have actually spoken to somebody.
    assert.ok(kindsFor("person").some((k) => k.value === "casual"));
  });

  it("names the subject a kind belongs to, and refuses one it does not", () => {
    assert.equal(subjectOf("check-in"), "project");
    assert.equal(subjectOf("one-to-one"), "person");
    assert.equal(subjectOf("nonsense"), null);
    assert.equal(fitsSubject("check-in", "person"), false);
    assert.equal(fitsSubject("check-in", "project"), true);
  });

  it("gives every kind exactly one sort of subject", () => {
    for (const kind of CONTACT_KINDS) {
      assert.ok(
        ["person", "project", "workstream", "stake"].includes(kind.subject),
        `${kind.value} is about "${kind.subject}", which is not a subject`
      );
    }
    const values = CONTACT_KINDS.map((k) => k.value);
    assert.equal(new Set(values).size, values.length, "a kind listed twice could be about two things");
  });

  it("keeps the note-evidence set to person kinds a note can actually carry", () => {
    const values = NOTE_CONTACT_KINDS.map((k) => k.value);
    assert.ok(!values.includes("survey"), "a survey round is a form going out, not a note");
    assert.ok(!values.includes("check-in"));
    assert.ok(values.includes("second-hand"));
  });
});

describe("a duty has to be satisfiable by its own evidence", () => {
  // The failure has no symptom other than a card that never clears. A duty
  // declared against a person while consuming evidence about a stake crosses
  // with every colleague, reports each of them as never done, and no action in
  // the app can answer it. Two seeded duties shipped in that state, and a form
  // silently put a third one there.
  it("every subject kind is offered with a label", () => {
    const offered = new Set(SUBJECT_KINDS.map((k) => k.value));
    const used = new Set(CONTACT_KINDS.map((k) => k.subject));
    for (const subject of used) {
      assert.ok(offered.has(subject), `${subject} is a subject nothing can be declared against`);
    }
    for (const k of SUBJECT_KINDS) {
      assert.ok(String(k.label).trim().length > 0, `${k.value} has no label`);
    }
  });

  it("names the evidence that could apply to each subject", () => {
    assert.deepEqual(evidenceFor("project"), ["check-in"]);
    assert.deepEqual(evidenceFor("stake"), ["update"]);
    assert.ok(evidenceFor("person").includes("one-to-one"));
  });

  it("every seeded duty could actually be satisfied", () => {
    // The tripwire. "Stated delegation level per workstream" was declared
    // against a project while consuming a workstream's evidence, so it could
    // never be satisfied by anything - and it shipped that way.
    for (const duty of SEED_DUTIES) {
      for (const kind of duty.evidenceKinds ?? []) {
        assert.equal(
          subjectOf(kind),
          duty.subjectKind,
          `"${duty.name}" applies to each ${duty.subjectKind} but consumes "${kind}", which is about a ${subjectOf(kind)}`
        );
      }
    }
  });
});

describe("logging contact against the right sort of subject", () => {
  /** @type {string} */
  let dir;
  /** @type {import("../src/storage/store.js").TendStore} */
  let store;
  const NOW = Date.parse("2026-08-25T09:00:00Z");

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "tend-contact-"));
    store = openStore({ dataDir: dir, role: "app", host: "test" });
    ok(api.addPerson(store, { name: "Ada", relation: "lead-only", now: NOW }));
    ok(api.addProject(store, { name: "Zeta", now: NOW }));
    ok(api.addWorkstream(store, { name: "Rendering", owner: "Ada", level: "close", now: NOW }));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("records a delegation review against a piece of work", () => {
    // This was impossible before the kind chose the lookup: the Work view had a
    // button for it and it answered "No project matching <uuid>", so the duty
    // that consumes these reviews could never be satisfied by anything.
    const ws = store.rows("workstreams")[0];
    const done = ok(api.logTouch(store, { subject: ws.id, kind: "delegation-review", now: NOW }));
    assert.match(String(done.logged), /delegation-review with Rendering/);
    assert.equal(store.rows("touches").length, 1);
    assert.equal(store.rows("touches")[0].subject, ws.id);
  });

  it("refuses a 1-1 with a project, and says what a project can take", () => {
    const why = failed(api.logTouch(store, { subject: "Zeta", kind: "one-to-one", now: NOW }));
    assert.match(why, /person/);
    assert.match(why, /check-in/);
  });

  it("refuses a check-in against a person", () => {
    const why = failed(api.logTouch(store, { subject: "Ada", kind: "check-in", now: NOW }));
    assert.match(why, /project/);
  });

  it("refuses a kind that is not a kind at all, and lists the ones that are", () => {
    const why = failed(api.logTouch(store, { subject: "Ada", kind: "coffee", now: NOW }));
    assert.match(why, /not a kind of contact/);
    assert.match(why, /one-to-one/);
  });

  it("still needs a kind", () => {
    // Cast, because the signature requires a kind and the checker is right.
    // The guard is for a plain script, which is the only caller that can omit it.
    const noKind = /** @type {any} */ ({ subject: "Ada", now: NOW });
    assert.match(failed(api.logTouch(store, noKind)), /needs a kind/);
  });

  it("looks the subject up as the sort of thing the kind is about", () => {
    // A person and a project sharing a name used to resolve to whichever lookup
    // ran first, and the kind was then judged against the wrong one.
    ok(api.addPerson(store, { name: "Zeta", relation: "lead-only", now: NOW }));

    const asPerson = ok(api.logTouch(store, { subject: "Zeta", kind: "one-to-one", now: NOW }));
    const asProject = ok(api.logTouch(store, { subject: "Zeta", kind: "check-in", now: NOW }));

    const people = new Set(store.rows("people").map((p) => p.id));
    const projects = new Set(store.rows("projects").map((p) => p.id));
    const touches = store.rows("touches");
    const oneToOne = touches.find((t) => t.id === asPerson.id);
    const checkIn = touches.find((t) => t.id === asProject.id);

    assert.ok(people.has(String(oneToOne?.subject)), "the 1-1 landed on the person");
    assert.ok(projects.has(String(checkIn?.subject)), "the check-in landed on the project");
  });

  it("refuses a meeting that has not happened yet", () => {
    // The temptation is concrete: a 1-1 in the diary for next Wednesday, and a
    // card saying you are two weeks behind. Logging it early goes green at once
    // and stays green until the day arrives - wrong in the flattering
    // direction, which is the direction nobody checks.
    const why = failed(api.logTouch(store, { subject: "Ada", kind: "one-to-one", at: NOW + 8 * DAY_MS, now: NOW }));
    assert.match(why, /has not arrived yet/);
    assert.equal(store.rows("touches").length, 0);
  });

  it("still accepts something that happened earlier today", () => {
    // The date pickers parse a chosen day at midday, so logging this morning
    // produces a stamp a few hours ahead of the clock. A plain "later than now"
    // check would have rejected today.
    const morning = Date.parse("2026-08-25T07:00:00Z");
    const middayStamp = Date.parse("2026-08-25T12:00:00");
    ok(api.logTouch(store, { subject: "Ada", kind: "casual", at: middayStamp, now: morning }));
  });

  it("a refused contact writes nothing at all", () => {
    failed(api.logTouch(store, { subject: "Ada", kind: "check-in", now: NOW }));
    assert.equal(store.rows("touches").length, 0, "a rejected kind must not leave a row behind");
  });

  it("refuses a duty whose evidence can never be about its subject", () => {
    const why = failed(
      api.proposeDuty(store, {
        name: "Nonsense",
        means: "Applies to people, satisfied by a stakeholder update.",
        source: "test",
        subjectKind: "person",
        cadenceDays: 7,
        evidenceKinds: ["update"]
      })
    );
    assert.match(why, /about a stake/);
    assert.match(why, /never be satisfied/);
  });

  it("refuses an edit that leaves a duty nothing can satisfy", () => {
    // The exact shape of the bug: a form rewrote the subject alone, and the two
    // halves were never judged together.
    const made = ok(
      api.proposeDuty(store, {
        name: "Stakeholder updates",
        means: "Keep them current.",
        source: "test",
        subjectKind: "stake",
        cadenceDays: 30,
        evidenceKinds: ["update"]
      })
    );
    const why = failed(api.updateDuty(store, made.id, { subjectKind: "person" }));
    assert.match(why, /about a stake/);

    const row = store.rows("duties").find((d) => d.id === made.id);
    assert.equal(row?.subjectKind, "stake", "a refused edit must not have written anything");
  });

  it("accepts a duty that names no evidence, which means any contact counts", () => {
    ok(
      api.proposeDuty(store, {
        name: "Anything",
        means: "Any contact at all.",
        source: "test",
        subjectKind: "person",
        cadenceDays: 30,
        evidenceKinds: []
      })
    );
  });

  it("does not quietly turn an unknown subject into a person", () => {
    const why = failed(
      api.proposeDuty(store, {
        name: "Whatever",
        means: "Applies to something that does not exist.",
        source: "test",
        subjectKind: /** @type {any} */ ("department"),
        cadenceDays: 30,
        evidenceKinds: []
      })
    );
    assert.match(why, /applies to one of/);
  });
});


/*
 * The summary line on a person's contact history.
 *
 * It exists because the history was eighteen rows, fifteen of them the same
 * string from a calendar import, sitting above the observations a review
 * conversation is built from. The rows are folded away now and this line stands
 * for them - which makes it the thing being read, so it has to be right.
 *
 * The count is the fault worth guarding. The page is handed twenty rows at most,
 * so a total derived from what the page received would report the cap the moment
 * somebody has twenty-one conversations, and it would report it as a fact.
 */
describe("what a contact history amounts to", () => {
  /** @param {number[]} daysAgo */
  const touchesAt = (daysAgo) =>
    daysAgo.map((d, i) => ({ id: `t${i}`, at: NOW - d * DAY_MS, kind: "one-to-one" }));

  const NOW = 1_700_000_000_000;

  it("says nothing rather than zero when there is no history", () => {
    const s = contactSummary([], NOW);
    assert.equal(s.total, 0);
    assert.equal(s.firstAt, null);
    assert.equal(s.everyDays, null);
    assert.equal(s.sinceLastDays, null);
  });

  it("gives a single conversation a date but no cadence", () => {
    const s = contactSummary(touchesAt([3]), NOW);
    assert.equal(s.total, 1);
    assert.equal(s.spanDays, 0);
    // One point has no interval, and inventing one would be the app claiming to
    // know a rhythm from a single event.
    assert.equal(s.everyDays, null);
    assert.equal(s.sinceLastDays, 3);
  });

  it("reads a fortnightly cadence off a fortnightly history", () => {
    const s = contactSummary(touchesAt([0, 14, 28, 42, 56]), NOW);
    assert.equal(s.total, 5);
    assert.equal(s.everyDays, 14);
    assert.equal(s.sinceLastDays, 0);
  });

  it("counts every touch, not the twenty a page is given", () => {
    /*
     * The one that matters. `reading.js` slices the rows at twenty for display
     * and hands the summary the whole set; if those two ever swap, this fails.
     */
    const many = touchesAt(Array.from({ length: 31 }, (_, i) => i * 7));
    const s = contactSummary(many, NOW);
    assert.equal(s.total, 31);
    assert.equal(s.everyDays, 7);
  });

  it("does not care what order the rows arrive in", () => {
    const forwards = contactSummary(touchesAt([0, 14, 28]), NOW);
    const backwards = contactSummary(touchesAt([28, 14, 0]), NOW);
    assert.deepEqual(forwards, backwards);
  });

  it("ignores rows with no date rather than counting them as today", () => {
    /*
     * A touch with no `at` is a row the store holds but cannot place in time.
     * Counting it puts a conversation on the page that has no date, and treating
     * a missing date as now would make the cadence look fresher than it is -
     * which is the one direction this line must never be wrong in.
     */
    const s = contactSummary([...touchesAt([10, 20]), { id: "x" }], NOW);
    assert.equal(s.total, 2);
    assert.equal(s.sinceLastDays, 10);
  });

  it("never reports a cadence of zero days", () => {
    // Two touches on the same day is a real thing - a 1-1 and a casual chat.
    // "Roughly every 0 days" is not a sentence, so the floor is one.
    const s = contactSummary(touchesAt([5, 5]), NOW);
    assert.equal(s.everyDays, 1);
  });
});
