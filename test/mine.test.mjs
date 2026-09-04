/**
 * Filing a commitment as his own work.
 *
 * The gap this closes cost eleven tracked action points from one manager
 * meeting: Tend found them, could offer only the other two attendees, and they
 * went nowhere - because he is not a person in his own roster and the only
 * answers were "a promise to somebody" or "discard".
 *
 * The test that matters is the one asserting no promise was written. A promise
 * needs somebody waiting; filing his own work as one inflates the other
 * person's card and puts work that is not about them into their 1-1 prep.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import * as api from "../src/service/api.js";
import { DAY_MS } from "../src/domain/time.js";
import { openStore } from "../src/storage/store.js";
import { ok, failed } from "./helpers.mjs";

const NOW = Date.parse("2026-09-04T09:00:00Z");
/** @param {number} days */
const ago = (days) => NOW - days * DAY_MS;

describe("filing a commitment as mine", () => {
  /** @type {string} */
  let dir;
  /** @type {any} */
  let store;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "tend-mine-"));
    store = openStore({ dataDir: dir, role: "app", host: "test" });
    ok(api.addPerson(store, { name: "Ada", relation: "own-manager", since: ago(100), now: ago(100) }));

    /* A commitment out of a shared note, waiting to be filed. */
    store.create("pendingPromises", {
      id: "pend-1",
      text: "Skriv ihop underlaget till nästa styrgrupp",
      madeAt: ago(4),
      note: "note-9",
      noteTitle: "Chefsmöte 1 september",
      candidates: ["Ada"]
    });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes no promise, which is the entire point", () => {
    ok(api.keepCommitment(store, "pend-1", NOW));

    const promises = store.rows("promises").filter((/** @type {any} */ p) => !p._deleted);
    assert.deepEqual(promises, [], "his own work was filed as a promise to somebody");
  });

  it("and it lands under his own action points", () => {
    ok(api.keepCommitment(store, "pend-1", NOW));

    const mine = api.myActions(store);
    assert.equal(mine.length, 1);
    assert.equal(mine[0].text, "Skriv ihop underlaget till nästa styrgrupp");
    assert.equal(mine[0].noteTitle, "Chefsmöte 1 september");
  });

  it("dates it from when it was agreed, not when it was filed", () => {
    /*
     * The pending row came off a dated note. Using the filing time would make
     * everything filed today look like it started today, which is the ageing
     * the promise rows were careful about for the same reason.
     */
    ok(api.keepCommitment(store, "pend-1", NOW));
    assert.equal(api.myActions(store)[0].at, ago(4));
  });

  it("takes it out of the queue, so it is not offered twice", () => {
    ok(api.keepCommitment(store, "pend-1", NOW));
    const pending = api.pendingCommitments(store);
    const rows = (pending.groups ?? []).flatMap((/** @type {any} */ g) => g.items);
    assert.deepEqual(rows, []);
  });

  it("keeps the id, so a re-import cannot resurrect it", () => {
    /*
     * The same discipline as `assignCommitment`: the id stays taken, so the
     * next pass over the note finds it and writes nothing. It also means
     * filing one row as his own and as a promise is impossible, which is
     * correct - it is one or the other.
     */
    ok(api.keepCommitment(store, "pend-1", NOW));
    failed(api.keepCommitment(store, "pend-1", NOW));
    failed(api.assignCommitment(store, { id: "pend-1", person: "Ada" }));
  });

  it("refuses an id that is not waiting, rather than inventing a row", () => {
    failed(api.keepCommitment(store, "not-a-row", NOW));
  });

  describe("working through them", () => {
    beforeEach(() => {
      ok(api.keepCommitment(store, "pend-1", NOW));
    });

    it("marking one done takes it off the list", () => {
      ok(api.finishMyAction(store, "pend-1", NOW));
      assert.deepEqual(api.myActions(store), []);
    });

    it("but keeps it in the log, because having done it is the record", () => {
      /*
       * `state` rather than removal. The same reasoning as resolving a
       * promise: what he got through is worth more than a tidy list.
       */
      ok(api.finishMyAction(store, "pend-1", NOW));
      const row = store.rows("myActions").find((/** @type {any} */ r) => r.id === "pend-1");
      assert.ok(row, "the row was deleted rather than marked done");
      assert.equal(row.state, "done");
      assert.equal(row.doneAt, NOW);
    });

    it("and refuses an id it does not have", () => {
      failed(api.finishMyAction(store, "nope", NOW));
    });
  });

  describe("the order they come back in", () => {
    it("is oldest first, because this is a list to work through", () => {
      /*
       * Newest-first would put the one from three weeks ago underneath
       * whatever he filed this morning, and that is the one worth seeing.
       */
      store.create("pendingPromises", {
        id: "pend-2",
        text: "Nyare",
        madeAt: ago(1),
        note: "n",
        noteTitle: "Idag"
      });
      store.create("pendingPromises", {
        id: "pend-3",
        text: "Äldst",
        madeAt: ago(30),
        note: "n",
        noteTitle: "För en månad sedan"
      });

      ok(api.keepCommitment(store, "pend-2", NOW));
      ok(api.keepCommitment(store, "pend-3", NOW));
      ok(api.keepCommitment(store, "pend-1", NOW));

      assert.deepEqual(
        api.myActions(store).map((/** @type {any} */ r) => r.text),
        ["Äldst", "Skriv ihop underlaget till nästa styrgrupp", "Nyare"]
      );
    });
  });
});
