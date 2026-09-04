/**
 * Tests for topics: what to raise, as opposed to whether to speak at all.
 *
 * Two of these pin the reasons the feature is separate from duties rather than
 * a flag on one. Raising a topic with one person must not silence it for
 * another, and a topic must be able to put somebody on the prep page on its
 * own - otherwise his own manager, who no duty covers, never appears and the
 * whole upward half is unreachable.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import * as api from "../src/service/api.js";
import { prep } from "../src/service/prep.js";
import { openStore } from "../src/storage/store.js";
import { DAY_MS } from "../src/domain/time.js";
import { TOPIC_SEEDS, TOPICS_PER_CARD, appliesTo, lastRaised, topicsFor } from "../src/domain/topics.js";
import { ok, failed } from "./helpers.mjs";

const NOW = Date.parse("2026-08-25T09:00:00Z");
/** @param {number} days */
const ago = (days) => NOW - days * DAY_MS;

describe("which topics apply to whom", () => {
  it("matches a topic to the relationship type it was written for", () => {
    const topic = { id: "t", relations: ["own-manager"], cadenceDays: 90 };
    assert.equal(appliesTo(topic, { id: "p1", relation: "own-manager" }), true);
    assert.equal(appliesTo(topic, { id: "p2", relation: "equal-lead" }), false);
  });

  it("ignores the relationship entirely when a topic is pinned to a person", () => {
    const topic = { id: "t", person: "p1", relations: [], cadenceDays: 90 };
    assert.equal(appliesTo(topic, { id: "p1", relation: "lead-only" }), true);
    assert.equal(appliesTo(topic, { id: "p2", relation: "lead-only" }), false);
  });

  it("does not apply a topic that is still only proposed", () => {
    const topic = { id: "t", relations: ["own-manager"], cadenceDays: 90, status: "proposed" };
    assert.equal(appliesTo(topic, { id: "p1", relation: "own-manager" }), false);
  });

  it("applies nothing when a topic names neither a relationship nor a person", () => {
    const topic = { id: "t", relations: [], cadenceDays: 90 };
    assert.equal(appliesTo(topic, { id: "p1", relation: "own-manager" }), false);
  });
});

describe("when a topic is due", () => {
  const person = { id: "p1", relation: "own-manager" };
  const topic = { id: "t1", text: "ask", why: "because", relations: ["own-manager"], cadenceDays: 30, since: ago(100) };

  it("is due when it has never been raised and the interval has passed", () => {
    const due = topicsFor({ topics: [topic], raised: [], person, now: NOW });
    assert.equal(due.length, 1);
    assert.equal(due[0].everRaised, false);
    assert.equal(due[0].overdueDays, 70);
  });

  it("is not due yet when the interval has not passed since it was added", () => {
    const fresh = { ...topic, since: ago(5) };
    assert.equal(topicsFor({ topics: [fresh], raised: [], person, now: NOW }).length, 0);
  });

  it("goes quiet once it has been raised, and comes back when it goes stale", () => {
    const justAsked = [{ topic: "t1", person: "p1", at: ago(3) }];
    assert.equal(topicsFor({ topics: [topic], raised: justAsked, person, now: NOW }).length, 0);

    const longAgo = [{ topic: "t1", person: "p1", at: ago(40) }];
    const due = topicsFor({ topics: [topic], raised: longAgo, person, now: NOW });
    assert.equal(due.length, 1);
    assert.equal(due[0].everRaised, true);
  });

  it("counts raising per person, so asking one peer lead does not answer for the others", () => {
    const shared = { ...topic, relations: ["equal-lead"] };
    const askedFirst = [{ topic: "t1", person: "a", at: ago(1) }];
    const a = { id: "a", relation: "equal-lead" };
    const b = { id: "b", relation: "equal-lead" };

    assert.equal(topicsFor({ topics: [shared], raised: askedFirst, person: a, now: NOW }).length, 0);
    assert.equal(topicsFor({ topics: [shared], raised: askedFirst, person: b, now: NOW }).length, 1);
  });

  it("shows the longest-overdue first, and never more than the card holds", () => {
    const many = Array.from({ length: TOPICS_PER_CARD + 3 }, (_, i) => ({
      id: `t${i}`,
      text: `topic ${i}`,
      why: "w",
      relations: ["own-manager"],
      cadenceDays: 10,
      since: ago(20 + i * 10)
    }));
    const due = topicsFor({ topics: many, raised: [], person, now: NOW });
    assert.equal(due.length, TOPICS_PER_CARD);
    assert.ok(due[0].overdueDays > due[1].overdueDays);
  });

  it("reads the last raising, not the first", () => {
    const rows = [
      { topic: "t1", person: "p1", at: ago(90) },
      { topic: "t1", person: "p1", at: ago(2) }
    ];
    assert.equal(lastRaised(rows, "t1", "p1"), ago(2));
  });

  it("ignores a raising that was tombstoned", () => {
    const rows = [{ topic: "t1", person: "p1", at: ago(2), _deleted: true }];
    assert.equal(lastRaised(rows, "t1", "p1"), null);
  });
});

describe("the seeded set", () => {
  it("every seed says what to raise and why it is worth the minutes", () => {
    for (const seed of TOPIC_SEEDS) {
      assert.ok(seed.text.trim().length > 0, `${seed.id} has no text`);
      assert.ok(seed.why.trim().length > 0, `${seed.id} has no reason`);
      assert.ok(seed.cadenceDays > 0, `${seed.id} has no interval`);
      assert.ok(seed.relations.length > 0, `${seed.id} applies to nobody`);
    }
  });

  it("covers both directions he has no other channel for", () => {
    const relations = new Set(TOPIC_SEEDS.flatMap((s) => s.relations));
    assert.ok(relations.has("own-manager"), "nothing upward");
    assert.ok(relations.has("equal-lead"), "nothing sideways");
  });

  it("uses ids that are stable, so re-seeding cannot duplicate the set", () => {
    const ids = TOPIC_SEEDS.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe("topics through the store", () => {
  /** @type {string} */
  let dir;
  /** @type {import("../src/storage/store.js").TendStore} */
  let store;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "tend-topics-"));
    store = openStore({ dataDir: dir, role: "app", host: "test" });
    ok(api.addPerson(store, { name: "Halvar", relation: "own-manager", now: ago(400) }));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("proposes a topic that does nothing until it is accepted", () => {
    const made = ok(api.proposeTopic(store, {
      text: "What does the next level require?",
      why: "The criteria are never written down.",
      cadenceDays: 90,
      relations: ["own-manager"]
    }));

    assert.equal(prep(store, NOW).cards.length, 0, "a proposal must not reach the page");

    ok(api.decideTopic(store, made.id, "active"));
    const after = prep(store, NOW);
    assert.equal(after.cards.length, 1);
    assert.equal(after.cards[0].person, "Halvar");
  });

  it("re-seeding with the same id updates rather than duplicating", () => {
    const seed = { id: "topic-fixed", text: "one", why: "w", cadenceDays: 30, relations: ["own-manager"] };
    ok(api.proposeTopic(store, seed));
    const again = ok(api.proposeTopic(store, { ...seed, text: "two" }));

    assert.equal(again.updated, true);
    const all = api.allTopics(store).filter((t) => t.id === "topic-fixed");
    assert.equal(all.length, 1);
    assert.equal(all[0].text, "two");
  });

  it("refuses a topic that applies to nobody", () => {
    const why = failed(api.proposeTopic(store, { text: "t", why: "w", cadenceDays: 30 }));
    assert.match(why, /relationstyp eller en person/);
  });

  it("refuses to record a conversation that has not happened yet", () => {
    const made = ok(api.proposeTopic(store, {
      text: "t", why: "w", cadenceDays: 30, relations: ["own-manager"], status: "active"
    }));
    const why = failed(api.markRaised(store, { topic: made.id, person: "Halvar", at: NOW + DAY_MS, now: NOW }));
    assert.match(why, /har inte kommit än/);
  });

  it("puts his manager on the prep page even though no duty covers that direction", () => {
    // The point of the test: Halvar has no cadence and no promises, so before
    // topics existed there was no path by which he could ever be prepared for.
    assert.equal(prep(store, NOW).cards.length, 0);

    ok(api.proposeTopic(store, {
      id: "topic-next-level",
      text: "What does the next level require?",
      why: "The criteria are never written down.",
      cadenceDays: 90,
      relations: ["own-manager"],
      status: "active"
    }));

    const card = prep(store, NOW).cards[0];
    assert.equal(card.person, "Halvar");
    assert.match(card.why, /ämne värt att ta upp/);
    assert.equal(card.worthRaising.length, 1);
    assert.equal(card.worthRaising[0].lastRaised, "aldrig");
  });

  it("drops off the card once raised, and says when it was", () => {
    ok(api.proposeTopic(store, {
      id: "topic-next-level",
      text: "What does the next level require?",
      why: "w",
      cadenceDays: 90,
      relations: ["own-manager"],
      status: "active"
    }));
    ok(api.markRaised(store, { topic: "topic-next-level", person: "Halvar", note: "said Q1", now: NOW }));

    assert.equal(prep(store, NOW).cards.length, 0, "just-asked topics are not worth raising again");

    const view = ok(api.topics(store, "Halvar", NOW));
    assert.equal(view.topics.length, 1);
    assert.equal(view.topics[0].lastRaised, "idag");
    assert.equal(view.due.length, 0);
  });

  it("keeps neglect above agenda when both are on the page", () => {
    ok(api.addPerson(store, { name: "Vidar", relation: "manage-remotely", now: ago(400) }));
    ok(api.proposeDuty(store, {
      name: "1-1",
      means: "A recurring conversation.",
      source: "test",
      subjectKind: "person",
      cadenceDays: 14,
      evidenceKinds: ["one-to-one"],
      relations: ["manage-remotely"]
    }));
    for (const duty of store.rows("duties")) {
      ok(api.decideDuty(store, duty.id, "active"));
    }
    ok(api.proposeTopic(store, {
      id: "topic-next-level", text: "t", why: "w", cadenceDays: 90,
      relations: ["own-manager"], status: "active"
    }));

    const cards = prep(store, NOW).cards;
    assert.equal(cards[0].person, "Vidar", "somebody you are behind on outranks a standing question");
    assert.equal(cards[1].person, "Halvar");
  });
});
