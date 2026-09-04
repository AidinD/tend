/**
 * Every read: what needs attention, the roster, one person's page, the
 * projects, the role map as it stands.
 *
 * Nothing here writes. That matters more than it sounds: these are the
 * functions both the app and an agent call to find out what is true, so a read
 * with a side effect would mean asking a question changed the answer.
 *
 * The one number that is not arithmetic over the record is where the journal
 * was last read across, which comes from the reflection module - a month of
 * evenings nobody has looked back at is itself a fact about where attention
 * went.
 *
 * Split out of api.js.
 */

import { buildAttention, expandCadences } from "../domain/attention.js";
import { archivedIds, isArchived } from "../domain/archive.js";
import { contactSummary } from "../domain/contact.js";
import { personBlocksIn, relationsIn } from "../domain/halves.js";
import { myAttention } from "../domain/myattention.js";
import { availability } from "../domain/people.js";
import { openPromises } from "../domain/promises.js";
import { isLiveStatus, threadState } from "../domain/growth.js";
import { planFor } from "./plans.js";
import { recentSkips, skipPattern, skipsFor } from "../domain/skips.js";
import { namedStakes } from "../domain/stakes.js";
import { agoWords, daysSince, driftBadge, humanDays } from "../domain/time.js";
import { isUnspecified } from "../domain/workstreams.js";
import { lastReviewRun } from "./reflection.js";
import { linksFor } from "./links.js";
import { resolvePerson, resolveProject } from "./resolve.js";

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
    // His own aims, so the page can say when one has gone quiet and where it
    // was supposed to happen.
    aims: /** @type {any[]} */ (store.rows("aims")),
    aimNotes: /** @type {any[]} */ (store.rows("aimNotes")),
    // Which signals mean anything here. The private half was being told it had
    // not spoken to eight of eight people this month, about the people he lives
    // with - see SIGNAL_HALVES in myattention.js.
    half: store.half,
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

  /*
   * The whole set, kept so the summary can be counted over it. The page is given
   * a capped twenty rows below, and a total taken from those would report the
   * cap the moment somebody has twenty-one conversations.
   */
  const allTouches = store.rows("touches").filter((t) => t.subject === p.id);

  const history = allTouches
    .slice()
    .sort((a, b) => Number(b.at ?? 0) - Number(a.at ?? 0))
    .slice(0, 20)
    .map((t) => ({
      // The id, so a mislogged contact can be taken back. Without it the history
      // was read-only and a wrong entry was permanent.
      id: t.id,
      kind: t.kind,
      when: agoWords((daysSince(t.at, now) ?? 0)),
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
      when: agoWords((daysSince(s.at, now) ?? 0))
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
    // What those rows amount to, counted over ALL of them rather than the
    // twenty above. See domain/contact.js for why the page is handed the
    // numbers instead of deriving them.
    contactSummary: (() => {
      const s = contactSummary(allTouches, now);
      // The age in words, from the same helper every row above uses. Two
      // spellings of "4 days ago" on one page is one too many.
      return { ...s, lastWords: s.sinceLastDays === null ? null : agoWords(s.sinceLastDays) };
    })(),
    observations: evidence,
    // Material about them that lives elsewhere, newest first and carrying its
    // age. See domain/links.js for why the age is the part that matters.
    links: linksFor(store, p.id, now)
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

  /*
   * Read once for the whole roster rather than per person. The front page asks
   * for the roster on every draw, and a per-person read of three collections
   * turns one page into thirty passes over the log.
   */
  const growthRows = store.rows("growth").filter((g) => !g._deleted);
  const growthNotes = store.rows("growthNotes").filter((n) => !n._deleted);
  const promises = openPromises(store.rows("promises"), now);
  const stakes = store.rows("stakes").filter((x) => !x._deleted);

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

      /*
       * The live growth thread, if there is one, reduced to the three facts a
       * tile can be decided from. Not the whole thread: the front page must
       * not carry a person's development prose, and a payload that does is one
       * an agent over MCP reads too.
       *
       * `isLiveStatus` rather than a status comparison here, because the
       * window had its own copy of that test once and printed homework under an
       * ended direction.
       */
      const live = growthRows.find(
        (g) => g.person === p.id && isLiveStatus(/** @type {any} */ (String(g.status)))
      );
      const direction =
        live === undefined
          ? null
          : (() => {
              const state = threadState(
                /** @type {any} */ (live),
                /** @type {any} */ (growthNotes),
                /** @type {any} */ (p),
                now
              );
              return {
                status: String(state.status),
                stance: String(state.stance),
                observations: Number(state.observations)
              };
            })();

      return {
        id: p.id,
        name: p.name,
        /*
         * What a tile needs and nothing more. Each is a count or a flag, so
         * this stays a roster row rather than becoming a second person page.
         */
        direction,
        /*
         * Reduced to whether it has started, which is all a tile needs. The
         * plan itself carries a gap, what was said out loud and an HR answer -
         * none of which belongs on a page that shows ten people at once, and
         * none of which an agent reading the roster over MCP should get for
         * free.
         */
        plan: planSummary(store, String(p.id)),
        promisesOwed: promises.filter((x) => x.person === p.id).length,
        /*
         * Always false until Inför wires `worthRaising` to the "Frågor jag
         * inte ställde" section of a Nib summary. Sent as a flag anyway so the
         * tile rule is complete now and gains its input later, rather than the
         * rule changing shape when the feature lands.
         */
        hasQuestion: false,
        /*
         * Null when this person is nobody's stakeholder, which is not the same
         * as an update being due. The tile set for the outward cluster has a
         * phrase for overdue and one for recent, and neither is true of
         * somebody who owes no reports at all.
         */
        update: stakeUpdate(stakes, cadences, p.id),
        relation: p.relation,
        // Said on the roster, because "no duty applies" reads as a gap in the
        // setup when the truth is that somebody is on leave or has left.
        availability: availability(p, now),
        /*
         * The two numbers, not only the badge.
         *
         * `behindBy` is "+3w", which answers how late and hides the fact that
         * matters more: a cadence targeting a fortnight and actually running at
         * five weeks is not late once, it is mis-set. Both are already computed
         * in `computeDrift`; the roster was dropping them and every caller then
         * had to fetch the person to get them back.
         *
         * Numbers rather than phrases, so the window can word them in its own
         * language and a model reading this over MCP gets the arithmetic
         * instead of a rounded English sentence.
         */
        worstDrift: worst
          ? {
              duty: worst.duty.name,
              behindBy: driftBadge(worst.drift.driftDays),
              urgency: worst.drift.trueSeverity,
              targetDays: worst.drift.interval,
              sinceDays: worst.drift.daysSince,
              everHappened: worst.drift.everHappened
            }
          : null
      };
    })
    .sort((a, b) => (b.worstDrift ? 1 : 0) - (a.worstDrift ? 1 : 0));
}

/**
 * Whether this person has a live plan, and whether it has begun.
 *
 * Null when there is none, which is not the same as one that has not started.
 * The tile vocabulary has a phrase for each and no phrase for "no plan" - a
 * person with no plan is described by their direction instead.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} personId
 * @returns {{ started: boolean } | null}
 */
function planSummary(store, personId) {
  const plan = planFor(store, personId);
  return plan === null ? null : { started: plan.status === "running" };
}

/**
 * Whether a stakeholder is owed an update, or null if they are not one.
 *
 * Null and not `{ overdue: false }`. "Nobody is waiting on a report from you"
 * and "the report is current" are different facts, and the tile vocabulary has
 * a phrase for the second and none for the first - which is the right place for
 * that gap to be visible rather than papered over here.
 *
 * @param {any[]} stakes
 * @param {any[]} cadences
 * @param {string} personId
 * @returns {{ overdue: boolean } | null}
 */
function stakeUpdate(stakes, cadences, personId) {
  const theirs = stakes.filter((s) => String(s.person) === personId);
  if (theirs.length === 0) {
    return null;
  }
  const ids = new Set(theirs.map((s) => String(s.id)));
  const drifting = cadences.filter((c) => ids.has(String(c.subject.id)));
  return { overdue: drifting.some((c) => Number(c.drift.driftDays) > 0) };
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
  const archived = archivedIds(store.rows("people"));
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
      when: agoWords((daysSince(t.at, now) ?? 0)),
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
