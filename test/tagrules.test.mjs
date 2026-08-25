/**
 * Tests for mapping Nib's tags onto contact kinds.
 *
 * This is the fix for a failure that is invisible from the outside. A Nib folder
 * is one PERSON, not one kind - everything about somebody in one place - so a
 * note written after hearing about them from a colleague sat in the same folder
 * as the 1-1 notes and was counted as a 1-1. The clock reset, the app said the
 * two were in step, and nothing anywhere looked wrong.
 *
 * So most of what is asserted here is about which cadence a note satisfies, and
 * the rest is about the two ways the mapping itself can go quietly wrong: a tag
 * mapped twice, and a rename in Nib.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { indexNib, kindsFor, listNibFolders, listNibTags, nibDataDir } from "../src/service/nib.js";
import { bindSource, myAttentionSignals, person, setSourceRules, sources } from "../src/service/api.js";
import { openStore } from "../src/storage/store.js";
import { DAY_MS } from "../src/domain/time.js";
import { failed, ok } from "./helpers.mjs";

const NOW = 1_800_000_000_000;

/** @type {string} */
let dir;
/** @type {string} */
let nibDir;
/** @type {import("../src/storage/store.js").TendStore} */
let store;

/**
 * A Nib index in the shape Nib writes it, tags and all.
 *
 * @param {{ id: string, title: string, tags: string[], created?: number }[]} notes
 */
function writeNib(notes) {
  mkdirSync(join(nibDir, "notes"), { recursive: true });
  writeFileSync(
    join(nibDir, "index.json"),
    JSON.stringify({
      version: 1,
      tags: [
        { id: "tag-one-to-one", name: "1-1", color: "#6f9cff", description: "" },
        { id: "tag-second-hand", name: "Second-hand", color: "#b98cff", description: "" },
        { id: "tag-feedback", name: "Feedback", color: "#5fd0a0", description: "" },
        { id: "tag-principle", name: "Principle", color: "#9a9da3", description: "" },
        { id: "tag-casual", name: "Casual", color: "#5fd0a0", description: "" }
      ],
      categories: [
        {
          id: "cat-team",
          name: "Team",
          subs: [{ id: "sub-c", name: "Rasmus" }],
          notes: notes.map((note) => ({
            id: note.id,
            categoryId: "cat-team",
            subId: "sub-c",
            title: note.title,
            created: note.created ?? NOW - 3 * DAY_MS,
            edited: note.created ?? NOW - 3 * DAY_MS,
            alerts: [],
            flag: "",
            tags: note.tags
          }))
        }
      ]
    }),
    "utf8"
  );
}

/** Bind the folder as 1-1 and hand back the binding id. */
function bind() {
  return ok(
    bindSource(store, {
      person: "Rasmus",
      categoryId: "cat-team",
      subId: "sub-c",
      label: "Team / Rasmus"
    })
  ).id;
}

const kindsOf = () =>
  store
    .rows("touches")
    .filter((t) => t.from === "nib")
    .map((t) => String(t.kind))
    .sort();

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tend-tags-"));
  nibDir = mkdtempSync(join(tmpdir(), "tend-tags-nib-"));
  let t = NOW - 1_000_000;
  store = openStore({ dataDir: dir, role: "app", host: "test", now: () => t++ });
  store.create("people", { id: "p-c", name: "Rasmus", relation: "lead-and-manage" });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(nibDir, { recursive: true, force: true });
});

describe("which cadence a note satisfies", () => {
  it("counts an untagged note as nothing at all", () => {
    // There is no folder-level default any more, and this is the reason. A
    // folder holds every sort of note about one person, so a default made a
    // note about something you HEARD reset the clock on having SPOKEN to them
    // and the app then said the two were in step. A cadence that has not
    // advanced is an alert you can answer; a false one cannot be checked.
    writeNib([{ id: "n1", title: "Nagot om Rasmus", tags: [] }]);
    bind();
    ok(indexNib(store, { dir: nibDir }));
    assert.deepEqual(kindsOf(), []);
  });

  it("lets a tag override it, which is the whole point", () => {
    // Without this, a note written after hearing about him from somebody else
    // resets the 1-1 clock and the app says they are in step.
    writeNib([{ id: "n1", title: "Vad producenten sa", tags: ["tag-second-hand"] }]);
    const id = bind();
    ok(setSourceRules(store, { id, rules: [{ tagId: "tag-second-hand", kind: "second-hand" }] }));
    ok(indexNib(store, { dir: nibDir }));
    assert.deepEqual(kindsOf(), ["second-hand"]);
  });

  it("counts a note that is honestly two things as both", () => {
    writeNib([{ id: "n1", title: "1-1", tags: ["tag-one-to-one", "tag-feedback"] }]);
    const id = bind();
    ok(
      setSourceRules(store, {
        id,
        rules: [
          { tagId: "tag-one-to-one", kind: "one-to-one" },
          { tagId: "tag-feedback", kind: "feedback" }
        ]
      })
    );
    ok(indexNib(store, { dir: nibDir }));
    assert.deepEqual(kindsOf(), ["feedback", "one-to-one"]);
  });

  it("ignores a tag it has no rule for rather than guessing", () => {
    // Most of Nib's tags mean nothing here - Principle is a book tag and will
    // never be a kind of contact. Silence is the right answer, not a fallback.
    writeNib([{ id: "n1", title: "Princip 1", tags: ["tag-principle"] }]);
    const id = bind();
    ok(setSourceRules(store, { id, rules: [{ tagId: "tag-second-hand", kind: "second-hand" }] }));
    ok(indexNib(store, { dir: nibDir }));
    assert.deepEqual(kindsOf(), []);
  });

  it("stays idempotent across runs, per kind", () => {
    writeNib([{ id: "n1", title: "1-1", tags: ["tag-one-to-one", "tag-feedback"] }]);
    const id = bind();
    ok(
      setSourceRules(store, {
        id,
        rules: [
          { tagId: "tag-one-to-one", kind: "one-to-one" },
          { tagId: "tag-feedback", kind: "feedback" }
        ]
      })
    );

    ok(indexNib(store, { dir: nibDir }));
    const first = ok(indexNib(store, { dir: nibDir }));
    assert.equal(first.contacts, 0, "a second run must write nothing");
    assert.equal(kindsOf().length, 2);
  });

  it("adds only the new kind when a tag is added to a note already indexed", () => {
    writeNib([{ id: "n1", title: "1-1", tags: ["tag-one-to-one"] }]);
    const id = bind();
    ok(setSourceRules(store, { id, rules: [{ tagId: "tag-one-to-one", kind: "one-to-one" }] }));
    ok(indexNib(store, { dir: nibDir }));

    writeNib([{ id: "n1", title: "1-1", tags: ["tag-one-to-one", "tag-feedback"] }]);
    ok(
      setSourceRules(store, {
        id,
        rules: [
          { tagId: "tag-one-to-one", kind: "one-to-one" },
          { tagId: "tag-feedback", kind: "feedback" }
        ]
      })
    );
    const again = ok(indexNib(store, { dir: nibDir }));
    assert.equal(again.contacts, 1);
    assert.deepEqual(kindsOf(), ["feedback", "one-to-one"]);
  });
});

describe("a casual chat", () => {
  it("is contact, but does not reset the 1-1 clock", () => {
    // The whole reason the kind exists. A chat in the kitchen means you HAVE
    // spoken to them - so the signal about people you only hear about
    // second-hand correctly stays quiet - but it is not the recurring
    // conversation with a structure the duty means, and letting it count would
    // let a good week of corridor talk hide a quarter without a real one.
    store.create("duties", {
      id: "d-1to1",
      name: "1-1",
      subjectKind: "person",
      cadenceDays: 14,
      evidenceKinds: ["one-to-one"],
      relations: ["lead-and-manage"],
      status: "active"
    });

    writeNib([{ id: "n1", title: "Snack i köket", tags: ["tag-casual"], created: NOW - DAY_MS }]);
    const id = bind();
    ok(setSourceRules(store, { id, rules: [{ tagId: "tag-casual", kind: "casual" }] }));
    ok(indexNib(store, { dir: nibDir }));

    assert.deepEqual(kindsOf(), ["casual"], "it is recorded as contact");

    const seen = ok(person(store, "Rasmus", NOW));
    assert.equal(seen.recentContact[0].kind, "casual", "and shows in their history");

    const oneToOne = seen.cadences.find((/** @type {any} */ c) => c.duty === "1-1");
    assert.equal(oneToOne?.lastHappened, "never", "but the 1-1 has still never happened");
  });

  it("keeps the person out of the people-I-only-heard-about signal", () => {
    store.create("duties", {
      id: "d-1to1",
      name: "1-1",
      subjectKind: "person",
      cadenceDays: 14,
      evidenceKinds: ["one-to-one"],
      relations: ["lead-and-manage"],
      status: "active"
    });

    writeNib([{ id: "n1", title: "Snack i köket", tags: ["tag-casual"], created: NOW - DAY_MS }]);
    const id = bind();
    ok(setSourceRules(store, { id, rules: [{ tagId: "tag-casual", kind: "casual" }] }));
    ok(indexNib(store, { dir: nibDir }));

    const signals = myAttentionSignals(store, NOW);
    const onlyHeard = signals.find((/** @type {any} */ x) => x.key === "i-have-only-heard-about");
    assert.equal(onlyHeard, undefined, "you did speak to them, however briefly");
  });
});

describe("the rule itself", () => {
  it("is keyed on the tag id, so renaming it in Nib changes nothing here", () => {
    writeNib([{ id: "n1", title: "Vad producenten sa", tags: ["tag-second-hand"] }]);
    const id = bind();
    ok(setSourceRules(store, { id, rules: [{ tagId: "tag-second-hand", kind: "second-hand" }] }));

    // Nib renames the tag. Same id, different word.
    const index = JSON.parse(readFileSync(join(nibDir, "index.json"), "utf8"));
    index.tags[1].name = "Andrahand";
    writeFileSync(join(nibDir, "index.json"), JSON.stringify(index), "utf8");

    ok(indexNib(store, { dir: nibDir }));
    assert.deepEqual(kindsOf(), ["second-hand"]);
  });

  it("keeps one kind per tag, so one note cannot satisfy a cadence twice", () => {
    const id = bind();
    const saved = ok(
      setSourceRules(store, {
        id,
        rules: [
          { tagId: "tag-one-to-one", kind: "one-to-one" },
          { tagId: "tag-one-to-one", kind: "feedback" }
        ]
      })
    );
    assert.equal(saved.rules, 1);
  });

  it("throws away a half-filled row instead of storing it", () => {
    const id = bind();
    const saved = ok(
      setSourceRules(store, {
        id,
        rules: [{ tagId: "tag-one-to-one", kind: "" }, { tagId: "", kind: "feedback" }]
      })
    );
    assert.equal(saved.rules, 0);
  });

  it("refuses a binding that does not exist rather than writing a stray row", () => {
    assert.match(failed(setSourceRules(store, { id: "nope", rules: [] })), /No binding/);
  });

  it("comes back with the binding, so the screen can render it", () => {
    const id = bind();
    ok(setSourceRules(store, { id, rules: [{ tagId: "tag-feedback", kind: "feedback" }] }));
    const listed = ok(sources(store));
    assert.deepEqual(listed[0].rules, [{ tagId: "tag-feedback", kind: "feedback" }]);
  });
});

describe("Nib's index moving on without us", () => {
  it("reads a version 2 index, links and all", () => {
    // Nib went to version 2 and gave every note a `links` array on 2026-08-24.
    // Tend reads that file defensively and never looks at the version at all -
    // asserted rather than assumed, because the two apps ship separately and
    // this is the seam where that stops being true quietly.
    mkdirSync(join(nibDir, "notes"), { recursive: true });
    writeFileSync(
      join(nibDir, "index.json"),
      JSON.stringify({
        version: 2,
        tags: [{ id: "tag-second-hand", name: "Second-hand", color: "#b98cff", description: "" }],
        categories: [
          {
            id: "cat-team",
            name: "Team",
            subs: [{ id: "sub-c", name: "Rasmus" }],
            notes: [
              {
                id: "n1",
                categoryId: "cat-team",
                subId: "sub-c",
                title: "Vad producenten sa",
                created: NOW - DAY_MS,
                edited: NOW - DAY_MS,
                alerts: [],
                flag: "",
                tags: ["tag-second-hand"],
                links: ["n2"],
                archived: false
              }
            ]
          }
        ]
      }),
      "utf8"
    );

    const id = bind();
    ok(setSourceRules(store, { id, rules: [{ tagId: "tag-second-hand", kind: "second-hand" }] }));
    ok(indexNib(store, { dir: nibDir }));
    assert.deepEqual(kindsOf(), ["second-hand"]);
  });
});

describe("reading Nib's catalog", () => {
  it("hands back the tags so the mapping can be built by picking one", () => {
    writeNib([]);
    const catalog = listNibTags(nibDir);
    assert.equal(catalog.available, true);
    assert.deepEqual(
      catalog.available && catalog.tags.map((tag) => tag.name),
      ["1-1", "Second-hand", "Feedback", "Principle", "Casual"]
    );
  });

  it("says why rather than pretending there are none when Nib is unreachable", () => {
    const catalog = listNibTags(join(nibDir, "nowhere"));
    assert.equal(catalog.available, false);
  });

  it("is empty rather than broken on a notebook with no catalog yet", () => {
    mkdirSync(join(nibDir, "empty"), { recursive: true });
    writeFileSync(join(nibDir, "empty", "index.json"), JSON.stringify({ categories: [] }), "utf8");
    const catalog = listNibTags(join(nibDir, "empty"));
    assert.equal(catalog.available, true);
    assert.deepEqual(catalog.available && catalog.tags, []);
  });
});

describe("finding Nib at all", () => {
  it("prefers the environment when the process has it", () => {
    assert.equal(nibDataDir({ env: { NIB_DATA_DIR: "D:\somewhere" }, platform: "win32" }), "D:\somewhere");
  });

  it("falls back to the per-user default off Windows", () => {
    const resolved = nibDataDir({ env: {}, platform: "linux", home: "/home/x" });
    assert.match(resolved, /nib$/);
  });

  it("reports which folder it read, so a wrong one is visible", () => {
    // The whole failure this guards: a machine that has moved its notebook has
    // TWO, the old one still parses and still lists folders, and reading it
    // looks exactly like reading the right one. Saying the path is the only
    // thing that tells them apart.
    writeNib([{ id: "n1", title: "1-1", tags: [] }]);
    const folders = listNibFolders(nibDir);
    assert.equal(folders.available, true);
    assert.equal(folders.available && folders.dir, nibDir);

    const catalog = listNibTags(nibDir);
    assert.equal(catalog.available && catalog.dir, nibDir);
  });
});

describe("kindsFor on its own", () => {
  it("returns nothing when there are no rules at all", () => {
    assert.deepEqual(kindsFor({ tags: ["tag-x"] }, {}, []), []);
  });

  it("does not repeat a kind two tags both map to", () => {
    const kinds = kindsFor({ tags: ["tag-a", "tag-b"] }, {}, [
      { tagId: "tag-a", kind: "feedback" },
      { tagId: "tag-b", kind: "feedback" }
    ]);
    assert.deepEqual(kinds, ["feedback"]);
  });
});
