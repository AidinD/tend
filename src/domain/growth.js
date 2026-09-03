/**
 * Growth threads: one direction per person, held over time.
 *
 * ## Why this is not a development plan
 *
 * A written development plan almost never fails because the plan was wrong. It
 * fails because it was written once, felt good, and was never looked at again.
 * The document is the failure mode, not the cure, so nothing here stores a
 * document: the prose belongs in Nib, the actions are already promises, and what
 * lives here is the skeleton plus the clocks that notice when attention lapses.
 *
 * ## Why the existing pieces were not enough
 *
 * Most of this was already in the tool, and the reuse is deliberate:
 *
 * - The things he said he would do about it are `promises`, which already
 *   escalate hard and cannot be dampened. All the urgency in a plan lives
 *   there, which is why nothing in this file ever reaches Now.
 * - Measured competence on a piece of work is a workstream's delegation level.
 *   Moving one from "close follow-up" to "fully theirs" IS growth, observed and
 *   already tracked, and for some people that is the whole plan with no thread
 *   needed at all.
 * - What to raise next time is a `topic`.
 *
 * What none of them hold is a direction that persists across all of it, and -
 * the part no spreadsheet can tell you - whether it is moving.
 *
 * ## Two clocks, and the second one is the point
 *
 * Attention drift is the familiar one: we have not talked about this in a while.
 *
 * Progress drift is the new one. Six conversations since May and the marker has
 * never once been observed is not a late task, it is a wrong plan or missing
 * support, and it is invisible to every tool that only counts whether meetings
 * happened. It surfaces as a question - "is the aim wrong, or is the support
 * missing?" - because a nag would be answering a question the data cannot
 * answer.
 *
 * ## Why nothing here is ever critical
 *
 * Same line topics draw. Nobody is let down because a growth thread stood still
 * for a month; the person let down by a broken promise is let down today. Now is
 * reserved for deviations to act on today, and a page that shouts about
 * development is a page that gets skimmed - which would cost far more than this
 * gains.
 *
 * ## Why `dropped` carries a reason
 *
 * Because the honest ending is common and the tool must not make it feel like a
 * failure. If someone genuinely does not want the direction and it is not a
 * requirement of the job, letting it go is the right call - but letting it go
 * SILENTLY is the worst of the three options, because the disappointment stays
 * readable in the room while the decision never gets said out loud. So a dropped
 * thread keeps its reason, stays visible, and asks once whether it was actually
 * said to the person.
 *
 * Nothing here touches the store.
 */

import { severityFor } from "./cadence.js";
import { daysBetween } from "./time.js";

/**
 * How the direction came about, and it is the first question the form asks.
 *
 * The distinction is not bureaucratic. "Wants it" and "needs it" are different
 * instruments, and using the development one for a performance gap produces a
 * plan the person reads as a disciplinary process with a smile - losing both the
 * trust and the improvement.
 *
 * `unknown` is a first-class answer rather than a missing one. Not knowing is
 * the usual state before the first conversation, and pretending otherwise is how
 * a manager ends up writing somebody else's ambitions for them.
 */
export const DRIVERS = /** @type {const} */ ({
  wants: {
    label: "They want it",
    means: "Their ambition. Your job is air cover and opportunity, not persuasion.",
    /**
     * The question this driver has to answer before anything else, asked in the
     * form rather than left as advice in a conversation somewhere.
     */
    asks: "What have they said they want, in their own words?"
  },
  needs: {
    label: "The job needs it",
    means:
      "An expectation, not an aspiration. Say the 'needs' part once, plainly, and coach every " +
      "step after that: clarity about whether, encouragement about how.",
    asks: "Whose need is it, and what happens if nothing changes?"
  },
  unknown: {
    label: "I do not know yet",
    means: "The normal state before you have asked. The next step is a question, not a plan.",
    asks: "What will you ask them, and when?"
  }
});

/** @typedef {keyof typeof DRIVERS} Driver */

/**
 * How the person answered when the direction was actually put to them.
 *
 * Recorded separately from the driver because the two disagree often, and the
 * disagreement is the most useful thing on the thread. A manager who is sure
 * somebody wants to become a lead, and a person who has never said so, is the
 * single most common way a development plan quietly becomes a burden.
 */
export const STANCES = /** @type {const} */ ({
  agreed: { label: "Landed - same direction" },
  redirected: { label: "They want something else" },
  declined: { label: "No interest in it" },
  unasked: { label: "Not put to them yet" }
});

/** @typedef {keyof typeof STANCES} Stance */

/**
 * What a thread can end as. `open` and `expectation` are the live ones - see
 * {@link isLiveStatus}.
 *
 * `expectation` is the branch almost no manager uses and most situations need:
 * they do not want it and the job requires it anyway, so it stops being
 * development and becomes a stated expectation - including what follows if it is
 * not met, even when what follows is "you stay where you are, and that is a
 * legitimate outcome you get to choose on purpose".
 */
export const STATUSES = /** @type {const} */ ({
  open: { label: "Open" },
  reached: { label: "Reached" },
  dropped: { label: "Let go" },
  expectation: { label: "Stated as an expectation" }
});

/** @typedef {keyof typeof STATUSES} Status */

/**
 * How often a live thread should come up in a one-to-one, by default.
 *
 * A month. Weekly turns development into a status report on somebody's
 * character, and quarterly is slow enough that a wrong direction burns a whole
 * quarter before anybody notices.
 */
export const DEFAULT_CADENCE_DAYS = 30;

/**
 * How long before the thread itself gets questioned rather than followed.
 *
 * A horizon is not a deadline. Nothing is late when it passes; the thread simply
 * stops being taken for granted and gets asked about: is this still the thing?
 */
export const DEFAULT_HORIZON_DAYS = 180;

/**
 * How many conversations about a thread with nothing observed before this reads
 * as stalled.
 *
 * Three. Two is a slow start and calling it a stall would train him to ignore
 * the reading. Four takes most of half a year at a monthly cadence, by which
 * point the answer has cost real time.
 */
export const STALL_AFTER_TALKS = 3;

/**
 * The most threads shown as live at once, across everyone.
 *
 * Attention is the scarce resource this whole tool exists to be honest about,
 * and running a growth thread for every report at once is how none of them get
 * one. This is not enforced anywhere - it is what the UI says out loud when he
 * goes past it, because a limit the tool imposes on his judgement would be the
 * tool deciding how he manages.
 */
export const COMFORTABLE_THREADS = 2;

/**
 * @typedef {object} GrowthRow
 * @property {string} id
 * @property {string} [person] Subject id.
 * @property {string} [aim] One sentence. What they will be able to do.
 * @property {string} [theirWords] The aim as they put it, if they have put it.
 * @property {string} [driver] A {@link Driver}.
 * @property {string} [need] Whose need it is, when the driver is `needs`.
 * @property {string} [ifNothingChanges] The consequence, when the driver is `needs`.
 * @property {string} [hypothesis] His guess before asking. Kept, not overwritten.
 * @property {string} [alreadySeen] What he has observed that supports it.
 * @property {string} [offering] What he is putting in: cover, a room, work he stops doing.
 * @property {string} [assignment] The real work it happens through.
 * @property {string} [marker] The observable: what he sees in three months that he does not now.
 * @property {string} [stance] A {@link Stance}.
 * @property {string} [status] A {@link Status}.
 * @property {string} [endedWhy] Why it ended, for `dropped`, `reached` and `expectation`.
 * @property {boolean} [endingSaid] Whether the ending was actually said to them.
 * @property {number} [cadenceDays]
 * @property {number} [horizon] When to question the thread itself, ms since epoch.
 * @property {number} [startedAt]
 * @property {boolean} [_deleted]
 * @property {number} [_at]
 */

/**
 * @typedef {object} GrowthNote
 * @property {string} [growth] Thread id.
 * @property {number} [at]
 * @property {string} [note]
 * @property {boolean} [observed] True when the marker was actually seen, rather
 *   than merely discussed. The whole progress reading rests on this one flag, so
 *   it is deliberately a separate answer from "did we talk about it".
 * @property {boolean} [_deleted]
 */

/**
 * @typedef {object} ThreadState
 * @property {string} id
 * @property {string} person
 * @property {string} aim
 * @property {string} marker
 * @property {Status} status
 * @property {Driver} driver
 * @property {Stance} stance
 * @property {number} talks How many times it has been discussed.
 * @property {number} observations How many times the marker was actually seen.
 * @property {number | null} lastTalked Ms since epoch, or null.
 * @property {number | null} lastObserved Ms since epoch, or null.
 * @property {number} daysSinceTalked Counted from the thread's start when never.
 * @property {import("./cadence.js").Severity} attention How overdue the conversation is.
 * @property {boolean} stalled Discussed enough times with nothing ever observed.
 * @property {boolean} pastHorizon The thread is due to be questioned, not followed.
 * @property {string} offering What he said he would put in. Read beside `asks`.
 * @property {string | null} asks The one question this thread poses right now.
 */

/**
 * Whether a thread is still running, from its status alone.
 *
 * The one definition, because there were four and two of them disagreed. The
 * word appeared in `threadState`, in the service's live count, in the window
 * and in `isLive` below - and `isLive` said `open` alone while every other copy
 * counted `expectation` too. That is how `missing()` came to hand out homework
 * on a thread that had ended: no single copy was wrong, they simply were not the
 * same copy.
 *
 * An `expectation` counts as running because somebody still has to see
 * something happen. It is an ending for the development conversation and not for
 * the watching, which is why the clocks, the stall reading and the form all
 * treat it as live.
 *
 * @param {Status} status
 * @returns {boolean}
 */
export function isLiveStatus(status) {
  return status === "open" || status === "expectation";
}

/**
 * @param {GrowthRow} row
 * @returns {boolean}
 */
export function isLive(row) {
  return !row._deleted && isLiveStatus(statusOf(row));
}

/**
 * @param {GrowthRow} row
 * @returns {Status}
 */
export function statusOf(row) {
  const value = String(row.status ?? "open");
  return isStatus(value) ? value : "open";
}

/**
 * @param {string} value
 * @returns {value is Status}
 */
export function isStatus(value) {
  return Object.prototype.hasOwnProperty.call(STATUSES, value);
}

/**
 * @param {string} value
 * @returns {value is Driver}
 */
export function isDriver(value) {
  return Object.prototype.hasOwnProperty.call(DRIVERS, value);
}

/**
 * @param {string} value
 * @returns {value is Stance}
 */
export function isStance(value) {
  return Object.prototype.hasOwnProperty.call(STANCES, value);
}

/**
 * Options for a list, derived rather than written out again.
 *
 * Four hand-copied lists in the window have already gone stale against their
 * source in this codebase - one of them silently rewrote a row to the wrong
 * subject, another hid a person from the roster entirely. Every list of choices
 * comes from the definition now.
 *
 * @template {Record<string, { label: string }>} T
 * @param {T} source
 * @returns {{ value: keyof T & string, label: string }[]}
 */
function options(source) {
  return Object.entries(source).map(([value, entry]) => ({
    value: /** @type {keyof T & string} */ (value),
    label: entry.label
  }));
}

export const DRIVER_OPTIONS = options(DRIVERS);
export const STANCE_OPTIONS = options(STANCES);
export const STATUS_OPTIONS = options(STATUSES);

/**
 * Everything about one thread that a view or a card needs, worked out from the
 * notes rather than stored.
 *
 * @param {GrowthRow} row
 * @param {GrowthNote[]} notes
 * @param {{ since?: number }} person
 * @param {number} now
 * @returns {ThreadState}
 */
export function threadState(row, notes, person, now) {
  const mine = notes.filter((n) => !n._deleted && n.growth === row.id && typeof n.at === "number");

  const talks = mine.length;
  const seen = mine.filter((n) => n.observed === true);
  const lastTalked = latest(mine);
  const lastObserved = latest(seen);

  const cadence = Number(row.cadenceDays) > 0 ? Number(row.cadenceDays) : DEFAULT_CADENCE_DAYS;
  const from = lastTalked ?? startOf(row, person, now);
  const daysSinceTalked = Math.max(0, daysBetween(from, now));

  const status = statusOf(row);
  const live = isLiveStatus(status);

  // A closed thread has no clock. Leaving one running would put a finished
  // decision back on the card every month, which is the reverse of the point.
  const attention = live ? severityFor(daysSinceTalked - cadence, cadence) : "ok";

  const stalled = live && seen.length === 0 && talks >= STALL_AFTER_TALKS;
  const horizon = typeof row.horizon === "number" ? row.horizon : null;
  const pastHorizon = live && horizon !== null && horizon <= now;

  return {
    id: String(row.id),
    person: String(row.person ?? ""),
    aim: String(row.aim ?? ""),
    marker: String(row.marker ?? ""),
    status,
    driver: isDriver(String(row.driver)) ? /** @type {Driver} */ (String(row.driver)) : "unknown",
    stance: isStance(String(row.stance)) ? /** @type {Stance} */ (String(row.stance)) : "unasked",
    talks,
    observations: seen.length,
    lastTalked,
    lastObserved,
    daysSinceTalked,
    attention,
    stalled,
    pastHorizon,
    // Carried on the reading rather than left on the row, because the one place
    // it is needed is beside the stall question - which asks whether the aim is
    // wrong or the support is missing, and this is the record of the support.
    offering: String(row.offering ?? ""),
    asks: question({ row, status, stalled, pastHorizon, talks })
  };
}

/**
 * The one question a thread poses right now, or null when it poses none.
 *
 * One, not a list. A thread that asks three things at once gets none of them
 * answered, so these are ordered by which answer unblocks the others: whether
 * the plan is real, then whether it is still the plan, then whether it is moving,
 * then whether the ending was ever said.
 *
 * @param {object} args
 * @param {GrowthRow} args.row
 * @param {Status} args.status
 * @param {boolean} args.stalled
 * @param {boolean} args.pastHorizon
 * @param {number} args.talks
 * @returns {string | null}
 */
function question({ row, status, stalled, pastHorizon, talks }) {
  if (status === "dropped" && row.endingSaid !== true) {
    return "Have you told them you let this go, and why? A quiet ending is the one that costs you.";
  }
  if (!isLiveStatus(status)) {
    return null;
  }
  // Before the first conversation the question is the conversation, NOT the
  // marker. Asking for an observable first was the ordering this shipped with,
  // and it contradicted the whole two-sitting design: the marker is supposed to
  // come OUT of what they say, so nagging for it beforehand invites exactly the
  // thing the split exists to prevent - a manager inventing the other person's
  // yardstick alone at a desk.
  if (String(row.stance ?? "unasked") === "unasked") {
    return talks > 0
      ? "You have discussed this. What did they actually say they want, in their words?"
      : "Ask them. What you will look for comes out of that conversation rather than before it.";
  }
  if (String(row.marker ?? "").trim() === "") {
    return "What will you see in three months that you do not see now? Without that, there is nothing to follow.";
  }
  if (pastHorizon) {
    return "Is this still the thing? The horizon you set has passed.";
  }
  if (stalled) {
    return `Discussed ${talks} times and the marker has never been observed. Is the aim wrong, or is the support missing?`;
  }
  return null;
}

/**
 * Live threads for one person, most neglected first.
 *
 * @param {object} args
 * @param {GrowthRow[]} args.growth
 * @param {GrowthNote[]} args.notes
 * @param {{ id: string, since?: number }} args.person
 * @param {number} args.now
 * @returns {ThreadState[]}
 */
export function threadsFor({ growth, notes, person, now }) {
  return growth
    .filter((row) => !row._deleted && row.person === person.id)
    .map((row) => threadState(row, notes, person, now))
    .sort(compare);
}

/**
 * Every thread that still wants something from him, across everyone.
 *
 * A closed thread with an unsaid ending is included on purpose: it is finished
 * as a plan and unfinished as a conversation, and the second one is what this
 * file exists to stop him from skipping.
 *
 * @param {object} args
 * @param {GrowthRow[]} args.growth
 * @param {GrowthNote[]} args.notes
 * @param {{ id: string, since?: number }[]} args.people
 * @param {number} args.now
 * @returns {ThreadState[]}
 */
export function openQuestions({ growth, notes, people, now }) {
  const byId = new Map(people.map((p) => [p.id, p]));
  /** @type {ThreadState[]} */
  const out = [];
  for (const row of growth) {
    if (row._deleted) {
      continue;
    }
    const person = byId.get(String(row.person ?? ""));
    if (person === undefined) {
      // The person is gone from the roster. Their thread goes with them rather
      // than becoming a row asking about somebody the tool can no longer name.
      continue;
    }
    const state = threadState(row, notes, person, now);
    if (state.asks !== null) {
      out.push(state);
    }
  }
  return out.sort(compare);
}

/**
 * Sort order: what is most likely to have been forgotten, first.
 *
 * A thread posing a question outranks one that is merely overdue, because the
 * question is the part he cannot work out from the row himself.
 *
 * @param {ThreadState} a
 * @param {ThreadState} b
 */
function compare(a, b) {
  const asking = Number(b.asks !== null) - Number(a.asks !== null);
  if (asking !== 0) {
    return asking;
  }
  return b.daysSinceTalked - a.daysSinceTalked;
}

/**
 * What a never-discussed thread counts from.
 *
 * Its own start, then the relationship's, then the row's creation. Unlike a
 * topic this does NOT reach back to the start of the relationship by default:
 * a topic never asked in two years is genuinely two years unasked, but a growth
 * thread written today is a decision made today, and dating it earlier would
 * open it already overdue.
 *
 * @param {GrowthRow} row
 * @param {{ since?: number }} person
 * @param {number} now
 * @returns {number}
 */
function startOf(row, person, now) {
  if (typeof row.startedAt === "number") {
    return row.startedAt;
  }
  if (typeof row._at === "number") {
    return row._at;
  }
  if (typeof person.since === "number") {
    return person.since;
  }
  return now;
}

/**
 * @param {GrowthNote[]} notes
 * @returns {number | null}
 */
function latest(notes) {
  let out = null;
  for (const n of notes) {
    const at = Number(n.at);
    if (!Number.isFinite(at)) {
      continue;
    }
    if (out === null || at > out) {
      out = at;
    }
  }
  return out;
}

/**
 * What the form still wants, for the sitting he is in.
 *
 * Split into two sittings because the questions belong to different rooms. Stage
 * A is what he can prepare alone and is explicitly his guesswork; stage B is
 * what the conversation returned. Collapsing them into one screen is how a
 * manager ends up writing somebody else's plan for them at their own desk, which
 * is the exact failure this whole design is arranged around.
 *
 * Both lists are empty for a thread that has ended, which matters beyond the
 * card: this is returned over MCP and read back from opening and updating a
 * thread, so an agent would otherwise be handed questions to help with that
 * nobody can answer any more.
 *
 * @param {GrowthRow} row
 * @returns {{ prepare: string[], ask: string[] }}
 */
export function missing(row) {
  // An ended thread wants nothing prepared and nothing asked. The questions are
  // homework for a conversation that is not going to happen, and on a dropped
  // thread they are worse than noise: "which real work does this happen
  // through?" against a direction that was let go reads as the tool not having
  // noticed the decision - the one thing a dropped thread is supposed to make
  // unmissable. `question()` has always returned null here; these two lists
  // disagreed with it, and the disagreement was legible on the card as "Still to
  // ask them" printed under an ending.
  if (!isLiveStatus(statusOf(row))) {
    return { prepare: [], ask: [] };
  }

  /** @type {string[]} */
  const prepare = [];
  /** @type {string[]} */
  const ask = [];

  const driver = isDriver(String(row.driver)) ? String(row.driver) : "";
  if (driver === "") {
    prepare.push("Do they want this, or does the job need it?");
  }
  if (driver === "needs") {
    if (blank(row.need)) {
      prepare.push("Whose need is it? Name it concretely.");
    }
    if (blank(row.ifNothingChanges)) {
      // The uncomfortable one, and the reason it is in the form rather than in
      // advice: if the honest answer is "nothing", it is a wish, and calling a
      // wish a need is a thing to stop doing before the conversation, not after.
      prepare.push("What happens if nothing changes? If the answer is nothing, this is a wish.");
    }
  }
  if (blank(row.hypothesis)) {
    // Only reachable when a thread was opened from outside the window, which
    // fills this from the aim. Worded as the record it is rather than as a
    // second "what is the direction": asking that twice is what made the first
    // version of the form unreadable.
    prepare.push("Write down what you thought before you asked them, so it survives being wrong.");
  }
  if (blank(row.alreadySeen)) {
    prepare.push("What have you already seen that supports it? Empty is itself the finding.");
  }
  if (blank(row.offering)) {
    prepare.push("What are you putting in - cover, a room, work you stop doing yourself?");
  }

  if (blank(row.theirWords)) {
    ask.push("What do they want to be able to do in a year that they cannot now? Their words.");
  }
  if (String(row.stance ?? "unasked") === "unasked") {
    ask.push("How did that land against your guess?");
  }
  if (blank(row.assignment)) {
    ask.push("Which real work does this happen through? Name the assignment, not a skill area.");
  }
  if (blank(row.marker)) {
    ask.push("What will you see in three months that you do not see now?");
  }

  return { prepare, ask };
}

/** @param {unknown} value */
function blank(value) {
  return String(value ?? "").trim() === "";
}
