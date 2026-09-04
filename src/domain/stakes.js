/**
 * Stakes: one person's interest in one project.
 *
 * ## Why a stake and not a relationship
 *
 * A stakeholder is nobody you lead, manage or stand level with. What you owe
 * them is a picture of where something stands, and the failure is specific: you
 * go quiet for a quarter and the first thing they hear is that it slipped.
 * Nothing else in the tool catches that, because they are neither your report
 * nor your peer.
 *
 * The tempting model is a relationship type on the person - "the COO is a
 * stakeholder" - with one duty behind it. It is wrong for the reason this whole
 * tool exists: that cadence would then be satisfied by any update at all, so
 * telling them about one project silences every other. A quarter of silence
 * about the thing they actually depend on would sit behind a fortnight of
 * chatter about something else. Contact kinds are not interchangeable, and
 * neither are the things contact is ABOUT.
 *
 * So the subject is the pair. "The COO, about Sjöhästen" has its own clock, and
 * an update about another project does not touch it. Workstreams already work this way -
 * a piece of work is its own cadence subject rather than a field on a person -
 * so this is a fourth subject kind rather than a new mechanism.
 *
 * ## Why milestones are not modelled
 *
 * Because they do not need to be. Tend measures drift, not due dates, and
 * shipping something and saying so resets the clock at the moment it happens.
 * A milestone is an occasion to write an update, not a second kind of
 * obligation - and a deadline that turns red every busy week is the thing this
 * tool was built to avoid.
 *
 * Nothing here touches the store.
 */

/**
 * How often a stakeholder hears from you when nobody has said otherwise.
 *
 * A month: one reporting cycle. Long enough that it is not chatter, short
 * enough that nothing important has happened twice since you last spoke.
 */
export const DEFAULT_STAKE_DAYS = 30;

/**
 * How often this particular stakeholder should hear from you.
 *
 * The stake's own value wins over the duty's, because "how often" is the whole
 * substance of the arrangement and it differs per person: a sponsor two levels
 * up who wants to know it is moving is not the same obligation as a stakeholder
 * sitting next to the work.
 *
 * @param {Record<string, any>} stake
 * @param {number} [dutyDays] The duty's interval, as a fallback.
 * @returns {number}
 */
export function stakeInterval(stake, dutyDays) {
  const own = Number(stake.cadenceDays);
  if (own > 0) {
    return own;
  }
  const fromDuty = Number(dutyDays);
  return fromDuty > 0 ? fromDuty : DEFAULT_STAKE_DAYS;
}

/**
 * How a stake reads on a card.
 *
 * Resolved from the person and project rows every time rather than stored on
 * the stake. A copied label is a label that goes stale, and it goes stale in
 * the most misleading way available: a person was renamed and the card still
 * shows the old spelling, so it looks like a second person you have neglected.
 *
 * @param {Record<string, any>} stake
 * @param {Map<string, string>} people Person id to name.
 * @param {Map<string, string>} projects Project id to name.
 * @returns {string}
 */
export function stakeName(stake, people, projects) {
  const who = people.get(String(stake.person ?? "")) ?? "någon som inte längre är på registret";
  const what = projects.get(String(stake.project ?? "")) ?? "ett projekt som är borta";
  return `${who}, om ${what}`;
}

/**
 * Stakes with a readable name attached, ready to be crossed with duties.
 *
 * Done here rather than in the attention builder so the naming rule has one
 * home and the builder stays about drift.
 *
 * @param {Record<string, any>[]} stakes
 * @param {Record<string, any>[]} people
 * @param {Record<string, any>[]} projects
 * @returns {Record<string, any>[]}
 */
export function namedStakes(stakes, people, projects) {
  const byPerson = new Map(people.map((p) => [String(p.id), String(p.name ?? "")]));
  const byProject = new Map(projects.map((p) => [String(p.id), String(p.name ?? "")]));

  // A stake whose person or project has been removed is dropped rather than
  // shown with a placeholder. It cannot be acted on - there is nobody to update
  // and nothing to update them about - so surfacing it would be a permanent
  // item on a page whose whole value is that everything on it is actionable.
  return stakes
    .filter((s) => byPerson.has(String(s.person ?? "")) && byProject.has(String(s.project ?? "")))
    .map((s) => ({ ...s, name: stakeName(s, byPerson, byProject) }));
}
