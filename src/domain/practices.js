/**
 * The principles he is working on right now.
 *
 * ## What a flag means, and what it does not
 *
 * A note in Nib tagged `Principle` and flagged open is not a task and not a
 * reminder. It is "this is the one I am trying to emphasise at the moment", and
 * it graduates when it starts coming naturally - which is a judgement only he
 * can make, from the inside.
 *
 * So there is no interval here and no review date. A deadline on internalising a
 * habit is a deadline on something that does not have one, and the app putting
 * one there would turn a practice into a chore. Nib owns the flag; he raises and
 * lowers it there, and Tend only reads.
 *
 * ## Where they belong
 *
 * On the card he reads before talking to somebody, because that is the moment a
 * principle about how to talk to people is actually usable. Not in Now: nothing
 * here is a deviation, and Now is a page where everything on it is.
 *
 * ## Three at a time, and say when there are more
 *
 * The same discipline the prep view already keeps. Thirteen principles on a card
 * is wallpaper by the second day; two or three are read. And a set that has
 * grown to six is worth pointing out rather than truncating silently, because
 * emphasising six things at once is emphasising nothing - that is a fact about
 * the set, not about the card.
 *
 * Nothing here touches the store or the filesystem.
 */

/** How many practices a card shows. A limit, not a page size. */
export const PRACTICES_SHOWN = 3;

/**
 * @typedef {object} Practice
 * @property {string} id The Nib note id, so the note itself stays reachable.
 * @property {string} title
 * @property {string} source Which book or folder it came from.
 */

/**
 * The principles currently flagged as being worked on.
 *
 * @param {{ id: string, title: string, tags?: string[], flag?: string }[]} notes
 * @param {string} principleTagId
 * @param {(noteId: string) => string} [sourceOf] Where the note lives.
 * @returns {Practice[]}
 */
export function activePractices(notes, principleTagId, sourceOf = () => "") {
  return notes
    .filter(
      (n) =>
        Array.isArray(n.tags) && n.tags.includes(principleTagId) && String(n.flag ?? "") === "open"
    )
    .map((n) => ({ id: String(n.id), title: String(n.title ?? ""), source: sourceOf(String(n.id)) }));
}

/**
 * What a card shows, and what it says about the rest.
 *
 * @param {Practice[]} practices
 * @param {number} [limit]
 * @returns {{ shown: Practice[], more: number, note: string | null }}
 */
export function forCard(practices, limit = PRACTICES_SHOWN) {
  const shown = practices.slice(0, Math.max(0, limit));
  const more = Math.max(0, practices.length - shown.length);
  return {
    shown,
    more,
    // Said rather than truncated. A set this size is itself the thing worth
    // knowing: six principles being emphasised at once is none of them being
    // emphasised, and that is a decision for him rather than a display problem.
    note:
      more === 0
        ? null
        : `${practices.length} principer är markerade som aktiva. Visar ${shown.length} - att betona mer än ett fåtal åt gången är att betona inget av dem.`
  };
}

/**
 * Action points he wrote on a principle note and has not finished.
 *
 * These are the other half and a different shape entirely. "Write a 1-1 template
 * and use it for three weeks" is a concrete thing with an age, not a habit being
 * practised - so it belongs where promises live rather than beside the
 * practices.
 *
 * @param {{ id: string, title: string, tags?: string[], alerts?: { id: string, text: string, done: boolean }[], edited?: number }[]} notes
 * @param {string} principleTagId
 * @returns {{ id: string, note: string, noteTitle: string, text: string, since: number }[]}
 */
export function openActionPoints(notes, principleTagId) {
  /** @type {{ id: string, note: string, noteTitle: string, text: string, since: number }[]} */
  const out = [];
  for (const note of notes) {
    if (!Array.isArray(note.tags) || !note.tags.includes(principleTagId)) {
      continue;
    }
    for (const alert of note.alerts ?? []) {
      if (alert.done) {
        continue;
      }
      out.push({
        id: String(alert.id),
        note: String(note.id),
        noteTitle: String(note.title ?? ""),
        text: String(alert.text ?? "").trim(),
        // The note's own edit time, and it is a proxy rather than a fact: Nib
        // records when a note changed, not when a block was flagged. Good
        // enough to sort by and to say "a while", not good enough to put a
        // number of days in front of somebody as though it were measured.
        since: Number(note.edited ?? 0)
      });
    }
  }
  return out.sort((a, b) => a.since - b.since);
}
