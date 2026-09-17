/**
 * Where one section of a Nib summary ends and the next begins.
 *
 * ## Why this is shared rather than repeated
 *
 * Two readers walk a section of a note - `unasked.js` for the questions he did
 * not ask, `theirpoints.js` for the action points - and both have to stop at the
 * next heading. They cannot do it by looking for a heading MARKER, because Nib
 * stores HTML and the conversion turns `<h2>Nästa steg</h2>` into a bare line
 * indistinguishable from prose. `unasked.js` says so in its own header.
 *
 * Both files instead allowed a couple of plain lines as the section's own
 * opening sentence and then broke. That is right for a section with content in
 * it and WRONG for an empty one: a note whose "Frågor jag inte ställde" section
 * is empty, followed by "Nästa steg" and a list, read "Boka ett nytt möte" as a
 * question he did not ask. The next section's list walked straight in.
 *
 * It survived because the test for that case was written with `##` markers -
 * where the break is unambiguous - in a file that already carries a block
 * titled "the text the app actually has, not the Markdown it was written for",
 * explaining that seventeen earlier tests had passed on Markdown the app never
 * sees. The same mistake, in the neighbouring test, about the same file.
 *
 * ## Known names, and that is the whole design
 *
 * The line this must not cross is the one both readers are built on: format,
 * never meaning. So this does not decide that a line "looks like a heading". It
 * matches the section names Nib actually writes, counted from the live notebook
 * - sammanfattning 29, åtgärdspunkter 24, beslut 24, frågor jag inte ställde 20,
 * sedan förra gången 15, taggar 10, uppföljning 8 - plus the handful a note
 * written by hand uses. A name not on this list is prose, and prose is handled
 * by the position rule the readers already have.
 *
 * That makes this a list to extend when Nib's summariser changes, which is
 * honest. The alternative - anything short and capitalised is a heading - reads
 * "Han ville prata om lönen" as a section break.
 */

/**
 * The section names, as whole lines.
 *
 * `frågor` is matched with anything after it, because the summariser writes at
 * least three of them ("jag inte ställde", "modellen hade ställt", "öppna") and
 * a reader inside one of them must stop at the next.
 */
const NAMES = [
  /sammanfattning/,
  /åtgärdspunkter/,
  /action\s+points?/,
  /beslut/,
  /n[äa]sta\s+steg/,
  /uppföljning/,
  /sedan\s+förra\s+gången/,
  /taggar/,
  /deltagare/,
  /st[äa]mning/,
  /fr[åa]gor\b.*/,
  /att\s+göra/
];

/** Optional heading markers around a name, which survive in a hand-written note. */
const WRAPPED = NAMES.map(
  (name) => new RegExp(`^\\s*(?:#{1,6}\\s*|\\*\\*)?\\s*(?:${name.source})\\s*:?\\s*(?:\\*\\*)?\\s*$`, "i")
);

/**
 * Does this line start a new section?
 *
 * @param {string} line One line of a note's plain text.
 * @returns {boolean}
 */
export function startsSection(line) {
  const text = String(line ?? "").trim();
  if (text === "") {
    return false;
  }
  // A list item is content even when its text happens to be a section's name.
  if (/^(?:[-*+]|\d+[.)])\s/.test(text)) {
    return false;
  }
  return WRAPPED.some((pattern) => pattern.test(text));
}
