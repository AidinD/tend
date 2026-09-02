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
 * ## A habit is not a finding
 *
 * Most signals here point at something that already exists and is going unread:
 * entries nobody has looked back at, contact piling up on a few people. One
 * points at something that has NOT been written - the weekly reflection - and
 * that difference decides how loud the page is allowed to be about it. A signal
 * carrying `habit: true` may never stop Now from saying "nothing needs you",
 * because a week that went unreflected on has not let anybody down. Without the
 * flag the reflection reminder changed the daily page's headline for as long as
 * it stood, which is the opposite of the "quietly, at the bottom, easy to
 * ignore" it was designed as. It is a field rather than a check on the key so
 * the next reminder of this kind has to say which sort it is.
 *
 * ## No model, deliberately
 *
 * This is arithmetic on dates. A script beats both models here: it costs
 * nothing, it is the same answer every time, and it cannot hallucinate a
 * neglected colleague who does not exist. Which matters more than usual, because
 * a false "you are neglecting Nina" is a thing you might act on.
 */

import { inScope } from "./people.js";
import { REFLECTION_CADENCE_DAYS } from "./reflection.js";
import { LONG_GAP_DAYS, MIN_ENTRIES, MIN_SPREAD, unread } from "./review.js";
import { DAY_MS, daysBetween } from "./time.js";

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
 * @property {boolean} [habit] A routine not kept up, rather than a fact in hand.
 */

/**
 * @param {object} input
 * @param {{ id: string, name: string, relation?: string }[]} input.people
 * @param {{ subject?: string, kind?: string, at?: number }[]} input.touches
 * @param {number} input.now
 * @param {{ id: string, person?: string }[]} [input.stakes] Stakeholder interests,
 *   so an update logged against one counts as contact with the person it is for.
 * @param {Record<string, any>[]} [input.entries] End-of-day entries.
 * @param {number | null} [input.lastReadAt] When a pass over them last ran.
 * @param {{ at?: number }[]} [input.reflections] Weekly-ish look-backs already written.
 * @param {Record<string, any>[]} [input.aims] Goals he set for himself.
 * @param {Record<string, any>[]} [input.aimNotes] One row per occasion an aim did
 *   or did not happen. Both halves matter: the gap between them is the reading.
 * @returns {Signal[]}
 */
export function myAttention({
  people,
  touches,
  now,
  stakes = [],
  entries = [],
  lastReadAt = null,
  reflections = [],
  aims = [],
  aimNotes = []
}) {
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

  /* ------------------------------------------- written and never read -- */

  /*
   * The one signal here that is not about other people at all.
   *
   * It belongs anyway, and for the same reason as the rest: it is a first-person
   * fact about where his attention went. Evenings spent writing something down
   * that nothing has ever read are attention spent for nothing.
   *
   * ## Why the count is the trigger and time only the amplifier
   *
   * The obvious version fires on elapsed time - "it has been six weeks since you
   * read your journal". That version is a reproach for not having written, which
   * is exactly what the journal was designed never to produce: no prompt, no
   * streak, no badge in the rail, because a tool that asks every evening becomes a
   * tool that is avoided every evening and then the data stops entirely rather
   * than arriving unevenly.
   *
   * So the material is the trigger. This cannot fire on a quiet month, because a
   * quiet month has nothing unread. Time only raises the weight once there is
   * already enough to read.
   *
   * ## Why the floor is the pass's own floor
   *
   * Suggesting a reading the pass would refuse to perform is worse than saying
   * nothing: it sends you to a button that is disabled. The same
   * four-entries-over-three-days rule gates both, from one place.
   */
  const backlog = unread(entries, lastReadAt, now);

  if (backlog.entries >= MIN_ENTRIES && backlog.spread >= MIN_SPREAD) {
    const long = backlog.sinceDays !== null && backlog.sinceDays >= LONG_GAP_DAYS;
    const evenings = `${backlog.entries} ${backlog.entries === 1 ? "evening" : "evenings"}`;
    const days = `${backlog.spread} ${backlog.spread === 1 ? "day" : "days"}`;

    signals.push({
      key: "i-have-written-and-not-read",
      text:
        backlog.lastReadAt === null
          ? `I have written ${evenings} and never read them back.`
          : `I have written ${evenings} since I last read them back.`,
      detail:
        backlog.lastReadAt === null
          ? `Across ${days}. The pass over them was always the point; the entries were the means.`
          : `Across ${days}, and ${backlog.sinceDays} days since the last reading.`,
      // Under every signal about a person. Somebody being neglected outranks a
      // month of my own evenings going unread, and a list where those two compete
      // on equal terms teaches the wrong order.
      weight: 40 + Math.min(20, backlog.entries) + (long ? 10 : 0)
    });
  }

  /* ------------------------------------------------- not reflected on -- */

  /*
   * The second signal here with no colleague in it at all - see "written and
   * never read" above for why that still belongs in this file. This one
   * ranks under it on purpose: an unread journal at least has content sitting
   * there; this is only the absence of a habit, which is a smaller thing than
   * a month of evenings going unread.
   *
   * A brand-new install has nothing to reflect on yet - a week that has not
   * happened is not a gap, and nagging about it on day one would be exactly
   * the reproach `reflection.js` says this feature must never become. So this
   * only fires once there is evidence of at least a cadence's worth of use:
   * some touch or journal entry older than REFLECTION_CADENCE_DAYS.
   */
  const earliestActivity = [...touches, ...entries]
    .map((r) => Number(r.at ?? 0))
    .filter((t) => t > 0)
    .reduce(
      (min, t) => (min === null || t < min ? t : min),
      /** @type {number | null} */ (null)
    );

  const inUseLongEnough =
    earliestActivity !== null && daysBetween(earliestActivity, now) >= REFLECTION_CADENCE_DAYS;

  if (inUseLongEnough) {
    const lastReflectedAt = reflections.length
      ? Math.max(...reflections.map((r) => Number(r.at ?? 0)))
      : null;
    const daysSinceLast = lastReflectedAt === null ? null : daysBetween(lastReflectedAt, now);

    if (lastReflectedAt === null || (daysSinceLast !== null && daysSinceLast >= REFLECTION_CADENCE_DAYS)) {
      signals.push({
        key: "i-have-not-reflected",
        text:
          lastReflectedAt === null
            ? "I have not written a weekly reflection yet."
            : `I have not reflected on the week in ${daysSinceLast} days.`,
        detail: "A short look back: what went well, what I would do differently.",
        // Under everything above - somebody being neglected, or my own
        // journal going unread, both outrank a reminder that is about a
        // habit rather than a fact I already have sitting in front of me.
        weight: 20,
        // See "A habit is not a finding" in this file's header.
        habit: true
      });
    }
  }

  /* ------------------------------------------------- my own aims -- */

  /*
   * An aim that has gone quiet, and what to do about it.
   *
   * The nudge carries `through` - which real work the aim happens in - because
   * a reminder that says only "you have a goal" is the reminder that trained
   * somebody to ignore the page it sits on. Where the aim has no `through`
   * recorded, that absence IS the thing to say: a goal with no place to happen
   * is a goal waiting for a free evening.
   *
   * `habit: true` throughout. An aim not thought about in three weeks has let
   * nobody down, and it must never be able to change the daily page's headline -
   * see "A habit is not a finding" in this file's header.
   */
  for (const row of aims) {
    if (row._deleted || String(row.status ?? "open") !== "open") {
      continue;
    }
    const mine = aimNotes.filter((/** @type {any} */ n) => String(n.aim) === String(row.id));
    const last = mine
      .map((/** @type {any} */ n) => Number(n.at ?? 0))
      .sort((/** @type {number} */ a, /** @type {number} */ b) => b - a)[0];
    const from = last ?? Number(row.startedAt ?? now);
    const days = daysBetween(from, now);
    const cadence = Number(row.cadenceDays) > 0 ? Number(row.cadenceDays) : 21;

    if (days < cadence) {
      continue;
    }

    const through = String(row.through ?? "").trim();
    signals.push({
      key: `aim-quiet:${String(row.id)}`,
      text:
        last === undefined
          ? `I set out to ${lower(String(row.aim ?? "something"))} and have not logged an occasion yet.`
          : `I have not logged anything on "${String(row.aim ?? "")}" in ${days} days.`,
      detail:
        through === ""
          ? "No work is named for this one, which is the part to fix first - a goal with nowhere to happen waits for a free evening."
          : `Where it happens: ${through}`,
      // Below the reflection reminder. That one is about a habit of looking
      // back at everything; this is one thread inside it.
      weight: 15,
      habit: true
    });
  }

  /*
   * An aim whose test was never written.
   *
   * Separate from the quiet one, and louder, because the two are different
   * failures: a quiet aim is one he has not got to, and an aim with no measure
   * is one that cannot be got to. It is the state a rolling development point
   * lives in for ever.
   */
  for (const row of aims) {
    if (row._deleted || String(row.status ?? "open") !== "open") {
      continue;
    }
    if (String(row.measure ?? "").trim() !== "") {
      continue;
    }
    signals.push({
      key: `aim-unmeasured:${String(row.id)}`,
      text: `I have not said how I would know whether "${String(row.aim ?? "")}" is happening.`,
      detail:
        "Until it has a test, it can only ever be kept to next time - which is what a development " +
        "point with no marker becomes.",
      weight: 18,
      habit: true
    });
  }

  return signals.sort((a, b) => b.weight - a.weight);
}

/**
 * An aim's first letter lowered, so it reads inside a sentence.
 *
 * @param {string} text
 */
function lower(text) {
  return text.charAt(0).toLowerCase() + text.slice(1);
}
