/**
 * A question set: the axes one kind of assessor is asked about.
 *
 * ## The gap this closes
 *
 * A producer, a peer and an art lead see different parts of somebody's work and
 * should not be asked the same questions. Until now there were no sets at all:
 * the set name and every axis label were free text, retyped by hand into the
 * form for each answer.
 *
 * That is not merely inconvenient, it quietly breaks the one thing the feature
 * exists for. The aggregate groups on `${set}` and `${axis}` as raw strings, so
 * "Kommunikation", "kommunikation" and "Kommunikaton" are three different axes
 * with an n of one each. Round two is meant to be comparable to round one, and
 * whether it is depended on retyping two or three labels identically after
 * ninety days. Nothing would have failed; the page would simply have shown twice
 * as many axes, each measured once.
 *
 * A set fixes the labels in one place and hands them to the form.
 *
 * ## What a set is NOT
 *
 * It is not where an answer's axis lives. A stored answer copies the axis label
 * onto itself, and that stays exactly as it was - see `assessments.js`. This is
 * the fourth defect found in the reference implementation: there, answers hold
 * question ids pointing into an editable set, so rewording a question silently
 * changes the meaning of every historical answer to it, with nothing failing
 * anywhere.
 *
 * So a set is a template for entry and a guarantee of consistency going forward.
 * It is not a schema the history is validated against, and editing one must never
 * be able to reach a row that was already written. Everything here is about what
 * the form offers; nothing here is authoritative over an answer.
 *
 * ## Retired, not deleted
 *
 * A set that is no longer used stops being offered and stays readable, because
 * answers name it and a round from two years ago should still say which set it
 * was run on. Same reasoning as archiving a person rather than removing them.
 *
 * Nothing here touches the store.
 */

/** The most axes one set may hold. */
export const MAX_AXES = 12;

/**
 * @typedef {object} SetAxis
 * @property {string} axis The label, as it will be copied onto every answer.
 * @property {string} asked The question or the anchors behind it, if any.
 */

/**
 * Is this set still offered for new answers?
 *
 * @param {Record<string, any>} row
 * @returns {boolean}
 */
export function isLive(row) {
  return !(typeof row.retiredAt === "number" && Number.isFinite(row.retiredAt));
}

/**
 * The axes of a set, cleaned up.
 *
 * @param {Record<string, any>} row
 * @returns {SetAxis[]}
 */
export function axesOf(row) {
  const axes = Array.isArray(row.axes) ? row.axes : [];
  return axes
    .map((a) => ({
      axis: String(a?.axis ?? "").trim(),
      asked: String(a?.asked ?? "").trim()
    }))
    .filter((a) => a.axis !== "");
}

/**
 * The label two axes are considered the same by, WITHIN one set.
 *
 * Case and surrounding space only. Deliberately not more than that: an axis
 * label is prose he wrote, and a cleverer comparison - stripping punctuation,
 * collapsing inner space - starts merging axes he meant to keep apart. This
 * exists to refuse "Kommunikation" twice in one set, not to guess at intent.
 *
 * Never used across sets, and never used on a stored answer. Two sets sharing an
 * axis label mean different things by it, which is why the aggregate keys on the
 * set as well.
 *
 * @param {string} axis
 * @returns {string}
 */
export function axisKey(axis) {
  return String(axis ?? "").trim().toLowerCase();
}

/**
 * Why this set cannot be stored, or null.
 *
 * @param {object} args
 * @param {unknown} args.name
 * @param {unknown} args.axes
 * @returns {string | null}
 */
export function badSet({ name, axes }) {
  if (String(name ?? "").trim() === "") {
    return "Ett frågeset behöver ett namn - det är vad en rond kommer att heta om ett år.";
  }
  const cleaned = axesOf({ axes });
  if (cleaned.length === 0) {
    return "Ett frågeset utan axlar går inte att svara på. Skriv en axel per rad.";
  }
  if (cleaned.length > MAX_AXES) {
    return `${cleaned.length} axlar är för många att svara på ärligt. Högst ${MAX_AXES}.`;
  }

  /*
   * A label twice in one set would make two rows the aggregate cannot tell
   * apart, and the second one would silently double somebody's answer on that
   * axis. Refused at the set rather than at the answer, because this is the one
   * place it can still be fixed by editing one row.
   */
  const seen = new Set();
  for (const a of cleaned) {
    const key = axisKey(a.axis);
    if (seen.has(key)) {
      return `Axeln "${a.axis}" står två gånger i samma set. En axel kan bara frågas en gång.`;
    }
    seen.add(key);
  }
  return null;
}

/**
 * The sets still on offer, in the order a picker should show them.
 *
 * By discipline first, because that is what somebody is choosing between - which
 * kind of assessor this answer came from - and by name inside it.
 *
 * @param {Record<string, any>[]} rows
 */
export function liveSets(rows) {
  return rows
    .filter((r) => !r._deleted && isLive(r))
    .map((r) => ({
      id: String(r.id),
      name: String(r.name ?? ""),
      discipline: String(r.discipline ?? ""),
      axes: axesOf(r)
    }))
    .sort(
      (a, b) => a.discipline.localeCompare(b.discipline) || a.name.localeCompare(b.name)
    );
}
