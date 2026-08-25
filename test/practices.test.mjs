/**
 * Tests for the principles he is working on.
 *
 * The one that matters most is the absence of a clock. A flagged principle is
 * "this is what I am trying to emphasise at the moment", and it graduates when
 * it starts coming naturally - a judgement only he can make from the inside. A
 * date on it would turn a practice into a chore, so nothing here has an interval
 * and nothing here reaches the Now view.
 */

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { PRACTICES_SHOWN, activePractices, forCard, openActionPoints } from "../src/domain/practices.js";
import { principlesInNib } from "../src/service/nib.js";

const PRINCIPLE = "tag-principle";

describe("which principles are being worked on", () => {
  const notes = [
    { id: "a", title: "Ask, do not criticise", tags: [PRINCIPLE], flag: "open" },
    { id: "b", title: "Listen longer", tags: [PRINCIPLE], flag: "" },
    { id: "c", title: "Use their name", tags: [PRINCIPLE], flag: "open" },
    { id: "d", title: "Something else entirely", tags: ["tag-story"], flag: "open" },
    { id: "e", title: "Read but finished with", tags: [PRINCIPLE], flag: "done" }
  ];

  it("takes the flagged principles and nothing else", () => {
    assert.deepEqual(
      activePractices(notes, PRINCIPLE).map((p) => p.id),
      ["a", "c"],
      "an unflagged principle is read, not practised, and a flagged note that is not a principle is neither"
    );
  });

  it("carries where it came from, so the book is visible", () => {
    const found = activePractices(notes, PRINCIPLE, (id) => `Books / ${id.toUpperCase()}`);
    assert.equal(found[0].source, "Books / A");
  });

  it("does not treat a finished flag as active", () => {
    assert.equal(
      activePractices(notes, PRINCIPLE).some((p) => p.id === "e"),
      false
    );
  });
});

describe("what a card shows", () => {
  /** @param {number} n */
  const many = (n) =>
    Array.from({ length: n }, (_, i) => ({ id: `p${i}`, title: `Principle ${i}`, source: "" }));

  it("shows a few and says nothing when that is all of them", () => {
    const card = forCard(many(2));
    assert.equal(card.shown.length, 2);
    assert.equal(card.more, 0);
    assert.equal(card.note, null);
  });

  it("says how many are flagged rather than truncating quietly", () => {
    // The size of the set is itself the thing worth knowing: emphasising six
    // things at once is emphasising none of them, and that is his decision to
    // make rather than a display problem to hide.
    const card = forCard(many(6));
    assert.equal(card.shown.length, PRACTICES_SHOWN);
    assert.equal(card.more, 6 - PRACTICES_SHOWN);
    assert.match(String(card.note), /6 principles/);
    assert.match(String(card.note), /emphasising none/);
  });
});

describe("action points on a principle", () => {
  const notes = [
    {
      id: "n1",
      title: "Make 1-1s a system",
      tags: [PRINCIPLE],
      edited: 200,
      alerts: [
        { id: "x", text: "Write a template and use it for three weeks", done: false },
        { id: "y", text: "Already done this one", done: true }
      ]
    },
    {
      id: "n2",
      title: "Older note",
      tags: [PRINCIPLE],
      edited: 100,
      alerts: [{ id: "z", text: "The one that has waited longest", done: false }]
    },
    {
      id: "n3",
      title: "Not a principle",
      tags: [],
      edited: 50,
      alerts: [{ id: "w", text: "Should not appear", done: false }]
    }
  ];

  it("takes the unfinished ones from principle notes only", () => {
    assert.deepEqual(
      openActionPoints(notes, PRINCIPLE).map((a) => a.id),
      ["z", "x"],
      "oldest first, finished ones dropped, non-principles ignored"
    );
  });

  it("keeps the note it was written on, so the reason is reachable", () => {
    const found = openActionPoints(notes, PRINCIPLE).find((a) => a.id === "x");
    assert.equal(found?.note, "n1");
    assert.equal(found?.noteTitle, "Make 1-1s a system");
  });
});

describe("reading a real notebook", () => {
  /** @type {string} */
  let dir;

  /** @param {any} index */
  const write = (index) => {
    dir = mkdtempSync(join(tmpdir(), "tend-practice-nib-"));
    mkdirSync(join(dir, "notes"), { recursive: true });
    writeFileSync(join(dir, "index.json"), JSON.stringify(index));
  };

  afterEach(() => {
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

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

  it("finds the tag by id and reads the flags", () => {
    write({
      version: 2,
      tags: [{ id: PRINCIPLE, name: "Principle", color: "", description: "" }],
      categories: [
        {
          id: "c1",
          name: "Books",
          color: "",
          scope: "P",
          open: true,
          subs: [{ id: "s1", name: "A book" }],
          notes: [
            note("n1", "Practising this", { tags: [PRINCIPLE], flag: "open" }),
            note("n2", "Read only", { tags: [PRINCIPLE], flag: "" })
          ]
        }
      ]
    });

    const found = principlesInNib(dir);
    assert.equal(found.available, true);
    if (found.available) {
      assert.deepEqual(
        found.practices.map((p) => p.title),
        ["Practising this"]
      );
      assert.equal(found.practices[0].source, "Books / A book");
    }
  });

  it("falls back to the tag's name when the id is not the default", () => {
    write({
      version: 2,
      tags: [{ id: "some-other-id", name: "Principle", color: "", description: "" }],
      categories: [
        {
          id: "c1",
          name: "Books",
          color: "",
          scope: "P",
          open: true,
          subs: [{ id: "s1", name: "A book" }],
          notes: [note("n1", "Practising this", { tags: ["some-other-id"], flag: "open" })]
        }
      ]
    });

    const found = principlesInNib(dir);
    assert.equal(found.available, true);
    if (found.available) {
      assert.equal(found.practices.length, 1);
    }
  });

  it("says why when there is no Principle tag at all", () => {
    // "Nothing is flagged" and "this notebook has no such tag" look identical as
    // an empty block, and only one of them is something to act on.
    write({ version: 2, tags: [], categories: [] });
    const found = principlesInNib(dir);
    assert.equal(found.available, false);
    if (!found.available) {
      assert.match(found.why, /no Principle tag/);
    }
  });
});
