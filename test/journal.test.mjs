/**
 * Tests for the end-of-day entry.
 *
 * Two of them carry the design. Everything is optional, because three required
 * fields produce something invented at eleven at night and invented data is
 * worse than none - it survives, it reads like a fact afterwards, and it poisons
 * the pass that is the entire point. And one entry per day, replaced rather than
 * duplicated, because coming back in the evening to add a line is normal and
 * three partial rows for a Tuesday would make every count over days wrong.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import * as api from "../src/service/api.js";
import { JOURNAL_FIELDS, REVIEW_WINDOW_DAYS, coverage, entriesSince, hasContent } from "../src/domain/journal.js";
import { DAY_MS } from "../src/domain/time.js";
import { openStore } from "../src/storage/store.js";
import { ok, failed } from "./helpers.mjs";

const NOW = Date.parse("2026-08-25T21:00:00Z");
/** @param {number} days */
const ago = (days) => NOW - days * DAY_MS;

describe("the questions", () => {
  it("asks nothing the store already knows", () => {
    // The rule the rest of the app follows. Who he spoke to is derivable, so
    // asking would waste the only thing a form has, which is his attention.
    const names = JOURNAL_FIELDS.map((f) => f.name);
    assert.deepEqual(names, ["took", "avoided", "differently", "notes"]);
    for (const field of JOURNAL_FIELDS) {
      assert.ok(String(field.label).trim().length > 0, `${field.name} has no label`);
      assert.ok(String(field.hint).trim().length > 0, `${field.name} does not say why it is asked`);
    }
  });

  it("counts an entry as written when any single box is filled", () => {
    assert.equal(hasContent({}), false);
    assert.equal(hasContent({ took: "   " }), false, "whitespace is not an answer");
    assert.equal(hasContent({ avoided: "the hard conversation" }), true);
  });
});

describe("how much there is to read", () => {
  /** @param {number[]} days */
  const on = (days) => days.map((d) => ({ at: ago(d), took: "something" }));

  it("says nothing was written rather than implying zero of something", () => {
    const c = coverage([], REVIEW_WINDOW_DAYS);
    assert.equal(c.spread, 0);
    assert.match(c.summary, /Inget skrivet/);
  });

  it("counts days, not rows", () => {
    // Two entries on the same day is one day of material. Counting rows would
    // let an evening of catching up look like a fortnight of habit.
    const c = coverage(
      [
        { at: ago(1), took: "a" },
        { at: ago(1) + 3600_000, avoided: "b" },
        { at: ago(5), took: "c" }
      ],
      30
    );
    assert.equal(c.entries, 3);
    assert.equal(c.spread, 2);
  });

  it("calls a handful thin, and a month of it not", () => {
    assert.equal(coverage(on([1, 2, 3]), 30).thin, true);
    assert.equal(coverage(on([1, 2, 3, 4, 5, 6, 7, 8]), 30).thin, false);
  });

  it("ignores an entry with every box empty", () => {
    const c = coverage([{ at: ago(1) }, { at: ago(2), took: "real" }], 30);
    assert.equal(c.entries, 1);
  });

  it("windows on the date and keeps the newest first", () => {
    const rows = [
      { at: ago(1), took: "yesterday" },
      { at: ago(40), took: "too old" },
      { at: ago(10), took: "last week" }
    ];
    assert.deepEqual(
      entriesSince(rows, NOW, 30).map((e) => e.took),
      ["yesterday", "last week"]
    );
  });
});

describe("through the store", () => {
  /** @type {string} */
  let dir;
  /** @type {import("../src/storage/store.js").TendStore} */
  let store;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "tend-journal-"));
    store = openStore({ dataDir: dir, role: "app", host: "test" });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("keeps an entry with one box filled", () => {
    ok(api.logEntry(store, { avoided: "the conversation with the producer", now: NOW }));
    const view = api.journal(store, NOW);
    assert.equal(view.entries.length, 1);
    assert.equal(view.entries[0].avoided, "the conversation with the producer");
    assert.equal(view.entries[0].took, null, "an empty box is absent, not an empty string");
  });

  it("refuses an entry with nothing in it, rather than storing a blank day", () => {
    assert.match(failed(api.logEntry(store, { now: NOW })), /nothing to keep/);
    assert.equal(store.rows("entries").length, 0);
  });

  it("replaces the day rather than adding a second row for it", () => {
    // Coming back in the evening to add a line is normal. Three partial rows for
    // one Tuesday would make every count over days wrong.
    ok(api.logEntry(store, { took: "meetings", now: NOW }));
    const again = ok(api.logEntry(store, { took: "meetings", avoided: "the review", now: NOW }));

    assert.equal(again.replaced, true);
    assert.equal(store.rows("entries").length, 1);
    const view = api.journal(store, NOW);
    assert.equal(view.entries[0].avoided, "the review");
    assert.equal(view.entries[0].took, "meetings", "the earlier answer survives the edit");
  });

  it("keeps a different day separate", () => {
    ok(api.logEntry(store, { took: "today", now: NOW }));
    ok(api.logEntry(store, { took: "yesterday", at: ago(1), now: NOW }));
    assert.equal(store.rows("entries").length, 2);
  });

  it("refuses a day that has not arrived", () => {
    assert.match(
      failed(api.logEntry(store, { took: "tomorrow", at: NOW + 2 * DAY_MS, now: NOW })),
      /has not arrived yet/
    );
  });

  it("carries the coverage with the entries, so a summary cannot overstate itself", () => {
    ok(api.logEntry(store, { took: "a", now: NOW }));
    ok(api.logEntry(store, { took: "b", at: ago(1), now: NOW }));

    const view = api.journal(store, NOW);
    assert.equal(view.coverage.spread, 2);
    assert.equal(view.coverage.thin, true);
    assert.match(view.coverage.summary, /2 poster över 2 dagar/);
  });

  it("can be removed", () => {
    const made = ok(api.logEntry(store, { took: "a", now: NOW }));
    ok(api.removeRow(store, "entries", String(made.id)));
    assert.equal(api.journal(store, NOW).entries.length, 0);
  });

  it("does not reach the Now view, because nothing here is waiting", () => {
    ok(api.logEntry(store, { avoided: "everything", now: NOW }));
    const a = api.attention(store, NOW);
    assert.equal(a.needsYou.length, 0);
    assert.equal(a.nudges.length, 0);
  });
});
