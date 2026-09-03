/**
 * A short, occasionally-prompted look back at how the last week or so went.
 *
 * Not the day, and not a moment. The day is a nightly retrospective that never
 * prompts and is about everywhere the day went; this asks two fixed questions
 * about a wider stretch and does gently prompt once it has lapsed. A moment is
 * one event with named people, and this names nobody - it is about the shape of
 * the week rather than any interaction inside it.
 *
 * The journal ledger and the declared focus are both read here, because "what
 * went well" is worth setting against what the record says happened and against
 * what he had said his attention was on.
 *
 * Split out of api.js. It could not move until the focus reader did: its only
 * tie to another section was that function, filed under reading and used by
 * nothing there.
 */

import { REVIEW_WINDOW_DAYS } from "../domain/journal.js";
import { REFLECTION_FIELDS } from "../domain/reflection.js";
import { declared, ledger as reviewLedger, ledgerLines, readiness, unread } from "../domain/review.js";
import { agoWords, daysSince, isLaterDay } from "../domain/time.js";
import { focus } from "./focus.js";
import { journal } from "./journal.js";

/**
 * One short look back: what went well, what you would do differently, and
 * optionally anything else. See the header of reflection.js for why this is
 * fixed prompts rather than a diary field, and why it is not the day and not
 * a moment.
 *
 * At least one of the two primary questions has to carry something - a
 * fully blank row, or one with only the secondary field filled, records
 * nothing the two questions exist to ask.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} [args.wellDone]
 * @param {string} [args.differently]
 * @param {string} [args.notes]
 * @param {number} [args.at] Defaults to now.
 * @param {number} args.now
 */
export function logReflection(store, { wellDone, differently, notes, at, now }) {
  const when = typeof at === "number" ? at : now;
  if (isLaterDay(when, now)) {
    return { error: "That week has not happened yet." };
  }

  /** @type {Record<string, any>} */
  const row = { at: when };
  for (const field of REFLECTION_FIELDS) {
    const value = String({ wellDone, differently, notes }[field.name] ?? "").trim();
    row[field.name] = value === "" ? null : value;
  }

  if (!String(row.wellDone ?? "").trim() && !String(row.differently ?? "").trim()) {
    return { error: "Answer at least one of the two questions - notes alone is not a reflection." };
  }

  const id = store.create("reflections", row);
  return { id };
}

/**
 * Recent reflections, newest first.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {number} now
 * @param {object} [opts]
 * @param {number} [opts.limit]
 * @param {number} [opts.since]
 */
export function reflections(store, now, { limit, since } = {}) {
  let rows = store.rows("reflections").filter((r) => Number(r.at ?? 0) > 0);
  if (typeof since === "number") {
    rows = rows.filter((r) => Number(r.at) >= since);
  }
  rows = rows.sort((a, b) => Number(b.at ?? 0) - Number(a.at ?? 0));
  if (typeof limit === "number") {
    rows = rows.slice(0, limit);
  }
  return rows.map((r) => ({
    id: String(r.id),
    at: Number(r.at ?? 0),
    when: agoWords((daysSince(r.at, now) ?? 0)),
    wellDone: r.wellDone ?? null,
    differently: r.differently ?? null,
    notes: r.notes ?? null
  }));
}

/**
 * When a reflection was last written, or null if none ever has.
 *
 * Same shape as `lastReviewRun` below - the nudge in myattention.js needs
 * exactly this and nothing more.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @returns {number | null}
 */
export function lastReflectedAt(store) {
  const times = store.rows("reflections").map((r) => Number(r.at ?? 0)).filter((t) => t > 0);
  return times.length === 0 ? null : Math.max(...times);
}

/**
 * Everything needed to read the journal, without a model being involved.
 *
 * The window's entries, how thin they are, what the store recorded over the same
 * days, and whichever focus was declared while it happened.
 *
 * This is the whole material the model layer's own pass is built from, exposed
 * as data on purpose. The MCP surface deliberately carries no model calls - a
 * caller there already IS one, and nesting a second would pay twice for a worse
 * answer, since the inner call sees only the entries and the outer one sees the
 * conversation. So the surface hands over the material and the reading happens
 * where the context is.
 *
 * `readiness` travels with it rather than being left to the caller's judgement.
 * The floor exists because a pattern named from two evenings is one evening
 * restated with confidence, and stating it in the data is what makes it a rule
 * instead of a hope.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {number} now
 * @param {number} [days]
 */
export function journalMaterial(store, now, days = REVIEW_WINDOW_DAYS) {
  const base = journal(store, now, days);
  const counts = reviewLedger(
    {
      touches: store.rows("touches"),
      promises: store.rows("promises"),
      decisions: store.rows("decisions"),
      growthNotes: store.rows("growthNotes"),
      skips: store.rows("skips"),
      chases: store.rows("chases"),
      entries: store.rows("entries")
    },
    now,
    days
  );
  const live = focus(store, now);
  const lastRead = lastReviewRun(store);
  return {
    ...base,
    readiness: readiness(base.coverage),
    // What has gone unread, which is a different question from what is in the
    // window: three months nobody has looked at is the state worth saying out
    // loud, and a thirty-day window reports it as one month's worth.
    unread: unread(store.rows("entries"), lastRead, now),
    recorded: counts,
    recordedLines: ledgerLines(counts),
    declared: declared(
      store.focus(),
      now,
      days,
      live.active && typeof live.cost === "string" ? live.cost : undefined
    )
  };
}

/**
 * Record that a pass over the journal ran.
 *
 * Separate from keeping the reading, and the distinction is the whole reason the
 * nudge can be trusted. Reading a month and deciding it said nothing is a
 * complete act - the material HAS been read - so a nudge that came back the next
 * day suggesting a reading would be wrong in the way that matters most for a
 * nudge, which is that it teaches you to ignore it.
 *
 * One row per pass, and keeping the reading fills the same row in rather than
 * writing a second: the id is derived from when it ran, so a reading and the run
 * it came from are one thing with two states.
 *
 * This is the app recording that an action happened, in the same sense as a
 * logged contact. It is not the model layer writing findings - the row carries a
 * timestamp and how much was read, and nothing the model said.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {number} args.at
 * @param {number} [args.days]
 * @param {number} [args.entries]
 * @param {number} [args.spread]
 */
export function noteReviewRun(store, { at, days = REVIEW_WINDOW_DAYS, entries = 0, spread = 0 }) {
  const when = Number(at);
  if (!Number.isFinite(when) || when <= 0) {
    return { error: "A reading has to have run at some point." };
  }
  const id = `review:${when}`;
  store.create("reviews", { id, at: when, days, entries, spread, kept: false });
  return { id };
}

/**
 * When a pass last ran, or null if none ever has.
 *
 * Reads runs and kept readings alike, because both are evidence the material was
 * read. Used by the nudge and by nothing else.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @returns {number | null}
 */
export function lastReviewRun(store) {
  const times = store.rows("reviews").map((r) => Number(r.at ?? 0)).filter((t) => t > 0);
  return times.length === 0 ? null : Math.max(...times);
}

/**
 * Keep a reading of the journal.
 *
 * The model returns a review and writes nothing; this is what happens if he
 * decides the reading was worth having. Same shape as keeping an extracted
 * promise, and for the same reason: nothing a model produced enters the store
 * without somebody having read it first.
 *
 * Kept rather than thrown away - the opposite of a brief - because the entries
 * underneath a review are about days that are over. A brief goes stale as the
 * facts move; a review cannot, and comparing this month's reading with last
 * month's is the only version of this feature that ever gets better with time.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} review The object `reviewJournal` returned.
 */
export function keepReview(store, review) {
  const at = Number(/** @type {any} */ (review)?.at ?? 0);
  if (!Number.isFinite(at) || at <= 0) {
    return { error: "That is not a review this app produced." };
  }
  const r = /** @type {any} */ (review);

  const wentInto = Array.isArray(r.wentInto) ? r.wentInto : [];
  const avoidance = Array.isArray(r.avoidance) ? r.avoidance : [];
  const questions = Array.isArray(r.questions) ? r.questions : [];
  if (
    wentInto.length === 0 &&
    avoidance.length === 0 &&
    questions.length === 0 &&
    String(r.saidVsDid ?? "").trim() === ""
  ) {
    return { error: "That review found nothing, so there is nothing worth keeping." };
  }

  // The same id `noteReviewRun` derived, so keeping a reading fills in the row
  // for the run it came from. Creating a second row would make one reading look
  // like two, and the nudge counts rows by their date.
  const id = `review:${at}`;
  store.create("reviews", { id, at, kept: false });
  store.update("reviews", id, {
    at,
    kept: true,
    days: Number(r.days ?? REVIEW_WINDOW_DAYS),
    // The coverage is kept WITH it rather than recomputed on display. A reading
    // built on six entries and one built on twenty-six are different claims, and
    // recomputing later would answer for a window that has since moved.
    entries: Number(r.coverage?.entries ?? 0),
    spread: Number(r.coverage?.spread ?? 0),
    wentInto,
    avoidance,
    saidVsDid: String(r.saidVsDid ?? ""),
    questions,
    ledger: r.ledger ?? null,
    declared: r.declared ?? null,
    source: String(r.model ?? "") === "" ? null : `model:${r.model}`
  });
  return { id, kept: true };
}

/**
 * The readings that were kept, newest first.
 *
 * @param {import("../storage/store.js").TendStore} store
 */
export function reviews(store) {
  return store
    .rows("reviews")
    // Runs that were read and not kept are recorded too - that is what makes the
    // nudge honest - but they are not readings and have nothing to show.
    .filter((r) => r.kept === true)
    .sort((a, b) => Number(b.at ?? 0) - Number(a.at ?? 0))
    .map((r) => ({
      id: String(r.id),
      at: Number(r.at ?? 0),
      days: Number(r.days ?? 0),
      entries: Number(r.entries ?? 0),
      spread: Number(r.spread ?? 0),
      wentInto: Array.isArray(r.wentInto) ? r.wentInto : [],
      avoidance: Array.isArray(r.avoidance) ? r.avoidance : [],
      saidVsDid: String(r.saidVsDid ?? ""),
      questions: Array.isArray(r.questions) ? r.questions : [],
      ledger: r.ledger ?? null,
      declared: r.declared ?? null,
      source: r.source ?? null
    }));
}
