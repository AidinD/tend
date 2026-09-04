/**
 * Every tile phrase is decided by rule, one closed set per cluster.
 *
 * The front page is mostly tiles, so an unhandled state is not a cosmetic gap -
 * it is a blank tile about a named colleague on the page opened every morning.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  TILE_KINDS,
  TILE_SETS,
  UNREACHABLE_KINDS,
  tileOf,
  tileWeight
} from "../src/domain/tiles.js";
import { RELATION_GROUPS } from "../src/domain/cadence.js";

/** @param {object} over */
const row = (over = {}) => ({ id: "p1", name: "Ada", ...over });

/** @param {object} over */
const drift = (over = {}) => ({
  duty: "1-1",
  urgency: "warn",
  targetDays: 14,
  sinceDays: 20,
  everHappened: true,
  ...over
});

test("the sets and the clusters agree", async (t) => {
  await t.test("there is a set for every cluster and no set without one", () => {
    /*
     * The failure this guards is the same one `RELATION_GROUPS` guards: a
     * cluster with no set renders tiles that speak no vocabulary, and a set
     * with no cluster is a vocabulary nothing can reach.
     */
    assert.deepEqual(Object.keys(TILE_SETS).sort(), Object.keys(RELATION_GROUPS).sort());
  });

  await t.test("this check found the sets at all", () => {
    assert.ok(Object.keys(TILE_SETS).length >= 4, "fewer than four sets");
    assert.ok(TILE_KINDS.length >= 12, `only ${TILE_KINDS.length} kinds across all sets`);
  });

  await t.test("no set is empty, and each is small enough to be a vocabulary", () => {
    for (const [cluster, set] of Object.entries(TILE_SETS)) {
      assert.ok(set.length >= 3, `${cluster} has only ${set.length} phrases`);
      /*
       * Eight is the largest set in the brief. A set past that has stopped
       * being a vocabulary and become a list of cases, which is the point at
       * which the phrases stop being derivable.
       */
      assert.ok(set.length <= 8, `${cluster} has grown to ${set.length} phrases`);
    }
  });
});

test("a mandate tile says where development stands", async (t) => {
  await t.test("nothing is expected while somebody is away", () => {
    assert.equal(tileOf(row({ availability: "away", worstDrift: drift() }), "mandate").kind, "away");
  });

  await t.test("but a leaver stays in the grid rather than going quiet", () => {
    /*
     * Drops out when the last day has passed, not when they announce. A promise
     * to somebody leaving next week is exactly the promise to keep, and taking
     * the tile away at resignation is the app deciding they stopped mattering.
     */
    assert.equal(tileOf(row({ availability: "leaving" }), "mandate").kind, "leaving");
  });

  await t.test("a critical cadence outranks any development state", () => {
    const tile = tileOf(
      row({
        worstDrift: drift({ urgency: "critical" }),
        direction: { status: "open", stance: "agreed", observations: 3 }
      }),
      "mandate"
    );
    assert.equal(tile.kind, "needsYou");
  });

  await t.test("no direction open is its own answer, not an empty tile", () => {
    assert.equal(tileOf(row({ direction: null }), "mandate").kind, "noDirection");
    assert.equal(tileOf(row({}), "mandate").kind, "noDirection");
  });

  await t.test("untested is about the stance, not the age", () => {
    /*
     * A direction he has not put to them is untested however long it has been
     * open, and one they agreed to is tested even if nothing has been seen.
     */
    assert.equal(
      tileOf(row({ direction: { status: "open", stance: "unasked", observations: 0 } }), "mandate")
        .kind,
      "directionUntested"
    );
    assert.equal(
      tileOf(row({ direction: { status: "open", stance: "agreed", observations: 0 } }), "mandate")
        .kind,
      "directionShowing"
    );
  });

  await t.test("and something actually seen says so", () => {
    assert.equal(
      tileOf(row({ direction: { status: "open", stance: "unasked", observations: 2 } }), "mandate")
        .kind,
      "directionShowing"
    );
  });
});

test("the other three sets answer their own question", async (t) => {
  await t.test("no channel is about whether feedback is reaching them", () => {
    assert.equal(
      tileOf(row({ worstDrift: drift({ everHappened: false }) }), "noChannel").kind,
      "neverSpoken"
    );
    assert.equal(
      tileOf(row({ worstDrift: drift({ sinceDays: 40, targetDays: 28 }) }), "noChannel").kind,
      "feedbackOverdue"
    );
    assert.equal(
      tileOf(row({ worstDrift: drift({ sinceDays: 10, targetDays: 28 }) }), "noChannel").kind,
      "inStep"
    );
  });

  await t.test("a peer gets a number, because there is no duty behind it", () => {
    /*
     * The only set that counts days. "Over" without a count says nothing about
     * a relationship that rests entirely on goodwill.
     */
    const tile = tileOf(row({ worstDrift: drift({ sinceDays: 20, targetDays: 7 }) }), "peers");
    assert.equal(tile.kind, "daysOver");
    assert.equal(tile.days, 13);
  });

  await t.test("upward and outward is entirely about what you owe", () => {
    assert.equal(tileOf(row({ promisesOwed: 2 }), "outward").kind, "promisesOwed");
    assert.equal(tileOf(row({ promisesOwed: 2 }), "outward").count, 2);
    assert.equal(tileOf(row({ promisesOwed: 0, hasQuestion: true }), "outward").kind, "questionToAsk");
    assert.equal(
      tileOf(row({ update: { overdue: true } }), "outward").kind,
      "updateOverdue"
    );
    assert.equal(tileOf(row({ update: { overdue: false } }), "outward").kind, "updatedRecently");
  });

  await t.test("every set answers for somebody who is away", () => {
    /*
     * Two of the four had no phrase for it, so a stakeholder on parental leave
     * read as "Updated recently" and somebody whose work he sees read as "In
     * step". Both true in the narrow sense and both useless: nothing is
     * expected of you either way, and the tile said the opposite.
     *
     * Asserted across every cluster rather than in the two that were fixed,
     * because the next set added will have the same gap available to it.
     */
    for (const cluster of Object.keys(TILE_SETS)) {
      assert.equal(
        tileOf(row({ availability: "away", worstDrift: drift() }), cluster).kind,
        "away",
        `${cluster} does not answer for somebody who is away`
      );
    }
  });

  await t.test("an owed promise outranks a question, because somebody is waiting", () => {
    const tile = tileOf(row({ promisesOwed: 1, hasQuestion: true }), "outward");
    assert.equal(tile.kind, "promisesOwed");
  });
});

test("every declared phrase is reachable, or declared unreachable", async (t) => {
  /**
   * One row per kind, so the whole vocabulary is exercised from real inputs
   * rather than asserted against itself.
   *
   * @type {[string, string, object][]}
   */
  const cases = [
    ["mandate", "away", { availability: "away" }],
    ["mandate", "leaving", { availability: "leaving" }],
    ["mandate", "needsYou", { worstDrift: drift({ urgency: "critical" }) }],
    ["mandate", "noDirection", {}],
    [
      "mandate",
      "directionUntested",
      { direction: { status: "open", stance: "unasked", observations: 0 } }
    ],
    [
      "mandate",
      "directionShowing",
      { direction: { status: "open", stance: "agreed", observations: 1 } }
    ],
    ["mandate", "planNotStarted", { plan: { started: false } }],
    ["mandate", "planRunning", { plan: { started: true } }],
    ["noChannel", "away", { availability: "away" }],
    ["noChannel", "neverSpoken", { worstDrift: drift({ everHappened: false }) }],
    ["noChannel", "feedbackOverdue", { worstDrift: drift({ sinceDays: 40, targetDays: 28 }) }],
    ["noChannel", "inStep", { worstDrift: drift({ sinceDays: 2, targetDays: 28 }) }],
    ["peers", "away", { availability: "away" }],
    ["peers", "daysOver", { worstDrift: drift({ sinceDays: 20, targetDays: 7 }) }],
    ["peers", "inStep", { worstDrift: drift({ sinceDays: 2, targetDays: 7 }) }],
    ["outward", "away", { availability: "away" }],
    ["outward", "promisesOwed", { promisesOwed: 1 }],
    ["outward", "questionToAsk", { hasQuestion: true }],
    ["outward", "updateOverdue", { update: { overdue: true } }],
    ["outward", "updatedRecently", { update: { overdue: false } }]
  ];

  await t.test("each case produces the kind it claims to", () => {
    for (const [cluster, kind, over] of cases) {
      assert.equal(tileOf(row(over), cluster).kind, kind, `${cluster}/${kind}`);
    }
  });

  await t.test("and together they reach every kind except the declared gaps", () => {
    /*
     * The guard that makes the sets worth having. A kind added to a set and not
     * producible by any input is a phrase the renderer will be written for and
     * nothing will ever show - and the reverse, a kind the rule can return that
     * no set declares, is a tile speaking a vocabulary nobody reviewed.
     */
    const reached = new Set(cases.map(([, kind]) => kind));
    const missing = TILE_KINDS.filter((k) => !reached.has(k));
    assert.deepEqual(
      missing.sort(),
      [...UNREACHABLE_KINDS].sort(),
      "the unreachable kinds are not the ones declared unreachable"
    );
  });

  await t.test("and nothing is declared unreachable any more", () => {
    /*
     * It was not always empty. The two plan states sat in that list while the
     * plan shape was a slice away, and this test is what emptied it: the day
     * plans landed it failed and said the states needed wiring.
     *
     * Kept rather than deleted, because the next phrase declared ahead of its
     * feature will want the same mechanism.
     */
    assert.deepEqual([...UNREACHABLE_KINDS], []);
  });

  await t.test("an unknown cluster names itself rather than guessing a phrase", () => {
    const tile = tileOf(row({}), "not-a-cluster");
    assert.equal(tile.kind, "unknownCluster");
    assert.equal(tile.cluster, "not-a-cluster");
  });
});

test("what is being asked of you sorts above what is not", async (t) => {
  await t.test("quiet states never outrank asking ones", () => {
    const quiet = ["away", "inStep", "directionShowing", "updatedRecently"];
    const asking = ["needsYou", "neverSpoken", "planNotStarted", "promisesOwed", "daysOver"];

    for (const a of asking) {
      for (const q of quiet) {
        assert.ok(
          tileWeight({ kind: a }) > tileWeight({ kind: q }),
          `${a} must outrank ${q}`
        );
      }
    }
  });

  await t.test("and a plan nobody has started outranks one that is running", () => {
    assert.ok(tileWeight({ kind: "planNotStarted" }) > tileWeight({ kind: "planRunning" }));
  });
});
