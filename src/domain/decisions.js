/**
 * Decisions about the organisation, and the date that makes them a tool.
 *
 * Every repo here carries a DECISIONS.md with the alternatives that lost. That
 * instinct exists for code and for nothing else: "we are not backfilling that
 * role", "X moves to the platform team", "his promotion case waits a cycle" have
 * no commit history, so they get renegotiated every quarter by people who have
 * forgotten the reasoning - including the person who decided.
 *
 * ## The revisit date is the whole design
 *
 * An archive is a place decisions go to be forgotten politely. What makes this a
 * tool is that it comes back to you: you do not have to remember to reconsider
 * the staffing call in November, because in November it appears.
 *
 * It also makes deciding cheaper. A decision with a revisit date is not
 * permanent, and knowing that is what lets you make it today instead of
 * gathering more information you will not use.
 *
 * ## Proposed and recorded
 *
 * An agent may propose. Only the user records. Same boundary as the role map,
 * and for the same reason: an agent that can write the decision log directly can
 * quietly rewrite what you believe you decided.
 *
 * A proposal carries where it came from, because "this looks like a decision"
 * is only checkable against the note it was read out of.
 */

import { DAY_MS } from "./time.js";

/** @typedef {"proposed" | "recorded" | "revisited" | "reversed"} DecisionStatus */

export const DECISION_STATUS = /** @type {const} */ (["proposed", "recorded", "revisited", "reversed"]);

/**
 * How long until a decision is worth another look, when nobody said.
 *
 * Ninety days rather than a year. A default nobody chose should err towards
 * asking too early: an unnecessary review costs a minute, and a decision that
 * quietly outlived its reasoning costs a quarter.
 */
export const DEFAULT_REVISIT_DAYS = 90;

/** @param {string} v @returns {v is DecisionStatus} */
export const isDecisionStatus = (v) => DECISION_STATUS.includes(/** @type {any} */ (v));

/**
 * Is this decision asking to be looked at again, and how overdue is it?
 *
 * A reversed decision never comes back - it has already been superseded, and
 * asking about it again is asking about history. A proposal does not come back
 * either: it has not been decided yet, so there is nothing to revisit.
 *
 * @param {Record<string, any>} decision
 * @param {number} now
 * @returns {{ due: boolean, overdueDays: number }}
 */
export function revisitStatus(decision, now) {
  const status = String(decision.status ?? "");
  if (status === "proposed" || status === "reversed") {
    return { due: false, overdueDays: 0 };
  }
  const at = Number(decision.revisitAt ?? 0);
  if (!Number.isFinite(at) || at <= 0) {
    return { due: false, overdueDays: 0 };
  }
  const overdueDays = Math.floor((now - at) / DAY_MS);
  return { due: overdueDays >= 0, overdueDays: Math.max(0, overdueDays) };
}

/**
 * When a decision made now should come back.
 *
 * @param {number} now
 * @param {number} [days]
 */
export const revisitAt = (now, days = DEFAULT_REVISIT_DAYS) =>
  now + Math.max(1, Math.floor(Number(days) || DEFAULT_REVISIT_DAYS)) * DAY_MS;

/**
 * What a decision is missing, in words.
 *
 * Advice rather than validation. A decision recorded with only its text is still
 * worth more than one nobody wrote down, so this never blocks - but the fields
 * that make it re-readable in a year are the ones people skip, and the record is
 * only worth keeping if it survives being read by somebody who was not there.
 *
 * @param {Record<string, any>} decision
 * @returns {string[]}
 */
export function thin(decision) {
  const missing = [];
  if (String(decision.because ?? "").trim() === "") {
    missing.push("varför. Om ett år är det här det enda fältet som betyder något.");
  }
  if (String(decision.rejected ?? "").trim() === "") {
    missing.push(
      "vad som valdes bort. Ett beslut utan alternativ läser som det enda alternativet, vilket det aldrig var."
    );
  }
  if (!Array.isArray(decision.consulted) || decision.consulted.length === 0) {
    missing.push("vem som tillfrågades. Det är också vilka som ska få veta när det här ändras.");
  }
  return missing;
}
