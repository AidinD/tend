/**
 * The questions he did not ask, read out of a note by shape and never by
 * meaning.
 *
 * The test that matters most is the one asserting it finds nothing. A note
 * about somebody is full of question marks - what he wondered, what they asked
 * him, rhetorical asides - and a page that puts one of those under "Att ta reda
 * på" before a real conversation is a page he stops trusting the second time it
 * happens.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { unaskedQuestions } from "../src/domain/unasked.js";

/* A Nib summary, in the shape Nib actually writes them. */
const SUMMARY = [
  "# Möte 2026-08-28",
  "",
  "Vi gick igenom rendering och hur långt migreringen kommit.",
  "Han verkade lättad över att tidplanen flyttades.",
  "",
  "## Beslut",
  "",
  "- Vi kör vidare med den nya pipelinen",
  "",
  "## Åtgärdspunkter",
  "",
  "- [ ] Kolla med Nina om konferensen",
  "- [x] Boka rummet",
  "",
  "## Frågor jag inte ställde",
  "",
  "- Hur känner han inför att äga migreringen själv?",
  "- Vad hindrar honom från att säga nej till fler uppdrag?",
  "",
  "## Nästa steg",
  "",
  "- Sätt ett nytt möte"
].join("\n");

test("reading the section Nib writes", async (t) => {
  await t.test("finds the questions, in the order they were written", () => {
    assert.deepEqual(unaskedQuestions(SUMMARY), [
      "Hur känner han inför att äga migreringen själv?",
      "Vad hindrar honom från att säga nej till fler uppdrag?"
    ]);
  });

  await t.test("and stops at the next heading", () => {
    /*
     * Without this the block would quietly include the neighbouring section.
     * "Sätt ett nytt möte" is not nonsense, but it is not what the heading
     * promised, and a block that absorbs its neighbour is one he cannot
     * predict.
     */
    const found = unaskedQuestions(SUMMARY);
    assert.ok(
      !found.some((q) => /nytt möte/.test(q)),
      `the next section leaked in: ${JSON.stringify(found)}`
    );
  });

  await t.test("keeps å, ä and ö exactly as written", () => {
    /*
     * Asserted rather than assumed. A pass over these strings that normalises
     * them is the kind of thing that gets added for a good reason elsewhere and
     * silently rewrites somebody's own words here.
     */
    const found = unaskedQuestions(SUMMARY);
    assert.ok(found[0].includes("känner"), found[0]);
    assert.ok(found[0].includes("äga"), found[0]);
    assert.ok(found[1].includes("från"), found[1]);
  });

  await t.test("does not reach into the action points above it", () => {
    const found = unaskedQuestions(SUMMARY);
    assert.ok(!found.some((q) => /Nina/.test(q)), JSON.stringify(found));
    assert.ok(!found.some((q) => /rummet/.test(q)), JSON.stringify(found));
  });
});

test("it degrades to empty, not to nonsense", async (t) => {
  await t.test("a hand-written note with no such section finds nothing", () => {
    /*
     * The whole point. This note has three question marks in it and none of
     * them is an unasked question.
     */
    const byHand = [
      "Snack med honom i köket.",
      "",
      "Han undrade om vi hunnit titta på rendering? Sa att jag skulle kolla.",
      "Vad gör vi med tidplanen? Ingen aning ännu.",
      "Frågade han om lönerevisionen? Nej, det kom aldrig upp."
    ].join("\n");

    assert.deepEqual(unaskedQuestions(byHand), []);
  });

  await t.test("an empty note, and a missing one, find nothing", () => {
    assert.deepEqual(unaskedQuestions(""), []);
    assert.deepEqual(unaskedQuestions(/** @type {any} */ (null)), []);
    assert.deepEqual(unaskedQuestions(/** @type {any} */ (undefined)), []);
  });

  await t.test("the heading alone, with nothing under it, finds nothing", () => {
    assert.deepEqual(unaskedQuestions("## Frågor jag inte ställde\n\n## Nästa steg\n\n- Boka"), []);
  });
});

test("the fallbacks, which are about format and not meaning", async (t) => {
  await t.test("a looser heading works when the exact one is absent", () => {
    const note = ["## Frågor", "", "- Vad vill han egentligen?"].join("\n");
    assert.deepEqual(unaskedQuestions(note), ["Vad vill han egentligen?"]);
  });

  await t.test("but the exact heading wins wherever it sits", () => {
    /*
     * Taking whichever came first would make the answer depend on how the note
     * was laid out.
     */
    const note = [
      "## Frågor",
      "",
      "- Den här är fel sektion",
      "",
      "## Frågor jag inte ställde",
      "",
      "- Den här är rätt"
    ].join("\n");
    assert.deepEqual(unaskedQuestions(note), ["Den här är rätt"]);
  });

  await t.test("a bolded line counts as a heading, because Nib writes both", () => {
    const note = ["**Frågor jag inte ställde**", "", "- Hur går det hemma?"].join("\n");
    assert.deepEqual(unaskedQuestions(note), ["Hur går det hemma?"]);
  });

  await t.test("English spellings and 'ej ställde' are accepted", () => {
    assert.deepEqual(unaskedQuestions("## Fragor jag inte stallde\n- Varfor?"), ["Varfor?"]);
    assert.deepEqual(unaskedQuestions("## Frågor jag ej ställde\n- Varför?"), ["Varför?"]);
  });

  await t.test("numbered and asterisk lists count, because notes use all three", () => {
    assert.deepEqual(unaskedQuestions("## Frågor jag inte ställde\n1. Ett?\n* Två?\n+ Tre?"), [
      "Ett?",
      "Två?",
      "Tre?"
    ]);
  });

  await t.test("an unticked box is a question and a ticked one was asked", () => {
    const note = [
      "## Frågor jag inte ställde",
      "- [ ] Hur ser han på nivån?",
      "- [x] Om semestern"
    ].join("\n");
    assert.deepEqual(unaskedQuestions(note), ["Hur ser han på nivån?"]);
  });

  await t.test("a bare line inside the section needs a question mark", () => {
    /*
     * Inside this section a plain sentence is usually a note to himself about
     * the section rather than one of the questions, and the mark is the only
     * evidence that tells them apart.
     */
    const note = [
      "## Frågor jag inte ställde",
      "",
      "Hann inte med allt.",
      "Vad tänker han om teamet?"
    ].join("\n");
    assert.deepEqual(unaskedQuestions(note), ["Vad tänker han om teamet?"]);
  });
});

test("the text the app actually has, not the Markdown it was written for", async (t) => {
  /*
   * Nib stores HTML and `htmlToText` converts it, which strips the heading
   * markers entirely: `<h2>Frågor jag inte ställde</h2>` arrives as a bare
   * line and `<li>` arrives as "- ". The first version of this reader required
   * `##` and therefore never found the section in the only text it is ever
   * given - seventeen unit tests passed on Markdown the app never sees.
   */
  const converted = [
    "Vi pratade om renderingen. Jag sa att jag skulle kolla med Nina om konferensen.",
    "Hann vi prata om tidplanen? Kommer inte ihåg.",
    "Frågor jag inte ställde",
    "- Hur känner han inför att äga migreringen själv?",
    "- Vad hindrar honom från att säga nej till fler uppdrag?"
  ].join("\n");

  await t.test("finds the section with no heading markers at all", () => {
    assert.deepEqual(unaskedQuestions(converted), [
      "Hur känner han inför att äga migreringen själv?",
      "Vad hindrar honom från att säga nej till fler uppdrag?"
    ]);
  });

  await t.test("and ignores the question mark in the prose above it", () => {
    /*
     * "Hann vi prata om tidplanen?" sits before the heading and is not an
     * unasked question. It is in the fixture on purpose: a reader that scanned
     * for question marks would pick it up, and putting it under "To find out"
     * before a real conversation is how he learns to distrust the block.
     */
    const found = unaskedQuestions(converted);
    assert.ok(!found.some((q) => /tidplanen/.test(q)), JSON.stringify(found));
  });

  await t.test("a following section's list does not leak in without markers", () => {
    /*
     * The position rule. With the markers gone, "Nästa steg" is
     * indistinguishable from prose - so a plain line after the first question
     * ends the section, and everything below belongs to that one.
     */
    const withNext = [
      "Frågor jag inte ställde",
      "- Hur ser han på nivån?",
      "Nästa steg",
      "- Boka ett nytt möte",
      "- Prata med HR"
    ].join("\n");

    assert.deepEqual(unaskedQuestions(withNext), ["Hur ser han på nivån?"]);
  });

  await t.test("but an opening sentence before the list is tolerated", () => {
    const withPreamble = [
      "Frågor jag inte ställde",
      "Hann inte med allt den här gången.",
      "- Vad tänker han om teamet?"
    ].join("\n");

    assert.deepEqual(unaskedQuestions(withPreamble), ["Vad tänker han om teamet?"]);
  });

  await t.test("and a section with no questions cannot walk into the next one", () => {
    /*
     * The cap on the preamble. Without it, an empty questions section followed
     * by three lines of prose and then a list would read that list as
     * questions - which is the nonsense case arriving by a different route.
     */
    const empty = [
      "Frågor jag inte ställde",
      "Vi hann faktiskt igenom allt.",
      "Bra möte överlag.",
      "Nästa steg",
      "- Boka ett nytt möte"
    ].join("\n");

    assert.deepEqual(unaskedQuestions(empty), []);
  });
});
