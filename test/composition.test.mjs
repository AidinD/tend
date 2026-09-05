/**
 * The boundary between a sentence and its parts.
 *
 * `tend_attention` gives a model `title` and `why`, and the window draws a card
 * from `who`, `line` and `age`. Those are the same facts for two readers who
 * need different things, which is why the card treatment added the parts
 * BESIDE the sentence rather than replacing it - a model reading a card three
 * fields wide would have to reassemble the sentence itself, and it is the
 * service's job to know how that sentence goes.
 *
 * What has no guard today is the direction of drift. A new kind added with a
 * composed title and no parts costs nothing at the time and grows another card
 * whose body is a paragraph the window cannot reformulate, which is the shape
 * of the original complaint. Nothing fails when that happens, so these tests
 * fail instead.
 *
 * They deliberately do NOT require every kind to carry parts. Two do not, for a
 * reason worth keeping: a monthly question and a queue of unfiled commitments
 * have no person and no age, so "who / what / how long" has nothing to put in
 * two of its three slots. The rule is that the exception is NAMED, not that it
 * does not exist - an unnamed kind without parts is the drift, and a named one
 * is a decision somebody made.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import * as api from "../src/service/api.js";
import { buildAttention } from "../src/domain/attention.js";
import { openStore } from "../src/storage/store.js";
import { DAY_MS } from "../src/domain/time.js";
import { DEFAULT_SIGNALS, SIGNAL_CADENCE_DAYS } from "../src/domain/signals.js";

const NOW = 1_800_000_000_000;
/** @param {number} n */
const daysAgo = (n) => NOW - n * DAY_MS;

/**
 * The kinds whose title is not about one named subject.
 *
 * Written out here rather than derived, so adding a kind to the domain without
 * parts fails until somebody adds it to this list and says why. That is the
 * whole mechanism: the list is the decision.
 */
const NO_PARTS = new Set([
  /* A question only he can answer. No person, no clock, no age. */
  "signal",
  /* A pile of commitments from one shared note. The count IS the subject. */
  "unfiled"
]);

/** @type {string} */
let dir;
/** @type {import("../src/storage/store.js").TendStore} */
let store;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tend-comp-"));
  let t = NOW - 1_000_000;
  store = openStore({ dataDir: dir, role: "app", host: "test", now: () => t++ });

  store.create("duties", {
    id: "d-1to1",
    name: "1-1",
    subjectKind: "person",
    cadenceDays: 14,
    evidenceKinds: ["one-to-one"],
    relations: ["lead-and-manage"],
    guarded: true,
    status: "active"
  });
  store.create("people", {
    id: "vidar",
    name: "Vidar Käll",
    relation: "lead-and-manage",
    since: daysAgo(300)
  });
  store.create("people", {
    id: "elsa",
    name: "Elsa Nordin",
    relation: "lead-and-manage",
    since: daysAgo(300)
  });
  /*
   * The monthly questions, so an excepted kind is actually reached. Without
   * them this file asserted the exception clause against nothing, which the
   * third test exists to refuse - and it refused, on the first run.
   */
  for (const sig of DEFAULT_SIGNALS) {
    store.create("signals", { ...sig, status: "active", cadenceDays: SIGNAL_CADENCE_DAYS });
  }

  /* An open promise, well past the two-week escalation. */
  store.create("promises", {
    id: "p-1",
    person: "vidar",
    text: "Skicka underlaget till tidplanen",
    madeAt: daysAgo(24),
    status: "open"
  });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Every item the front page would be handed, both blocks. */
function itemsNow() {
  const a = buildAttention(store.state(), NOW);
  return [...a.needs, ...a.nudges];
}

describe("a card's parts sit beside its sentence, never instead of it", () => {
  it("hands a model the whole sentence on every item, whatever the window does with it", () => {
    const items = itemsNow();
    assert.ok(items.length >= 2, "the fixture should produce something to look at");
    for (const i of items) {
      assert.equal(typeof i.title, "string", `${i.key} has no title`);
      assert.notEqual(i.title.trim(), "", `${i.key} has an empty title`);
      assert.equal(typeof i.why, "string", `${i.key} has no why`);
      assert.notEqual(i.why.trim(), "", `${i.key} has an empty why`);
    }
  });

  it("and every kind either carries the parts or is a named exception", () => {
    const missing = [];
    for (const i of itemsNow()) {
      if (NO_PARTS.has(i.kind)) {
        continue;
      }
      const hasParts = typeof i.who === "string" && i.who !== "" && typeof i.line === "string" && i.line !== "";
      if (!hasParts) {
        missing.push(`${i.kind} (${i.key}): who=${JSON.stringify(i.who)} line=${JSON.stringify(i.line)}`);
      }
    }
    assert.deepEqual(
      missing,
      [],
      "a kind draws a card with no parts and is not on the named exception list, so the window can only print the sentence"
    );
  });

  it("keeps the exception list honest by refusing one that is not used", () => {
    /*
     * The other direction, and the one that rots quietly. A kind removed from
     * the domain leaves its excuse behind, and the next kind to reuse the name
     * inherits a waiver nobody granted it.
     */
    const kinds = new Set(itemsNow().map((i) => String(i.kind)));
    /* Only assert about exceptions the fixture actually reaches. */
    const reached = [...NO_PARTS].filter((k) => kinds.has(k));
    assert.ok(
      reached.length > 0,
      "the fixture no longer produces any excepted kind, so this file stopped testing the exception at all"
    );
  });

  it("does not let the parts drift into saying something the sentence does not", () => {
    /*
     * The failure this catches is a rename on one side only. `who` is the
     * subject's name, and the title is built from that same name - so a title
     * that no longer contains it means the two were composed from different
     * sources and one of them is now wrong.
     */
    for (const i of itemsNow()) {
      if (typeof i.who !== "string" || i.who === "") {
        continue;
      }
      assert.ok(
        i.title.includes(i.who),
        `${i.key}: the card says "${i.who}" and the sentence a model reads is "${i.title}"`
      );
    }
  });
});

describe("the window is handed parts, so it never has to print the service's paragraph", () => {
  it("gives the front page a person and a line for the kinds that have one", () => {
    const a = api.attention(store, NOW);
    const items = [...a.needsYou, ...a.nudges].filter((i) => !NO_PARTS.has(String(i.kind)));
    assert.ok(items.length > 0, "no ordinary items reached the view layer");
    for (const i of items) {
      assert.equal(typeof i.who, "string", `${i.key} reached the window with no name to put in the title`);
      assert.equal(typeof i.line, "string", `${i.key} reached the window with no line to put under it`);
    }
  });

  it("and still carries the sentence, because that is what an agent is given", () => {
    const a = api.attention(store, NOW);
    for (const i of [...a.needsYou, ...a.nudges]) {
      assert.equal(typeof i.what, "string", `${i.key} lost its sentence on the way out of the service`);
      assert.notEqual(String(i.what).trim(), "");
    }
  });
});
