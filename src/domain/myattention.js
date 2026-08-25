/**
 * Signals about your attention. Not measurements of other people.
 *
 * ## The line, and why it is here rather than only in a document
 *
 * The obvious version of this feature measures the team: pull-request review
 * latency, who reviews whom, who is quiet in the retro, response times. That
 * version is surveillance. It measures people who did not agree to be measured,
 * with proxy variables that are wrong - a quiet person in a retro may be the one
 * doing the thinking - and it turns a tool for noticing into a tool for
 * evidence-gathering.
 *
 * It is also easier to build and looks like more value, which is exactly why the
 * refusal has to live in the code. A future session reading a ticket that says
 * "attention signals" will reach for it. The rule:
 *
 *   **Every signal here has a first-person subject.** Am I neglecting somebody?
 *   Is my attention concentrated on the people who ask loudest? Have I heard
 *   about anyone only second-hand? If a signal's sentence has a colleague as its
 *   subject rather than as its object, it does not belong in this file.
 *
 * A test asserts every signal's text begins in the first person. That is not
 * decoration - it is the only mechanical check that catches the drift.
 *
 * ## No model, deliberately
 *
 * This is arithmetic on dates. A script beats both models here: it costs
 * nothing, it is the same answer every time, and it cannot hallucinate a
 * neglected colleague who does not exist. Which matters more than usual, because
 * a false "you are neglecting Nina" is a thing you might act on.
 */

import { inScope } from "./people.js";
import { DAY_MS } from "./time.js";

/** The window every signal looks back over. A month is one review cycle. */
export const WINDOW_DAYS = 30;

/**
 * How lopsided contact has to be before it is worth saying.
 *
 * Over half your logged contact going to a fifth of the people. Not a number
 * anybody derived - it is the point where the pattern is obvious in hindsight
 * and invisible while it is happening, which is what a signal is for.
 */
const CONCENTRATION_SHARE = 0.5;
const CONCENTRATION_OF = 0.2;

/**
 * @typedef {object} Signal
 * @property {string} key
 * @property {string} text First person. About you.
 * @property {string} [detail]
 * @property {number} weight Higher sorts first.
 */

/**
 * @param {object} input
 * @param {{ id: string, name: string, relation?: string }[]} input.people
 * @param {{ subject?: string, kind?: string, at?: number }[]} input.touches
 * @param {number} input.now
 * @param {{ id: string, person?: string }[]} [input.stakes] Stakeholder interests,
 *   so an update logged against one counts as contact with the person it is for.
 * @returns {Signal[]}
 */
export function myAttention({ people, touches, now, stakes = [] }) {
  const since = now - WINDOW_DAYS * DAY_MS;
  // Somebody on leave or already gone is not somebody you are neglecting, and
  // counting them makes every signal here quietly wrong: "I have not spoken to
  // 5 of 10 people" is a different sentence when two of them were not there.
  const here = people.filter((p) => inScope(p, now));
  const names = new Map(here.map((p) => [String(p.id), String(p.name ?? "")]));

  // An update to a stakeholder is contact with a person, even though it is
  // filed against the person-and-project pair. Without this translation the app
  // says "I have not spoken to Silje this month" on a day it also shows an
  // update to Silje logged that morning - two true records contradicting each
  // other, which is worse than either signal being absent.
  const viaStake = new Map(
    stakes
      .filter((s) => names.has(String(s.person ?? "")))
      .map((s) => [String(s.id), String(s.person)])
  );

  /** @param {unknown} subject */
  const asPerson = (subject) => {
    const id = String(subject ?? "");
    return names.has(id) ? id : (viaStake.get(id) ?? null);
  };

  const recent = touches
    .filter((t) => Number(t.at ?? 0) >= since && asPerson(t.subject) !== null)
    .map((t) => ({ ...t, subject: asPerson(t.subject) }));

  /** @type {Signal[]} */
  const signals = [];

  /* --------------------------------------------------- nobody at all -- */

  const spokenTo = new Set(recent.map((t) => String(t.subject)));
  const unheard = [...names.entries()].filter(([id]) => !spokenTo.has(id)).map(([, name]) => name);

  if (unheard.length > 0 && here.length > 1) {
    signals.push({
      key: "i-have-not-spoken-to",
      text: `I have not spoken to ${unheard.length} of ${here.length} people this month.`,
      detail: unheard.join(", "),
      weight: 100 + unheard.length
    });
  }

  /* ------------------------------------------------- where it all went -- */

  if (recent.length >= 6 && people.length >= 4) {
    const perPerson = new Map();
    for (const t of recent) {
      const id = String(t.subject);
      perPerson.set(id, (perPerson.get(id) ?? 0) + 1);
    }
    const ranked = [...perPerson.entries()].sort((a, b) => b[1] - a[1]);
    const topCount = Math.max(1, Math.round(people.length * CONCENTRATION_OF));
    const top = ranked.slice(0, topCount);
    const share = top.reduce((sum, [, n]) => sum + n, 0) / recent.length;

    if (share >= CONCENTRATION_SHARE) {
      signals.push({
        key: "my-attention-is-concentrated",
        text: `${Math.round(share * 100)}% of my contact this month went to ${top.length} ${top.length === 1 ? "person" : "people"}.`,
        // Named, because "your attention is concentrated" is not actionable and
        // "it all went to these two" is. They are not being judged; the pattern
        // is mine.
        detail: top.map(([id]) => names.get(id) ?? "?").join(", "),
        weight: 80 + Math.round(share * 10)
      });
    }
  }

  /* ------------------------------------------------ only second-hand -- */

  const firstHand = new Set(
    recent.filter((t) => String(t.kind ?? "") !== "second-hand").map((t) => String(t.subject))
  );
  const onlyHeardAbout = [...spokenTo]
    .filter((id) => !firstHand.has(id))
    .map((id) => names.get(id) ?? "?");

  if (onlyHeardAbout.length > 0) {
    signals.push({
      key: "i-have-only-heard-about",
      // The blind spot Tend exists for, stated as mine. Everything I know about
      // them this month came through somebody else.
      text: `Everything I know about ${onlyHeardAbout.length} ${onlyHeardAbout.length === 1 ? "person" : "people"} this month came through somebody else.`,
      detail: onlyHeardAbout.join(", "),
      weight: 90 + onlyHeardAbout.length
    });
  }

  return signals.sort((a, b) => b.weight - a.weight);
}
