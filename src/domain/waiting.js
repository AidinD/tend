/**
 * What you are waiting for from somebody else.
 *
 * The mirror of a promise, and deliberately not the same thing. A promise is
 * something you owe: when it ages, trust leaks, and the tool is unforgiving
 * about it because the person let down is let down today. This is the other
 * direction - you asked, and the answer has not come - and almost every rule has
 * to be softer, for one reason:
 *
 *   **The delay is not yours.** A tool that escalated somebody else's silence
 *   into an alarm on your page would be measuring them and blaming you, and it
 *   would train you to skim the one page that must never be skimmed.
 *
 * So nothing here is ever critical and nothing here is ever guarded. The job is
 * that a question you sent does not quietly rot, not that you feel bad about
 * somebody else's inbox.
 *
 * ## Why it does belong in Now, unlike a growth thread
 *
 * Because it is actionable today and short-lived. A direction standing still for
 * a month is not something to do anything about this afternoon; an unanswered
 * question you are blocked on is - you chase it, or you decide to route around
 * it. Both are deviations, which is what that page is for.
 *
 * ## The reading that matters
 *
 * Not the waiting. The CHASING. One reminder is ordinary; three reminders with
 * nothing back is a fact about a working relationship, and it is invisible while
 * it happens because each individual nudge feels reasonable. Same shape as the
 * stall on a growth thread, and the same argument: the count nobody keeps is the
 * one worth keeping.
 *
 * Nothing here touches the store.
 */

import { severityFor } from "./cadence.js";
import { daysBetween } from "./time.js";

/**
 * How long before an unanswered ask is worth mentioning, by default.
 *
 * A week. Shorter and it nags about ordinary human latency - people are away,
 * people have their own week. Longer and the thing you are blocked on has cost
 * you a sprint before anybody says so.
 */
export const DEFAULT_WAIT_DAYS = 7;

/**
 * Chases after which the silence is the finding rather than the delay.
 *
 * Three. Once is ordinary and twice is a busy week; three reminders with nothing
 * back means the answer is probably not coming, and continuing to wait is a
 * decision rather than patience.
 */
export const MANY_CHASES = 3;

/**
 * @typedef {object} WaitRow
 * @property {string} id
 * @property {string} [person] Subject id: who owes the answer.
 * @property {string} [what] What you asked for.
 * @property {string} [why] Why it matters, or what it is blocking.
 * @property {number} [askedAt]
 * @property {number} [cadenceDays] How long to wait before it is worth a nudge.
 * @property {string} [state] "open" | "answered" | "dropped".
 * @property {string} [endedWhy] What the answer was, or why you stopped waiting.
 * @property {boolean} [_deleted]
 * @property {number} [_at]
 */

/**
 * @typedef {object} ChaseRow
 * @property {string} [waiting] Wait id.
 * @property {number} [at]
 * @property {string} [note]
 * @property {boolean} [_deleted]
 */

/**
 * @typedef {object} WaitState
 * @property {string} id
 * @property {string} person
 * @property {string} what
 * @property {string} why
 * @property {number} daysWaiting Since you asked.
 * @property {number} daysSinceNudge Since you asked or last chased, whichever is later.
 * @property {number} chases
 * @property {number} interval
 * @property {import("./cadence.js").Severity} severity Never critical, by design.
 * @property {boolean} due Past its interval since the last nudge.
 * @property {boolean} stale Chased enough times that the silence is the answer.
 * @property {string | null} asks The one question this poses, or null.
 */

/**
 * @param {WaitRow} row
 * @returns {boolean}
 */
export function isOpen(row) {
  return !row._deleted && String(row.state ?? "open") === "open";
}

/**
 * Everything about one wait that a view needs, worked out rather than stored.
 *
 * @param {WaitRow} row
 * @param {ChaseRow[]} chases
 * @param {number} now
 * @returns {WaitState}
 */
export function waitState(row, chases, now) {
  const mine = chases.filter((c) => !c._deleted && c.waiting === row.id && Number.isFinite(Number(c.at)));

  const askedAt = typeof row.askedAt === "number" ? row.askedAt : typeof row._at === "number" ? row._at : now;
  const lastChase = mine.reduce(
    (latest, c) => (latest === null || Number(c.at) > latest ? Number(c.at) : latest),
    /** @type {number | null} */ (null)
  );

  const interval = Number(row.cadenceDays) > 0 ? Number(row.cadenceDays) : DEFAULT_WAIT_DAYS;
  const daysWaiting = Math.max(0, daysBetween(askedAt, now));
  const daysSinceNudge = Math.max(0, daysBetween(lastChase ?? askedAt, now));

  // Capped at warn on purpose. Somebody else's silence is not an alarm about
  // you, and the whole value of "needs you" is that everything on it is.
  const raw = severityFor(daysSinceNudge - interval, interval);
  const severity = raw === "critical" ? "warn" : raw;

  const stale = mine.length >= MANY_CHASES;

  return {
    id: String(row.id),
    person: String(row.person ?? ""),
    what: String(row.what ?? ""),
    why: String(row.why ?? ""),
    daysWaiting,
    daysSinceNudge,
    chases: mine.length,
    interval,
    severity,
    due: daysSinceNudge > interval,
    stale,
    asks: stale
      ? `Chased ${mine.length} times with nothing back. Is this answer coming, or is it time to decide without it?`
      : null
  };
}

/**
 * Open waits, longest since the last nudge first.
 *
 * @param {object} args
 * @param {WaitRow[]} args.waiting
 * @param {ChaseRow[]} args.chases
 * @param {number} args.now
 * @param {string} [args.person] Only this person's, when given.
 * @returns {WaitState[]}
 */
export function openWaits({ waiting, chases, now, person }) {
  return waiting
    .filter((row) => isOpen(row) && (person === undefined || row.person === person))
    .map((row) => waitState(row, chases, now))
    .sort((a, b) => {
      // A silence that has become the finding outranks one that is merely due:
      // the first needs a decision, the second needs a reminder.
      const asking = Number(b.asks !== null) - Number(a.asks !== null);
      if (asking !== 0) {
        return asking;
      }
      return b.daysSinceNudge - a.daysSinceNudge;
    });
}

/**
 * The waits worth putting on the daily page.
 *
 * Only what is past its interval. Something asked yesterday is not a deviation,
 * and a page that lists every open question is a page that lists your inbox.
 *
 * @param {object} args
 * @param {WaitRow[]} args.waiting
 * @param {ChaseRow[]} args.chases
 * @param {number} args.now
 * @returns {WaitState[]}
 */
export function waitsDue({ waiting, chases, now }) {
  return openWaits({ waiting, chases, now }).filter((w) => w.due || w.asks !== null);
}

/** How a wait can end. Both endings are ordinary. */
export const WAIT_ENDINGS = /** @type {const} */ ({
  answered: { label: "Answered - I got what I asked for" },
  dropped: { label: "Dropped - I stopped waiting and moved on" }
});

/** @typedef {keyof typeof WAIT_ENDINGS} WaitEnding */

/**
 * @param {string} value
 * @returns {value is WaitEnding}
 */
export function isWaitEnding(value) {
  return Object.prototype.hasOwnProperty.call(WAIT_ENDINGS, value);
}

/** Options for a list, derived rather than written out again. */
export const WAIT_ENDING_OPTIONS = Object.entries(WAIT_ENDINGS).map(([value, entry]) => ({
  value: /** @type {WaitEnding} */ (value),
  label: entry.label
}));
