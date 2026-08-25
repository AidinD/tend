/**
 * Time, in the only unit this tool cares about: whole days.
 *
 * Everything here works in 24-hour periods rather than calendar dates. That is
 * a deliberate simplification - "five weeks since we last spoke" does not get
 * better by being timezone-correct, and calendar arithmetic across a DST
 * boundary is a bug generator with nothing to show for it.
 */

export const DAY_MS = 86_400_000;

/**
 * Whole days between two instants, rounded down.
 *
 * Throws on an instant that is not a finite number, and the throw is the point.
 * Every service function here takes the clock as an argument; a caller that
 * omits it used to get `NaN` through `Math.max`, which came out of the app as
 * "NaN weeks ago" and "+NaNw" - a confident answer that looked like a product
 * bug and was a missing argument. It cost a session's time before anybody
 * suspected the call rather than the code.
 *
 * Substituting `Date.now()` instead would be worse. A silently supplied clock
 * gives a plausible wrong answer, which is the failure that keeps happening in
 * this codebase: it passes every check the caller thinks to run. A throw is the
 * one outcome that cannot be mistaken for a result.
 *
 * Nothing in the app can reach this. The MCP server stamps the clock once at
 * its dispatch point and every Electron operation passes `a.now ?? Date.now()`,
 * so the only callers that can arrive without one are tests and scripts -
 * exactly where a loud failure is worth having. Same reasoning as
 * `computeDrift` refusing a non-positive interval.
 *
 * @param {number} from Milliseconds since epoch.
 * @param {number} to Milliseconds since epoch.
 * @returns {number} Negative if `to` is before `from`.
 */
export function daysBetween(from, to) {
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    throw new Error(
      `daysBetween needs two finite instants, got ${describe(from)} and ${describe(to)}. ` +
        `A missing one is almost always an omitted "now" argument.`
    );
  }
  return Math.floor((to - from) / DAY_MS);
}

/**
 * Name a bad value in a way that points at the mistake.
 *
 * `undefined` and `NaN` print identically through template interpolation once
 * they have been through arithmetic, and they mean different things: the first
 * is an argument nobody passed, the second is one that was computed from one.
 *
 * @param {unknown} value
 * @returns {string}
 */
function describe(value) {
  if (value === undefined) {
    return "undefined";
  }
  if (typeof value === "number" && Number.isNaN(value)) {
    return "NaN";
  }
  return JSON.stringify(value) ?? String(value);
}

/**
 * Render a day count the way a person reads it.
 *
 * Weeks past a fortnight, because "38 days" makes you do arithmetic and
 * "5 weeks" does not.
 *
 * @param {number} days
 * @returns {string}
 */
export function humanDays(days) {
  if (days <= 0) {
    return "today";
  }
  if (days === 1) {
    return "1 day";
  }
  if (days < 14) {
    return `${days} days`;
  }
  const weeks = Math.floor(days / 7);
  return `${weeks} weeks`;
}

/**
 * How long ago, as something you can read aloud.
 *
 * `humanDays` answers "how long" and returns "today" for nought, so appending
 * "ago" to it produces "today ago" on every row about somebody spoken to this
 * morning. The two words are not interchangeable and the suffix has to know
 * that - which Prep learned once and the person page did not, so it lives here
 * now rather than in whichever file noticed first.
 *
 * @param {number} days
 */
export function agoWords(days) {
  const words = humanDays(days);
  return words === "today" ? "today" : `${words} ago`;
}

/**
 * Short form for a drift badge: "+3w", "+5d", "on time".
 *
 * @param {number} days Positive means behind.
 * @returns {string}
 */
export function driftBadge(days) {
  if (days <= 0) {
    return "on time";
  }
  if (days < 14) {
    return `+${days}d`;
  }
  return `+${Math.floor(days / 7)}w`;
}

/**
 * Is this instant on a later day than now?
 *
 * Days rather than milliseconds, because the date pickers in this app parse a
 * chosen day at midday. Logging something that happened this morning therefore
 * produces a timestamp a few hours ahead of the clock, and a plain `at > now`
 * would reject today.
 *
 * The comparison is in local time on purpose. "Has this happened yet" is a
 * question about the user's day, and there is exactly one user in one place.
 *
 * @param {number} at
 * @param {number} now
 * @returns {boolean}
 */
export function isLaterDay(at, now) {
  if (!Number.isFinite(at) || !Number.isFinite(now)) {
    return false;
  }
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  return at > endOfToday.getTime();
}
