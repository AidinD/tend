/**
 * The roster carries the two numbers, not only the badge.
 *
 * "+3w" answers how late something is and hides the fact that matters more on
 * the page you open every morning: a cadence targeting a fortnight and actually
 * running at five weeks is not late once, it is mis-set. Both numbers are
 * already computed in `computeDrift` - the roster was dropping them, so every
 * caller that wanted them had to fetch the whole person back.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import * as api from "../src/service/api.js";
import { DAY_MS } from "../src/domain/time.js";
import { openStore } from "../src/storage/store.js";
import { ok } from "./helpers.mjs";

const NOW = Date.parse("2026-09-04T09:00:00Z");
/** @param {number} days */
const ago = (days) => NOW - days * DAY_MS;

describe("what a roster row says about drift", () => {
  /** @type {string} */
  let dir;
  /** @type {any} */
  let store;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "tend-roster-"));
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

  /** @param {number} days */
  const spokeDaysAgo = (days) => {
    const person = api.people(store, NOW)[0];
    ok(
      api.logTouch(store, {
        subject: String(person.id),
        kind: "one-to-one",
        at: ago(days),
        now: NOW
      })
    );
  };

  it("says both what the cadence targets and how long it has actually been", () => {
    spokeDaysAgo(35);

    const row = api.people(store, NOW)[0];
    assert.notEqual(row.worstDrift, null, "no drift on somebody 35 days past a fortnightly duty");
    assert.equal(row.worstDrift.targetDays, 14);
    assert.equal(row.worstDrift.sinceDays, 35);
  });

  it("and the badge alone could not have told you that", () => {
    /*
     * The argument for the change, as a test rather than a comment. Two people
     * can carry the same badge off completely different cadences, and the badge
     * is the same string for both - so a page built on it cannot say which
     * cadence is mis-set.
     */
    spokeDaysAgo(35);
    const fortnightly = api.people(store, NOW)[0];

    ok(
      api.addPerson(store, { name: "Bo", relation: "equal-lead", since: ago(400), now: ago(400) })
    );
    ok(
      api.proposeDuty(store, {
        name: "Catch up",
        means: "A looser conversation.",
        source: "test",
        subjectKind: "person",
        cadenceDays: 56,
        evidenceKinds: ["one-to-one"],
        relations: ["equal-lead"]
      })
    );
    for (const duty of store.rows("duties")) {
      if (duty.status !== "active") {
        ok(api.decideDuty(store, duty.id, "active"));
      }
    }
    const bo = api.people(store, NOW).find((/** @type {any} */ p) => p.name === "Bo");
    ok(
      api.logTouch(store, {
        subject: String(bo.id),
        kind: "one-to-one",
        at: ago(77),
        now: NOW
      })
    );

    const loose = api.people(store, NOW).find((/** @type {any} */ p) => p.name === "Bo");

    assert.equal(fortnightly.worstDrift.behindBy, loose.worstDrift.behindBy, "same badge");
    assert.notEqual(
      fortnightly.worstDrift.targetDays,
      loose.worstDrift.targetDays,
      "different cadence"
    );
  });

  it("distinguishes never having spoken from being overdue since last time", () => {
    /*
     * `sinceDays` counts from the relationship's start when nothing has
     * happened yet, which is right for the drift and wrong to render as "you
     * last spoke 400 days ago". So the row says which it is rather than leaving
     * the window to guess from the number.
     */
    const never = api.people(store, NOW)[0];
    assert.equal(never.worstDrift.everHappened, false);

    spokeDaysAgo(35);
    const spoken = api.people(store, NOW)[0];
    assert.equal(spoken.worstDrift.everHappened, true);
  });

  it("keeps the badge, because the views that read it are unchanged", () => {
    spokeDaysAgo(35);
    const row = api.people(store, NOW)[0];
    assert.equal(typeof row.worstDrift.behindBy, "string");
    assert.equal(row.worstDrift.urgency, "critical");
    assert.equal(row.worstDrift.duty, "1-1");
  });
});
