/**
 * The end of the day, in four boxes.
 *
 * ## Nice to have, not a discipline
 *
 * Days will be missed, and that is the design rather than a shortfall. So
 * nothing here prompts, nothing counts a streak, and no field is required. A
 * tool that asks every evening becomes a tool that is avoided every evening, and
 * then the data stops entirely instead of arriving unevenly - which is strictly
 * worse, because an uneven record still shows a pattern and an abandoned one
 * shows nothing.
 *
 * It also means the entry is not the product. Twenty entries are, and the pass
 * that reads them is. The form only has to be cheap enough to fill on a tired
 * Tuesday.
 *
 * ## Why these questions
 *
 * The rule the rest of the app already follows: never ask for what can be
 * derived. Who he spoke to is in the store, so asking would be insulting and
 * would waste the one thing a form has, which is his attention. What is left is
 * what only he can say.
 *
 * `took` is where the day actually went, which is rarely where it was meant to.
 * `avoided` is the uncomfortable one and the most useful over time - avoidance
 * is invisible day to day and obvious across a month. `differently` is the
 * smallest possible retrospective, and it is first person by construction.
 *
 * ## Everything is optional, including all of it
 *
 * Three required fields produce something invented at eleven at night, and
 * invented data is worse than none: it survives, it reads like a fact, and it
 * poisons the pass that is the whole point. An entry with one box filled is a
 * real entry.
 *
 * Nothing here touches the store.
 */

import { DAY_MS } from "./time.js";

/**
 * The questions, in the order they are asked.
 *
 * Held here rather than in the view so the pass that reads entries and the form
 * that writes them cannot disagree about what a field means.
 */
export const JOURNAL_FIELDS = /** @type {const} */ ([
  {
    name: "took",
    label: "What took the day",
    hint: "Where it actually went, which is rarely where it was meant to go."
  },
  {
    name: "avoided",
    label: "What I avoided",
    hint: "The uncomfortable one. Invisible on the day, obvious across a month."
  },
  {
    name: "differently",
    label: "What I would do differently",
    hint: "One line. The smallest useful retrospective."
  },
  {
    name: "notes",
    label: "Anything else",
    hint: "For the days there is more to say than three lines."
  }
]);

/** How far back a pass reads by default. One review cycle. */
export const REVIEW_WINDOW_DAYS = 30;

/*
 * An entry is about the DAY, and names nobody.
 *
 * It briefly did. A checkbox per person was added here so a person's page could
 * answer "how has it been going", and the shape was wrong: this is a whole-day
 * retrospective, so ticking four names put one day's text - which may not be
 * about any of them - onto four people's pages. An answer built from that is
 * worse than no answer.
 *
 * What was actually wanted is a moment with one person, and that belongs on their
 * page rather than in the day. See `logMoment` in the service layer.
 *
 * The one-per-day rule stays for its own reason: the pass over these counts DAYS,
 * so three rows for one Tuesday would make every count wrong and make a
 * catching-up evening look like three days of habit.
 */

/**
 * Is there anything in this entry at all?
 *
 * @param {Record<string, any>} entry
 * @returns {boolean}
 */
export function hasContent(entry) {
  return JOURNAL_FIELDS.some((f) => String(entry[f.name] ?? "").trim() !== "");
}

/**
 * Entries inside a window, newest first.
 *
 * @param {Record<string, any>[]} entries
 * @param {number} now
 * @param {number} [days]
 * @returns {Record<string, any>[]}
 */
export function entriesSince(entries, now, days = REVIEW_WINDOW_DAYS) {
  const since = now - Math.max(1, days) * DAY_MS;
  return entries
    .filter((e) => !e._deleted && Number(e.at ?? 0) >= since)
    .sort((a, b) => Number(b.at ?? 0) - Number(a.at ?? 0));
}

/**
 * How much there is to read, said plainly.
 *
 * Carried alongside any summary rather than left implicit. A pass over five
 * entries and a pass over twenty-five are different claims, and a paragraph
 * that does not say which sounds equally confident either way - which is the
 * failure mode this whole app keeps running into from other directions.
 *
 * @param {Record<string, any>[]} entries Already windowed.
 * @param {number} days
 * @returns {{ entries: number, days: number, spread: number, thin: boolean, summary: string }}
 */
export function coverage(entries, days) {
  const written = entries.filter(hasContent);
  const dates = new Set(
    written.map((e) => new Date(Number(e.at ?? 0)).toISOString().slice(0, 10))
  );
  const spread = dates.size;
  // Under a week's worth in a month is not enough to call anything a pattern.
  // The number is arbitrary and the point is not: something has to separate "a
  // few notes" from "a month of them", or every summary sounds the same.
  const thin = spread < 7;
  return {
    entries: written.length,
    days,
    spread,
    thin,
    summary:
      spread === 0
        ? `Inget skrivet de senaste ${days} dagarna.`
        : `${written.length} ${written.length === 1 ? "post" : "poster"} över ${spread} ${spread === 1 ? "dag" : "dagar"}, av de senaste ${days}.`
  };
}
