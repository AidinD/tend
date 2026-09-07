/**
 * The role map: the duties he owes, and the edits he makes to them.
 *
 * Duties are ROWS rather than code, and that is the load-bearing decision. What
 * counts as evidence for a duty, how often it is owed, and which relationships
 * it applies to are all his to change - so a new contact kind starts out
 * satisfying nothing until he says otherwise, and no cadence is hard-coded
 * anywhere.
 *
 * The coherence check is the one refusal here. A duty declared against a person
 * while consuming evidence that is about a project can never be satisfied by
 * anything: it crosses with every colleague, reports each of them as never done,
 * and nothing anybody does clears it. Refused at the edit rather than discovered
 * as a page full of alerts that will not go away.
 *
 * Split out of api.js. The coherence check and `proposeDuty` had been left
 * behind under a banner that said "nib links" after the Nib code moved out, and
 * the edits below needed the check - one subject under two wrong names.
 */

import { RELATIONS, isRelation } from "../domain/cadence.js";
import { SUBJECT_KINDS, evidenceFor, subjectOf } from "../domain/contact.js";
import { isKeptRecord } from "../domain/growth.js";
import { intervalFor, isMuted, overrideFor } from "../domain/overrides.js";
import { resolvePerson } from "./resolve.js";

/**
 * Can a duty about this sort of subject be satisfied by this evidence?
 *
 * The check that was missing. A duty declared against a person while consuming
 * evidence that is about a stake can never be satisfied by anything: it crosses
 * with every colleague, reports each of them as never done, and no action in the
 * app can clear it. Two duties in the seeded set had exactly this shape, and a
 * form silently gave a third one.
 *
 * An empty evidence list is allowed. That means "any contact counts", which is a
 * real thing to want and is not the same as naming evidence that cannot apply.
 *
 * @param {string} subjectKind
 * @param {string[] | undefined} evidenceKinds
 * @returns {string | null} An explanation, or null when it is coherent.
 */
function incoherent(subjectKind, evidenceKinds) {
  const known = SUBJECT_KINDS.map((k) => k.value);
  if (!known.includes(/** @type {any} */ (subjectKind))) {
    return `A duty applies to one of: ${known.join(", ")}.`;
  }
  const kinds = Array.isArray(evidenceKinds) ? evidenceKinds : [];
  const wrong = kinds.filter((k) => subjectOf(k) !== subjectKind);
  if (wrong.length === 0) {
    return null;
  }
  const fits = evidenceFor(/** @type {any} */ (subjectKind));
  const named = wrong
    .map((k) => {
      const belongs = subjectOf(k);
      return belongs === null ? `"${k}" is not a kind of contact` : `"${k}" is about a ${belongs}`;
    })
    .join(", and ");
  return (
    `${named}, so a duty about each ${subjectKind} could never be satisfied by it. ` +
    `For a ${subjectKind} the evidence is: ${fits.length > 0 ? fits.join(", ") : "nothing yet"}.`
  );
}

/**
 * Propose a duty for the role map.
 *
 * Always lands as `proposed`, never active, whoever is calling. An agent may
 * suggest what the job is; only the user decides it. That boundary lives here
 * rather than in the MCP server, so it cannot be bypassed by a second client.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} args.name
 * @param {string} args.means
 * @param {string} args.source Where it came from, e.g. a book and chapter.
 * @param {import("../domain/contact.js").SubjectKind} args.subjectKind
 * @param {number} args.cadenceDays
 * @param {string[]} [args.evidenceKinds]
 * @param {string[]} [args.relations]
 */
export function proposeDuty(store, { name, means, source, subjectKind, cadenceDays, evidenceKinds, relations }) {
  if (!String(name ?? "").trim() || !String(means ?? "").trim()) {
    return { error: "En föreslagen plikt behöver ett namn och en enkel beskrivning av vad den innebär." };
  }
  if (!(Number(cadenceDays) > 0)) {
    return { error: "En föreslagen plikt behöver en positiv takt i dagar." };
  }
  if (relations && relations.some((r) => !isRelation(r))) {
    return { error: `Unknown relationship type. Valid: ${Object.keys(RELATIONS).join(", ")}.` };
  }

  // Not coerced to person-or-project any more. Silently turning an unrecognised
  // value into "person" is how a duty ends up applying to every colleague while
  // consuming evidence that can never be about one.
  const applies = String(subjectKind ?? "person");
  const why = incoherent(applies, evidenceKinds);
  if (why !== null) {
    return { error: why };
  }

  const id = store.create("duties", {
    name: String(name).trim(),
    means: String(means).trim(),
    source: source ?? "proposed",
    subjectKind: applies,
    cadenceDays: Number(cadenceDays),
    evidenceKinds: evidenceKinds ?? [],
    relations: relations ?? [],
    guarded: false,
    // Absent would already read as "keeps applying"; written out so the row says
    // what it means rather than relying on a default two files away.
    keepWhileLeaving: true,
    status: "proposed"
  });
  return { id, proposed: name, note: "Bara föreslagen. Den gör ingenting förrän du accepterar den i appen." };
}

/**
 * Change a duty's cadence, guarding, or wording.
 *
 * App only, like `decideDuty`: this is the role map, and the role map is his.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} id
 * @param {Record<string, any>} fields
 */
export function updateDuty(store, id, fields) {
  const row = store.rows("duties").find((d) => d.id === id);
  if (!row) {
    return { error: `No duty with id "${id}".` };
  }
  if (fields.cadenceDays !== undefined && !(Number(fields.cadenceDays) > 0)) {
    return { error: "En takt måste vara ett positivt antal dagar." };
  }
  if (fields.relations && fields.relations.some((/** @type {string} */ r) => !isRelation(r))) {
    return { error: `Unknown relationship type. Valid: ${Object.keys(RELATIONS).join(", ")}.` };
  }

  // Checked against the row as it WILL be, not against the fields given. An edit
  // that only changes the subject has to be judged against the evidence already
  // stored, and vice versa - otherwise each half passes on its own and the two
  // together leave a duty nothing can satisfy. That is how this row got broken:
  // a form rewrote the subject alone, and nothing looked at the pair.
  const merged = { ...row, ...fields };
  const why = incoherent(String(merged.subjectKind ?? "person"), merged.evidenceKinds);
  if (why !== null) {
    return { error: why };
  }

  store.update("duties", id, fields);
  return { id, updated: Object.keys(fields) };
}

/**
 * Remove a row. Tombstoned, so the history stays readable and nothing an agent
 * or a note already referenced dangles.
 *
 * Tombstoned is not the same as recoverable, and one collection made the
 * difference matter. The events survive, but every read path filters `_deleted`,
 * so from the outside - the window, `tend_growth`, a prep card - the row is
 * simply gone. For most rows that is what "remove" is supposed to mean. For a
 * growth thread that has ended with a reason on it, it destroyed the one thing
 * the feature exists to hand back.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} collection
 * @param {string} id
 */
export function removeRow(store, collection, id) {
  // touches, stakes and topics were missing, which left three Remove buttons in
  // the window doing nothing but showing an error - and no way at all to undo a
  // contact logged against the wrong person, which is worse than not logging it:
  // a wrong entry moves a clock and then looks exactly like a real one.
  const removable = [
    "people",
    "projects",
    "workstreams",
    "duties",
    "promises",
    "evidence",
    "touches",
    "stakes",
    "topics",
    "raised",
    "skips",
    "entries",
    "growth",
    "growthNotes",
    "waiting",
    "chases",
    "reviews",
    "moments",
    "reflections"
  ];
  if (!removable.includes(collection)) {
    return { error: `Rows in "${collection}" are not removable. Removable: ${removable.join(", ")}.` };
  }
  const row = store.rows(collection).find((r) => r.id === id);
  if (!row) {
    return { error: `No ${collection} row with id "${id}".` };
  }
  // An ended growth thread is the record, not the leftovers of one. Refused
  // here rather than by hiding a button, because the window is one of two
  // clients and a rule that lives in a button is a rule MCP does not have.
  if (collection === "growth" && isKeptRecord(/** @type {any} */ (row))) {
    return {
      error:
        "Det spåret är avslutat och skälet är själva posten. Att ta bort det skulle radera varför " +
        "riktningen släpptes, vilket är svaret på varför den inte diskuteras längre. Skriv om " +
        "riktningen om den är fel; ett spår går bara att ta bort innan det fått ett avslut."
    };
  }
  store.remove(collection, id);
  // A touch has neither a name nor a text, so say what it actually was.
  const what =
    row.name ?? row.text ?? (row.kind ? `${row.kind}${row.note ? ` - ${row.note}` : ""}` : id);
  return { removed: what };
}

/**
 * Accept or decline a proposed duty.
 *
 * Deliberately not exposed over MCP: this is the app's job, because it is where
 * the user decides what the role is.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} id
 * @param {"active" | "declined"} status
 * @param {object} [overrides] Cadence or guarding he adjusted while accepting.
 */
export function decideDuty(store, id, status, overrides = {}) {
  const row = store.rows("duties").find((d) => d.id === id);
  if (!row) {
    return { error: `No duty with id "${id}".` };
  }
  store.update("duties", id, { ...overrides, status });
  return { id, status };
}

/* ------------------------------------------------- one person's cadence -- */

/**
 * Which duty this override is allowed to be about.
 *
 * The same refusal this file already makes for an incoherent duty, one level
 * down. An override on a duty that does not reach this person at all is not a
 * quieter setting, it is a row that changes nothing and reads as though it did -
 * so somebody sets a peer's interval on a duty that only applies to reports,
 * sees it saved, and believes the clock moved.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} dutyId
 * @param {Record<string, any>} person
 * @returns {{ ok: true, duty: any } | { ok: false, error: string }}
 */
function dutyOnPerson(store, dutyId, person) {
  const duty = store.rows("duties").find((d) => String(d.id) === String(dutyId));
  if (!duty) {
    return { ok: false, error: `No duty with id "${dutyId}".` };
  }
  if (duty.subjectKind !== "person") {
    return {
      ok: false,
      error: `"${duty.name}" handlar inte om personer, så ett intervall per person betyder ingenting där.`
    };
  }
  const relations = Array.isArray(duty.relations) ? duty.relations : [];
  if (relations.length > 0 && !relations.includes(String(person.relation))) {
    return {
      ok: false,
      error:
        `"${duty.name}" gäller inte ${person.name} - den plikten korsar bara ` +
        `${relations.join(", ")}, och ${person.name} är ${String(person.relation)}. ` +
        "Ett intervall där hade sparats och inte flyttat någon klocka."
    };
  }
  return { ok: true, duty };
}

/**
 * Set how often one duty runs for one person, or switch its clock off.
 *
 * Deliberately not exposed over MCP, the same boundary as accepting a duty and
 * for the same reason: how often something is owed is what the job IS, and an
 * agent that could set it per person could quietly rewrite what the user
 * believes the role map says. A test asserts the tool name does not exist.
 *
 * The reason is required only when the clock is being switched off. A number
 * says what it means; an absence does not, and six months later the row cannot
 * say whether it was deliberate. See `domain/overrides.js`.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} args.person Name or id.
 * @param {string} args.duty Duty id.
 * @param {number | null} [args.cadenceDays] Days, or null for no clock at all.
 * @param {string} [args.why] Required when switching the clock off.
 */
export function setPersonCadence(store, { person: who, duty: dutyId, cadenceDays, why }) {
  const found = resolvePerson(store, who);
  if (!found.ok) {
    return { error: found.error };
  }
  const on = dutyOnPerson(store, dutyId, found.person);
  if (!on.ok) {
    return { error: on.error };
  }

  /*
   * Only an explicit absence switches the clock off. "0 dagar", a negative and
   * a typo are all refused rather than read as one - muting a duty on a
   * mistyped field is exactly the outcome this feature exists to make
   * deliberate, and it would be indistinguishable from a decision afterwards.
   */
  const muting = cadenceDays === null || cadenceDays === undefined;
  const days = Number(cadenceDays);

  if (!muting && !(days > 0)) {
    return {
      error:
        `"${String(cadenceDays)}" är inget intervall. Ett antal dagar större än noll, eller ` +
        "inget alls om klockan ska stängas av."
    };
  }
  if (muting && String(why ?? "").trim() === "") {
    return {
      error:
        "Säg varför klockan stängs av. Ett intervall säger vad det betyder; en avstängd klocka " +
        "gör det inte, och om ett halvår går det inte att se om det var ett beslut eller ett misstag."
    };
  }

  const existing = overrideFor(store.rows("cadenceOverrides"), String(found.person.id), String(on.duty.id));
  const fields = {
    person: String(found.person.id),
    duty: String(on.duty.id),
    cadenceDays: muting ? null : days,
    why: String(why ?? "").trim() || null
  };

  if (existing === null) {
    store.create("cadenceOverrides", fields);
  } else {
    store.update("cadenceOverrides", String(existing.id), fields);
  }

  return {
    person: found.person.name,
    duty: on.duty.name,
    every: muting ? null : days,
    was: intervalFor(existing, Number(on.duty.cadenceDays)),
    muted: muting
  };
}

/**
 * Put one person's duty back on the duty's own interval.
 *
 * Removing the row rather than writing the duty's current number into it. A
 * copied interval is an interval that stops following the duty, so changing the
 * duty later would move everybody except the person somebody once "reset".
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} args.person Name or id.
 * @param {string} args.duty Duty id.
 */
export function clearPersonCadence(store, { person: who, duty: dutyId }) {
  const found = resolvePerson(store, who);
  if (!found.ok) {
    return { error: found.error };
  }
  const on = dutyOnPerson(store, dutyId, found.person);
  if (!on.ok) {
    return { error: on.error };
  }

  const existing = overrideFor(store.rows("cadenceOverrides"), String(found.person.id), String(on.duty.id));
  if (existing === null) {
    return {
      person: found.person.name,
      duty: on.duty.name,
      every: Number(on.duty.cadenceDays),
      changed: false
    };
  }

  const wasMuted = isMuted(existing);
  store.remove("cadenceOverrides", String(existing.id));
  return {
    person: found.person.name,
    duty: on.duty.name,
    every: Number(on.duty.cadenceDays),
    wasMuted,
    changed: true
  };
}
