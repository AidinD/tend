/**
 * The operations Tend can perform.
 *
 * This layer exists so that no capability is implemented twice. The MCP server
 * calls these and serialises the result; the Electron app will call the same
 * functions and render it. If the app can do something, an agent can ask for it,
 * and the two can never disagree about what the data says.
 *
 * Everything here returns plain objects. Nothing here formats for a screen and
 * nothing here knows about MCP.
 */

import { buildAttention, expandCadences, meanDrift } from "../domain/attention.js";
import { myAttention } from "../domain/myattention.js";
import { RELATIONS, isRelation } from "../domain/cadence.js";
import { CONTACT_KINDS, SUBJECT_KINDS, evidenceFor, kindsFor, subjectOf } from "../domain/contact.js";
import { DEFAULT_STRETCH, focusStatus } from "../domain/focus.js";
import {
  COMFORTABLE_THREADS,
  DEFAULT_CADENCE_DAYS,
  DEFAULT_HORIZON_DAYS,
  DRIVERS,
  STANCES,
  STATUSES,
  isDriver,
  isStance,
  isStatus,
  missing,
  openQuestions,
  threadsFor
} from "../domain/growth.js";
import { availability, hasLeft, inScope, isAway } from "../domain/people.js";
import { JOURNAL_FIELDS, REVIEW_WINDOW_DAYS, coverage, entriesSince, hasContent } from "../domain/journal.js";
import { openPromises } from "../domain/promises.js";
import { recentSkips, skipPattern, skipsFor } from "../domain/skips.js";
import {
  DEFAULT_WAIT_DAYS,
  WAIT_ENDINGS,
  isWaitEnding,
  openWaits,
  waitsDue
} from "../domain/waiting.js";
import { signalsDue } from "../domain/signals.js";
import { DEFAULT_STAKE_DAYS, namedStakes, stakeInterval } from "../domain/stakes.js";
import { TOPICS_PER_CARD, appliesTo, lastRaised, topicsFor } from "../domain/topics.js";
import { agoWords, driftBadge, humanDays, isLaterDay } from "../domain/time.js";
import { LEVELS, isLevel, isUnspecified, reviewInterval } from "../domain/workstreams.js";
import { resolvePerson, resolveProject, resolveStake, resolveWorkstream } from "./resolve.js";
import { decideDecision, decisions, logDecision, revisitsDue, stillHolds } from "./ledger.js";

export { resolvePerson, resolveProject, resolveStake, resolveWorkstream };
export { decideDecision, decisions, logDecision, revisitsDue, stillHolds };
import { PREP_CARDS, prep } from "./prep.js";

export { PREP_CARDS, prep };

/** Collections an agent may add rows to. Structure is not on this list. */
export const AGENT_WRITABLE = /** @type {const} */ (["promises", "touches", "evidence"]);

/* -------------------------------------------------------------- reading -- */

/**
 * What needs attention now. The Now view, as data.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {number} now
 */
export function attention(store, now) {
  const a = buildAttention(store.state(), now);
  return {
    needsYou: a.needs.map(summariseItem),
    nudges: a.nudges.map(summariseItem),
    heldBackByFocus: a.muted,
    allInStep: a.quiet,
    focus: a.focus.active
      ? { summary: a.focus.summary, overrun: a.focus.overrun, cost: a.focus.cost.summary }
      : null
  };
}

/**
 * Signals about the user's own attention.
 *
 * Separate from `attention`, which is about drift against a duty. These are
 * patterns in how the user spent the month, and every one of them has a
 * first-person subject on purpose - see the header of myattention.js for why
 * that constraint is in the code rather than only in a document.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {number} now
 */
export function myAttentionSignals(store, now) {
  return myAttention({
    people: /** @type {any[]} */ (store.rows("people")),
    touches: /** @type {any[]} */ (store.rows("touches")),
    stakes: /** @type {any[]} */ (store.rows("stakes")),
    now
  });
}

/** @param {import("../domain/attention.js").AttentionItem} i */
function summariseItem(i) {
  return {
    key: i.key,
    what: i.title,
    why: i.why,
    urgency: i.severity,
    actualUrgency: i.trueSeverity,
    behindBy: i.badge,
    guarded: i.guarded,
    from: i.source,
    person: i.subject,
    // What the subject IS, not only its id. A card for a project cadence and a
    // card for a person cadence look identical without it, and the actions they
    // can honestly offer are different.
    subjectKind: i.subjectKind ?? null
  };
}

/**
 * Everything known about one person.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} query
 * @param {number} now
 */
export function person(store, query, now) {
  const found = resolvePerson(store, query);
  if (!found.ok) {
    return { error: found.error };
  }
  const p = found.person;
  const state = store.state();

  const cadences = expandCadences(state, now)
    .filter((c) => c.subject.id === p.id)
    .map((c) => ({
      duty: c.duty.name,
      target: `every ${c.drift.interval} days`,
      lastHappened: c.drift.everHappened ? agoWords(c.drift.daysSince) : "never",
      behindBy: driftBadge(c.drift.driftDays),
      urgency: c.drift.trueSeverity
    }));

  const promises = openPromises(store.rows("promises"), now)
    .filter((x) => x.person === p.id)
    .map((x) => ({ id: x.id, text: x.text, openFor: humanDays(x.status.ageDays), urgency: x.status.severity }));

  const history = store
    .rows("touches")
    .filter((t) => t.subject === p.id)
    .sort((a, b) => Number(b.at ?? 0) - Number(a.at ?? 0))
    .slice(0, 20)
    .map((t) => ({
      // The id, so a mislogged contact can be taken back. Without it the history
      // was read-only and a wrong entry was permanent.
      id: t.id,
      kind: t.kind,
      when: agoWords(Math.max(0, Math.floor((now - Number(t.at ?? now)) / 86_400_000))),
      at: t.at ?? null,
      note: t.note ?? null
    }));

  const evidence = store
    .rows("evidence")
    .filter((e) => e.person === p.id)
    .sort((a, b) => Number(b.at ?? 0) - Number(a.at ?? 0))
    .slice(0, 20)
    .map((e) => ({ text: e.text, at: e.at, by: e._by }));

  // Themes are the one thing here a model wrote rather than a person, so they
  // carry where they came from all the way to the screen. Newest first: a
  // scheduled pass refreshes a row in place, so the date is when it was last
  // seen rather than when it was first noticed.
  const themes = store
    .rows("themes")
    .filter((t) => t.person === p.id)
    .sort((a, b) => Number(b.seenAt ?? 0) - Number(a.seenAt ?? 0))
    .map((t) => ({
      id: t.id,
      name: t.name,
      evidence: t.evidence ?? "",
      times: Number(t.times ?? 0),
      source: t.source ?? null,
      seenAt: t.seenAt ?? null
    }));

  const relation = String(p.relation ?? "");

  return {
    id: p.id,
    name: p.name,
    relation: p.relation,
    // Carried so the edit dialog can show it. It is the date every cadence
    // measures from until there is contact to measure from instead, which
    // makes it the one field somebody sets wrong once and never revisits.
    since: p.since ?? null,
    relationMeans: isRelation(relation) ? RELATIONS[relation].note : "Unknown relationship type.",
    // Beside the contact history rather than mixed into it: a cancellation is
    // not a conversation, and the two must stay legible as different things.
    skipped: recentSkips(store.rows("skips"), p.id).map((s) => ({
      id: String(s.id),
      kind: String(s.kind ?? ""),
      why: s.why ?? null,
      when: agoWords(Math.max(0, Math.floor((now - Number(s.at ?? now)) / 86_400_000)))
    })),
    skipPattern: skipPattern(skipsFor(store.rows("skips"), p.id, now, "one-to-one"), "1-1"),
    awayUntil: p.awayUntil ?? null,
    leftAt: p.leftAt ?? null,
    availability: availability(p, now),
    cadences,
    openPromises: promises,
    recentContact: history,
    observations: evidence,
    themes
  };
}

/**
 * The roster, optionally filtered by relationship type.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {number} now
 * @param {string} [relation]
 */
export function people(store, now, relation) {
  const cadences = expandCadences(store.state(), now);
  return store
    .rows("people")
    .filter((p) => !relation || p.relation === relation)
    .map((p) => {
      const theirs = cadences.filter((c) => c.subject.id === p.id);
      const worst = theirs[0];
      return {
        id: p.id,
        name: p.name,
        relation: p.relation,
        // Said on the roster, because "no duty applies" reads as a gap in the
        // setup when the truth is that somebody is on leave or has left.
        availability: availability(p, now),
        worstDrift: worst ? { duty: worst.duty.name, behindBy: driftBadge(worst.drift.driftDays), urgency: worst.drift.trueSeverity } : null
      };
    })
    .sort((a, b) => (b.worstDrift ? 1 : 0) - (a.worstDrift ? 1 : 0));
}

/**
 * @param {import("../storage/store.js").TendStore} store
 * @param {number} now
 */
export function promises(store, now) {
  const names = new Map(store.rows("people").map((p) => [p.id, p.name]));
  return openPromises(store.rows("promises"), now).map((p) => ({
    id: p.id,
    to: names.get(String(p.person)) ?? null,
    text: p.text,
    openFor: humanDays(p.status.ageDays),
    urgency: p.status.severity,
    why: p.status.why,
    loggedBy: p._by
  }));
}

/**
 * @param {import("../storage/store.js").TendStore} store
 * @param {number} now
 */
export function roleMap(store, now) {
  const cadences = expandCadences(store.state(), now);
  const group = (/** @type {string} */ status) =>
    store
      .rows("duties")
      .filter((d) => (d.status ?? "active") === status)
      .map((d) => {
        const theirs = cadences.filter((c) => c.duty.id === d.id);
        const behind = theirs.filter((c) => c.drift.trueSeverity !== "ok").length;
        return {
          id: d.id,
          name: d.name,
          means: d.means ?? null,
          source: d.source ?? "yours",
          appliesTo: d.subjectKind,
          relations: d.relations ?? "all",
          every: d.cadenceDays ? `${d.cadenceDays} days` : "no cadence",
          keepWhileLeaving: d.keepWhileLeaving !== false,
          // The number as well as the sentence. The edit form used to recover it
          // by stripping non-digits out of the sentence, which turns "no
          // cadence" into zero and would break the day the wording changes.
          cadenceDays: Number(d.cadenceDays) > 0 ? Number(d.cadenceDays) : null,
          guarded: Boolean(d.guarded),
          subjectsBehind: status === "active" ? `${behind} of ${theirs.length}` : null,
          proposedBy: d._by
        };
      });

  return { active: group("active"), proposed: group("proposed"), declined: group("declined").length };
}

/**
 * @param {import("../storage/store.js").TendStore} store
 * @param {number} now
 */
export function focus(store, now) {
  const f = store.focus();
  const status = focusStatus(f, now);
  if (!status.active) {
    return { active: false, summary: status.summary };
  }
  const a = buildAttention(store.state(), now);
  return {
    active: true,
    name: f?.name,
    summary: status.summary,
    overrun: status.overrun,
    budgetOfWeek: f?.budget ?? null,
    stretchInForce: status.stretch,
    heldBackRightNow: a.muted,
    cost: a.focus.cost.summary
  };
}

/**
 * @param {import("../storage/store.js").TendStore} store
 * @param {number} now
 */
export function projects(store, now) {
  const cadences = expandCadences(store.state(), now).filter((c) => c.subjectKind === "project");
  return store.rows("projects").map((p) => {
    const worst = cadences.filter((c) => c.subject.id === p.id)[0];
    return {
      id: p.id,
      name: p.name,
      // `agoWords`, not `humanDays` plus " ago" - the helper exists precisely
      // because the hand-rolled version says "today ago". The prep card has a
      // check against that phrase and this view was saying it every day a
      // project had just been looked at.
      lastLookedAt: worst ? (worst.drift.everHappened ? agoWords(worst.drift.daysSince) : "never") : "no cadence",
      behindBy: worst ? driftBadge(worst.drift.driftDays) : null,
      urgency: worst ? worst.drift.trueSeverity : "ok"
    };
  });
}

/* -------------------------------------------------------------- writing -- */

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
  if (!isRelation(String(relation))) {
    return { error: `Unknown relationship type "${relation}". Valid: ${Object.keys(RELATIONS).join(", ")}.` };
  }
  const clash = store.rows("people").find((p) => String(p.name).toLowerCase() === String(name).trim().toLowerCase());
  if (clash) {
    return { error: `"${name}" is already here. Use setRelation to change how you relate to them.` };
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
  if (!isRelation(String(relation))) {
    return { error: `Unknown relationship type "${relation}". Valid: ${Object.keys(RELATIONS).join(", ")}.` };
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
    const clash = store
      .rows("people")
      .find((p) => p.id !== found.person.id && String(p.name).toLowerCase() === trimmed.toLowerCase());
    if (clash) {
      return { error: `Somebody else is already called "${trimmed}".` };
    }
    patch.name = trimmed;
  }

  if (relation !== undefined) {
    if (!isRelation(String(relation))) {
      return { error: `Unknown relationship type "${relation}". Valid: ${Object.keys(RELATIONS).join(", ")}.` };
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
  const clash = store.rows("projects").find((p) => String(p.name).toLowerCase() === String(name).trim().toLowerCase());
  if (clash) {
    return { error: `"${name}" is already here.` };
  }
  const id = store.create("projects", {
    name: String(name).trim(),
    since: typeof since === "number" ? since : now
  });
  return { id, added: name };
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

/* ------------------------------------------------------------- signals -- */

/**
 * The monthly questions, and which are due.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {number} now
 */
export function signals(store, now) {
  return signalsDue(store.rows("signals"), store.rows("signalAnswers"), now).map((s) => ({
    id: s.id,
    question: s.text,
    why: s.why,
    due: s.severity !== "ok",
    lastAsked: s.everAnswered ? `${s.daysSince} days ago` : "never",
    lastAnswer: s.lastAnswer
  }));
}

/**
 * Answer one. A "yes" comes back round in a week rather than a month, because
 * a problem you flagged should not wait for the next cycle.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} args.signal
 * @param {"yes" | "no"} args.answer
 * @param {string} [args.note]
 * @param {number} args.now
 */
export function answerSignal(store, { signal, answer, note, now }) {
  const row = store.rows("signals").find((s) => s.id === signal);
  if (!row) {
    return { error: `No signal question with id "${signal}".` };
  }
  if (answer !== "yes" && answer !== "no") {
    return { error: `Answer must be "yes" or "no".` };
  }
  if (answer === "yes" && !String(note ?? "").trim()) {
    return { error: "A yes needs a note saying what you saw. A bare yes is not actionable later." };
  }
  store.create("signalAnswers", { signal, answer, note: note ?? null, at: now });
  return { signal, answer, nextAskedIn: answer === "yes" ? "7 days" : "30 days" };
}

/* --------------------------------------------------------- workstreams -- */

/**
 * @param {import("../storage/store.js").TendStore} store
 * @param {number} now
 */
export function workstreams(store, now) {
  const names = new Map(store.rows("people").map((p) => [String(p.id), String(p.name)]));
  const projects = new Map(store.rows("projects").map((p) => [String(p.id), String(p.name)]));
  const touches = store.rows("touches");

  return store.rows("workstreams").map((w) => {
    const last = touches
      .filter((t) => t.subject === w.id && t.kind === "delegation-review")
      .sort((a, b) => Number(b.at ?? 0) - Number(a.at ?? 0))[0];
    const level = String(w.level ?? "");
    return {
      id: w.id,
      name: w.name,
      project: w.project ? (projects.get(String(w.project)) ?? null) : null,
      owner: w.owner ? (names.get(String(w.owner)) ?? null) : null,
      level: w.level ?? null,
      levelMeans: isLevel(level) ? LEVELS[level].means : "Not stated.",
      // Who decides, as opposed to how closely you follow. The sentence you
      // should be able to read to them.
      mandate: isLevel(level) ? LEVELS[level].authority : "Nobody has said who decides.",
      reviewEvery: `${reviewInterval(w.level)} days`,
      lastReviewed: last ? humanDays(Math.max(0, daysSinceMs(Number(last.at), now))) + " ago" : "never",
      unspecified: isUnspecified(w)
    };
  });
}

/**
 * @param {number} at
 * @param {number} now
 */
function daysSinceMs(at, now) {
  return Math.floor((now - at) / 86_400_000);
}

/**
 * Add a piece of work with a delegation level.
 *
 * The level sits here rather than on the project or the person, because how
 * closely you follow up depends on how experienced this person is at this
 * particular task. A project-wide level would be a guess and a person-wide one
 * would be a judgement about them rather than about the work.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} args.name
 * @param {string} [args.owner]
 * @param {string} [args.project]
 * @param {string} [args.level]
 * @param {number} args.now
 */
export function addWorkstream(store, { name, owner, project, level, now }) {
  if (!String(name ?? "").trim()) {
    return { error: "A workstream needs a name." };
  }
  if (level !== undefined && !isLevel(String(level))) {
    return { error: `Unknown level "${level}". Valid: ${Object.keys(LEVELS).join(", ")}.` };
  }

  let ownerId = null;
  if (owner) {
    const found = resolvePerson(store, owner);
    if (!found.ok) {
      return { error: found.error };
    }
    ownerId = found.person.id;
  }

  let projectId = null;
  if (project) {
    const found = resolveProject(store, project);
    if (!found.ok) {
      return { error: found.error };
    }
    projectId = found.project.id;
  }

  const id = store.create("workstreams", {
    name: String(name).trim(),
    owner: ownerId,
    project: projectId,
    level: level ?? null,
    since: now
  });
  return { id, added: name, level: level ?? "not set" };
}

/**
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} id
 * @param {string} level
 */
export function setDelegationLevel(store, id, level) {
  const row = store.rows("workstreams").find((w) => w.id === id);
  if (!row) {
    return { error: `No workstream with id "${id}".` };
  }
  if (!isLevel(String(level))) {
    return { error: `Unknown level "${level}". Valid: ${Object.keys(LEVELS).join(", ")}.` };
  }
  store.update("workstreams", id, { level });
  return { id, level, reviewEvery: `${reviewInterval(level)} days` };
}

/* ----------------------------------------------------------- nib links -- */

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
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} args.person
 * @param {string} args.categoryId Nib category id.
 * @param {string} [args.subId] Nib sub-category id. Omit for the whole category.
 * @param {string} [args.label] Human-readable name of the Nib folder, for the UI.
 */
export function bindSource(store, { person: who, categoryId, subId, label }) {
  const found = resolvePerson(store, who);
  if (!found.ok) {
    return { error: found.error };
  }
  if (!String(categoryId ?? "").trim()) {
    return { error: "A binding needs a Nib category id." };
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
    return {
      error: `That Nib folder is already bound to ${
        store.rows("people").find((p) => p.id === clash.person)?.name ?? "someone"
      }. Unbind it first.`
    };
  }

  const id = store.create("sources", {
    person: found.person.id,
    categoryId,
    subId: subId ?? null,
    label: label ?? null,
    rules: []
  });
  return { id, bound: `${label ?? categoryId} → ${found.person.name}` };
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
    rows = rows.filter((s) => s.person === found.person.id);
  }
  return rows.map((s) => ({
    id: s.id,
    person: names.get(String(s.person)) ?? null,
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
    return { error: "A proposed duty needs a name and a plain description of what it means." };
  }
  if (!(Number(cadenceDays) > 0)) {
    return { error: "A proposed duty needs a positive cadence in days." };
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
  return { id, proposed: name, note: "Proposed only. It does nothing until accepted in the app." };
}

/* ----------------------------------------------------------- focus edits -- */

/**
 * Start a focus, or replace the one running.
 *
 * The baseline drift is captured here and nowhere else. Without it the focus
 * can never say what it cost, and "what did this cost me" is the honest half of
 * the feature - the half that stops a focus from quietly becoming the job.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} args.name
 * @param {number} [args.endsAt] Milliseconds since epoch.
 * @param {number} [args.budget] Share of the week, 0 to 1.
 * @param {number} [args.stretch]
 * @param {string[]} [args.guarded] Duty ids this focus may never dampen.
 * @param {number} args.now
 */
export function setFocus(store, { name, endsAt, budget, stretch, guarded, now }) {
  if (!String(name ?? "").trim()) {
    return { error: "A focus needs a name - what are you actually trying to get done?" };
  }
  if (typeof endsAt === "number" && endsAt <= now) {
    return { error: "The end date is in the past. A focus without a future end date cannot revert." };
  }
  if (budget !== undefined && (!(budget > 0) || budget > 1)) {
    return { error: "Budget is a share of the week between 0 and 1." };
  }

  const baselineDrift = meanDrift(expandCadences(store.state(), now));

  store.emit("focus.set", {
    id: randomId(),
    name: String(name).trim(),
    startedAt: now,
    endsAt: endsAt ?? null,
    budget: budget ?? null,
    stretch: stretch ?? DEFAULT_STRETCH,
    guarded: guarded ?? [],
    baselineDrift
  });

  return { name, baselineDrift: Number(baselineDrift.toFixed(2)) };
}

/**
 * @param {import("../storage/store.js").TendStore} store
 */
export function endFocus(store) {
  if (!store.focus()) {
    return { error: "No focus is running." };
  }
  const was = String(store.focus()?.name ?? "");
  store.emit("focus.end", {});
  return { ended: was, note: "Every stretched threshold is back to normal." };
}

/** Ids that read as ids rather than as anything meaningful. */
function randomId() {
  return `f-${Math.floor(Date.now() % 1_000_000_000).toString(36)}`;
}

/* ------------------------------------------------------------ role edits -- */

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
    return { error: "A cadence has to be a positive number of days." };
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
    "chases"
  ];
  if (!removable.includes(collection)) {
    return { error: `Rows in "${collection}" are not removable. Removable: ${removable.join(", ")}.` };
  }
  const row = store.rows(collection).find((r) => r.id === id);
  if (!row) {
    return { error: `No ${collection} row with id "${id}".` };
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

/* -------------------------------------------------------------- topics -- */

/**
 * The topics standing against one person, due or not.
 *
 * The app needs both: the prep card shows only what is due, but the person's
 * page has to show the whole set, because "asked six weeks ago" is the answer
 * to "should I bring this up again" just as much as "never asked" is.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} who Name or id.
 * @param {number} now
 */
export function topics(store, who, now) {
  const found = resolvePerson(store, who);
  if (!found.ok) {
    return { error: found.error };
  }
  const person = found.person;
  const raised = store.rows("raised");

  const all = store
    .rows("topics")
    .filter((t) => appliesTo(t, /** @type {any} */ (person)))
    .map((t) => {
      const last = lastRaised(raised, String(t.id), String(person.id));
      return {
        id: String(t.id),
        text: String(t.text ?? ""),
        why: String(t.why ?? ""),
        every: `${Number(t.cadenceDays)} days`,
        lastRaised: last === null ? "never" : agoWords(daysBetweenNow(last, now)),
        pinned: typeof t.person === "string" && t.person !== "",
        status: String(t.status ?? "active")
      };
    });

  const due = topicsFor({
    topics: store.rows("topics"),
    raised,
    person: /** @type {any} */ (person),
    now,
    limit: TOPICS_PER_CARD
  });

  return { person: person.name, topics: all, due };
}

/**
 * Every topic, including the proposed ones waiting on him.
 *
 * @param {import("../storage/store.js").TendStore} store
 */
export function allTopics(store) {
  return store.rows("topics").map((t) => ({
    id: String(t.id),
    text: String(t.text ?? ""),
    why: String(t.why ?? ""),
    cadenceDays: Number(t.cadenceDays ?? 0),
    relations: Array.isArray(t.relations) ? t.relations : [],
    person: typeof t.person === "string" ? t.person : null,
    status: String(t.status ?? "active"),
    source: String(t.source ?? "")
  }));
}

/**
 * Propose a topic. Proposed only - it appears nowhere until he accepts it.
 *
 * Same boundary as duties, and it matters more here rather than less: a tool
 * that installs its own list of career questions has decided what his career is
 * about, which is not a thing software gets to decide.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} args.text
 * @param {string} args.why
 * @param {number} args.cadenceDays
 * @param {string[]} [args.relations]
 * @param {string} [args.person] Name or id, to pin it to one person.
 * @param {string} [args.source]
 * @param {string} [args.id] A stable id, so a seed can be re-run without duplicating.
 * @param {"proposed" | "active"} [args.status]
 */
export function proposeTopic(store, { text, why, cadenceDays, relations, person: who, source, id, status }) {
  if (!String(text ?? "").trim() || !String(why ?? "").trim()) {
    return { error: "A topic needs the thing to raise and why it is worth the minutes." };
  }
  if (!(Number(cadenceDays) > 0)) {
    return { error: "A topic needs a positive interval in days." };
  }
  if (relations && relations.some((r) => !isRelation(r))) {
    return { error: `Unknown relationship type. Valid: ${Object.keys(RELATIONS).join(", ")}.` };
  }

  let pinned;
  if (who !== undefined && String(who).trim() !== "") {
    const found = resolvePerson(store, who);
    if (!found.ok) {
      return { error: found.error };
    }
    pinned = String(found.person.id);
  }

  if (pinned === undefined && (relations ?? []).length === 0) {
    return { error: "A topic applies to a relationship type or to one person. It needs one of them." };
  }

  const fields = {
    text: String(text).trim(),
    why: String(why).trim(),
    cadenceDays: Number(cadenceDays),
    relations: relations ?? [],
    person: pinned ?? null,
    source: source ?? "proposed",
    status: status === "active" ? "active" : "proposed"
  };

  // A stable id makes the seed re-runnable: running it twice updates the same
  // row rather than laying a second copy of every question on top of the first.
  if (typeof id === "string" && id !== "") {
    const existing = store.rows("topics").find((t) => t.id === id);
    if (existing) {
      store.update("topics", id, fields);
      return { id, updated: true };
    }
    store.create("topics", { ...fields, id });
    return { id, proposed: fields.text };
  }

  const made = store.create("topics", fields);
  return { id: made, proposed: fields.text };
}

/**
 * Accept or decline a proposed topic.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} id
 * @param {"active" | "declined"} status
 * @param {object} [overrides]
 */
export function decideTopic(store, id, status, overrides = {}) {
  const row = store.rows("topics").find((t) => t.id === id);
  if (!row) {
    return { error: `No topic with id "${id}".` };
  }
  store.update("topics", id, { ...overrides, status });
  return { id, status };
}

/**
 * Record that a topic was raised with someone.
 *
 * Per person, not per topic: the same standing question put to one peer lead
 * has not been put to the others.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} args.topic Topic id.
 * @param {string} args.person Name or id.
 * @param {string} [args.note] What came back, in a line.
 * @param {number} [args.at]
 * @param {number} args.now
 */
export function markRaised(store, { topic, person: who, note, at, now }) {
  const row = store.rows("topics").find((t) => t.id === topic);
  if (!row) {
    return { error: `No topic with id "${topic}".` };
  }
  const found = resolvePerson(store, who);
  if (!found.ok) {
    return { error: found.error };
  }
  const when = typeof at === "number" ? at : now;
  if (isLaterDay(when, now)) {
    return { error: "That day has not arrived yet. A topic is marked raised after the conversation, not before." };
  }

  const id = store.create("raised", {
    topic: String(topic),
    person: String(found.person.id),
    note: String(note ?? ""),
    at: when
  });
  return { id, topic: String(row.text ?? ""), person: found.person.name };
}

/**
 * Whole days between two instants, floored at zero.
 *
 * @param {number} then
 * @param {number} now
 */
function daysBetweenNow(then, now) {
  return Math.max(0, Math.floor((now - then) / 86_400_000));
}

/* ---------------------------------------------------------- stakeholders -- */

/**
 * Who is waiting to hear about what, and how long since they did.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {number} now
 * @param {string} [project] Name or id, to narrow it to one project.
 */
export function stakeholders(store, now, project) {
  let only = null;
  if (project !== undefined && String(project).trim() !== "") {
    const found = resolveProject(store, project);
    if (!found.ok) {
      return { error: found.error };
    }
    only = String(found.project.id);
  }

  const touches = store.rows("touches");
  const named = namedStakes(store.rows("stakes"), store.rows("people"), store.rows("projects"));
  const projects = new Map(store.rows("projects").map((p) => [String(p.id), String(p.name ?? "")]));
  const people = new Map(store.rows("people").map((p) => [String(p.id), String(p.name ?? "")]));

  return named
    .filter((s) => only === null || String(s.project) === only)
    .map((s) => {
      const last = touches
        .filter((t) => t.subject === s.id && t.kind === "update" && typeof t.at === "number")
        .sort((a, b) => Number(b.at) - Number(a.at))[0];
      const days = last ? Math.max(0, Math.floor((now - Number(last.at)) / 86_400_000)) : null;
      const interval = stakeInterval(s);
      return {
        id: String(s.id),
        person: people.get(String(s.person)) ?? "",
        project: projects.get(String(s.project)) ?? "",
        label: String(s.name ?? ""),
        every: `${interval} days`,
        // "never" and "today" are different facts and neither is a number, so
        // both are words. A card that says "0 days ago" for something that has
        // not happened at all is the reason this is not just a count.
        lastUpdated: days === null ? "never" : agoWords(days),
        behindBy: driftBadge((days ?? 0) - interval),
        note: last?.note ?? null
      };
    })
    .sort((a, b) => (a.lastUpdated === "never" ? -1 : 0) - (b.lastUpdated === "never" ? -1 : 0));
}

/**
 * Record that somebody is a stakeholder in a project.
 *
 * Structure, so this is the user's to do rather than an agent's - same boundary
 * as the role map. An agent that can decide who you owe a report to has decided
 * part of your job.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} args.person Name or id.
 * @param {string} args.project Name or id.
 * @param {number} [args.cadenceDays] How often they should hear from you.
 * @param {string} [args.what] What they actually want to know, in a line.
 * @param {number} [args.since] When they started waiting. Defaults to now.
 */
export function addStake(store, { person: who, project, cadenceDays, what, since }) {
  const foundPerson = resolvePerson(store, who);
  if (!foundPerson.ok) {
    return { error: foundPerson.error };
  }
  const foundProject = resolveProject(store, project);
  if (!foundProject.ok) {
    return { error: foundProject.error };
  }

  const personId = String(foundPerson.person.id);
  const projectId = String(foundProject.project.id);

  const already = store
    .rows("stakes")
    .find((s) => String(s.person) === personId && String(s.project) === projectId);
  if (already) {
    return {
      error: `${foundPerson.person.name} is already a stakeholder in ${foundProject.project.name}. Change the interval on the existing one rather than adding a second.`
    };
  }

  const every = Number(cadenceDays);
  if (cadenceDays !== undefined && !(every > 0)) {
    return { error: "An interval has to be a positive number of days." };
  }

  // Backdatable, and the default is deliberately the cautious one. Somebody
  // added today has waited no time at all, so they do not arrive already
  // overdue - but "they have been waiting since March" is a thing that is often
  // true when a stakeholder gets written down, and it has to be sayable or the
  // first month of the record is a lie in the flattering direction.
  const started = Number(since);
  const id = store.create("stakes", {
    person: personId,
    project: projectId,
    cadenceDays: every > 0 ? every : DEFAULT_STAKE_DAYS,
    what: String(what ?? "").trim() || null,
    since: Number.isFinite(started) && started > 0 ? started : undefined
  });
  return {
    id,
    added: `${foundPerson.person.name} on ${foundProject.project.name}`,
    every: `${every > 0 ? every : DEFAULT_STAKE_DAYS} days`
  };
}

/**
 * Change how often a stakeholder should hear from you, or what they want.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} id
 * @param {object} fields
 * @param {number} [fields.cadenceDays]
 * @param {string} [fields.what]
 */
export function updateStake(store, id, { cadenceDays, what }) {
  const found = resolveStake(store, id);
  if (!found.ok) {
    return { error: found.error };
  }
  /** @type {Record<string, any>} */
  const patch = {};
  if (cadenceDays !== undefined) {
    if (!(Number(cadenceDays) > 0)) {
      return { error: "An interval has to be a positive number of days." };
    }
    patch.cadenceDays = Number(cadenceDays);
  }
  if (what !== undefined) {
    patch.what = String(what).trim() || null;
  }
  if (Object.keys(patch).length === 0) {
    return { error: "Nothing to change." };
  }
  store.update("stakes", id, patch);
  return { id, changed: Object.keys(patch) };
}

/* ----------------------------------------------------------------- skips -- */

/**
 * Record that something booked did not happen.
 *
 * Never satisfies a cadence, and is deliberately stored in its own collection so
 * that it cannot start doing so by accident. See src/domain/skips.js: the value
 * is entirely in the difference between "we never booked it" and "we booked it
 * and cancelled it three times", which a tool that only counts contact cannot
 * see at all.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} args.person Name or id.
 * @param {string} args.kind What it would have been, e.g. one-to-one.
 * @param {string} [args.why] In his own words. One line.
 * @param {number} [args.at] When it should have happened. Defaults to today.
 * @param {number} args.now
 */
export function logSkip(store, { person: who, kind, why, at, now }) {
  const found = resolvePerson(store, who);
  if (!found.ok) {
    return { error: found.error };
  }

  const asked = String(kind ?? "").trim();
  if (!asked) {
    return { error: "A skipped meeting needs to say what it would have been." };
  }
  if (subjectOf(asked) !== "person") {
    const offer = kindsFor("person")
      .map((k) => k.value)
      .join(", ");
    return { error: `"${asked}" is not something you can have with a person. Try one of: ${offer}.` };
  }

  const when = typeof at === "number" ? at : now;
  if (isLaterDay(when, now)) {
    return {
      error:
        "That day has not arrived yet. A meeting can only be recorded as not having happened " +
        "once its day has passed."
    };
  }

  const id = store.create("skips", {
    person: String(found.person.id),
    kind: asked,
    why: String(why ?? "").trim() || null,
    at: when
  });
  return { id, skipped: `${asked} with ${found.person.name}` };
}

/**
 * Skipped meetings with one person, and whether they add up to a pattern.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} who
 * @param {number} now
 */
export function skips(store, who, now) {
  const found = resolvePerson(store, who);
  if (!found.ok) {
    return { error: found.error };
  }
  const rows = store.rows("skips");
  const id = String(found.person.id);
  return {
    person: found.person.name,
    recent: recentSkips(rows, id).map((s) => ({
      id: String(s.id),
      kind: String(s.kind ?? ""),
      why: s.why ?? null,
      when: agoWords(Math.max(0, Math.floor((now - Number(s.at ?? now)) / 86_400_000)))
    })),
    pattern: skipPattern(skipsFor(rows, id, now, "one-to-one"), "1-1")
  };
}

/* --------------------------------------------------------------- journal -- */

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
    return { error: "That day has not arrived yet." };
  }

  /** @type {Record<string, any>} */
  const entry = { at: when };
  for (const field of JOURNAL_FIELDS) {
    const value = String(fields[field.name] ?? "").trim();
    entry[field.name] = value === "" ? null : value;
  }

  if (!hasContent(entry)) {
    return { error: "Nothing was written, so there is nothing to keep." };
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
      when: agoWords(Math.max(0, Math.floor((now - Number(e.at ?? now)) / 86_400_000))),
      took: e.took ?? null,
      avoided: e.avoided ?? null,
      differently: e.differently ?? null,
      notes: e.notes ?? null
    }))
  };
}

/* -------------------------------------------------------------- growth -- */

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
        state.lastObserved === null ? "never" : agoWords(daysBetweenNow(state.lastObserved, now)),
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

  const live = threads.filter((t) => t.status === "open" || t.status === "expectation").length;

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
    driver: String(rest.driver ?? "") === "" ? "unknown" : String(rest.driver),
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

/* ------------------------------------------------------------- waiting -- */

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

  return open.map((w) => ({
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
  return waitsDue({
    waiting: /** @type {any[]} */ (store.rows("waiting")),
    chases: /** @type {any[]} */ (store.rows("chases")),
    now
  }).map((w) => ({
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
    return { error: "Say what you are waiting for, or there is nothing to chase." };
  }
  const when = typeof askedAt === "number" ? askedAt : now;
  if (isLaterDay(when, now)) {
    return { error: "That day has not arrived yet. You cannot be waiting on something you have not asked for." };
  }
  if (cadenceDays !== undefined && !(Number(cadenceDays) > 0)) {
    return { error: "How long to wait has to be a positive number of days." };
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
    return { error: "That one is closed, so there is nothing left to chase." };
  }
  const when = typeof at === "number" ? at : now;
  if (isLaterDay(when, now)) {
    return { error: "That day has not arrived yet. A chase is logged after you send it." };
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
