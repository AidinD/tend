/**
 * The write side of a plan.
 *
 * Two rules carry the weight: a plan cannot be started by claiming it started,
 * and one person cannot have two live plans. Everything else follows from the
 * shape.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import * as api from "../src/service/api.js";
import { DAY_MS } from "../src/domain/time.js";
import { openStore } from "../src/storage/store.js";
import { ok, failed } from "./helpers.mjs";

const NOW = Date.parse("2026-09-04T09:00:00Z");
const DUE = NOW + 60 * DAY_MS;

/** @param {object} over */
const answers = (over = {}) => ({
  person: "Ada",
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
  ...over
});

describe("writing a plan", () => {
  /** @type {string} */
  let dir;
  /** @type {any} */
  let store;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "tend-plans-"));
    store = openStore({ dataDir: dir, role: "app", host: "test" });
    ok(api.addPerson(store, { name: "Ada", relation: "lead-and-manage", since: NOW - 300 * DAY_MS, now: NOW - 300 * DAY_MS }));
    ok(api.addPerson(store, { name: "Bo", relation: "lead-and-manage", since: NOW - 300 * DAY_MS, now: NOW - 300 * DAY_MS }));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** @param {string} name */
  const idOf = (name) => {
    const row = api.people(store, NOW).find((/** @type {any} */ p) => p.name === name);
    assert.ok(row, `${name} is not on the roster`);
    return String(row.id);
  };

  it("a full one starts running", () => {
    const result = ok(api.setPlan(store, answers(), NOW));
    assert.equal(result.status, "running");
    assert.deepEqual(result.missing, []);
  });

  it("a partial one is a draft, and says what it needs", () => {
    /*
     * Not an error. Most plans live in this state for a week or two while he
     * works out what he actually thinks, and calling that a validation failure
     * would make the app refuse the thinking.
     */
    const result = ok(api.setPlan(store, { person: "Ada", gap: "Levererar inte färdigt" }, NOW));
    assert.equal(result.status, "draft");
    assert.ok(result.missing.includes("theyKnow"), JSON.stringify(result.missing));
    assert.ok(result.missing.includes("ifNotMet"), JSON.stringify(result.missing));
  });

  it("cannot be started by claiming it started", () => {
    /*
     * The status is computed from the fields, so passing one is ignored. A
     * plan that could be marked running while half empty is a plan with a
     * consequence attached and no stated consequence.
     */
    const result = ok(
      api.setPlan(store, { person: "Ada", gap: "Något", status: "running", startedAt: NOW }, NOW)
    );
    assert.equal(result.status, "draft");

    const row = store.rows("plans").find((/** @type {any} */ p) => String(p.id) === result.id);
    assert.equal(row.status, "draft");
    assert.equal(row.startedAt, null);
  });

  it("says no to a second live plan on the same person", () => {
    /*
     * Two at once means two answers to whether somebody is below the bar, and
     * the second is always the one nobody remembers agreeing to.
     */
    ok(api.setPlan(store, answers(), NOW));
    /* `failed` hands back the message, not the result. */
    const why = failed(api.setPlan(store, answers(), NOW));
    assert.match(why, /har redan en pågående plan/);
  });

  it("but two different people may each have one", () => {
    ok(api.setPlan(store, answers(), NOW));
    ok(api.setPlan(store, answers({ person: "Bo" }), NOW));
    assert.notEqual(api.planFor(store, idOf("Ada")), null);
    assert.notEqual(api.planFor(store, idOf("Bo")), null);
  });

  it("refuses a person who is not on the roster", () => {
    failed(api.setPlan(store, answers({ person: "Nobody At All" }), NOW));
  });

  describe("filling one in", () => {
    /** @type {string} */
    let id;

    beforeEach(() => {
      id = String(ok(api.setPlan(store, { person: "Ada", gap: "Levererar inte färdigt" }, NOW)).id);
    });

    it("answering the last open field is what starts it", () => {
      /*
       * No separate start action to forget. The plan begins when it is
       * answerable, which is the only moment it could honestly begin.
       */
      const filled = ok(
        api.updatePlan(store, { id, ...answers(), person: undefined }, NOW)
      );
      assert.equal(filled.status, "running");
      assert.deepEqual(filled.missing, []);
    });

    it("and an edit afterwards does not restart the clock", () => {
      ok(api.updatePlan(store, { id, ...answers(), person: undefined }, NOW));
      const later = NOW + 10 * DAY_MS;
      ok(api.updatePlan(store, { id, goal: "Annat mål" }, later));

      const row = store.rows("plans").find((/** @type {any} */ p) => String(p.id) === id);
      assert.equal(row.startedAt, NOW, "the start date moved when a field was edited");
    });

    it("emptying a required field puts it back to a draft", () => {
      ok(api.updatePlan(store, { id, ...answers(), person: undefined }, NOW));
      const back = ok(api.updatePlan(store, { id, ifNotMet: "" }, NOW));
      assert.equal(back.status, "draft");
      assert.deepEqual(back.missing, ["ifNotMet"]);
    });

    it("a caller cannot set the status or the id through an update", () => {
      ok(
        api.updatePlan(
          store,
          { id, status: "met", startedAt: 1, person: "Bo", id2: "x" },
          NOW
        )
      );
      const row = store.rows("plans").find((/** @type {any} */ p) => String(p.id) === id);
      assert.equal(row.status, "draft");
      assert.equal(row.person, idOf("Ada"), "an update moved the plan to another person");
    });

    it("refuses an id it does not have", () => {
      failed(api.updatePlan(store, { id: "nope", gap: "x" }, NOW));
    });
  });

  describe("ending one", () => {
    /** @type {string} */
    let id;

    beforeEach(() => {
      id = String(ok(api.setPlan(store, answers(), NOW)).id);
    });

    it("met needs no reason", () => {
      ok(api.endPlan(store, { id, as: "met" }, NOW));
      assert.equal(api.planFor(store, idOf("Ada")), null);
    });

    it("but not met does, because it is the half that gets forgotten", () => {
      /*
       * A plan that ends with no reason turns into a mood in the room six
       * months later that neither of them can name - and this one had a
       * consequence attached to it, so the reason matters more than it does on
       * a growth direction.
       */
      failed(api.endPlan(store, { id, as: "notMet" }, NOW));
      failed(api.endPlan(store, { id, as: "dropped", why: "   " }, NOW));
      ok(api.endPlan(store, { id, as: "notMet", why: "Ingen rörelse på tre månader" }, NOW));
    });

    it("an invented ending is refused rather than stored", () => {
      failed(api.endPlan(store, { id, as: "sort-of", why: "x" }, NOW));
    });

    it("and an ended plan cannot be edited back to life", () => {
      ok(api.endPlan(store, { id, as: "met" }, NOW));
      failed(api.updatePlan(store, { id, gap: "Nytt" }, NOW));
    });

    it("ending it frees the person for a new one", () => {
      ok(api.endPlan(store, { id, as: "dropped", why: "Bytte roll i stället" }, NOW));
      ok(api.setPlan(store, answers(), NOW));
    });
  });

  describe("reading one back", () => {
    it("carries what it still needs, so the window cannot disagree", () => {
      ok(api.setPlan(store, { person: "Ada", gap: "Levererar inte färdigt" }, NOW));
      const plan = api.planFor(store, idOf("Ada"));
      assert.ok(plan);
      assert.equal(plan.status, "draft");
      assert.ok(plan.missing.length > 0);
    });

    it("and says when the premise has not been tested", () => {
      /*
       * The field the whole shape was built for. Every other field can be
       * filled and this still be true.
       */
      ok(api.setPlan(store, answers({ theyKnow: false }), NOW));
      const plan = api.planFor(store, idOf("Ada"));
      assert.ok(plan);
      assert.equal(plan.status, "running", "not knowing is not an unfilled field");
      assert.equal(plan.premiseUntested, true);
    });

    it("hands over five lines and none of the private ones", () => {
      ok(api.setPlan(store, answers(), NOW));
      const plan = api.planFor(store, idOf("Ada"));
      assert.ok(plan);

      const fields = plan.theirCopy.map((/** @type {any} */ l) => l.field);
      assert.deepEqual(fields, ["gap", "delivery", "measure", "dueAt", "ifNotMet"]);

      const handed = JSON.stringify(plan.theirCopy);
      assert.ok(!handed.includes("Få honom över tröskeln"), "the goal was handed over");
      assert.ok(!handed.includes("HR informerad"), "the HR answer was handed over");
      assert.ok(!handed.includes("Sa det rakt ut"), "what he said privately was handed over");
    });

    it("is null when there is no live plan, not an empty plan", () => {
      assert.equal(api.planFor(store, idOf("Ada")), null);
    });
  });
});
