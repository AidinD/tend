/**
 * A commitment the note no longer flags.
 *
 * Found against real data: two sentences from a career story, flagged as part
 * of its structure, imported as promises, unflagged in Nib weeks later, and
 * still sitting at the top of the promise list as the two loudest things in it -
 * critical at two weeks, and never commitments at all.
 *
 * The import already withdrew a CONTACT when its tag came off a note, with a
 * long comment about why that direction matters. Nothing did the same for a
 * promise, so an unflagged block left its obligation behind for ever.
 *
 * Most of what is worth testing here is where it must NOT fire. A wrongly
 * withdrawn contact costs a nudge; a wrongly withdrawn promise hides a real
 * obligation from the one list in the app that must not lie.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import * as api from "../src/service/api.js";
import { derivedPromise, indexNib } from "../src/service/nib.js";
import { openStore } from "../src/storage/store.js";
import { DAY_MS } from "../src/domain/time.js";
import { ok } from "./helpers.mjs";

const NOW = 1_800_000_000_000;
/** @param {number} n */
const daysAgo = (n) => NOW - n * DAY_MS;

/** @type {string} */
let dir;
/** @type {string} */
let nibDir;
/** @type {import("../src/storage/store.js").TendStore} */
let store;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tend-withdrawn-"));
  nibDir = mkdtempSync(join(tmpdir(), "tend-withdrawn-nib-"));
  let t = NOW - 1_000_000;
  store = openStore({ dataDir: dir, role: "app", host: "test", now: () => t++ });
  store.create("people", { id: "sonja", name: "Sonja Ek", relation: "manage-remotely", since: daysAgo(400) });
  store.create("people", { id: "malte", name: "Malte Ry", relation: "manage-remotely", since: daysAgo(400) });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(nibDir, { recursive: true, force: true });
});

/**
 * @param {object} [opts]
 * @param {{ id: string, text: string, done: boolean }[]} [opts.alerts]
 * @param {boolean} [opts.omitNote] Leave the note out of the notebook entirely.
 * @param {boolean} [opts.emptyFolder] Return the folder with no notes at all.
 */
function writeNib({ alerts = [], omitNote = false, emptyFolder = false } = {}) {
  const note = {
    id: "note-1",
    categoryId: "cat-team",
    subId: "sub-sonja",
    title: "2026-09-02 1-1",
    preview: "",
    created: daysAgo(14),
    edited: daysAgo(14),
    alerts,
    flag: "",
    tags: ["tag-one-to-one"]
  };
  writeFileSync(
    join(nibDir, "index.json"),
    JSON.stringify({
      version: 2,
      tags: [{ id: "tag-one-to-one", name: "1-1", color: "#6f9cff", description: "" }],
      categories: [
        {
          id: "cat-team",
          name: "Team",
          subs: [{ id: "sub-sonja", name: "Sonja" }],
          notes: emptyFolder ? [] : omitNote ? [] : [note]
        }
      ]
    }),
    "utf8"
  );
}

/** @param {string[]} people */
function bind(people = ["Sonja"]) {
  const bound = ok(
    api.bindSource(store, { people, categoryId: "cat-team", subId: "sub-sonja", label: "Team / Sonja" })
  );
  ok(
    api.setSourceRules(store, {
      id: String(bound.id),
      rules: [{ tagId: "tag-one-to-one", kind: "one-to-one" }]
    })
  );
  return bound;
}

/**
 * One derived promise row by its alert id, insisting it exists.
 *
 * A helper rather than a non-null assertion at each site: the assertion would
 * let a test pass while the row was missing, and a missing row is precisely the
 * failure these tests exist to catch.
 *
 * @param {string} alertId
 */
function derived(alertId) {
  const row = store.rows("promises").find((p) => String(p.id).endsWith(`:${alertId}`));
  assert.ok(row, `no derived promise for ${alertId}`);
  return row;
}

const TWO = [
  { id: "al-1", text: "Skicka underlaget", done: false },
  { id: "al-2", text: "Boka rummet", done: false }
];

describe("which promise rows this index may touch", () => {
  it("recognises its own and nothing else", () => {
    assert.deepEqual(derivedPromise({ id: "nib:note-1:al-1", from: "nib" }), {
      noteId: "note-1",
      alertId: "al-1"
    });
    // Typed in by hand: somebody's own record, not Nib's to withdraw.
    assert.equal(derivedPromise({ id: "abc-123", from: null }), null);
    assert.equal(derivedPromise({ id: "nib:note-1:al-1", from: null }), null);
    // A contact's four-part id must not be read as a commitment's three.
    assert.equal(derivedPromise({ id: "nib:note-1:sonja:one-to-one", from: "nib" }), null);
  });
});

describe("a flagged block that disappears from the note", () => {
  it("withdraws the promise it left behind", () => {
    writeNib({ alerts: TWO });
    bind();
    ok(indexNib(store, { dir: nibDir }));
    assert.equal(store.rows("promises").length, 2);

    // He unflags one in Nib.
    writeNib({ alerts: [TWO[1]] });
    const run = ok(indexNib(store, { dir: nibDir }));

    assert.equal(run.withdrawn, 1);
    const open = ok(api.promises(store, NOW));
    assert.deepEqual(
      open.map((/** @type {any} */ p) => p.text),
      ["Boka rummet"]
    );
  });

  it("keeps the row rather than deleting it, and does not call it done", () => {
    /*
     * Where this differs from the contact side on purpose. A wrongly withdrawn
     * contact costs a nudge; a wrongly withdrawn promise hides a real
     * obligation, so a mistake here has to be inspectable without reading the
     * event log. And `resolved` would claim it was completed, which unflagging a
     * note is no evidence of.
     */
    writeNib({ alerts: TWO });
    bind();
    ok(indexNib(store, { dir: nibDir }));

    writeNib({ alerts: [TWO[1]] });
    ok(indexNib(store, { dir: nibDir }));

    const row = derived("al-1");
    assert.equal(String(row.state), "retracted", "the row was deleted rather than marked");
    assert.notEqual(String(row.state), "resolved");
  });

  it("does not write it again on the next pass", () => {
    writeNib({ alerts: TWO });
    bind();
    ok(indexNib(store, { dir: nibDir }));
    writeNib({ alerts: [TWO[1]] });
    ok(indexNib(store, { dir: nibDir }));

    const again = ok(indexNib(store, { dir: nibDir }));
    assert.equal(again.withdrawn, 0, "it withdrew the same row twice");
    assert.equal(again.promises, 0, "the unflagged commitment came back");
  });

  it("withdraws a queued commitment the same way", () => {
    writeNib({ alerts: TWO });
    bind(["Sonja", "Malte"]);
    ok(indexNib(store, { dir: nibDir }));
    assert.equal(store.rows("pendingPromises").length, 2);

    writeNib({ alerts: [TWO[1]] });
    const run = ok(indexNib(store, { dir: nibDir }));

    assert.equal(run.withdrawn, 1);
    assert.equal(ok(api.pendingCommitments(store)).count, 1);
  });

  it("reports it in a dry run without writing", () => {
    writeNib({ alerts: TWO });
    bind();
    ok(indexNib(store, { dir: nibDir }));
    writeNib({ alerts: [TWO[1]] });

    const dry = ok(indexNib(store, { dir: nibDir, dry: true }));
    assert.equal(dry.withdrawn, 1);
    assert.equal(ok(api.promises(store, NOW)).length, 2, "a dry run changed something");
  });
});

describe("where it must not fire", () => {
  it("never touches one already resolved", () => {
    // Unflagging the note it came from does not un-happen a thing that happened.
    writeNib({ alerts: TWO });
    bind();
    ok(indexNib(store, { dir: nibDir }));
    ok(api.resolvePromise(store, String(derived("al-1").id), "resolved"));

    writeNib({ alerts: [TWO[1]] });
    const run = ok(indexNib(store, { dir: nibDir }));

    assert.equal(run.withdrawn, 0);
    assert.equal(
      String(derived("al-1").state),
      "resolved"
    );
  });

  it("never touches one typed in by hand", () => {
    writeNib({ alerts: [] });
    bind();
    ok(api.logPromise(store, { person: "Sonja", text: "Something I typed myself", now: NOW }));

    const run = ok(indexNib(store, { dir: nibDir }));
    assert.equal(run.withdrawn, 0);
    assert.equal(ok(api.promises(store, NOW)).length, 1);
  });

  it("survives the folder coming back empty", () => {
    /*
     * The failure that would make this fix the worst bug in the app. Nib closed
     * mid-write, or the wrong data directory, and every commitment ever derived
     * reads as withdrawn. The guard is that only notes actually READ on the pass
     * are considered.
     */
    writeNib({ alerts: TWO });
    bind();
    ok(indexNib(store, { dir: nibDir }));

    writeNib({ emptyFolder: true });
    const run = ok(indexNib(store, { dir: nibDir }));

    assert.equal(run.withdrawn, 0);
    assert.equal(ok(api.promises(store, NOW)).length, 2);
  });

  it("survives the note itself being deleted", () => {
    // Same guard, different cause. A note that is gone says nothing about what
    // was agreed in it.
    writeNib({ alerts: TWO });
    bind();
    ok(indexNib(store, { dir: nibDir }));

    writeNib({ omitNote: true });
    const run = ok(indexNib(store, { dir: nibDir }));

    assert.equal(run.withdrawn, 0);
    assert.equal(ok(api.promises(store, NOW)).length, 2);
  });

  it("leaves a ticked-off block resolved rather than withdrawing it", () => {
    // Ticked and unflagged are different acts with different meanings, and only
    // one of them says the thing was done.
    writeNib({ alerts: TWO });
    bind();
    ok(indexNib(store, { dir: nibDir }));

    writeNib({ alerts: [{ ...TWO[0], done: true }, TWO[1]] });
    const run = ok(indexNib(store, { dir: nibDir }));

    assert.equal(run.withdrawn, 0);
    assert.equal(run.resolved, 1);
    assert.equal(
      String(derived("al-1").state),
      "resolved"
    );
  });
});
