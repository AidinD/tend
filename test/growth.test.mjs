/**
 * Tests for growth threads.
 *
 * Three of these pin decisions that were argued about rather than derived, and
 * they are the ones to read first if this file ever needs changing:
 *
 * - A thread's clock starts when the thread does, unlike a topic's, which reaches
 *   back to the start of the relationship. A decision made today is not already
 *   overdue.
 * - Progress and attention are separate readings. Talking about something every
 *   month for half a year without ever seeing it is the failure this exists to
 *   catch, and it is invisible to anything that counts conversations.
 * - A dropped thread keeps asking until he confirms he told them. Letting a
 *   direction go is fine; letting it go silently is the one option that costs
 *   him the relationship.
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
  DRIVER_OPTIONS,
  DRIVERS,
  STALL_AFTER_TALKS,
  STANCE_OPTIONS,
  STANCES,
  STATUS_OPTIONS,
  STATUSES,
  missing,
  openQuestions,
  threadState,
  threadsFor
} from "../src/domain/growth.js";
import { ok, failed } from "./helpers.mjs";

const NOW = Date.parse("2026-08-26T09:00:00Z");
/** @param {number} days */
const ago = (days) => NOW - days * DAY_MS;

const person = { id: "p1", since: ago(800) };

/** @param {Record<string, any>} [fields] */
function thread(fields = {}) {
  return {
    id: "g1",
    person: "p1",
    aim: "Runs the design review without me",
    marker: "Chairs it once with me absent",
    driver: "needs",
    stance: "agreed",
    status: "open",
    cadenceDays: 30,
    horizon: NOW + 90 * DAY_MS,
    startedAt: ago(10),
    ...fields
  };
}

/** @param {number} days @param {boolean} [observed] */
function talk(days, observed = false) {
  return { growth: "g1", at: ago(days), observed, note: "" };
}

describe("the attention clock", () => {
  it("counts from the thread, not from the start of the relationship", () => {
    // The asymmetry against topics, and the reason it exists: a question never
    // put to somebody in two years is genuinely two years unasked, but a
    // direction decided this week is not.
    const state = threadState(thread({ startedAt: ago(5) }), [], person, NOW);
    assert.equal(state.daysSinceTalked, 5);
    assert.equal(state.attention, "ok");
  });

  it("reads the last conversation rather than the first", () => {
    const state = threadState(thread(), [talk(200), talk(4)], person, NOW);
    assert.equal(state.daysSinceTalked, 4);
    assert.equal(state.talks, 2);
  });

  it("drifts once the cadence has passed", () => {
    const state = threadState(thread(), [talk(50)], person, NOW);
    assert.equal(state.attention, "warn");
  });

  it("stops the clock on a thread that has ended", () => {
    const done = thread({ status: "reached", endedWhy: "chaired it twice" });
    const state = threadState(done, [talk(400)], person, NOW);
    assert.equal(state.attention, "ok");
    assert.equal(state.asks, null);
  });

  it("keeps the clock running on a stated expectation, which is still live", () => {
    const stated = thread({ status: "expectation", endedWhy: "said it plainly on the 20th" });
    const state = threadState(stated, [talk(50)], person, NOW);
    assert.equal(state.attention, "warn");
  });
});

describe("progress, as distinct from attention", () => {
  it("does not call it stalled before the threshold", () => {
    const notes = Array.from({ length: STALL_AFTER_TALKS - 1 }, (_, i) => talk(i + 1));
    const state = threadState(thread(), notes, person, NOW);
    assert.equal(state.stalled, false);
    assert.equal(state.asks, null);
  });

  it("calls it stalled once it has been discussed enough with nothing ever observed", () => {
    const notes = Array.from({ length: STALL_AFTER_TALKS }, (_, i) => talk(i + 1));
    const state = threadState(thread(), notes, person, NOW);
    assert.equal(state.stalled, true);
    assert.equal(state.observations, 0);
    assert.match(String(state.asks), /aim wrong, or is the support missing/);
  });

  it("is not stalled if the marker was seen even once", () => {
    const notes = Array.from({ length: STALL_AFTER_TALKS + 4 }, (_, i) => talk(i + 1));
    notes[0].observed = true;
    const state = threadState(thread(), notes, person, NOW);
    assert.equal(state.stalled, false);
    assert.equal(state.observations, 1);
  });

  it("counts observing separately from talking, so one note can be both", () => {
    const state = threadState(thread(), [talk(3, true)], person, NOW);
    assert.equal(state.talks, 1);
    assert.equal(state.observations, 1);
  });
});

describe("the one question a thread asks", () => {
  it("asks for the marker first, because nothing can be followed without it", () => {
    const notes = Array.from({ length: STALL_AFTER_TALKS }, (_, i) => talk(i + 1));
    const state = threadState(thread({ marker: "" }), notes, person, NOW);
    assert.match(String(state.asks), /see in three months/);
  });

  it("asks what they actually said once it has been discussed but their stance is unrecorded", () => {
    const state = threadState(thread({ stance: "unasked" }), [talk(2)], person, NOW);
    assert.match(String(state.asks), /in their words/);
  });

  it("says nothing about their stance before it has been discussed at all", () => {
    const state = threadState(thread({ stance: "unasked" }), [], person, NOW);
    assert.equal(state.asks, null);
  });

  it("questions the thread itself once the horizon passes", () => {
    const state = threadState(thread({ horizon: ago(1) }), [talk(2)], person, NOW);
    assert.equal(state.pastHorizon, true);
    assert.match(String(state.asks), /still the thing/);
  });

  it("keeps asking about a dropped thread until he confirms he told them", () => {
    const let_go = thread({ status: "dropped", endedWhy: "he does not want it and the job does not need it" });
    const quiet = threadState(let_go, [talk(3)], person, NOW);
    assert.match(String(quiet.asks), /told them you let this go/);

    const said = threadState({ ...let_go, endingSaid: true }, [talk(3)], person, NOW);
    assert.equal(said.asks, null);
  });
});

describe("what the form still wants", () => {
  it("splits the questions by which sitting they belong to", () => {
    const empty = missing({ id: "g1", driver: "wants" });
    assert.ok(empty.prepare.length > 0);
    assert.ok(empty.ask.length > 0);
    // His own preparation never asks him what the other person wants: that is
    // the whole reason the form has two stages.
    assert.ok(!empty.prepare.some((q) => /their words/i.test(q)));
  });

  it("asks the uncomfortable question only when the driver is a need", () => {
    const needs = missing({ id: "g1", driver: "needs" });
    assert.ok(needs.prepare.some((q) => /if nothing changes/i.test(q)));

    const wants = missing({ id: "g1", driver: "wants" });
    assert.ok(!wants.prepare.some((q) => /if nothing changes/i.test(q)));
  });

  it("asks which of the two it is before anything else, when it is unset", () => {
    const blank = missing({ id: "g1" });
    assert.match(blank.prepare[0], /want this, or does the job need it/);
  });

  it("is satisfied once every field is answered", () => {
    const full = missing({
      id: "g1",
      driver: "wants",
      hypothesis: "h",
      alreadySeen: "s",
      offering: "o",
      theirWords: "w",
      stance: "agreed",
      assignment: "a",
      marker: "m"
    });
    assert.deepEqual(full, { prepare: [], ask: [] });
  });
});

describe("threads across everyone", () => {
  it("carries only the threads that are actually asking something", () => {
    // Overdue on its own is not a question: he can see a date. The list exists
    // for the readings he cannot work out by looking at the row.
    const stalledNotes = Array.from({ length: STALL_AFTER_TALKS }, (_, i) => talk(i + 1));
    const quiet = thread({ id: "g2" });
    const rows = [thread(), quiet];
    const notes = [...stalledNotes, { growth: "g2", at: ago(200), observed: false }];
    const asking = openQuestions({ growth: rows, notes, people: [person], now: NOW });
    assert.deepEqual(
      asking.map((a) => a.id),
      ["g1"]
    );
  });

  it("puts a thread asking something ahead of the merely overdue on the person's own page", () => {
    const stalledNotes = Array.from({ length: STALL_AFTER_TALKS }, (_, i) => talk(i + 1));
    const rows = [thread({ id: "g2" }), thread()];
    const notes = [...stalledNotes, { growth: "g2", at: ago(200), observed: false }];
    const threads = threadsFor({ growth: rows, notes, person, now: NOW });
    assert.equal(threads.length, 2);
    assert.equal(threads[0].id, "g1");
    assert.ok(threads[1].daysSinceTalked > threads[0].daysSinceTalked);
  });

  it("drops a thread whose person is no longer on the roster", () => {
    const orphan = thread({ person: "gone" });
    const asking = openQuestions({ growth: [orphan], notes: [], people: [person], now: NOW });
    assert.equal(asking.length, 0);
  });

  it("ignores a tombstoned thread", () => {
    const notes = Array.from({ length: STALL_AFTER_TALKS }, (_, i) => talk(i + 1));
    const rows = [thread({ _deleted: true })];
    assert.equal(openQuestions({ growth: rows, notes, people: [person], now: NOW }).length, 0);
    assert.equal(threadsFor({ growth: rows, notes, person, now: NOW }).length, 0);
  });
});

describe("the option lists", () => {
  it("derives every list from its definition rather than repeating it", () => {
    // Four hand-copied lists in this window have already gone stale against
    // their source, one of them silently writing rows against the wrong subject.
    assert.deepEqual(
      DRIVER_OPTIONS.map((o) => o.value),
      Object.keys(DRIVERS)
    );
    assert.deepEqual(
      STANCE_OPTIONS.map((o) => o.value),
      Object.keys(STANCES)
    );
    assert.deepEqual(
      STATUS_OPTIONS.map((o) => o.value),
      Object.keys(STATUSES)
    );
  });

  it("gives every driver something the form can ask about it", () => {
    for (const [key, driver] of Object.entries(DRIVERS)) {
      assert.ok(driver.means.trim().length > 0, `${key} says nothing about what it means`);
      assert.ok(driver.asks.trim().length > 0, `${key} asks nothing`);
    }
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
    dir = mkdtempSync(join(tmpdir(), "tend-growth-"));
    store = openStore({ dataDir: dir, role: "app", host: "test" });
    ok(api.addPerson(store, { name: "Halvar", relation: "lead-and-manage", now: ago(400) }));
    id = ok(
      api.openThread(store, {
        person: "Halvar",
        aim: "Runs the design review without me",
        driver: "needs",
        need: "the team stalls whenever I am away",
        ifNothingChanges: "I stay the bottleneck and he stays where he is",
        now: NOW
      })
    ).id;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("refuses a thread with no direction", () => {
    const err = failed(api.openThread(store, { person: "Halvar", aim: "  ", now: NOW }));
    assert.match(err, /one sentence/);
  });

  it("reports what the form still wants when it opens the thread", () => {
    const opened = ok(api.openThread(store, { person: "Halvar", aim: "Another one", now: NOW }));
    assert.ok(opened.missing.prepare.length > 0);
  });

  it("refuses to record an observation before there is anything to observe", () => {
    const err = failed(api.logGrowthNote(store, { growth: id, observed: true, now: NOW }));
    assert.match(err, /no marker/);
  });

  it("accepts the observation once a marker exists", () => {
    ok(api.updateThread(store, id, { marker: "Chairs it once with me absent" }));
    const noted = ok(api.logGrowthNote(store, { growth: id, observed: true, now: NOW }));
    assert.equal(noted.observed, true);
  });

  it("refuses a conversation dated in the future", () => {
    const err = failed(api.logGrowthNote(store, { growth: id, at: NOW + 3 * DAY_MS, now: NOW }));
    assert.match(err, /has not arrived/);
  });

  it("refuses an unknown stance rather than storing it", () => {
    const err = failed(api.updateThread(store, id, { stance: "enthusiastic" }));
    assert.match(err, /Unknown stance/);
  });

  it("refuses an ending with no reason", () => {
    const err = failed(api.endThread(store, id, { status: "dropped", why: " " }));
    assert.match(err, /needs its reason/);
  });

  it("treats a dropped thread as untold until he says otherwise", () => {
    ok(api.endThread(store, id, { status: "dropped", why: "he does not want it" }));
    const asking = api.growthQuestions(store, NOW);
    assert.equal(asking.length, 1);
    assert.match(String(asking[0].asks), /told them/);

    ok(api.updateThread(store, id, { endingSaid: true }));
    assert.equal(api.growthQuestions(store, NOW).length, 0);
  });

  it("counts the live threads and says what is comfortable without enforcing it", () => {
    ok(api.openThread(store, { person: "Halvar", aim: "Second direction", now: NOW }));
    ok(api.openThread(store, { person: "Halvar", aim: "Third direction", now: NOW }));
    const seen = ok(api.growth(store, "Halvar", NOW));
    assert.equal(seen.live, 3);
    assert.ok(seen.live > seen.comfortable);
  });

  it("keeps an ended thread on the person rather than hiding the decision", () => {
    ok(api.endThread(store, id, { status: "dropped", why: "no interest, not required", said: true }));
    const seen = ok(api.growth(store, "Halvar", NOW));
    assert.equal(seen.threads.length, 1);
    assert.equal(seen.live, 0);
    assert.equal(seen.threads[0].fields.endedWhy, "no interest, not required");
  });

  it("keeps his guess beside what they actually said", () => {
    ok(api.updateThread(store, id, { hypothesis: "he wants to lead" }));
    ok(api.updateThread(store, id, { theirWords: "I would rather go deep on rendering", stance: "redirected" }));
    const seen = ok(api.growth(store, "Halvar", NOW));
    assert.equal(seen.threads[0].fields.hypothesis, "he wants to lead");
    assert.equal(seen.threads[0].stance, "redirected");
  });

  it("can take back a thread logged against the wrong person", () => {
    ok(api.removeRow(store, "growth", id));
    assert.equal(ok(api.growth(store, "Halvar", NOW)).threads.length, 0);
  });

  it("can take back a conversation logged by mistake", () => {
    const noted = ok(api.logGrowthNote(store, { growth: id, note: "wrong thread", now: NOW }));
    ok(api.removeRow(store, "growthNotes", noted.id));
    assert.equal(ok(api.growth(store, "Halvar", NOW)).threads[0].talks, 0);
  });
});

describe("on the prep card", () => {
  /** @type {string} */
  let dir;
  /** @type {import("../src/storage/store.js").TendStore} */
  let store;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "tend-growth-prep-"));
    store = openStore({ dataDir: dir, role: "app", host: "test" });
    // Deliberately in step: no duty, no promise, no topic. The only reason this
    // person could reach the page is a growth thread.
    ok(api.addPerson(store, { name: "Halvar", relation: "lead-and-manage", now: ago(5) }));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** @param {Record<string, any>} [extra] */
  function withThread(extra = {}) {
    const id = ok(
      api.openThread(store, { person: "Halvar", aim: "Runs the design review without me", now: ago(120) })
    ).id;
    ok(api.updateThread(store, id, { marker: "Chairs it with me absent", stance: "agreed", ...extra }));
    return id;
  }

  it("keeps somebody off the page when nothing is asking anything", () => {
    // A complete thread inside its cadence asks nothing. Nobody needs preparing
    // for that, and a page that lists everybody is a roster.
    const id = ok(api.openThread(store, { person: "Halvar", aim: "Something", now: NOW })).id;
    ok(api.updateThread(store, id, { marker: "Chairs it", stance: "agreed" }));
    const page = api.prep(store, NOW, { jotDir: dir, nibDir: dir });
    assert.equal(page.cards.length, 0);
  });

  it("asks for the marker straight away, so an unfinished thread cannot go quiet", () => {
    // Opening a direction and never saying what you would see is the most likely
    // way this feature gets abandoned, so it is the one thing that nags on day
    // one rather than after a cadence has passed.
    ok(api.openThread(store, { person: "Halvar", aim: "Something", now: NOW }));
    const page = api.prep(store, NOW, { jotDir: dir, nibDir: dir });
    assert.equal(page.cards.length, 1);
    assert.match(page.cards[0].why, /see in three months/);
  });

  it("puts somebody on the page for a thread alone", () => {
    const id = withThread();
    for (let i = 0; i < STALL_AFTER_TALKS; i += 1) {
      ok(api.logGrowthNote(store, { growth: id, at: ago(10 + i), now: NOW }));
    }
    const page = api.prep(store, NOW, { jotDir: dir, nibDir: dir });
    assert.equal(page.cards.length, 1);
    assert.equal(page.cards[0].growing.length, 1);
  });

  it("names the question as the reason they are listed", () => {
    const id = withThread();
    for (let i = 0; i < STALL_AFTER_TALKS; i += 1) {
      ok(api.logGrowthNote(store, { growth: id, at: ago(10 + i), now: NOW }));
    }
    const page = api.prep(store, NOW, { jotDir: dir, nibDir: dir });
    // Not "1 growth thread" - the question itself, because that is the thing he
    // cannot work out by looking at the row.
    assert.match(page.cards[0].why, /aim wrong, or is the support missing/);
  });

  it("carries both counts, since either one alone says nothing", () => {
    const id = withThread();
    ok(api.logGrowthNote(store, { growth: id, at: ago(90), now: NOW }));
    ok(api.logGrowthNote(store, { growth: id, at: ago(80), observed: true, now: NOW }));
    const page = api.prep(store, NOW, { jotDir: dir, nibDir: dir });
    const growing = page.cards[0].growing[0];
    assert.equal(growing.talks, 2);
    assert.equal(growing.observations, 1);
  });

  it("does not carry an ended thread onto the card", () => {
    const id = withThread();
    ok(api.logGrowthNote(store, { growth: id, at: ago(90), now: NOW }));
    ok(api.endThread(store, id, { status: "reached", why: "chaired it twice", said: true }));
    const page = api.prep(store, NOW, { jotDir: dir, nibDir: dir });
    assert.equal(page.cards.length, 0);
  });
});

describe("reading one thread by id", () => {
  /** @type {string} */
  let dir;
  /** @type {import("../src/storage/store.js").TendStore} */
  let store;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "tend-growth-one-"));
    store = openStore({ dataDir: dir, role: "app", host: "test" });
    ok(api.addPerson(store, { name: "Halvar", relation: "lead-and-manage", now: ago(400) }));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("finds the thread without being told whose it is", () => {
    const id = ok(api.openThread(store, { person: "Halvar", aim: "A direction", now: NOW })).id;
    const one = ok(api.thread(store, id, NOW));
    assert.equal(one.id, id);
    assert.equal(one.aim, "A direction");
  });

  it("says so plainly for an id that is not a thread", () => {
    assert.match(failed(api.thread(store, "nope", NOW)), /No growth thread/);
  });
});

describe("who else hears about it", () => {
  /** @type {string} */
  let dir;
  /** @type {import("../src/storage/store.js").TendStore} */
  let store;
  /** @type {string} */
  let id;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "tend-growth-tell-"));
    store = openStore({ dataDir: dir, role: "app", host: "test" });
    ok(api.addPerson(store, { name: "Halvar", relation: "manage-remotely", now: ago(400) }));
    ok(api.addPerson(store, { name: "Ingeborg", relation: "own-manager", now: ago(900) }));
    id = ok(api.openThread(store, { person: "Halvar", aim: "Runs the review", now: ago(120) })).id;
    ok(api.updateThread(store, id, { marker: "Chairs it with me absent", stance: "agreed" }));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("keeps who was told, so the record outlives the promise to tell them", () => {
    const manager = ok(api.people(store, NOW, "own-manager"))[0];
    ok(api.logGrowthNote(store, { growth: id, observed: true, tell: manager.id, note: "chaired it", now: NOW }));
    const seen = ok(api.growth(store, "Halvar", NOW));
    assert.deepEqual(seen.threads[0].told, ["Ingeborg"]);
  });

  it("lists each person once however many times they were told", () => {
    const manager = ok(api.people(store, NOW, "own-manager"))[0];
    for (const days of [40, 20, 5]) {
      ok(api.logGrowthNote(store, { growth: id, observed: true, tell: manager.id, at: ago(days), now: NOW }));
    }
    assert.deepEqual(ok(api.growth(store, "Halvar", NOW)).threads[0].told, ["Ingeborg"]);
  });

  it("says nobody was told when nobody was", () => {
    ok(api.logGrowthNote(store, { growth: id, observed: true, now: NOW }));
    assert.deepEqual(ok(api.growth(store, "Halvar", NOW)).threads[0].told, []);
  });

  it("drops somebody who has since been taken off the roster", () => {
    const manager = ok(api.people(store, NOW, "own-manager"))[0];
    ok(api.logGrowthNote(store, { growth: id, observed: true, tell: manager.id, now: NOW }));
    ok(api.removeRow(store, "people", manager.id));
    // Not a name the tool can no longer resolve, and not a stale copy of one
    // either: the same rule stakeholders follow.
    assert.deepEqual(ok(api.growth(store, "Halvar", NOW)).threads[0].told, []);
  });
});
