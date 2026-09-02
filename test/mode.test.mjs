/**
 * Tests for the two stores, and the rule that makes the private one safe.
 *
 * The failure being guarded against is one specific thing: private words written
 * into the work store. Everything asserted here is a step on that path - which
 * directory a mode resolves to, what an unreadable choice falls back to, and
 * whether the private store can end up nested inside the one it must never
 * travel with.
 *
 * The own-part check is tested for what it enforces on the way out and for the
 * one thing it must never do, which is touch the entry.
 */

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { MODES, isMode, resolveModeDir } from "../src/domain/paths.js";
import {
  PRIVATE_RELATIONS,
  hasView,
  homeViewIn,
  isRelationIn,
  personBlocksIn,
  relationOptionsIn,
  viewsIn
} from "../src/domain/halves.js";
import { RELATIONS } from "../src/domain/cadence.js";
import {
  SCOPES_IN_HALF,
  categoriesIn,
  listNibFolders,
  principlesInNib,
  referenceNotes
} from "../src/service/nib.js";
import { search } from "../src/service/knowledge.js";
import * as api from "../src/service/api.js";
import {
  addPerson,
  logMoment,
  momentsFor,
  person,
  setRelation,
  vocabulary
} from "../src/service/api.js";

import { openStore } from "../src/storage/store.js";
import { MODE_ENV, MODE_FILE, readMode, windowTitle, writeMode } from "../src/main/mode.js";
import { checkOwnPart } from "../src/service/model.js";
import { failed, ok } from "./helpers.mjs";

/** @type {string} */
let configDir;

beforeEach(() => {
  configDir = mkdtempSync(join(tmpdir(), "tend-mode-"));
});

afterEach(() => {
  rmSync(configDir, { recursive: true, force: true });
});

describe("which store a mode is", () => {
  const env = { TEND_DATA_DIR: "D:\\somewhere\\tend" };
  const opts = { env, platform: /** @type {const} */ ("win32"), stored: () => null };

  it("leaves the work store exactly where it always was", () => {
    // No migration exists and none should. Everything that ran before there were
    // modes has to keep finding its data in the same place.
    assert.deepEqual(resolveModeDir("work", opts), { dir: "D:\\somewhere\\tend", source: "env" });
  });

  it("puts the private store beside the work one, never inside it", () => {
    const priv = resolveModeDir("private", opts);
    assert.equal(priv.dir, "D:\\somewhere\\tend-private");
    assert.equal(priv.source, "beside-work");
    // Nested, a backup or a sync of the work store would quietly carry the
    // private one along - and the entire point of two stores is that they never
    // travel together.
    assert.equal(priv.dir.startsWith("D:\\somewhere\\tend\\"), false);
  });

  it("derives the private store rather than needing a second variable to set", () => {
    // The first variable took an afternoon to discover was missing. A second one
    // would have the same failure with half the visibility.
    const priv = resolveModeDir("private", opts);
    assert.equal(priv.source, "beside-work");
  });

  it("lets the private store be moved outright, for a different drive", () => {
    const priv = resolveModeDir("private", {
      ...opts,
      env: { ...env, TEND_PRIVATE_DIR: "E:\\vault\\tend" }
    });
    assert.deepEqual(priv, { dir: "E:\\vault\\tend", source: "env" });
  });

  it("reads a moved private store out of the user environment too", () => {
    const priv = resolveModeDir("private", {
      ...opts,
      stored: (/** @type {string} */ name) => (name === "TEND_PRIVATE_DIR" ? "E:\\vault\\tend" : null)
    });
    assert.deepEqual(priv, { dir: "E:\\vault\\tend", source: "user-env" });
  });

  it("knows what is and is not a mode", () => {
    assert.deepEqual([...MODES], ["work", "private"]);
    assert.equal(isMode("private"), true);
    assert.equal(isMode("family"), false);
    assert.equal(isMode(""), false);
  });
});

describe("remembering the choice", () => {
  it("starts in work mode when nothing has been chosen", () => {
    assert.equal(readMode(configDir), "work");
  });

  it("remembers a choice across a launch", () => {
    ok(writeMode(configDir, "private").ok ? {} : { error: "write failed" });
    assert.equal(readMode(configDir), "private");
  });

  it("falls back to work mode for a file it cannot make sense of", () => {
    // Every failure resolves the same way, and it is the one that cannot put
    // private words in the work store.
    writeFileSync(join(configDir, MODE_FILE), "{ not json", "utf8");
    assert.equal(readMode(configDir), "work");

    writeFileSync(join(configDir, MODE_FILE), JSON.stringify({ mode: "family" }), "utf8");
    assert.equal(readMode(configDir), "work");

    writeFileSync(join(configDir, MODE_FILE), JSON.stringify({}), "utf8");
    assert.equal(readMode(configDir), "work");
  });

  it("refuses to write a mode that does not exist", () => {
    const result = writeMode(configDir, /** @type {any} */ ("family"));
    assert.equal(result.ok, false);
    assert.equal(existsSync(join(configDir, MODE_FILE)), false);
  });

  it("reports rather than throws when the choice cannot be saved", () => {
    const result = writeMode(join(configDir, "nowhere", "deeper"), "private");
    assert.equal(result.ok, false);
    // Said out loud, because the alternative is a mode that appears to change
    // and quietly reverts on the next launch.
    assert.match(result.ok === false ? result.why : "", /next start will be in work mode/);
  });

  it("lets the environment decide this launch, for a harness and for a way out", () => {
    writeFileSync(join(configDir, MODE_FILE), JSON.stringify({ mode: "private" }), "utf8");

    // A harness has to be able to state which half it drives rather than inherit
    // one, and a mode you cannot get out of from inside a window that will not
    // open needs an answer that is not editing JSON by hand.
    assert.equal(readMode(configDir, { [MODE_ENV]: "work" }), "work");
    assert.equal(readMode(configDir, {}), "private");
  });

  it("ignores an environment value that is not a mode, rather than failing", () => {
    writeFileSync(join(configDir, MODE_FILE), JSON.stringify({ mode: "private" }), "utf8");
    assert.equal(readMode(configDir, { [MODE_ENV]: "family" }), "private");
    assert.equal(readMode(configDir, { [MODE_ENV]: "  " }), "private");
  });

  it("writes nothing when the environment decided, so it cannot leave a mode behind", () => {
    assert.equal(readMode(configDir, { [MODE_ENV]: "private" }), "private");
    assert.equal(existsSync(join(configDir, MODE_FILE)), false);
  });

  it("carries the mode in the window title, where it is readable unfocused", () => {
    assert.equal(windowTitle("work"), "Tend");
    assert.equal(windowTitle("private"), "Tend - private");
  });
});


describe("what each half consists of", () => {
  it("has an honest answer for a partner's child", () => {
    /*
     * The gap this list shipped with. Neither forced answer was true: "Child"
     * claims a parenthood that is not yours, and "Wider family" claims a
     * gathering relationship when the real one is closer. The fallback was
     * "Someone else" - accurate, and saying nothing.
     *
     * Asserted rather than left to the list, because the vocabulary is the thing
     * somebody reads at the moment they are trying to write down that they got
     * it wrong with a person, and a list that has no word for the relationship is
     * a list that gets answered wrongly on purpose.
     */
    const kind = /** @type {any} */ (PRIVATE_RELATIONS)["partners-child"];
    assert.ok(kind !== undefined, "there is still no way to name a partner's child");
    // Not "stepchild": that word carries a standing this relationship may not
    // have, and the difficulty of it is exactly that the involvement is real and
    // the standing is not.
    assert.equal(/step/i.test(kind.label + kind.choice + kind.note), false);
    assert.match(kind.note, /not yours to set/);
  });

  it("keeps the two relationship vocabularies apart", () => {
    // Not two views of one list. The work types are the input to what somebody is
    // owed; the private ones are labels and drive nothing. Sharing a set would
    // end with the app scheduling what he owes his own family.
    const work = Object.keys(RELATIONS);
    const priv = Object.keys(PRIVATE_RELATIONS);
    assert.equal(work.some((r) => priv.includes(r)), false, "a type belongs to both halves");
    assert.ok(priv.length > 0);
  });

  it("refuses a management relationship for somebody in the private half", () => {
    // The bug that started this: the add dialog offered six management
    // relationships for somebody's family, because the list was a constant in the
    // renderer rather than a question to the service.
    assert.equal(isRelationIn("private", "lead-and-manage"), false);
    assert.equal(isRelationIn("private", "partner"), true);
    assert.equal(isRelationIn("work", "partner"), false);
    assert.equal(isRelationIn("work", "lead-and-manage"), true);
  });

  it("offers each half a scannable choice for every one of its types", () => {
    for (const half of ["work", "private"]) {
      for (const option of relationOptionsIn(half)) {
        assert.ok(option.label.trim().length > 0, `${option.value} has no label`);
        assert.ok(option.choice.trim().length > 0, `${option.value} has no dropdown wording`);
        assert.ok(option.note.trim().length > 0, `${option.value} says nothing on a person's page`);
      }
    }
  });

  it("gives the private half only the views that mean something there", () => {
    const priv = viewsIn("private").map((v) => v.id);
    for (const gone of ["now", "prep", "focus", "work", "role", "decisions", "reflection"]) {
      assert.equal(priv.includes(gone), false, `${gone} is still offered`);
    }
    for (const kept of ["people", "journal", "knowledge", "settings"]) {
      assert.equal(priv.includes(kept), true, `${kept} is missing`);
    }
  });

  it("gives the work half every view, so nothing was lost adding the other one", () => {
    assert.equal(viewsIn("work").length, 11);
  });

  it("opens each half where that half actually begins", () => {
    assert.equal(homeViewIn("work"), "now");
    // Nothing in the private half is late, and the entry is what it is for.
    assert.equal(homeViewIn("private"), "journal");
    assert.equal(hasView("private", homeViewIn("private")), true);
    assert.equal(hasView("work", homeViewIn("work")), true);
  });

  it("lets a promise through to both halves and a growth thread to neither but work", () => {
    const priv = personBlocksIn("private");
    const work = personBlocksIn("work");

    // The one thing that transfers whole: a promise is owed the same way, and the
    // person let down is let down the same way.
    assert.equal(priv.promises, true);
    assert.equal(work.promises, true);

    // A growth thread is a direction you decided somebody should develop in, with
    // a marker you watch for. Run on your own child, the tool is something else.
    assert.equal(priv.growth, false);
    // An observation records the other person's state, which is what the private
    // journal's one rule forbids.
    assert.equal(priv.observations, false);
    assert.equal(priv.cadences, false);
    assert.equal(priv.skips, false);
  });
});

describe("the service, per half", () => {
  /** @type {string} */
  let dir;

  /** @param {"work" | "private"} half */
  const store = (half) => {
    dir = mkdtempSync(join(tmpdir(), `tend-half-${half}-`));
    let t = 1;
    return openStore({ dataDir: dir, role: "app", half, host: "test", now: () => t++ });
  };

  it("accepts the private vocabulary in the private half and refuses the other", () => {
    const s = store("private");
    assert.ok(!("error" in addPerson(s, { name: "Someone", relation: "partner", now: 1 })));
    const refused = addPerson(s, { name: "Else", relation: "lead-and-manage", now: 1 });
    assert.match(String(/** @type {any} */ (refused).error), /Valid here: partner/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("refuses the private vocabulary in the work half", () => {
    const s = store("work");
    const refused = addPerson(s, { name: "Someone", relation: "partner", now: 1 });
    assert.match(String(/** @type {any} */ (refused).error), /Valid here: lead-and-manage/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("refuses to edit somebody into the other half's vocabulary", () => {
    const s = store("private");
    addPerson(s, { name: "Someone", relation: "partner", now: 1 });
    const refused = setRelation(s, "Someone", "manage-remotely");
    assert.match(String(/** @type {any} */ (refused).error), /Valid here/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("tells the window what the half is rather than making it know", () => {
    // The fifth hand-copied list is the one this removes. The previous four all
    // ended with the renderer quietly disagreeing with the service about what
    // existed.
    const s = store("private");
    const v = vocabulary(s);
    assert.equal(v.half, "private");
    assert.equal(v.home, "journal");
    assert.equal(v.defaultRelation, "family");
    assert.deepEqual(
      v.relations.map((r) => r.value).slice(0, 3),
      ["partner", "child", "partners-child"]
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("says on a person's page which blocks that half allows", () => {
    const s = store("private");
    addPerson(s, { name: "Someone", relation: "partner", now: 1 });
    const p = /** @type {any} */ (person(s, "Someone", 1));
    assert.equal(p.blocks.growth, false);
    assert.equal(p.blocks.promises, true);
    assert.match(String(p.relationMeans), /arranged around/);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("the boundary through Nib", () => {
  /** @type {string} */
  let nibDir;

  /** @param {{ id: string, name: string, scope: string, tagged?: boolean }[]} categories */
  const writeNib = (categories) => {
    nibDir = mkdtempSync(join(tmpdir(), "tend-half-nib-"));
    mkdirSync(join(nibDir, "notes"), { recursive: true });
    writeFileSync(
      join(nibDir, "index.json"),
      JSON.stringify({
        version: 2,
        tags: [{ id: "tag-principle", name: "Principle", color: "", description: "" }],
        categories: categories.map((c) => ({
          id: c.id,
          name: c.name,
          scope: c.scope,
          subs: [],
          notes: [
            {
              id: `${c.id}-n1`,
              categoryId: c.id,
              subId: null,
              title: `A note in ${c.name}`,
              preview: "",
              created: 1,
              edited: 1,
              alerts: [],
              flag: "open",
              tags: c.tagged === false ? [] : ["tag-principle"]
            }
          ]
        }))
      }),
      "utf8"
    );
    return nibDir;
  };

  afterEach(() => {
    if (nibDir) {
      rmSync(nibDir, { recursive: true, force: true });
    }
  });

  it("a marked-private folder is not bindable from the work half", () => {
    // The leak that matters, and it is about PEOPLE: a private folder offered as
    // a binding for a colleague would import notes about somebody's family as
    // work contact.
    //
    // The principle read deliberately does NOT follow this rule - see
    // "reference material is not about either half". Scoping that one too was
    // tried and emptied the work half's practice block completely.
    const dir = writeNib([{ id: "c-priv", name: "Family", scope: "P" }]);

    const folders = /** @type {any} */ (listNibFolders(dir, "work"));
    assert.deepEqual(folders.folders, []);
  });

  it("marked work never reaches the private half", () => {
    const dir = writeNib([{ id: "c-work", name: "Team", scope: "W" }]);
    const folders = /** @type {any} */ (listNibFolders(dir, "private"));
    assert.deepEqual(folders.folders, []);
  });

  it("unmarked reaches both, because unmarked is not a declaration", () => {
    // The reference material - notes from books about how to behave with people -
    // is unmarked, and it is neither work-confidential nor family-private.
    // Scoping it to work took it out of the private half's Knowledge view, which
    // is the half where that view is the whole point.
    const dir = writeNib([{ id: "c-any", name: "Books", scope: "" }]);

    for (const half of ["work", "private"]) {
      const folders = /** @type {any} */ (listNibFolders(dir, half));
      assert.equal(folders.folders.length, 1, `unmarked is missing from the ${half} half`);
      assert.equal(/** @type {any} */ (principlesInNib(dir, half)).available, true);
    }
  });

  it("filters at the one door, so a caller cannot forget to", () => {
    // The filter is applied inside `readNibIndex`. Every folder list, note
    // search, principle read and import goes through it, which is the only
    // arrangement that survives somebody adding a caller.
    const categories = [
      { id: "a", name: "A", scope: "" },
      { id: "b", name: "B", scope: "W" },
      { id: "c", name: "C", scope: "P" }
    ];
    assert.deepEqual(
      categoriesIn(categories, "work").map((c) => c.id),
      ["a", "b"]
    );
    assert.deepEqual(
      categoriesIn(categories, "private").map((c) => c.id),
      ["a", "c"]
    );
  });

  it("defaults an unknown half to work rather than to everything", () => {
    const categories = [{ id: "c", name: "C", scope: "P" }];
    // A caller that has not been given a half must not be handed private notes.
    assert.deepEqual(categoriesIn(categories).map((c) => c.id), []);
    assert.deepEqual(categoriesIn(categories, "nonsense").map((c) => c.id), []);
    assert.deepEqual([...SCOPES_IN_HALF.work], ["", "W"]);
  });
});


describe("reference material is not about either half", () => {
  /** @type {string} */
  let nibDir;

  /** @param {{ id: string, name: string, scope: string, tagged?: boolean }[]} categories */
  const writeNib = (categories) => {
    nibDir = mkdtempSync(join(tmpdir(), "tend-reference-nib-"));
    mkdirSync(join(nibDir, "notes"), { recursive: true });
    writeFileSync(
      join(nibDir, "index.json"),
      JSON.stringify({
        version: 2,
        tags: [{ id: "tag-principle", name: "Principle", color: "", description: "" }],
        categories: categories.map((c) => ({
          id: c.id,
          name: c.name,
          scope: c.scope,
          subs: [],
          notes: [
            {
              id: `${c.id}-n1`,
              categoryId: c.id,
              subId: null,
              title: `Listening longer than is comfortable in ${c.name}`,
              preview: "The silence after the question is where the answer comes.",
              created: 1,
              edited: 1,
              alerts: [{ id: `${c.id}-a1`, text: "Try it in the next one", done: false }],
              flag: "open",
              tags: c.tagged === false ? [] : ["tag-principle"]
            }
          ]
        }))
      }),
      "utf8"
    );
    return nibDir;
  };

  afterEach(() => {
    if (nibDir) {
      rmSync(nibDir, { recursive: true, force: true });
    }
  });

  it("reaches a practice the work half would otherwise never see", () => {
    /*
     * The regression this exists for, and it shipped. Against the real notebook
     * EVERY principle note sits in a privately-marked category - the reading and
     * the practices - so scoping the principle read by half left the work half's
     * prep cards with no practice block and its knowledge view with nothing to
     * search. Twenty-five notes, invisible, nothing failing anywhere.
     */
    const dir = writeNib([{ id: "c-books", name: "Books", scope: "P" }]);

    const work = /** @type {any} */ (principlesInNib(dir, "work"));
    assert.equal(work.available, true);
    assert.equal(work.practices.length, 1, "the work half cannot see the practice");
    assert.equal(work.actionPoints.length, 1);
  });

  it("and the private half sees the work half's practices too", () => {
    const dir = writeNib([{ id: "c-team", name: "Team", scope: "W" }]);
    const priv = /** @type {any} */ (principlesInNib(dir, "private"));
    assert.equal(priv.practices.length, 1);
  });

  it("carries nothing untagged across, whichever half it is in", () => {
    // The tag is the boundary here, not the folder. An untagged note in a private
    // category is not reference material and must not answer a work question.
    const dir = writeNib([
      { id: "c-fam", name: "Family", scope: "P", tagged: false },
      { id: "c-team", name: "Team", scope: "W", tagged: false }
    ]);

    assert.deepEqual(referenceNotes(dir), []);
    assert.deepEqual(/** @type {any} */ (principlesInNib(dir, "work")).practices, []);
  });

  it("lets a search reach the reference material without reaching the other half's people", () => {
    const dir = writeNib([
      { id: "c-books", name: "Books", scope: "P" },
      { id: "c-fam", name: "Family", scope: "P", tagged: false },
      { id: "c-team", name: "Team", scope: "W", tagged: false }
    ]);

    const asWork = /** @type {any} */ (search("listening longer", dir, "work"));
    const trails = asWork.matches.map((/** @type {any} */ m) => m.trail);

    // The book note crosses, because he tagged it as a practice.
    assert.ok(trails.includes("Books"), `the reference material is missing: ${trails.join(", ")}`);
    // The untagged private note does not, which is the leak that matters.
    assert.equal(trails.includes("Family"), false, "a private note answered a work question");
  });

  it("counts what it actually searched, so the number is not a lie", () => {
    const dir = writeNib([
      { id: "c-books", name: "Books", scope: "P" },
      { id: "c-team", name: "Team", scope: "W", tagged: false }
    ]);
    // One from this half, one crossing. Reporting the half's count alone would
    // understate what was read - and this number is shown on the screen.
    assert.equal(/** @type {any} */ (search("listening", dir, "work")).searched, 2);
  });

  it("does not count a crossing note twice when it is already in this half", () => {
    const dir = writeNib([{ id: "c-any", name: "Documents", scope: "" }]);
    assert.equal(/** @type {any} */ (search("listening", dir, "work")).searched, 1);
  });

  it("keeps the reference scope out of anything about people", () => {
    // Folder lists and bindings are about people and must stay per half. If this
    // ever reads the reference scope, a private folder becomes bindable as work
    // contact.
    const dir = writeNib([{ id: "c-books", name: "Books", scope: "P" }]);
    assert.deepEqual(/** @type {any} */ (listNibFolders(dir, "work")).folders, []);
    assert.deepEqual([...SCOPES_IN_HALF.reference], ["", "W", "P"]);
  });
});


describe("a moment, and the people it involved", () => {
  /** @type {string} */
  let dir;
  /** @type {import("../src/storage/store.js").TendStore} */
  let store;
  const NOW = Date.parse("2026-08-27T20:00:00Z");

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "tend-moments-"));
    let t = 1;
    store = openStore({ dataDir: dir, role: "app", half: "private", host: "test", now: () => t++ });
    for (const name of ["One", "Two", "Three"]) {
      addPerson(store, { name, relation: "child", now: NOW });
    }
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("is written once and appears on every page it involved", () => {
    /*
     * The version before this tied a moment to one person, and he said what was
     * wrong with it straight away: most of what is worth writing down involves
     * several people at once, and one row per person means writing the same
     * sentence three times. That cost is what stops a thing being written at all.
     */
    ok(
      logMoment(store, {
        people: ["One", "Two", "Three"],
        what: "The tower fell over",
        part: "I got impatient instead of rebuilding it",
        now: NOW
      })
    );

    assert.equal(store.rows("moments").length, 1, "it was stored more than once");
    for (const name of ["One", "Two", "Three"]) {
      const mine = /** @type {any[]} */ (momentsFor(store, name, NOW));
      assert.equal(mine.length, 1, `${name} cannot see it`);
      assert.match(String(mine[0].part), /got impatient/);
    }
  });

  it("says who else was there, because that is a different memory", () => {
    ok(logMoment(store, { people: ["One", "Two"], part: "I was short with them", now: NOW }));
    const [mine] = /** @type {any[]} */ (momentsFor(store, "One", NOW));
    assert.deepEqual(mine.alsoThere, ["Two"]);

    ok(logMoment(store, { people: ["One"], part: "Just the two of us", now: NOW }));
    const [latest] = /** @type {any[]} */ (momentsFor(store, "One", NOW));
    assert.deepEqual(latest.alsoThere, []);
  });

  it("refuses one that says only what somebody else did", () => {
    // The rule this half is written under, made structural. A form is where it
    // holds and good intentions are not.
    const refused = logMoment(store, {
      people: ["One"],
      what: "They slammed the door",
      part: "   ",
      now: NOW
    });
    assert.match(String(/** @type {any} */ (refused).error), /your own part/);
    assert.equal(store.rows("moments").length, 0);
  });

  it("accepts one that is only his own part", () => {
    // "I was short with them" is complete and useful. What happened is often
    // obvious to the person writing it, and demanding it makes the cheap thing
    // expensive.
    ok(logMoment(store, { people: ["One"], part: "I was short with them", now: NOW }));
    assert.equal(/** @type {any[]} */ (momentsFor(store, "One", NOW))[0].what, null);
  });

  it("refuses one with nobody in it", () => {
    const refused = logMoment(store, { people: [], part: "Something", now: NOW });
    assert.match(String(/** @type {any} */ (refused).error), /belongs in the day/);
  });

  it("refuses somebody who is not here, rather than dropping them quietly", () => {
    // Silently keeping the ones it recognised would store a moment that reads as
    // complete and is missing a person.
    const refused = logMoment(store, { people: ["One", "Nobody"], part: "Something", now: NOW });
    assert.ok("error" in /** @type {any} */ (refused));
    assert.equal(store.rows("moments").length, 0);
  });

  it("counts one person once, however many ways they were named", () => {
    const id = String(store.rows("people").find((p) => p.name === "One")?.id);
    ok(logMoment(store, { people: ["One", id], person: "One", part: "Something", now: NOW }));
    assert.deepEqual(store.rows("moments")[0].people, [id]);
  });

  it("refuses a day that has not happened", () => {
    const refused = logMoment(store, {
      people: ["One"],
      part: "Something",
      at: NOW + 3 * 86_400_000,
      now: NOW
    });
    assert.match(String(/** @type {any} */ (refused).error), /has not arrived/);
  });

  it("holds several on one day, because a day holds more than one moment", () => {
    // The distinction that started this: the day is one entry replaced, because
    // the pass over it counts days. A moment is an event, and a day has several.
    ok(logMoment(store, { people: ["One"], part: "First", now: NOW }));
    ok(logMoment(store, { people: ["One"], part: "Second", now: NOW }));
    assert.equal(/** @type {any[]} */ (momentsFor(store, "One", NOW)).length, 2);
  });

  it("lists them all newest first, for the page they are written from", () => {
    ok(logMoment(store, { people: ["One"], part: "Older", at: NOW - 3 * 86_400_000, now: NOW }));
    ok(logMoment(store, { people: ["Two"], part: "Newer", now: NOW }));
    const all = /** @type {any[]} */ (api.moments(store, NOW));
    assert.deepEqual(
      all.map((m) => m.part),
      ["Newer", "Older"]
    );
    assert.deepEqual(all[0].who, ["Two"]);
  });

  it("does not touch the day, which stays about the day and names nobody", () => {
    // Asserted rather than assumed, because the wrong version of this shipped.
    ok(api.logEntry(store, { now: NOW, took: "A day" }));
    assert.equal(store.rows("entries")[0].people, undefined, "the day is naming people again");
  });

  it("is offered in the private half and not in the work half", () => {
    assert.equal(personBlocksIn("private").moments, true);
    // The work half has observations in that slot, and they are a different
    // thing: material a review conversation is built from, so about them.
    assert.equal(personBlocksIn("work").moments, false);
  });
});

describe("reading an entry back against the rule", () => {
  /** A stub that records what it was asked. */
  function stub(/** @type {any} */ value) {
    /** @type {{ prompt: string, system: string, model: string }[]} */
    const calls = [];
    /** @type {any} */
    const askImpl = async (/** @type {any} */ args) => {
      calls.push({ prompt: args.prompt, system: args.system, model: args.model });
      return { ok: true, value, model: "claude-haiku-4-5-20251001", costUsd: 0.001 };
    };
    askImpl.calls = calls;
    return askImpl;
  }

  it("refuses an empty entry rather than paying to read nothing", async () => {
    const askImpl = stub({ lines: [], ok: "" });
    assert.match(failed(await checkOwnPart({ text: "   ", askImpl })), /nothing written/);
    assert.equal(askImpl.calls.length, 0);
  });

  it("states the rule to the model in both directions", async () => {
    const askImpl = stub({ lines: [], ok: "This is all your own part." });
    ok(await checkOwnPart({ text: "It went badly and I got impatient.", askImpl }));

    const system = askImpl.calls[0].system;
    // Both halves, because the rule is not "avoid mentioning them". Describing
    // what somebody did is often the entire point; the claim about what they ARE
    // is what breaks it, and a check that flagged every mention of another
    // person would flag every sentence in a journal about a family.
    assert.match(system, /their own part in it/);
    assert.match(system, /somebody DID or SAID is fine/);
  });

  it("names the Swedish letters it is asking the model to keep", async () => {
    /*
     * The instruction that protects a Swedish quote had itself been written with
     * the letters stripped: "keep a, a and o with their diacritics". Which is not
     * a small typo - it is an instruction that cannot do its job, and the failure
     * it lets through is a quote that looks like somebody's words while not being
     * them. This test exists because the stripping is a writing habit rather than
     * an encoding fault, so it can come back through any edit.
     */
    const askImpl = stub({ lines: [], ok: "" });
    ok(await checkOwnPart({ text: "Det gick tr\u00f6gt.", askImpl }));

    const system = askImpl.calls[0].system;
    for (const letter of ["\u00e5", "\u00e4", "\u00f6"]) {
      assert.ok(system.includes(letter), `the house rules do not contain ${letter} itself`);
    }
  });

  it("uses the cheap tier, because a per-evening check that costs real money gets turned off", async () => {
    const askImpl = stub({ lines: [], ok: "" });
    ok(await checkOwnPart({ text: "A day.", askImpl }));
    assert.match(askImpl.calls[0].model, /haiku/);
  });

  it("drops a finding with no quote, since there would be nothing to look at", async () => {
    const askImpl = stub({
      lines: [
        { quote: "   ", instead: "something" },
        { quote: "she was impossible", instead: "I could not reach her" }
      ],
      ok: ""
    });
    const result = ok(await checkOwnPart({ text: "she was impossible", askImpl }));

    assert.equal(result.lines.length, 1);
    assert.equal(result.lines[0].quote, "she was impossible");
  });

  it("returns the clean answer rather than an empty result", async () => {
    // A check that only ever speaks up when something is wrong reads as an
    // accusation waiting to happen.
    const askImpl = stub({ lines: [], ok: "Every line here is about what you did." });
    const result = ok(await checkOwnPart({ text: "I stayed quiet.", askImpl }));

    assert.deepEqual(result.lines, []);
    assert.equal(result.ok, "Every line here is about what you did.");
  });

  it("takes no store and so cannot write anything at all", () => {
    // Structural rather than asserted: the function's only argument is the text.
    // There is no store to write an entry back into, which is a stronger
    // guarantee than a test that checks it did not.
    assert.equal(checkOwnPart.length, 1);
  });
});
