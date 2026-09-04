/**
 * Reading Nib.
 *
 * Nib owns the notes; Tend reads them and never writes a byte back. Indexing
 * reads only `index.json`, which carries every note's metadata without any note
 * bodies - so the routine path costs one small file read and never opens a note
 * about a colleague.
 *
 * `noteBody` at the bottom is the single exception and the only function here
 * that reads what you actually wrote. Nothing automatic calls it: it exists for
 * a model call the user asked for by name, and the boundary is worth keeping
 * that sharp, because "Tend read my 1-1 notes" should never be a surprise.
 *
 * Which notes belong to whom is not guessed from names or enforced by a naming
 * convention. A Nib category or sub-category is bound to a person here in Tend,
 * and the binding says what kind of contact notes there count as. Nib gets
 * organised however suits; changing your mind edits one binding instead of
 * rewriting notes.
 *
 * A useful accident of Nib's design: it already models flagged blocks as action
 * points with a done state. Those are promises, already structured by hand,
 * which means the highest-value thing Tend tracks needs no model at all.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { activePractices, openActionPoints } from "../domain/practices.js";
import { boundPeople, isShared } from "../domain/sources.js";
import { isLaterDay, middayOn } from "../domain/time.js";

import { userEnvironment } from "../domain/userenv.js";
import { homedir } from "node:os";

/**
 * Where Nib keeps its data. Mirrors Nib's own resolution: `NIB_DATA_DIR`,
 * otherwise Electron's userData for an app named "nib".
 *
 * @param {object} [opts]
 * @param {Record<string, string | undefined>} [opts.env]
 * @param {NodeJS.Platform} [opts.platform]
 * @param {string} [opts.home]
 * @returns {string}
 */
export function nibDataDir({ env = process.env, platform = process.platform, home = homedir() } = {}) {
  const override = env.NIB_DATA_DIR?.trim();
  if (override) {
    return override;
  }
  const stored = userEnvironment("NIB_DATA_DIR", platform);
  if (stored !== null) {
    return stored;
  }
  if (platform === "win32") {
    return join(env.APPDATA ?? join(home, "AppData", "Roaming"), "nib");
  }
  if (platform === "darwin") {
    return join(home, "Library", "Application Support", "nib");
  }
  return join(env.XDG_CONFIG_HOME ?? join(home, ".config"), "nib");
}

/**
 * Which of Nib's scopes belong to which half of Tend.
 *
 * Nib already marks a category as work, private, or neither, and it did before
 * Tend had two halves - which is why the private half needed no change over
 * there. What was missing was Tend honouring it.
 *
 * ## The leak this closes
 *
 * The Nib reader offered every category to every caller. So a note in a private
 * category, tagged with the principle tag, appeared in the WORK half's knowledge
 * view. Private content surfacing on the work side is the one direction of this
 * boundary that actually costs something, and it needed no mistake to happen -
 * just a tag on a note.
 *
 * The other direction is only wrong rather than costly: work folders offered as
 * bindings for somebody's family, work principles answering a question asked in
 * the private half.
 *
 * ## Why an unmarked category belongs to both
 *
 * The first version of this made unmarked mean work, on the grounds that
 * everything unmarked today is read by the work half. It was wrong in a way that
 * only showed up against a real notebook: the reference material - notes from
 * books about how to behave with people - is unmarked, and it is not
 * work-confidential and not family-private. Scoping it to work would have taken
 * it out of the private half, silently, in the half where the reference material
 * is the whole point of the Knowledge view.
 *
 * The rule for anything about PEOPLE:
 *
 *   Marked private is private. Marked work is work. Unmarked is shared.
 *
 * Nothing he has declared private can appear on the work side, which is the
 * direction that costs something. Nothing he has declared work can appear on the
 * private side. And an unmarked category is one he has not declared anything
 * about, so the tool does not guess on his behalf.
 *
 * ## And the third scope, which is not a half at all
 *
 * That rule was shipped and immediately broke the feature it was least supposed
 * to touch. Against the real notebook, EVERY principle note lives in a
 * privately-marked category - the reading and the practices - so the work half's
 * prep cards lost the practice block entirely and its knowledge view had nothing
 * to search. Twenty-five notes, invisible, with nothing failing anywhere.
 *
 * The mark had been read as answering "which half of my life is this about", and
 * it does not. It answers "is this work". Notes from books, and practices being
 * worked on, are neither work nor family: they are about HIM. Which is a third
 * kind of content, and the reason `reference` exists here.
 *
 * What makes it safe is that the boundary for reference material is the principle
 * TAG rather than the folder. A tagged note is one he deliberately marked as a
 * practice he is working on - a statement about his own behaviour, not a fact
 * about a colleague or about his family - and only tagged notes cross. Everything
 * untagged stays inside its half.
 */
export const SCOPES_IN_HALF = /** @type {const} */ ({
  work: ["", "W"],
  private: ["", "P"],
  /**
   * Every scope, for reads whose boundary is the principle tag instead.
   *
   * Never use this for a folder list, a binding, or contact indexing. Those are
   * about people, and people belong to a half.
   */
  reference: ["", "W", "P"]
});

/**
 * The categories one half may read.
 *
 * @param {any[]} categories
 * @param {string} [half]
 * @returns {any[]}
 */
export function categoriesIn(categories, half = "work") {
  const allowed = /** @type {readonly string[]} */ (
    SCOPES_IN_HALF[/** @type {"work" | "private"} */ (half)] ?? SCOPES_IN_HALF.work
  );
  return categories.filter((c) => allowed.includes(String(c?.scope ?? "")));
}

/**
 * @typedef {object} NibNote
 * @property {string} id
 * @property {string} categoryId
 * @property {string | null} subId
 * @property {string} title
 * @property {number} created
 * @property {number} edited
 * @property {{ id: string, text: string, done: boolean }[]} alerts
 * @property {string} flag
 * @property {string} preview The opening lines, as Nib derives them.
 * @property {string[]} tags Tag ids from Nib's own catalog.
 */

/**
 * @typedef {object} NibFolder
 * @property {string} categoryId
 * @property {string | null} subId
 * @property {string} label Category name, or "Category / Sub".
 * @property {number} notes
 */

/**
 * Read Nib's index, scoped to one half.
 *
 * Returns `available: false` rather than throwing when Nib is not installed or
 * has never been opened - a perfectly normal state that should not stop Tend
 * from working.
 *
 * The scope filter is applied HERE rather than in each caller, which is the whole
 * reason it can be trusted: there is one door into the notebook, and everything
 * downstream - folder lists, note search, principles, indexing - sees only the
 * categories its half may see. A filter applied per caller is a filter somebody
 * adds a caller without.
 *
 * @param {string} [dir]
 * @param {string} [half] Which half is asking. Defaults to work, which is what
 *   every caller was before there were two.
 * @returns {{ available: true, categories: any[], tags?: any[] } | { available: false, why: string }}
 */
export function readNibIndex(dir = nibDataDir(), half = "work") {
  const path = join(dir, "index.json");
  /** @type {string} */
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    const code = /** @type {NodeJS.ErrnoException} */ (err).code;
    if (code === "ENOENT") {
      return { available: false, why: `Ingen Nib-data på ${path}. Öppna Nib en gång, eller sätt NIB_DATA_DIR.` };
    }
    return { available: false, why: `Kunde inte läsa ${path}: ${String(err)}` };
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.categories)) {
      return { available: false, why: `${path} ser inte ut som ett Nib-index.` };
    }
    return {
      available: true,
      categories: categoriesIn(parsed.categories, half),
      tags: parsed.tags
    };
  } catch {
    // Nib writes atomically, so a torn read here is unlikely rather than
    // routine. Still worth not crashing over.
    return { available: false, why: `${path} kunde inte tolkas. Den kan vara mitt i en skrivning; försök igen.` };
  }
}

/**
 * Every folder in Nib that could be bound to a person, with how many notes it
 * holds. This is what the binding UI offers.
 *
 * @param {string} [dir]
 * @param {string} [half]
 * @returns {{ available: false, why: string } | { available: true, folders: NibFolder[], dir: string }}
 */
export function listNibFolders(dir, half = "work") {
  const index = readNibIndex(dir, half);
  if (!index.available) {
    return index;
  }

  /** @type {NibFolder[]} */
  const folders = [];

  for (const category of index.categories) {
    const notes = Array.isArray(category.notes) ? category.notes : [];
    folders.push({
      categoryId: String(category.id),
      subId: null,
      label: String(category.name),
      notes: notes.filter((/** @type {any} */ n) => n.subId === null || n.subId === undefined).length
    });
    for (const sub of category.subs ?? []) {
      folders.push({
        categoryId: String(category.id),
        subId: String(sub.id),
        label: `${category.name} / ${sub.name}`,
        notes: notes.filter((/** @type {any} */ n) => n.subId === sub.id).length
      });
    }
  }

  return { available: true, folders, dir: dir ?? nibDataDir() };
}

/**
 * Every note in the notebook, with where it lives.
 *
 * Metadata only - titles, previews, tags, the folder trail. No bodies: the
 * search narrows on this and only then opens the handful of notes that survive,
 * which keeps "what have I read about this" from meaning "read everything I
 * ever wrote about my colleagues".
 *
 * @param {string} [dir]
 * @param {string} [half]
 * @returns {{ available: false, why: string } | { available: true, dir: string, notes: (NibNote & { trail: string })[] }}
 */
export function allNibNotes(dir, half = "work") {
  const index = readNibIndex(dir, half);
  if (!index.available) {
    return index;
  }

  /** @type {(NibNote & { trail: string })[]} */
  const notes = [];
  for (const category of index.categories) {
    for (const sub of [null, ...(category.subs ?? [])]) {
      const subId = sub === null ? null : String(sub.id);
      const trail = sub === null ? String(category.name) : `${category.name} / ${sub.name}`;
      for (const note of notesIn(index.categories, String(category.id), subId)) {
        notes.push({ ...note, trail });
      }
    }
  }
  return { available: true, dir: dir ?? nibDataDir(), notes };
}

/**
 * Nib's whole tag catalog.
 *
 * Read so the mapping can be built by picking a tag rather than typing an id.
 * The names are Nib's and stay Nib's - Tend shows them and stores the id, so
 * renaming a tag over there changes what this screen says and nothing else.
 *
 * @param {string} [dir]
 * @param {string} [half]
 * @returns {{ available: false, why: string } | { available: true, dir: string, tags: { id: string, name: string, color: string, description: string }[] }}
 */
export function listNibTags(dir, half = "work") {
  const index = readNibIndex(dir, half);
  if (!index.available) {
    return index;
  }
  const raw = /** @type {any} */ (index).tags;
  return {
    available: true,
    dir: dir ?? nibDataDir(),
    tags: (Array.isArray(raw) ? raw : []).map((/** @type {any} */ t) => ({
      id: String(t?.id ?? ""),
      name: String(t?.name ?? ""),
      color: String(t?.color ?? "#9a9da3"),
      description: String(t?.description ?? "")
    })).filter((t) => t.id !== "" && t.name !== "")
  };
}

/**
 * The tags actually used on notes in one folder, with how many carry each.
 *
 * The mapping screen asks what a tag means HERE, and the honest scope of that
 * question is the folder in front of you. Offering the whole catalog made it
 * ask about `Principle` for a folder of conversations with a colleague, which
 * is a question with no sensible answer and five of them in a row.
 *
 * @param {string} categoryId
 * @param {string | null} subId
 * @param {string} [dir]
 * @param {string} [half]
 * @returns {{ available: false, why: string } | { available: true, dir: string, tags: { id: string, name: string, color: string, description: string, notes: number }[] }}
 */
export function tagsInFolder(categoryId, subId, dir, half = "work") {
  const catalog = listNibTags(dir, half);
  if (!catalog.available) {
    return catalog;
  }
  const index = readNibIndex(dir, half);
  if (!index.available) {
    return { available: false, why: index.why };
  }

  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const note of notesIn(index.categories, categoryId, subId ?? null)) {
    for (const id of note.tags) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }

  return {
    available: true,
    dir: catalog.dir,
    tags: catalog.tags
      .filter((tag) => counts.has(tag.id))
      .map((tag) => ({ ...tag, notes: counts.get(tag.id) ?? 0 }))
  };
}

/**
 * Where a binding's folder actually is, now.
 *
 * A binding to a sub-folder is resolved by `subId` ALONE. That id is minted once
 * and travels with the folder when it is dragged to another category, so it is
 * the only part of the address that cannot go stale - and the stored
 * `categoryId` is exactly the part that does. Requiring both to match is what
 * made moving a person in Nib break their indexing in silence: the lookup found
 * nothing, reported "no notes", and the person stopped being counted with no
 * error anywhere.
 *
 * A binding to a whole category still matches on `categoryId`, because there is
 * nothing more specific to match on. A category id is stable too - renaming or
 * reordering a category does not change it.
 *
 * Returns null when the folder is nowhere in the index, which is a different
 * thing from an empty folder and is reported differently.
 *
 * @param {any[]} categories
 * @param {any} binding
 * @returns {{ categoryId: string, subId: string | null, label: string } | null}
 */
export function folderFor(categories, binding) {
  const subId = binding.subId ?? null;
  if (subId === null) {
    const category = categories.find((c) => String(c.id) === String(binding.categoryId));
    return category === undefined
      ? null
      : { categoryId: String(category.id), subId: null, label: String(category.name ?? category.id) };
  }
  for (const category of categories) {
    const sub = (Array.isArray(category.subs) ? category.subs : []).find(
      (/** @type {any} */ s) => String(s.id) === String(subId)
    );
    if (sub !== undefined) {
      return {
        categoryId: String(category.id),
        subId: String(subId),
        label: `${String(category.name ?? category.id)} / ${String(sub.name ?? subId)}`
      };
    }
  }
  return null;
}

/**
 * Notes inside one bound folder.
 *
 * A binding on a whole category deliberately covers only the notes sitting
 * directly in it, not the ones inside its sub-categories. Otherwise binding a
 * category and one of its subs to different people would double-count, and the
 * quieter of the two mistakes is the one that under-reports.
 *
 * @param {any[]} categories
 * @param {string} categoryId
 * @param {string | null} subId
 * @returns {NibNote[]}
 */
export function notesIn(categories, categoryId, subId) {
  const category = categories.find((c) => String(c.id) === categoryId);
  if (!category) {
    return [];
  }
  const notes = Array.isArray(category.notes) ? category.notes : [];
  return notes
    .filter((/** @type {any} */ n) => (subId === null ? !n.subId : n.subId === subId))
    .map((/** @type {any} */ n) => ({
      id: String(n.id),
      categoryId: String(n.categoryId ?? category.id),
      subId: n.subId ?? null,
      title: String(n.title ?? ""),
      created: Number(n.created ?? 0),
      edited: Number(n.edited ?? n.created ?? 0),
      alerts: Array.isArray(n.alerts)
        ? n.alerts.map((/** @type {any} */ a) => ({
            id: String(a.id),
            text: String(a.text ?? ""),
            done: Boolean(a.done)
          }))
        : [],
      flag: String(n.flag ?? ""),
      // The opening lines, which Nib derives on every save. Enough to search on
      // without opening a single note file.
      preview: String(n.preview ?? ""),
      // Ids only. What they MEAN is Tend's business and lives in the binding,
      // never in Nib - the same reason the folder does not carry the person.
      tags: Array.isArray(n.tags) ? n.tags.map((/** @type {any} */ t) => String(t)) : []
    }));
}

/**
 * What kinds of contact one note counts as.
 *
 * Its tags, mapped. Nothing else - there is no default, and an untagged note
 * produces no contact at all.
 *
 * That is the whole model, and the earlier version had a folder-level default
 * underneath it which was wrong in the direction that matters. A folder is one
 * PERSON, not one kind: everything about somebody lives in it, the
 * conversations and what a colleague mentioned and what you watched them do. A
 * default meant an untagged note of any of those counted as whichever kind the
 * folder was set to - so a note about something you HEARD reset the clock on
 * having SPOKEN to them, and the app said the two were in step.
 *
 * Erring the other way costs a cadence that does not advance until a note is
 * tagged, which shows up as an alert you can answer. The app's rule throughout
 * is to flag in doubt and never suppress: a missing nudge is invisible, and an
 * extra one takes a moment to dismiss.
 *
 * A tag with no rule is ignored rather than guessed at. Most of Nib's tags mean
 * nothing here and should.
 *
 * @param {Pick<NibNote, "tags">} note Only the tag ids are read, so a caller
 *   with something note-shaped does not have to build a whole one.
 * @param {any} binding
 * @param {{ tagId: string, kind: string }[]} rules
 * @returns {string[]}
 */
export function kindsFor(note, binding, rules) {
  const mapped = new Set();
  for (const rule of rules) {
    if (note.tags.includes(String(rule.tagId)) && String(rule.kind ?? "") !== "") {
      mapped.add(String(rule.kind));
    }
  }
  return [...mapped];
}

/**
 * When the conversation a note records actually happened.
 *
 * ## The bug this replaces
 *
 * The import dated a contact by when the note was CREATED in Nib. Writing up a
 * 1-1 six days later therefore recorded the conversation six days late, and the
 * effect is not cosmetic: it moves the cadence clock, and the same conversation
 * logged by hand at its real date turns up twice at two different dates. Found
 * against real notes, on a note titled `2026-08-19 1-1` and created on the 25th.
 *
 * ## Why the title outranks the timestamp
 *
 * A note titled with a date is somebody stating when the thing happened. A
 * creation timestamp is when they got round to writing it down. Only one of
 * those is a claim about the conversation, and it is the one he typed.
 *
 * ## And why a future date is refused
 *
 * A note may be created before the meeting it is for - a title dated tomorrow is
 * a plan, not a record. Dating a contact into the future would satisfy the
 * cadence for a conversation that has not happened, and a nudge that fails to
 * appear is invisible. So a later day falls back to the timestamp, which is the
 * direction that can only ever nudge too early.
 *
 * @param {{ title?: string, created?: number }} note
 * @param {number} now
 * @returns {number}
 */
export function contactDate(note, now = Date.now()) {
  const stated = middayOn(String(note.title ?? "").trim().slice(0, 10));
  if (stated !== null && !isLaterDay(stated, now)) {
    return stated;
  }
  return Number(note.created) || now;
}

/**
 * What one derived contact row is a record of, whatever shape its id was
 * written in.
 *
 * ## Why the id had to change
 *
 * It used to be `nib:<note>:<kind>`, because a note belonged to a folder and a
 * folder belonged to one person, so the person was never in question. A folder
 * that names several people breaks that: two attendees of the same meeting
 * would want the same id, the second one would be read as "already written",
 * and exactly one of them would silently get no contact recorded. So the person
 * is in the id now: `nib:<note>:<person>:<kind>`.
 *
 * ## Why the old shape is read rather than rewritten
 *
 * Every id already written is in the old shape, and re-deriving them under the
 * new one would write a second row for every conversation ever imported. Worse,
 * it would resurrect the deliberately deleted: a derived row deleted by hand is
 * a tombstone under the OLD id, and a new id has no tombstone, so every contact
 * he ever threw away would come back on the next sync.
 *
 * An old-shape id does not carry the person, so it is read off the row's own
 * `subject` - which tombstones keep, since the reducer marks rows deleted
 * rather than replacing them.
 *
 * A row whose shape cannot be read at all returns null and is therefore
 * ignored, which risks a duplicate rather than a silent absence. That is the
 * direction to fail in: a duplicate contact is on the page and can be deleted,
 * and a conversation the app quietly decided not to record is invisible.
 *
 * @param {any} row A touch row, live or tombstoned.
 * @returns {{ noteId: string, person: string, kind: string } | null}
 */
export function derivedTouch(row) {
  const id = String(row?.id ?? "");
  if (row?.from !== "nib" || !id.startsWith("nib:")) {
    return null;
  }
  const parts = id.split(":");
  if (parts.length === 4) {
    return { noteId: parts[1], person: parts[2], kind: parts[3] };
  }
  if (parts.length === 3) {
    const subject = String(row?.subject ?? "").trim();
    return subject === "" ? null : { noteId: parts[1], person: subject, kind: parts[2] };
  }
  return null;
}

/**
 * The identity of a derived contact, independent of which id shape wrote it.
 *
 * @param {string} noteId
 * @param {string} person
 * @param {string} kind
 * @returns {string}
 */
export function touchKey(noteId, person, kind) {
  // Encoded rather than joined on a separator. Any character picked as a
  // separator is one somebody can later put in a Nib id or in a tag's kind, and
  // the failure that produces - two different triples sharing one key, so a
  // person's contact reads as already written - is exactly the invisible sort.
  return JSON.stringify([noteId, person, kind]);
}

/**
 * The note and the flagged block one derived commitment came from.
 *
 * A promise this indexer wrote is named `nib:<note>:<alert>`, and neither a Nib
 * note id nor an alert id contains a colon, so the three parts come apart
 * cleanly. A row it did not write returns null and is therefore never touched:
 * a commitment typed in by hand is somebody's own record and is not Nib's to
 * withdraw.
 *
 * @param {any} row A promise row, live or pending.
 * @returns {{ noteId: string, alertId: string } | null}
 */
export function derivedPromise(row) {
  const id = String(row?.id ?? "");
  if (row?.from !== "nib" || !id.startsWith("nib:")) {
    return null;
  }
  const parts = id.split(":");
  return parts.length === 3 ? { noteId: parts[1], alertId: parts[2] } : null;
}

/**
 * Index Nib into Tend: one contact per attendee per note, one commitment per
 * open action point.
 *
 * Idempotent by construction. Every row it writes carries a deterministic id
 * derived from the Nib id, and the reducer leaves an existing row alone on a
 * repeated create - so this can run on a timer, on app start, and by hand,
 * without duplicating anything.
 *
 * It also closes the loop the other way: an action point ticked off in Nib
 * resolves its promise here, so nothing has to be said twice.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} [opts]
 * @param {string} [opts.dir] Nib data directory.
 * @param {boolean} [opts.dry] Report what would change without writing.
 * @returns {{ error: string } | {
 *   contacts: number, promises: number, waiting: number, dropped: number,
 *   resolved: number, retracted: number, withdrawn: number, moves: number,
 *   bindings: number,
 *   skipped: string[]
 * }}
 */
export function indexNib(store, { dir, dry = false } = {}) {
  // The store's own half. A binding made before the boundary existed, or one
  // pointing across it, resolves to no such folder and is skipped with a reason -
  // which is the right outcome: importing private notes as work contact is the
  // failure this boundary exists to prevent.
  const index = readNibIndex(dir, store.half ?? "work");
  if (!index.available) {
    return { error: index.why };
  }

  /*
   * Which tag means "this is a principle I am practising".
   *
   * Resolved once for the pass, from the catalog `readNibIndex` already returns -
   * the catalog is not filtered by half, so this is the same tag the prep card
   * resolves for itself.
   */
  const practiceTag = principleTagId(index.tags);

  const bindings = store.rows("sources");
  if (bindings.length === 0) {
    return {
      error:
        "No Nib folders are bound to anyone yet, so there is nothing to index. " +
        "Bind a category or sub-category to a person first."
    };
  }

  /*
   * Taken ids rather than live rows, for both.
   *
   * A row this indexer derives is named after the note it came from, so a
   * deleted one is a deliberate "not this one" and must stay deleted. Asked
   * against live rows, a deleted import looked absent, got written again, and was
   * counted as imported - the tombstone survived the replayed create, so nothing
   * reappeared and the count was simply untrue. See `takenIds`.
   */
  const takenPromises = store.takenIds("promises");
  const takenPending = store.takenIds("pendingPromises");
  const promiseRows = new Map(store.rows("promises").map((p) => [String(p.id), p]));
  const pendingRows = new Map(store.rows("pendingPromises").map((p) => [String(p.id), p]));

  /*
   * Contact is recognised by what it RECORDS, not by the id that recorded it.
   *
   * The id gained the person when a folder was allowed to name several people,
   * and every row written before that is in the old shape. Comparing ids would
   * therefore re-derive the entire history under new ids - including the rows
   * he deleted on purpose, whose tombstones are filed under the old ones. See
   * `derivedTouch`.
   */
  const takenTouchKeys = new Set();
  for (const row of store.takenRows("touches")) {
    const made = derivedTouch(row);
    if (made !== null) {
      takenTouchKeys.add(touchKey(made.noteId, made.person, made.kind));
    }
  }

  /*
   * Every contact this index has ever derived, by the note it came from.
   *
   * Needed because a tag can be TAKEN OFF a note, and until now nothing noticed.
   * A note tagged 1-1 by mistake, indexed, then re-tagged Casual left both rows
   * behind - and the stale one went on satisfying the 1-1 cadence for ever. That
   * is the one direction this app must never fail in: a nudge that does not
   * appear is invisible, so a wrong tag was quietly worse than no tag at all.
   *
   * Only rows this indexer wrote are collected. A contact logged by hand is
   * somebody's own record of a conversation and is not Nib's to retract.
   */
  const derivedByNote = new Map();
  for (const touch of store.rows("touches")) {
    const made = derivedTouch(touch);
    if (made === null) {
      continue;
    }
    const list = derivedByNote.get(made.noteId) ?? [];
    list.push({ id: String(touch.id), kind: made.kind });
    derivedByNote.set(made.noteId, list);
  }

  /*
   * Every commitment this index derived that is still outstanding, by note.
   *
   * Needed for the same reason the contact map above is, and it was missing.
   * A flagged block can be UNFLAGGED, and until now nothing noticed: the
   * promise stayed, aged, and went critical. Found against a real note - two
   * sentences from a career story, flagged as part of its structure, imported,
   * unflagged weeks later, and still sitting at the top of the promise list as
   * the two loudest things in it.
   *
   * That list is the shortest and most trusted thing in the app, so a permanent
   * false entry in it is worse than a missing one. The asymmetry was documented
   * for contact and never applied here.
   *
   * Only OPEN ones. A promise already resolved is a thing that happened, and
   * unflagging the note it came from does not un-happen it.
   */
  const openByNote = new Map();
  for (const collection of /** @type {const} */ (["promises", "pendingPromises"])) {
    for (const row of store.rows(collection)) {
      // A queued commitment has no state field and is open by definition; a
      // filed one carries its own.
      if (String(row.state ?? "open") !== "open") {
        continue;
      }
      const made = derivedPromise(row);
      if (made === null) {
        continue;
      }
      const list = openByNote.get(made.noteId) ?? [];
      // The collection is carried rather than inferred from the row's shape.
      // It is known here, at the read, and guessing it later from which fields
      // happen to be present is how a write lands in the wrong table.
      list.push({ id: String(row.id), alertId: made.alertId, collection });
      openByNote.set(made.noteId, list);
    }
  }

  let contacts = 0;
  let promises = 0;
  let waiting = 0;
  let dropped = 0;
  let withdrawn = 0;
  let resolved = 0;
  let retracted = 0;
  let moves = 0;
  /** @type {string[]} */
  const skipped = [];

  for (const binding of bindings) {
    /*
     * Nobody named is not the same as nobody bound. A binding whose people were
     * all removed - or one written by a future version this one does not
     * understand - would otherwise import contact with an empty subject, which
     * shows up as a row belonging to no one on nobody's page.
     */
    const people = boundPeople(binding);
    if (people.length === 0) {
      skipped.push(`${binding.label ?? binding.categoryId}: ingen är namngiven på den här bindningen`);
      continue;
    }
    const shared = isShared(binding);

    /*
     * The folder is found by its own id, wherever it has been moved to, and the
     * binding is corrected to match. Without the correction the app would go on
     * showing the old path in the bind list - right data, wrong label, which is
     * the kind of small lie that makes someone re-bind by hand.
     */
    const folder = folderFor(index.categories, binding);
    if (folder === null) {
      skipped.push(
        `${binding.label ?? binding.categoryId}: ingen sådan mapp i Nib längre - ` +
          `den togs bort, eller det här är inte den anteckningsbok den bands i`
      );
      continue;
    }
    if (
      !dry &&
      (String(binding.categoryId) !== folder.categoryId || binding.label !== folder.label)
    ) {
      moves += 1;
      store.update("sources", String(binding.id), {
        categoryId: folder.categoryId,
        label: folder.label
      });
    } else if (dry && String(binding.categoryId) !== folder.categoryId) {
      moves += 1;
    }

    const notes = notesIn(index.categories, folder.categoryId, folder.subId);
    if (notes.length === 0) {
      skipped.push(`${folder.label}: inga anteckningar`);
      continue;
    }

    const rules = Array.isArray(binding.rules) ? binding.rules : [];

    for (const note of notes) {
      // A note is evidence that contact happened, dated by the day its title
      // states and only otherwise by when it was written. See `contactDate`.
      const happenedAt = contactDate(note, Date.now());

      //
      // One touch per KIND, not one per note. A note tagged both 1-1 and
      // Feedback is honestly both, and satisfies both cadences; the id carries
      // the kind so the two never collide and a re-run still writes nothing new.
      const kinds = kindsFor(note, binding, rules);

      /*
       * What this note's flags are, and what they are not.
       *
       * A flag on a note tagged Principle is not a commitment. It is a habit
       * being worked on - "listen longer than it is comfortable" - and it has no
       * done state and no date it is late by. Imported as a promise it aged,
       * went critical, and sat at the top of the one list in this app that must
       * not lie, asking him who he owed a thing nobody had promised.
       *
       * Those flags are not dropped: `principlesInNib` reads them straight from
       * Nib for the prep card, oldest first, where a principle about how to talk
       * to people is actually usable and where nothing puts a clock on it. This
       * only stops them becoming obligations.
       *
       * ONE definition, used by both the withdrawal below and the creation
       * further down, which is the point. Skipping creation alone would leave
       * every promise already imported from a principle note sitting there for
       * ever; skipping withdrawal alone would retract and re-create them on every
       * pass. Taken together, the withdrawal loop retracts what earlier passes
       * wrote - and `retracted` rather than `resolved`, because a tag being
       * applied is not evidence that anything got done.
       */
      const practising = practiceTag !== null && note.tags.includes(practiceTag);
      const commitments = practising ? [] : note.alerts;

      /*
       * A kind this note no longer claims is withdrawn.
       *
       * Scoped to the notes actually read on this pass, so a folder that came
       * back empty - Nib closed mid-sync, or the wrong data directory - can
       * never be read as "every conversation in here was a mistake". Deleting
       * derived rows on the strength of an absent file is how a fix like this
       * becomes the worst bug in the app.
       *
       * Keyed on the KIND alone, deliberately, even though a row now also names
       * a person. Withdrawing rows whose person has left the binding would mean
       * that dropping somebody from a meeting deletes the record of every
       * conversation they were actually in. A tag coming off a note is somebody
       * correcting what the note was; an attendee list changing is somebody
       * saying who comes from now on, and it is not a claim about the past.
       */
      for (const stale of derivedByNote.get(String(note.id)) ?? []) {
        if (kinds.includes(stale.kind)) {
          continue;
        }
        retracted += 1;
        if (!dry) {
          store.remove("touches", stale.id);
        }
      }

      /*
       * A commitment the note no longer flags is withdrawn, for the same reason
       * and behind the same guard: only notes actually read on this pass.
       *
       * Marked `retracted` rather than removed, which is where this deliberately
       * differs from the contact above. A wrongly withdrawn contact costs a
       * nudge; a wrongly withdrawn promise hides a real obligation from the one
       * list in the app that must not lie. Keeping the row in `rows()` means a
       * mistake here is inspectable without reading the event log, and the state
       * says what happened - `resolved` would claim it was done, which unflagging
       * a note is no evidence of at all.
       */
      const flagged = new Set(commitments.map((a) => String(a.id)));
      for (const stale of openByNote.get(String(note.id)) ?? []) {
        if (flagged.has(stale.alertId)) {
          continue;
        }
        withdrawn += 1;
        if (!dry) {
          if (stale.collection === "promises") {
            store.update("promises", stale.id, { state: "retracted" });
          } else {
            // A queued one has nowhere to show a state, so it goes. Its id stays
            // taken, which is what keeps it from being offered again.
            store.remove("pendingPromises", stale.id);
          }
        }
      }

      /*
       * One row per attendee per kind. Everybody in the room was spoken to, so
       * every one of their clocks moves - which is the entire point of letting a
       * folder name more than one person, and the half of it that is safe to
       * multiply. The commitments below are the half that is not.
       *
       * Adding somebody to a binding therefore imports the folder's past notes
       * for them as well. That is right for the thing this models: a standing
       * meeting with a fixed set of attendees, where the notes he already has
       * are notes of conversations the new name was in. Where it is wrong, the
       * rows are on the page and deleting one makes it stay deleted.
       */
      for (const personId of people) {
        for (const kind of kinds) {
          const key = touchKey(String(note.id), personId, kind);
          if (takenTouchKeys.has(key)) {
            continue;
          }
          takenTouchKeys.add(key);
          contacts += 1;
          if (!dry) {
            store.create("touches", {
              id: `nib:${note.id}:${personId}:${kind}`,
              subject: personId,
              kind,
              note: note.title || null,
              at: happenedAt,
              from: "nib"
            });
          }
        }
      }

      // A flagged block is an action point the user marked by hand. No model
      // needed, and no guessing about what counts as a commitment - except the
      // one guess worth making, which is that a principle is not one. See
      // `commitments`.
      for (const alert of commitments) {
        // The id a commitment gets, whichever collection it is sitting in. One
        // id across both is what makes filing a queued commitment idempotent:
        // the promise it becomes is already the row the next import would have
        // looked for, so nothing is written twice and a later deletion sticks.
        const promiseId = `nib:${note.id}:${alert.id}`;
        const existing = promiseRows.get(promiseId);

        if (existing !== undefined) {
          // Ticked off in Nib closes it here too.
          if (alert.done && (existing.state ?? "open") === "open") {
            resolved += 1;
            if (!dry) {
              store.update("promises", promiseId, { state: "resolved" });
            }
          }
          continue;
        }

        /*
         * Queued, and settled in Nib before anybody got round to filing it.
         * Dropped rather than promoted: filing it would ask him who owes a thing
         * that is already done, and the answer changes nothing.
         */
        const queued = pendingRows.get(promiseId);
        if (queued !== undefined) {
          if (alert.done) {
            dropped += 1;
            if (!dry) {
              store.remove("pendingPromises", promiseId);
            }
          }
          continue;
        }

        /*
         * Written before and in neither collection now: deleted on purpose.
         * Neither re-created nor resolved - there is nothing left to resolve,
         * and reporting it as imported was the untruth this replaced.
         *
         * Both collections are checked, and the pending one matters even for a
         * folder that names one person today. A commitment queued while the
         * folder was shared, then thrown away, would otherwise come back as a
         * promise the moment the binding was narrowed to a single name.
         */
        if (takenPromises.has(promiseId) || takenPending.has(promiseId)) {
          continue;
        }

        if (alert.done) {
          continue;
        }

        // The same date as the contact, and for the same reason: a promise was
        // given in the conversation, not when it got written up. It matters more
        // here than for a contact, because a promise's whole urgency is its age -
        // dated to the write-up it reads as newer than it is, which is the
        // direction that hides it.
        if (!shared) {
          promises += 1;
          if (!dry) {
            store.create("promises", {
              id: promiseId,
              person: people[0],
              text: alert.text,
              madeAt: happenedAt,
              due: null,
              state: "open",
              from: "nib"
            });
          }
          continue;
        }

        /*
         * A shared note gives no way to tell whose commitment this is, so it
         * waits to be told rather than being guessed at. See `pendingPromises`
         * in the reducer for why guessing either way is worse than waiting.
         */
        waiting += 1;
        if (!dry) {
          store.create("pendingPromises", {
            id: promiseId,
            text: alert.text,
            madeAt: happenedAt,
            note: note.title || null,
            source: String(binding.id),
            candidates: people,
            from: "nib"
          });
        }
      }
    }
  }

  return {
    contacts,
    promises,
    waiting,
    dropped,
    resolved,
    retracted,
    withdrawn,
    moves,
    bindings: bindings.length,
    skipped
  };
}

/**
 * The principle-tagged notes, from anywhere.
 *
 * The half of the knowledge search that must not be scoped. A question asked in
 * either half should reach what he has read and what he is practising; what it
 * must not reach is the other half's notes about people.
 *
 * So this returns tagged notes only, and the caller merges them with its own
 * half's notes. Untagged material stays where it was written.
 *
 * @param {string} [dir]
 * @returns {(NibNote & { trail: string })[]}
 */
export function referenceNotes(dir) {
  const all = allNibNotes(dir, "reference");
  if (!all.available) {
    return [];
  }
  const catalog = listNibTags(dir, "reference");
  const tagId = principleTagId(catalog.available ? catalog.tags : []);
  if (tagId === null) {
    return [];
  }
  return all.notes.filter((note) => note.tags.includes(tagId));
}

/**
 * The Principle tag's id in this notebook, or null when it has none.
 *
 * By id first and by name only as a fallback. A tag renamed in Nib must not
 * change what Tend counts, which is the rule everywhere else here - but this one
 * tag is picked out of the catalog by Tend rather than chosen by him in a
 * mapping, so a name match is what rescues a notebook whose defaults were seeded
 * differently.
 *
 * Extracted because there were three copies of it and now four callers, one of
 * them the importer. Two copies that disagreed would mean a principle whose
 * flags Tend shows as practice on one page and chases as a promise on another.
 *
 * @param {any} tags
 * @returns {string | null}
 */
export function principleTagId(tags) {
  const list = Array.isArray(tags) ? tags : [];
  const tag =
    list.find((/** @type {any} */ t) => String(t?.id ?? "") === "tag-principle") ??
    list.find((/** @type {any} */ t) => String(t?.name ?? "").toLowerCase() === "principle");
  return tag === undefined ? null : String(tag.id);
}

/* ------------------------------------------------------- reading a body -- */

/**
 * The text of one note.
 *
 * This is the one thing in this file that opens a note about a colleague, and
 * it is deliberately not on any automatic path: indexing never calls it, the
 * app never calls it while drawing a view, and nothing calls it on a timer. It
 * exists so that a model call the user asked for by name has something to read.
 *
 * Nib stores a body as sanitised HTML in `notes/<id>.json`. What comes back
 * here is plain text, because a model needs the words and not the markup, and
 * because the fewer characters that leave this machine the better.
 *
 * @param {string} noteId
 * @param {string} [dir] Nib data directory.
 * @returns {{ available: true, text: string } | { available: false, why: string }}
 */
export function noteBody(noteId, dir = nibDataDir()) {
  const path = join(dir, "notes", `${noteId}.json`);
  /** @type {string} */
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    const code = /** @type {NodeJS.ErrnoException} */ (err).code;
    return {
      available: false,
      why: code === "ENOENT" ? `Nib har ingen anteckningsfil för ${noteId}.` : `Kunde inte läsa ${path}: ${String(err)}`
    };
  }

  try {
    const parsed = JSON.parse(raw);
    return { available: true, text: htmlToText(String(parsed?.html ?? "")) };
  } catch {
    return { available: false, why: `Anteckningsfilen för ${noteId} kunde inte tolkas.` };
  }
}

/**
 * Sanitised HTML to something a model can read.
 *
 * Not a parser and not trying to be. Nib writes a small, known set of tags, and
 * the only jobs here are keeping the line breaks that carry meaning - a list is
 * a list because of them - and not leaving `&amp;` in the middle of a sentence.
 *
 * @param {string} html
 * @returns {string}
 */
export function htmlToText(html) {
  return html
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Last, so an escaped ampersand in the source cannot become the start of
    // another entity once the ones above have been replaced.
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

/**
 * The principle notes: which are being worked on, and which carry an unfinished
 * action point.
 *
 * Read across every scope, because reference material is not about either half -
 * see the note on `SCOPES_IN_HALF`. The principle tag is what bounds this, and
 * only tagged notes come back.
 *
 * The tag is found by id first and by name second. The id is what everything
 * else here uses - a tag renamed in Nib must not change what Tend counts - but
 * this one tag is picked out of the catalog by Tend rather than chosen by him in
 * a mapping, so a name match is the fallback for a notebook whose defaults were
 * seeded differently.
 *
 * Never throws, and says why when it comes back empty. "No principles are
 * flagged" and "there is no Principle tag in this notebook" look identical on a
 * card, and only one of them is something to act on.
 *
 * @param {string} [dir]
 * @param {string} [half]
 * @returns {{ available: false, why: string }
 *   | { available: true, practices: any[], actionPoints: any[] }}
 */
export function principlesInNib(dir, half = "work") {
  /*
   * Every scope, and the principle tag is the boundary instead of the folder.
   *
   * `half` is accepted and deliberately not used for the filter, so the call
   * sites do not have to know this - and so that changing the decision means
   * changing this function rather than hunting for callers.
   *
   * What leaves here is only what the tag matched: `activePractices` and
   * `openActionPoints` both filter by it, and the trail map below is a lookup
   * used for those notes alone. An untagged note in either half is read into
   * memory and never returned.
   */
  const all = allNibNotes(dir, "reference");
  if (!all.available) {
    return { available: false, why: all.why };
  }

  const catalog = listNibTags(dir, "reference");
  const tagId = principleTagId(catalog.available ? catalog.tags : []);

  if (tagId === null) {
    return {
      available: false,
      why: "Den här anteckningsboken har ingen Principle-tagg, så det finns inget att läsa. Lägg till en i Nib och tagga de anteckningar du vill öva på."
    };
  }

  const trails = new Map(all.notes.map((n) => [String(n.id), String(n.trail ?? "")]));

  return {
    available: true,
    practices: activePractices(/** @type {any[]} */ (all.notes), tagId, (id) => trails.get(id) ?? ""),
    actionPoints: openActionPoints(/** @type {any[]} */ (all.notes), tagId)
  };
}
