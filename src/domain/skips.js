/**
 * The meeting that was booked and did not happen.
 *
 * ## Why this is a record at all
 *
 * Tend measures contact, and a cancelled meeting is not contact - so the
 * obvious answer is to record nothing. That answer loses the most useful thing
 * in the situation.
 *
 * "We never got round to booking it" and "we booked it and cancelled it three
 * times" look identical to a tool that only counts contact: both are silence.
 * They are not the same fact. The second one is a pattern, it is usually about
 * something, and it is exactly the sort of thing that is obvious in hindsight
 * and invisible while it is happening. A 1-1 that keeps being the thing that
 * gives way is a signal about how the week is being spent, and about the
 * relationship.
 *
 * ## What it must never do
 *
 * Satisfy anything. A skip is stored beside contact and read nowhere that
 * contact is read: no cadence consumes it, no drift moves for it. The whole
 * value of writing it down evaporates if recording the cancellation quiets the
 * page that would otherwise tell you the conversation still has not happened.
 *
 * ## Why the reason is a free line
 *
 * A dropdown of causes would produce statistics nobody acts on. One sentence in
 * his own words - "release week", "he was ill", "I moved it for the third time" -
 * is what makes the pattern readable three months later, and the difference
 * between the first and third of those is the entire point.
 *
 * Nothing here touches the store.
 */

import { DAY_MS } from "./time.js";

/** How far back a pattern is worth counting. One review cycle. */
export const SKIP_WINDOW_DAYS = 90;

/**
 * How many times something was skipped with this person recently.
 *
 * @param {{ person?: string, kind?: string, at?: number, _deleted?: boolean }[]} skips
 * @param {string} personId
 * @param {number} now
 * @param {string} [kind] Only count skips of this kind.
 * @returns {number}
 */
export function skipsFor(skips, personId, now, kind) {
  const since = now - SKIP_WINDOW_DAYS * DAY_MS;
  return skips.filter(
    (s) =>
      !s._deleted &&
      s.person === personId &&
      Number(s.at ?? 0) >= since &&
      (kind === undefined || s.kind === kind)
  ).length;
}

/**
 * The most recent skips with this person, newest first.
 *
 * @param {Record<string, any>[]} skips
 * @param {string} personId
 * @param {number} [limit]
 * @returns {Record<string, any>[]}
 */
export function recentSkips(skips, personId, limit = 5) {
  return skips
    .filter((s) => !s._deleted && s.person === personId && typeof s.at === "number")
    .sort((a, b) => Number(b.at) - Number(a.at))
    .slice(0, Math.max(0, limit));
}

/**
 * How a run of cancellations reads, or null when there is nothing worth saying.
 *
 * Two, not one. Something cancelled once is a week, not a pattern, and a card
 * that comments on every rearranged meeting is a card that gets skimmed.
 *
 * @param {number} count
 * @param {string} kind
 * @returns {string | null}
 */
export function skipPattern(count, kind) {
  if (count < 2) {
    return null;
  }
  return `${kind} did not happen ${count} times in the last ${SKIP_WINDOW_DAYS / 30} months.`;
}
