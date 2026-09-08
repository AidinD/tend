/**
 * What a focus has actually cost.
 *
 * One test here is the whole reason the file exists, and it is the third one:
 * adding a person AFTER a focus was set must not move what the focus is said to
 * have cost. On the real board it moved it from 0.1 to 50.9 days, and the
 * summary read that as "the price so far".
 *
 * The drift was not the fault. Somebody entered with a relation that started a
 * year ago and no contact since is genuinely a year behind, and backdating is
 * deliberate - `addStake` writes out why in plain words. The fault was
 * subtracting a mean taken over one population from a mean taken over another
 * and calling the difference a price.
 *
 * Driven through the store rather than by handing `focusCost` numbers, because
 * the numbers were never the part that was wrong.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import * as api from "../src/service/api.js";
import { driftMeasure, existingAt, expandCadences } from "../src/domain/attention.js";
import { openStore } from "../src/storage/store.js";
import { DAY_MS } from "../src/domain/time.js";
import { ok } from "./helpers.mjs";

const NOW = 1_800_000_000_000;
/** @param {number} n */
const daysAgo = (n) => NOW - n * DAY_MS;

/** @type {string} */
let dir;
/** @type {import("../src/storage/store.js").TendStore} */
let store;
/** Time advances by one tick per write, so `_at` orders the rows. */
let clock = NOW - 1_000_000;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tend-focuscost-"));
  clock = NOW - 1_000_000;
  store = openStore({ dataDir: dir, role: "app", host: "test", now: () => clock });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** A soft duty on peers, so a focus is allowed to dampen it. */
function sidewaysDuty() {
  const made = ok(
    api.proposeDuty(store, {
      name: "Sidledeskontakt",
      means: "Samordning utan mandat bakom sig",
      source: "test",
      subjectKind: "person",
      cadenceDays: 7,
      evidenceKinds: ["sideways"],
      relations: ["equal-lead"]
    })
  );
  ok(api.decideDuty(store, String(made.id), "active"));
  return String(made.id);
}

/** @param {string} name @param {number} since */
function peer(name, since) {
  return ok(api.addPerson(store, { name, relation: "equal-lead", since, now: clock }));
}

describe("a focus reports what it cost, or says it cannot", () => {
  it("states a price while the population it measured is intact", () => {
    sidewaysDuty();
    peer("Testkollega ett", daysAgo(30));
    clock += 1000;

    const set = ok(api.setFocus(store, { name: "Få Skiffet i sjön", now: clock }));
    assert.equal(typeof set.baselineCount, "number", "the baseline count was not stored");

    const focus = ok(api.attention(store, NOW)).focus;
    assert.ok(focus, "no focus is running, so this proved nothing");
    assert.equal(focus.costKnown, true, focus.cost);
  });

  it("says nothing has fallen further behind when nothing has", () => {
    sidewaysDuty();
    peer("Testkollega ett", daysAgo(8));
    clock += 1000;
    ok(api.setFocus(store, { name: "Få Skiffet i sjön", now: clock }));

    const focus = ok(api.attention(store, clock)).focus;
    assert.ok(focus, "no focus is running, so this proved nothing");
    assert.equal(focus.costKnown, true);
    assert.match(focus.cost, /Inget har hamnat längre efter/);
  });

  it("refuses to call a newly added person's backlog the focus's price", () => {
    /*
     * The reported case, reproduced. A peer entered after the focus was set,
     * with a relation that started a year ago and no contact since, carries
     * about 358 days of entirely real drift - and the focus caused none of it.
     */
    sidewaysDuty();
    peer("Testkollega ett", daysAgo(8));
    clock += 1000;

    ok(api.setFocus(store, { name: "Få Skiffet i sjön", now: clock }));
    const before = ok(api.attention(store, clock)).focus;
    assert.ok(before, "no focus is running, so this proved nothing");
    assert.equal(before.costKnown, true, "there was no price to move, so this proves nothing");

    clock += 1000;
    peer("Testkollega två", daysAgo(365));

    const after = ok(api.attention(store, clock)).focus;
    assert.ok(after, "the focus disappeared when a person was added");
    assert.equal(
      after.costKnown,
      true,
      `adding a person made the cost unstatable: ${after.cost}`
    );
    assert.equal(
      Number(after.costDays.toFixed(2)),
      Number(before.costDays.toFixed(2)),
      `adding a person moved the reported price: ${after.cost}`
    );
  });

  it("and the drift it excluded is still reported as drift", () => {
    /*
     * The other half, and the one it would be easy to break while fixing the
     * first: leaving the newcomer out of the COST must not leave them out of
     * the tool. A year of neglect is real and the roster has to say so.
     */
    sidewaysDuty();
    peer("Testkollega ett", daysAgo(8));
    clock += 1000;
    ok(api.setFocus(store, { name: "Få Skiffet i sjön", now: clock }));
    clock += 1000;
    const late = peer("Testkollega två", daysAgo(365));

    const row = api.people(store, clock).find((/** @type {any} */ p) => p.id === late.id);
    assert.ok(row?.worstDrift, "the newcomer has no drift at all");
    assert.equal(row.worstDrift.urgency, "critical");
    assert.ok(
      row.worstDrift.sinceDays > 300,
      `the newcomer's age was flattened to ${row.worstDrift.sinceDays} days`
    );
  });

  it("refuses a price once something has left the population instead", () => {
    /*
     * The direction the subject-age filter cannot handle on its own. Archiving
     * somebody shrinks the set the baseline was taken over, so the two means
     * describe different things again - and the honest answer is that it cannot
     * be said, not a smaller number.
     */
    sidewaysDuty();
    const one = peer("Testkollega ett", daysAgo(8));
    peer("Testkollega två", daysAgo(9));
    clock += 1000;
    ok(api.setFocus(store, { name: "Få Skiffet i sjön", now: clock }));
    clock += 1000;

    ok(api.archivePerson(store, String(one.id), { now: clock }));

    const focus = ok(api.attention(store, clock)).focus;
    assert.ok(focus, "no focus is running, so this proved nothing");
    assert.equal(focus.costKnown, false, `a price was still reported: ${focus.cost}`);
    assert.match(focus.cost, /fallit bort/);
  });

  it("counts a duty accepted after the focus as new, not as a subject that aged", () => {
    /*
     * The half that is easy to forget. A cadence is a duty crossed with a
     * subject, so a duty accepted after the focus started produces brand new
     * cadences on people who have been on the roster for a year. Filtering only
     * on the subject would have let those straight into the cost.
     */
    sidewaysDuty();
    peer("Testkollega ett", daysAgo(8));
    clock += 1000;
    ok(api.setFocus(store, { name: "Få Skiffet i sjön", now: clock }));
    const started = clock;
    clock += 1000;

    const late = ok(
      api.proposeDuty(store, {
        name: "Andra sidledesplikten",
        means: "En till som korsar samma personer",
        source: "test",
        subjectKind: "person",
        cadenceDays: 7,
        evidenceKinds: ["sideways"],
        relations: ["equal-lead"]
      })
    );
    ok(api.decideDuty(store, String(late.id), "active"));

    const all = expandCadences(store.state(), clock);
    const comparable = existingAt(all, started);
    assert.ok(all.length > comparable.length, "the new duty produced no new cadence");
    assert.equal(
      driftMeasure(comparable).count,
      1,
      "a duty accepted after the focus was counted into the baseline population"
    );
  });
});
