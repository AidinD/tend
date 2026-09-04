/**
 * Tests for Prep: the card you read before a conversation.
 *
 * The two that matter most are the ones about honesty rather than assembly:
 * `openWork` must be null and not empty when the Jot board cannot be read, and
 * the card must say WHY it is on the page. A card that shows nothing because it
 * could not find the board looks exactly like a quiet week.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { PREP_CARDS, prep } from "../src/service/prep.js";
import { workFor } from "../src/service/jot.js";
import { openStore } from "../src/storage/store.js";
import { DAY_MS } from "../src/domain/time.js";

const NOW = 1_800_000_000_000;
/** @param {number} n */
const daysAgo = (n) => NOW - n * DAY_MS;

/** @type {string} */
let dir;
/** @type {string} */
let jotDir;
/** @type {import("../src/storage/store.js").TendStore} */
let store;

/** A board shaped like Jot's, with a category matching a Tend project. */
function writeBoard(/** @type {any} */ board) {
  writeFileSync(join(jotDir, "todos.json"), JSON.stringify(board), "utf8");
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tend-prep-"));
  jotDir = mkdtempSync(join(tmpdir(), "tend-prep-jot-"));
  let t = NOW - 1_000_000;
  store = openStore({ dataDir: dir, role: "app", host: "test", now: () => t++ });

  store.create("duties", {
    id: "d-1to1",
    name: "1-1",
    subjectKind: "person",
    cadenceDays: 14,
    evidenceKinds: ["one-to-one"],
    relations: ["lead-and-manage"],
    status: "active"
  });
  store.create("people", { id: "p-nina", name: "Nina Berg", relation: "lead-and-manage" });
  store.create("people", { id: "p-tom", name: "Tom Ek", relation: "lead-and-manage" });
  store.create("projects", { id: "pr-1", name: "Northwind" });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(jotDir, { recursive: true, force: true });
});

describe("prep", () => {
  it("leaves out anyone in step with nothing outstanding", () => {
    store.create("touches", { id: "t-1", subject: "p-nina", kind: "one-to-one", at: daysAgo(1) });
    store.create("touches", { id: "t-2", subject: "p-tom", kind: "one-to-one", at: daysAgo(1) });

    const result = prep(store, NOW, { jotDir });
    assert.deepEqual(result.cards, [], "a quiet week is an empty page, not a roster");
  });

  it("says why each card is there, in words", () => {
    store.create("touches", { id: "t-1", subject: "p-nina", kind: "one-to-one", at: daysAgo(40) });

    const [card] = prep(store, NOW, { jotDir }).cards;
    assert.equal(card.person, "Nina Berg");
    // Every list in this app says why it is showing you something.
    assert.match(card.why, /1-1/);
    assert.ok(card.behindBy, "and how far behind");
    assert.match(card.lastSpoke, /^för .* sedan$/);
  });

  it('says "idag" and not "för 0 dagar sedan"', () => {
    // `durationOf` answers `today` with no count for nought, and a caller that
    // treated it as zero days read as "Pratade senast för 0 dagar sedan" on
    // every card of somebody seen this morning.
    store.create("touches", { id: "t-1", subject: "p-nina", kind: "one-to-one", at: NOW });
    store.create("promises", { id: "pm-1", person: "p-nina", text: "A thing", madeAt: daysAgo(20), status: "open" });

    const [card] = prep(store, NOW, { jotDir }).cards;
    assert.equal(card.lastSpoke, "idag");
  });

  it("says never when there is no contact at all, not \"never ago\"", () => {
    store.create("promises", { id: "pm-1", person: "p-nina", text: "A thing", madeAt: daysAgo(20), status: "open" });

    const card = prep(store, NOW, { jotDir }).cards.find((c) => c.person === "Nina Berg");
    assert.equal(card.lastSpoke, "aldrig");
  });

  it("finds work in a category named after the workstream, not just the project", () => {
    // The project is often a bucket and the workstream is the specific thing.
    // Matching only on projects produced a card with no open work while the
    // matching Jot category sat right there.
    store.create("touches", { id: "t-1", subject: "p-nina", kind: "one-to-one", at: daysAgo(40) });
    store.create("workstreams", { id: "w-1", name: "Renderingen", owner: "p-nina", project: "pr-1" });
    writeBoard({
      categories: [{ id: "c1", name: "Renderingen" }],
      todos: [{ id: "j1", text: "Byt ut rasteriseraren", status: "in-progress", categoryId: "c1", priority: 0 }]
    });

    const [card] = prep(store, NOW, { jotDir }).cards;
    assert.equal(card.openWork.length, 1);
    assert.equal(card.openWork[0].found, "owner");
  });

  it("puts the worst drift first", () => {
    store.create("touches", { id: "t-1", subject: "p-nina", kind: "one-to-one", at: daysAgo(20) });
    store.create("touches", { id: "t-2", subject: "p-tom", kind: "one-to-one", at: daysAgo(60) });

    const names = prep(store, NOW, { jotDir }).cards.map((c) => c.person);
    assert.deepEqual(names, ["Tom Ek", "Nina Berg"]);
  });

  it("includes somebody in step who is still owed a promise", () => {
    store.create("touches", { id: "t-1", subject: "p-nina", kind: "one-to-one", at: daysAgo(1) });
    store.create("promises", {
      id: "pm-1",
      person: "p-nina",
      text: "Send her the ladder draft",
      madeAt: daysAgo(20),
      status: "open"
    });

    const [card] = prep(store, NOW, { jotDir }).cards;
    assert.equal(card.person, "Nina Berg");
    assert.equal(card.youPromised.length, 1);
    assert.match(card.why, /löfte/);
  });

  it("carries what they own and how long since it was reviewed", () => {
    store.create("touches", { id: "t-1", subject: "p-nina", kind: "one-to-one", at: daysAgo(40) });
    store.create("workstreams", {
      id: "w-1",
      name: "Payout migration",
      owner: "p-nina",
      project: "pr-1",
      level: "theirs"
    });

    const [card] = prep(store, NOW, { jotDir }).cards;
    assert.equal(card.theyOwn.length, 1);
    assert.equal(card.theyOwn[0].name, "Payout migration");
    // The mandate is the field that makes the tool, so it has to reach the card.
    assert.ok(card.theyOwn[0].mandate && card.theyOwn[0].mandate !== "not stated");
    assert.equal(card.theyOwn[0].lastReviewed, "aldrig");
  });

  it("finds open work through a workstream's project, and labels the route", () => {
    store.create("touches", { id: "t-1", subject: "p-nina", kind: "one-to-one", at: daysAgo(40) });
    store.create("workstreams", { id: "w-1", name: "Payout migration", owner: "p-nina", project: "pr-1" });
    writeBoard({
      categories: [{ id: "c1", name: "Northwind" }],
      todos: [
        { id: "j1", text: "Ship the payout change", status: "in-progress", categoryId: "c1", priority: 0 },
        { id: "j2", text: "Something finished", status: "done", categoryId: "c1", priority: 0 }
      ]
    });

    const [card] = prep(store, NOW, { jotDir }).cards;
    assert.equal(card.openWork.length, 1, "done work is not open work");
    assert.equal(card.openWork[0].text, "Ship the payout change");
    assert.equal(card.openWork[0].found, "owner");
  });

  it("says null rather than empty when the board cannot be read", () => {
    // The load-bearing one. "Nothing is open" and "I could not find Jot" are
    // different facts, and a card that renders them identically lies quietly.
    store.create("touches", { id: "t-1", subject: "p-nina", kind: "one-to-one", at: daysAgo(40) });

    const result = prep(store, NOW, { jotDir: join(jotDir, "nowhere") });
    assert.equal(result.jotFound, false);
    assert.equal(result.cards[0].openWork, null);
  });

  it("caps the page and says how many it dropped", () => {
    for (let i = 0; i < PREP_CARDS + 3; i += 1) {
      store.create("people", { id: `p-x${i}`, name: `Person ${i}`, relation: "lead-and-manage" });
      store.create("touches", { id: `t-x${i}`, subject: `p-x${i}`, kind: "one-to-one", at: daysAgo(30 + i) });
    }

    const result = prep(store, NOW, { jotDir });
    assert.equal(result.cards.length, PREP_CARDS);
    assert.ok(result.dropped > 0, "a silent cap reads as a short list");
  });
});

describe("workFor", () => {
  const board = {
    categories: [
      { id: "c1", name: "Northwind" },
      { id: "c2", name: "Elsewhere" }
    ],
    todos: [
      { id: "j1", text: "Ship the payout change", status: "in-progress", categoryId: "c1", priority: 2 },
      { id: "j2", text: "Ask Nina about the ladder", status: "open", categoryId: "c2", priority: 0 },
      { id: "j3", text: "Urgent thing", status: "open", categoryId: "c1", priority: -3 }
    ]
  };

  it("prefers the owner route over a name in the text", () => {
    const found = workFor({ board, name: "Nina Berg", areas: ["Northwind"] });
    // A recorded delegation beats a string match, and both being present must
    // not label the item as the weaker route.
    assert.deepEqual(
      found.map((w) => w.found),
      ["owner", "owner", "named"]
    );
  });

  it("orders owner work by Jot's own convention, lowest number first", () => {
    const found = workFor({ board, name: "Nina Berg", areas: ["Northwind"] });
    assert.equal(found[0].text, "Urgent thing");
  });

  it("matches a first name on a word boundary, not a substring", () => {
    const trap = {
      categories: [{ id: "c1", name: "Anywhere" }],
      todos: [
        { id: "j1", text: "Ninabot deploy", status: "open", categoryId: "c1", priority: 0 },
        { id: "j2", text: "Talk to Nina", status: "open", categoryId: "c1", priority: 0 }
      ]
    };
    const found = workFor({ board: trap, name: "Nina Berg", areas: [] });
    assert.deepEqual(
      found.map((w) => w.text),
      ["Talk to Nina"]
    );
  });

  it("does not match on a name too short to be distinctive", () => {
    const found = workFor({
      board: { categories: [{ id: "c1", name: "X" }], todos: [{ id: "j1", text: "Bo knows", status: "open", categoryId: "c1", priority: 0 }] },
      name: "Bo",
      areas: []
    });
    assert.deepEqual(found, [], "two letters would match half the board");
  });

  it("returns nothing when there is no board, rather than throwing", () => {
    assert.deepEqual(workFor({ board: null, name: "Nina Berg", areas: ["Northwind"] }), []);
  });
});
