/**
 * Tests for stakeholders.
 *
 * The one that carries the design is "an update about one project does not
 * answer for another". Model a stakeholder as a relationship type on a person
 * and that test fails, which is precisely the failure worth preventing: a
 * quarter of silence about the thing somebody depends on, hidden behind a
 * fortnight of talk about something else.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import * as api from "../src/service/api.js";
import { expandCadences } from "../src/domain/attention.js";
import { DAY_MS } from "../src/domain/time.js";
import { DEFAULT_STAKE_DAYS, namedStakes, stakeInterval, stakeName } from "../src/domain/stakes.js";
import { seedRoleMap } from "../src/service/seed.js";
import { openStore } from "../src/storage/store.js";
import { ok, failed } from "./helpers.mjs";

const NOW = Date.parse("2026-08-25T09:00:00Z");
/** @param {number} days */
const ago = (days) => NOW - days * DAY_MS;

describe("naming a stake", () => {
  it("reads a stake off the rows as they are now, not off a stored label", () => {
    // Somebody was renamed today. A copied label would still show the old
    // spelling, which reads as a second person you have neglected.
    const people = new Map([["p1", "Rasmus"]]);
    const projects = new Map([["j1", "Sjöhästen"]]);
    assert.equal(stakeName({ person: "p1", project: "j1" }, people, projects), "Rasmus, about Sjöhästen");
  });

  it("drops a stake whose person or project is gone rather than showing a placeholder", () => {
    const stakes = [
      { id: "s1", person: "p1", project: "j1" },
      { id: "s2", person: "gone", project: "j1" },
      { id: "s3", person: "p1", project: "gone" }
    ];
    const named = namedStakes(stakes, [{ id: "p1", name: "Ada" }], [{ id: "j1", name: "Zeta" }]);
    assert.deepEqual(
      named.map((s) => s.id),
      ["s1"],
      "an item nobody can act on would sit on the page forever"
    );
  });

  it("takes the interval from the stake, falling back to the duty and then a month", () => {
    assert.equal(stakeInterval({ cadenceDays: 14 }, 30), 14);
    assert.equal(stakeInterval({}, 45), 45);
    assert.equal(stakeInterval({}, undefined), DEFAULT_STAKE_DAYS);
    assert.equal(stakeInterval({ cadenceDays: 0 }, 30), 30, "a nonsense value is not an override");
  });
});

describe("stakeholders through the store", () => {
  /** @type {string} */
  let dir;
  /** @type {import("../src/storage/store.js").TendStore} */
  let store;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "tend-stakes-"));
    store = openStore({ dataDir: dir, role: "app", host: "test" });
    seedRoleMap(store);
    for (const duty of store.rows("duties")) {
      ok(api.decideDuty(store, duty.id, "active"));
    }
    ok(api.addPerson(store, { name: "Nadia", relation: "stakeholder", now: ago(400) }));
    ok(api.addProject(store, { name: "Sjöhästen", since: ago(400), now: ago(400) }));
    ok(api.addProject(store, { name: "Meta", since: ago(400), now: ago(400) }));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** @param {string} project */
  const stakeOn = (project) => {
    // Backdated, because the interesting cases are all about somebody who has
    // been waiting. A stake created now is correctly not overdue yet.
    const added = ok(api.addStake(store, { person: "Nadia", project, cadenceDays: 30, since: ago(200) }));
    return String(added.id);
  };

  it("a stakeholder relationship inherits none of the duties written for reports", () => {
    // The reason a stakeholder needs its own relationship type at all: forced to
    // pick one of the existing five, the COO would start owing 1-1s.
    const theirs = expandCadences(store.state(), NOW).filter(
      (c) => c.subjectKind === "person" && c.subject.name === "Nadia"
    );
    assert.deepEqual(theirs, [], "a stakeholder is not somebody you lead");
  });

  it("an update about one project does not answer for another", () => {
    const sjohasten = stakeOn("Sjöhästen");
    const meta = stakeOn("Meta");

    ok(api.logTouch(store, { subject: sjohasten, kind: "update", note: "on track", now: NOW }));

    const drifts = new Map(
      expandCadences(store.state(), NOW)
        .filter((c) => c.subjectKind === "stake")
        .map((c) => [String(c.subject.id), c.drift])
    );

    assert.equal(drifts.get(sjohasten)?.everHappened, true);
    assert.equal(drifts.get(meta)?.everHappened, false, "Meta was never mentioned and must still be waiting");
    assert.ok(
      Number(drifts.get(meta)?.driftDays) > Number(drifts.get(sjohasten)?.driftDays),
      "the project nobody heard about should be the one that surfaces"
    );
  });

  it("takes its interval from the stake rather than from the duty", () => {
    const quarterly = ok(api.addStake(store, { person: "Nadia", project: "Meta", cadenceDays: 90, since: ago(200) }));
    const monthly = stakeOn("Sjöhästen");

    const byId = new Map(
      expandCadences(store.state(), NOW)
        .filter((c) => c.subjectKind === "stake")
        .map((c) => [String(c.subject.id), c.drift.interval])
    );
    assert.equal(byId.get(String(quarterly.id)), 90);
    assert.equal(byId.get(monthly), 30);
  });

  it("refuses a second stake for the same pair rather than making two clocks", () => {
    stakeOn("Sjöhästen");
    const why = failed(api.addStake(store, { person: "Nadia", project: "Sjöhästen" }));
    assert.match(why, /already a stakeholder/);
  });

  it("refuses an interval that is not a positive number of days", () => {
    assert.match(failed(api.addStake(store, { person: "Nadia", project: "Meta", cadenceDays: 0 })), /positive/);
  });

  it("says who is waiting and how long, in words rather than a bare count", () => {
    const sjohasten = stakeOn("Sjöhästen");
    ok(api.logTouch(store, { subject: sjohasten, kind: "update", note: "shipped the import", now: NOW }));
    stakeOn("Meta");

    const list = api.stakeholders(store, NOW);
    assert.ok(Array.isArray(list));
    const byProject = new Map(list.map((s) => [s.project, s]));

    assert.equal(byProject.get("Sjöhästen")?.lastUpdated, "today");
    assert.equal(byProject.get("Sjöhästen")?.note, "shipped the import");
    assert.equal(byProject.get("Meta")?.lastUpdated, "never", "never is not the same fact as zero days ago");
    assert.equal(byProject.get("Meta")?.label, "Nadia, about Meta");
  });

  it("narrows to one project when asked", () => {
    stakeOn("Sjöhästen");
    stakeOn("Meta");
    const only = api.stakeholders(store, NOW, "Sjöhästen");
    assert.ok(Array.isArray(only));
    assert.deepEqual(
      only.map((s) => s.project),
      ["Sjöhästen"]
    );
  });

  it("refuses an update aimed at the project instead of the pair", () => {
    stakeOn("Sjöhästen");
    // "update" is about a stake, so a project id cannot carry one - otherwise it
    // would be ambiguous which stakeholder had been told.
    const why = failed(api.logTouch(store, { subject: "Sjöhästen", kind: "update", now: NOW }));
    assert.match(why, /stake/);
  });

  it("changes how often somebody hears from you", () => {
    const id = stakeOn("Sjöhästen");
    ok(api.updateStake(store, id, { cadenceDays: 14 }));
    const list = /** @type {any[]} */ (api.stakeholders(store, NOW));
    assert.equal(list[0].every, "14 days");
  });

  it("refuses an edit that changes nothing, rather than writing an empty event", () => {
    const id = stakeOn("Sjöhästen");
    assert.match(failed(api.updateStake(store, id, {})), /Nothing to change/);
  });

  it("surfaces the stakeholder nobody has updated, once the duty is active", () => {
    stakeOn("Sjöhästen");
    const items = api.attention(store, NOW).needsYou ?? [];
    const mine = items.find((/** @type {any} */ i) => /Nadia, about Sjöhästen/.test(String(i.what)));
    assert.ok(mine, `no stakeholder item: ${items.map((/** @type {any} */ i) => i.what).join(" | ")}`);
    assert.equal(mine.subjectKind, "stake", "the card has to know what it is about to offer the right action");
  });
});
