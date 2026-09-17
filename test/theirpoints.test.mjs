/**
 * Action points read out of a note, by shape and never by meaning.
 *
 * The check that matters most is the one about provenance. A third of the
 * action-point lines in the live notebook are the summariser's own reading,
 * marked "(underförstått)" - and a reader that let those through would hand him
 * the model's guesses wearing the clothes of what somebody committed to. That is
 * the defect `unasked.js` had until today.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { actionPoints } from "../src/domain/theirpoints.js";

/* A Nib summary, in the shape Nib actually writes them - no heading markers,
   because the app only ever sees html converted to text. */
const SUMMARY = [
  "Möte 2026-09-15",
  "",
  "Vi gick igenom hur migreringen ligger till.",
  "",
  "Åtgärdspunkter",
  "",
  "- Hen skickar underlaget till mig innan fredag",
  "- Jag bokar om designgenomgången (underförstått)",
  "- Vi stämmer av kapaciteten på måndag",
  "",
  "Frågor jag inte ställde",
  "",
  "- Hur känns det inför flytten?"
].join("\n");

test("reading the section Nib writes", async (t) => {
  await t.test("finds the points, in the order written", () => {
    assert.deepEqual(
      actionPoints(SUMMARY).map((p) => p.text),
      [
        "Hen skickar underlaget till mig innan fredag",
        "Jag bokar om designgenomgången",
        "Vi stämmer av kapaciteten på måndag"
      ]
    );
  });

  await t.test("marks the summariser's own reading as inferred", () => {
    const found = actionPoints(SUMMARY);
    assert.deepEqual(
      found.map((p) => p.inferred),
      [false, true, false]
    );
  });

  await t.test("strips the marker from the text rather than keeping it", () => {
    /*
     * It is provenance, not part of the sentence. Left in, it would sit inside
     * the text of a row he is chasing somebody about.
     */
    const found = actionPoints(SUMMARY);
    assert.ok(!found.some((p) => /underförstått/i.test(p.text)), JSON.stringify(found));
    assert.ok(!found.some((p) => /\(\s*\)/.test(p.text)), JSON.stringify(found));
  });

  await t.test("stops before the next section", () => {
    const found = actionPoints(SUMMARY);
    assert.ok(!found.some((p) => /flytten/.test(p.text)), JSON.stringify(found));
  });

  await t.test("does not decide whose point it is", () => {
    /*
     * The section mixes his and theirs, and nothing in the words reliably says
     * which. Both are offered and he picks - guessing generously would put
     * somebody else's name on his own commitment.
     */
    const found = actionPoints(SUMMARY).map((p) => p.text);
    assert.ok(found.some((t) => t.startsWith("Hen")), "theirs was dropped");
    assert.ok(found.some((t) => t.startsWith("Jag")), "his was dropped");
  });
});

test("it degrades to empty, not to nonsense", async (t) => {
  await t.test("a note with no such section yields nothing", () => {
    const byHand = [
      "Snack i köket.",
      "",
      "Han ska kolla på bygget och jag lovade att återkomma om lönen.",
      "Vi bestämde att flytta demot."
    ].join("\n");
    assert.deepEqual(actionPoints(byHand), []);
  });

  await t.test("an empty or missing note yields nothing", () => {
    assert.deepEqual(actionPoints(""), []);
    assert.deepEqual(actionPoints(/** @type {any} */ (null)), []);
    assert.deepEqual(actionPoints(/** @type {any} */ (undefined)), []);
  });

  await t.test("the heading alone yields nothing", () => {
    assert.deepEqual(actionPoints("Åtgärdspunkter\n\nNästa steg\n\n- Boka rummet"), []);
  });

  await t.test("a bare sentence inside the section is never a point", () => {
    /*
     * A question mark is evidence a line is a question, which is what lets
     * `unasked.js` read one. Nothing in a sentence's shape is evidence that it
     * is a commitment, so the list is the only format this trusts.
     */
    const note = ["Åtgärdspunkter", "", "Vi hann inte gå igenom allt.", "- Hen skickar underlaget"].join("\n");
    assert.deepEqual(
      actionPoints(note).map((p) => p.text),
      ["Hen skickar underlaget"]
    );
  });
});

test("the shapes a hand-written note uses", async (t) => {
  await t.test("markers, numbers and asterisks all count", () => {
    assert.deepEqual(
      actionPoints("## Åtgärdspunkter\n1. Ett\n* Två\n+ Tre").map((p) => p.text),
      ["Ett", "Två", "Tre"]
    );
  });

  await t.test("a checkbox is markup and not content", () => {
    assert.deepEqual(
      actionPoints("Åtgärdspunkter\n- [ ] Skicka underlaget\n- [x] Boka rummet").map((p) => p.text),
      ["Skicka underlaget", "Boka rummet"]
    );
  });

  await t.test("the English and the plain Swedish headings work", () => {
    for (const heading of ["Action points", "Action point", "Att göra", "**Åtgärdspunkter**"]) {
      assert.deepEqual(
        actionPoints(`${heading}\n- Skicka underlaget`).map((p) => p.text),
        ["Skicka underlaget"],
        `"${heading}" was not recognised`
      );
    }
  });

  await t.test("'Nästa steg' is not this section", () => {
    /*
     * It is what happens to the WORK, not what a person owes, and `unasked.js`
     * already treats it as the boundary that ends a section. Reading it here
     * would turn every scheduling note into somebody's debt.
     */
    assert.deepEqual(actionPoints("Nästa steg\n- Boka ett nytt möte"), []);
  });
});
