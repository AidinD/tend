/**
 * Tests for what you are waiting for from somebody else.
 *
 * Two of these pin the asymmetry against promises, and they are the ones to read
 * first: nothing here ever becomes critical, because the delay is not his, and
 * the reading that matters is how many times he has had to ask again rather than
 * how many days have passed.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import * as api from "../src/service/api.js";
import { openStore } from "../src/storage/store.js";
import { DAY_MS } from "../src/domain/time.js";
import {
  DEFAULT_WAIT_DAYS,
  MANY_CHASES,
  WAIT_ENDINGS,
  WAIT_ENDING_OPTIONS,
  waitState,
  waitsDue
} from "../src/domain/waiting.js";
import { ok, failed } from "./helpers.mjs";

const NOW = Date.parse("2026-08-26T09:00:00Z");
/** @param {number} days */
const ago = (days) => NOW - days * DAY_MS;

/** @param {Record<string, any>} [fields] */
function wait(fields = {}) {
  return {
    id: "w1",
    person: "p1",
    what: "Two questions about the feedback",
    askedAt: ago(3),
    cadenceDays: 7,
    state: "open",
    ...fields
  };
}

/** @param {number} days */
const chased = (days) => ({ waiting: "w1", at: ago(days), note: "" });

describe("how a wait reads", () => {
  it("is quiet inside its interval", () => {
    const state = waitState(wait(), [], NOW);
    assert.equal(state.due, false);
    assert.equal(state.severity, "ok");
    assert.equal(state.asks, null);
  });

  it("comes due once the interval has passed with no nudge", () => {
    const state = waitState(wait({ askedAt: ago(12) }), [], NOW);
    assert.equal(state.due, true);
    assert.equal(state.daysWaiting, 12);
  });

  it("counts the clock from the last chase, not from the ask", () => {
    const state = waitState(wait({ askedAt: ago(40) }), [chased(2)], NOW);
    assert.equal(state.daysWaiting, 40);
    assert.equal(state.daysSinceNudge, 2);
    assert.equal(state.due, false);
  });

  it("never reaches critical, however long the silence", () => {
    // The asymmetry against a promise, and the reason it is in the code: a
    // promise past its guard is critical whatever else is going on, because the
    // person let down is let down today. This is somebody else's inbox.
    const state = waitState(wait({ askedAt: ago(400) }), [], NOW);
    assert.equal(state.severity, "warn");
  });

  it("says the silence is the finding once it has been chased enough", () => {
    const chases = Array.from({ length: MANY_CHASES }, (_, i) => chased(i + 1));
    const state = waitState(wait(), chases, NOW);
    assert.equal(state.chases, MANY_CHASES);
    assert.equal(state.stale, true);
    assert.match(String(state.asks), /kommer det här svaret/i);
  });

  it("stays quiet about one reminder, which is ordinary", () => {
    const state = waitState(wait(), [chased(1)], NOW);
    assert.equal(state.asks, null);
  });

  it("falls back to a week when no interval was given", () => {
    const state = waitState({ id: "w1", person: "p1", askedAt: ago(1) }, [], NOW);
    assert.equal(state.interval, DEFAULT_WAIT_DAYS);
  });

  it("ignores a chase that was taken back", () => {
    const state = waitState(wait(), [{ ...chased(1), _deleted: true }], NOW);
    assert.equal(state.chases, 0);
  });
});

describe("what reaches the daily page", () => {
  it("leaves out something asked yesterday, which is not a deviation", () => {
    const rows = [wait({ askedAt: ago(1) })];
    assert.equal(waitsDue({ waiting: rows, chases: [], now: NOW }).length, 0);
  });

  it("carries what is past its interval", () => {
    const rows = [wait({ askedAt: ago(20) })];
    assert.equal(waitsDue({ waiting: rows, chases: [], now: NOW }).length, 1);
  });

  it("carries a chased-out one even while its clock is fresh", () => {
    // Chased this morning, so not due - but three chases means it needs a
    // decision rather than another reminder, and that is worth the page.
    const chases = Array.from({ length: MANY_CHASES }, (_, i) => chased(i));
    const rows = [wait()];
    assert.equal(waitsDue({ waiting: rows, chases, now: NOW }).length, 1);
  });

  it("leaves out anything closed", () => {
    const rows = [wait({ askedAt: ago(40), state: "answered" }), wait({ id: "w2", askedAt: ago(40), state: "dropped" })];
    assert.equal(waitsDue({ waiting: rows, chases: [], now: NOW }).length, 0);
  });
});

describe("the endings", () => {
  it("offers both, derived from the definition", () => {
    assert.deepEqual(
      WAIT_ENDING_OPTIONS.map((o) => o.value),
      Object.keys(WAIT_ENDINGS)
    );
  });
});

describe("through the service", () => {
  /** @type {string} */
  let dir;
  /** @type {import("../src/storage/store.js").TendStore} */
  let store;
  /** @type {string} */
  let id;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "tend-waiting-"));
    store = openStore({ dataDir: dir, role: "app", host: "test" });
    ok(api.addPerson(store, { name: "Halvar", relation: "stakeholder", now: ago(400) }));
    id = ok(
      api.waitFor(store, {
        person: "Halvar",
        what: "Two questions about the scheduling view",
        why: "the next slice is blocked on it",
        askedAt: ago(20),
        now: NOW
      })
    ).id;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("refuses one with nothing said about what is being waited for", () => {
    assert.match(failed(api.waitFor(store, { person: "Halvar", what: "  ", now: NOW })), /vad du väntar på/);
  });

  it("refuses to be waiting on something not yet asked for", () => {
    const err = failed(api.waitFor(store, { person: "Halvar", what: "x", askedAt: NOW + 3 * DAY_MS, now: NOW }));
    assert.match(err, /har inte kommit än/);
  });

  it("carries the person's name and how long it has been", () => {
    const rows = ok(api.waits(store, NOW));
    assert.equal(rows[0].name, "Halvar");
    assert.equal(rows[0].chases, 0);
    assert.equal(rows[0].daysWaiting, 20);
    assert.equal(rows[0].waitingFor, "2 veckor");
  });

  it("resets the clock when chased, and counts it", () => {
    ok(api.chase(store, { waiting: id, note: "reminded him", now: NOW }));
    const row = ok(api.waits(store, NOW))[0];
    assert.equal(row.chases, 1);
    assert.equal(row.daysSinceNudge, 0);
    assert.equal(row.due, false);
  });

  it("refuses a chase dated in the future", () => {
    assert.match(failed(api.chase(store, { waiting: id, at: NOW + DAY_MS, now: NOW })), /har inte kommit än/);
  });

  it("refuses to chase something already closed", () => {
    ok(api.stopWaiting(store, id, { as: "answered", why: "he replied" }));
    assert.match(failed(api.chase(store, { waiting: id, now: NOW })), /är stängd/);
  });

  it("keeps the reason when it is dropped rather than answered", () => {
    ok(api.stopWaiting(store, id, { as: "dropped", why: "shipped it without him" }));
    assert.equal(ok(api.waits(store, NOW)).length, 0);
    const row = store.rows("waiting").find((w) => w.id === id);
    assert.equal(row?.state, "dropped");
    assert.equal(row?.endedWhy, "shipped it without him");
  });

  it("refuses an ending it does not have", () => {
    assert.match(failed(api.stopWaiting(store, id, { as: "forgotten" })), /An ending is one of/);
  });

  it("can be filtered to one person", () => {
    ok(api.addPerson(store, { name: "Ingeborg", relation: "own-manager", now: ago(400) }));
    ok(api.waitFor(store, { person: "Ingeborg", what: "a decision on the roadmap", now: NOW }));
    assert.equal(ok(api.waits(store, NOW)).length, 2);
    assert.equal(ok(api.waits(store, NOW, "Halvar")).length, 1);
  });

  it("can be taken back, chases and all", () => {
    ok(api.chase(store, { waiting: id, now: NOW }));
    ok(api.removeRow(store, "waiting", id));
    assert.equal(ok(api.waits(store, NOW)).length, 0);
  });
});
