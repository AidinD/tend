/**
 * Promises: the things you said you would come back on.
 *
 * The single highest-value thing this tool tracks. Broken promises are how
 * trust leaks, and they leak silently: the person stops asking, which reads as
 * the matter being settled when it means the opposite.
 *
 * So the rule here is deliberately unforgiving. Past a threshold a promise is
 * critical regardless of any focus, any stretch, and any judgement about how
 * important it was.
 */

import { daysBetween } from "./time.js";

/**
 * Past this age a promise escalates no matter what else is going on. Guarded:
 * a focus cannot dampen it.
 *
 * Was fourteen days, and shortened on 2026-08-24 after a week of real use. A
 * fortnight is long enough that the other person has already concluded you
 * forgot - the leak this exists to catch has happened by then.
 */
export const PROMISE_GUARD_DAYS = 7;

/**
 * Age at which an undated promise starts to be worth surfacing.
 *
 * Moved down with the guard, to keep the two stages apart. Collapsed onto the
 * same number a promise would go straight from silent to critical, and the soft
 * tier exists precisely so that the critical one stays rare enough to mean
 * something.
 */
export const PROMISE_WATCH_DAYS = 3;

/** Grace period after a stated due date before it reads as critical. */
export const PROMISE_DUE_GRACE_DAYS = 3;

/**
 * @typedef {object} PromiseRow
 * @property {string} id
 * @property {string} [person] Subject id.
 * @property {string} [text]
 * @property {number} [madeAt] When it was made, ms since epoch.
 * @property {number | null} [due] Stated due date, ms since epoch, or null.
 * @property {string} [state] "open" | "resolved" | "dropped".
 * @property {boolean} [_deleted]
 * @property {string} [_by] Which writer created it, so a model-extracted promise
 *   can be labelled as such in the UI.
 */

/**
 * @typedef {object} PromiseStatus
 * @property {number} ageDays
 * @property {number | null} pastDueDays Null when no due date was given.
 * @property {import("./cadence.js").Severity} severity
 * @property {boolean} guarded True once past PROMISE_GUARD_DAYS.
 * @property {string} why One line explaining the severity, for the UI.
 */

/**
 * @param {PromiseRow} p
 * @param {number} now
 * @returns {PromiseStatus}
 */
export function promiseStatus(p, now) {
  const madeAt = typeof p.madeAt === "number" ? p.madeAt : now;
  const ageDays = Math.max(0, daysBetween(madeAt, now));
  const pastDueDays = typeof p.due === "number" ? daysBetween(p.due, now) : null;
  const guarded = ageDays > PROMISE_GUARD_DAYS;

  if (guarded) {
    return {
      ageDays,
      pastDueDays,
      severity: "critical",
      guarded: true,
      why: `Open for ${ageDays} days. Past two weeks a promise escalates regardless.`
    };
  }

  if (pastDueDays !== null) {
    if (pastDueDays > PROMISE_DUE_GRACE_DAYS) {
      return {
        ageDays,
        pastDueDays,
        severity: "critical",
        guarded: false,
        why: `${pastDueDays} days past the date you gave.`
      };
    }
    if (pastDueDays > 0) {
      return {
        ageDays,
        pastDueDays,
        severity: "warn",
        guarded: false,
        why: `Due ${pastDueDays} day(s) ago.`
      };
    }
    return {
      ageDays,
      pastDueDays,
      severity: "ok",
      guarded: false,
      why: `Due in ${-pastDueDays} day(s).`
    };
  }

  if (ageDays > PROMISE_WATCH_DAYS) {
    return {
      ageDays,
      pastDueDays,
      severity: "warn",
      guarded: false,
      why: `Open for ${ageDays} days with no date attached.`
    };
  }

  return { ageDays, pastDueDays, severity: "ok", guarded: false, why: `Open for ${ageDays} days.` };
}

/**
 * Open promises, worst first.
 *
 * @param {PromiseRow[]} promises
 * @param {number} now
 * @returns {(PromiseRow & { status: PromiseStatus })[]}
 */
export function openPromises(promises, now) {
  return promises
    .filter((p) => !p._deleted && (p.state ?? "open") === "open")
    .map((p) => ({ ...p, status: promiseStatus(p, now) }))
    .sort((a, b) => b.status.ageDays - a.status.ageDays);
}
