/**
 * Tests for searching by situation.
 *
 * The local pass is a word match and is meant to be - so what is worth asserting
 * is not that it is clever, but that it narrows honestly: a title hit outranks a
 * passing mention, common words narrow nothing, and a search that finds nothing
 * says nothing rather than returning the whole notebook.
 *
 * The model pass is asserted for the two things that would be a betrayal rather
 * than a bug: it reads ONLY the notes handed to it, and it never invents a hit
 * for a note that was not among them.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { consider, search } from "../src/service/knowledge.js";
import { failed, ok } from "./helpers.mjs";

/** @type {string} */
let dir;

/**
 * A notebook shaped like his: a book folder of principles and a person folder
 * of conversations.
 *
 * @param {{ id: string, cat: string, sub?: string, title: string, preview?: string, html?: string }[]} notes
 */
function writeNotebook(notes) {
  mkdirSync(join(dir, "notes"), { recursive: true });

  /** @type {Map<string, any>} */
  const categories = new Map();
  for (const note of notes) {
    if (!categories.has(note.cat)) {
      categories.set(note.cat, { id: note.cat, name: note.cat, subs: [], notes: [] });
    }
    const category = categories.get(note.cat);
    if (note.sub !== undefined && !category.subs.some((/** @type {any} */ s) => s.id === note.sub)) {
      category.subs.push({ id: note.sub, name: note.sub });
    }
    category.notes.push({
      id: note.id,
      categoryId: note.cat,
      subId: note.sub ?? null,
      title: note.title,
      preview: note.preview ?? "",
      created: 1,
      edited: 1,
      alerts: [],
      flag: "",
      tags: []
    });
    writeFileSync(
      join(dir, "notes", `${note.id}.json`),
      JSON.stringify({ id: note.id, html: note.html ?? `<p>${note.preview ?? note.title}</p>` }),
      "utf8"
    );
  }

  writeFileSync(
    join(dir, "index.json"),
    JSON.stringify({ version: 2, tags: [], categories: [...categories.values()] }),
    "utf8"
  );
}

/**
 * A stand-in for the model, recording what it was actually shown.
 *
 * @param {any} value
 */
function fakeAsk(value) {
  /** @type {any[]} */
  const calls = [];
  /** @type {any} */
  const impl = async (/** @type {any} */ options) => {
    calls.push(options);
    return { ok: true, value, model: "test-model", costUsd: 0.01 };
  };
  impl.calls = calls;
  return impl;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tend-knowledge-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("the free pass", () => {
  it("finds a note whose title shares the words", () => {
    writeNotebook([
      { id: "n1", cat: "Books", sub: "HTWF", title: "Kritisera inte - fråga i stället" },
      { id: "n2", cat: "Books", sub: "HTWF", title: "Låt idén bli deras" }
    ]);
    const result = ok(search("hur ska jag kritisera utan att såra", dir));
    assert.deepEqual(result.matches.map((/** @type {any} */ m) => m.id), ["n1"]);
  });

  it("ranks a title hit above a passing mention in the preview", () => {
    writeNotebook([
      { id: "mention", cat: "Books", title: "Något helt annat", preview: "handlar delvis om retro" },
      { id: "titled", cat: "Books", title: "Retro som inte löser något" }
    ]);
    const result = ok(search("retro", dir));
    assert.deepEqual(result.matches.map((/** @type {any} */ m) => m.id), ["titled", "mention"]);
  });

  it("narrows on nothing when the situation is only common words", () => {
    writeNotebook([{ id: "n1", cat: "Books", title: "Kritisera inte" }]);
    // "what is it that I have to do about this" is all stopwords: a search that
    // matched on them would return the whole notebook and look like an answer.
    assert.match(failed(search("what is it that I have to do about this", dir)), /in a sentence/);
  });

  it("says nothing rather than everything when nothing matches", () => {
    writeNotebook([{ id: "n1", cat: "Books", title: "Kritisera inte" }]);
    const result = ok(search("budget för konferensen", dir));
    assert.deepEqual(result.matches, []);
    assert.equal(result.searched, 1, "it still reports how much it looked through");
  });

  it("searches books and people together, and says which is which", () => {
    writeNotebook([
      { id: "book", cat: "Books", sub: "HTWF", title: "Lyssna längre än det är bekvämt" },
      { id: "case", cat: "Team", sub: "Rasmus", title: "1-1: han lyssnar men säger inget" }
    ]);
    const result = ok(search("lyssnar", dir));
    assert.deepEqual(
      result.matches.map((/** @type {any} */ m) => m.trail).sort(),
      ["Books / HTWF", "Team / Rasmus"],
      "a principle and a conversation are both evidence about the same situation"
    );
  });

  it("reaches an inflected form, because this pass gates the reading pass", () => {
    // "lyssnar" has to find "Lyssna". An exact match misses every Swedish
    // ending, and a note this pass does not surface is one the model never
    // sees at all - so the miss is invisible rather than merely unhelpful.
    writeNotebook([{ id: "n1", cat: "Books", title: "Lyssna längre än det är bekvämt" }]);
    assert.equal(ok(search("han lyssnar inte", dir)).matches.length, 1);
    assert.equal(ok(search("konferensen", dir)).matches.length, 0, "and it does not match everything");
  });

  it("refuses an empty situation before touching the notebook", () => {
    assert.match(failed(search("   ", dir)), /in a sentence/);
  });
});

describe("the reading pass", () => {
  it("reads only the notes it was handed", async () => {
    writeNotebook([
      { id: "given", cat: "Books", title: "Given", html: "<p>the one shown</p>" },
      { id: "hidden", cat: "Team", sub: "Rasmus", title: "Hidden", html: "<p>never shown</p>" }
    ]);

    const impl = fakeAsk({ applies: [], missing: "" });
    ok(
      await consider({
        situation: "anything",
        candidates: [{ id: "given", title: "Given", trail: "Books" }],
        dir,
        askImpl: impl
      })
    );

    assert.match(impl.calls[0].prompt, /the one shown/);
    assert.doesNotMatch(impl.calls[0].prompt, /never shown/, "a note not shortlisted must not be read");
  });

  it("throws away a hit for a note that was never shown to it", async () => {
    writeNotebook([{ id: "given", cat: "Books", title: "Given", html: "<p>text</p>" }]);

    const result = ok(
      await consider({
        situation: "anything",
        candidates: [{ id: "given", title: "Given", trail: "Books" }],
        dir,
        askImpl: fakeAsk({
          applies: [
            { id: "given", says: "real", because: "real" },
            { id: "invented", says: "made up", because: "made up" }
          ],
          missing: ""
        })
      })
    );

    assert.deepEqual(result.applies.map((/** @type {any} */ a) => a.id), ["given"]);
  });

  it("carries what the notes do NOT answer, which is often the useful part", async () => {
    writeNotebook([{ id: "n1", cat: "Books", title: "Given", html: "<p>text</p>" }]);
    const result = ok(
      await consider({
        situation: "anything",
        candidates: [{ id: "n1", title: "Given", trail: "Books" }],
        dir,
        askImpl: fakeAsk({ applies: [], missing: "nothing here is about pay" })
      })
    );
    assert.equal(result.missing, "nothing here is about pay");
  });

  it("refuses before spending anything when the shortlist is empty", async () => {
    const impl = fakeAsk({ applies: [], missing: "" });
    assert.match(failed(await consider({ situation: "x", candidates: [], dir, askImpl: impl })), /Nothing to read/);
    assert.equal(impl.calls.length, 0);
  });

  it("says so when the shortlisted notes have titles but no text", async () => {
    writeNotebook([{ id: "n1", cat: "Books", title: "Empty", html: "" }]);
    const impl = fakeAsk({ applies: [], missing: "" });
    const message = failed(
      await consider({ situation: "x", candidates: [{ id: "n1", title: "Empty", trail: "Books" }], dir, askImpl: impl })
    );
    assert.match(message, /no text yet/);
    assert.equal(impl.calls.length, 0);
  });
});
