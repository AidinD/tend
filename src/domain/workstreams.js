/**
 * Delegation levels: the half the player-coach model does not specify.
 *
 * "Step back and coach" says what to do and not how far in any given case.
 * Grove's answer is task-relevant maturity - how closely you follow up depends
 * on how experienced this person is at *this* task, not on how good they are in
 * general - and his warning is the line worth keeping:
 *
 *   The presence or absence of monitoring is what separates delegating from
 *   abdicating.
 *
 * So a level sits on a piece of work with an owner, not on a project and not on
 * a person. "Tidepool rendering, Nadia, delegated with close follow-up" is one
 * row. A person and a project each carrying their own level would be a matrix
 * nobody maintains.
 */

/**
 * The three levels, in order of how much of it is still yours.
 *
 * `review` is what each level implies about how often you look, in days. That
 * is the whole point: a level with no review interval is a label, and a label
 * is exactly the abdication Grove is warning about.
 */
/**
 * Each level says two things, and the second one is the point.
 *
 * `means` is about how closely you follow. `authority` is about who decides -
 * and that is the field the whole idea rests on: "you own this" means different
 * things to the person saying it and the person hearing it, and the gap is the
 * most common silent misunderstanding between a manager and a senior.
 *
 * Follow-up closeness implies authority without stating it, which is exactly how
 * the misunderstanding survives. So it is written out, in the second person,
 * because it is a sentence you should be able to read to them.
 */
export const LEVELS = /** @type {const} */ ({
  doing: {
    label: "Doing it myself",
    means: "Still mine. Nobody else is accountable for this yet.",
    authority: "I decide. Nobody is waiting on me for a call they thought was theirs.",
    review: 7
  },
  close: {
    label: "Delegated, close follow-up",
    means:
      "Theirs to drive, mine to stay close to. New to them, or high enough stakes that " +
      "finding out late would be expensive.",
    authority: "Ask me before anything that would be expensive to undo. Everything else is yours.",
    review: 14
  },
  theirs: {
    label: "Fully theirs",
    means: "They own the outcome. I hear about it when they choose to tell me.",
    authority: "You decide, and tell me afterwards. I will not be checking first.",
    review: 60
  }
});

/** @typedef {keyof typeof LEVELS} Level */

/**
 * @param {string} v
 * @returns {v is Level}
 */
export function isLevel(v) {
  return Object.prototype.hasOwnProperty.call(LEVELS, v);
}

/**
 * The review interval a workstream inherits from its level.
 *
 * Falls back to the most attentive interval for an unknown level rather than
 * the most relaxed one: if the data is wrong, err towards looking too often.
 *
 * @param {string | undefined} level
 * @returns {number}
 */
export function reviewInterval(level) {
  return isLevel(String(level)) ? LEVELS[/** @type {Level} */ (level)].review : LEVELS.doing.review;
}

/**
 * Describe one workstream in a line a person can read.
 *
 * @param {import("../storage/reduce.js").Entity} workstream
 * @param {Map<string, string>} names Person id to name.
 * @returns {string}
 */
export function describe(workstream, names) {
  const level = String(workstream.level ?? "");
  const owner = workstream.owner ? names.get(String(workstream.owner)) : null;
  const label = isLevel(level) ? LEVELS[/** @type {Level} */ (level)].label : "No level set";
  return owner ? `${owner} — ${label}` : label;
}

/**
 * A workstream with no owner and no level is the state Grove warns about: the
 * responsibility has moved and the information has not. Worth surfacing rather
 * than treating as merely incomplete data.
 *
 * @param {import("../storage/reduce.js").Entity} workstream
 * @returns {boolean}
 */
export function isUnspecified(workstream) {
  return !workstream.level || !isLevel(String(workstream.level));
}
