/**
 * Tests for growth threads.
 *
 * Four of these pin decisions that were argued about rather than derived, and
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
 * - An ended thread wants nothing prepared and nothing asked, but a thread
 *   stated as an expectation is not ended in that sense: somebody still has to
 *   see something happen, so it keeps wanting a marker.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import * as api from "../src/service/api.js";
import { openStore } from "../src/storage/store.js";
import { prep } from "../src/service/prep.js";
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
  it("asks for the marker once they have been asked, ahead of any other reading", () => {
    const notes = Array.from({ length: STALL_AFTER_TALKS }, (_, i) => talk(i + 1));
    const state = threadState(thread({ marker: "", stance: "agreed" }), notes, person, NOW);
    assert.match(String(state.asks), /see in three months/);
  });

  it("asks what they actually said once it has been discussed but their stance is unrecorded", () => {
    const state = threadState(thread({ stance: "unasked" }), [talk(2)], person, NOW);
    assert.match(String(state.asks), /in their words/);
  });

  it("asks for the conversation before it asks for anything the conversation produces", () => {
    // Ordering that shipped wrong once: it asked for the observable marker
    // first, which invites the manager to invent the other person's yardstick
    // alone at a desk - the exact thing the two sittings exist to prevent.
    const state = threadState(thread({ stance: "unasked", marker: "" }), [], person, NOW);
    assert.match(String(state.asks), /Ask them/);
    assert.doesNotMatch(String(state.asks), /three months/);
  });

  it("asks what they said once a conversation has happened", () => {
    const state = threadState(thread({ stance: "unasked", marker: "" }), [talk(2)], person, NOW);
    assert.match(String(state.asks), /in their words/);
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

  it("wants nothing at all once the thread has ended", () => {
    // The real dropped thread came back over MCP still asking which real work
    // this happens through and what he would see in three months. Both are
    // unanswerable and neither is worth answering: the direction was let go.
    // Two readings of the same row disagreed about it - `question()` has always
    // returned null for a closed thread - and the window printed the difference
    // as "Still to ask them" underneath an ending.
    const letGo = missing({
      id: "g1",
      status: "dropped",
      endedWhy: "not the direction after all",
      endingSaid: true
    });
    assert.deepEqual(letGo, { prepare: [], ask: [] });

    // Reached is the same. There is nothing to prepare for something that has
    // already happened, and the fields it was opened without stay unfilled
    // forever without that being a gap in anything.
    assert.deepEqual(missing({ id: "g1", status: "reached" }), { prepare: [], ask: [] });
  });

  it("still wants a marker on a thread stated as an expectation", () => {
    // Why this asks about liveness rather than about `open`. An expectation is
    // the one ending that keeps running: an expectation with nothing observable
    // on it is one nobody can ever be shown to have met, which is precisely the
    // shape a stated expectation must not have. The clocks and the stall reading
    // treat it as live for the same reason.
    const stated = missing({
      id: "g1",
      status: "expectation",
      driver: "needs",
      need: "the team, and it is not negotiable",
      ifNothingChanges: "the reviews stay with me",
      hypothesis: "h",
      alreadySeen: "s",
      offering: "o",
      theirWords: "he does not want to",
      stance: "declined",
      assignment: "the design review"
    });
    assert.deepEqual(stated.prepare, []);
    assert.match(stated.ask.join(" "), /see in three months/);
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
  /** @type {string} */
  let jotDir;
  /** @type {import("../src/storage/store.js").TendStore} */
  let store;
  /** @type {string} */
  let id;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "tend-growth-"));
    // An empty board of its own, so prep() does not fall back to whatever Jot
    // board happens to be on the machine running the suite.
    jotDir = mkdtempSync(join(tmpdir(), "tend-growth-jot-"));
    writeFileSync(join(jotDir, "todos.json"), JSON.stringify({ categories: [], todos: [] }), "utf8");
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
    rmSync(jotDir, { recursive: true, force: true });
  });

  it("refuses a thread with no direction", () => {
    const err = failed(api.openThread(store, { person: "Halvar", aim: "  ", now: NOW }));
    assert.match(err, /one sentence/);
  });

  it("keeps even a stalled thread out of Now, which is the whole licence for the feature", () => {
    // The load-bearing promise in growth.js's "Why nothing here is ever
    // critical": Now is for deviations to act on today, and nobody is let down
    // because a direction stood still. It held only because `attention.js` never
    // mentions growth at all - true by absence, with nothing to catch the first
    // person who wires it in. A stalled thread is the strongest case there is,
    // so it is the one worth pinning.
    ok(api.updateThread(store, id, { marker: "Runs it with me in the room, saying nothing", stance: "agreed", theirWords: "He wants it" }));
    for (let i = 0; i < STALL_AFTER_TALKS; i += 1) {
      ok(api.logGrowthNote(store, { growth: id, at: ago(60 - i * 10), observed: false, now: NOW }));
    }

    const thread = ok(api.growth(store, "Halvar", NOW)).threads.find((/** @type {any} */ t) => t.id === id);
    assert.ok(thread, "the thread has to be readable or this proves nothing");
    assert.equal(thread.stalled, true, "the fixture has to actually be stalled or this proves nothing");
    assert.match(String(thread.asks), /aim wrong, or is the support missing/);

    const now = api.attention(store, NOW);
    const named = [...now.needsYou, ...now.nudges].filter((/** @type {any} */ i) =>
      /design review|aim wrong|support missing|growth|thread/i.test(`${i.what} ${i.why ?? ""}`)
    );
    assert.deepEqual(named, [], `a growth thread reached Now: ${JSON.stringify(named)}`);
  });

  it("puts what he said he would put in beside the stall question, and only there", () => {
    // The stall question asks whether the aim is wrong or the support is
    // missing. Half of that is a judgement; the other half he already wrote
    // down, so the card should not pose the question without carrying the
    // answer. Not carried on a healthy thread: it would be one more line on a
    // card whose whole value is that every line earns its place.
    ok(
      api.updateThread(store, id, {
        marker: "Runs it with me in the room, saying nothing",
        stance: "agreed",
        theirWords: "He wants it",
        offering: "I stop chairing it, and I take the escalations for a quarter"
      })
    );

    const healthy = ok(api.growth(store, "Halvar", NOW)).threads.find((/** @type {any} */ t) => t.id === id);
    assert.ok(healthy);
    assert.equal(healthy.stalled, false, "not stalled yet, so nothing to answer");

    for (let i = 0; i < STALL_AFTER_TALKS; i += 1) {
      ok(api.logGrowthNote(store, { growth: id, at: ago(60 - i * 10), observed: false, now: NOW }));
    }

    const card = prep(store, NOW, { jotDir }).cards.find((/** @type {any} */ c) => c.person === "Halvar");
    assert.ok(card);
    const thread = card.growing.find((/** @type {any} */ t) => t.id === id);
    assert.equal(thread.stalled, true);
    assert.match(
      String(thread.offering),
      /stop chairing it/,
      "the prep card must carry the offering once the thread is stalled"
    );
  });

  it("says an empty offering out loud on a stalled thread, rather than showing nothing", () => {
    // A thread stalled with nothing ever put into it is not a card missing a
    // line - the blank IS the answer to the question the card is asking, and it
    // has to reach the view to be said.
    ok(
      api.updateThread(store, id, {
        marker: "Runs it with me in the room, saying nothing",
        stance: "agreed",
        theirWords: "He wants it",
        offering: ""
      })
    );
    for (let i = 0; i < STALL_AFTER_TALKS; i += 1) {
      ok(api.logGrowthNote(store, { growth: id, at: ago(60 - i * 10), observed: false, now: NOW }));
    }

    const card = prep(store, NOW, { jotDir }).cards.find((/** @type {any} */ c) => c.person === "Halvar");
    assert.ok(card);
    const thread = card.growing.find((/** @type {any} */ t) => t.id === id);
    assert.equal(thread.stalled, true);
    assert.equal(thread.offering, "", "an empty offering has to reach the view as an empty string, not as undefined");
  });

  it("still lets that stalled thread put somebody on the prep page by itself", () => {
    // The other half of the same decision: kept out of Now, but not silenced.
    // If it were only excluded, a stalled direction would be invisible until
    // something else happened to put that person on the page.
    ok(api.updateThread(store, id, { marker: "Runs it with me in the room, saying nothing", stance: "agreed", theirWords: "He wants it" }));
    ok(api.logTouch(store, { subject: "Halvar", kind: "one-to-one", note: "Talked", at: ago(1), now: NOW }));
    for (let i = 0; i < STALL_AFTER_TALKS; i += 1) {
      ok(api.logGrowthNote(store, { growth: id, at: ago(60 - i * 10), observed: false, now: NOW }));
    }

    // Spoke to them yesterday, so no cadence drift and no other reason to be
    // here. The thread's question has to be the thing that earns the card.
    const card = prep(store, NOW, { jotDir }).cards.find((/** @type {any} */ c) => c.person === "Halvar");
    assert.ok(card, "a thread asking something must be able to earn a prep card on its own");
    assert.match(String(card.why), /aim wrong, or is the support missing/, "and it must say that is why");
  });

  it("reports what the form still wants when it opens the thread", () => {
    const opened = ok(api.openThread(store, { person: "Halvar", aim: "Another one", now: NOW }));
    assert.ok(opened.missing.prepare.length > 0);
  });

  it("brings back every deferred question, the driver included", () => {
    // Opening asks one thing, so the other five have to come back on the card -
    // that is the whole argument for deferring them. The driver was the one that
    // did not: it was written as "unknown", which `missing()` treats as an
    // answer, so the question disappeared instead of waiting.
    const opened = ok(api.openThread(store, { person: "Halvar", aim: "Runs the review alone", now: NOW }));
    assert.match(
      opened.missing.prepare.join(" | "),
      /want this, or does the job need it/i,
      `the driver question must still be waiting: ${JSON.stringify(opened.missing.prepare)}`
    );
  });

  it("keeps 'I do not know yet' as an answer once it is actually chosen", () => {
    // The distinction the blank protects: not-yet-asked is not the same fact as
    // asked-and-unsure, and `unknown` is the second one. Choosing it must settle
    // the question rather than leave it on the card forever.
    const opened = ok(
      api.openThread(store, { person: "Halvar", aim: "Owns the release", driver: "unknown", now: NOW })
    );
    assert.doesNotMatch(
      opened.missing.prepare.join(" | "),
      /want this, or does the job need it/i,
      "a driver that was deliberately set to unknown is answered, not missing"
    );
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

  it("stops handing out homework once the thread has ended", () => {
    // The same rule reaching both clients. The card and every agent read
    // `missing` off this call and off the reply to an edit, so leaving it in the
    // domain is what keeps the window and MCP from needing the rule twice.
    ok(api.endThread(store, id, { status: "dropped", why: "not the direction after all", said: true }));
    const seen = ok(api.growth(store, "Halvar", NOW));
    assert.deepEqual(seen.threads[0].missing, { prepare: [], ask: [] });

    const edited = ok(api.updateThread(store, id, { endedWhy: "he wants to go deep on rendering instead" }));
    assert.deepEqual(edited.missing, { prepare: [], ask: [] });
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

  /*
   * The case this whole guard exists for, and it is a real one: a direction let
   * go because the person said they wanted something else, the reason written
   * down, and the ending actually said to them. Every step of that is the
   * responsible path, and the flow used to finish by offering to delete it.
   */
  it("refuses to remove an ended thread, because its reason is the record", () => {
    ok(
      api.endThread(store, id, {
        status: "dropped",
        why: "ingen efterfrågar rollen längre, så vi lägger ner riktningen",
        said: true
      })
    );
    const err = failed(api.removeRow(store, "growth", id));
    assert.match(err, /reason is the record/i);

    const seen = ok(api.growth(store, "Halvar", NOW));
    assert.equal(seen.threads.length, 1, "the thread survived the attempt");
    assert.equal(
      seen.threads[0].fields.endedWhy,
      "ingen efterfrågar rollen längre, så vi lägger ner riktningen"
    );
  });

  /*
   * The most consequential of the three endings, and the one the window never
   * offered a Remove for - so this pins the service side rather than a button.
   * A stated expectation is the wording somebody will be held to; it is the last
   * thing that should be erasable by a click.
   */
  it("refuses it for a stated expectation too, not only a dropped one", () => {
    ok(api.endThread(store, id, { status: "expectation", why: "he leads the review or he stays put" }));
    assert.match(failed(api.removeRow(store, "growth", id)), /reason is the record/i);
  });

  /*
   * The escape hatch has to stay open, or the guard turns a stray field into a
   * permanent row. `endThread` cannot produce this state - it refuses `open` -
   * but `updateThread` can, and a half-typed edit is not a decision.
   */
  it("still removes an open thread that happens to carry an ending reason", () => {
    ok(api.updateThread(store, id, { endedWhy: "typed into the wrong thread" }));
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

  it("asks for the conversation straight away, so a fresh thread cannot go quiet", () => {
    // Opening a direction and never taking it to the person is the most likely
    // way this feature gets abandoned, so it nags on day one rather than after a
    // cadence has passed. Deliberately NOT asking for the marker yet: that comes
    // out of the conversation, and asking first invites him to write the other
    // person's yardstick alone.
    ok(api.openThread(store, { person: "Halvar", aim: "Something", now: NOW }));
    const page = api.prep(store, NOW, { jotDir: dir, nibDir: dir });
    assert.equal(page.cards.length, 1);
    assert.match(page.cards[0].why, /Ask them/);
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

describe("emptying a field", () => {
  /** @type {string} */
  let dir;
  /** @type {import("../src/storage/store.js").TendStore} */
  let store;
  /** @type {string} */
  let id;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "tend-growth-clear-"));
    store = openStore({ dataDir: dir, role: "app", host: "test" });
    ok(api.addPerson(store, { name: "Halvar", relation: "manage-remotely", now: ago(400) }));
    id = ok(
      api.openThread(store, {
        person: "Halvar",
        aim: "A direction",
        alreadySeen: "took over the retro in June",
        offering: "the architecture review",
        now: NOW
      })
    ).id;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("clears the stored value when an empty string is sent", () => {
    // The window used to send nothing for an emptied box, and the service reads
    // an absent field as "leave what was there" - so text moved out of one field
    // and into another came silently back, leaving the same sentence in both.
    ok(api.updateThread(store, id, { alreadySeen: "" }));
    assert.equal(ok(api.growth(store, "Halvar", NOW)).threads[0].fields.alreadySeen, "");
  });

  it("still leaves a field alone when it is not mentioned at all", () => {
    // The other half of the contract, and an agent over MCP relies on it: a patch
    // names what it changes.
    ok(api.updateThread(store, id, { offering: "and a room" }));
    const fields = ok(api.growth(store, "Halvar", NOW)).threads[0].fields;
    assert.equal(fields.offering, "and a room");
    assert.equal(fields.alreadySeen, "took over the retro in June");
  });

  it("clears the horizon when it is sent as null, so it can stop asking", () => {
    ok(api.updateThread(store, id, { horizon: null }));
    const state = ok(api.growth(store, "Halvar", NOW)).threads[0];
    assert.equal(state.fields.horizon, null);
    assert.equal(state.pastHorizon, false);
  });

  it("refuses to empty the cadence, since an interval of nothing is not one", () => {
    assert.match(failed(api.updateThread(store, id, { cadenceDays: 0 })), /positive number of days/);
  });
});

describe("how long since a project was looked at", () => {
  /** @type {string} */
  let dir;
  /** @type {import("../src/storage/store.js").TendStore} */
  let store;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "tend-projects-"));
    store = openStore({ dataDir: dir, role: "app", host: "test" });
    ok(api.addProject(store, { name: "Strandkanten", now: ago(90) }));
    ok(
      api.proposeDuty(store, {
        name: "Project check-in",
        means: "whether you would hear about a problem in time",
        subjectKind: "project",
        cadenceDays: 14,
        evidenceKinds: ["check-in"],
        source: "yours"
      })
    );
    for (const d of store.rows("duties")) {
      ok(api.decideDuty(store, String(d.id), "active"));
    }
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("says today rather than today ago", () => {
    // The helper for this exists so nobody hand-rolls "N days" + " ago", and this
    // view had hand-rolled it - so every project looked at that morning read
    // "today ago".
    ok(api.logTouch(store, { subject: "Strandkanten", kind: "check-in", now: NOW }));
    const seen = api.projects(store, NOW).find((p) => p.name === "Strandkanten");
    assert.equal(seen?.lastLookedAt, "today");
  });

  it("still says how long it has been when it has been a while", () => {
    ok(api.logTouch(store, { subject: "Strandkanten", kind: "check-in", at: ago(20), now: NOW }));
    const seen = api.projects(store, NOW).find((p) => p.name === "Strandkanten");
    assert.match(String(seen?.lastLookedAt), /ago$/);
  });

  it("says never when nobody has looked, rather than counting from nothing", () => {
    const seen = api.projects(store, NOW).find((p) => p.name === "Strandkanten");
    assert.equal(seen?.lastLookedAt, "never");
  });
});
