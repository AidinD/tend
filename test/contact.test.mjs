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

