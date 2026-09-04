/**
 * What comes out of Nib, and what has to be filed by hand once it arrives.
 *
 * Two halves of one story. The bindings say which Nib folders feed which people
 * and as what kind of contact, which is how Tend knows whose notes are whose
 * without a naming convention. The commitment queue is what happens when a
 * binding covers several people at once: a flagged block in a shared meeting
 * note is one obligation with no way to tell whose, so it waits here instead of
 * being guessed at or copied onto everybody.
 *
 * Observations sit with them because they arrive the same way - recorded once,
 * read much later - and because the read is the half that was missing.
 *
 * Split out of api.js, which had grown to 3687 lines across fifteen sections.
 * This one was measured as the cleanest to lift: no calls into any other
 * section, and everything it needs from outside is a domain helper. api.js
 * re-exports all of it, so nothing that imports the service surface changed.
 */

import { boundPeople, isShared, sourceName } from "../domain/sources.js";
import { daysSince, humanDays } from "../domain/time.js";
import { resolvePerson } from "./resolve.js";

/**
 * Bind a Nib category or sub-category to a person, as a kind of contact.
 *
 * Better than a naming convention: Nib gets
 * organised however suits and the mapping lives here, so changing his
 * mind means editing one binding rather than rewriting notes.
 *
 * The binding says WHO, and nothing else. What a note counts AS comes from its
 * tags, mapped by `setSourceRules`.
 *
 * There was a folder-level kind here and it was removed. A folder is one person,
 * not one kind: everything about somebody lives in it, so a folder-wide "these
 * are 1-1s" made a note about something you merely heard reset the clock on
 * having spoken to them. An untagged note now counts as nothing, which shows up
 * as a cadence that has not advanced - an alert you can answer, rather than a
 * reassurance you cannot check.
 *
 * A folder may name several people, and then it is not a person's folder at all
 * but a standing meeting's. See `boundPeople`, and note that the two halves of
 * an import behave differently under it: contact fans out to everybody there,
 * and commitments deliberately do not.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} [args.person] One person. Legacy and still the ordinary case.
 * @param {string[]} [args.people] Everybody the folder covers.
 * @param {string} [args.name] His own name for the binding, when the folder path is not it.
 * @param {string} args.categoryId Nib category id.
 * @param {string} [args.subId] Nib sub-category id. Omit for the whole category.
 * @param {string} [args.label] Human-readable name of the Nib folder, for the UI.
 */
export function bindSource(store, { person: who, people: whom, name, categoryId, subId, label }) {
  /*
   * One name or several, resolved the same way. `person` stays accepted because
   * it is what every existing caller and every MCP script passes, and because
   * one person is still the ordinary case - a folder of notes about somebody.
   */
  const asked = Array.isArray(whom) && whom.length > 0 ? whom : who ? [who] : [];
  if (asked.length === 0) {
    return { error: "En bindning behöver minst en person." };
  }

  /** @type {string[]} */
  const ids = [];
  for (const one of asked) {
    const found = resolvePerson(store, one);
    if (!found.ok) {
      return { error: found.error };
    }
    // Named twice is not an error worth stopping for, but it must not become
    // two rows of contact from one note.
    if (!ids.includes(found.person.id)) {
      ids.push(found.person.id);
    }
  }

  if (!String(categoryId ?? "").trim()) {
    return { error: "En bindning behöver ett Nib-kategori-id." };
  }

  /*
   * A sub-folder is one binding wherever it sits.
   *
   * Matched on `subId` alone when there is one, because that id follows the
   * folder when it is dragged to another category - so comparing both ids would
   * let a moved folder be bound a second time, and the person would then be
   * counted twice from one set of notes.
   */
  const clash = store
    .rows("sources")
    .find((s) =>
      subId ? (s.subId ?? null) === subId : s.categoryId === categoryId && (s.subId ?? null) === null
    );
  if (clash) {
    const names = new Map(store.rows("people").map((p) => [String(p.id), String(p.name)]));
    const already = boundPeople(clash)
      .map((p) => names.get(p) ?? "någon")
      .join(", ");
    return {
      error: `Den Nib-mappen är redan bunden till ${
        already === "" ? "någon" : already
      }. Lossa den först.`
    };
  }

  const names = new Map(store.rows("people").map((p) => [String(p.id), String(p.name)]));
  const id = store.create("sources", {
    people: ids,
    // His own name for the binding, which is not the folder's path. See
    // `sourceName`. Empty rather than absent so the field is always the same
    // shape, and the reader falls back to the path.
    name: String(name ?? "").trim(),
    categoryId,
    subId: subId ?? null,
    label: label ?? null,
    rules: []
  });
  return { id, bound: `${label ?? categoryId} → ${ids.map((p) => names.get(p) ?? p).join(", ")}` };
}

/**
 * Map Nib's tags onto contact kinds, for one binding.
 *
 * Stored on the binding rather than in Nib, and keyed on the tag's ID rather
 * than its name. Both halves matter. In Nib a tag is just a tag - what it MEANS
 * for a cadence is Tend's opinion, and putting that opinion in the other app
 * would make Nib a satellite of this one. And on the id, because a tag renamed
 * in Nib must go on counting; matching on the word is a naming convention with
 * extra steps, which is the thing this design refused from the start.
 *
 * Replaces the whole list rather than merging: a mapping screen where removing a
 * row needs a different call than adding one is a screen that gets one of the
 * two wrong.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} args.id Binding id.
 * @param {{ tagId: string, kind: string }[]} args.rules
 */
export function setSourceRules(store, { id, rules }) {
  const binding = store.rows("sources").find((s) => s.id === id);
  if (!binding) {
    return { error: `No binding with id "${id}".` };
  }
  if (!Array.isArray(rules)) {
    return { error: "Rules must be a list of { tagId, kind }." };
  }

  /** @type {{ tagId: string, kind: string }[]} */
  const clean = [];
  for (const rule of rules) {
    const tagId = String(rule?.tagId ?? "").trim();
    const kind = String(rule?.kind ?? "").trim();
    if (tagId === "" || kind === "") {
      continue;
    }
    // One kind per tag. Two rules for the same tag would write two contacts
    // from one note and quietly satisfy a cadence twice.
    if (!clean.some((existing) => existing.tagId === tagId)) {
      clean.push({ tagId, kind });
    }
  }

  store.update("sources", id, { rules: clean });
  return { id, rules: clean.length };
}

/**
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} [person]
 */
export function sources(store, person) {
  const names = new Map(store.rows("people").map((p) => [String(p.id), String(p.name)]));
  let rows = store.rows("sources");
  if (person) {
    const found = resolvePerson(store, person);
    if (!found.ok) {
      return { error: found.error };
    }
    rows = rows.filter((s) => boundPeople(s).includes(found.person.id));
  }
  return rows.map((s) => ({
    id: s.id,
    // The list, and a rendered version of it. Both, because every caller wants
    // the sentence and one - the assign screen - needs the ids.
    people: boundPeople(s).map((p) => ({ id: p, name: names.get(p) ?? "unknown" })),
    person: boundPeople(s)
      .map((p) => names.get(p) ?? "unknown")
      .join(", "),
    name: sourceName(s),
    shared: isShared(s),
    nibFolder: s.label ?? s.categoryId,
    categoryId: s.categoryId,
    subId: s.subId,
    rules: Array.isArray(s.rules) ? s.rules : [],
    // Derived rather than stored: there is no folder-level kind any more, so
    // what a folder counts as IS the list of rules on it.
    countsAs: (Array.isArray(s.rules) ? s.rules : []).map((/** @type {any} */ r) => r.kind).join(", ")
  }));
}

/**
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} id
 */
export function unbindSource(store, id) {
  const row = store.rows("sources").find((s) => s.id === id);
  if (!row) {
    return { error: `No binding with id "${id}".` };
  }
  store.remove("sources", id);
  return { id, unbound: true };
}

/**
 * Observations, read back.
 *
 * ## The gap this closes
 *
 * There was a way to file review material and no way to get it back. An agent
 * could add an observation about somebody and never see one, and the only read
 * anywhere was the list on a person's page in the app - so "what have I
 * actually got on this person before their review" was a question the tool
 * could not answer to anything but a human reading a screen.
 *
 * That is the wrong shape for the one feature whose whole value is being
 * complete six months later. Material you can write and not read is material
 * you cannot check, and unread material is indistinguishable from none.
 *
 * ## Grouped by area rather than listed flat
 *
 * `area` is what makes this more than a pile: it maps an observation onto the
 * axis a review is actually held against. A flat list by date answers "what
 * happened lately", which is the question the record already skews towards. By
 * area it answers the harder one - which axes have nothing under them at all.
 *
 * Observations with no area are their own group rather than being dropped or
 * silently filed somewhere. Most of them have none, and a read that hid the
 * majority of the record would be worse than no read.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} [args]
 * @param {string} [args.person] Name or id. Omitted returns everybody's.
 * @param {string} [args.area] One axis, when only that one is wanted.
 */
export function observations(store, { person, area } = {}) {
  const names = new Map(store.rows("people").map((p) => [String(p.id), String(p.name)]));

  let personId = null;
  if (person) {
    const found = resolvePerson(store, person);
    if (!found.ok) {
      return { error: found.error };
    }
    personId = found.person.id;
  }

  const wanted = String(area ?? "").trim();
  const rows = store
    .rows("evidence")
    .filter((e) => (personId === null ? true : String(e.person ?? "") === personId))
    .filter((e) => (wanted === "" ? true : String(e.area ?? "") === wanted))
    .sort((a, b) => Number(b.at ?? 0) - Number(a.at ?? 0));

  /** @type {Map<string, any>} */
  const byArea = new Map();
  for (const row of rows) {
    const key = String(row.area ?? "").trim() || "(no area)";
    const group = byArea.get(key) ?? { area: key, items: [] };
    group.items.push({
      id: String(row.id),
      // The name, because an observation about nobody is an observation about
      // his own work, and the difference is the whole reason `person` is
      // optional on the way in.
      person: row.person ? (names.get(String(row.person)) ?? "unknown") : null,
      text: String(row.text ?? ""),
      at: Number(row.at ?? 0)
    });
    byArea.set(key, group);
  }

  return { areas: [...byArea.values()], count: rows.length };
}

/**
 * Commitments read out of a shared meeting note that nobody has been named for
 * yet.
 *
 * Grouped by the note they came from, because that is the unit he answers them
 * in: he reads one meeting's flagged blocks knowing what the meeting was, and a
 * flat list mixed across weeks makes him reconstruct that for every row.
 *
 * @param {import("../storage/store.js").TendStore} store
 */
export function pendingCommitments(store) {
  const names = new Map(store.rows("people").map((p) => [String(p.id), String(p.name)]));
  const bindings = new Map(store.rows("sources").map((s) => [String(s.id), s]));

  /** @type {Map<string, any>} */
  const byNote = new Map();
  for (const row of store.rows("pendingPromises")) {
    const note = String(row.note ?? "").trim() || "An untitled note";
    const binding = bindings.get(String(row.source));
    const key = `${String(row.source)}|${note}`;
    const group = byNote.get(key) ?? {
      // The same key the daily page builds its card around, so a button there
      // can name the group it belongs to without either side re-deriving it.
      key,
      note,
      // The binding may have been unbound since. The commitments it produced are
      // still real, so they are listed with whoever the row itself recorded
      // rather than disappearing with the folder.
      meeting: binding ? sourceName(binding) : note,
      items: []
    };
    group.items.push({
      id: String(row.id),
      text: String(row.text ?? ""),
      madeAt: Number(row.madeAt ?? 0),
      candidates: (Array.isArray(row.candidates) ? row.candidates : []).map((/** @type {any} */ p) => ({
        id: String(p),
        name: names.get(String(p)) ?? "unknown"
      }))
    });
    byNote.set(key, group);
  }

  const groups = [...byNote.values()].map((g) => ({
    ...g,
    items: g.items.sort((/** @type {any} */ a, /** @type {any} */ b) => a.madeAt - b.madeAt)
  }));
  // Oldest meeting first: the one most likely to have been forgotten is the one
  // worth answering first.
  groups.sort((a, b) => (a.items[0]?.madeAt ?? 0) - (b.items[0]?.madeAt ?? 0));

  return { groups, count: groups.reduce((n, g) => n + g.items.length, 0) };
}

/**
 * File one queued commitment against the person who owes it.
 *
 * The promise takes the pending row's id, which is what keeps the import
 * idempotent across the handover: the next pass looks for exactly that id in
 * `promises`, finds it, and writes nothing. Deleting the promise later is
 * likewise permanent, because the id stays taken in both collections.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} args.id
 * @param {string} args.person Name or id.
 * @param {number} [args.due]
 */
export function assignCommitment(store, { id, person, due }) {
  const row = store.rows("pendingPromises").find((p) => String(p.id) === String(id));
  if (!row) {
    return { error: `No commitment waiting with id "${id}".` };
  }
  const found = resolvePerson(store, person);
  if (!found.ok) {
    return { error: found.error };
  }

  store.create("promises", {
    id: String(row.id),
    person: found.person.id,
    text: String(row.text ?? ""),
    madeAt: Number(row.madeAt ?? Date.now()),
    due: typeof due === "number" ? due : null,
    state: "open",
    from: "nib"
  });
  store.remove("pendingPromises", String(row.id));

  return { id: String(row.id), assigned: `Löfte till ${found.person.name}: ${row.text}` };
}

/**
 * File one queued commitment as his own work.
 *
 * The third answer, and the one that was missing. A task he was handed in a
 * meeting is not a promise: nobody is waiting for it, so it has no person and
 * belongs on his own page rather than on somebody else's card.
 *
 * Takes the pending row's id, exactly as `assignCommitment` does, which is
 * what keeps the import idempotent - the next pass finds the id already taken
 * and writes nothing. Filing the same row as his own and as a promise is
 * therefore impossible, which is correct: it is one or the other.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} id
 * @param {number} [now]
 */
export function keepCommitment(store, id, now = Date.now()) {
  const row = store.rows("pendingPromises").find((p) => String(p.id) === String(id));
  if (!row) {
    return { error: `No commitment waiting with id "${id}".` };
  }

  store.create("myActions", {
    id: String(row.id),
    text: String(row.text ?? ""),
    /*
     * When it was agreed, not when it was filed. The pending row already knows
     * - it came off a dated note - and using the filing time instead would
     * make everything he files today look like it started today, which is the
     * ageing that the promise rows were careful about for the same reason.
     */
    at: Number(row.madeAt ?? now),
    /* Where it came from, so a row can be traced back to the meeting. */
    note: String(row.note ?? ""),
    noteTitle: String(row.noteTitle ?? ""),
    state: "open",
    from: "nib"
  });
  store.remove("pendingPromises", String(row.id));

  return { id: String(row.id), kept: String(row.text ?? "") };
}

/**
 * How long an action point may sit before the list says so.
 *
 * Not a new judgement: it is the sort order's own reasoning above, which says
 * the one from three weeks ago is the one worth seeing. The number was already
 * implied by the ordering; this only makes it visible on the card, so the
 * three-week-old one is marked rather than merely first.
 */
export const ACTION_STALE_DAYS = 21;

/**
 * His own action points, oldest first.
 *
 * Oldest first because this is a list to work through rather than a feed. The
 * one from three weeks ago is the one worth seeing, and newest-first would put
 * it under whatever he filed this morning.
 *
 * `age` and `stale` are here rather than in the view because the view is not
 * the only client, and because a threshold in a template is a threshold nobody
 * can test. Added beside `at` rather than instead of it.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {number} [now]
 */
export function myActions(store, now = Date.now()) {
  return store
    .rows("myActions")
    .filter((r) => !r._deleted && r.state !== "done")
    .sort((a, b) => Number(a.at ?? 0) - Number(b.at ?? 0))
    .map((r) => {
      const days = daysSince(Number(r.at ?? 0), now) ?? 0;
      return {
        id: String(r.id),
        text: String(r.text ?? ""),
        at: Number(r.at ?? 0),
        noteTitle: String(r.noteTitle ?? ""),
        days,
        age: humanDays(days),
        stale: days >= ACTION_STALE_DAYS
      };
    });
}

/**
 * Mark one of his own action points done.
 *
 * `state` rather than removal, so the log keeps what he actually got through.
 * The same reasoning as resolving a promise: the record of having done it is
 * worth more than the tidiness of the list.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} id
 * @param {number} [now]
 */
export function finishMyAction(store, id, now = Date.now()) {
  const row = store.rows("myActions").find((r) => String(r.id) === String(id));
  if (!row) {
    return { error: `No action point with id "${id}".` };
  }
  store.update("myActions", String(id), { state: "done", doneAt: now });
  return { id: String(id), done: true };
}

/**
 * Say that a queued commitment is nobody's promise.
 *
 * Not everything somebody flags in a meeting note is an obligation to another
 * person - a reminder to read something, a heading that got flagged by mistake.
 * The row is removed rather than filed, and the id stays taken, so the next
 * import does not offer it again.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} id
 */
export function dropCommitment(store, id) {
  const row = store.rows("pendingPromises").find((p) => String(p.id) === String(id));
  if (!row) {
    return { error: `No commitment waiting with id "${id}".` };
  }
  store.remove("pendingPromises", String(row.id));
  return { id: String(row.id), dropped: true };
}
