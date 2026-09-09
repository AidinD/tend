/**
 * An observation that turned out to be wrong is replaced, not deleted.
 *
 * ## The gap this closes
 *
 * An observation is a record of what somebody was seen doing, filed so a review
 * six months later is not a memory exercise. Sometimes it is wrong - the reading
 * was uncharitable, the attribution was to the wrong person, the thing it says
 * happened turned out to have been somebody else's call.
 *
 * Until now the only way to correct one was to file a SECOND observation whose
 * prose said not to read the first one as evidence. Nothing in the data connected
 * them, so the correction only worked while somebody happened to read both rows,
 * in order. That was done by hand three times between 7 and 9 September 2026, and
 * it is a convention, not a mechanism.
 *
 * ## Why not deletion
 *
 * Because deletion removes precisely the rows that are worth the most. An early
 * reading of somebody that later changed is the single most useful thing in the
 * record on the day it changes: it is the evidence that they changed, and it is
 * the evidence that the first reading was mistakable. Delete it and the record
 * says they were always like this, which is both wrong and the more flattering
 * story about the person who wrote the first row.
 *
 * The app already reasons this way everywhere else. A growth thread that is let
 * go keeps its reason; two answers from one assessor on one day are both counted
 * and the collision is reported rather than resolved; `Let go` exists in order
 * not to be `Remove`. This is the same decision applied to the one collection
 * that had no way to say "that was wrong" at all.
 *
 * ## The one case where deletion IS right
 *
 * The row that was never true and was never a judgment. The case that prompted
 * this: the marker text of a growth thread - the description of what should
 * become visible in three months - was pasted into the observation field, so
 * Tend claimed a behaviour had been observed when the text was the test for
 * whether it ever would be. Never true, wrong field, caught within a minute, no
 * history worth keeping.
 *
 * A mistake is not a changed judgment, and the app already draws that line in
 * its own words: a growth thread carries "Öppnad av misstag" beside "Avsluta".
 * So there are two mechanisms here, and which one applies is decided by which of
 * those two things happened - not by how embarrassing the row is.
 *
 * ## What keeps the two apart
 *
 * A clock and a state, and both have to allow it.
 *
 * The clock is `MISTAKE_WINDOW_MS`, and it is deliberately short. The asymmetry
 * of the two errors decides the length rather than taste: a window that is too
 * LONG lets a changed judgment be deleted, which is the exact harm this module
 * exists to prevent, while a window that is too SHORT only means a paste error
 * has to be corrected by replacement instead, leaving a struck-through line and
 * no lost record. So it errs short. The number itself is a question on the card.
 *
 * The state is that a row inside a replacement chain is never a mistake. If
 * something has been replaced, that replacement is a judgment about it and the
 * row is now history; if it replaced something, deleting it would leave the row
 * underneath struck through with nothing attached saying why.
 *
 * Nothing here touches the store.
 */

/**
 * How long a row can still be called a paste error.
 *
 * Fifteen minutes. Long enough for the reported case by a wide margin - pasting
 * into the wrong field is noticed while you are still looking at the screen -
 * and far too short to reach a judgment that changed, which takes days.
 */
export const MISTAKE_WINDOW_MS = 15 * 60 * 1000;

/**
 * @typedef {object} Replacement
 * @property {string} id The replacing row.
 * @property {string} text What it says instead.
 * @property {number} at When the correction was filed.
 */

/**
 * @typedef {object} Superseded
 * @property {string | null} replaces The row this one corrects, if any.
 * @property {Replacement | null} replacedBy The correction filed over this one.
 */

/**
 * Read a `replaces` pointer off a row, defensively.
 *
 * A row pointing at itself is not a chain of one, it is a corrupted row, and the
 * cheapest place to refuse it is before anything walks the pointers.
 *
 * @param {Record<string, any>} row
 * @returns {string | null}
 */
function replacesId(row) {
  const target = String(row.replaces ?? "").trim();
  if (target === "" || target === String(row.id)) {
    return null;
  }
  return target;
}

/**
 * Annotate rows with what replaced them and what they replaced.
 *
 * Takes the rows the store already handed back, which means tombstones are
 * already gone - and that is load-bearing rather than incidental. Removing a
 * correction as a paste error has to leave the row underneath readable again,
 * with no strike-through and nothing dangling, and it does: the pointer's owner
 * is simply not in the list any more, so nothing resolves to it and the row
 * below reads exactly as it did before the correction was filed.
 *
 * Only the NEWEST correction is reported when there is more than one, because a
 * line can only be struck through once and the reader wants what the record says
 * now. The older corrections are still rows in their own right and still show as
 * themselves.
 *
 * @param {Record<string, any>[]} rows
 * @returns {(Record<string, any> & Superseded)[]}
 */
export function superseded(rows) {
  const present = new Set(rows.map((r) => String(r.id)));

  /** @type {Map<string, Replacement>} */
  const corrections = new Map();
  for (const row of rows) {
    const target = replacesId(row);
    if (target === null || !present.has(target)) {
      continue;
    }
    const already = corrections.get(target);
    if (already && Number(already.at ?? 0) >= Number(row.at ?? 0)) {
      continue;
    }
    corrections.set(target, {
      id: String(row.id),
      text: String(row.text ?? ""),
      at: Number(row.at ?? 0)
    });
  }

  return rows.map((row) => ({
    ...row,
    replaces: replacesId(row),
    replacedBy: corrections.get(String(row.id)) ?? null
  }));
}

/**
 * Is this row inside a replacement chain, either end?
 *
 * @param {Record<string, any>} row
 * @param {Record<string, any>[]} rows
 * @returns {boolean}
 */
export function inChain(row, rows) {
  if (replacesId(row) !== null) {
    return true;
  }
  const id = String(row.id);
  return rows.some((other) => replacesId(other) === id);
}

/**
 * May this row be removed outright as a paste error?
 *
 * Returns the reason it may not, rather than a boolean, so the caller can say
 * which of the two mechanisms applies instead of just refusing.
 *
 * @param {Record<string, any>} row
 * @param {Record<string, any>[]} rows
 * @param {number} now
 * @returns {{ ok: true } | { ok: false, why: "aged" | "chained" }}
 */
export function removableAsMistake(row, rows, now) {
  if (inChain(row, rows)) {
    return { ok: false, why: "chained" };
  }
  const at = Number(row.at ?? 0);
  if (!Number.isFinite(at) || now - at > MISTAKE_WINDOW_MS) {
    return { ok: false, why: "aged" };
  }
  return { ok: true };
}
