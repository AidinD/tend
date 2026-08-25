/**
 * When somebody is not currently yours to owe anything to.
 *
 * Two situations, and neither is the same as removing them.
 *
 * ## Away, and coming back
 *
 * Parental leave, a sabbatical, a long illness. The cadence should not run,
 * because the drift it accrues is not neglect - there was nobody to talk to.
 * Left alone it produces a permanent red item nothing can clear, which is the
 * one thing this tool must never do: a page that cries wolf every week is a page
 * you stop reading, and then the real thing on it goes unread too.
 *
 * The clock restarts from the day they come back rather than from the last time
 * you spoke. Measuring from the old contact would have somebody return after
 * six months already a critical case; treating their return as fresh contact
 * would mean nobody notices you have not caught up with them. Neither is true.
 * A return is the start of the interval.
 *
 * The end date is stored rather than a flag, so it expires by itself. A flag
 * somebody has to remember to unset is a flag that stays set.
 *
 * ## Left, and not coming back
 *
 * Deleting them is the obvious move and it is the wrong one. The record is the
 * valuable part: a year of 1-1s, what they delivered, what you promised. That is
 * what a reference, a rehire, or simply remembering what happened is built from,
 * and a tombstone throws it away to save a line on a roster.
 *
 * The last day is a date rather than a switch, and it is stored the moment it is
 * known. Until it passes, everything behaves normally - a promise to somebody
 * who leaves next week is exactly the promise to keep. After it passes, the
 * cadences and the promises go quiet and the history stays.
 *
 * Nothing here touches the store.
 */

/**
 * A date, or null for anything that is not one.
 *
 * `Number(null)` is 0, and 0 is a finite number in the past - so a cleared date
 * read through `Number` says "this happened at the start of 1970". Clearing a
 * last day therefore marked somebody as having left decades ago: their cadences
 * vanished, their promises went quiet, and the roster labelled them gone. The
 * type has to be checked before the value.
 *
 * @param {unknown} value
 * @returns {number | null}
 */
function stamp(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Is this person away right now?
 *
 * @param {Record<string, any>} person
 * @param {number} now
 * @returns {boolean}
 */
export function isAway(person, now) {
  const until = stamp(person.awayUntil);
  return until !== null && until > now;
}

/**
 * Have they already left?
 *
 * @param {Record<string, any>} person
 * @param {number} now
 * @returns {boolean}
 */
export function hasLeft(person, now) {
  const at = stamp(person.leftAt);
  return at !== null && at <= now;
}

/**
 * Is a last day set, whether or not it has arrived?
 *
 * Separate from `hasLeft` because the roster wants to show "leaving on the 30th"
 * while still holding them to everything until then.
 *
 * @param {Record<string, any>} person
 * @returns {boolean}
 */
export function isLeaving(person) {
  return stamp(person.leftAt) !== null;
}

/**
 * Should any cadence apply to this person today?
 *
 * @param {Record<string, any>} person
 * @param {number} now
 * @returns {boolean}
 */
export function inScope(person, now) {
  return !isAway(person, now) && !hasLeft(person, now);
}

/**
 * The earliest instant a cadence for this person may measure from.
 *
 * Their return, once it has happened. Anything older than that - the last
 * conversation before they went away, or the day they joined - describes a
 * period when there was nobody to talk to, so counting from it would report
 * somebody as badly neglected on their first morning back.
 *
 * @param {Record<string, any>} person
 * @param {number} now
 * @returns {number} Milliseconds since epoch, or 0 when nothing applies.
 */
export function notBefore(person, now) {
  const until = stamp(person.awayUntil);
  if (until === null || until > now) {
    return 0;
  }
  return until;
}

/**
 * How a person's availability reads, or null when there is nothing to say.
 *
 * @param {Record<string, any>} person
 * @param {number} now
 * @returns {string | null}
 */
export function availability(person, now) {
  if (hasLeft(person, now)) {
    return "left";
  }
  if (isLeaving(person)) {
    return "leaving";
  }
  if (isAway(person, now)) {
    return "away";
  }
  return null;
}
