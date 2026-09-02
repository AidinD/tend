/**
 * Everything that changes a row: people, projects, contact, promises,
 * archiving.
 *
 * The rule these all share is that a write refuses rather than guesses. A
 * contact kind that cannot be about the subject it was filed against is
 * refused, because the alternative is a row that satisfies nothing while the
 * toast says "Logged" and the cadence it was meant to answer stays exactly as
 * behind as it was. That is the failure this app is least allowed to have.
 *
 * The two guards every path here shares live in guards.js.
 *
 * Split out of api.js, which had grown past 3600 lines across fifteen sections.
 */

import { isArchived } from "../domain/archive.js";
import { CONTACT_KINDS, kindsFor, subjectOf } from "../domain/contact.js";
import { isRelationIn, relationsIn } from "../domain/halves.js";
import { namedStakes } from "../domain/stakes.js";
import { isLaterDay } from "../domain/time.js";
import { badArchiveInstant, nameClash } from "./guards.js";
import { resolvePerson, resolveProject, resolveStake, resolveWorkstream } from "./resolve.js";

/**
 * Add a person.
 *
 * `since` is when this relationship started, not when the row was created.
 * Getting it right matters: without it every cadence measures from today and
 * somebody you have neglected for months looks perfectly in step.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} args.name
 * @param {string} args.relation
 * @param {number} [args.since]
 * @param {number} args.now
 */
export function addPerson(store, { name, relation, since, now }) {
  if (!String(name ?? "").trim()) {
    return { error: "A person needs a name." };
  }
  if (!isRelationIn(store.half, String(relation))) {
    // The half's own vocabulary, not the union of both. A store holds one half's
    // people, so accepting the other half's words would put a row in the data
    // that every grouping treats as unknown - present in the store and absent
    // from the page, which is a failure this roster has already had once.
    return {
      error:
        `Unknown relationship type "${relation}". Valid here: ` +
        `${Object.keys(relationsIn(store.half)).join(", ")}.`
    };
  }
  const clash = nameClash(store, "people", name);
  if (clash) {
    return {
      error: isArchived(clash)
        ? `"${clash.name}" is archived, not gone, and a name may only belong to one row. ` +
          `Unarchive them from the archived group on People, or add this person under a name that tells the two apart.`
        : `"${name}" is already here. Use setRelation to change how you relate to them.`
    };
  }
  const id = store.create("people", {
    name: String(name).trim(),
    relation,
    since: typeof since === "number" ? since : now
  });
  return { id, added: name, relation };
}

/**
 * Change how the user relates to someone: they moved team, he took them on, they
 * became a peer. Every cadence that applies to them changes with it, and their
 * history survives, because cadences are generated rather than stored.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} who
 * @param {string} relation
 */
export function setRelation(store, who, relation) {
  const found = resolvePerson(store, who);
  if (!found.ok) {
    return { error: found.error };
  }
  if (!isRelationIn(store.half, String(relation))) {
    return {
      error:
        `Unknown relationship type "${relation}". Valid here: ` +
        `${Object.keys(relationsIn(store.half)).join(", ")}.`
    };
  }
  store.update("people", found.person.id, { relation });
  return { id: found.person.id, name: found.person.name, was: found.person.relation, now: relation };
}

/**
 * Correct a person's details: their name, how you relate to them, or when the
 * relationship started.
 *
 * Renaming is safe by construction. Everything that points at somebody -
 * contact, promises, Nib bindings, workstream ownership - holds their id, so
 * the name is only ever what is shown and what Ctrl+K matches against. A typo
 * therefore costs a lookup rather than a record, and fixing it costs nothing.
 *
 * `since` matters more than it looks. It is what every cadence measures from
 * before there is any contact to measure from instead, so a placeholder date
 * puts somebody months behind on their first day, or perfectly in step with
 * somebody you have not spoken to.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} who
 * @param {object} fields
 * @param {number | null} [fields.awayUntil] When they are back. Suspends every
 *   cadence until then, and the clock restarts from that day rather than from
 *   the last conversation. Null clears it.
 * @param {number | null} [fields.leftAt] Their last day. Everything behaves
 *   normally until it passes, then the cadences and promises go quiet and the
 *   history stays. Null clears it.
 * @param {string} [fields.name]
 * @param {string} [fields.relation]
 * @param {number} [fields.since]
 */
export function updatePerson(store, who, { name, relation, since, awayUntil, leftAt }) {
  const found = resolvePerson(store, who);
  if (!found.ok) {
    return { error: found.error };
  }

  /** @type {Record<string, any>} */
  const patch = {};

  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (trimmed === "") {
      return { error: "A person needs a name." };
    }
    // A second person with the same name makes both unreachable from Ctrl+K,
    // which refuses on an ambiguous match rather than guessing.
    const clash = nameClash(store, "people", trimmed, found.person.id);
    if (clash) {
      return {
        error: isArchived(clash)
          ? `"${trimmed}" belongs to somebody archived, and an archived row keeps its name. ` +
            `Unarchive them if that is who this is, or pick a name that tells the two apart.`
          : `Somebody else is already called "${trimmed}".`
      };
    }
    patch.name = trimmed;
  }

  if (relation !== undefined) {
    if (!isRelationIn(store.half, String(relation))) {
      return {
        error:
          `Unknown relationship type "${relation}". Valid here: ` +
          `${Object.keys(relationsIn(store.half)).join(", ")}.`
      };
    }
    patch.relation = relation;
  }

  if (since !== undefined) {
    if (typeof since !== "number" || !Number.isFinite(since)) {
      return { error: "The start date must be a date." };
    }
    patch.since = since;
  }

  // A date, or null to clear it. Null matters: coming back early has to be
  // sayable, and so does a resignation that was withdrawn.
  for (const [field, value] of [
    ["awayUntil", awayUntil],
    ["leftAt", leftAt]
  ]) {
    if (value === undefined) {
      continue;
    }
    if (value === null) {
      patch[String(field)] = null;
      continue;
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return { error: `${field === "awayUntil" ? "The return date" : "The last day"} must be a date.` };
    }
    patch[String(field)] = value;
  }

  if (Object.keys(patch).length === 0) {
    return { id: found.person.id, changed: [] };
  }

  store.update("people", found.person.id, patch);
  return { id: found.person.id, name: patch.name ?? found.person.name, changed: Object.keys(patch) };
}

/**
 * Stop a person cluttering Now, prep, attention and the roster, without
 * touching anything that has ever been recorded about them.
 *
 * Deliberately not folded into `updatePerson`: archiving is a distinct action
 * with its own confirmation in the UI, and a caller that only means to rename
 * somebody should not be able to archive them by way of an unrelated field.
 *
 * Idempotent, on purpose - the bulk "I left this job" action re-runs this over
 * everyone, and a second run over somebody already archived must be free
 * rather than an error or a reset of when they were archived.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} id
 * @param {object} args
 * @param {number} args.now
 */
export function archivePerson(store, id, { now }) {
  const found = resolvePerson(store, id);
  if (!found.ok) {
    return { error: found.error };
  }
  if (isArchived(found.person)) {
    return { id: found.person.id, name: found.person.name, archivedAt: found.person.archivedAt, already: true };
  }
  const bad = badArchiveInstant(now);
  if (bad) {
    return bad;
  }
  store.update("people", found.person.id, { archivedAt: now });
  return { id: found.person.id, name: found.person.name, archivedAt: now };
}

/**
 * The other half of `archivePerson`. `null`, not `undefined`, clears the
 * field in the event log - the same convention `updatePerson` uses for
 * `awayUntil`/`leftAt`, because an event that means "no longer true" has to
 * say so rather than omit the field and leave a reader to guess why.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} id
 */
export function unarchivePerson(store, id) {
  const found = resolvePerson(store, id);
  if (!found.ok) {
    return { error: found.error };
  }
  if (!isArchived(found.person)) {
    return { id: found.person.id, name: found.person.name, already: true };
  }
  store.update("people", found.person.id, { archivedAt: null });
  return { id: found.person.id, name: found.person.name };
}

/**
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} args.name
 * @param {number} [args.since]
 * @param {number} args.now
 */
export function addProject(store, { name, since, now }) {
  if (!String(name ?? "").trim()) {
    return { error: "A project needs a name." };
  }
  const clash = nameClash(store, "projects", name);
  if (clash) {
    return {
      error: isArchived(clash)
        ? `"${clash.name}" is archived, not gone, and a name may only belong to one row. ` +
          `Unarchive it from the archived group on Work, or use a name that tells the two apart.`
        : `"${name}" is already here.`
    };
  }
  const id = store.create("projects", {
    name: String(name).trim(),
    since: typeof since === "number" ? since : now
  });
  return { id, added: name };
}

/**
 * See `archivePerson` - same shape, same idempotency guarantee, for a project.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} id
 * @param {object} args
 * @param {number} args.now
 */
export function archiveProject(store, id, { now }) {
  const found = resolveProject(store, id);
  if (!found.ok) {
    return { error: found.error };
  }
  if (isArchived(found.project)) {
    return { id: found.project.id, name: found.project.name, archivedAt: found.project.archivedAt, already: true };
  }
  const bad = badArchiveInstant(now);
  if (bad) {
    return bad;
  }
  store.update("projects", found.project.id, { archivedAt: now });
  return { id: found.project.id, name: found.project.name, archivedAt: now };
}

/**
 * See `unarchivePerson`.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} id
 */
export function unarchiveProject(store, id) {
  const found = resolveProject(store, id);
  if (!found.ok) {
    return { error: found.error };
  }
  if (!isArchived(found.project)) {
    return { id: found.project.id, name: found.project.name, already: true };
  }
  store.update("projects", found.project.id, { archivedAt: null });
  return { id: found.project.id, name: found.project.name };
}

/**
 * Log a promise you made.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} args.person
 * @param {string} args.text
 * @param {number} [args.due]
 * @param {number} [args.madeAt]
 * @param {string} [args.source] Where the wording came from, e.g. `model:<id>`.
 * @param {number} args.now
 */
export function logPromise(store, { person: who, text, due, madeAt, source, now }) {
  const found = resolvePerson(store, who);
  if (!found.ok) {
    return { error: found.error };
  }
  if (!String(text ?? "").trim()) {
    return { error: "A promise needs text describing what you said you would do." };
  }
  const id = store.create("promises", {
    person: found.person.id,
    text: String(text).trim(),
    due: typeof due === "number" ? due : null,
    madeAt: typeof madeAt === "number" ? madeAt : now,
    state: "open",
    // Where the wording came from, which is not the same question as which
    // process wrote the row. A promise a model suggested and a person accepted
    // is written by the app and would otherwise be indistinguishable from one
    // typed out by hand.
    source: typeof source === "string" && source.trim() !== "" ? source.trim() : null
  });
  return { id, logged: `Promise to ${found.person.name}: ${text}` };
}

/**
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} id
 * @param {"resolved" | "dropped"} [as]
 */
export function resolvePromise(store, id, as = "resolved") {
  const row = store.rows("promises").find((p) => p.id === id);
  if (!row) {
    return { error: `No open promise with id "${id}".` };
  }
  store.update("promises", id, { state: as });
  return { id, state: as };
}

/**
 * Record that contact happened. This is what resets a cadence.
 *
 * The `kind` matters: a 1-1 satisfies the 1-1 cadence and does not satisfy the
 * separate cadence for hearing about that person from somebody else.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} args.subject Person or project.
 * @param {string} args.kind
 * @param {string} [args.note]
 * @param {number} [args.at]
 * @param {number} args.now
 */
export function logTouch(store, { subject, kind, note, at, now }) {
  const asked = String(kind ?? "").trim();
  if (!asked) {
    return { error: "A contact needs a kind, e.g. one-to-one, second-hand, sideways, check-in." };
  }

  // The KIND decides what sort of thing the subject has to be, so it also
  // decides which lookup to use. That is not a shortcut - it is the only
  // ordering that cannot go wrong. Resolving first and validating afterwards
  // means a name shared by a person and a project silently picks whichever
  // lookup ran first, and then the kind is judged against the wrong one.
  //
  // It also produces the better error. "No person matching Zeta" says what went
  // wrong; falling through to the project lookup and complaining about projects
  // when you were logging a 1-1 does not.
  const subjectKind = subjectOf(asked);
  if (subjectKind === null) {
    const every = CONTACT_KINDS.map((k) => k.value).join(", ");
    return { error: `"${asked}" is not a kind of contact. The kinds are: ${every}.` };
  }

  const found = findSubject(store, subjectKind, subject);
  if (!found.ok) {
    // Before repeating "no person by that name", check whether the name is a
    // real thing of some OTHER sort. That is the mistake almost every time - a
    // 1-1 aimed at a project, a check-in aimed at a person - and naming it
    // beats a lookup failure that leaves you wondering how to spell a colleague
    // you can see on the roster.
    const actually = otherSubject(store, subjectKind, subject);
    if (actually !== null) {
      const offer = kindsFor(actually.kind)
        .map((k) => k.value)
        .join(", ");
      return {
        error:
          `${actually.name} is a ${actually.kind}, and "${asked}" is about a ${subjectKind}, ` +
          `so it would satisfy nothing. For a ${actually.kind} the kinds are: ${offer}.`
      };
    }
    const offer = kindsFor(subjectKind)
      .map((k) => k.value)
      .join(", ");
    return {
      error: `${found.error} A "${asked}" is about a ${subjectKind}; those are the only subjects it can satisfy a cadence for (${offer}).`
    };
  }

  // A booked meeting is not contact. Accepting a future date let somebody clear
  // a cadence for a conversation that had not happened yet - and it goes green
  // immediately, so the page says you are in step for however many days remain
  // until the thing actually takes place. Wrong in the flattering direction,
  // which is the direction nobody checks.
  //
  // Tend deliberately models drift rather than a calendar, so there is no
  // "planned" state for this to become. Log it afterwards, or backdate it.
  const when = typeof at === "number" ? at : now;
  if (isLaterDay(when, now)) {
    return {
      error:
        "That day has not arrived yet. Contact is a record of something that happened, so a " +
        "meeting in the diary cannot satisfy a cadence - log it once it has, or backdate it."
    };
  }

  const id = store.create("touches", {
    subject: found.row.id,
    kind: asked,
    note: note ?? null,
    at: when
  });
  return { id, logged: `${asked} with ${found.row.name}` };
}

/**
 * Look a subject up as the given sort of thing.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {import("../domain/contact.js").SubjectKind} subjectKind
 * @param {string} query
 * @returns {{ ok: true, row: any } | { ok: false, error: string }}
 */
/**
 * The same name, resolved as some other sort of subject.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {import("../domain/contact.js").SubjectKind} expected
 * @param {string} query
 * @returns {{ kind: import("../domain/contact.js").SubjectKind, name: string } | null}
 */
function otherSubject(store, expected, query) {
  /** @type {import("../domain/contact.js").SubjectKind[]} */
  const every = ["person", "project", "workstream", "stake"];
  const others = every.filter((k) => k !== expected);
  for (const kind of others) {
    const hit = findSubject(store, kind, query);
    if (hit.ok) {
      return { kind, name: String(hit.row.name ?? query) };
    }
  }
  return null;
}

/**
 * Look a subject up as the given sort of thing.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {import("../domain/contact.js").SubjectKind} subjectKind
 * @param {string} query
 * @returns {{ ok: true, row: any } | { ok: false, error: string }}
 */
function findSubject(store, subjectKind, query) {
  if (subjectKind === "project") {
    const hit = resolveProject(store, query);
    return hit.ok ? { ok: true, row: hit.project } : { ok: false, error: hit.error };
  }
  if (subjectKind === "workstream") {
    const hit = resolveWorkstream(store, query);
    return hit.ok ? { ok: true, row: hit.workstream } : { ok: false, error: hit.error };
  }
  if (subjectKind === "stake") {
    const hit = resolveStake(store, query);
    if (!hit.ok) {
      return { ok: false, error: hit.error };
    }
    // Named for the confirmation message, from the rows as they are now.
    const named = namedStakes([hit.stake], store.rows("people"), store.rows("projects"))[0];
    return { ok: true, row: named ?? { ...hit.stake, name: "a stakeholder" } };
  }
  const hit = resolvePerson(store, query);
  return hit.ok ? { ok: true, row: hit.person } : { ok: false, error: hit.error };
}

/**
 * Record something you observed. Raw material for a review conversation, so it
 * is not a memory exercise six months from now.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} [args.person]
 * @param {string} args.text
 * @param {string} [args.area] e.g. "team-lead", "rnd", or an IC axis.
 * @param {number} args.now
 */
export function logEvidence(store, { person: who, text, area, now }) {
  if (!String(text ?? "").trim()) {
    return { error: "Evidence needs text." };
  }
  let personId = null;
  if (who) {
    const found = resolvePerson(store, who);
    if (!found.ok) {
      return { error: found.error };
    }
    personId = found.person.id;
  }
  const id = store.create("evidence", {
    person: personId,
    area: area ?? null,
    text: String(text).trim(),
    at: now
  });
  return { id, logged: text };
}
