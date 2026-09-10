/**
 * One conversation, one contact row - when the conversation is a Nib note.
 *
 * ## The duplication this closes
 *
 * The Nib indexer writes one contact per attendee per note and its text is the
 * note's TITLE. An agent session reading the same note then logged a SECOND
 * contact carrying a summary, and neither writer knew about the other: four
 * conversations in five days were on the page twice, a short row and a long one
 * for the same afternoon.
 *
 * Two things fix it and they are separate claims. The derived row now resolves
 * its text out of Nib on every read, so it is worth having on its own; and a
 * contact of that kind on that day is refused, so the second row is not written.
 *
 * ## What is deliberately NOT fixed
 *
 * The reverse order. An agent that logs before the import runs still produces a
 * pair, because the import will not stand down for a hand row: it cannot tell a
 * genuine second conversation from the note it is about to write, and
 * `shared-meetings.test.mjs` already settles which way to fail - towards a
 * visible duplicate, never towards a conversation the app quietly declined to
 * record. There is a test below that holds that open on purpose.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import * as api from "../src/service/api.js";
import { callTool } from "../src/mcp/tools.js";
import { indexNib } from "../src/service/nib.js";
import { openStore } from "../src/storage/store.js";
import { DAY_MS } from "../src/domain/time.js";
import { failed, ok } from "./helpers.mjs";

const NOW = 1_800_000_000_000;
/** @param {number} n */
const daysAgo = (n) => NOW - n * DAY_MS;
const CASUAL = "tag-casual";

/** @type {string} */
let dir;
/** @type {string} */
let nib;
/** @type {import("../src/storage/store.js").TendStore} */
let store;
/** @type {string} */
let who;

/** @param {string} preview */
function notebook(preview) {
  writeFileSync(
    join(nib, "index.json"),
    JSON.stringify({
      version: 2,
      tags: [{ id: CASUAL, name: "Casual", color: "", description: "" }],
      categories: [
        {
          id: "c1",
          name: "Samtal",
          /* No scope, like the fixture in shared-meetings.test.mjs. A category
             that declares one is filtered by half, and a bound folder that the
             indexer cannot see is skipped rather than imported. */
          subs: [{ id: "s1", name: "En kollega" }],
          notes: [
            {
              id: "note-1",
              categoryId: "c1",
              subId: "s1",
              title: "Kort titel",
              preview,
              created: daysAgo(1),
              edited: daysAgo(1),
              pinned: false,
              tint: "",
              alerts: [],
              flag: "",
              kind: "",
              tags: [CASUAL],
              links: [],
              archived: false,
              hasImage: false,
              hasDrawing: false
            }
          ]
        }
      ]
    })
  );
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tend-nc-"));
  nib = mkdtempSync(join(tmpdir(), "tend-nc-nib-"));
  mkdirSync(join(nib, "notes"), { recursive: true });
  process.env.NIB_DATA_DIR = nib;
  let t = NOW - 1_000_000;
  store = openStore({ dataDir: dir, role: "app", host: "test", now: () => t++ });
  who = String(
    ok(api.addPerson(store, { name: "Testkollega ett", relation: "equal-lead", now: NOW })).id
  );
  notebook("Vad samtalet faktiskt handlade om, med tillräckligt mycket text att vara värd att läsa.");
  const bound = ok(
    api.bindSource(store, {
      people: [who],
      name: "En kollega",
      categoryId: "c1",
      subId: "s1",
      label: "Samtal / En kollega"
    })
  );
  ok(
    api.setSourceRules(store, {
      id: String(bound.id),
      rules: [{ tagId: CASUAL, kind: "casual" }]
    })
  );
});

afterEach(() => {
  delete process.env.NIB_DATA_DIR;
  rmSync(dir, { recursive: true, force: true });
  rmSync(nib, { recursive: true, force: true });
});

describe("a derived contact says what the note says", () => {
  it("reads the note's own words rather than the title it stored", () => {
    /*
     * The precondition for refusing the second row. Without this the history is
     * capped at note titles for ever - `create` on an existing row only fills
     * missing fields, so re-indexing a note that has since been written out
     * leaves the row exactly as it was.
     */
    ok(indexNib(store, { dir: nib }));

    const page = ok(api.person(store, who, NOW));
    const [row] = page.recentContact;
    assert.ok(row, "the import wrote no contact");
    assert.match(String(row.note), /faktiskt handlade om/, "the row still shows only the title");
    assert.equal(row.fromNote, true);
  });

  it("shows a note filled in later, with nothing to re-index", () => {
    // The case that made this necessary: indexed while empty, written out
    // afterwards. The stored row cannot change, so the text cannot be stored.
    notebook("");
    ok(indexNib(store, { dir: nib }));
    assert.equal(ok(api.person(store, who, NOW)).recentContact[0].note, "Kort titel");

    notebook("Skrivet i efterhand, långt efter att raden importerades.");
    assert.match(
      String(ok(api.person(store, who, NOW)).recentContact[0].note),
      /i efterhand/,
      "filling the note in later did not reach the contact row"
    );
  });

  it("falls back to the stored title when the notebook cannot be read", () => {
    /*
     * A closed notebook degrades the page to what it said before rather than
     * emptying it. This is the one thing that must not become a blank row.
     */
    ok(indexNib(store, { dir: nib }));
    rmSync(join(nib, "index.json"), { force: true });

    const [row] = ok(api.person(store, who, NOW)).recentContact;
    assert.equal(row.note, "Kort titel");
    assert.equal(row.fromNote, false, "it claims to have read a notebook that is not there");
  });

  it("leaves a hand-logged contact's own words alone", () => {
    // Only derived rows resolve. A contact he typed is his own record.
    ok(api.logTouch(store, { subject: who, kind: "one-to-one", note: "Mina egna ord", now: NOW }));
    const row = ok(api.person(store, who, NOW)).recentContact.find(
      (/** @type {any} */ t) => t.kind === "one-to-one"
    );
    assert.ok(row, "the hand-logged contact is not on the page");
    assert.equal(row.note, "Mina egna ord");
    assert.equal(row.fromNote, false);
  });
});

describe("the note owns that conversation", () => {
  it("refuses a second contact of the same kind on the same day", () => {
    ok(indexNib(store, { dir: nib }));

    const why = failed(
      api.logTouch(store, {
        subject: who,
        kind: "casual",
        note: "En sammanfattning av samma eftermiddag",
        at: daysAgo(1),
        now: NOW
      })
    );
    assert.match(why, /anteckning i Nib/);
    assert.equal(
      store.rows("touches").filter((t) => String(t.kind) === "casual").length,
      1,
      "the second row was written anyway"
    );
  });

  it("names the row that covers it, so the refusal is checkable", () => {
    ok(indexNib(store, { dir: nib }));
    const out = api.logTouch(store, { subject: who, kind: "casual", at: daysAgo(1), now: NOW });
    assert.ok(/** @type {any} */ (out).covered, "the refusal does not say which row covers it");
  });

  it("allows another kind on the same day, and the same kind on another day", () => {
    /*
     * The refusal is per kind and per day, and both halves matter: a 1-1 and a
     * casual chat on one day are two different things, and the same kind a week
     * later is a different conversation.
     */
    ok(indexNib(store, { dir: nib }));
    ok(api.logTouch(store, { subject: who, kind: "one-to-one", at: daysAgo(1), now: NOW }));
    ok(api.logTouch(store, { subject: who, kind: "casual", at: daysAgo(8), now: NOW }));
  });

  it("lets him say it was a different conversation, and takes his word", () => {
    // Two real conversations of one kind in a day happen, so this asks rather
    // than forbids - and only the window can answer.
    ok(indexNib(store, { dir: nib }));
    ok(
      api.logTouch(store, {
        subject: who,
        kind: "casual",
        note: "Ett annat samtal samma dag",
        at: daysAgo(1),
        anyway: true,
        now: NOW
      })
    );
    assert.equal(store.rows("touches").filter((t) => String(t.kind) === "casual").length, 2);
  });

  it("and an agent cannot say it, however it asks", () => {
    /*
     * The boundary, and the reason `anyway` is forced off after the spread
     * rather than left to the schema: `callTool` does not validate against
     * `additionalProperties`, so a field left to the spread is a field an agent
     * can set. An agent cannot tell a genuine second conversation from the note
     * it just read.
     */
    ok(indexNib(store, { dir: nib }));

    const out = callTool(
      store,
      "tend_log_touch",
      {
        subject: "Testkollega ett",
        kind: "casual",
        note: "En sammanfattning",
        at: daysAgo(1),
        anyway: true
      },
      NOW
    );
    assert.ok(/** @type {any} */ (out).error, "an agent got past the refusal with anyway");
    assert.equal(store.rows("touches").filter((t) => String(t.kind) === "casual").length, 1);
  });
});

describe("what stays open on purpose", () => {
  it("still imports after a hand-logged contact, rather than quietly skipping it", () => {
    /*
     * The reverse order, left as it was. The import cannot tell a genuine second
     * conversation from the note it is about to write, and the rule this repo
     * already settled is to fail towards a duplicate that is on the page and can
     * be deleted, never towards a conversation the app decided not to record.
     *
     * So this pair is still reachable - agent first, import second - and it is
     * an accepted cost rather than an oversight. The refusal above closes the
     * common order, which is the one that produced every case in real data.
     */
    ok(api.logTouch(store, { subject: who, kind: "casual", note: "Först", at: daysAgo(1), now: NOW }));
    const run = ok(indexNib(store, { dir: nib }));
    assert.equal(run.contacts, 1, "the import stood down and the note went unrecorded");
    assert.equal(store.rows("touches").filter((t) => String(t.kind) === "casual").length, 2);
  });
});
