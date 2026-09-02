/**
 * Tests for the one flag that must not become a promise.
 *
 * A flag on a Nib note tagged Principle is a habit being worked on - "listen
 * longer than it is comfortable" - and it has no done state and no date it is
 * late by. The importer used to make one into a promise like any other, so it
 * aged, went critical, and sat at the top of the shortest and most trusted list
 * in this app asking who was owed a thing nobody had promised.
 *
 * Those flags are not lost: `principlesInNib` reads them for the prep card,
 * where nothing puts a clock on them. What is tested here is only that they stop
 * becoming obligations - and that promises earlier passes already wrote get
 * withdrawn rather than left to age for ever.
 */

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import { indexNib, principleTagId } from "../src/service/nib.js";
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

/**
 * Nib's index, with both tags in the catalog so the Principle one is resolvable.
 *
 * @param {{ id: string, title: string, tags: string[], alerts?: any[] }[]} notes
 */
function writeNib(notes) {
  mkdirSync(join(nibDir, "notes"), { recursive: true });
  writeFileSync(
    join(nibDir, "index.json"),
    JSON.stringify({
      version: 2,
      tags: [
        { id: "tag-one-to-one", name: "1-1", color: "#6f9cff", description: "" },
        { id: "tag-principle", name: "Principle", color: "#b98cff", description: "" }
      ],
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
    }),
    "utf8"
  );
}

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

/** Every commitment the importer derived, filed or queued, with its state. */
const commitments = () =>
  [
    ...store.rows("promises").map((r) => ({ id: String(r.id), state: String(r.state ?? "open") })),
    ...store.rows("pendingPromises").map((r) => ({ id: String(r.id), state: "queued" }))
  ].filter((r) => r.id.startsWith("nib:"));

const alert = (/** @type {string} */ id, /** @type {string} */ text) => ({ id, text, done: false });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tend-practice-"));
  nibDir = mkdtempSync(join(tmpdir(), "tend-practice-nib-"));
  let t = NOW - 1_000_000;
  store = openStore({ dataDir: dir, role: "app", host: "test", now: () => t++ });
  store.create("people", { id: "p-a", name: "Rasmus", relation: "lead-and-manage" });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(nibDir, { recursive: true, force: true });
});

test("the Principle tag is found by id, and by name when the id differs", () => {
  assert.equal(principleTagId([{ id: "tag-principle", name: "Whatever" }]), "tag-principle");
  // A notebook seeded differently: the name is the fallback, because this tag is
  // picked out by Tend rather than chosen in a mapping.
  assert.equal(principleTagId([{ id: "tag-xyz", name: "Principle" }]), "tag-xyz");
  assert.equal(principleTagId([{ id: "tag-xyz", name: "principle" }]), "tag-xyz");
  assert.equal(principleTagId([{ id: "tag-one-to-one", name: "1-1" }]), null);
  // Never throws on a junk or missing catalog - it is read off a file.
  assert.equal(principleTagId(undefined), null);
  assert.equal(principleTagId("nonsense"), null);
});

test("a flag on an ordinary note is still a commitment", () => {
  writeNib([
    { id: "note-11", title: "2026-09-02 1-1", tags: ["tag-one-to-one"], alerts: [alert("a1", "Send the material")] }
  ]);
  bind();
  ok2(indexNib(store, { dir: nibDir }));

  const rows = commitments();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "nib:note-11:a1");
});

test("a flag on a Principle note is not", () => {
  writeNib([
    {
      id: "note-pr",
      title: "2.4 - Listen longer than it is comfortable",
      tags: ["tag-principle"],
      alerts: [alert("p1", "Wait out the silence in every 1-1 this week")]
    }
  ]);
  bind();
  ok2(indexNib(store, { dir: nibDir }));

  assert.deepEqual(commitments(), []);
});

test("the two are told apart in the same pass", () => {
  writeNib([
    { id: "note-11", title: "2026-09-02 1-1", tags: ["tag-one-to-one"], alerts: [alert("a1", "Send the material")] },
    { id: "note-pr", title: "2.4 - Listen longer", tags: ["tag-principle"], alerts: [alert("p1", "Wait out the silence")] }
  ]);
  bind();
  ok2(indexNib(store, { dir: nibDir }));

  assert.deepEqual(
    commitments().map((r) => r.id),
    ["nib:note-11:a1"]
  );
});

test("a note carrying both tags counts as a principle", () => {
  // The cost Nib's own split accepts, and the two have to agree about it: a note
  // that is a principle is one whichever else it is.
  writeNib([
    {
      id: "note-both",
      title: "2026-09-02 1-1",
      tags: ["tag-one-to-one", "tag-principle"],
      alerts: [alert("b1", "Something")]
    }
  ]);
  bind();
  ok2(indexNib(store, { dir: nibDir }));
  assert.deepEqual(commitments(), []);
});

test("a promise an earlier pass imported from it is withdrawn, not left to age", () => {
  /*
   * The upgrade path, and the reason the skip is one definition used twice. Only
   * skipping creation would leave every promise already imported from a
   * principle note sitting there for ever.
   */
  writeNib([
    { id: "note-pr", title: "2.4 - Listen longer", tags: ["tag-one-to-one"], alerts: [alert("p1", "Wait out the silence")] }
  ]);
  bind();
  ok2(indexNib(store, { dir: nibDir }));
  assert.deepEqual(
    commitments().map((r) => r.id),
    ["nib:note-pr:p1"],
    "imported while the note was only a 1-1"
  );

  // Now it is tagged as a principle, which is the correction being made.
  writeNib([
    { id: "note-pr", title: "2.4 - Listen longer", tags: ["tag-principle"], alerts: [alert("p1", "Wait out the silence")] }
  ]);
  ok2(indexNib(store, { dir: nibDir }));

  const rows = commitments();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "nib:note-pr:p1");
  assert.equal(
    rows[0].state,
    "retracted",
    "retracted rather than resolved - tagging a note is no evidence anything got done"
  );
});

test("a notebook with no Principle tag imports everything, as before", () => {
  mkdirSync(join(nibDir, "notes"), { recursive: true });
  writeFileSync(
    join(nibDir, "index.json"),
    JSON.stringify({
      version: 2,
      tags: [{ id: "tag-one-to-one", name: "1-1", color: "", description: "" }],
      categories: [
        {
          id: "cat-team",
          name: "Team",
          subs: [{ id: "sub-a", name: "Rasmus" }],
          notes: [
            {
              id: "note-11",
              categoryId: "cat-team",
              subId: "sub-a",
              title: "2026-09-02 1-1",
              created: NOW - 3 * DAY_MS,
              edited: NOW - 3 * DAY_MS,
              alerts: [alert("a1", "Send the material")],
              flag: "",
              tags: ["tag-one-to-one"]
            }
          ]
        }
      ]
    }),
    "utf8"
  );
  bind();
  ok2(indexNib(store, { dir: nibDir }));
  assert.deepEqual(
    commitments().map((r) => r.id),
    ["nib:note-11:a1"]
  );
});

/** `indexNib` reports a failure as `{ error }` rather than throwing. */
function ok2(/** @type {any} */ result) {
  assert.equal(result.error, undefined, `indexNib failed: ${result.error}`);
  return result;
}
