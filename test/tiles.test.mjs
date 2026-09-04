/**
 * Every tile phrase is decided by rule, and every state has one.
 *
 * The front page is mostly tiles, so an unhandled state is not a cosmetic gap -
 * it is a blank tile about a named colleague on the page opened every morning.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { ADRIFT_MULTIPLE, TILE_KINDS, tileOf, tileWeight } from "../src/domain/tiles.js";

/** @param {object} over */
const row = (over = {}) => ({ id: "p1", name: "Ada", relation: "lead-and-manage", ...over });

/** @param {object} over */
const drift = (over = {}) => ({
  duty: "1-1",
  behindBy: "+3w",
  urgency: "critical",
  targetDays: 14,
  sinceDays: 35,
  everHappened: true,
  ...over
});

test("a tile says one thing, chosen by rule", async (t) => {
  await t.test("nothing is expected of you while somebody is away", () => {
    /*
     * Availability wins over drift, and it has to: the clock accrues while
     * somebody is on parental leave, so printing the drift would be the app
     * crying wolf about a person who is not there.
     */
    assert.equal(tileOf(row({ availability: "away", worstDrift: drift() })).kind, "away");
    assert.equal(tileOf(row({ availability: "left", worstDrift: drift() })).kind, "left");
  });

  await t.test("but somebody working out their notice stays live", () => {
    /*
     * `leaving` is not `left`. A promise to somebody leaving next week is
     * exactly the promise to keep, so the tile has to stay on the page and say
     * why it is different rather than going quiet.
     */
    const tile = tileOf(row({ availability: "leaving", worstDrift: drift() }));
    assert.equal(tile.kind, "leaving");
    assert.notEqual(tile.kind, "left");
  });

  await t.test("no duty applying is its own answer, not an empty one", () => {
    assert.equal(tileOf(row({ worstDrift: null })).kind, "noDuty");
    assert.equal(tileOf(row({})).kind, "noDuty");
  });

  await t.test("never having spoken is not a very large lateness", () => {
    /*
     * `sinceDays` counts from the relationship's start when nothing has
     * happened, so rendering it as "400 days since your last 1-1" would be a
     * sentence about a conversation that never took place.
     */
    const tile = tileOf(row({ worstDrift: drift({ everHappened: false, sinceDays: 400 }) }));
    assert.equal(tile.kind, "neverYet");
    assert.equal(tile.kind === "neverYet" && tile.days, 400);
  });

  await t.test("late and adrift are different facts, which is the point", () => {
    /*
     * The reason the screen is worth building. Both of these badged "+3w"
     * before today, and one is a cancelled meeting while the other is a cadence
     * nobody is keeping.
     */
    const late = tileOf(row({ worstDrift: drift({ targetDays: 14, sinceDays: 17 }) }));
    assert.equal(late.kind, "late");

    const adrift = tileOf(row({ worstDrift: drift({ targetDays: 14, sinceDays: 35 }) }));
    assert.equal(adrift.kind, "adrift");
  });

  await t.test("and the boundary is exactly twice the interval", () => {
    /*
     * Asserted at the edge rather than near it, because "roughly double" is not
     * a rule somebody can reproduce when they wonder why a tile changed.
     */
    assert.equal(tileOf(row({ worstDrift: drift({ targetDays: 14, sinceDays: 27 }) })).kind, "late");
    assert.equal(
      tileOf(row({ worstDrift: drift({ targetDays: 14, sinceDays: 28 }) })).kind,
      "adrift"
    );
    assert.equal(ADRIFT_MULTIPLE, 2);
  });

  await t.test("in step says so, rather than saying nothing", () => {
    assert.equal(tileOf(row({ worstDrift: drift({ targetDays: 14, sinceDays: 14 }) })).kind, "inStep");
    assert.equal(tileOf(row({ worstDrift: drift({ targetDays: 14, sinceDays: 3 }) })).kind, "inStep");
  });

  await t.test("every kind it can return is declared", () => {
    /*
     * The guard that makes TILE_KINDS worth having. A kind added to the
     * function and not to the list is a phrase the renderer was never asked to
     * handle, which renders as nothing.
     */
    const seen = new Set(
      [
        row({ availability: "away" }),
        row({ availability: "leaving" }),
        row({ availability: "left" }),
        row({ worstDrift: null }),
        row({ worstDrift: drift({ everHappened: false }) }),
        row({ worstDrift: drift({ targetDays: 14, sinceDays: 35 }) }),
        row({ worstDrift: drift({ targetDays: 14, sinceDays: 17 }) }),
        row({ worstDrift: drift({ targetDays: 14, sinceDays: 2 }) })
      ].map((r) => tileOf(r).kind)
    );

    assert.equal(seen.size, TILE_KINDS.length, `reached ${seen.size} of ${TILE_KINDS.length} kinds`);
    for (const kind of TILE_KINDS) {
      assert.ok(seen.has(kind), `${kind} is declared but nothing produces it`);
    }
  });

  await t.test("what is being asked of you sorts above what is not", () => {
    /*
     * Deliberately not the drift's own severity. `away` and `noDuty` are quiet
     * because nothing is expected, not because everything is fine, and they
     * must not sort above a cadence nobody is keeping.
     */
    const weights = TILE_KINDS.map((kind) => ({
      kind,
      weight: tileWeight(/** @type {any} */ ({ kind }))
    }));

    const asking = weights.filter((w) => ["adrift", "neverYet", "late"].includes(w.kind));
    const quiet = weights.filter((w) => ["away", "leaving", "left", "noDuty"].includes(w.kind));

    for (const a of asking) {
      for (const q of quiet) {
        assert.ok(a.weight > q.weight, `${a.kind} must outrank ${q.kind}`);
      }
    }
    assert.ok(
      tileWeight(/** @type {any} */ ({ kind: "adrift" })) >
        tileWeight(/** @type {any} */ ({ kind: "late" })),
      "a cadence nobody keeps outranks one conversation being late"
    );
    assert.ok(
      tileWeight(/** @type {any} */ ({ kind: "inStep" })) >
        tileWeight(/** @type {any} */ ({ kind: "noDuty" })),
      "in step is a fact about a duty; no duty is the absence of one"
    );
  });
});
