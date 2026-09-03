/**
 * One direction a person is growing in, and a row per time it came up.
 *
 * The interesting field is `observed` on a note, and it is deliberately a
 * separate answer from "did we talk about it". The gap between the two IS the
 * reading: many conversations and nothing ever observed means a wrong plan or
 * missing support, and no tool that only counts meetings can see that.
 *
 * Not in the private half. A growth thread is a direction you have decided
 * somebody should develop in, with a marker you watch for - run that on your
 * own family and the tool has become something else. See `personBlocksIn`.
 *
 * Split out of api.js: measured as needing nothing from any other section.
 */

import {
  COMFORTABLE_THREADS,
  DEFAULT_CADENCE_DAYS,
  DEFAULT_HORIZON_DAYS,
  DRIVERS,
  STANCES,
  STATUSES,
  isDriver,
  isLiveStatus,
  isStance,
  isStatus,
  missing,
  openQuestions,
  threadsFor
} from "../domain/growth.js";
import { inScope } from "../domain/people.js";
import { agoWords, daysBetween, isLaterDay } from "../domain/time.js";
import { resolvePerson } from "./resolve.js";

/**
 * The growth threads standing against one person, live or ended.
 *
 * Ended ones travel with them on purpose. A thread let go six months ago is the
 * answer to "why do we not talk about this any more", and hiding it would leave
 * the decision readable only as a mood in the room.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} who Name or id.
 * @param {number} now
 */
export function growth(store, who, now) {
  const found = resolvePerson(store, who);
  if (!found.ok) {
    return { error: found.error };
  }
  const person = found.person;
  const notes = /** @type {any[]} */ (store.rows("growthNotes"));
  const rows = store.rows("growth").filter((r) => r.person === person.id);
  const names = new Map(store.rows("people").map((p) => [String(p.id), String(p.name ?? "")]));

  const threads = threadsFor({
    growth: /** @type {any[]} */ (rows),
    notes,
    person: /** @type {any} */ (person),
    now
  }).map((state) => {
    const row = /** @type {any} */ (rows.find((r) => r.id === state.id));
    return {
      ...state,
      driverLabel: DRIVERS[state.driver].label,
      driverMeans: DRIVERS[state.driver].means,
      stanceLabel: STANCES[state.stance].label,
      statusLabel: STATUSES[state.status].label,
      lastTalkedWords: state.lastTalked === null ? "never" : agoWords(state.daysSinceTalked),
      lastObservedWords:
        state.lastObserved === null ? "never" : agoWords(Math.max(0, daysBetween(state.lastObserved, now))),
      // Who has been told, outside the two of them. Listed rather than counted:
      // the useful question next spring is which of them heard it, and a number
      // cannot answer that.
      told: [
        ...new Set(
          notes
            .filter((n) => !n._deleted && n.growth === state.id && String(n.tell ?? "") !== "")
            .map((n) => names.get(String(n.tell)) ?? "")
            .filter((name) => name !== "")
        )
      ],

      // The whole row, so the form reopens where it was left rather than asking
      // again for what he already answered.
      fields: formFields(row),
      missing: missing(row)
    };
  });

  const live = threads.filter((t) => isLiveStatus(t.status)).length;

  return {
    person: person.name,
    threads,
    live,
    // Said rather than enforced. A cap the tool imposed on his judgement would
    // be software deciding how many people he is allowed to develop at once.
    comfortable: COMFORTABLE_THREADS
  };
}

/**
 * The fields of a thread, exactly as the form wrote them.
 *
 * @param {Record<string, any> | undefined} row
 */
function formFields(row) {
  return {
    aim: String(row?.aim ?? ""),
    theirWords: String(row?.theirWords ?? ""),
    driver: String(row?.driver ?? ""),
    need: String(row?.need ?? ""),
    ifNothingChanges: String(row?.ifNothingChanges ?? ""),
    hypothesis: String(row?.hypothesis ?? ""),
    alreadySeen: String(row?.alreadySeen ?? ""),
    offering: String(row?.offering ?? ""),
    assignment: String(row?.assignment ?? ""),
    marker: String(row?.marker ?? ""),
    stance: String(row?.stance ?? "unasked"),
    endedWhy: String(row?.endedWhy ?? ""),
    endingSaid: row?.endingSaid === true,
    cadenceDays: Number(row?.cadenceDays ?? DEFAULT_CADENCE_DAYS),
    horizon: typeof row?.horizon === "number" ? row.horizon : null
  };
}

/**
 * Every thread across everyone that is asking him something.
 *
 * Read by the Signals view rather than by Now, and that is the whole placement
 * argument: nobody is let down today because a growth thread stood still, but he
 * should be asked about it. Putting it in Now would either shout about something
 * that is not urgent or teach him to skim the one page that must never be
 * skimmed.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {number} now
 */
export function growthQuestions(store, now) {
  const people = store.rows("people").filter((p) => inScope(/** @type {any} */ (p), now));
  const questions = openQuestions({
    growth: /** @type {any[]} */ (store.rows("growth")),
    notes: /** @type {any[]} */ (store.rows("growthNotes")),
    people: /** @type {any[]} */ (people),
    now
  });
  const byId = new Map(people.map((p) => [String(p.id), String(p.name ?? "")]));
  return questions.map((q) => ({
    id: q.id,
    person: byId.get(q.person) ?? "",
    aim: q.aim,
    asks: q.asks,
    status: q.status,
    statusLabel: STATUSES[q.status].label,
    stalled: q.stalled,
    pastHorizon: q.pastHorizon,
    talks: q.talks,
    observations: q.observations,
    lastTalked: q.lastTalked === null ? "never" : agoWords(q.daysSinceTalked)
  }));
}

/**
 * Open a growth thread. Stage A of the form: his own preparation.
 *
 * Only the person and the aim are required, deliberately - a thread that cannot
 * be opened until every question is answered is a thread that gets opened in a
 * text file instead. The rest comes back as `missing`, per sitting, so the gaps
 * stay visible without blocking.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} args.person Name or id.
 * @param {string} args.aim
 * @param {string} [args.driver] wants | needs | unknown
 * @param {string} [args.need]
 * @param {string} [args.ifNothingChanges]
 * @param {string} [args.hypothesis]
 * @param {string} [args.alreadySeen]
 * @param {string} [args.offering]
 * @param {number} [args.cadenceDays]
 * @param {number} [args.horizonDays]
 * @param {number} args.now
 */
export function openThread(store, { person: who, aim, cadenceDays, horizonDays, now, ...rest }) {
  const found = resolvePerson(store, who);
  if (!found.ok) {
    return { error: found.error };
  }
  if (String(aim ?? "").trim() === "") {
    return { error: "A thread needs a direction in one sentence. Everything else can wait." };
  }
  if (rest.driver !== undefined && rest.driver !== "" && !isDriver(String(rest.driver))) {
    return { error: `Unknown driver. Valid: ${Object.keys(DRIVERS).join(", ")}.` };
  }

  const cadence = Number(cadenceDays) > 0 ? Number(cadenceDays) : DEFAULT_CADENCE_DAYS;
  const days = Number(horizonDays) > 0 ? Number(horizonDays) : DEFAULT_HORIZON_DAYS;

  const id = store.create("growth", {
    person: String(found.person.id),
    aim: String(aim).trim(),
    // Left blank when not given, NOT defaulted to "unknown". `unknown` is a
    // first-class answer in `growth.js` - "I do not know yet", chosen from the
    // list - and since opening a thread stopped asking for the driver at all,
    // writing it would record an answer to a question nobody was asked. It also
    // silenced the one thing that was supposed to carry the deferral: `missing()`
    // treats `unknown` as answered, so the "do they want this, or does the job
    // need it?" line never came back on the card.
    driver: String(rest.driver ?? "") === "" ? "" : String(rest.driver),
    need: text(rest.need),
    ifNothingChanges: text(rest.ifNothingChanges),
    hypothesis: text(rest.hypothesis),
    alreadySeen: text(rest.alreadySeen),
    offering: text(rest.offering),
    theirWords: "",
    assignment: "",
    marker: "",
    stance: "unasked",
    status: "open",
    cadenceDays: cadence,
    horizon: now + days * 86_400_000,
    startedAt: now
  });

  const row = /** @type {any} */ (store.rows("growth").find((r) => r.id === id));
  return { id, person: found.person.name, aim: String(aim).trim(), missing: missing(row) };
}

/**
 * Fill in or correct a thread. Stage B of the form lands here.
 *
 * The hypothesis stays writable but stage B never clears it, which is the one
 * asymmetry worth keeping: what he guessed before asking, sitting next to what
 * they actually said, is how a manager finds out they have been managing an
 * assumption.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} id
 * @param {Record<string, any>} fields
 */
export function updateThread(store, id, fields) {
  const row = store.rows("growth").find((r) => r.id === id);
  if (!row) {
    return { error: `No growth thread with id "${id}".` };
  }
  if (fields.driver !== undefined && !isDriver(String(fields.driver))) {
    return { error: `Unknown driver. Valid: ${Object.keys(DRIVERS).join(", ")}.` };
  }
  if (fields.stance !== undefined && !isStance(String(fields.stance))) {
    return { error: `Unknown stance. Valid: ${Object.keys(STANCES).join(", ")}.` };
  }
  if (fields.status !== undefined && !isStatus(String(fields.status))) {
    return { error: `Unknown status. Valid: ${Object.keys(STATUSES).join(", ")}.` };
  }
  if (fields.cadenceDays !== undefined && !(Number(fields.cadenceDays) > 0)) {
    return { error: "A cadence has to be a positive number of days." };
  }

  /** @type {Record<string, any>} */
  const patch = {};
  const writable = [
    "aim",
    "theirWords",
    "driver",
    "need",
    "ifNothingChanges",
    "hypothesis",
    "alreadySeen",
    "offering",
    "assignment",
    "marker",
    "stance",
    "endedWhy"
  ];
  for (const field of writable) {
    if (fields[field] !== undefined) {
      patch[field] = text(fields[field]);
    }
  }
  if (fields.cadenceDays !== undefined) {
    patch.cadenceDays = Number(fields.cadenceDays);
  }
  if (fields.horizon !== undefined) {
    patch.horizon = fields.horizon === null ? null : Number(fields.horizon);
  }
  if (fields.endingSaid !== undefined) {
    patch.endingSaid = fields.endingSaid === true;
  }
  if (fields.status !== undefined) {
    patch.status = String(fields.status);
  }

  if (Object.keys(patch).length === 0) {
    return { error: "Nothing to change." };
  }

  store.update("growth", id, patch);
  const after = /** @type {any} */ (store.rows("growth").find((r) => r.id === id));
  return { id, missing: missing(after) };
}

/**
 * End a thread, with the reason kept.
 *
 * `said` defaults to false rather than true, and it is the most important
 * default in this file. Letting a direction go is often the right call; letting
 * it go without telling the person is the worst of the available options,
 * because the disappointment stays in the room while the decision never gets
 * said out loud. So the thread keeps asking until he confirms he said it.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} id
 * @param {object} args
 * @param {string} args.status reached | dropped | expectation
 * @param {string} [args.why]
 * @param {boolean} [args.said]
 */
export function endThread(store, id, { status, why, said }) {
  const row = store.rows("growth").find((r) => r.id === id);
  if (!row) {
    return { error: `No growth thread with id "${id}".` };
  }
  if (!isStatus(String(status)) || status === "open") {
    return { error: "An ending is one of: reached, dropped, expectation." };
  }
  if (String(why ?? "").trim() === "") {
    return { error: "An ending needs its reason. A thread that ends silently becomes a grudge." };
  }

  store.update("growth", id, {
    status: String(status),
    endedWhy: String(why).trim(),
    endingSaid: said === true
  });
  return { id, status: String(status), said: said === true };
}

/**
 * Record that a thread came up, and whether the marker was actually seen.
 *
 * Two answers rather than one, and keeping them apart is the point of the whole
 * feature. "We talked about it" moves the attention clock. "I saw them do it"
 * moves nothing else in the tool but is the only evidence any of this is
 * working, and the gap between the two counts is what produces the stall
 * question.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} args.growth Thread id.
 * @param {string} [args.note]
 * @param {boolean} [args.observed]
 * @param {string} [args.tell] Who outside the conversation was told, or should be.
 *   Kept on the note as well as turned into a promise, so the record survives the
 *   promise being closed - "I told his manager in May" is the thing a level
 *   conversation next spring rests on.
 * @param {number} [args.at]
 * @param {number} args.now
 */
export function logGrowthNote(store, { growth: threadId, note, observed, tell, at, now }) {
  const row = store.rows("growth").find((r) => r.id === threadId);
  if (!row) {
    return { error: `No growth thread with id "${threadId}".` };
  }
  const when = typeof at === "number" ? at : now;
  if (isLaterDay(when, now)) {
    return { error: "That day has not arrived yet. A conversation is logged after it happens." };
  }
  if (observed === true && String(row.marker ?? "").trim() === "") {
    return { error: "There is no marker on this thread yet, so there is nothing to have observed." };
  }

  const id = store.create("growthNotes", {
    growth: String(threadId),
    note: text(note),
    observed: observed === true,
    tell: text(tell),
    at: when
  });
  return { id, aim: String(row.aim ?? ""), observed: observed === true };
}

/** @param {unknown} value */
function text(value) {
  return String(value ?? "").trim();
}

/**
 * One thread by id, in the same shape `growth` returns.
 *
 * Exists so a dialog can reopen where it was left without the window walking
 * the whole roster to find which person a thread belongs to. Reads the thread's
 * own person rather than taking one on trust: an id is enough to identify a
 * thread, and asking the caller to also know whose it is would be a second fact
 * to keep in sync.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} id
 * @param {number} now
 */
export function thread(store, id, now) {
  const row = store.rows("growth").find((r) => r.id === id);
  if (!row) {
    return { error: `No growth thread with id "${id}".` };
  }
  const found = resolvePerson(store, String(row.person ?? ""));
  if (!found.ok) {
    return { error: found.error };
  }
  const all = growth(store, String(found.person.id), now);
  const one = (all.threads ?? []).find((t) => t.id === id);
  if (one === undefined) {
    return { error: `No growth thread with id "${id}".` };
  }
  return one;
}
