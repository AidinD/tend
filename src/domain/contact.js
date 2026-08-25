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
 * @type {{ value: string, label: string, subject: SubjectKind }[]}
 */
export const CONTACT_KINDS = [
  { value: "one-to-one", label: "1-1 - a conversation with them", subject: "person" },
  { value: "casual", label: "Casual - you spoke, but it was not a 1-1", subject: "person" },
  { value: "second-hand", label: "Second-hand - heard about them from someone else", subject: "person" },
  { value: "sideways", label: "Sideways - contact with a peer lead", subject: "person" },
  { value: "feedback", label: "Feedback - you told them something directly", subject: "person" },
  { value: "observation", label: "Observation - you saw their work", subject: "person" },
  { value: "survey", label: "Survey round", subject: "person" },
  { value: "check-in", label: "Check-in - you looked at a project", subject: "project" },
  {
    value: "delegation-review",
    label: "Delegation review - you looked at how a handover is going",
    subject: "workstream"
  },
  {
    value: "update",
    label: "Update - you told a stakeholder where it stands",
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
  { value: "person", label: "Each person" },
  { value: "project", label: "Each project" },
  { value: "workstream", label: "Each workstream" },
  { value: "stake", label: "Each stakeholder, per project" }
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
