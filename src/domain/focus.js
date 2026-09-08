/**
 * Focus: a deliberate imbalance with an end date.
 *
 * The contract, which is the whole point of the feature:
 *
 *   A focus dampens the noise. It never mutes an alarm.
 *
 * Concretely - soft cadences get their thresholds stretched, proposed duties
 * stop surfacing, and that is all. Guarded duties are never stretched, nothing
 * is ever removed from "needs you", and every stretch reverts on the end date
 * whether or not the work is done. An unfinished focus becomes a decision to
 * renew rather than a drift nobody noticed.
 */

import { daysBetween } from "./time.js";

/** How far a focus may stretch a non-guarded interval. */
export const DEFAULT_STRETCH = 1.5;

/**
 * @typedef {object} FocusRow
 * @property {string} id
 * @property {string} [name]
 * @property {number} [startedAt]
 * @property {number} [endsAt]
 * @property {number} [budget] Share of the week, 0 to 1.
 * @property {number} [stretch] Multiplier for non-guarded intervals.
 * @property {string[]} [guarded] Duty ids that are never stretched.
 * @property {number} [baselineDrift] Mean drift in days when the focus was set,
 *   captured so the cost can be stated as a number rather than a feeling.
 * @property {number} [baselineCount] How many cadences that mean was taken
 *   over. Without it the cost cannot be stated at all - see `focusCost`. Absent
 *   on any focus set before this existed, which is why an unknown answer has to
 *   stay reachable rather than being treated as a bug.
 */

/**
 * @typedef {object} FocusStatus
 * @property {boolean} active
 * @property {number} daysLeft Negative once overrun.
 * @property {boolean} overrun
 * @property {number} stretch The multiplier currently in force.
 * @property {string} summary
 */

/**
 * A focus that has passed its end date stops stretching anything. This is the
 * automatic revert, and it is why an overrun cannot quietly persist.
 *
 * @param {FocusRow | null} focus
 * @param {number} now
 * @returns {FocusStatus}
 */
export function focusStatus(focus, now) {
  if (!focus) {
    return { active: false, daysLeft: 0, overrun: false, stretch: 1, summary: "No focus set." };
  }

  const endsAt = typeof focus.endsAt === "number" ? focus.endsAt : null;
  const daysLeft = endsAt === null ? Infinity : daysBetween(now, endsAt);
  const overrun = daysLeft < 0;

  if (overrun) {
    return {
      active: true,
      daysLeft,
      overrun: true,
      stretch: 1,
      summary: `"${focus.name}" passerade sitt slutdatum för ${-daysLeft} dagar sedan. Trösklarna är tillbaka till det normala. Förnya det eller avsluta det.`
    };
  }

  const stretch = typeof focus.stretch === "number" ? focus.stretch : DEFAULT_STRETCH;
  const left = daysLeft === Infinity ? "inget slutdatum satt" : `${daysLeft} dagar kvar`;
  return {
    active: true,
    daysLeft,
    overrun: false,
    stretch,
    summary: `"${focus.name}", ${left}.`
  };
}

/**
 * The interval multiplier that applies to one duty right now.
 *
 * Returns 1 - meaning no dampening at all - for a guarded duty, for a duty the
 * caller marks guarded, and whenever no focus is in force. Anything that wants
 * to be dampened has to pass through here, so there is exactly one place where
 * the contract could be broken and it is under test.
 *
 * @param {FocusRow | null} focus
 * @param {number} now
 * @param {object} duty
 * @param {string} [duty.id]
 * @param {boolean} [duty.guarded]
 * @returns {number}
 */
export function stretchFor(focus, now, duty) {
  if (duty.guarded) {
    return 1;
  }
  const status = focusStatus(focus, now);
  if (!status.active || status.overrun) {
    return 1;
  }
  if (duty.id && focus?.guarded?.includes(duty.id)) {
    return 1;
  }
  return status.stretch;
}

/**
 * What the focus has cost so far, in the only currency that matters here:
 * how much further behind everything else has fallen since it started.
 *
 * ## Why this takes a count and not just a mean
 *
 * It subtracts a mean captured when the focus was set from a mean taken now,
 * and until this was fixed those two were taken over different populations
 * with the difference reported as the focus's price. Adding one peer with a
 * year-old relation start and no contact moved it from 0.1 to 50.9 days. The
 * drift was entirely real and the focus had caused none of it.
 *
 * So the caller measures only over cadences that already existed when the focus
 * started, and passes how many that was. If the number matches the count the
 * baseline was taken over, the two means describe the same set and the
 * difference is a price. If it does not - somebody archived, somebody left, a
 * duty withdrawn - then something has left the population as well, and the
 * honest answer is that it cannot be said.
 *
 * Refusing to answer is a real outcome here rather than an error path. Any
 * focus set before the count was stored has no baseline to compare against,
 * and saying so is the whole point: a price nobody can stand behind is worse
 * than no price, because it gets quoted.
 *
 * @param {FocusRow | null} focus
 * @param {{ mean: number, count: number }} now Mean drift across the non-guarded
 *   cadences that existed when the focus started, and how many there were.
 * @returns {{ known: boolean, deltaDays: number, summary: string }}
 */
export function focusCost(focus, now) {
  if (!focus || typeof focus.baselineDrift !== "number") {
    return {
      known: false,
      deltaDays: 0,
      summary: "Ingen utgångspunkt registrerades när det här fokuset sattes, så vad det kostar går inte att säga."
    };
  }

  if (typeof focus.baselineCount !== "number") {
    return {
      known: false,
      deltaDays: 0,
      summary:
        "Det här fokuset sattes innan Tend började spara hur många takter utgångspunkten " +
        "räknades över, så en differens mot den kan inte tillskrivas fokuset. Sätt om det " +
        "för att få kostnaden mätt."
    };
  }

  if (now.count !== focus.baselineCount) {
    const fewer = focus.baselineCount - now.count;
    return {
      known: false,
      deltaDays: 0,
      summary:
        `Utgångspunkten räknades över ${focus.baselineCount} takter och ` +
        `${now.count} av dem finns kvar, så skillnaden mot den är inte fokusets pris - ` +
        `${fewer > 0 ? `${fewer} har fallit bort` : "populationen har ändrats"} sedan dess. ` +
        "Vad fokuset kostat går inte att säga för den här perioden.",
    };
  }

  const deltaDays = now.mean - focus.baselineDrift;
  if (deltaDays <= 0) {
    return {
      known: true,
      deltaDays,
      summary: "Inget har hamnat längre efter sedan det här fokuset började."
    };
  }

  const from = focus.baselineDrift.toFixed(1);
  const to = now.mean.toFixed(1);
  return {
    known: true,
    deltaDays,
    summary:
      `Genomsnittlig eftersläpning har gått från ${from} till ${to} dagar över samma ` +
      `${now.count} takter sedan det här fokuset började. Det är priset så här långt, ` +
      "inte ett argument för att sluta."
  };
}
