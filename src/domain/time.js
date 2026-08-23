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
 * @param {number} from Milliseconds since epoch.
 * @param {number} to Milliseconds since epoch.
 * @returns {number} Negative if `to` is before `from`.
 */
export function daysBetween(from, to) {
  return Math.floor((to - from) / DAY_MS);
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
