/**
 * Tests for the meeting that was booked and did not happen.
 *
 * The one that carries the feature is that a skip satisfies nothing. If
 * recording a cancellation quieted the cadence it was meant to satisfy, writing
 * it down would make the page lie - and the page saying "you still have not had
 * this conversation" is correct precisely because you have not.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import * as api from "../src/service/api.js";
import { expandCadences } from "../src/domain/attention.js";
import { SKIP_WINDOW_DAYS, recentSkips, skipPattern, skipsFor } from "../src/domain/skips.js";
import { DAY_MS } from "../src/domain/time.js";
import { openStore } from "../src/storage/store.js";
import { ok, failed } from "./helpers.mjs";

const NOW = Date.parse("2026-08-25T09:00:00Z");
/** @param {number} days */
const ago = (days) => NOW - days * DAY_MS;

describe("counting skipped meetings", () => {
  const rows = [
    { id: "a", person: "p1", kind: "one-to-one", at: ago(5) },
    { id: "b", person: "p1", kind: "one-to-one", at: ago(20) },
    { id: "c", person: "p1", kind: "casual", at: ago(10) },
    { id: "d", person: "p2", kind: "one-to-one", at: ago(3) },
    { id: "e", person: "p1", kind: "one-to-one", at: ago(SKIP_WINDOW_DAYS + 10) },
    { id: "f", person: "p1", kind: "one-to-one", at: ago(1), _deleted: true }
  ];

  it("counts one kind, one person, inside the window", () => {
    assert.equal(skipsFor(rows, "p1", NOW, "one-to-one"), 2, "the old one and the deleted one do not count");
    assert.equal(skipsFor(rows, "p1", NOW), 3, "without a kind, everything recent counts");
    assert.equal(skipsFor(rows, "p2", NOW, "one-to-one"), 1);
  });

  it("lists the newest first", () => {
    assert.deepEqual(
      recentSkips(rows, "p1").map((s) => s.id),
      ["a", "c", "b", "e"]
    );
  });

  it("says nothing about a single cancellation", () => {
    // One is a week. Two is a pattern. A card that comments on every rearranged
    // meeting is a card that gets skimmed.
    assert.equal(skipPattern(0, "1-1"), null);
    assert.equal(skipPattern(1, "1-1"), null);
    assert.match(String(skipPattern(3, "1-1")), /3 gånger/);
  });
});

describe("recording one", () => {
  /** @type {string} */
  let dir;
  /** @type {import("../src/storage/store.js").TendStore} */
  let store;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "tend-skips-"));
    store = openStore({ dataDir: dir, role: "app", host: "test" });
    ok(api.addPerson(store, { name: "Ada", relation: "manage-remotely", since: ago(400), now: ago(400) }));
    ok(
      api.proposeDuty(store, {
        name: "1-1",
        means: "A recurring conversation.",
        source: "test",
        subjectKind: "person",
        cadenceDays: 14,
        evidenceKinds: ["one-to-one"],
        relations: ["manage-remotely"]
      })
    );
    for (const duty of store.rows("duties")) {
      ok(api.decideDuty(store, duty.id, "active"));
    }
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("does not satisfy the cadence it was meant to satisfy", () => {
    // The whole point. Writing down a cancellation must not quiet the page that
    // says the conversation still has not happened, because it has not.
    const before = expandCadences(store.state(), NOW).find((c) => c.subject.name === "Ada");
    ok(api.logSkip(store, { person: "Ada", kind: "one-to-one", why: "release week", now: NOW }));
    const after = expandCadences(store.state(), NOW).find((c) => c.subject.name === "Ada");

    assert.equal(after?.drift.daysSince, before?.drift.daysSince);
    assert.equal(after?.drift.everHappened, false);
    assert.equal(store.rows("touches").length, 0, "a skip is not contact and must not be stored as one");
  });

  it("keeps the reason in his own words", () => {
    ok(api.logSkip(store, { person: "Ada", kind: "one-to-one", why: "I moved it again", now: NOW }));
    const view = api.skips(store, "Ada", NOW);
    assert.ok(!("error" in view));
    assert.equal(view.recent?.[0].why, "I moved it again");
    assert.equal(view.recent?.[0].when, "idag");
  });

  it("says nothing until it is a pattern, then says how many", () => {
    ok(api.logSkip(store, { person: "Ada", kind: "one-to-one", at: ago(30), now: NOW }));
    assert.equal(/** @type {any} */ (api.skips(store, "Ada", NOW)).pattern, null);

    ok(api.logSkip(store, { person: "Ada", kind: "one-to-one", at: ago(15), now: NOW }));
    assert.match(String(/** @type {any} */ (api.skips(store, "Ada", NOW)).pattern), /2 gånger/);
  });

  it("refuses a day that has not arrived", () => {
    const why = failed(api.logSkip(store, { person: "Ada", kind: "one-to-one", at: NOW + 8 * DAY_MS, now: NOW }));
    assert.match(why, /har inte kommit än/);
    assert.equal(store.rows("skips").length, 0);
  });

  it("refuses something that could never have been with a person", () => {
    const why = failed(api.logSkip(store, { person: "Ada", kind: "check-in", now: NOW }));
    assert.match(why, /not something you can have with a person/);
  });

  it("needs to say what it would have been", () => {
    assert.match(failed(api.logSkip(store, { person: "Ada", kind: "", now: NOW })), /vad det skulle ha varit/);
  });

  it("shows up on the person page beside the contact, not inside it", () => {
    ok(api.logTouch(store, { subject: "Ada", kind: "one-to-one", at: ago(20), now: NOW }));
    ok(api.logSkip(store, { person: "Ada", kind: "one-to-one", why: "release week", now: NOW }));

    const view = api.person(store, "Ada", NOW);
    assert.ok(!("error" in view));
    assert.equal(view.recentContact?.length, 1, "the cancellation is not in the contact list");
    assert.equal(view.skipped?.length, 1);
    assert.equal(view.skipped?.[0].why, "release week");
  });

  it("can be taken back", () => {
    const made = ok(api.logSkip(store, { person: "Ada", kind: "one-to-one", now: NOW }));
    ok(api.removeRow(store, "skips", String(made.id)));
    assert.equal(/** @type {any} */ (api.skips(store, "Ada", NOW)).recent.length, 0);
  });
});
