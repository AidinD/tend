/**
 * Tests for what the palette makes of what you typed.
 *
 * This is the half of Ctrl+K with a consequence. Everything else in that
 * overlay is arrangement; here a wrong answer logs a promise against the wrong
 * colleague, and nothing about the app afterwards looks wrong - it looks like a
 * promise. So most of these test a refusal rather than a match.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { looksLikeQuestion, matchPerson, matchesWords, splitAddressed } from "../src/domain/parse.js";

const ROSTER = [
  { id: "p-nina", name: "Nina Berg" },
  { id: "p-tom", name: "Tom Ek" },
  { id: "p-sofia", name: "Sofia Lund" }
];

const TWO_NINAS = [...ROSTER, { id: "p-nina-2", name: "Nina Falk" }];

describe("naming a person", () => {
  it("finds one on a first name", () => {
    assert.equal(matchPerson(ROSTER, "nina")?.id, "p-nina");
  });

  it("finds one on a last name, since that is how some people are referred to", () => {
    assert.equal(matchPerson(ROSTER, "lund")?.id, "p-sofia");
  });

  it("refuses when two people share the name", () => {
    assert.equal(
      matchPerson(TWO_NINAS, "nina"),
      null,
      "a coin toss here attaches a promise to the wrong colleague, silently"
    );
  });

  it("still finds the right one when the full name is typed", () => {
    assert.equal(matchPerson(TWO_NINAS, "Nina Falk")?.id, "p-nina-2");
  });

  it("prefers an exact full name over a longer one it prefixes", () => {
    const roster = [
      { id: "short", name: "Nina" },
      { id: "long", name: "Nina Berg" }
    ];
    assert.equal(matchPerson(roster, "Nina")?.id, "short");
    assert.equal(matchPerson(roster, "Nina Berg")?.id, "long");
  });

  it("refuses a single letter, which matches most rosters", () => {
    assert.equal(matchPerson(ROSTER, "n"), null);
  });

  it("refuses somebody who is not there rather than picking the nearest", () => {
    assert.equal(matchPerson(ROSTER, "Nadia"), null);
  });

  it("ignores surrounding whitespace and case", () => {
    assert.equal(matchPerson(ROSTER, "  TOM  ")?.id, "p-tom");
  });
});

describe("reading a captured line", () => {
  it("splits a name, a colon and the thing", () => {
    const parsed = splitAddressed(ROSTER, "Nina: look at the render pass");
    assert.equal(parsed?.person.id, "p-nina");
    assert.equal(parsed?.rest, "look at the render pass");
  });

  it("does not turn a sentence about somebody into a promise to them", () => {
    // The failure this prevents is invisible until the day it is read back to
    // her: "Nina said the build is slow" is a note, not a commitment.
    assert.equal(splitAddressed(ROSTER, "Nina said the build is slow"), null);
  });

  it("refuses a colon with nothing after it", () => {
    assert.equal(splitAddressed(ROSTER, "Nina:"), null);
    assert.equal(splitAddressed(ROSTER, "Nina:   "), null);
  });

  it("refuses when the name before the colon is not on the roster", () => {
    assert.equal(splitAddressed(ROSTER, "todo: buy milk"), null);
  });

  it("refuses when the name before the colon is ambiguous", () => {
    assert.equal(splitAddressed(TWO_NINAS, "Nina: look at the render pass"), null);
  });

  it("keeps Swedish text exactly as typed", () => {
    const parsed = splitAddressed(ROSTER, "Tom: kolla varför bygget är segare än tidigare");
    assert.equal(parsed?.rest, "kolla varför bygget är segare än tidigare");
  });

  it("does not read a whole paragraph as a name", () => {
    const long = `${"x".repeat(60)}: something`;
    assert.equal(splitAddressed(ROSTER, long), null);
  });
});

describe("matching a command", () => {
  it("matches on a prefix of a word", () => {
    assert.equal(matchesWords("sett", "Go to Settings data, Nib, drafting"), true);
  });

  it("needs every word typed to appear, so two words narrow rather than widen", () => {
    assert.equal(matchesWords("go people", "Go to People the roster"), true);
    assert.equal(matchesWords("go people", "Go to Settings"), false);
  });

  it("matches nothing typed against everything", () => {
    assert.equal(matchesWords("", "anything at all"), true);
  });
});

describe("telling a question from something to record", () => {
  it("reads a question mark as a question", () => {
    assert.equal(looksLikeQuestion("did I speak to Tom?"), true);
  });

  it("reads an opening question word as a question", () => {
    assert.equal(looksLikeQuestion("who have I not spoken to"), true);
  });

  it("treats an ordinary sentence as something to record", () => {
    // Erring this way is free: recording costs nothing and a wrong guess the
    // other way spends seconds and money on a model.
    assert.equal(looksLikeQuestion("Nina: look at the render pass"), false);
    assert.equal(looksLikeQuestion("whatever happens, ship it"), false);
  });
});
