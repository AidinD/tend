/**
 * The kinds of contact, and what each one can be about.
 *
 * ## Why the subject decides the list
 *
 * A cadence is satisfied by a specific kind of evidence against a specific
 * subject. "You looked at a project" cannot be evidence about a person, and
 * "you had a 1-1" cannot be evidence about a project - but a form offering all
 * eight kinds whatever you clicked will happily record either, and then it
 * satisfies nothing. Nothing errors, the toast says "Logged", and the cadence
 * it was meant to answer stays exactly as behind as it was.
 *
 * That is the failure this tool is least allowed to have. The whole design rests
 * on contact kinds not being interchangeable, so a form that lets you file one
 * against the wrong sort of subject is quietly undoing the premise.
 *
 * ## Filtered on the subject's TYPE, not on what currently counts
 *
 * The tempting version filters on which duties are active, so the list only
 * offers kinds that would move a clock today. It is wrong twice over. `casual`
 * satisfies nothing by design and would vanish, taking with it the one way to
 * record that you have actually spoken to someone. And duties are his to edit:
 * a list that reshuffles when he changes a duty's relations, or that refuses to
 * record a true thing because no duty happens to consume it yet, is a tool
 * arguing with him about what happened.
 *
 * Duties decide what counts. This decides what a sentence can be about. They
 * are different questions and only the second one has a fixed answer.
 */

import { DAY_MS } from "./time.js";

/** @typedef {"person" | "project" | "workstream" | "stake"} SubjectKind */

/**
 * Every kind of contact, with the sort of subject it can be about.
 *
 * `casual` is the one that satisfies NOTHING, and deliberately. A chat in the
 * kitchen is real contact - it means you have spoken to them, so the signal
 * about people you have only heard about second-hand correctly stays quiet -
 * but it is not the recurring conversation with a structure that the 1-1 duty
 * means, and letting it reset that clock would let a good week of corridor talk
 * hide a quarter without a real one.
 *
 * `meeting` exists for the same reason one step up: a recurring conversation
 * with several people in it. It is real contact - you have spoken to everybody
 * who was there, so the signal about people you have only heard of second-hand
 * correctly goes quiet - and it is not a 1-1 with any of them. Recording it as
 * one would satisfy the 1-1 duty for people you have not had a 1-1 with, which
 * is precisely the interchangeability this file exists to refuse.
 *
 * Note what is NOT here: any rule about which duties `meeting` answers. Duties
 * declare their own evidence kinds and are rows the user owns, so a kind
 * satisfies exactly what he has said it satisfies, and a new one starts out
 * satisfying nothing. That is why this kind needed no special case anywhere.
 *
 * @type {{ value: string, label: string, subject: SubjectKind }[]}
 */
export const CONTACT_KINDS = [
  { value: "one-to-one", label: "1-1 - ett samtal med dem", subject: "person" },
  { value: "casual", label: "Casual - ni pratade, men det var ingen 1-1", subject: "person" },
  {
    value: "meeting",
    label: "Möte - ett samtal med flera av er i det",
    subject: "person"
  },
  { value: "second-hand", label: "Second hand - hört om dem från någon annan", subject: "person" },
  { value: "sideways", label: "Sideways - kontakt med en sidoordnad ledare", subject: "person" },
  { value: "feedback", label: "Feedback - du sa något direkt till dem", subject: "person" },
  { value: "observation", label: "Observation - du såg deras arbete", subject: "person" },
  { value: "survey", label: "Enkätrunda", subject: "person" },
  { value: "check-in", label: "Avstämning - du tittade på ett projekt", subject: "project" },
  {
    value: "delegation-review",
    label: "Delegeringsgenomgång - du tittade på hur en överlämning går",
    subject: "workstream"
  },
  {
    value: "update",
    label: "Uppdatering - du berättade för en stakeholder var det står",
    subject: "stake"
  }
];

/**
 * The kinds that can be about this sort of subject.
 *
 * @param {SubjectKind} subjectKind
 * @returns {{ value: string, label: string }[]}
 */
export function kindsFor(subjectKind) {
  return CONTACT_KINDS.filter((k) => k.subject === subjectKind).map(({ value, label }) => ({
    value,
    label
  }));
}

/**
 * The sort of subject a kind is about, or null if the kind is not one of ours.
 *
 * @param {string} kind
 * @returns {SubjectKind | null}
 */
export function subjectOf(kind) {
  return CONTACT_KINDS.find((k) => k.value === kind)?.subject ?? null;
}

/**
 * Can this kind be about this sort of subject?
 *
 * @param {string} kind
 * @param {SubjectKind} subjectKind
 * @returns {boolean}
 */
export function fitsSubject(kind, subjectKind) {
  return subjectOf(kind) === subjectKind;
}

/**
 * The sorts of thing a duty can be about, as options for a list.
 *
 * Derived from the kinds rather than written out again. A hand-copied version of
 * this list in the duty form was missing `stake`, so editing a stakeholder duty
 * silently rewrote it to apply to people instead - the select had no option
 * matching the stored value, so the browser showed the first one and saving
 * wrote that. Nothing failed, and the duty then crossed with every colleague
 * while being satisfiable by nothing at all.
 *
 * @type {{ value: SubjectKind, label: string }[]}
 */
export const SUBJECT_KINDS = [
  { value: "person", label: "Varje person" },
  { value: "project", label: "Varje projekt" },
  { value: "workstream", label: "Varje arbetsområde" },
  { value: "stake", label: "Varje stakeholder, per projekt" }
];

/**
 * Which evidence kinds a duty about this sort of subject could possibly consume.
 *
 * @param {SubjectKind} subjectKind
 * @returns {string[]}
 */
export function evidenceFor(subjectKind) {
  return kindsFor(subjectKind).map((k) => k.value);
}

/**
 * The kinds a NOTE can be evidence of.
 *
 * A subset, and the subset is the point: a survey round is a form going out and
 * a project check-in is about a project, so neither is ever something a note
 * about a person carries. Offering them in the tag mapping would be asking a
 * question with no answer, twice.
 */
export const NOTE_CONTACT_KINDS = kindsFor("person").filter((k) => k.value !== "survey");

/**
 * A stored touch, as much of one as this file needs.
 *
 * `id` is required and the rest is not, which is deliberate: a type made only
 * of optional properties is a weak type, and TypeScript will not let a store row
 * be passed to one - correctly, since such a type accepts anything at all.
 *
 * @typedef {object} TouchRow
 * @property {string} id
 * @property {number} [at] When it happened, ms since epoch.
 * @property {string} [kind]
 * @property {string} [note]
 */

/**
 * What a contact history amounts to, in one line's worth of numbers.
 *
 * ## Why this exists
 *
 * A person's history was eighteen rows on the page, fifteen of them the
 * identical string "1-1 (backfilled from the calendar)". That is not a history,
 * it is a record that an import ran - and it sat above the observations, which
 * are the part a review conversation is actually built from.
 *
 * The fix is to say what the rows amount to and fold the rows themselves away.
 * The summary answers the only questions the list was being scanned for: how
 * many, since when, how often, and how long ago the last one was.
 *
 * ## Why it is computed here rather than in the view
 *
 * The page receives a capped twenty rows. A count taken from those would report
 * the cap rather than the total the moment somebody has twenty-one - so the
 * total has to be counted where the whole set still exists, and the view has to
 * be handed the number rather than allowed to derive it.
 *
 * Arithmetic only, and no model anywhere near it. A brief you cannot trace to
 * the state that produced it is worse than no brief, and this line is the first
 * thing read on the page.
 *
 * `everyDays` is the MEAN gap and it is deliberately blunt. A median would
 * survive one long absence better, but the mean is what "roughly every N days"
 * means to a reader, and a cadence with one three-month hole in it should read
 * as looser than one without.
 *
 * @param {TouchRow[]} touches Every touch about the subject, not a page of them.
 * @param {number} now
 * @returns {{
 *   total: number,
 *   firstAt: number | null,
 *   lastAt: number | null,
 *   spanDays: number | null,
 *   everyDays: number | null,
 *   sinceLastDays: number | null
 * }}
 */
export function contactSummary(touches, now) {
  const at = (Array.isArray(touches) ? touches : [])
    .map((t) => Number(t?.at ?? NaN))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);

  if (at.length === 0) {
    return { total: 0, firstAt: null, lastAt: null, spanDays: null, everyDays: null, sinceLastDays: null };
  }

  const firstAt = at[0];
  const lastAt = at[at.length - 1];
  const spanDays = Math.floor((lastAt - firstAt) / DAY_MS);

  /*
   * One touch has a date and no cadence. Two touches a day apart have a cadence
   * of one day, which is true and useless - but saying nothing there would be
   * worse, because "we spoke twice" with no interval reads as if the app failed
   * to work it out.
   */
  const everyDays = at.length < 2 ? null : Math.max(1, Math.round(spanDays / (at.length - 1)));

  return {
    total: at.length,
    firstAt,
    lastAt,
    spanDays,
    everyDays,
    sinceLastDays: Math.max(0, Math.floor((now - lastAt) / DAY_MS))
  };
}
