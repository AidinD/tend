/**
 * Question sets: the store side, and the refusals.
 *
 * `domain/questionsets.js` opens on why these exist and on the one thing they
 * are not - a set is a template for entering an answer, never the place an
 * answer's axis lives. Read that first.
 *
 * ## Why no agent writes one
 *
 * A question set is structure. It decides what a producer is asked about
 * somebody, which is a claim about how the job is evaluated - the same class of
 * thing as the role map, and it is his. An agent that could add or reword a set
 * would be deciding what the questions are, and the answers would arrive looking
 * exactly as legitimate as the ones he asked for.
 *
 * Reading them is open and useful: a session preparing a round should be able to
 * see which set covers which discipline.
 */

import { axesOf, badSet, isLive, liveSets } from "../domain/questionsets.js";

/** @param {unknown} v */
const text = (v) => String(v ?? "").trim();

/**
 * Define a set of axes for one kind of assessor.
 *
 * App only.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} args.name What a round on this set is called.
 * @param {string} [args.discipline] Which kind of assessor it is for.
 * @param {{ axis: string, asked?: string }[]} args.axes
 * @param {number} args.now
 */
export function addQuestionSet(store, { name, discipline, axes, now }) {
  const why = badSet({ name, axes });
  if (why !== null) {
    return { error: why };
  }

  /*
   * Two sets with one name would be two indistinguishable choices in the
   * picker, and the answer would name whichever was clicked. Checked against
   * retired ones too: a retired set still names the rounds that were run on it,
   * so reusing its name makes two different sets look like one history.
   */
  const taken = store
    .rows("questionSets")
    .find((r) => !r._deleted && text(r.name).toLowerCase() === text(name).toLowerCase());
  if (taken) {
    return {
      error: isLive(taken)
        ? `Det finns redan ett frågeset som heter "${text(taken.name)}".`
        : `"${text(taken.name)}" finns som ett pensionerat set och namnger ronder som körts. Välj ett annat namn.`
    };
  }

  const cleaned = axesOf({ axes });
  const id = store.create("questionSets", {
    name: text(name),
    discipline: text(discipline) || null,
    axes: cleaned,
    at: now
  });
  return { id, name: text(name), axes: cleaned.length };
}

/**
 * Change a set's name, discipline or axes.
 *
 * This cannot reach a stored answer, and that is the whole design rather than a
 * limitation: an assessment carries its own axis labels, so rewording an axis
 * here changes what the NEXT round is asked and leaves every round already run
 * saying what it said. See the reference implementation's fourth defect in
 * `domain/questionsets.js`.
 *
 * App only.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} id
 * @param {object} fields
 * @param {string} [fields.name]
 * @param {string} [fields.discipline]
 * @param {{ axis: string, asked?: string }[]} [fields.axes]
 */
export function updateQuestionSet(store, id, fields) {
  const row = store.rows("questionSets").find((r) => String(r.id) === String(id));
  if (!row) {
    return { error: `Inget frågeset med id "${id}".` };
  }

  // Judged against the row as it WILL be, not against the fields given - an
  // edit that only touches the name still has to leave a set somebody can
  // answer.
  const merged = { ...row, ...fields };
  const why = badSet({ name: merged.name, axes: merged.axes });
  if (why !== null) {
    return { error: why };
  }

  if (fields.name !== undefined) {
    const taken = store
      .rows("questionSets")
      .find(
        (r) =>
          !r._deleted &&
          String(r.id) !== String(id) &&
          text(r.name).toLowerCase() === text(fields.name).toLowerCase()
      );
    if (taken) {
      return { error: `Det finns redan ett frågeset som heter "${text(taken.name)}".` };
    }
  }

  /** @type {Record<string, any>} */
  const write = {};
  if (fields.name !== undefined) {
    write.name = text(fields.name);
  }
  if (fields.discipline !== undefined) {
    write.discipline = text(fields.discipline) || null;
  }
  if (fields.axes !== undefined) {
    write.axes = axesOf({ axes: fields.axes });
  }

  store.update("questionSets", String(id), write);
  return { id: String(id), updated: Object.keys(write) };
}

/**
 * Stop offering a set, without unsaying the rounds run on it.
 *
 * Retired rather than removed. Answers name their set, and a round from two
 * years ago should still say which questions it was. Reversible by passing
 * `retired: false`, because a discipline coming back is likelier than a set
 * having been a mistake.
 *
 * App only.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} id
 * @param {object} args
 * @param {boolean} [args.retired] Default true.
 * @param {number} args.now
 */
export function retireQuestionSet(store, id, { retired = true, now }) {
  const row = store.rows("questionSets").find((r) => String(r.id) === String(id));
  if (!row) {
    return { error: `Inget frågeset med id "${id}".` };
  }
  store.update("questionSets", String(id), { retiredAt: retired ? now : null });
  return { id: String(id), retired };
}

/**
 * The sets, with the retired ones told apart rather than dropped.
 *
 * @param {import("../storage/store.js").TendStore} store
 */
export function questionSets(store) {
  const rows = store.rows("questionSets").filter((r) => !r._deleted);
  return {
    live: liveSets(rows),
    retired: rows
      .filter((r) => !isLive(r))
      .map((r) => ({
        id: String(r.id),
        name: text(r.name),
        discipline: text(r.discipline),
        axes: axesOf(r),
        retiredAt: Number(r.retiredAt)
      }))
      .sort((a, b) => b.retiredAt - a.retiredAt)
  };
}
