/**
 * How often one duty runs for one particular person.
 *
 * ## Why the pair and not the person
 *
 * The obvious model is a field on the person - "this peer every 30 days" -
 * and the stakeholder precedent looks like it endorses it. It does not. A
 * stake's subject IS the pair (person, project), and exactly one duty applies
 * to stakes, so `stakeInterval` is already a value per subject and duty rather
 * than per person. A person is a subject that several duties cross, and a field
 * on the person would override all of them at once.
 *
 * Measured against the real role map when this was written rather than
 * reasoned about: a peer has one duty on them, so a field on the person happens
 * to work. Somebody the user leads has two - a conversation every fortnight and
 * a feedback round every quarter - so setting "every 30 days" on them would
 * drag the quarterly round to a month, and three of the duties still waiting to
 * be accepted are person duties too. The wrong shape gets worse exactly as the
 * role map fills in.
 *
 * So the override is on the pair. Same principle as the stake, one level finer,
 * and it is not a departure from it.
 *
 * ## Why "no clock" is a value here and not a relationship type
 *
 * Some contact is genuinely event-driven. The two answers available without
 * this were both bad: leave the person permanently critical until the page
 * becomes noise somebody learns to skip, or change what they are so no duty
 * reaches them and they go invisible again - which is the blind spot the whole
 * tool exists to catch.
 *
 * A seventh relationship type with no clock was the cheaper build and says the
 * wrong thing. The relationship type answers what the relationship IS, and a
 * peer lead is a peer lead whether or not you speak weekly. Whether a clock
 * runs is a different question, and it is per duty. Picking 180 days instead is
 * inventing a number to quieten a feature, and it still turns critical in the
 * end.
 *
 * So an override may say no interval at all. That duty then generates no drift
 * for that person - and the person stays on the roster with their history and
 * the age of their last contact intact, because going quiet about the clock is
 * not the same as going quiet about the person. Every reader that would
 * otherwise say "in step" has to be able to tell the two apart; `tiles.js` has
 * the phrase for it.
 *
 * ## Why muting asks for a reason
 *
 * Because six months later the row cannot say whether it was deliberate. The
 * same reasoning as an aim naming where its verdict comes from: the field that
 * makes the record worth keeping is the one it would be easiest to leave out.
 * A number does not need one - it says what it means - so the reason is
 * required only when the clock is switched off.
 *
 * Nothing here touches the store.
 */

/**
 * The override in force for one person and one duty, or null.
 *
 * @param {Record<string, any>[]} overrides
 * @param {string} personId
 * @param {string} dutyId
 * @returns {Record<string, any> | null}
 */
export function overrideFor(overrides, personId, dutyId) {
  for (const row of overrides) {
    if (row._deleted) {
      continue;
    }
    if (String(row.person) === String(personId) && String(row.duty) === String(dutyId)) {
      return row;
    }
  }
  return null;
}

/**
 * Is this override switching the clock off rather than changing it?
 *
 * A row that exists at all was written deliberately, so anything that is not a
 * positive number of days is read as no clock. That is the safe direction: the
 * alternative reading - a malformed row silently falling back to the duty's
 * interval - would put somebody back on the page with no way to tell why, and
 * the write path is what refuses a value that means neither.
 *
 * @param {Record<string, any> | null} override
 * @returns {boolean}
 */
export function isMuted(override) {
  return override !== null && !(Number(override.cadenceDays) > 0);
}

/**
 * How often this duty runs for this person.
 *
 * @param {Record<string, any> | null} override
 * @param {number} [dutyDays] The duty's own interval, as the default.
 * @returns {number | null} Null means no clock at all for this pair.
 */
export function intervalFor(override, dutyDays) {
  if (override !== null) {
    const own = Number(override.cadenceDays);
    return own > 0 ? own : null;
  }
  const fromDuty = Number(dutyDays);
  return fromDuty > 0 ? fromDuty : null;
}

/**
 * The duties whose clock this person has switched off.
 *
 * Counted rather than only listed, because the count is what a roster row needs
 * to keep from claiming somebody is in step with a cadence that is not running.
 *
 * @param {Record<string, any>[]} overrides
 * @param {string} personId
 * @returns {string[]} Duty ids.
 */
export function mutedDuties(overrides, personId) {
  return overrides
    .filter((row) => !row._deleted && String(row.person) === String(personId) && isMuted(row))
    .map((row) => String(row.duty));
}
