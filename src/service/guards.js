/**
 * The refusals every write path shares.
 *
 * Two of them, and they have nothing in common except being the check that has
 * to happen before a row changes. Both lived in api.js's reading section, which
 * is simply where they were first written, and both were what tied the writing
 * and workstream sections to it - so a module of shared guards is what let those
 * two move at all.
 *
 * Nothing here changes a row. They answer "may this happen", and the caller
 * decides what to say about it.
 */

/**
 * The instant an archive is allowed to be stamped with.
 *
 * `archivedAt` is the whole mechanism, and an unusable value fails quietly in
 * three different ways rather than loudly in one: `NaN` serialises to `null`, so
 * the row reads back as ACTIVE while the call reports success and the bulk
 * counter counts it; a far-future number passes `Number.isFinite` and then makes
 * `toISOString()` throw inside the map that builds the archived group, taking
 * out the whole view rather than one line; and `0` archives a row into 1970.
 * The renderer only ever sends `Date.now()`, so none of that is reachable
 * today - which is exactly why the next caller to compute a timestamp itself
 * should be told here rather than find out from a blank page.
 *
 * @param {unknown} now
 * @returns {{ error: string } | undefined}
 */
export function badArchiveInstant(now) {
  if (typeof now !== "number" || !Number.isFinite(now) || now <= 0) {
    return { error: `Cannot archive at "${String(now)}" - an archive is stamped with a real instant.` };
  }
  // Date's own range, past which every attempt to format the stamp throws.
  if (Math.abs(now) > 8.64e15) {
    return { error: `Cannot archive at "${String(now)}" - that is outside the range a date can hold.` };
  }
  return undefined;
}

/**
 * The row already holding this name, archived or not.
 *
 * One helper rather than the same `.find()` written at each place that refuses a
 * duplicate name, because archiving introduced a case those checks could not
 * see: a row that is archived still owns its name, but it is not on any list, so
 * "already here" pointed at nothing the reader could find and told them to use
 * an action that does not apply to an archived row. Callers decide what to say -
 * `isArchived` on the returned row is the whole difference - and this decides
 * only what counts as taken.
 *
 * Names stay unique across archived rows deliberately: Ctrl+K refuses an
 * ambiguous match rather than guessing, so two rows sharing a name makes both
 * unreachable whether or not one of them is archived.
 *
 * @param {any} store
 * @param {"people" | "projects" | "workstreams"} collection
 * @param {unknown} name
 * @param {string} [exceptId] A row that may keep its own name - for a rename.
 * @returns {Record<string, any> | undefined}
 */
export function nameClash(store, collection, name, exceptId) {
  const wanted = String(name ?? "").trim().toLowerCase();
  if (wanted === "") {
    return undefined;
  }
  return store
    .rows(collection)
    .find(
      (/** @type {any} */ row) =>
        row.id !== exceptId && String(row.name ?? "").trim().toLowerCase() === wanted
    );
}
