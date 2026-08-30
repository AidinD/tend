/**
 * Archived, as distinct from gone.
 *
 * ## Why this exists at all
 *
 * The store never deletes anything - that is the whole design of the append-only
 * log - but a roster that never shrinks eventually shows every person who ever
 * worked here, every project that ever shipped, every workstream that ever
 * mattered, forever. The owner's actual need when a job changes, a project
 * closes, or someone leaves is not to destroy that record. It is for the stale
 * entry to stop asking for attention while the record about it stays exactly as
 * it was and can be looked at again.
 *
 * `archivedAt` is that: a timestamp on a `people`, `projects` or `workstreams`
 * row, undefined while the row is live. Every view that currently assumes every
 * row is live - Now, prep, attention, duty cadences, the default roster and
 * project lists - reads it and skips the row. Nothing that already happened to
 * that row (touches, promises, decisions, growth threads, evidence) is touched
 * by setting or clearing it.
 *
 * ## Why a timestamp, not a boolean
 *
 * Same reasoning as `leftAt` in `people.js`: a date can label itself ("archived
 * 12 days ago") and survives being re-applied. Re-running a bulk archive over a
 * row that is already archived must not make it look freshly archived today,
 * which a boolean flag would silently do and a stored instant does not.
 *
 * ## Why this is not the same mechanism as `leftAt` or `_deleted`
 *
 * `leftAt` is specifically about a person's employment ending, and it drives
 * `notBefore` so a returning cadence measures from the right instant - none of
 * which means anything for a project or a workstream. `_deleted` (the existing
 * "Remove" action) has no restore path and makes a row unresolvable by id,
 * which is correct for a row created by mistake and wrong for a person you may
 * one day want to look back on. Archiving needed to apply to three different
 * kinds of row and be fully reversible, so it stayed its own flag rather than
 * being folded into either.
 *
 * Nothing here touches the store.
 */

/**
 * Is this row archived?
 *
 * @param {Record<string, any>} row
 * @returns {boolean}
 */
export function isArchived(row) {
  return typeof row.archivedAt === "number" && Number.isFinite(row.archivedAt);
}
