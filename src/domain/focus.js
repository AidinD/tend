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
 * @param {FocusRow | null} focus
 * @param {number} meanDriftNow Mean drift across non-guarded cadences, in days.
 * @returns {{ known: boolean, deltaDays: number, summary: string }}
 */
export function focusCost(focus, meanDriftNow) {
  if (!focus || typeof focus.baselineDrift !== "number") {
    return {
      known: false,
      deltaDays: 0,
      summary: "Ingen utgångspunkt registrerades när det här fokuset sattes, så vad det kostar går inte att säga."
    };
  }

  const deltaDays = meanDriftNow - focus.baselineDrift;
  if (deltaDays <= 0) {
    return {
      known: true,
      deltaDays,
      summary: "Inget har hamnat längre efter sedan det här fokuset började."
    };
  }

  const from = focus.baselineDrift.toFixed(1);
  const to = meanDriftNow.toFixed(1);
  return {
    known: true,
    deltaDays,
    summary: `Genomsnittlig eftersläpning har gått från ${from} till ${to} dagar sedan det här fokuset började. Det är priset så här långt, inte ett argument för att sluta.`
  };
}
