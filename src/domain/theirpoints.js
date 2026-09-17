/**
 * The action points written at the end of a conversation.
 *
 * ## The gap this fills, in his words
 *
 * 2026-09-17: "Jag höll på att missa vad vi sagt sen tidigare som punkter att ta
 * upp nästa gång. Action points. Jag behöver ha ett enkelt sätt att se dem för
 * att kunna följa upp. i tend såg jag inget. Jag kollade förra gångens 1-1 och
 * hittade där men det är inte säkert jag lyckas nästa gång."
 *
 * The record he wants already exists - it is a `waiting` row, whose own header
 * calls it the mirror of a promise and whose `answered` state means THEY
 * answered rather than that he stopped caring. What did not exist was a way in.
 * He had 22 promises and zero waits, which is a door nobody found rather than a
 * concept nobody needed.
 *
 * This reads the candidates out of the note he was already looking at.
 *
 * ## It does NOT decide whose point it is
 *
 * The obvious version filters to the ones the other person owns, and it cannot
 * be done honestly: a line in this section is as often his own work as theirs,
 * and nothing in the words reliably says which. Guessing wrong in the generous
 * direction puts somebody else's name on his commitment; guessing wrong the
 * other way loses the follow-up he asked for.
 *
 * So every point is offered and he picks. One click per row was the ask, and one
 * click is also the honest number when the classification is his to make.
 *
 * ## Inferred points are marked, never promoted quietly
 *
 * Nib's summariser writes some of these itself and marks them
 * "(underförstått)". Measured across the live notebook: 71 action-point lines in
 * 24 notes, and 24 of them inferred. A third.
 *
 * Those are the model's reading of what was implied, not something either party
 * said - and one of them, in a real note, was a suggestion that he build a
 * better system for tracking action points, which nobody said at all. A reader
 * that took the section wholesale would hand him a list of the model's guesses
 * wearing the clothes of what somebody committed to. That is the same defect
 * `unasked.js` had until today, where the prep card was offering "Frågor
 * modellen hade ställt" as the questions he did not ask.
 *
 * So `inferred` travels with every line and the surface has to show it. The
 * marker is stripped from the text, because it is provenance rather than part
 * of the sentence, and keeping it would put "(underförstått)" inside the text
 * of a row he is chasing somebody about.
 *
 * ## Format, never meaning
 *
 * Same rule as `unasked.js`, and for the same reason: a note is full of lines
 * that look like commitments. Everything here is driven by a heading and the
 * list under it, and a note without that section yields nothing at all.
 */

import { startsSection } from "./notesections.js";

/**
 * Headings that mean "what we said would happen".
 *
 * Deliberately short. Nib writes "Åtgärdspunkter" and that is the one that
 * matters; the others are for a note written by hand. "Nästa steg" is NOT here -
 * it is the section about what happens to the WORK, not about what a person
 * owes, and `notesections.js` treats it as a boundary that ends a section rather
 * than as one of these.
 */
const HEADINGS = /^\s*(?:#{1,6}\s*|\*\*)?\s*(?:åtgärdspunkter|action\s+points?|att\s+göra)\s*:?\s*(?:\*\*)?\s*$/i;

/** A Markdown heading of any level, or a bolded line standing in for one. */
const HEADING = /^\s*(?:#{1,6}\s|\*\*[^*]+\*\*\s*$)/;

/** A list item: dash, asterisk, a number, or a checkbox. */
const ITEM = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/;

/**
 * How many plain lines before the first point are read as the section's own
 * opening sentence rather than as the next section beginning.
 *
 * Same value and same reasoning as `unasked.js`: the text has no heading
 * markers, so position is the only evidence available, and a cap stops an empty
 * section walking into the one below it.
 */
const PREAMBLE_MAX = 2;

/** The summariser's own provenance marker. */
const INFERRED = /\(\s*underf[öo]rst[åa]tt\s*\)/i;

/**
 * @typedef {object} Point
 * @property {string} text What was written, with the provenance marker removed.
 * @property {boolean} inferred True when the summariser marked it as its own
 *   reading rather than as something said.
 */

/**
 * Every action point the note lists.
 *
 * @param {string} body The note's plain text.
 * @returns {Point[]} In the order written. Empty when there is no such section,
 *   which is the common case and not a failure.
 */
export function actionPoints(body) {
  const lines = String(body ?? "").split(/\r?\n/);
  const start = lines.findIndex((l) => HEADINGS.test(l));
  if (start < 0) {
    return [];
  }

  /** @type {Point[]} */
  const out = [];
  let preamble = 0;

  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") {
      continue;
    }

    /*
     * The next section ends this one, whether or not its heading markers
     * survived the conversion from HTML. Checked BEFORE the item rule, because
     * an empty action-point section followed by "Nästa steg" would otherwise
     * read that section's list as points - see notesections.js.
     */
    if (HEADING.test(line) || startsSection(line)) {
      break;
    }

    const item = line.match(ITEM);
    if (item !== null) {
      const point = read(item[1]);
      if (point !== null) {
        out.push(point);
      }
      continue;
    }

    /*
     * A plain line means two things depending on where it sits, exactly as in
     * `unasked.js`. Before the first point it is the section's opening
     * sentence; after one it is the next section starting, and everything below
     * belongs to that.
     *
     * There is no equivalent here of that file's question-mark test. A question
     * mark is evidence a line is a question; nothing in a sentence's shape is
     * evidence that it is a commitment, so a bare line is never taken as a
     * point. The list is the format, and the format is all this reads.
     */
    if (out.length > 0 || preamble >= PREAMBLE_MAX) {
      break;
    }
    preamble++;
  }

  return out;
}

/**
 * One line into a point, or null when nothing is left of it.
 *
 * @param {string} raw
 * @returns {Point | null}
 */
function read(raw) {
  const inferred = INFERRED.test(raw);
  const text = String(raw)
    .replace(INFERRED, " ")
    // A leading checkbox is Markdown, not content. Nib writes none today, and a
    // hand-written note might.
    .replace(/^\s*\[[ xX]\]\s*/, "")
    .replace(/\s+/g, " ")
    .trim()
    // A trailing separator left behind once the marker is cut out.
    .replace(/[\s,;:-]+$/, "")
    .trim();
  return text === "" ? null : { text, inferred };
}
