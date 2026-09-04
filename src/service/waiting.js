/**
 * Answers you are waiting for from somebody else, and a row per time you chased
 * one.
 *
 * The mirror of a promise, kept apart from it on purpose. A promise you owe
 * escalates hard because the person let down is let down today; somebody else's
 * silence is not an alarm about you, so nothing here is ever critical. The count
 * that matters is the chases, not the days.
 *
 * Split out of api.js. Its one tie to another section was a private helper that
 * listed archived people, which moved to domain/archive.js - two modules needing
 * it once they were separate files is exactly what a domain helper is for.
 */

import { archivedIds } from "../domain/archive.js";
import { agoWords, humanDays, isLaterDay } from "../domain/time.js";
import {
  DEFAULT_WAIT_DAYS,
  WAIT_ENDINGS,
  isWaitEnding,
  openWaits,
  waitsDue
} from "../domain/waiting.js";
import { resolvePerson } from "./resolve.js";

/**
 * The answers he is waiting for, worst-neglected first.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {number} now
 * @param {string} [who] Only this person's, when given.
 */
export function waits(store, now, who) {
  let person;
  if (who !== undefined && String(who).trim() !== "") {
    const found = resolvePerson(store, who);
    if (!found.ok) {
      return { error: found.error };
    }
    person = String(found.person.id);
  }

  const names = new Map(store.rows("people").map((p) => [String(p.id), String(p.name ?? "")]));
  const open = openWaits({
    waiting: /** @type {any[]} */ (store.rows("waiting")),
    chases: /** @type {any[]} */ (store.rows("chases")),
    now,
    person
  });

  // Asked about one person by name, answer about that person even if they are
  // archived - the same rule the person page follows. Asked for the list, leave
  // the archived out of it, because the list is a list of what is still owed.
  const archived = person === undefined ? archivedIds(store.rows("people")) : new Set();

  return open
    .filter((w) => !archived.has(w.person))
    .map((w) => ({
      ...w,
      name: names.get(w.person) ?? "",
      waitingFor: humanDays(w.daysWaiting),
      sinceNudge: agoWords(w.daysSinceNudge)
    }));
}

/**
 * The ones worth putting on the daily page: past their interval, or the ones
 * where the silence has become the finding.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {number} now
 */
export function waitsOnNow(store, now) {
  const names = new Map(store.rows("people").map((p) => [String(p.id), String(p.name ?? "")]));
  // This is the daily page. An archived person here is the loudest version of
  // the mistake: the app was just told the whole job is over, and it answers by
  // naming somebody off the roster and refusing to say "nothing needs you".
  const archived = archivedIds(store.rows("people"));
  return waitsDue({
    waiting: /** @type {any[]} */ (store.rows("waiting")),
    chases: /** @type {any[]} */ (store.rows("chases")),
    now
  })
    .filter((w) => !archived.has(w.person))
    .map((w) => ({
      ...w,
      name: names.get(w.person) ?? "",
      waitingFor: humanDays(w.daysWaiting),
      sinceNudge: agoWords(w.daysSinceNudge)
    }));
}

/**
 * Record that you asked somebody for something and are waiting.
 *
 * Backdatable, because this gets written down the day you notice you are stuck
 * rather than the day you asked.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} args.person Name or id: who owes the answer.
 * @param {string} args.what
 * @param {string} [args.why] What it is blocking.
 * @param {number} [args.askedAt]
 * @param {number} [args.cadenceDays]
 * @param {number} args.now
 */
export function waitFor(store, { person: who, what, why, askedAt, cadenceDays, now }) {
  const found = resolvePerson(store, who);
  if (!found.ok) {
    return { error: found.error };
  }
  if (String(what ?? "").trim() === "") {
    return { error: "Säg vad du väntar på, annars finns det inget att påminna om." };
  }
  const when = typeof askedAt === "number" ? askedAt : now;
  if (isLaterDay(when, now)) {
    return { error: "Den dagen har inte kommit än. Du kan inte vänta på något du inte har bett om." };
  }
  if (cadenceDays !== undefined && !(Number(cadenceDays) > 0)) {
    return { error: "Hur länge du ska vänta måste vara ett positivt antal dagar." };
  }

  const id = store.create("waiting", {
    person: String(found.person.id),
    what: String(what).trim(),
    why: String(why ?? "").trim(),
    askedAt: when,
    cadenceDays: Number(cadenceDays) > 0 ? Number(cadenceDays) : DEFAULT_WAIT_DAYS,
    state: "open",
    endedWhy: ""
  });
  return { id, person: found.person.name, what: String(what).trim() };
}

/**
 * Record that you chased it.
 *
 * This is the row that matters. Waiting is ordinary and the days say little; the
 * number of times you have had to ask again is a fact about a working
 * relationship, and it is invisible while it happens because each individual
 * reminder feels reasonable.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} args.waiting Wait id.
 * @param {string} [args.note] How you chased, in a line.
 * @param {number} [args.at]
 * @param {number} args.now
 */
export function chase(store, { waiting: waitId, note, at, now }) {
  const row = store.rows("waiting").find((w) => w.id === waitId);
  if (!row) {
    return { error: `Nothing is being waited for with id "${waitId}".` };
  }
  if (String(row.state ?? "open") !== "open") {
    return { error: "Den är stängd, så det finns inget kvar att påminna om." };
  }
  const when = typeof at === "number" ? at : now;
  if (isLaterDay(when, now)) {
    return { error: "Den dagen har inte kommit än. En påminnelse loggas efter att du skickat den." };
  }

  const id = store.create("chases", {
    waiting: String(waitId),
    note: String(note ?? "").trim(),
    at: when
  });
  return { id, what: String(row.what ?? "") };
}

/**
 * Stop waiting, one way or the other.
 *
 * Both endings are ordinary and the reason is kept for both. "I decided without
 * it" is a legitimate outcome and worth being able to read later - it is the
 * thing you will want when the answer finally arrives and contradicts what you
 * already shipped.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} id
 * @param {object} args
 * @param {string} args.as answered | dropped
 * @param {string} [args.why] What came back, or what you did instead.
 */
export function stopWaiting(store, id, { as, why }) {
  const row = store.rows("waiting").find((w) => w.id === id);
  if (!row) {
    return { error: `Nothing is being waited for with id "${id}".` };
  }
  if (!isWaitEnding(String(as))) {
    return { error: `An ending is one of: ${Object.keys(WAIT_ENDINGS).join(", ")}.` };
  }

  store.update("waiting", id, { state: String(as), endedWhy: String(why ?? "").trim() });
  return { id, state: String(as) };
}
