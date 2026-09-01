/**
 * Reading a Nib binding.
 *
 * ## Why a binding names people rather than a person
 *
 * A binding started as one folder, one person, and that is still the common
 * case: everything about somebody lives in their folder. But some notes are
 * written once about a conversation several people were in - a recurring
 * meeting with a fixed set of attendees - and the one-person rule made those
 * unimportable. The note had to be typed into the app again, once per person,
 * which is exactly the double bookkeeping the Nib import exists to remove.
 *
 * So a binding names a LIST. One name in it is the old behaviour and stays the
 * default; several make the folder a meeting rather than a person.
 *
 * ## Contact fans out, commitments do not
 *
 * This is the asymmetry the whole feature turns on, and getting it backwards is
 * the failure worth naming here rather than only in a commit message.
 *
 * Contact SHOULD fan out. Everyone in the room was spoken to, so every one of
 * their clocks moves, and one row per person is the honest record.
 *
 * A commitment must NOT. A flagged block in a shared note is one thing somebody
 * said they would do. Written once per attendee, four action points from one
 * meeting become eight promises, and the list that is supposed to be the
 * shortest and most trustworthy thing in the app becomes the least. So they are
 * held instead - see `pendingPromises` in the reducer - and filed one at a time.
 *
 * ## The legacy field
 *
 * Rows written before this carry `person` rather than `people`. They are read
 * through `boundPeople` and never rewritten: an event store's old rows are the
 * record of what was true, and a migration that rewrites them to look modern
 * buys nothing a four-line reader does not already give.
 */

/**
 * Everybody a binding covers.
 *
 * @param {any} binding
 * @returns {string[]}
 */
export function boundPeople(binding) {
  const listed = Array.isArray(binding?.people) ? binding.people : null;
  if (listed !== null) {
    return listed.map((/** @type {any} */ p) => String(p)).filter((/** @type {string} */ p) => p !== "");
  }
  const single = String(binding?.person ?? "").trim();
  return single === "" ? [] : [single];
}

/**
 * Is this a folder of notes about one person, or notes about a shared meeting?
 *
 * The question is asked in exactly one place - whether a flagged block becomes
 * a promise or a pending one - so it lives here rather than being re-derived as
 * `length > 1` at the call site, where the reason for the test would be lost.
 *
 * @param {any} binding
 * @returns {boolean}
 */
export function isShared(binding) {
  return boundPeople(binding).length > 1;
}

/**
 * What to call this binding.
 *
 * The user's own name for it when there is one, otherwise the Nib folder's
 * path. Kept separate from `label` because the folder path is Nib's to change
 * and this is his: a folder filed under some broad heading may hold the notes
 * for a meeting he calls something else entirely, and a page that can only say
 * the path makes him translate every time he reads it.
 *
 * @param {any} binding
 * @returns {string}
 */
export function sourceName(binding) {
  const named = String(binding?.name ?? "").trim();
  if (named !== "") {
    return named;
  }
  return String(binding?.label ?? binding?.categoryId ?? "").trim();
}
