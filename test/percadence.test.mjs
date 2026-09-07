/**
 * How often one duty runs for one person.
 *
 * The interesting part of this feature is not that an interval can be
 * overridden - it is the three things that had to stay true while it could:
 *
 *   The override is on the PAIR. A field on the person would have dragged a
 *   quarterly feedback round to whatever was set for a fortnightly
 *   conversation, and the second test here is what says it does not.
 *
 *   A switched-off clock is not a person who is in step. Two readers could have
 *   claimed it - the tile rule and the person's page - and both are checked,
 *   because "he is up to date" about somebody nothing is measuring is a false
 *   statement rather than a soft one.
 *
 *   No agent may set it. How often something is owed is what the job is, so an
 *   agent that could set it per person could rewrite the role map's meaning
 *   without ever touching the role map.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import * as api from "../src/service/api.js";
import { TOOLS } from "../src/mcp/tools.js";
import { expandCadences, personClocks } from "../src/domain/attention.js";
import { intervalFor, isMuted, mutedDuties, overrideFor } from "../src/domain/overrides.js";
import { tileOf } from "../src/domain/tiles.js";
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
  dir = mkdtempSync(join(tmpdir(), "tend-percadence-"));
  let t = NOW - 1_000_000;
  store = openStore({ dataDir: dir, role: "app", host: "test", now: () => t++ });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/**
 * A duty, active, about people.
 *
 * @param {object} over
 */
function duty(over) {
  const made = ok(
    api.proposeDuty(store, {
      name: "Sidledeskontakt",
      means: "Samordning utan mandat bakom, så den vilar på förtroende",
      source: "test",
      subjectKind: "person",
      cadenceDays: 7,
      ...over
    })
  );
  ok(api.decideDuty(store, String(made.id), "active"));
  return String(made.id);
}

/** @param {object} [over] */
function peer(over = {}) {
  return ok(
    api.addPerson(store, {
      name: "Testkollega",
      relation: "equal-lead",
      since: daysAgo(400),
      now: NOW,
      ...over
    })
  );
}

/** @param {string} personId @param {string} dutyId */
function clockFor(personId, dutyId) {
  const person = store.rows("people").find((p) => String(p.id) === String(personId));
  assert.ok(person, `no person with id "${personId}"`);
  return personClocks(store.state(), person, NOW).find((c) => String(c.duty.id) === String(dutyId));
}

describe("the interval sits on the pair, not on the person", () => {
  it("falls back to the duty's own interval when nothing is set", () => {
    const d = duty({});
    const who = peer();
    assert.equal(clockFor(String(who.id), d)?.interval, 7);
    assert.equal(clockFor(String(who.id), d)?.fromDuty, true);
  });

  it("uses the person's own interval for that duty once it is set", () => {
    const d = duty({});
    const who = peer();

    const set = ok(api.setPersonCadence(store, { person: String(who.id), duty: d, cadenceDays: 30 }));
    assert.equal(set.every, 30);
    assert.equal(set.was, 7, "the reply does not say what it replaced");

    assert.equal(clockFor(String(who.id), d)?.interval, 30);
    assert.equal(clockFor(String(who.id), d)?.fromDuty, false);
  });

  it("leaves the person's other duties on their own intervals", () => {
    /*
     * The load-bearing one, and the reason this is not a field on the person.
     * Measured against the real role map before it was built: somebody the user
     * leads carries a conversation every fortnight and a feedback round every
     * quarter, so a person-level interval of 30 would have moved the quarterly
     * round to a month without anybody asking for it.
     */
    const talk = duty({ name: "Samtalet", cadenceDays: 14, relations: ["lead-and-manage"] });
    const round = duty({ name: "Feedbackrundan", cadenceDays: 90, relations: ["lead-and-manage"] });
    const who = peer({ name: "Testrapport", relation: "lead-and-manage" });

    ok(api.setPersonCadence(store, { person: String(who.id), duty: talk, cadenceDays: 30 }));

    assert.equal(clockFor(String(who.id), talk)?.interval, 30);
    assert.equal(
      clockFor(String(who.id), round)?.interval,
      90,
      "setting one duty's interval moved another one"
    );
  });

  it("leaves everybody else on the duty's interval", () => {
    const d = duty({});
    const mine = peer({ name: "Testkollega" });
    const theirs = peer({ name: "Testkollega två" });

    ok(api.setPersonCadence(store, { person: String(mine.id), duty: d, cadenceDays: 30 }));

    assert.equal(clockFor(String(mine.id), d)?.interval, 30);
    assert.equal(clockFor(String(theirs.id), d)?.interval, 7);
  });

  it("follows the duty again when the override is cleared, rather than keeping a copy", () => {
    /*
     * A cleared override removes the row instead of writing the duty's current
     * number into it. Otherwise changing the duty later would move everybody
     * except the person somebody once "reset", which is the drift a copied
     * value always turns into.
     */
    const d = duty({});
    const who = peer();
    ok(api.setPersonCadence(store, { person: String(who.id), duty: d, cadenceDays: 30 }));
    ok(api.clearPersonCadence(store, { person: String(who.id), duty: d }));

    ok(api.updateDuty(store, d, { cadenceDays: 21 }));
    assert.equal(clockFor(String(who.id), d)?.interval, 21);
    assert.equal(store.rows("cadenceOverrides").filter((r) => !r._deleted).length, 0);
  });

  it("refuses an interval on a duty that does not reach that person at all", () => {
    // Not a quieter setting: a row that changes nothing while reading as though
    // it did. Somebody sets a peer's interval on a duty for reports, sees it
    // saved, and believes a clock moved.
    const reports = duty({ name: "Bara rapporter", relations: ["lead-and-manage"] });
    const who = peer();

    const why = failed(
      api.setPersonCadence(store, { person: String(who.id), duty: reports, cadenceDays: 30 })
    );
    assert.match(why, /gäller inte/);
    assert.equal(store.rows("cadenceOverrides").length, 0);
  });

  it("refuses an interval that is not a positive number of days", () => {
    const d = duty({});
    const who = peer();

    for (const bad of [0, -5, "trettio"]) {
      failed(
        api.setPersonCadence(store, {
          person: String(who.id),
          duty: d,
          cadenceDays: /** @type {any} */ (bad),
          why: "en anledning som inte ska hjälpa"
        })
      );
    }
    assert.equal(store.rows("cadenceOverrides").length, 0);
  });
});

describe("a clock switched off", () => {
  /** @param {string} personId @param {string} dutyId */
  const mute = (personId, dutyId) =>
    api.setPersonCadence(store, {
      person: personId,
      duty: dutyId,
      cadenceDays: null,
      why: "kontakten är händelsedriven, inget intervall är sant"
    });

  it("stops generating drift for that person and that duty", () => {
    const d = duty({});
    const who = peer();

    assert.equal(
      expandCadences(store.state(), NOW).filter((c) => c.subject.id === who.id).length,
      1,
      "the clock was not running before it was switched off, so this proves nothing"
    );

    ok(mute(String(who.id), d));

    assert.deepEqual(
      expandCadences(store.state(), NOW).filter((c) => c.subject.id === who.id),
      [],
      "a switched-off duty still produced a cadence"
    );
  });

  it("keeps the person and the duty on their page, with the age still readable", () => {
    /*
     * The whole difference between switching a clock off and hiding somebody.
     * If the row vanished, the only trace of a deliberate decision would be an
     * absence - and an absence reads as a gap in the setup rather than a
     * choice, which is the misreading `availability` was put on the roster to
     * prevent.
     */
    const d = duty({});
    const who = peer();
    ok(api.logTouch(store, { subject: String(who.id), kind: "sideways", at: daysAgo(35), now: NOW }));
    ok(mute(String(who.id), d));

    const page = ok(api.person(store, String(who.id), NOW));
    const row = page.cadences.find((/** @type {any} */ c) => c.dutyId === d);
    assert.ok(row, "the switched-off duty is not on the person's page at all");
    assert.equal(row.muted, true);
    assert.equal(row.target, null, "a switched-off clock is claiming an interval");
    assert.equal(row.behindBy, null);
    assert.match(
      String(row.lastHappened),
      /5 veckor/,
      `the age since the last contact is gone: "${row.lastHappened}"`
    );
    assert.match(String(row.why), /händelsedriven/, "the reason it was switched off is not shown");
  });

  it("never lets a tile say the person is in step", () => {
    // "In step" about somebody nothing is measuring is not a softer statement
    // than the truth, it is a false one. The same mistake the away phrase was
    // added to fix, arrived at from the other direction.
    for (const cluster of ["peers", "noChannel", "outward"]) {
      const tile = tileOf(
        { id: "p", name: "Testkollega", worstDrift: null, clocksMuted: 1, update: null },
        cluster
      );
      assert.equal(tile.kind, "noClock", `${cluster} said "${tile.kind}"`);
    }
  });

  it("but is outranked by a clock that is still running and late", () => {
    // Somebody with two duties, one switched off and one late, is described by
    // the late one. Otherwise switching a single clock off would hide a real
    // problem behind the decision to stop measuring a different one.
    const tile = tileOf(
      {
        id: "p",
        name: "Testkollega",
        worstDrift: {
          urgency: "critical",
          duty: "Samtalet",
          targetDays: 14,
          sinceDays: 40,
          everHappened: true
        },
        clocksMuted: 1
      },
      "peers"
    );
    assert.equal(tile.kind, "daysOver");
  });

  it("shows on the roster as a count, so a reader can tell why nothing applies", () => {
    const d = duty({});
    const who = peer();
    ok(mute(String(who.id), d));

    const row = api.people(store, NOW).find((/** @type {any} */ p) => p.id === who.id);
    assert.equal(row?.clocksMuted, 1);
    assert.equal(row?.worstDrift, null);
  });

  it("refuses to switch one off without saying why", () => {
    /*
     * The field that makes the record worth keeping is the one it would be
     * easiest to leave out. Six months later the row cannot say whether a
     * silent clock was a decision or a mistake, and the two want opposite
     * things done about them.
     */
    const d = duty({});
    const who = peer();

    const why = failed(
      api.setPersonCadence(store, { person: String(who.id), duty: d, cadenceDays: null })
    );
    assert.match(why, /varför/i);
    assert.equal(store.rows("cadenceOverrides").length, 0);
  });

  it("comes back on the duty's interval when it is cleared", () => {
    const d = duty({});
    const who = peer();
    ok(mute(String(who.id), d));

    const back = ok(api.clearPersonCadence(store, { person: String(who.id), duty: d }));
    assert.equal(back.wasMuted, true);
    assert.equal(back.every, 7);
    assert.equal(clockFor(String(who.id), d)?.muted, false);
    assert.equal(expandCadences(store.state(), NOW).filter((c) => c.subject.id === who.id).length, 1);
  });
});

describe("the write boundary", () => {
  it("gives no agent a way to set it", () => {
    /*
     * The same boundary as accepting a duty, and for a stronger reason. A duty
     * arrives as a proposal the user answers; an interval per person would
     * arrive as a fact, and how often something is owed IS what the job is - so
     * an agent able to write one could rewrite what the role map means while
     * every duty in it still read as the user wrote it.
     */
    const names = TOOLS.map((t) => t.name);
    assert.equal(
      names.find((n) => /cadence|interval|takt/i.test(n)),
      undefined,
      `an MCP tool can set a cadence: ${names.filter((n) => /cadence|interval|takt/i.test(n)).join(", ")}`
    );
  });

  it("and the service is where the rules live, not the dialog", () => {
    // Both refusals are in the service rather than in the window's form, so the
    // second client cannot route around them.
    const d = duty({});
    const who = peer();
    failed(api.setPersonCadence(store, { person: String(who.id), duty: d, cadenceDays: null }));
    failed(api.setPersonCadence(store, { person: "nobody", duty: d, cadenceDays: 30 }));
    failed(api.setPersonCadence(store, { person: String(who.id), duty: "no-such-duty", cadenceDays: 30 }));
  });
});

describe("the pieces underneath", () => {
  it("reads an override as no clock only when it names no positive interval", () => {
    assert.equal(isMuted(null), false);
    assert.equal(isMuted({ cadenceDays: 30 }), false);
    assert.equal(isMuted({ cadenceDays: null }), true);
    // A row exists because somebody wrote it deliberately, so a malformed one
    // reads as off rather than silently falling back to the duty. The write
    // path is what refuses a value that means neither.
    assert.equal(isMuted({ cadenceDays: 0 }), true);
    assert.equal(isMuted({}), true);
  });

  it("prefers the override, then the duty, then nothing", () => {
    assert.equal(intervalFor({ cadenceDays: 30 }, 7), 30);
    assert.equal(intervalFor(null, 7), 7);
    assert.equal(intervalFor({ cadenceDays: null }, 7), null);
    assert.equal(intervalFor(null, 0), null);
  });

  it("finds an override by the pair and ignores a tombstoned one", () => {
    const rows = [
      { id: "a", person: "p1", duty: "d1", cadenceDays: 30 },
      { id: "b", person: "p1", duty: "d2", cadenceDays: null },
      { id: "c", person: "p2", duty: "d1", cadenceDays: 5, _deleted: true }
    ];
    assert.equal(overrideFor(rows, "p1", "d1")?.id, "a");
    assert.equal(overrideFor(rows, "p2", "d1"), null);
    assert.equal(overrideFor(rows, "p1", "d9"), null);
    assert.deepEqual(mutedDuties(rows, "p1"), ["d2"]);
  });
});
