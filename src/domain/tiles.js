/**
 * What one person's tile says, decided by rule.
 *
 * ## Why this is a function and not a template in the view
 *
 * The front page is mostly tiles, so a tile phrase is very nearly the whole
 * output of the screen you open every morning. Two things follow.
 *
 * A model must never write one. A brief you cannot trust is worse than no
 * brief, because you stop reading the true ones too - and a sentence about a
 * named colleague, produced by a model, sitting on the page you open daily, is
 * the highest-consequence text in this app.
 *
 * And a wrong tile has to be traceable to the state that produced it. If the
 * phrase is assembled inline in the renderer then "why does Ada's tile say
 * that" is answered by reading markup and guessing. Here it is answered by
 * calling this with her row.
 *
 * ## What it returns, and why not a string
 *
 * A `kind` and the values that kind needs. The words are in `text.js`, the same
 * split as `durationOf`: which fact to state is a decision about the domain,
 * how to say it is not, and a language that wraps its numbers cannot be served
 * by a function that returns finished English.
 *
 * So this is exhaustively testable without a browser, and every phrase the app
 * can put on a tile is one of the kinds below - which a test asserts, because
 * an unhandled state that falls through to "" is a tile that says nothing about
 * somebody the page exists to remind you of.
 *
 * ## The one judgement in here
 *
 * `behind` splits into late and adrift, and that split is the reason the screen
 * is worth building. A fortnightly duty three days over is late. A fortnightly
 * duty running at five weeks is not late - it is a cadence nobody is keeping,
 * and the badge said "+3w" for both. Being told which is which is the fact that
 * was invisible in a list.
 */

/**
 * @typedef {object} RosterRow
 * @property {string} id
 * @property {string} name
 * @property {string} [relation]
 * @property {string | null} [availability]
 * @property {{
 *   duty: string,
 *   behindBy: string,
 *   urgency: string,
 *   targetDays: number,
 *   sinceDays: number,
 *   everHappened: boolean
 * } | null} [worstDrift]
 */

/**
 * How far past its interval a cadence has to run before it stops being a late
 * conversation and starts being a cadence that is not happening.
 *
 * Twice, which is the smallest multiple that cannot be one bad fortnight. At
 * 1.5 a single cancelled meeting on a two-week duty crosses it, and a rule that
 * fires on one cancellation tells you nothing you did not know.
 */
export const ADRIFT_MULTIPLE = 2;

/**
 * @typedef {{ kind: "away" }
 *   | { kind: "leaving" }
 *   | { kind: "left" }
 *   | { kind: "noDuty" }
 *   | { kind: "neverYet", duty: string, days: number }
 *   | { kind: "adrift", duty: string, targetDays: number, sinceDays: number }
 *   | { kind: "late", duty: string, targetDays: number, sinceDays: number }
 *   | { kind: "inStep", duty: string }} Tile
 */

/**
 * The one thing this person's tile should say.
 *
 * Order is the priority order, and it is deliberate rather than incidental:
 * availability comes first because nothing is expected of you while somebody is
 * away, and printing a drift over that is the app crying wolf about a person on
 * parental leave.
 *
 * @param {RosterRow} row
 * @returns {Tile}
 */
export function tileOf(row) {
  /*
   * Availability first. `leaving` is separate from `left` on purpose: a promise
   * to somebody leaving next week is exactly the promise to keep, so their
   * tile has to stay live and say why it is different.
   */
  if (row.availability === "away") {
    return { kind: "away" };
  }
  if (row.availability === "left") {
    return { kind: "left" };
  }
  if (row.availability === "leaving") {
    return { kind: "leaving" };
  }

  const drift = row.worstDrift ?? null;
  if (drift === null) {
    return { kind: "noDuty" };
  }

  const duty = String(drift.duty);
  const targetDays = Number(drift.targetDays);
  const sinceDays = Number(drift.sinceDays);

  /*
   * Never having spoken is its own kind rather than a very large `late`.
   * `sinceDays` counts from the relationship's start in that case, so rendering
   * it as "35 days since your last 1-1" would be a sentence about a
   * conversation that did not happen.
   */
  if (drift.everHappened === false) {
    return { kind: "neverYet", duty, days: sinceDays };
  }

  if (sinceDays >= targetDays * ADRIFT_MULTIPLE) {
    return { kind: "adrift", duty, targetDays, sinceDays };
  }
  if (sinceDays > targetDays) {
    return { kind: "late", duty, targetDays, sinceDays };
  }
  return { kind: "inStep", duty };
}

/**
 * Every kind a tile can be, so a renderer can be checked against the whole set
 * rather than against the ones somebody remembered.
 *
 * Written out rather than derived from the typedef, because a typedef is not
 * available at runtime - and a test comparing the renderer's cases to this is
 * the thing that catches a new kind added here and nowhere else.
 */
export const TILE_KINDS = /** @type {const} */ ([
  "away",
  "leaving",
  "left",
  "noDuty",
  "neverYet",
  "adrift",
  "late",
  "inStep"
]);

/**
 * How much a tile is asking of you, for sorting and for how loud it looks.
 *
 * Not the same as the drift's own severity, and the difference is the point:
 * `noDuty` and `away` are quiet because nothing is expected, not because
 * everything is fine, and they must not sort above a cadence nobody is
 * keeping.
 *
 * @param {Tile} tile
 * @returns {number} Higher wants attention sooner.
 */
export function tileWeight(tile) {
  switch (tile.kind) {
    case "adrift":
      return 4;
    case "neverYet":
      return 3;
    case "late":
      return 2;
    case "inStep":
      return 1;
    default:
      /* away, leaving, left, noDuty: nothing is being asked of you. */
      return 0;
  }
}
