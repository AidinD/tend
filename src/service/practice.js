/**
 * The principles he is practising, and whether the practising is happening.
 *
 * ## Two owners, and only one of them is Tend
 *
 * The principle lives in Nib: the note, its title, and the flag that says he is
 * working on it now. Tend never copies any of that, and reads it fresh on every
 * call - a copy here would be a second answer to "what am I practising" that
 * begins disagreeing with the first the moment he lowers a flag in the app.
 *
 * What Tend owns is the part Nib has nowhere to put: that on some particular day
 * he actually did it. A mark holds the note's id and a date, and nothing else
 * about the principle.
 *
 * ## Why the marks exist at all
 *
 * A block listing three titles every morning says nothing about whether the
 * practising is happening. That is the same gap between "discussed" and
 * "actually seen" that growth threads close with two counters and decision marks
 * close with two kinds - and a principle had the emptier version of it: the note
 * carries bullets under "how I practise this" and nothing counted whether any of
 * it occurred.
 *
 * ## And still no clock
 *
 * A count is not a deadline. Nothing here has an interval, nothing is overdue,
 * and a principle with no marks is not late - it is a principle with no marks.
 * A date on internalising a habit is a date on something that does not have one,
 * and it would turn a practice into a chore, which is the one thing the original
 * design of this was most careful to avoid.
 */

import { practising } from "./prep.js";

/**
 * Note that he practised a principle on a given day.
 *
 * App only. Whether Tend may ever write the FLAG back to Nib is a separate and
 * much larger question - NIB-CONTRACT.md is explicit that an external write to
 * `index.json` while the app is running is overwritten by the next click - and
 * it is on the card rather than answered here. This writes only into Tend.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} args.note The Nib note id of the principle.
 * @param {string} [args.why] What the occasion was, briefly.
 * @param {number} [args.at]
 * @param {number} args.now
 */
export function markPractice(store, { note, why, at, now }) {
  const id = String(note ?? "").trim();
  if (id === "") {
    return { error: "En övning måste peka på en princip." };
  }

  const when = Number(at);
  const made = store.create("practiceMarks", {
    note: id,
    why: String(why ?? "").trim() || null,
    at: Number.isFinite(when) && when > 0 ? when : now
  });
  return { id: made, note: id };
}

/**
 * Take back a mark entered against the wrong principle, or twice.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} id
 */
export function unmarkPractice(store, id) {
  const row = store.rows("practiceMarks").find((m) => String(m.id) === String(id));
  if (!row) {
    return { error: `Ingen övning med id "${id}".` };
  }
  store.remove("practiceMarks", String(row.id));
  return { id: String(row.id), removed: true };
}

/**
 * The principles he is working on, each with what has been noted against it.
 *
 * The Nib half is read on every call and the Tend half is joined onto it by note
 * id. A mark whose note is no longer flagged simply does not appear: he lowered
 * the flag, the principle is not one he is working on now, and the marks stay in
 * the log for the day it is raised again.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {number} now
 * @param {string} [dir]
 */
export function practice(store, now, dir) {
  const found = practising(dir);
  if (!found.available) {
    /*
     * Carried rather than flattened to an empty list. "Nothing is flagged" and
     * "the notebook could not be opened" look identical as an empty block, and
     * only one of them is something to do anything about.
     */
    return { available: false, why: found.why };
  }

  const marks = store.rows("practiceMarks").filter((m) => !m._deleted);

  return {
    available: true,
    tooMany: found.tooMany,
    more: found.more,
    active: (found.active ?? []).map((/** @type {any} */ p) => {
      const mine = marks
        .filter((m) => String(m.note) === String(p.id))
        .sort((a, b) => Number(b.at ?? 0) - Number(a.at ?? 0));
      const last = mine.length === 0 ? null : Number(mine[0].at ?? 0);
      return {
        ...p,
        /*
         * A count and a date, and no judgement on either. Whether four times in
         * a month is a lot is his to know; the app's job is to have the number
         * at all, since before this there was nothing.
         */
        practised: mine.length,
        lastAt: last,
        marks: mine.slice(0, 3).map((m) => ({
          id: String(m.id),
          at: Number(m.at ?? 0),
          why: m.why ? String(m.why) : null
        }))
      };
    })
  };
}
