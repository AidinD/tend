/**
 * The questions he did not ask last time, read out of a note.
 *
 * ## Why this is the best thing in the overhaul
 *
 * Nib's summaries already end with a section titled "Frågor jag inte ställde".
 * Tend has a field called `worthRaising` which is empty on every person,
 * because the only thing that ever fed it was role-map topics and there are
 * none. The preparation for the next conversation is already written down at
 * the end of the last one, and nothing reads it.
 *
 * ## Format, never meaning
 *
 * Everything here is driven by the shape of the document: a heading, then the
 * list under it. It never decides that a sentence in prose looks like an
 * unasked question, and that restraint is the whole design.
 *
 * The alternative was tempting and would have been worse. A note about
 * somebody is full of question marks - what he wondered, what they asked him,
 * rhetorical asides - and a page that puts "Vad tycker du?" under "Att ta reda
 * på" before a real conversation is a page he stops trusting after the second
 * time. The brief asks it to degrade to empty rather than to nonsense, and
 * empty is what a hand-written note with no such section gets.
 *
 * ## Nothing is written back
 *
 * Read-only, like every other path into Nib. Nib owns the notes.
 */

/**
 * Headings that mean "the questions I did not get to".
 *
 * Two tiers rather than one pattern. The first is the section Nib actually
 * writes and is matched precisely. The second is the fallback for a note
 * written by hand, where the heading might just say "Frågor" - and it is
 * deliberately still a heading match, because widening it to prose is where
 * the nonsense starts.
 */
const EXACT = /^\s*(?:#{1,6}\s*|\*\*)?\s*fr[åa]gor\s+(?:jag\s+)?(?:inte|ej)\s+st[äa]ll[dt]?e?\b/i;
const LOOSE = /^\s*(?:#{1,6}\s*|\*\*)?\s*(?:[öo]ppna\s+)?fr[åa]gor\b/i;

/** A Markdown heading of any level, or a bolded line standing in for one. */
const HEADING = /^\s*(?:#{1,6}\s|\*\*[^*]+\*\*\s*$)/;

/** A list item: dash, asterisk, or a number. */
const ITEM = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/;

/**
 * Every question the note says he did not ask.
 *
 * @param {string} body The note's plain text.
 * @returns {string[]} In the order written. Empty when there is no such
 *   section, which is the common case and not a failure.
 */
export function unaskedQuestions(body) {
  const lines = String(body ?? "").split(/\r?\n/);

  const start = findSection(lines);
  if (start < 0) {
    return [];
  }

  /** @type {string[]} */
  const out = [];
  /* Plain lines seen before the first question. See the break below. */
  let preamble = 0;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim() === "") {
      continue;
    }

    /*
     * A Markdown heading ends it outright, before the position rule below.
     * Where the markers survive they are unambiguous evidence of a new
     * section, and an empty questions section followed by "## Nästa steg"
     * would otherwise count that heading as preamble and read the list under
     * it as questions. The position rule exists for text where the markers are
     * gone, not instead of this.
     */
    if (HEADING.test(line)) {
      break;
    }

    const item = line.match(ITEM);
    if (item !== null) {
      const text = clean(item[1]);
      if (text !== "") {
        out.push(text);
      }
      continue;
    }

    const bare = clean(line);

    /*
     * A bare line is one of the questions only when it is actually a question.
     * Inside this section a plain sentence is usually a note to himself about
     * the section, and the question mark is the only evidence that tells them
     * apart.
     */
    if (bare.endsWith("?")) {
      out.push(bare);
      continue;
    }

    /*
     * A plain line means two different things depending on where it sits.
     *
     * Before the first question it is the section's own opening sentence -
     * "Hann inte med allt." and then the list - so it is skipped. After one,
     * it is the next section starting, and everything below it belongs to that
     * section rather than to this one.
     *
     * Position rather than shape, because shape is not available: `htmlToText`
     * strips the heading markers, so the line that begins "Nästa steg" is
     * indistinguishable from prose. Breaking on every plain line lost the
     * opening sentence; breaking on none let the next section's list in.
     *
     * The preamble is capped so a section with no questions at all cannot walk
     * into the one below it and read its list as questions.
     */
    if (out.length > 0 || preamble >= PREAMBLE_MAX) {
      break;
    }
    preamble++;
  }

  return out;
}

/**
 * The line the section starts on, or -1.
 *
 * The exact heading wins wherever it appears, even if a looser one comes first.
 * A note with both "## Frågor" and "## Frågor jag inte ställde" means the
 * second one, and taking whichever came first would depend on how the note was
 * laid out.
 *
 * @param {string[]} lines
 */
function findSection(lines) {
  /*
   * The exact pattern does not need a heading marker. "Frågor jag inte
   * ställde" is specific enough to be the section wherever it appears, and it
   * has to be, because the text this reads has no markers: Nib stores HTML and
   * `htmlToText` turns an <h2> into a bare line.
   */
  const exact = lines.findIndex((l) => EXACT.test(l));
  if (exact >= 0) {
    return exact;
  }

  /*
   * The loose one does, in one form or another. "Frågor" alone is a word that
   * starts sentences - "Frågor om lönen kom aldrig upp" is prose, not a
   * heading - so it has to be either marked up or short enough to be a title.
   * Length is a crude test and it is a test of format, which is the line this
   * file does not cross.
   */
  return lines.findIndex(
    (l) => LOOSE.test(l) && (HEADING.test(l) || l.trim().length <= HEADING_MAX)
  );
}

/** A heading is short. Longer than this and it is a sentence. */
const HEADING_MAX = 40;

/**
 * How many plain lines may open the section before the first question.
 *
 * Two, which is a sentence or a short pair of them. It exists so a section
 * that turns out to have no questions cannot read the next section's list as
 * if it did.
 */
const PREAMBLE_MAX = 2;

/**
 * One question, without the markup around it.
 *
 * Checkboxes are stripped because Nib writes action points as `- [ ]` and a
 * summary sometimes carries the same shape into this section. A ticked box is
 * dropped entirely: he asked it.
 *
 * @param {string} raw
 */
function clean(raw) {
  const text = String(raw ?? "");

  /*
   * A ticked box is dropped: he asked it. Tested first and on the raw line,
   * because the version before this marked it with a sentinel and then trimmed
   * the string, which destroyed the evidence one line later.
   */
  if (/^\s*\[[xX]\]/.test(text)) {
    return "";
  }

  return text
    .replace(/^\s*\[\s?\]\s*/, "")
    .replace(/^\*\*|\*\*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
