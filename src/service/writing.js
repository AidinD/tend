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
import { derivedTouch } from "./nib.js";
import { isRelationIn, relationsIn } from "../domain/halves.js";
import { MISTAKE_WINDOW_MS, removableAsMistake } from "../domain/observations.js";
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
    return { error: "En person behöver ett namn." };
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
        ? `"${clash.name}" är arkiverad, inte borta, och ett namn får bara tillhöra en rad. ` +
          `Ta tillbaka dem från den arkiverade gruppen på Personer, eller lägg till den här personen under ett namn som skiljer de två.`
        : `"${name}" finns redan här. Använd setRelation för att ändra hur du förhåller dig till dem.`
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
      return { error: "En person behöver ett namn." };
    }
    // A second person with the same name makes both unreachable from Ctrl+K,
    // which refuses on an ambiguous match rather than guessing.
    const clash = nameClash(store, "people", trimmed, found.person.id);
    if (clash) {
      return {
        error: isArchived(clash)
          ? `"${trimmed}" tillhör någon arkiverad, och en arkiverad rad behåller sitt namn. ` +
            `Ta tillbaka dem om det är den personen, eller välj ett namn som skiljer de två.`
          : `Någon annan heter redan "${trimmed}".`
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
      return { error: "Startdatumet måste vara ett datum." };
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
      return { error: `${field === "awayUntil" ? "Återkomstdatumet" : "Sista dagen"} måste vara ett datum.` };
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
    return { error: "Ett projekt behöver ett namn." };
  }
  const clash = nameClash(store, "projects", name);
  if (clash) {
    return {
      error: isArchived(clash)
        ? `"${clash.name}" är arkiverat, inte borta, och ett namn får bara tillhöra en rad. ` +
          `Ta tillbaka det från den arkiverade gruppen på Arbete, eller använd ett namn som skiljer de två.`
        : `"${name}" finns redan här.`
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
    return { error: "Ett löfte behöver text som beskriver vad du sa att du skulle göra." };
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
 * @param {boolean} [args.anyway] Log it even though a note already recorded a
 *   contact of this kind on this day. The window offers this after asking; the
 *   MCP tool does not accept it.
 * @param {number} args.now
 */
export function logTouch(store, { subject, kind, note, at, anyway, now }) {
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
        "Den dagen har inte kommit än. En kontakt är en registrering av något som hänt, så ett " +
        "möte i kalendern kan inte uppfylla en takt - logga den när den ägt rum, eller backdatera."
    };
  }

  /*
   * A conversation the note already recorded is not logged twice.
   *
   * ## The duplication this closes
   *
   * The Nib indexer writes one contact per attendee per note, keyed by the note
   * id, and its text is the note's TITLE. An agent session reading the same note
   * would then log a SECOND contact carrying a summary, and neither writer knew
   * about the other: four conversations in five days were on the page twice, one
   * short row and one long one, for the same afternoon.
   *
   * So the note owns that slot. The import is the writer for a conversation that
   * exists as a note, and its row now resolves its text out of Nib on every read
   * - see `notePreviews` - so standing down here costs nothing that used to be
   * gained by writing over it.
   *
   * ## Why the day and not the instant
   *
   * The derived row is dated to the note, and a hand-logged one to whenever the
   * conversation is being written up. Matching on the instant would match
   * nothing, and matching on the note is impossible: a hand-logged contact
   * carries no note reference, which is the whole reason this could not be seen
   * before.
   *
   * ## Refused rather than merged, and `anyway` is the way past it
   *
   * Two real conversations of one kind on one day happen - two casual chats with
   * somebody in a day is ordinary - so this cannot simply be a hard rule. It is
   * a refusal the WINDOW can override by asking him, and the MCP tool cannot:
   * `tend_log_touch` does not accept `anyway` and does not offer it. The rule
   * lives here rather than in the tool definition so a second client cannot
   * route around it, and the override is a field rather than a caller identity
   * for the same reason.
   */
  if (anyway !== true) {
    const day = new Date(when).toISOString().slice(0, 10);
    const already = store.rows("touches").find((t) => {
      if (String(t.subject) !== String(found.row.id) || String(t.kind) !== asked) {
        return false;
      }
      if (derivedTouch(t) === null) {
        return false;
      }
      return new Date(Number(t.at ?? 0)).toISOString().slice(0, 10) === day;
    });
    if (already) {
      return {
        error:
          `Den ${day} finns redan en ${asked} med ${found.row.name} som kommer från en ` +
          `anteckning i Nib, och den hämtar sin text därifrån. Skriv i anteckningen i stället ` +
          `- var det ett annat samtal samma dag, logga det med anyway.`,
        covered: String(already.id)
      };
    }
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
    return { error: "En observation behöver text." };
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

/**
 * Correct an observation by filing the right one over it.
 *
 * The correction is a full observation in its own right - its own text, its own
 * area, its own date - that additionally points at the row it supersedes. That
 * shape is the point: the record now holds both readings and the fact that the
 * first one was revised, which is the most useful thing in it on the day it
 * changes. See `domain/observations.js` for why this is not a delete.
 *
 * `person` is not a parameter. A correction lands on whoever the original was
 * about, because a row about the wrong person is not something this fixes: that
 * row was never true of them and belongs to `forgetObservation`, and letting a
 * replacement move the subject would quietly relabel a judgment as being about
 * somebody who was never judged.
 *
 * The area IS allowed to move, and defaults to the original's rather than to
 * nothing. Filing a correction should not silently drop the axis a review is
 * held against, which is what an omitted field meaning "clear it" would do.
 *
 * App only. There is no MCP tool, deliberately - see the note on
 * `forgetObservation`.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} args.id The observation being corrected.
 * @param {string} args.text What is true instead.
 * @param {string} [args.area]
 * @param {number} args.now
 */
export function replaceObservation(store, { id, text, area, now }) {
  const row = store.rows("evidence").find((e) => String(e.id) === String(id));
  if (!row) {
    return { error: `Ingen observation med id "${id}".` };
  }
  if (!String(text ?? "").trim()) {
    return { error: "En rättelse behöver text. Utan den vore raden bara borttagen." };
  }

  const newId = store.create("evidence", {
    person: row.person ?? null,
    area: area === undefined ? (row.area ?? null) : (String(area).trim() || null),
    text: String(text).trim(),
    at: now,
    replaces: String(row.id)
  });
  return { id: newId, replaced: String(row.id), logged: String(text).trim() };
}

/**
 * Remove an observation that was never true and was never a judgment.
 *
 * The paste error, and nothing else. Both gates in `removableAsMistake` have to
 * allow it, and this refuses in words that name the other mechanism rather than
 * just saying no - a refusal that does not tell you what to do instead reads as
 * a broken button.
 *
 * App only, and this is the half of the pair where that matters most. An agent
 * that can mark a row as superseded can silence a row that was inconvenient, and
 * an agent that can remove one can do it without leaving a trace in any view.
 * Writing assessments is already parked on the same epic for the same reason.
 * Whether either of these ever reaches MCP is a question on the card, and it is
 * left closed rather than settled.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} args.id
 * @param {number} args.now
 */
export function forgetObservation(store, { id, now }) {
  const rows = store.rows("evidence");
  const row = rows.find((e) => String(e.id) === String(id));
  if (!row) {
    return { error: `Ingen observation med id "${id}".` };
  }

  const allowed = removableAsMistake(row, rows, now);
  if (!allowed.ok) {
    const minutes = Math.round(MISTAKE_WINDOW_MS / 60_000);
    return {
      error:
        allowed.why === "chained"
          ? "Den här raden hör till en rättelse, så den är historik nu. Rätta rättelsen i stället."
          : `Bara en rad som blev fel av misstag tas bort, och bara inom ${minutes} minuter. ` +
            "Den här är äldre, så det är ett ändrat omdöme och inte ett misstag: ersätt den i stället."
    };
  }

  store.remove("evidence", String(row.id));
  return { id: String(row.id), forgotten: String(row.text ?? "") };
}
