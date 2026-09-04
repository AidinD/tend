/**
 * The end-of-day journal: writing an entry, and reading the ledger beside it.
 *
 * Optional by design. Nothing here prompts for an entry and days get missed, so
 * the value is never in one row - it is in a pass over many, which is why the
 * coverage floors live in domain/review.js and are shared with the model pass
 * rather than restated.
 *
 * Split out of api.js. Measured as one of the sections with no calls into any
 * other, so it lifts without leaving a dependency behind.
 */

import { coverage, entriesSince, hasContent, JOURNAL_FIELDS, REVIEW_WINDOW_DAYS } from "../domain/journal.js";
import { agoWords, daysSince, isLaterDay } from "../domain/time.js";
import { resolvePerson } from "./resolve.js";

/**
 * Write an end-of-day entry.
 *
 * Every field is optional and so is the whole thing having more than one filled.
 * Requiring three would produce something invented at eleven at night, and
 * invented data is worse than none - it survives, it reads like a fact, and it
 * poisons the pass that is the entire point.
 *
 * One entry per day, replaced rather than duplicated. Coming back in the evening
 * to add a line is normal; ending up with three partial entries for a Tuesday is
 * not, and it would make any count over days wrong.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {number} args.now
 * @param {number} [args.at] The day it is about. Defaults to today.
 * @param {string} [args.took]
 * @param {string} [args.avoided]
 * @param {string} [args.differently]
 * @param {string} [args.notes]
 */
export function logEntry(store, { now, at, ...fields }) {
  const when = typeof at === "number" ? at : now;
  if (isLaterDay(when, now)) {
    return { error: "Den dagen har inte kommit än." };
  }

  /** @type {Record<string, any>} */
  const entry = { at: when };
  for (const field of JOURNAL_FIELDS) {
    const value = String(fields[field.name] ?? "").trim();
    entry[field.name] = value === "" ? null : value;
  }


  if (!hasContent(entry)) {
    return { error: "Ingenting skrevs, så det finns ingenting att spara." };
  }

  const day = new Date(when).toISOString().slice(0, 10);
  const already = store
    .rows("entries")
    .find((e) => new Date(Number(e.at ?? 0)).toISOString().slice(0, 10) === day);

  if (already) {
    store.update("entries", String(already.id), entry);
    return { id: String(already.id), day, replaced: true };
  }
  const id = store.create("entries", entry);
  return { id, day, replaced: false };
}

/**
 * The recent entries, and how much there is to read.
 *
 * The coverage travels with them rather than being computed by whoever displays
 * them, so a summary built on five entries cannot be presented in the same voice
 * as one built on twenty-five.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {number} now
 * @param {number} [days]
 */
export function journal(store, now, days = REVIEW_WINDOW_DAYS) {
  const window = entriesSince(store.rows("entries"), now, days);
  return {
    fields: JOURNAL_FIELDS.map((f) => ({ ...f })),
    coverage: coverage(window, days),
    entries: window.map((e) => ({
      id: String(e.id),
      at: Number(e.at ?? 0),
      when: agoWords((daysSince(e.at, now) ?? 0)),
      took: e.took ?? null,
      avoided: e.avoided ?? null,
      differently: e.differently ?? null,
      notes: e.notes ?? null
    }))
  };
}

/**
 * One thing that happened, who it involved, and his own part in it.
 *
 * ## Three shapes were tried before this one
 *
 * First a checkbox per person on the DAY's entry. Wrong: the day is a whole-day
 * retrospective, so ticking four names put one day's text - which may not be
 * about any of them - onto four people's pages.
 *
 * Then a moment tied to one person. Also wrong, and he said so straight away:
 * most of what is worth writing down involves several people at once, and one
 * person per moment means writing the same sentence three times. Which is the
 * kind of cost that stops a thing being written at all.
 *
 * So: one event, dated to the moment rather than to the day, naming everybody it
 * involved. Written once, shown on each of their pages. A day holds as many as it
 * holds.
 *
 * ## Why it is not the work half's observation
 *
 * An observation exists to be material a review conversation is built from, so it
 * is about the other person. This is the other thing: what happened, and the half
 * of it that was his.
 *
 * ## Why the two text fields are separate
 *
 * `part` is the point of the whole feature, and one box would let it go
 * unwritten. The rule this half is written under - record the interaction and
 * your own part in it, never the other person's state - only holds if the second
 * half actually gets written, and a form is where that becomes structural rather
 * than remembered. Same reasoning as the growth thread's marker having a field of
 * its own instead of being expected inside a paragraph.
 *
 * `what` may be left out; `part` may not. "I was short with them" is a complete
 * entry. "They slammed the door" is the exact thing this half refuses to keep.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string[]} [args.people] Who it involved. Ids or names.
 * @param {string} [args.person] One person, for the button on their own page.
 * @param {string} args.part What his own part in it was. Required.
 * @param {string} [args.what] What happened. Optional.
 * @param {number} [args.at] When. Defaults to now.
 * @param {number} args.now
 */
export function logMoment(store, { people, person, part, what, at, now }) {
  if (!String(part ?? "").trim()) {
    return {
      error:
        "Säg vad din egen del i det var. Det är halvan du kan ändra, och den enda halvan värd att " +
        "spara - en anteckning om vad någon annan gjorde är just det den här halvan vägrar."
    };
  }

  const asked = [...(Array.isArray(people) ? people : []), ...(person ? [person] : [])];
  if (asked.length === 0) {
    return { error: "Säg vem det handlade om. En stund utan någon i hör hemma i dagen." };
  }

  /** @type {string[]} */
  const ids = [];
  for (const one of asked) {
    const found = resolvePerson(store, String(one));
    if (!found.ok) {
      return { error: found.error };
    }
    if (!ids.includes(found.person.id)) {
      ids.push(found.person.id);
    }
  }

  const when = typeof at === "number" ? at : now;
  if (isLaterDay(when, now)) {
    return { error: "Den dagen har inte kommit än." };
  }

  const id = store.create("moments", {
    people: ids,
    what: String(what ?? "").trim() || null,
    part: String(part).trim(),
    at: when
  });
  return { id, people: ids.length };
}

/**
 * Newest first, and deterministic when two share a day.
 *
 * A moment is dated to the day, so several in one day sort equal - and `sort` is
 * then free to return them in whichever order it likes. The tie-break is when the
 * row was written, which is the only other ordering there is and the one "newest"
 * means for two things that happened the same afternoon.
 *
 * Found by a test asserting the second of two same-day moments came first, which
 * it did not reliably.
 *
 * @param {Record<string, any>} a
 * @param {Record<string, any>} b
 */
function byNewestMoment(a, b) {
  const day = Number(b.at ?? 0) - Number(a.at ?? 0);
  return day !== 0 ? day : Number(b._at ?? 0) - Number(a._at ?? 0);
}

/**
 * Who a moment involved, read defensively.
 *
 * @param {Record<string, any>} moment
 * @returns {string[]}
 */
function momentPeople(moment) {
  const raw = moment?.people;
  if (Array.isArray(raw)) {
    return raw.map((id) => String(id)).filter((id) => id !== "");
  }
  // A single-person moment, from the shape this had for one afternoon.
  return moment?.person ? [String(moment.person)] : [];
}

/**
 * The moments involving one person, newest first.
 *
 * Each carries who ELSE was there, because a moment written once about three
 * children reads oddly on one child's page without it - and because "this was all
 * of you" and "this was you and me" are different memories.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} who
 * @param {number} now
 */
export function momentsFor(store, who, now) {
  const found = resolvePerson(store, who);
  if (!found.ok) {
    return { error: found.error };
  }
  const names = new Map(store.rows("people").map((p) => [String(p.id), String(p.name ?? "")]));

  return store
    .rows("moments")
    .filter((m) => momentPeople(m).includes(found.person.id))
    .sort(byNewestMoment)
    .map((m) => ({
      id: String(m.id),
      at: Number(m.at ?? 0),
      when: agoWords((daysSince(m.at, now) ?? 0)),
      what: m.what ?? null,
      part: String(m.part ?? ""),
      alsoThere: momentPeople(m)
        .filter((id) => id !== found.person.id)
        .map((id) => names.get(id) ?? "somebody")
    }));
}

/**
 * Every moment, newest first. For the page you write them from.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {number} now
 */
export function moments(store, now) {
  const names = new Map(store.rows("people").map((p) => [String(p.id), String(p.name ?? "")]));
  return store
    .rows("moments")
    .sort(byNewestMoment)
    .map((m) => ({
      id: String(m.id),
      at: Number(m.at ?? 0),
      when: agoWords((daysSince(m.at, now) ?? 0)),
      what: m.what ?? null,
      part: String(m.part ?? ""),
      who: momentPeople(m).map((id) => names.get(id) ?? "somebody")
    }));
}
