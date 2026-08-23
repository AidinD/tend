/**
 * The questions Tend asks instead of deriving.
 *
 * Everything else in this tool refuses to ask for what it can work out. Signals
 * are the honest exception: the warning signs that matter are quiet ones, and
 * silence leaves no trace in any file. A senior who stopped pushing back in
 * design reviews, a retro that ends early because nobody believes candour
 * changes anything, someone whose actual work you have not seen in a month -
 * none of that shows up in delivery until much later.
 *
 * So once a month the app asks. The answer is almost always no, and the one
 * time it is yes is worth the whole exercise.
 *
 * Three questions, not six. Six fits on a screen; three get answered, and an
 * unanswered question is worth nothing.
 */

import { daysBetween } from "./time.js";
import { severityFor } from "./cadence.js";

/** How often the set is put in front of him. */
export const SIGNAL_CADENCE_DAYS = 30;

/**
 * The default set. Seeded as proposals like any other duty - he decides what
 * the job asks of him, including what it asks him to notice.
 *
 * Each one is chosen to cover a different failure: one person withdrawing, the
 * team going quiet as a group, and his own structural blind spot.
 */
export const DEFAULT_SIGNALS = [
  {
    id: "signal-pushback",
    text: "Has anyone stopped pushing back?",
    why:
      "Someone who has withdrawn usually keeps delivering for a while. What goes first is the " +
      "discretionary part: arguing in design discussions, reviewing other people's work, " +
      "volunteering for the unpleasant thing. Output is a lagging indicator."
  },
  {
    id: "signal-quiet-retro",
    text: "Do your retros end early with nothing resolved?",
    why:
      "Polite observations, no tension, no follow-through. A quiet team is usually not a lazy " +
      "team, it is one that has learned speaking up changes nothing."
  },
  {
    id: "signal-unseen-work",
    text: "Is there anyone whose actual work you have not seen in a month?",
    why:
      "Your own blind spot rather than a general one. You are the formal manager for people " +
      "whose work you no longer observe, so this is the question most likely to be answered yes " +
      "and least likely to occur to you unprompted."
  }
];

/**
 * @typedef {object} SignalDue
 * @property {string} id
 * @property {string} text
 * @property {string} why
 * @property {number} daysSince Days since it was last answered.
 * @property {boolean} everAnswered
 * @property {import("./cadence.js").Severity} severity
 * @property {string | null} lastAnswer "yes", "no", or null.
 */

/**
 * Which signals are due to be asked, worst first.
 *
 * A signal answered "yes" comes back sooner: something you flagged as a real
 * problem should not wait a full month for its next look.
 *
 * @param {import("../storage/reduce.js").Entity[]} signals
 * @param {import("../storage/reduce.js").Entity[]} answers
 * @param {number} now
 * @param {number} [since] When the practice started, for signals never answered.
 * @returns {SignalDue[]}
 */
export function signalsDue(signals, answers, now, since) {
  /** @type {SignalDue[]} */
  const out = [];

  for (const signal of signals) {
    if (signal._deleted || (signal.status ?? "active") !== "active") {
      continue;
    }

    const mine = answers
      .filter((a) => !a._deleted && a.signal === signal.id && typeof a.at === "number")
      .sort((a, b) => Number(b.at) - Number(a.at));

    const latest = mine[0] ?? null;
    const from = latest ? Number(latest.at) : (since ?? (typeof signal._at === "number" ? signal._at : now));
    const daysSince = Math.max(0, daysBetween(from, now));

    // A "yes" is an open problem, so it comes round again in a week.
    const interval = latest?.answer === "yes" ? 7 : Number(signal.cadenceDays ?? SIGNAL_CADENCE_DAYS);

    // A question that has never been answered is due now, not in a month.
    // Unlike a cadence, where a grace period stops a newly added person from
    // instantly reading as neglected, adding a question means wanting an
    // answer - and the first answer is what makes the set worth keeping.
    const severity = latest === null ? "warn" : severityFor(daysSince - interval, interval);

    out.push({
      id: String(signal.id),
      text: String(signal.text ?? ""),
      why: String(signal.why ?? ""),
      daysSince,
      everAnswered: latest !== null,
      severity,
      lastAnswer: latest ? String(latest.answer ?? "") : null
    });
  }

  return out.sort((a, b) => b.daysSince - a.daysSince);
}
