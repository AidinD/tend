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
import { DEFAULT_STRETCH, focusStatus } from "../domain/focus.js";
import { openPromises } from "../domain/promises.js";
import { signalsDue } from "../domain/signals.js";
import { driftBadge, humanDays } from "../domain/time.js";
import { LEVELS, isLevel, isUnspecified, reviewInterval } from "../domain/workstreams.js";
import { resolvePerson, resolveProject } from "./resolve.js";
import { decideDecision, decisions, logDecision, revisitsDue, stillHolds } from "./ledger.js";

export { resolvePerson, resolveProject };
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
    person: i.subject
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
      lastHappened: c.drift.everHappened ? humanDays(c.drift.daysSince) + " ago" : "never",
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
    .map((t) => ({ kind: t.kind, when: humanDays(Math.max(0, Math.floor((now - Number(t.at ?? now)) / 86_400_000))) + " ago", note: t.note ?? null }));

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
      lastLookedAt: worst ? (worst.drift.everHappened ? humanDays(worst.drift.daysSince) + " ago" : "never") : "no cadence",
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
 * @param {string} [fields.name]
 * @param {string} [fields.relation]
 * @param {number} [fields.since]
 */
export function updatePerson(store, who, { name, relation, since }) {
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
  const asPerson = resolvePerson(store, subject);
  const target = asPerson.ok ? asPerson.person : null;
  const asProject = target ? null : resolveProject(store, subject);

  if (!target && (!asProject || !asProject.ok)) {
    return { error: asProject && !asProject.ok ? asProject.error : asPerson.ok ? "" : asPerson.error };
  }

  const row = target ?? /** @type {any} */ (asProject).project;
  if (!String(kind ?? "").trim()) {
    return { error: "A contact needs a kind, e.g. one-to-one, second-hand, sideways, check-in." };
  }

  const id = store.create("touches", {
    subject: row.id,
    kind: String(kind).trim(),
    note: note ?? null,
    at: typeof at === "number" ? at : now
  });
  return { id, logged: `${kind} with ${row.name}` };
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

  const clash = store
    .rows("sources")
    .find((s) => s.categoryId === categoryId && (s.subId ?? null) === (subId ?? null));
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
 * @param {"person" | "project"} args.subjectKind
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

  const id = store.create("duties", {
    name: String(name).trim(),
    means: String(means).trim(),
    source: source ?? "proposed",
    subjectKind: subjectKind === "project" ? "project" : "person",
    cadenceDays: Number(cadenceDays),
    evidenceKinds: evidenceKinds ?? [],
    relations: relations ?? [],
    guarded: false,
    status: "proposed"
  });
  return { id, proposed: name, note: "Proposed only. It does nothing until accepted in the app." };
}

/* ----------------------------------------------------------- focus edits -- */

/**
 * Start a focus, or replace the one running.
 *
 * The bassignee drift is captured here and nowhere else. Without it the focus
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

  const bassigneeDrift = meanDrift(expandCadences(store.state(), now));

  store.emit("focus.set", {
    id: randomId(),
    name: String(name).trim(),
    startedAt: now,
    endsAt: endsAt ?? null,
    budget: budget ?? null,
    stretch: stretch ?? DEFAULT_STRETCH,
    guarded: guarded ?? [],
    bassigneeDrift
  });

  return { name, bassigneeDrift: Number(bassigneeDrift.toFixed(2)) };
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
  if (!["people", "projects", "workstreams", "duties", "promises", "evidence"].includes(collection)) {
    return { error: `Rows in "${collection}" are not removable.` };
  }
  const row = store.rows(collection).find((r) => r.id === id);
  if (!row) {
    return { error: `No ${collection} row with id "${id}".` };
  }
  store.remove(collection, id);
  return { removed: row.name ?? row.text ?? id };
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
