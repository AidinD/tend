/**
 * Whether the practising is actually happening.
 *
 * The block on Now lists the principles he has flagged in Nib. Three titles
 * every morning says nothing about whether any of it is occurring, which is the
 * same gap between "discussed" and "actually seen" that growth threads and
 * decision marks already close - and a principle had the emptier version of it:
 * the note carries bullets under "how I practise this" and nothing counted
 * whether one ever happened.
 *
 * The test that matters most is the absence of a clock. A count is not a
 * deadline, and a principle with nothing noted is not late.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import * as api from "../src/service/api.js";
import { openStore } from "../src/storage/store.js";
import { DAY_MS } from "../src/domain/time.js";
import { failed, ok } from "./helpers.mjs";

const NOW = 1_800_000_000_000;
/** @param {number} n */
const daysAgo = (n) => NOW - n * DAY_MS;
const PRINCIPLE = "tag-principle";

/** @type {string} */
let dir;
/** @type {string} */
let nib;
/** @type {import("../src/storage/store.js").TendStore} */
let store;

/** @param {string} id @param {string} title @param {any} extra */
const note = (id, title, extra) => ({
  id,
  categoryId: "c1",
  subId: "s1",
  title,
  preview: "",
  created: 1,
  edited: 1,
  pinned: false,
  tint: "",
  alerts: [],
  flag: "",
  kind: "",
  tags: [],
  links: [],
  archived: false,
  hasImage: false,
  hasDrawing: false,
  ...extra
});

/** @param {any[]} notes */
function notebook(notes) {
  writeFileSync(
    join(nib, "index.json"),
    JSON.stringify({
      version: 2,
      tags: [{ id: PRINCIPLE, name: "Principle", color: "", description: "" }],
      categories: [
        {
          id: "c1",
          name: "Böcker",
          color: "",
          scope: "",
          open: true,
          subs: [{ id: "s1", name: "En bok" }],
          notes
        }
      ]
    })
  );
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tend-pm-"));
  nib = mkdtempSync(join(tmpdir(), "tend-pm-nib-"));
  mkdirSync(join(nib, "notes"), { recursive: true });
  process.env.NIB_DATA_DIR = nib;
  let t = NOW - 1_000_000;
  store = openStore({ dataDir: dir, role: "app", host: "test", now: () => t++ });
  notebook([
    note("p1", "Fråga i stället för att kritisera", { tags: [PRINCIPLE], flag: "open" }),
    note("p2", "Lyssna längre", { tags: [PRINCIPLE], flag: "open" }),
    note("p3", "Läst och klar med", { tags: [PRINCIPLE], flag: "done" })
  ]);
});

afterEach(() => {
  delete process.env.NIB_DATA_DIR;
  rmSync(dir, { recursive: true, force: true });
  rmSync(nib, { recursive: true, force: true });
});

/**
 * The flagged principles, with availability already asserted.
 *
 * `practice` answers either a list or a reason it has none, which is the right
 * shape for a caller that has to tell those apart - and awkward in a test that
 * has just written the notebook itself. One helper rather than a guard at every
 * call.
 */
function flagged() {
  const out = api.practice(store, NOW);
  assert.equal(out.available, true, `the notebook could not be read: ${out.why}`);
  const list = out.active;
  assert.ok(Array.isArray(list), "available, but with no list of principles");
  return list;
}

describe("the principles he is working on, with what has been noted", () => {
  it("reads the flagged ones out of Nib and holds no list of its own", () => {
    assert.deepEqual(
      flagged().map((/** @type {any} */ p) => p.title),
      ["Fråga i stället för att kritisera", "Lyssna längre"],
      "an unflagged or finished principle is not one he is working on"
    );
  });

  it("follows the flag when it changes in Nib, with nothing to invalidate", () => {
    /*
     * The reason nothing is cached. He raises and lowers the flag in the app
     * without warning, and a copy here would be a second answer to "what am I
     * practising" that starts disagreeing with the first immediately.
     */
    ok(api.markPractice(store, { note: "p1", now: NOW }));
    assert.equal(flagged().length, 2);

    notebook([note("p1", "Fråga i stället för att kritisera", { tags: [PRINCIPLE], flag: "done" })]);

    assert.equal(flagged().length, 0, "a lowered flag still shows as being practised");
    assert.equal(
      store.rows("practiceMarks").length,
      1,
      "lowering a flag in Nib deleted what Tend had recorded"
    );
  });

  it("counts the occasions against the principle they were noted on", () => {
    ok(api.markPractice(store, { note: "p1", at: daysAgo(3), now: NOW }));
    ok(api.markPractice(store, { note: "p1", at: daysAgo(1), why: "i ett svårt 1-1", now: NOW }));
    ok(api.markPractice(store, { note: "p2", at: daysAgo(9), now: NOW }));

    const all = flagged();
    const first = all.find((/** @type {any} */ p) => p.id === "p1");
    const second = all.find((/** @type {any} */ p) => p.id === "p2");
    assert.equal(first.practised, 2);
    assert.equal(second.practised, 1);
    assert.equal(first.lastAt, daysAgo(1), "the newest occasion is not the one reported");
    assert.equal(first.marks[0].why, "i ett svårt 1-1");
  });

  it("puts no clock on any of it", () => {
    /*
     * THE test. A principle graduates when it starts coming naturally, which is
     * a judgement only he can make from the inside - so nothing here may carry
     * an interval, a due date, an overdue flag or a severity. A count is not a
     * deadline.
     */
    ok(api.markPractice(store, { note: "p1", at: daysAgo(400), now: NOW }));
    const all = flagged();

    for (const p of all) {
      const fields = Object.keys(p);
      const clocked = fields.filter((f) =>
        /due|overdue|interval|cadence|urgency|severity|late|deadline|drift/i.test(f)
      );
      assert.deepEqual(clocked, [], `a practice carries a clock: ${clocked.join(", ")}`);
    }

    const stale = all.find((/** @type {any} */ p) => p.id === "p1");
    assert.equal(stale.practised, 1, "an occasion over a year old stopped counting");
  });

  it("says nothing noted rather than nothing at all", () => {
    // Zero is a real answer and a different one from "not flagged".
    const [first] = flagged();
    assert.ok(first, "nothing is flagged, so this proved nothing");
    assert.equal(first.practised, 0);
    assert.equal(first.lastAt, null);
  });

  it("carries the reason when the notebook cannot be read", () => {
    /*
     * "Nothing is flagged" and "the notebook could not be opened" look identical
     * as an empty block, and only one of them is something to act on.
     */
    rmSync(join(nib, "index.json"), { force: true });
    const out = api.practice(store, NOW);
    assert.equal(out.available, false);
    assert.ok(String(out.why ?? "").length > 0, "it failed without saying why");
  });
});

describe("noting an occasion, and taking it back", () => {
  it("writes nothing into Nib", () => {
    /*
     * The boundary this whole feature sits on. Nib owns the note and the flag;
     * Tend owns only the fact that an occasion happened, which Nib has nowhere
     * to put. An external write to Nib's index while the app is running would be
     * overwritten by the next click anyway - see NIB-CONTRACT.md - so whether
     * Tend may ever write the flag back is a question on the card, not something
     * this does by accident.
     */
    const before = readFileSyncSafe(join(nib, "index.json"));
    ok(api.markPractice(store, { note: "p1", now: NOW }));
    assert.equal(readFileSyncSafe(join(nib, "index.json")), before, "Tend wrote into the notebook");
  });

  it("refuses one that points at no principle", () => {
    assert.match(failed(api.markPractice(store, { note: "  ", now: NOW })), /peka på en princip/);
  });

  it("takes a mark back without touching the note", () => {
    const made = ok(api.markPractice(store, { note: "p1", now: NOW }));
    ok(api.unmarkPractice(store, String(made.id)));
    const after = flagged();
    assert.equal(after[0].practised, 0);
    assert.equal(after.length, 2, "the principle went with the mark");
  });

  it("refuses to unmark something that is not there", () => {
    assert.match(failed(api.unmarkPractice(store, "inte-ett-id")), /Ingen övning/);
  });
});

/** The notebook as bytes, or empty when it is not there. @param {string} path */
function readFileSyncSafe(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}
