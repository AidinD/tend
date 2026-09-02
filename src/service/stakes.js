/**
 * One person's interest in one project, and what you owe them about it.
 *
 * The PAIR rather than the person, and that is the whole design. A stakeholder
 * cadence satisfied by any update at all would let a quarter of silence about
 * the thing somebody depends on hide behind a fortnight of chatter about
 * something else.
 *
 * Split out of api.js: measured as needing nothing from any other section.
 */

import { isArchived } from "../domain/archive.js";
import { DEFAULT_STAKE_DAYS, namedStakes, stakeInterval } from "../domain/stakes.js";
import { agoWords, driftBadge } from "../domain/time.js";
import { resolvePerson, resolveProject, resolveStake } from "./resolve.js";

/**
 * Who is waiting to hear about what, and how long since they did.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {number} now
 * @param {string} [project] Name or id, to narrow it to one project.
 */
export function stakeholders(store, now, project) {
  let only = null;
  if (project !== undefined && String(project).trim() !== "") {
    const found = resolveProject(store, project);
    if (!found.ok) {
      return { error: found.error };
    }
    only = String(found.project.id);
  }

  const touches = store.rows("touches");
  // Only active people and projects reach `namedStakes`, so a stake pointing
  // at an archived one resolves nobody and is dropped by the same "nothing to
  // act on" rule it already applies to a removed row.
  const named = namedStakes(
    store.rows("stakes"),
    store.rows("people").filter((p) => !isArchived(p)),
    store.rows("projects").filter((p) => !isArchived(p))
  );
  const projects = new Map(store.rows("projects").map((p) => [String(p.id), String(p.name ?? "")]));
  const people = new Map(store.rows("people").map((p) => [String(p.id), String(p.name ?? "")]));

  return named
    .filter((s) => only === null || String(s.project) === only)
    .map((s) => {
      const last = touches
        .filter((t) => t.subject === s.id && t.kind === "update" && typeof t.at === "number")
        .sort((a, b) => Number(b.at) - Number(a.at))[0];
      const days = last ? Math.max(0, Math.floor((now - Number(last.at)) / 86_400_000)) : null;
      const interval = stakeInterval(s);
      return {
        id: String(s.id),
        person: people.get(String(s.person)) ?? "",
        project: projects.get(String(s.project)) ?? "",
        label: String(s.name ?? ""),
        every: `${interval} days`,
        // "never" and "today" are different facts and neither is a number, so
        // both are words. A card that says "0 days ago" for something that has
        // not happened at all is the reason this is not just a count.
        lastUpdated: days === null ? "never" : agoWords(days),
        behindBy: driftBadge((days ?? 0) - interval),
        note: last?.note ?? null
      };
    })
    .sort((a, b) => (a.lastUpdated === "never" ? -1 : 0) - (b.lastUpdated === "never" ? -1 : 0));
}

/**
 * Record that somebody is a stakeholder in a project.
 *
 * Structure, so this is the user's to do rather than an agent's - same boundary
 * as the role map. An agent that can decide who you owe a report to has decided
 * part of your job.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} args.person Name or id.
 * @param {string} args.project Name or id.
 * @param {number} [args.cadenceDays] How often they should hear from you.
 * @param {string} [args.what] What they actually want to know, in a line.
 * @param {number} [args.since] When they started waiting. Defaults to now.
 */
export function addStake(store, { person: who, project, cadenceDays, what, since }) {
  const foundPerson = resolvePerson(store, who);
  if (!foundPerson.ok) {
    return { error: foundPerson.error };
  }
  const foundProject = resolveProject(store, project);
  if (!foundProject.ok) {
    return { error: foundProject.error };
  }

  const personId = String(foundPerson.person.id);
  const projectId = String(foundProject.project.id);

  const already = store
    .rows("stakes")
    .find((s) => String(s.person) === personId && String(s.project) === projectId);
  if (already) {
    return {
      error: `${foundPerson.person.name} is already a stakeholder in ${foundProject.project.name}. Change the interval on the existing one rather than adding a second.`
    };
  }

  const every = Number(cadenceDays);
  if (cadenceDays !== undefined && !(every > 0)) {
    return { error: "An interval has to be a positive number of days." };
  }

  // Backdatable, and the default is deliberately the cautious one. Somebody
  // added today has waited no time at all, so they do not arrive already
  // overdue - but "they have been waiting since March" is a thing that is often
  // true when a stakeholder gets written down, and it has to be sayable or the
  // first month of the record is a lie in the flattering direction.
  const started = Number(since);
  const id = store.create("stakes", {
    person: personId,
    project: projectId,
    cadenceDays: every > 0 ? every : DEFAULT_STAKE_DAYS,
    what: String(what ?? "").trim() || null,
    since: Number.isFinite(started) && started > 0 ? started : undefined
  });
  return {
    id,
    added: `${foundPerson.person.name} on ${foundProject.project.name}`,
    every: `${every > 0 ? every : DEFAULT_STAKE_DAYS} days`
  };
}

/**
 * Change how often a stakeholder should hear from you, or what they want.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} id
 * @param {object} fields
 * @param {number} [fields.cadenceDays]
 * @param {string} [fields.what]
 */
export function updateStake(store, id, { cadenceDays, what }) {
  const found = resolveStake(store, id);
  if (!found.ok) {
    return { error: found.error };
  }
  /** @type {Record<string, any>} */
  const patch = {};
  if (cadenceDays !== undefined) {
    if (!(Number(cadenceDays) > 0)) {
      return { error: "An interval has to be a positive number of days." };
    }
    patch.cadenceDays = Number(cadenceDays);
  }
  if (what !== undefined) {
    patch.what = String(what).trim() || null;
  }
  if (Object.keys(patch).length === 0) {
    return { error: "Nothing to change." };
  }
  store.update("stakes", id, patch);
  return { id, changed: Object.keys(patch) };
}
