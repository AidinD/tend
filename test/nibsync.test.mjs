/**
 * Tests for the automatic Nib import.
 *
 * The behaviour under test is not "does indexing work" - tagrules.test.mjs owns
 * that. It is the three ways an unattended job goes wrong: it never runs, it
 * runs and nobody is told, or it fails and says so six times an hour until the
 * warning list is worthless.
 *
 * The watcher itself is exercised against a real directory rather than a fake
 * `fs.watch`, because the bug it exists to avoid is a platform one - a watch
 * held on a file that gets replaced by a rename - and a stub would pass whether
 * or not the real thing works.
 */

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  recentlyWords,
  describeSync,
  idleState,
  startNibSync,
  syncOnce,
  worthWarning
} from "../src/service/nibsync.js";
import { bindSource, setSourceRules } from "../src/service/api.js";
import { openStore } from "../src/storage/store.js";
import { DAY_MS } from "../src/domain/time.js";
import { ok } from "./helpers.mjs";

const NOW = 1_800_000_000_000;

/** @type {string} */
let dir;
/** @type {string} */
let nibDir;
/** @type {import("../src/storage/store.js").TendStore} */
let store;
/** @type {(() => void)[]} */
let cleanups;

/**
 * Write Nib's index the way Nib writes it: a temporary file, then a rename.
 *
 * The rename is the point. A watch on `index.json` itself would follow the file
 * that was replaced and go silent for ever after the first save, which is the
 * failure mode this whole module is arranged around.
 *
 * @param {{ id: string, title: string, tags: string[], alerts?: any[] }[]} notes
 */
function writeNib(notes) {
  mkdirSync(join(nibDir, "notes"), { recursive: true });
  const body = JSON.stringify({
    version: 1,
    tags: [{ id: "tag-one-to-one", name: "1-1", color: "#6f9cff", description: "" }],
    categories: [
      {
        id: "cat-team",
        name: "Team",
        subs: [{ id: "sub-a", name: "Rasmus" }],
        notes: notes.map((note) => ({
          id: note.id,
          categoryId: "cat-team",
          subId: "sub-a",
          title: note.title,
          created: NOW - 3 * DAY_MS,
          edited: NOW - 3 * DAY_MS,
          alerts: note.alerts ?? [],
          flag: "",
          tags: note.tags
        }))
      }
    ]
  });
  const staging = join(nibDir, `index.json.${notes.length}.tmp`);
  writeFileSync(staging, body, "utf8");
  renameSync(staging, join(nibDir, "index.json"));
}

/** Bind Rasmus's folder, with the 1-1 tag meaning a one-to-one. */
function bind() {
  const id = ok(
    bindSource(store, {
      person: "Rasmus",
      categoryId: "cat-team",
      subId: "sub-a",
      label: "Team / Rasmus"
    })
  ).id;
  ok(setSourceRules(store, { id: String(id), rules: [{ tagId: "tag-one-to-one", kind: "1-1" }] }));
  return id;
}

/** Start a sync whose triggers fire fast enough to test, and stop it after. */
function start(/** @type {any} */ opts = {}) {
  const handle = startNibSync({ store, dir: nibDir, settleMs: 20, sweepMs: 30_000, ...opts });
  cleanups.push(handle.stop);
  return handle;
}

/** Wait for a condition the watcher will satisfy, or fail saying it never did. */
async function until(/** @type {() => boolean} */ done, /** @type {string} */ what) {
  for (let waited = 0; waited < 4000; waited += 25) {
    if (done()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(`Timed out waiting for ${what}`);
}

const nibTouches = () => store.rows("touches").filter((t) => t.from === "nib");

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tend-nibsync-"));
  nibDir = mkdtempSync(join(tmpdir(), "tend-nibsync-nib-"));
  cleanups = [];
  let t = NOW - 1_000_000;
  store = openStore({ dataDir: dir, role: "app", host: "test", now: () => t++ });
  store.create("people", { id: "p-a", name: "Rasmus", relation: "lead-and-manage" });
});

afterEach(() => {
  for (const stop of cleanups) {
    stop();
  }
  rmSync(dir, { recursive: true, force: true });
  rmSync(nibDir, { recursive: true, force: true });
});

describe("one pass", () => {
  it("imports on the very first pass, so a window opened after a week is current", () => {
    // The bug this whole module removes: importing existed and only a button
    // called it, so the app's central claim was true for somebody who
    // remembered to press it and stale for everybody else.
    writeNib([{ id: "n1", title: "1-1", tags: ["tag-one-to-one"] }]);
    bind();

    start();

    assert.equal(nibTouches().length, 1);
  });

  it("calls back only when something was actually written", async () => {
    writeNib([{ id: "n1", title: "1-1", tags: ["tag-one-to-one"] }]);
    bind();

    let told = 0;
    const handle = start({ onChange: () => (told += 1) });
    assert.equal(told, 1, "the first pass found a note and should have said so");

    // The same notebook again. Indexing is idempotent, so nothing is written -
    // and a redraw with nothing to redraw is a flicker with no cause.
    handle.run();
    assert.equal(told, 1);
  });

  it("separates nothing-bound-yet from a failure", () => {
    writeNib([{ id: "n1", title: "1-1", tags: ["tag-one-to-one"] }]);

    const state = syncOnce(store, { dir: nibDir, now: NOW });

    // Not "failed". A setup step not taken must not paint a red state for
    // somebody who has done nothing wrong.
    assert.equal(state.outcome, "unbound");
    assert.equal(state.error, null);
  });

  it("reports an unreadable notebook as a failure rather than as an empty one", () => {
    bind();

    const state = syncOnce(store, { dir: join(nibDir, "nowhere"), now: NOW });

    assert.equal(state.outcome, "failed");
    assert.match(String(state.error), /No Nib data/);
    assert.equal(nibTouches().length, 0);
  });

  it("never creates the notebook directory it was pointed at", () => {
    bind();
    const missing = join(nibDir, "not-a-notebook");

    start({ dir: missing });

    // Conjuring an empty notebook would make a wrong NIB_DATA_DIR look like a
    // notebook with nothing in it, which is the one reading that cannot be
    // recovered from by looking at the screen.
    assert.equal(existsSync(missing), false);
  });

  it("survives an import that throws instead of returning", () => {
    const broken = /** @type {any} */ ({
      rows: () => {
        throw new Error("the store fell over");
      }
    });
    const handle = startNibSync({ store: broken, dir: nibDir, sweepMs: 30_000 });
    cleanups.push(handle.stop);

    assert.equal(handle.state().outcome, "failed");
    assert.match(String(handle.state().error), /the store fell over/);
  });
});

describe("noticing a note without being asked", () => {
  it("imports a note saved while the window sat there", async () => {
    writeNib([]);
    bind();
    const handle = start();
    assert.equal(nibTouches().length, 0);

    // Nib saves. The rename is what a real save does, and what a watch on the
    // file rather than the directory would not survive.
    writeNib([{ id: "n1", title: "1-1", tags: ["tag-one-to-one"] }]);

    await until(() => nibTouches().length === 1, "the new note to be imported");
    assert.equal(handle.state().outcome, "changed");
  });

  it("keeps noticing after the file has been replaced once", async () => {
    writeNib([]);
    bind();
    start();

    writeNib([{ id: "n1", title: "First", tags: ["tag-one-to-one"] }]);
    await until(() => nibTouches().length === 1, "the first note");

    writeNib([
      { id: "n1", title: "First", tags: ["tag-one-to-one"] },
      { id: "n2", title: "Second", tags: ["tag-one-to-one"] }
    ]);
    await until(() => nibTouches().length === 2, "the second note");
  });

  it("syncs once for a burst of writes rather than once per write", async () => {
    writeNib([]);
    bind();
    let told = 0;
    start({ onChange: () => (told += 1) });

    for (let i = 1; i <= 4; i += 1) {
      writeNib(
        Array.from({ length: i }, (_, n) => ({
          id: `n${n + 1}`,
          title: `Note ${n + 1}`,
          tags: ["tag-one-to-one"]
        }))
      );
    }

    await until(() => nibTouches().length === 4, "all four notes");
    // A save is several filesystem notifications, and a synced folder makes it
    // more. One redraw per notification is a visible stutter.
    assert.ok(told <= 2, `expected at most two callbacks for one burst, got ${told}`);
  });

  it("stops when told to", async () => {
    writeNib([]);
    bind();
    const handle = start();
    handle.stop();

    writeNib([{ id: "n1", title: "1-1", tags: ["tag-one-to-one"] }]);
    await new Promise((resolve) => setTimeout(resolve, 200));

    assert.equal(nibTouches().length, 0);
  });
});

describe("not shouting about the same failure for ever", () => {
  it("warns the first time and then stays quiet", () => {
    const failing = { ...idleState("d"), outcome: /** @type {const} */ ("failed"), error: "no notebook" };
    assert.equal(worthWarning(idleState("d"), failing), true);
    assert.equal(worthWarning(failing, failing), false);
  });

  it("warns again when the failure changes", () => {
    const first = { ...idleState("d"), outcome: /** @type {const} */ ("failed"), error: "no notebook" };
    const second = { ...first, error: "could not be parsed" };
    assert.equal(worthWarning(first, second), true);
  });

  it("says nothing about a pass that worked", () => {
    const failing = { ...idleState("d"), outcome: /** @type {const} */ ("failed"), error: "x" };
    assert.equal(worthWarning(failing, { ...idleState("d"), outcome: "clean" }), false);
  });

  it("warns once for an unreadable notebook across several sweeps", () => {
    bind();
    /** @type {string[]} */
    const warned = [];
    const handle = start({
      dir: join(nibDir, "nowhere"),
      onWarning: (/** @type {string} */ m) => warned.push(m)
    });

    handle.run();
    handle.run();

    // Two distinct pieces of news on the way in - the directory cannot be
    // watched, and the import failed - and then the same failure three times
    // over, which is the part that must stay quiet.
    const failures = warned.filter((/** @type {string} */ m) => m.startsWith("Importing from Nib failed"));
    assert.equal(failures.length, 1, `expected one import warning, got ${failures.length}`);
    assert.equal(warned.length, 2, `expected two warnings in total, got ${warned.join(" | ")}`);
  });
});

describe("saying what happened", () => {
  it("says nothing new, with a time, rather than going silent", () => {
    // The message a background job has to be able to send. "Nothing new as of a
    // minute ago" is what makes it trustworthy; a summary that only speaks on
    // changes cannot tell you it is alive.
    const state = { ...idleState("d"), at: NOW - 60_000, outcome: /** @type {const} */ ("clean") };
    assert.match(describeSync(state, NOW), /1 minute ago and found nothing new/);
  });

  it("names what it brought in", () => {
    const state = {
      ...idleState("d"),
      at: NOW,
      outcome: /** @type {const} */ ("changed"),
      contacts: 2,
      promises: 1
    };
    const said = describeSync(state, NOW);
    assert.match(said, /2 contact records/);
    assert.match(said, /1 promise/);
    assert.match(said, /just now/);
  });

  it("distinguishes watching from not watching before the first pass", () => {
    assert.match(describeSync({ ...idleState("d"), watching: true }, NOW), /Watching for changes/);
    assert.match(describeSync(idleState("d"), NOW), /Not watching/);
  });

  it("carries the skipped folders through, since a skip is why a person looks quiet", () => {
    const state = {
      ...idleState("d"),
      at: NOW,
      outcome: /** @type {const} */ ("clean"),
      skipped: ["Team / Rasmus: no notes"]
    };
    assert.match(describeSync(state, NOW), /Skipped: Team \/ Rasmus: no notes\./);
  });

  it("words a duration in the unit somebody watching the screen thinks in", () => {
    assert.equal(recentlyWords(null, NOW), "never");
    assert.equal(recentlyWords(NOW - 5_000, NOW), "just now");
    assert.equal(recentlyWords(NOW - 120_000, NOW), "2 minutes ago");
    assert.equal(recentlyWords(NOW - 2 * 60 * 60 * 1000, NOW), "2 hours ago");
    // A clock that moved backwards must not produce "in -3 minutes".
    assert.equal(recentlyWords(NOW + 60_000, NOW), "just now");
  });
});
