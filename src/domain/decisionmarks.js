/**
 * Whether a decision was actually followed, kept apart from what was decided.
 *
 * ## The gap this closes
 *
 * A recorded decision had three buttons: it still holds, change it, or reverse
 * it. A decision that was agreed and then not followed is none of the three. It
 * still holds as an agreement, it has not been changed, and reversing it says he
 * has given it up - which he has not. So the record went on saying `recorded`
 * with a revisit in December, and read in December it reads as working.
 *
 * The case, 2026-09-09: a decision made five days earlier and recorded, broken
 * within the week, and nothing anywhere could say so.
 *
 * ## Two counters, deliberately not one
 *
 * A decision kept nine times and broken once is a different object from one
 * broken two times out of two, and a log that counts only the breaches cannot
 * tell them apart. So a mark says which of the two it was, and the reading is
 * the gap between the counts - exactly the shape a growth thread already uses
 * for "discussed" and "actually seen", where the whole value is that the two are
 * never added together.
 *
 * ## The counts and the age are also two numbers, and also not one
 *
 * How long a decision has stood and how often it was not followed answer
 * different questions. Once broken inside five days is not the same as once
 * broken over three months, and a revisit prompt that cannot tell those apart
 * asks the same question of both - which is the memory exercise this replaces.
 *
 * ## What a mark must NOT be
 *
 * A second place where "somebody broke this" lives. That sentence is already an
 * observation about a person, written on their page, and copying it here would
 * rebuild the exact duplication the replace-an-observation work exists to
 * remove: two rows saying one thing, with nothing connecting them, and a
 * correction to one leaving the other standing. A mark may POINT at an
 * observation and must never restate it.
 *
 * It is also not a note in `because`. That field is the only one that still
 * means anything in a year, and mixing compliance into it destroys the record of
 * what was decided. The ledger records what was decided, not whether it held.
 *
 * Nothing here touches the store.
 */

/**
 * How many times a decision can be broken before the app stops treating it as a
 * decision that merely slipped.
 *
 * Not a threshold that DOES anything on its own - nothing is reversed
 * automatically, because reversing is his to say. It changes the question the
 * revisit asks, in the same way a growth thread discussed several times with
 * nothing ever seen starts asking a different question.
 */
export const BROKEN_ENOUGH = 2;

/**
 * @typedef {object} MarkStanding
 * @property {number} kept How many times it was followed.
 * @property {number} broken How many times it was not.
 * @property {number | null} lastBrokenAt
 * @property {number | null} lastKeptAt
 * @property {boolean} everBroken
 * @property {boolean} mostlyBroken Broken at least as often as kept, and broken
 *   at least `BROKEN_ENOUGH` times. The pair matters: one break out of one is
 *   not yet a pattern, and one break out of ten is not one either.
 */

/**
 * What the marks on one decision amount to.
 *
 * @param {Record<string, any>[]} marks Rows for this decision only.
 * @returns {MarkStanding}
 */
export function markStanding(marks) {
  const held = marks.filter((m) => m.held === true);
  const broke = marks.filter((m) => m.held === false);

  /** @param {Record<string, any>[]} rows */
  const newest = (rows) =>
    rows.length === 0 ? null : rows.reduce((at, m) => Math.max(at, Number(m.at ?? 0)), 0);

  return {
    kept: held.length,
    broken: broke.length,
    lastKeptAt: newest(held),
    lastBrokenAt: newest(broke),
    everBroken: broke.length > 0,
    mostlyBroken: broke.length >= BROKEN_ENOUGH && broke.length >= held.length
  };
}

/**
 * Marks belonging to one decision, newest first.
 *
 * @param {Record<string, any>[]} rows
 * @param {string} decision
 */
export function marksFor(rows, decision) {
  return rows
    .filter((m) => !m._deleted && String(m.decision) === String(decision))
    .sort((a, b) => Number(b.at ?? 0) - Number(a.at ?? 0));
}

/**
 * The question a revisit should ask about this decision, given how it has gone.
 *
 * The point of the whole card: "does this still hold?" in December is a memory
 * exercise. With dated marks of both kinds the prompt writes itself, and it is
 * the same sort of prompt a growth thread already produces.
 *
 * Returns null when there is nothing to say beyond the ordinary revisit, so the
 * caller can fall back to its own wording rather than print a sentence that
 * states the obvious.
 *
 * @param {MarkStanding} standing
 * @param {number | null} daysSinceDecided
 * @returns {"never-followed" | "mostly-broken" | "slipped-once" | "holding" | null}
 */
export function revisitShape(standing, daysSinceDecided) {
  if (standing.kept === 0 && standing.broken === 0) {
    return null;
  }
  if (standing.kept === 0 && standing.broken > 0) {
    return "never-followed";
  }
  if (standing.mostlyBroken) {
    return "mostly-broken";
  }
  if (standing.broken > 0) {
    /*
     * One slip against a decision that has otherwise held. Reported as its own
     * shape rather than folded into "holding", because the difference between
     * "broken once in five days" and "broken once in three months" is the whole
     * reason the age travels with the counts.
     */
    return daysSinceDecided !== null && daysSinceDecided <= 14 ? "slipped-once" : "holding";
  }
  return "holding";
}
