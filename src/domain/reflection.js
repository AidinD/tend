/**
 * A weekly-ish look back, in two or three boxes.
 *
 * ## Why this is not a diary
 *
 * The same reasoning as `growth.js`'s "why this is not a development plan",
 * one size down: an open textarea invites a paragraph, the paragraph invites
 * another one next week, and a few months in it is a diary - which is exactly
 * the kind of document this app keeps refusing to become, because a document
 * written once and revisited only by scrolling back through it is not a tool,
 * it is a habit of writing that nobody reads. So this asks two fixed
 * questions rather than offering one blank box, and stores the answers as a
 * plain log row with nothing left to track afterwards.
 *
 * ## Why it is one flat row, not a thread
 *
 * `growth.js`'s threads have a lifecycle - open, stalled, dropped - because
 * they track a direction that may or may not be moving. A reflection has
 * nothing left open once it is written: there is no status to check on it
 * later, no drift to measure against it, just the fact that it was written
 * and what it said. That is a log, not a thread, and it gets a log's storage:
 * `id`, `at`, the answers, nothing else.
 *
 * ## Why it is not the day, and not a moment
 *
 * `journal.js`'s entry is nightly, never prompted, and about everywhere the
 * day went. This is looser and slower - about a week or so, gently prompted
 * because a week is long enough to actually forget how it went - and it asks
 * a narrower question: not "where did the day go" but "how did it go, and
 * what would you change". A moment is one interaction with a named person;
 * this names nobody and is not about any single interaction, it is about a
 * stretch of time from the writer's own side of it.
 *
 * ## Why it is never critical
 *
 * Same line `growth.js` draws for growth threads. Nobody is let down because
 * a week went unreflected on, and a page that treats "you haven't reflected"
 * as urgent would be borrowing the vocabulary this app reserves for broken
 * promises. The cadence below exists so a soft nudge can notice a long gap,
 * never so it can escalate one.
 *
 * Nothing here touches the store.
 */

/**
 * The questions, in the order they are asked.
 *
 * Held here rather than in the view so the form that writes a reflection and
 * anything that reads one later cannot disagree about what a field means.
 */
export const REFLECTION_FIELDS = /** @type {const} */ ([
  {
    name: "wellDone",
    label: "What went well?",
    hint: "The last week or so, in brief."
  },
  {
    name: "differently",
    label: "What would you do differently?",
    hint: "One or two lines is enough."
  },
  {
    name: "notes",
    label: "Anything else",
    hint: "Optional, and clearly secondary to the two questions above."
  }
]);

/** How long a gap has to be before a nudge is even worth considering. */
export const REFLECTION_CADENCE_DAYS = 7;

/**
 * Is there anything in this reflection at all?
 *
 * @param {Record<string, any>} row
 * @returns {boolean}
 */
export function hasContent(row) {
  return REFLECTION_FIELDS.some((f) => String(row[f.name] ?? "").trim() !== "");
}
