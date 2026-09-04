/**
 * A plan: the second shape beside a direction.
 *
 * ## Why one shape was not enough
 *
 * A direction and a plan look similar and are opposites in every way that
 * matters. Forcing a real case into the direction shape lost four things at
 * once, and the table is worth writing out because every field below follows
 * from a row of it.
 *
 *                      Direction                     Plan
 *   When               doing their job, could go     below the bar
 *                      further
 *   If nothing         nothing. They stay, and       something happens, and it
 *   changes            that is fine                  has to be said out loud
 *   Deadline           a horizon to question it by   a date with a consequence
 *   Who owns it        shared. They can decline      him. They cannot decline
 *   HR                 never                         answered before the first
 *                                                    conversation
 *
 * The consequence of collapsing them is not untidiness. A direction that
 * quietly becomes a performance plan is the worst version of this
 * conversation: the person believes they are being developed while a decision
 * is being made about them.
 *
 * ## The second field is the important one
 *
 * `theyKnow`. On the real case that produced this shape the answer is *no* -
 * the person says he has no technical challenge, while the plan's premise is a
 * basic toolchain gap. That mismatch invalidates the plan's opening sentence,
 * and nothing in Tend asked the question.
 *
 * It is asked second, before the goal and before the measure, because
 * everything after it is worthless if the answer is no and nothing has been
 * said.
 *
 * ## Not ready is not invalid
 *
 * A plan with unfilled required fields is not a form with errors. It is a plan
 * that is not ready to start, which is a true and useful state - most plans
 * exist in it for a week or two while he works out what he actually thinks.
 * So `readiness` answers what is missing and `isReady` answers whether it can
 * begin, and neither of them is called validation.
 *
 * ## Two audiences, one record
 *
 * `theirCopy` is five lines in the person's language. Everything else stays
 * his: the goal he chose, the HR answer, the observations behind it. That
 * split is the whole point - a goal option like "document that we tried" must
 * never appear in the copy handed over, and the only way to guarantee that is
 * for the copy to be derived from a named subset rather than filtered from the
 * whole.
 */

/**
 * @typedef {object} PlanRow
 * @property {string} id
 * @property {string} person
 * @property {string} [gap] The one thing that is below the bar.
 * @property {boolean} [theyKnow] Whether it has been said to them.
 * @property {string} [saidOutLoud] What was actually said, in his words.
 * @property {string} [goal] What he is trying to achieve by running it.
 * @property {string} [delivery] The real work it happens through.
 * @property {string} [measure] What will be true at the end.
 * @property {string} [baseline] What is true now, so the measure means something.
 * @property {number} [dueAt] The date with a consequence.
 * @property {string} [ifNotMet] What happens then, said in the same conversation.
 * @property {string} [hr] Whether HR is involved, and how.
 * @property {number} [startedAt]
 * @property {string} [status]
 * @property {string} [growth] A direction this shares its work with.
 */

/**
 * What a plan cannot start without, in the order it is asked.
 *
 * Order matters and is the reason this is a list rather than a set. `theyKnow`
 * is second because everything after it is worthless if they do not know and
 * nothing has been said, and `ifNotMet` is required because a plan whose
 * consequence is unstated is a plan that will be sprung on somebody.
 *
 * `baseline` is required with `measure` rather than optional beside it: "runs
 * the review without me" means nothing without what happens today, and a
 * measure with no baseline is how a plan ends in an argument about whether
 * anything changed.
 */
export const REQUIRED = /** @type {const} */ ([
  "gap",
  "theyKnow",
  "saidOutLoud",
  "delivery",
  "measure",
  "baseline",
  "dueAt",
  "ifNotMet",
  "hr"
]);

/**
 * Fields the person being planned for is given, in the order they read.
 *
 * A named subset rather than "everything except the private bits". Deriving it
 * by exclusion means a field added later is handed over by default, and the
 * field most likely to be added later is another private one.
 */
export const THEIR_COPY = /** @type {const} */ ([
  "gap",
  "delivery",
  "measure",
  "dueAt",
  "ifNotMet"
]);

/**
 * Fields that are his alone, asserted rather than assumed.
 *
 * The list exists so a test can check that these two sets do not overlap and
 * that together they account for everything. "Document that we tried" is a
 * legitimate goal for running a plan and it must never appear in the copy the
 * person is handed.
 */
export const HIS_ALONE = /** @type {const} */ (["theyKnow", "saidOutLoud", "goal", "hr"]);

/**
 * What is still missing before this can start.
 *
 * @param {PlanRow} row
 * @returns {string[]} Field names, in the order they are asked.
 */
export function readiness(row) {
  return REQUIRED.filter((field) => !answered(row, field));
}

/**
 * Is this ready to begin?
 *
 * @param {PlanRow} row
 */
export function isReady(row) {
  return readiness(row).length === 0;
}

/**
 * Has this field been answered?
 *
 * `theyKnow` is the interesting case: `false` is an answer and an important
 * one. Testing truthiness would have made "no, they do not know" read as
 * unanswered, which is exactly backwards - a plan whose subject does not know
 * is not an incomplete plan, it is a plan with one very clear next step.
 *
 * @param {PlanRow} row
 * @param {string} field
 */
function answered(row, field) {
  const value = /** @type {any} */ (row)[field];
  if (field === "theyKnow") {
    return typeof value === "boolean";
  }
  if (field === "dueAt") {
    return typeof value === "number" && Number.isFinite(value);
  }
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Whether the plan's premise survives its own second question.
 *
 * Its own function because it is not a missing field - every field can be
 * filled and this still be true. The person has not been told, so the plan's
 * opening sentence assumes a shared understanding that does not exist, and
 * starting on that footing is how the first conversation goes wrong.
 *
 * @param {PlanRow} row
 */
export function premiseUntested(row) {
  return row.theyKnow === false;
}

/**
 * The five lines the person is given.
 *
 * Returns only fields that are answered, so a copy is never handed over with a
 * blank line where the consequence should be.
 *
 * @param {PlanRow} row
 * @returns {{ field: string, value: any }[]}
 */
export function theirCopy(row) {
  return THEIR_COPY.filter((field) => answered(row, field)).map((field) => ({
    field,
    value: /** @type {any} */ (row)[field]
  }));
}

/**
 * Statuses a plan can be in. `draft` is not a lesser plan - it is the state
 * most plans are in while he works out what he thinks.
 */
export const PLAN_STATUSES = /** @type {const} */ (["draft", "running", "met", "notMet", "dropped"]);

/**
 * Is this plan still live?
 *
 * One definition, exported, for the same reason `isLiveStatus` is: the window
 * had its own copy of that test for growth threads once and printed homework
 * under an ended direction.
 *
 * @param {string} status
 */
export function isLivePlan(status) {
  return status === "draft" || status === "running";
}
