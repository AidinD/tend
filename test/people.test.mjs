/**
 * Tests for somebody being away or gone.
 *
 * Both exist to stop the app producing a red item that is not true and cannot be
 * cleared. Somebody on parental leave has not been neglected, and somebody who
 * left cannot be talked to - but the drift accrues either way unless the clock
 * is told to stop, and a page that cries wolf every week is a page nobody reads
 * the real items on.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import * as api from "../src/service/api.js";
import { expandCadences } from "../src/domain/attention.js";
import { myAttention } from "../src/domain/myattention.js";
import {
  appliesWhileLeaving,
  availability,
  hasLeft,
  inScope,
  isAway,
  isLeaving,
  notBefore
} from "../src/domain/people.js";
import { DAY_MS } from "../src/domain/time.js";
import { openStore } from "../src/storage/store.js";
import { ok, failed } from "./helpers.mjs";

const NOW = Date.parse("2026-08-25T09:00:00Z");
/** @param {number} days */
const ago = (days) => NOW - days * DAY_MS;
/** @param {number} days */
const ahead = (days) => NOW + days * DAY_MS;

describe("reading somebody's availability", () => {
  it("is away only while the return date is still ahead", () => {
    assert.equal(isAway({ awayUntil: ahead(30) }, NOW), true);
    assert.equal(isAway({ awayUntil: ago(1) }, NOW), false, "a date in the past expires by itself");
    assert.equal(isAway({}, NOW), false);
  });

  it("has left only once the last day has passed", () => {
    assert.equal(hasLeft({ leftAt: ago(1) }, NOW), true);
    assert.equal(hasLeft({ leftAt: ahead(7) }, NOW), false, "next week is still this week's problem");
    assert.equal(isLeaving({ leftAt: ahead(7) }), true, "but the roster should say so");
  });

  it("names what is going on, or nothing at all", () => {
    assert.equal(availability({ leftAt: ago(1) }, NOW), "left");
    assert.equal(availability({ leftAt: ahead(7) }, NOW), "leaving");
    assert.equal(availability({ awayUntil: ahead(7) }, NOW), "away");
    assert.equal(availability({}, NOW), null);
  });

  it("counts nothing older than a return", () => {
    // The whole point: back on Monday after six months means the interval starts
    // on Monday, not six months ago.
    assert.equal(notBefore({ awayUntil: ago(3) }, NOW), ago(3));
    assert.equal(notBefore({ awayUntil: ahead(3) }, NOW), 0, "still away, so nothing applies yet");
    assert.equal(notBefore({}, NOW), 0);
  });

  it("treats a cleared date as no date, not as 1970", () => {
    // Number(null) is 0, and 0 is a finite instant in the past. Clearing a last
    // day therefore reported somebody as having left decades ago: cadences
    // gone, promises silent, roster labelled them departed. The unit tests
    // missed it because they passed {} rather than an explicit null - the shape
    // the form actually sends.
    assert.equal(hasLeft({ leftAt: null }, NOW), false);
    assert.equal(isLeaving({ leftAt: null }), false);
    assert.equal(isAway({ awayUntil: null }, NOW), false);
    assert.equal(notBefore({ awayUntil: null }, NOW), 0);
    assert.equal(availability({ leftAt: null, awayUntil: null }, NOW), null);
    assert.equal(inScope({ leftAt: null, awayUntil: null }, NOW), true);
  });

  it("ignores a date that arrived as a string", () => {
    assert.equal(hasLeft({ leftAt: /** @type {any} */ ("2020-01-01") }, NOW), false);
  });

  it("is in scope unless away or gone", () => {
    assert.equal(inScope({}, NOW), true);
    assert.equal(inScope({ awayUntil: ahead(1) }, NOW), false);
    assert.equal(inScope({ leftAt: ago(1) }, NOW), false);
    assert.equal(inScope({ leftAt: ahead(1) }, NOW), true, "still here until the day arrives");
  });
});

describe("through the store", () => {
  /** @type {string} */
  let dir;
  /** @type {import("../src/storage/store.js").TendStore} */
  let store;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "tend-people-"));
    store = openStore({ dataDir: dir, role: "app", host: "test" });
    ok(api.addPerson(store, { name: "Ada", relation: "manage-remotely", since: ago(400), now: ago(400) }));
    ok(api.addPerson(store, { name: "Bo", relation: "manage-remotely", since: ago(400), now: ago(400) }));
    ok(
      api.proposeDuty(store, {
        name: "1-1",
        means: "A recurring conversation.",
        source: "test",
        subjectKind: "person",
        cadenceDays: 14,
        evidenceKinds: ["one-to-one"],
        relations: ["manage-remotely"]
      })
    );
    for (const duty of store.rows("duties")) {
      ok(api.decideDuty(store, duty.id, "active"));
    }
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** @param {number} now */
  const behind = (now) =>
    expandCadences(store.state(), now)
      .filter((c) => c.subjectKind === "person")
      .map((c) => String(c.subject.name));

  it("suspends every cadence while somebody is away", () => {
    assert.deepEqual(behind(NOW).sort(), ["Ada", "Bo"]);
    ok(api.updatePerson(store, "Ada", { awayUntil: ahead(60) }));
    assert.deepEqual(behind(NOW), ["Bo"]);
  });

  it("restarts the clock from their return, not from the last conversation", () => {
    ok(api.logTouch(store, { subject: "Ada", kind: "one-to-one", at: ago(300), now: NOW }));
    ok(api.updatePerson(store, "Ada", { awayUntil: ago(2) }));

    const ada = expandCadences(store.state(), NOW).find((c) => c.subject.name === "Ada");
    assert.ok(ada);
    assert.equal(ada.drift.daysSince, 2, "two days back, not three hundred");
    assert.equal(ada.drift.severity, "ok", "nobody is behind on their first morning back");
  });

  it("does not pretend the return was a conversation", () => {
    // Back eight weeks ago with a fortnightly cadence: genuinely behind now.
    ok(api.updatePerson(store, "Ada", { awayUntil: ago(56) }));
    const ada = expandCadences(store.state(), NOW).find((c) => c.subject.name === "Ada");
    assert.equal(ada?.drift.daysSince, 56);
    assert.equal(ada?.drift.severity, "critical");
  });

  it("keeps a duty for a leaver unless it has been turned off", () => {
    // His example: he will keep having 1-1s with somebody working out their
    // notice, and will not send out a peer review round for them. Both are
    // reasonable, which is why it is a choice per duty and not a rule.
    ok(api.updatePerson(store, "Ada", { leftAt: ahead(60) }));
    assert.ok(behind(NOW).includes("Ada"), "a duty nobody has revisited keeps applying");

    const oneToOne = store.rows("duties")[0];
    ok(api.updateDuty(store, String(oneToOne.id), { keepWhileLeaving: false }));
    assert.equal(behind(NOW).includes("Ada"), false);
    assert.ok(behind(NOW).includes("Bo"), "and it still applies to everybody else");
  });

  it("reads a duty nobody has revisited as still applying", () => {
    assert.equal(appliesWhileLeaving({}), true, "absent must not silently mean off");
    assert.equal(appliesWhileLeaving({ keepWhileLeaving: false }), false);
    assert.equal(appliesWhileLeaving({ keepWhileLeaving: true }), true);
  });

  it("holds somebody to everything until their last day passes", () => {
    ok(api.updatePerson(store, "Ada", { leftAt: ahead(7) }));
    assert.ok(behind(NOW).includes("Ada"), "a week left is a week of 1-1s still owed");

    const after = NOW + 8 * DAY_MS;
    assert.equal(behind(after).includes("Ada"), false);
  });

  it("keeps the whole history of somebody who left", () => {
    ok(api.logTouch(store, { subject: "Ada", kind: "one-to-one", at: ago(30), now: NOW }));
    ok(api.updatePerson(store, "Ada", { leftAt: ago(1) }));

    const view = api.person(store, "Ada", NOW);
    assert.ok(!("error" in view));
    assert.equal(view.recentContact?.length, 1, "the record is the reason not to delete them");
    assert.equal(view.availability, "left");
  });

  it("stops surfacing a promise to somebody who has gone, without discarding it", () => {
    ok(api.logPromise(store, { person: "Ada", text: "Send the numbers", madeAt: ago(40), now: NOW }));
    const before = api.attention(store, NOW).needsYou ?? [];
    assert.ok(before.some((/** @type {any} */ i) => /Ada an answer/.test(String(i.what))));

    ok(api.updatePerson(store, "Ada", { leftAt: ago(1) }));
    const after = api.attention(store, NOW).needsYou ?? [];
    assert.equal(
      after.some((/** @type {any} */ i) => /Ada an answer/.test(String(i.what))),
      false
    );
    assert.equal(store.rows("promises").length, 1, "the promise itself is untouched");
  });

  it("does not count somebody away as somebody neglected", () => {
    ok(api.updatePerson(store, "Ada", { awayUntil: ahead(60) }));
    const signals = myAttention({
      people: /** @type {any[]} */ (store.rows("people")),
      touches: /** @type {any[]} */ (store.rows("touches")),
      now: NOW
    });
    const unheard = signals.find((s) => s.key === "i-have-not-spoken-to");
    // One person left in scope, and a single-person roster is not a pattern.
    assert.equal(unheard, undefined);
  });

  it("lets a return be brought forward, or a resignation withdrawn", () => {
    ok(api.updatePerson(store, "Ada", { awayUntil: ahead(60) }));
    assert.equal(behind(NOW).includes("Ada"), false);
    ok(api.updatePerson(store, "Ada", { awayUntil: null }));
    assert.ok(behind(NOW).includes("Ada"), "clearing the date has to be sayable");
  });

  it("refuses a date that is not a date", () => {
    assert.match(
      failed(api.updatePerson(store, "Ada", { awayUntil: /** @type {any} */ ("soon") })),
      /must be a date/
    );
  });
});

describe("taking back a mislogged contact", () => {
  /** @type {string} */
  let dir;
  /** @type {import("../src/storage/store.js").TendStore} */
  let store;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "tend-unlog-"));
    store = openStore({ dataDir: dir, role: "app", host: "test" });
    ok(api.addPerson(store, { name: "Ada", relation: "manage-remotely", since: ago(400), now: ago(400) }));
    ok(
      api.proposeDuty(store, {
        name: "1-1",
        means: "A recurring conversation.",
        source: "test",
        subjectKind: "person",
        cadenceDays: 14,
        evidenceKinds: ["one-to-one"],
        relations: ["manage-remotely"]
      })
    );
    for (const duty of store.rows("duties")) {
      ok(api.decideDuty(store, duty.id, "active"));
    }
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("puts the cadence back where it was", () => {
    // A wrong entry is worse than a missing one: it moves a clock and then looks
    // exactly like a real one. There was no way to undo it at all.
    const logged = ok(api.logTouch(store, { subject: "Ada", kind: "one-to-one", now: NOW }));
    const satisfied = expandCadences(store.state(), NOW).find((c) => c.subject.name === "Ada");
    assert.equal(satisfied?.drift.everHappened, true);

    const gone = ok(api.removeRow(store, "touches", String(logged.id)));
    assert.match(String(gone.removed), /one-to-one/);

    const again = expandCadences(store.state(), NOW).find((c) => c.subject.name === "Ada");
    assert.equal(again?.drift.everHappened, false);
  });

  it("says what it removed, for a row with no name and no text", () => {
    const logged = ok(api.logTouch(store, { subject: "Ada", kind: "casual", note: "corridor", now: NOW }));
    const gone = ok(api.removeRow(store, "touches", String(logged.id)));
    assert.match(String(gone.removed), /casual - corridor/);
  });

  it("can remove the rows whose buttons used to do nothing", () => {
    ok(api.addProject(store, { name: "Zeta", now: NOW }));
    const stake = ok(api.addStake(store, { person: "Ada", project: "Zeta" }));
    const topic = ok(
      api.proposeTopic(store, { text: "t", why: "w", cadenceDays: 30, relations: ["own-manager"] })
    );
    ok(api.removeRow(store, "stakes", String(stake.id)));
    ok(api.removeRow(store, "topics", String(topic.id)));
  });

  it("still refuses a collection that is not a list of removable things", () => {
    const why = failed(api.removeRow(store, "signalAnswers", "whatever"));
    assert.match(why, /Removable:/);
  });
});
