/**
 * A plan is not a direction, and the shape has to keep them apart.
 *
 * The two tests that matter: "no, they do not know" is an answer rather than an
 * unfilled field, and the copy handed to the person is a named subset rather
 * than everything minus the private bits.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  HIS_ALONE,
  PLAN_STATUSES,
  REQUIRED,
  THEIR_COPY,
  isLivePlan,
  isReady,
  premiseUntested,
  readiness,
  theirCopy
} from "../src/domain/plan.js";

const DUE = Date.parse("2026-12-01T12:00:00Z");

/** A plan with everything answered. @param {object} over */
const full = (over = {}) => ({
  id: "plan-1",
  person: "p1",
  gap: "Bygger inte färdigt utan att bli påmind",
  theyKnow: true,
  saidOutLoud: "Sa det rakt ut på tisdagen, med två exempel",
  goal: "Få honom över tröskeln",
  delivery: "Äger releasen för renderingen",
  measure: "Tar två releaser i rad utan att jag följer upp",
  baseline: "Idag följer jag upp varje gång",
  dueAt: DUE,
  ifNotMet: "Då byter vi roll, och det sa jag i samma samtal",
  hr: "HR informerad, inget formellt ännu",
  status: "draft",
  ...over
});

test("what a plan cannot start without", async (t) => {
  await t.test("a full one is ready and asks for nothing", () => {
    assert.deepEqual(readiness(full()), []);
    assert.equal(isReady(full()), true);
  });

  await t.test("an empty one names everything, in the order it is asked", () => {
    const missing = readiness({ id: "p", person: "p1" });
    assert.deepEqual(missing, [...REQUIRED]);
    /*
     * Order is the design rather than incidental. `theyKnow` is second because
     * everything after it is worthless if they do not know and nothing has
     * been said.
     */
    assert.equal(missing[0], "gap");
    assert.equal(missing[1], "theyKnow");
  });

  await t.test("the consequence is required, so it cannot be sprung on somebody", () => {
    /*
     * A plan whose consequence is unstated is a plan that will be a surprise.
     * The brief says it has to be said in the same conversation, which means
     * it has to exist before the plan starts.
     */
    assert.ok(REQUIRED.includes("ifNotMet"));
    assert.deepEqual(readiness(full({ ifNotMet: "" })), ["ifNotMet"]);
  });

  await t.test("a measure needs its baseline, or it ends in an argument", () => {
    /*
     * "Runs the review without me" means nothing without what happens today.
     * Required beside the measure rather than optional under it.
     */
    assert.deepEqual(readiness(full({ baseline: "  " })), ["baseline"]);
  });

  await t.test("HR is answered before the first conversation, not after", () => {
    assert.ok(REQUIRED.includes("hr"));
    assert.deepEqual(readiness(full({ hr: "" })), ["hr"]);
  });

  await t.test("a date is a number, not a hopeful string", () => {
    assert.deepEqual(readiness(full({ dueAt: undefined })), ["dueAt"]);
    assert.deepEqual(readiness(full({ dueAt: NaN })), ["dueAt"]);
    assert.deepEqual(readiness(full({ dueAt: DUE })), []);
  });
});

test("no is an answer", async (t) => {
  await t.test("'they do not know' does not read as unanswered", () => {
    /*
     * The bug this exists to prevent, and it is the field the whole shape was
     * built for. Testing truthiness would make "no, they do not know" look
     * like a blank - which is exactly backwards: a plan whose subject does not
     * know is not incomplete, it is a plan with one very clear next step.
     */
    const notTold = full({ theyKnow: false });
    assert.ok(!readiness(notTold).includes("theyKnow"), JSON.stringify(readiness(notTold)));
    assert.equal(isReady(notTold), true);
  });

  await t.test("but nothing at all does", () => {
    assert.deepEqual(readiness(full({ theyKnow: undefined })), ["theyKnow"]);
    assert.deepEqual(readiness(full({ theyKnow: /** @type {any} */ ("maybe") })), ["theyKnow"]);
  });

  await t.test("and the premise being untested is its own finding", () => {
    /*
     * Not a missing field. Every field can be filled and this still be true -
     * on the real case that produced this shape it is: the person says he has
     * no technical challenge while the plan's premise is a toolchain gap.
     */
    assert.equal(premiseUntested(full({ theyKnow: false })), true);
    assert.equal(premiseUntested(full({ theyKnow: true })), false);
    assert.equal(premiseUntested(full({ theyKnow: undefined })), false);
  });
});

test("the copy the person is handed", async (t) => {
  await t.test("is five lines, in the order they read", () => {
    assert.deepEqual(
      theirCopy(full()).map((l) => l.field),
      ["gap", "delivery", "measure", "dueAt", "ifNotMet"]
    );
  });

  await t.test("never carries anything that is his alone", () => {
    /*
     * The guarantee the whole split exists for. A goal option like "document
     * that we tried" is a legitimate reason to run a plan and must never
     * appear in what the person is given.
     */
    for (const field of HIS_ALONE) {
      assert.ok(
        !THEIR_COPY.includes(/** @type {any} */ (field)),
        `${field} is in the copy handed over`
      );
    }
    const handed = theirCopy(full()).map((l) => l.field);
    for (const field of HIS_ALONE) {
      assert.ok(!handed.includes(field), `${field} was handed over`);
    }
  });

  await t.test("is a named subset, not everything minus the private fields", () => {
    /*
     * Derived by exclusion, a field added later would be handed over by
     * default - and the field most likely to be added later is another private
     * one. So the two lists together must account for every required field,
     * and a new one has to be put in one of them deliberately.
     */
    const accounted = new Set([...THEIR_COPY, ...HIS_ALONE]);
    const unaccounted = REQUIRED.filter((f) => !accounted.has(/** @type {any} */ (f)));
    assert.deepEqual(
      unaccounted,
      ["baseline"],
      "a required field belongs to neither audience, which has to be a decision"
    );
  });

  await t.test("leaves out a line that has not been answered", () => {
    /*
     * Rather than handing over a copy with a blank where the consequence
     * should be, which reads as though there is not one.
     */
    const handed = theirCopy(full({ ifNotMet: "" })).map((l) => l.field);
    assert.ok(!handed.includes("ifNotMet"), JSON.stringify(handed));
    assert.equal(handed.length, 4);
  });

  await t.test("and carries the values, not just the field names", () => {
    const gap = theirCopy(full()).find((l) => l.field === "gap");
    assert.equal(gap?.value, "Bygger inte färdigt utan att bli påmind");
  });
});

test("a plan's life", async (t) => {
  await t.test("draft and running are both live", () => {
    /*
     * `draft` is not a lesser plan. It is the state most plans are in while he
     * works out what he thinks, and a page that hid drafts would hide the
     * thinking.
     */
    assert.equal(isLivePlan("draft"), true);
    assert.equal(isLivePlan("running"), true);
  });

  await t.test("and every ending is not", () => {
    for (const status of ["met", "notMet", "dropped"]) {
      assert.equal(isLivePlan(status), false, status);
    }
  });

  await t.test("an unknown status is not live, rather than defaulting to live", () => {
    assert.equal(isLivePlan(""), false);
    assert.equal(isLivePlan("nonsense"), false);
  });

  await t.test("every declared status is decided one way or the other", () => {
    for (const status of PLAN_STATUSES) {
      assert.equal(typeof isLivePlan(status), "boolean", status);
    }
    assert.ok(PLAN_STATUSES.length >= 5, `only ${PLAN_STATUSES.length} statuses`);
  });
});
