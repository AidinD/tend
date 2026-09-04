/**
 * What one person's tile says, decided by rule, with one closed set per cluster.
 *
 * ## Why per cluster rather than one set
 *
 * The first version of this had a single set about cadence drift for everybody,
 * which was the wrong axis. What you need to know about somebody you are
 * accountable for is where their development stands; what you need to know
 * about your own manager is whether you owe them anything. Those are different
 * questions, so they are different sets, and a tile only ever speaks its own
 * cluster's vocabulary.
 *
 * The sets are small and closed on purpose. If a member of a cluster does not
 * fit its set, that is a finding to report rather than a reason to widen it: a
 * set that grows to fit whatever turns up is a set whose phrases stop being
 * derivable, and then a tile is somebody's impression rather than a fact.
 *
 * ## Why this is a function and not a template in the view
 *
 * The front page is mostly tiles, so a tile phrase is very nearly the whole
 * output of the screen you open every morning. A model must never write one - a
 * sentence about a named colleague, produced by a model, sitting on the page you
 * open daily is the highest-consequence text in this app. And a wrong tile has
 * to be traceable to the state that produced it, which means answering "why does
 * that tile say that" by calling this with the row rather than by reading markup.
 *
 * ## Returns a kind, not a string
 *
 * The words are in `text.js`, the same split as `durationOf`: which fact to
 * state is a decision about the domain, how to say it is not.
 */

/**
 * @typedef {object} TileInput
 * @property {string} id
 * @property {string} name
 * @property {string} [relation]
 * @property {string | null} [availability] From `people.js`: away, leaving, left.
 * @property {{ urgency: string, duty: string, targetDays: number, sinceDays: number,
 *   everHappened: boolean } | null} [worstDrift]
 * @property {{ status: string, stance: string, observations: number } | null} [direction]
 *   The live growth thread, if there is one.
 * @property {{ started: boolean } | null} [plan] The second shape. Always null
 *   until that slice exists, which is why the two plan kinds are unreachable
 *   today and declared anyway - see `UNREACHABLE_KINDS`.
 * @property {number} [promisesOwed] Open promises to this person.
 * @property {boolean} [hasQuestion] Something in `worthRaising` for them.
 * @property {{ overdue: boolean } | null} [update] Stakeholder update state.
 */

/**
 * The sets, one per cluster of `RELATION_GROUPS`, in priority order.
 *
 * Order is what the rule walks, so it is the design rather than a list: a
 * critical cadence outranks a development state because it is the one that is
 * actionable today, and availability outranks everything because nothing is
 * expected of you while somebody is not there.
 */
export const TILE_SETS = /** @type {const} */ ({
  mandate: [
    "away",
    "leaving",
    "needsYou",
    "planNotStarted",
    "planRunning",
    "directionShowing",
    "directionUntested",
    "noDirection"
  ],
  noChannel: ["neverSpoken", "feedbackOverdue", "inStep"],
  peers: ["away", "daysOver", "inStep"],
  outward: ["promisesOwed", "questionToAsk", "updateOverdue", "updatedRecently"]
});

/**
 * Kinds that are declared and cannot happen yet.
 *
 * Both are about the plan shape, which does not exist until its own slice. They
 * are in the set now because the set is the specification, and leaving them out
 * would mean the vocabulary quietly disagrees with the brief. The test asserts
 * exactly this list is unreachable, so the day plans exist and these stay
 * unreachable, something is wrong.
 */
export const UNREACHABLE_KINDS = /** @type {const} */ (["planNotStarted", "planRunning"]);

/**
 * How far past its interval a cadence has to run before "late" stops being the
 * useful word. Only the peers set says a number of days, and only that set
 * needs the threshold.
 */
export const ADRIFT_MULTIPLE = 2;

/**
 * The one thing this person's tile should say.
 *
 * @param {TileInput} row
 * @param {string} cluster One of `RELATION_GROUPS`.
 * @returns {{ kind: string, [key: string]: any }}
 */
export function tileOf(row, cluster) {
  switch (cluster) {
    case "mandate":
      return mandateTile(row);
    case "noChannel":
      return noChannelTile(row);
    case "peers":
      return peersTile(row);
    case "outward":
      return outwardTile(row);
    default:
      /*
       * Not a fallback phrase. An unknown cluster means `RELATION_GROUPS` and
       * this file disagree, and a tile is the wrong place to find that out - so
       * it says which cluster it could not speak for.
       */
      return { kind: "unknownCluster", cluster: String(cluster) };
  }
}

/**
 * Somebody you hold a mandate over. The set is about where their development
 * stands, because that is the question this group exists to keep in front of
 * you - the cadences have their own section as cards.
 *
 * @param {TileInput} row
 */
function mandateTile(row) {
  if (row.availability === "away") {
    return { kind: "away" };
  }
  /*
   * A leaver stays in this grid on "leaving" and drops out when their last day
   * has passed - not when they announce it. A promise to somebody leaving next
   * week is exactly the promise to keep, and taking their tile away the moment
   * they resign is the app deciding they stopped mattering.
   */
  if (row.availability === "leaving") {
    return { kind: "leaving" };
  }

  const drift = row.worstDrift ?? null;
  if (drift !== null && drift.urgency === "critical") {
    return { kind: "needsYou", duty: String(drift.duty) };
  }

  const plan = row.plan ?? null;
  if (plan !== null) {
    return plan.started ? { kind: "planRunning" } : { kind: "planNotStarted" };
  }

  const direction = row.direction ?? null;
  if (direction === null) {
    return { kind: "noDirection" };
  }
  if (Number(direction.observations) > 0) {
    return { kind: "directionShowing" };
  }
  /*
   * "Untested" is the stance, not the age. A direction he has not put to them
   * yet is untested however long it has been open, and one they agreed to is
   * tested even if nothing has been seen since.
   */
  if (direction.stance === "unasked") {
    return { kind: "directionUntested" };
  }
  return { kind: "directionShowing" };
}

/**
 * Somebody whose work you see with no formal channel. The question here is
 * whether feedback is actually reaching them, because that is the only lever
 * you have.
 *
 * @param {TileInput} row
 */
function noChannelTile(row) {
  const drift = row.worstDrift ?? null;
  if (drift !== null && drift.everHappened === false) {
    return { kind: "neverSpoken", duty: String(drift.duty) };
  }
  if (drift !== null && Number(drift.sinceDays) > Number(drift.targetDays)) {
    return { kind: "feedbackOverdue", duty: String(drift.duty) };
  }
  return { kind: "inStep" };
}

/**
 * A peer. No authority either way, so the only fact worth a tile is whether the
 * contact has lapsed - and this is the one set that says a number, because
 * "over" without a count is not information about a relationship that has no
 * duty behind it.
 *
 * @param {TileInput} row
 */
function peersTile(row) {
  if (row.availability === "away") {
    return { kind: "away" };
  }
  const drift = row.worstDrift ?? null;
  if (drift !== null && Number(drift.sinceDays) > Number(drift.targetDays)) {
    return {
      kind: "daysOver",
      days: Number(drift.sinceDays) - Number(drift.targetDays),
      duty: String(drift.duty)
    };
  }
  return { kind: "inStep" };
}

/**
 * Upward and outward: your manager, and people you deliver to. Not yours to
 * lead, so the set is entirely about what you owe them.
 *
 * @param {TileInput} row
 */
function outwardTile(row) {
  const owed = Number(row.promisesOwed ?? 0);
  if (owed > 0) {
    return { kind: "promisesOwed", count: owed };
  }
  if (row.hasQuestion === true) {
    return { kind: "questionToAsk" };
  }
  if (row.update !== null && row.update !== undefined) {
    return row.update.overdue ? { kind: "updateOverdue" } : { kind: "updatedRecently" };
  }
  return { kind: "updatedRecently" };
}

/**
 * Every kind any cluster can produce, so a renderer can be checked against the
 * whole vocabulary rather than against the ones somebody remembered.
 *
 * Derived from the sets rather than written out again, because a set is the
 * specification and a second list of the same thing is how the roster grouping
 * lost people once already.
 */
export const TILE_KINDS = [...new Set(Object.values(TILE_SETS).flat())];

/**
 * How much a tile is asking of you, for sorting.
 *
 * Not the drift's own severity, and the difference is the point: `away` and
 * `inStep` are quiet because nothing is expected, not because everything is
 * fine, and they must not sort above a plan nobody has started.
 *
 * @param {{ kind: string }} tile
 * @returns {number} Higher wants attention sooner.
 */
export function tileWeight(tile) {
  switch (tile.kind) {
    case "needsYou":
    case "neverSpoken":
      return 5;
    case "planNotStarted":
      return 4;
    case "promisesOwed":
    case "feedbackOverdue":
    case "updateOverdue":
    case "daysOver":
      return 3;
    case "noDirection":
    case "directionUntested":
      return 2;
    case "questionToAsk":
    case "planRunning":
    case "leaving":
      return 1;
    default:
      /* away, inStep, directionShowing, updatedRecently: nothing is asked. */
      return 0;
  }
}
