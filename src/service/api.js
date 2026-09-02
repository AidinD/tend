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
import { isArchived } from "../domain/archive.js";
import {
  JOURNAL_FIELDS,
  REVIEW_WINDOW_DAYS,
  coverage,
  entriesSince,
  hasContent
} from "../domain/journal.js";
import { declared, ledger as reviewLedger, ledgerLines, readiness, unread } from "../domain/review.js";
import {
  defaultRelationIn,
  homeViewIn,
  isRelationIn,
  personBlocksIn,
  relationOptionsIn,
  relationsIn,
  viewsIn
} from "../domain/halves.js";
import { openPromises } from "../domain/promises.js";
import { REFLECTION_FIELDS } from "../domain/reflection.js";
import { recentSkips, skipPattern, skipsFor } from "../domain/skips.js";
import {
  DEFAULT_WAIT_DAYS,
  WAIT_ENDINGS,
  isWaitEnding,
  openWaits,
  waitsDue
} from "../domain/waiting.js";
import { signalsDue } from "../domain/signals.js";
import { boundPeople, isShared, sourceName } from "../domain/sources.js";
import { DEFAULT_STAKE_DAYS, namedStakes, stakeInterval } from "../domain/stakes.js";
import { TOPICS_PER_CARD, appliesTo, lastRaised, topicsFor } from "../domain/topics.js";
import { agoWords, daysBetween, driftBadge, humanDays, isLaterDay } from "../domain/time.js";
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
    // The journal, and when a pass over it last ran. A month of evenings nobody
    // has read is a fact about where his attention went, which is what every
    // signal in that file is.
    entries: /** @type {any[]} */ (store.rows("entries")),
    lastReadAt: lastReviewRun(store),
    // Whether a weekly reflection has ever been written, and when. See the
    // "not reflected on" signal in myattention.js.
    reflections: /** @type {any[]} */ (store.rows("reflections")),
    now
  });
}

/**
 * The instant an archive is allowed to be stamped with.
 *
 * `archivedAt` is the whole mechanism, and an unusable value fails quietly in
 * three different ways rather than loudly in one: `NaN` serialises to `null`, so
 * the row reads back as ACTIVE while the call reports success and the bulk
 * counter counts it; a far-future number passes `Number.isFinite` and then makes
 * `toISOString()` throw inside the map that builds the archived group, taking
 * out the whole view rather than one line; and `0` archives a row into 1970.
 * The renderer only ever sends `Date.now()`, so none of that is reachable
 * today - which is exactly why the next caller to compute a timestamp itself
 * should be told here rather than find out from a blank page.
 *
 * @param {unknown} now
 * @returns {{ error: string } | undefined}
 */
function badArchiveInstant(now) {
  if (typeof now !== "number" || !Number.isFinite(now) || now <= 0) {
    return { error: `Cannot archive at "${String(now)}" - an archive is stamped with a real instant.` };
  }
  // Date's own range, past which every attempt to format the stamp throws.
  if (Math.abs(now) > 8.64e15) {
    return { error: `Cannot archive at "${String(now)}" - that is outside the range a date can hold.` };
  }
  return undefined;
}

/**
 * The ids of everybody archived.
 *
 * Three read paths reported work owed by people who are not on the roster:
 * `promises`, `waits` and `waitsOnNow` build a name map from every row and never
 * asked whether the row was still live. They were missed because they are the
 * paths that do NOT go through `buildAttention` or `expandCadences`, which is
 * where the filtering was added - so Now kept naming archived people in its
 * waiting group, and the material handed to the model held a critical promise
 * owed to somebody the same payload's roster said did not exist.
 *
 * A set of ids rather than a filter on each row, because these paths join
 * against people by id and never carry the person row itself.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @returns {Set<string>}
 */
function archivedPersonIds(store) {
  return new Set(
    store
      .rows("people")
      .filter((/** @type {any} */ p) => isArchived(p))
      .map((/** @type {any} */ p) => String(p.id))
  );
}

/**
 * The row already holding this name, archived or not.
 *
 * One helper rather than the same `.find()` written at each place that refuses a
 * duplicate name, because archiving introduced a case those checks could not
 * see: a row that is archived still owns its name, but it is not on any list, so
 * "already here" pointed at nothing the reader could find and told them to use
 * an action that does not apply to an archived row. Callers decide what to say -
 * `isArchived` on the returned row is the whole difference - and this decides
 * only what counts as taken.
 *
 * Names stay unique across archived rows deliberately: Ctrl+K refuses an
 * ambiguous match rather than guessing, so two rows sharing a name makes both
 * unreachable whether or not one of them is archived.
 *
 * @param {any} store
 * @param {"people" | "projects" | "workstreams"} collection
 * @param {unknown} name
 * @param {string} [exceptId] A row that may keep its own name - for a rename.
 * @returns {Record<string, any> | undefined}
 */
function nameClash(store, collection, name, exceptId) {
  const wanted = String(name ?? "").trim().toLowerCase();
  if (wanted === "") {
    return undefined;
  }
  return store
    .rows(collection)
    .find(
      (/** @type {any} */ row) =>
        row.id !== exceptId && String(row.name ?? "").trim().toLowerCase() === wanted
    );
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
      note: t.note ?? null,
      /*
       * Where the row came from, which the store has always recorded and the
       * page has never been able to say.
       *
       * It matters at exactly the moment somebody is deciding whether a row is
       * wrong. Two rows about the same conversation, one typed by hand and one
       * derived from a note, are indistinguishable without it - and the two are
       * not equally safe to delete: a hand-typed row is the only copy of what
       * somebody wrote, while a derived one can be reasoned about from the note
       * it names. Answering that took reading the event log by hand once.
       */
      from: t.from ?? null
    }));

  const evidence = store
    .rows("evidence")
    .filter((e) => e.person === p.id)
    .sort((a, b) => Number(b.at ?? 0) - Number(a.at ?? 0))
    .slice(0, 20)
    .map((e) => ({ text: e.text, at: e.at, by: e._by }));

  const relation = String(p.relation ?? "");

  return {
    id: p.id,
    name: p.name,
    relation: p.relation,
    // Carried so the edit dialog can show it. It is the date every cadence
    // measures from until there is contact to measure from instead, which
    // makes it the one field somebody sets wrong once and never revisits.
    since: p.since ?? null,
    relationMeans: relationsIn(store.half)[relation]?.note ?? "Unknown relationship type.",
    // What this page may show, decided by the half rather than by a chain of
    // conditions in the renderer. Drift over a picture of your family is the
    // kind of thing that gets added by accident and noticed by the person it
    // was drawn for.
    blocks: personBlocksIn(store.half),
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
    // Kept resolvable and readable even when archived - only the aggregate
    // views (the roster below, Now, prep) stop showing them. The person page
    // must still open and every historical record on it must still render.
    archivedAt: p.archivedAt ?? null,
    availability: availability(p, now),
    cadences,
    openPromises: promises,
    recentContact: history,
    observations: evidence
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
    // Archived people are the whole point of archiving: they stop cluttering
    // the roster. A dedicated "show archived" path is added alongside
    // archivePerson/unarchivePerson rather than a parameter here, so this
    // function's contract stays "everyone active" for its existing callers.
    .filter((p) => !isArchived(p))
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
 * The people the roster hides. `people()` and this are deliberately two
 * functions rather than one with a flag: each keeps a contract that never
 * changes shape ("everyone active" / "everyone archived"), so nothing that
 * already calls `people()` has to learn about an option it never asks for.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {number} now
 */
export function archivedPeople(store, now) {
  return store
    .rows("people")
    .filter((p) => isArchived(p))
    .map((p) => ({
      id: p.id,
      name: p.name,
      relation: p.relation,
      archivedAt: p.archivedAt
    }))
    .sort((a, b) => b.archivedAt - a.archivedAt);
}

/**
 * @param {import("../storage/store.js").TendStore} store
 * @param {number} now
 */
export function promises(store, now) {
  const names = new Map(store.rows("people").map((p) => [p.id, p.name]));
  // Archived people are already gone from Now and from prep, and a promise that
  // is reported here but nowhere else puts the two halves of one answer at odds
  // - most visibly in the material handed to the model, which would carry a
  // critical promise owed to somebody absent from the same payload's roster.
  const archived = archivedPersonIds(store);
  return openPromises(store.rows("promises"), now)
    .filter((p) => !archived.has(String(p.person)))
    .map((p) => ({
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
  // Archived projects stop appearing here for the same reason archived people
  // stop appearing on the roster: this is the default listing, not the whole
  // record.
  return store.rows("projects").filter((p) => !isArchived(p)).map((p) => {
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

/**
 * Everything known about one project.
 *
 * ## Why this exists
 *
 * A person had `person()` and a page with their cadences, promises, contact and
 * observations on it. A project had one row on the Work view: a name, when it was
 * last looked at, and three buttons. Every check-in ever logged against it was in
 * the event log and reachable from nowhere - the only way to read the three
 * check-ins on one project was to grep the log by its id.
 *
 * ## Deliberately the same shape as `person()`
 *
 * Cadences, then the history, then what hangs off it. Not because symmetry is
 * pretty, but because a reader who has used the person page already knows how to
 * read this one, and the renderer can borrow the same blocks. Where the two
 * genuinely differ they differ: a project has no promises of its own, and it has
 * workstreams and stakeholders, which a person does not.
 *
 * ## An archived project still resolves
 *
 * Same rule as a person's page: archiving takes a row out of the forward-looking
 * views and leaves its history readable. A project page that 404s once archived
 * would make archiving a delete with a nicer name.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} query Id, exact name, or a distinctive part of one.
 * @param {number} now
 */
export function project(store, query, now) {
  const found = resolveProject(store, query);
  if (!found.ok) {
    return { error: found.error };
  }
  const p = found.project;
  const state = store.state();

  const cadences = expandCadences(state, now)
    .filter((c) => c.subjectKind === "project" && c.subject.id === p.id)
    .map((c) => ({
      duty: c.duty.name,
      target: `every ${c.drift.interval} days`,
      lastHappened: c.drift.everHappened ? agoWords(c.drift.daysSince) : "never",
      behindBy: driftBadge(c.drift.driftDays),
      urgency: c.drift.trueSeverity
    }));

  /*
   * The checks-in, which is the whole reason for this read.
   *
   * Capped at the same twenty as a person's contact history, and each row
   * carries its id so a mislogged one can be taken back from here rather than
   * only from the row it was logged on - and `from`, so a row derived from a
   * note says so, for the same reason it does on a person's page.
   */
  const history = store
    .rows("touches")
    .filter((t) => t.subject === p.id)
    .sort((a, b) => Number(b.at ?? 0) - Number(a.at ?? 0))
    .slice(0, 20)
    .map((t) => ({
      id: t.id,
      kind: t.kind,
      when: agoWords(Math.max(0, Math.floor((now - Number(t.at ?? now)) / 86_400_000))),
      at: t.at ?? null,
      note: t.note ?? null,
      from: t.from ?? null
    }));

  const names = new Map(store.rows("people").map((x) => [String(x.id), String(x.name ?? "")]));

  /*
   * The workstreams inside it, and archived ones are kept out.
   *
   * Read from the rows rather than from `workstreams()` because that function
   * answers a different question - every workstream, with its project named -
   * and calling it here to throw away all but a few would make this read depend
   * on the shape of a listing that exists for the Work view.
   */
  const streams = store
    .rows("workstreams")
    .filter((w) => String(w.project ?? "") === String(p.id) && !isArchived(w))
    .map((w) => ({
      id: w.id,
      name: w.name,
      owner: w.owner ? (names.get(String(w.owner)) ?? null) : null,
      level: w.level ?? null,
      unspecified: isUnspecified(w)
    }));

  const interested = namedStakes(
    store.rows("stakes"),
    store.rows("people").filter((x) => !isArchived(x)),
    store.rows("projects").filter((x) => !isArchived(x))
  )
    .filter((s) => String(s.project) === String(p.id))
    .map((s) => ({
      id: String(s.id),
      person: names.get(String(s.person)) ?? "",
      label: String(s.name ?? "")
    }));

  return {
    id: p.id,
    name: p.name,
    cadences,
    recentContact: history,
    workstreams: streams,
    stakeholders: interested,
    archivedAt: p.archivedAt ?? null
  };
}

/**
 * The projects `projects()` hides. See `archivedPeople` for why this is a
 * sibling function rather than a flag on `projects()`.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {number} now
 */
export function archivedProjects(store, now) {
  return store
    .rows("projects")
    .filter((p) => isArchived(p))
    .map((p) => ({ id: p.id, name: p.name, archivedAt: p.archivedAt }))
    .sort((a, b) => b.archivedAt - a.archivedAt);
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
  if (!isRelationIn(store.half, String(relation))) {
    // The half's own vocabulary, not the union of both. A store holds one half's
    // people, so accepting the other half's words would put a row in the data
    // that every grouping treats as unknown - present in the store and absent
    // from the page, which is a failure this roster has already had once.
    return {
      error:
        `Unknown relationship type "${relation}". Valid here: ` +
        `${Object.keys(relationsIn(store.half)).join(", ")}.`
    };
  }
  const clash = nameClash(store, "people", name);
  if (clash) {
    return {
      error: isArchived(clash)
        ? `"${clash.name}" is archived, not gone, and a name may only belong to one row. ` +
          `Unarchive them from the archived group on People, or add this person under a name that tells the two apart.`
        : `"${name}" is already here. Use setRelation to change how you relate to them.`
    };
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
  if (!isRelationIn(store.half, String(relation))) {
    return {
      error:
        `Unknown relationship type "${relation}". Valid here: ` +
        `${Object.keys(relationsIn(store.half)).join(", ")}.`
    };
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
    const clash = nameClash(store, "people", trimmed, found.person.id);
    if (clash) {
      return {
        error: isArchived(clash)
          ? `"${trimmed}" belongs to somebody archived, and an archived row keeps its name. ` +
            `Unarchive them if that is who this is, or pick a name that tells the two apart.`
          : `Somebody else is already called "${trimmed}".`
      };
    }
    patch.name = trimmed;
  }

  if (relation !== undefined) {
    if (!isRelationIn(store.half, String(relation))) {
      return {
        error:
          `Unknown relationship type "${relation}". Valid here: ` +
          `${Object.keys(relationsIn(store.half)).join(", ")}.`
      };
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
 * Stop a person cluttering Now, prep, attention and the roster, without
 * touching anything that has ever been recorded about them.
 *
 * Deliberately not folded into `updatePerson`: archiving is a distinct action
 * with its own confirmation in the UI, and a caller that only means to rename
 * somebody should not be able to archive them by way of an unrelated field.
 *
 * Idempotent, on purpose - the bulk "I left this job" action re-runs this over
 * everyone, and a second run over somebody already archived must be free
 * rather than an error or a reset of when they were archived.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} id
 * @param {object} args
 * @param {number} args.now
 */
export function archivePerson(store, id, { now }) {
  const found = resolvePerson(store, id);
  if (!found.ok) {
    return { error: found.error };
  }
  if (isArchived(found.person)) {
    return { id: found.person.id, name: found.person.name, archivedAt: found.person.archivedAt, already: true };
  }
  const bad = badArchiveInstant(now);
  if (bad) {
    return bad;
  }
  store.update("people", found.person.id, { archivedAt: now });
  return { id: found.person.id, name: found.person.name, archivedAt: now };
}

/**
 * The other half of `archivePerson`. `null`, not `undefined`, clears the
 * field in the event log - the same convention `updatePerson` uses for
 * `awayUntil`/`leftAt`, because an event that means "no longer true" has to
 * say so rather than omit the field and leave a reader to guess why.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} id
 */
export function unarchivePerson(store, id) {
  const found = resolvePerson(store, id);
  if (!found.ok) {
    return { error: found.error };
  }
  if (!isArchived(found.person)) {
    return { id: found.person.id, name: found.person.name, already: true };
  }
  store.update("people", found.person.id, { archivedAt: null });
  return { id: found.person.id, name: found.person.name };
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
  const clash = nameClash(store, "projects", name);
  if (clash) {
    return {
      error: isArchived(clash)
        ? `"${clash.name}" is archived, not gone, and a name may only belong to one row. ` +
          `Unarchive it from the archived group on Work, or use a name that tells the two apart.`
        : `"${name}" is already here.`
    };
  }
  const id = store.create("projects", {
    name: String(name).trim(),
    since: typeof since === "number" ? since : now
  });
  return { id, added: name };
}

/**
 * See `archivePerson` - same shape, same idempotency guarantee, for a project.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} id
 * @param {object} args
 * @param {number} args.now
 */
export function archiveProject(store, id, { now }) {
  const found = resolveProject(store, id);
  if (!found.ok) {
    return { error: found.error };
  }
  if (isArchived(found.project)) {
    return { id: found.project.id, name: found.project.name, archivedAt: found.project.archivedAt, already: true };
  }
  const bad = badArchiveInstant(now);
  if (bad) {
    return bad;
  }
  store.update("projects", found.project.id, { archivedAt: now });
  return { id: found.project.id, name: found.project.name, archivedAt: now };
}

/**
 * See `unarchivePerson`.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} id
 */
export function unarchiveProject(store, id) {
  const found = resolveProject(store, id);
  if (!found.ok) {
    return { error: found.error };
  }
  if (!isArchived(found.project)) {
    return { id: found.project.id, name: found.project.name, already: true };
  }
  store.update("projects", found.project.id, { archivedAt: null });
  return { id: found.project.id, name: found.project.name };
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

  // Archived workstreams stop appearing in the default listing, same as
  // archived people and projects - the delegation-review cadence they carry
  // is exactly the kind of nagging archiving exists to stop.
  return store.rows("workstreams").filter((w) => !isArchived(w)).map((w) => {
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
 * The workstreams `workstreams()` hides. See `archivedPeople` for why this is
 * a sibling function rather than a flag on `workstreams()`.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {number} now
 */
export function archivedWorkstreams(store, now) {
  return store
    .rows("workstreams")
    .filter((w) => isArchived(w))
    .map((w) => ({ id: w.id, name: w.name, archivedAt: w.archivedAt }))
    .sort((a, b) => b.archivedAt - a.archivedAt);
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
 * See `archivePerson` - same shape, same idempotency guarantee, for a
 * workstream.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} id
 * @param {object} args
 * @param {number} args.now
 */
export function archiveWorkstream(store, id, { now }) {
  const found = resolveWorkstream(store, id);
  if (!found.ok) {
    return { error: found.error };
  }
  if (isArchived(found.workstream)) {
    return {
      id: found.workstream.id,
      name: found.workstream.name,
      archivedAt: found.workstream.archivedAt,
      already: true
    };
  }
  const bad = badArchiveInstant(now);
  if (bad) {
    return bad;
  }
  store.update("workstreams", found.workstream.id, { archivedAt: now });
  return { id: found.workstream.id, name: found.workstream.name, archivedAt: now };
}

/**
 * See `unarchivePerson`.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} id
 */
export function unarchiveWorkstream(store, id) {
  const found = resolveWorkstream(store, id);
  if (!found.ok) {
    return { error: found.error };
  }
  if (!isArchived(found.workstream)) {
    return { id: found.workstream.id, name: found.workstream.name, already: true };
  }
  store.update("workstreams", found.workstream.id, { archivedAt: null });
  return { id: found.workstream.id, name: found.workstream.name };
}

/**
 * The "I left this job" moment: everything active, archived in one call.
 *
 * A thin wrapper over `archivePerson`/`archiveProject`/`archiveWorkstream` and
 * nothing more - a bulk action is not a separate code path with its own rules,
 * it is the same reversible per-item archive, applied to everyone and
 * everything that is not already archived. That is also what makes it safe to
 * press again by mistake: an already-archived row is skipped by the per-item
 * function's own idempotency guard, so a second run reports zero and changes
 * nothing.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {number} args.now
 */
export function archiveEverythingActive(store, { now }) {
  // Deliberately NOT validated up front. The instant is the same for every row,
  // so a bad one refuses every row identically and nothing is written - and
  // letting the refusals come back through the same path as any other means the
  // counter's honesty is reachable from the outside and can be tested, rather
  // than being an unreachable branch nobody can break.
  /** @type {string[]} */
  const people = [];
  /** @type {string[]} */
  const projects = [];
  /** @type {string[]} */
  const workstreams = [];
  /** @type {string[]} */
  const refused = [];

  /**
   * Counted only when the row actually came back carrying a fresh stamp.
   *
   * The first version counted anything that did not report `already`, which
   * counts a refusal as an archive: the report then says a row was archived
   * that the next read still finds active. The report and the effect have to
   * agree, so the count follows the written field and nothing else.
   *
   * @param {{ error: string } | { archivedAt: any, already?: boolean }} result
   * @returns {boolean}
   */
  const archivedNow = (result) => {
    if ("error" in result) {
      refused.push(result.error);
      return false;
    }
    return result.already !== true && typeof result.archivedAt === "number";
  };

  for (const p of store.rows("people")) {
    if (archivedNow(archivePerson(store, p.id, { now }))) {
      people.push(String(p.id));
    }
  }
  for (const p of store.rows("projects")) {
    if (archivedNow(archiveProject(store, p.id, { now }))) {
      projects.push(String(p.id));
    }
  }
  for (const w of store.rows("workstreams")) {
    if (archivedNow(archiveWorkstream(store, w.id, { now }))) {
      workstreams.push(String(w.id));
    }
  }

  // Recorded only when it changed something, so an accidental second press does
  // not leave an empty run standing in front of the one worth undoing.
  const changed = people.length + projects.length + workstreams.length;
  if (changed > 0) {
    store.create("bulkArchives", { at: now, people, projects, workstreams });
  }

  // Counts, not id lists, in the answer: the ids are for the undo and live in
  // the recorded run, and a window that got both would have two sources for the
  // same fact.
  const summary = {
    people: people.length,
    projects: projects.length,
    workstreams: workstreams.length
  };

  // Said out loud rather than swallowed: a partial archive is safe to re-run,
  // but only if the window knows it was partial.
  return refused.length > 0 ? { ...summary, refused } : summary;
}

/**
 * The most recent bulk archive that has not been undone, or null.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @returns {Record<string, any> | null}
 */
function latestBulkArchive(store) {
  const runs = store
    .rows("bulkArchives")
    .filter((/** @type {any} */ r) => r.undoneAt === undefined || r.undoneAt === null)
    .sort((/** @type {any} */ a, /** @type {any} */ b) => Number(b.at ?? 0) - Number(a.at ?? 0));
  return runs.length > 0 ? runs[0] : null;
}

/**
 * Is there a bulk archive to undo, and what would undoing it put back?
 *
 * Read by Settings so the button can say what it will do before it is pressed,
 * rather than offering an undo whose size is a surprise.
 *
 * @param {import("../storage/store.js").TendStore} store
 */
export function undoableBulkArchive(store) {
  const run = latestBulkArchive(store);
  if (run === null) {
    return null;
  }
  const still = (/** @type {"people" | "projects" | "workstreams"} */ collection) => {
    const ids = new Set((run[collection] ?? []).map((/** @type {any} */ id) => String(id)));
    // Counted as it stands NOW, not as it was recorded. Anything unarchived by
    // hand since is already back, and saying otherwise would promise to restore
    // something that needs no restoring.
    return store
      .rows(collection)
      .filter((/** @type {any} */ row) => ids.has(String(row.id)) && isArchived(row)).length;
  };
  return {
    id: run.id,
    at: run.at,
    people: still("people"),
    projects: still("projects"),
    workstreams: still("workstreams")
  };
}

/**
 * Put back exactly what the last bulk archive changed.
 *
 * Only that run's rows, and only the ones still archived - not "unarchive
 * everything", which would also drag back rows archived by hand months ago and
 * turn an undo into a decision nobody made. The run is marked undone rather
 * than removed, because the log does not delete and because a second press must
 * not silently reach further back to an older run.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} [args]
 * @param {number} [args.now]
 */
export function undoBulkArchive(store, { now } = {}) {
  const run = latestBulkArchive(store);
  if (run === null) {
    return { error: "There is no bulk archive left to undo." };
  }

  const undo = {
    people: /** @type {(store: any, id: string) => any} */ (unarchivePerson),
    projects: /** @type {(store: any, id: string) => any} */ (unarchiveProject),
    workstreams: /** @type {(store: any, id: string) => any} */ (unarchiveWorkstream)
  };

  const restored = { people: 0, projects: 0, workstreams: 0 };
  /** @type {string[]} */
  const refused = [];

  for (const collection of /** @type {const} */ (["people", "projects", "workstreams"])) {
    for (const id of run[collection] ?? []) {
      const row = store.rows(collection).find((/** @type {any} */ r) => String(r.id) === String(id));
      // Gone or already back: neither is a failure, and neither is a restore.
      if (row === undefined || !isArchived(row)) {
        continue;
      }
      const result = undo[collection](store, String(id));
      if (result && result.error) {
        refused.push(result.error);
        continue;
      }
      restored[collection] += 1;
    }
  }

  store.update("bulkArchives", run.id, { undoneAt: typeof now === "number" ? now : Date.now() });

  return refused.length > 0 ? { ...restored, refused } : restored;
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

/*
 * Moved to niblinks.js and re-exported here.
 *
 * api.js is the service surface: main/index.js and mcp/tools.js both import it
 * whole. Re-exporting means a section can move without every caller learning
 * where it went - the alternative is a rename landing in three files for no
 * gain.
 */
export {
  assignCommitment,
  bindSource,
  dropCommitment,
  observations,
  pendingCommitments,
  setSourceRules,
  sources,
  unbindSource
} from "./niblinks.js";

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

/* -------------------------------------------------------- topics -- */

/* Moved to topics.js and re-exported, so the service surface is unchanged. */
export {
  allTopics,
  decideTopic,
  markRaised,
  proposeTopic,
  topics
} from "./topics.js";

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
  // Only active people and projects reach `namedStakes`, so a stake pointing
  // at an archived one resolves nobody and is dropped by the same "nothing to
  // act on" rule it already applies to a removed row.
  const named = namedStakes(
    store.rows("stakes"),
    store.rows("people").filter((p) => !isArchived(p)),
    store.rows("projects").filter((p) => !isArchived(p))
  );
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

/* ------------------------------------------------------------ vocabulary -- */

/**
 * What this half consists of.
 *
 * One call, answered from `domain/halves.js`, and the reason it exists is a
 * failure this project has had four times: a list of options written out again
 * in the renderer, which then quietly disagreed with the service. A
 * relationship type that existed and was unpickable; a roster group missing so
 * everybody with one relationship vanished from the page. The private half added
 * a fifth copy - a hand-written array of which views belong here - and this
 * removes it.
 *
 * So the window asks what the half is rather than knowing. Adding a view or a
 * relationship type is then one edit in one file.
 *
 * @param {import("../storage/store.js").TendStore} store
 */
export function vocabulary(store) {
  const half = store.half;
  return {
    half,
    views: viewsIn(half),
    home: homeViewIn(half),
    relations: relationOptionsIn(half),
    defaultRelation: defaultRelationIn(half),
    personBlocks: personBlocksIn(half)
  };
}

/* ------------------------------------------------------- journal -- */

/*
 * Moved to journal.js and re-exported, so the service surface is unchanged.
 * Also imported, because the reflection section below reads the journal - a
 * re-export alone would leave that call referring to nothing.
 */
import { journal } from "./journal.js";

export {
  journal,
  logEntry,
  logMoment,
  moments,
  momentsFor
} from "./journal.js";

/* ----------------------------------------------------------- reflection -- */

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
    when: agoWords(Math.max(0, Math.floor((now - Number(r.at ?? now)) / 86_400_000))),
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

  // Asked about one person by name, answer about that person even if they are
  // archived - the same rule the person page follows. Asked for the list, leave
  // the archived out of it, because the list is a list of what is still owed.
  const archived = person === undefined ? archivedPersonIds(store) : new Set();

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
  const archived = archivedPersonIds(store);
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
