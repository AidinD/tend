/**
 * The decision log: read, propose, record, revisit.
 *
 * The write boundary here matters more than the shape. An agent may **propose** a
 * decision it read out of a note; only the user may **record** one. Same rule as
 * the role map, and for the same reason: something that can write your decision
 * log directly can quietly rewrite what you believe you decided, and you would
 * have no way to tell.
 *
 * Everything returns plain objects. Nothing here formats for a screen.
 */

import { DEFAULT_REVISIT_DAYS, isDecisionStatus, revisitAt, revisitStatus, thin } from "../domain/decisions.js";
import { markStanding, marksFor, revisitShape } from "../domain/decisionmarks.js";
import { daysSince, humanDays } from "../domain/time.js";
import { resolvePerson } from "./resolve.js";

/**
 * Turn a list of names or ids into person ids, refusing the whole call on the
 * first one that does not resolve.
 *
 * Refusing rather than dropping: a decision recorded as consulted-with-two-people
 * when you named three is worse than an error, because you will never notice.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {unknown} who
 * @returns {{ ok: true, ids: string[] } | { ok: false, error: string }}
 */
function resolveEveryone(store, who) {
  if (who === undefined || who === null) {
    return { ok: true, ids: [] };
  }
  const list = Array.isArray(who) ? who : [who];
  const ids = [];
  for (const one of list) {
    if (String(one ?? "").trim() === "") {
      continue;
    }
    const found = resolvePerson(store, String(one));
    if (!found.ok) {
      return { ok: false, error: found.error };
    }
    ids.push(found.person.id);
  }
  return { ok: true, ids };
}

/**
 * Everything decided, newest first, with what each one is missing.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {number} now
 * @param {string} [status] Filter, e.g. "proposed".
 */
export function decisions(store, now, status) {
  const names = new Map(store.rows("people").map((p) => [String(p.id), String(p.name)]));
  const marks = store.rows("decisionMarks");
  /*
   * The observations a mark may point at, by id. Read once for the whole list
   * rather than per mark: a page of decisions each resolving its own pointers
   * would walk the evidence rows once per mark.
   */
  const observations = new Map(
    store.rows("evidence").map((e) => [
      String(e.id),
      {
        id: String(e.id),
        text: String(e.text ?? ""),
        at: Number(e.at ?? 0),
        person: e.person ? (names.get(String(e.person)) ?? null) : null
      }
    ])
  );

  return store
    .rows("decisions")
    .filter((d) => !status || String(d.status ?? "") === status)
    .sort((a, b) => Number(b.decidedAt ?? b._at ?? 0) - Number(a.decidedAt ?? a._at ?? 0))
    .map((d) => {
      const revisit = revisitStatus(d, now);
      return {
        id: d.id,
        what: String(d.what ?? ""),
        because: d.because ? String(d.because) : null,
        rejected: d.rejected ? String(d.rejected) : null,
        consulted: (Array.isArray(d.consulted) ? d.consulted : []).map(
          (/** @type {string} */ id) => names.get(String(id)) ?? "någon som inte längre är på registret"
        ),
        status: String(d.status ?? "recorded"),
        decidedAt: Number(d.decidedAt ?? d._at ?? 0),
        revisitAt: Number(d.revisitAt ?? 0) || null,
        revisitDue: revisit.due,
        revisitOverdueBy: revisit.due ? humanDays(revisit.overdueDays) : null,
        // Where a proposal came from, so "this looks like a decision" is
        // checkable against the note it was read out of.
        source: d.source ? String(d.source) : null,
        proposedBy: d._by ? String(d._by) : null,
        /*
         * Whether it has actually been followed, kept apart from what was
         * decided. Two counts and never one: a decision kept nine times and
         * broken once is a different object from one broken two out of two.
         */
        ...(() => {
          const mine = marksFor(marks, String(d.id));
          const standing = markStanding(mine);
          const age = daysSince(Number(d.decidedAt ?? d._at ?? 0), now);
          return {
            standing,
            shape: revisitShape(standing, age),
            marks: mine.map((m) => ({
              id: String(m.id),
              held: m.held === true,
              at: Number(m.at ?? 0),
              why: m.why ? String(m.why) : null,
              /*
               * The observation this points at, resolved for reading and never
               * copied onto the mark. A pointer whose target has been erased
               * resolves to null rather than to a stale sentence.
               */
              observation: m.observation ? (observations.get(String(m.observation)) ?? null) : null
            }))
          };
        })(),
        missing: thin(d)
      };
    });
}

/**
 * Decisions asking to be looked at again. This is what reaches the Now view.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {number} now
 */
export const revisitsDue = (store, now) => decisions(store, now).filter((d) => d.revisitDue);

/**
 * Record a decision. The user's action, not an agent's.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} args.what
 * @param {string} [args.because]
 * @param {string} [args.rejected]
 * @param {string | string[]} [args.consulted]
 * @param {number} [args.decidedAt]
 * @param {number} [args.revisitDays]
 * @param {string} [args.source]
 * @param {string} [args.status] "proposed" when an agent is suggesting one.
 * @param {number} args.now
 */
export function logDecision(store, { what, because, rejected, consulted, decidedAt, revisitDays, source, status, now }) {
  if (!String(what ?? "").trim()) {
    return { error: "Ett beslut behöver en mening som säger vad som beslutades." };
  }
  if (status !== undefined && !isDecisionStatus(String(status))) {
    return { error: `Unknown status "${status}". Valid: proposed, recorded, revisited, reversed.` };
  }

  const people = resolveEveryone(store, consulted);
  if (!people.ok) {
    return { error: people.error };
  }

  const decided = typeof decidedAt === "number" ? decidedAt : now;
  const id = store.create("decisions", {
    what: String(what).trim(),
    because: because ? String(because).trim() : null,
    rejected: rejected ? String(rejected).trim() : null,
    consulted: people.ids,
    status: status ? String(status) : "recorded",
    decidedAt: decided,
    // A proposal has no revisit date. It has not been decided, so there is
    // nothing to come back to yet - recording it is what sets the clock.
    revisitAt: status === "proposed" ? null : revisitAt(decided, revisitDays ?? DEFAULT_REVISIT_DAYS),
    source: source ? String(source).trim() : null
  });

  return { id, logged: String(what).trim(), missing: thin({ what, because, rejected, consulted: people.ids }) };
}

/**
 * Accept a proposal, or edit a decision.
 *
 * Accepting is what starts the revisit clock, which is why it cannot be an
 * agent's action: an agent that both proposes and accepts is an agent writing
 * your decision log.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} id
 * @param {Record<string, any>} fields
 * @param {number} now
 */
export function decideDecision(store, id, fields, now) {
  const row = store.rows("decisions").find((d) => d.id === id);
  if (!row) {
    return { error: `No decision with id "${id}".` };
  }

  /** @type {Record<string, any>} */
  const patch = {};

  if (fields.status !== undefined) {
    if (!isDecisionStatus(String(fields.status))) {
      return { error: `Unknown status "${fields.status}".` };
    }
    patch.status = String(fields.status);
    // Recording a proposal is when the clock starts. Reversing stops it: a
    // reversed decision is history, and asking about it again asks nothing.
    if (patch.status === "reversed") {
      patch.revisitAt = null;
    } else if (String(row.status ?? "") === "proposed") {
      patch.revisitAt = revisitAt(now, fields.revisitDays ?? DEFAULT_REVISIT_DAYS);
      patch.decidedAt = now;
    }
  }

  for (const field of ["what", "because", "rejected", "source"]) {
    if (fields[field] !== undefined) {
      patch[field] = String(fields[field]).trim() || null;
    }
  }

  if (fields.consulted !== undefined) {
    const people = resolveEveryone(store, fields.consulted);
    if (!people.ok) {
      return { error: people.error };
    }
    patch.consulted = people.ids;
  }

  if (fields.revisitDays !== undefined && patch.revisitAt === undefined) {
    patch.revisitAt = revisitAt(now, fields.revisitDays);
  }

  if (Object.keys(patch).length === 0) {
    return { error: "Ingenting att ändra." };
  }

  store.update("decisions", id, patch);
  return { id, changed: Object.keys(patch) };
}

/**
 * Push a revisit further out, having looked at it.
 *
 * Separate from editing, because "I looked and it still holds" is the common
 * answer and should cost one click. Without it the honest move is to delete the
 * revisit date, and then the decision quietly stops coming back at all.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} id
 * @param {number} now
 * @param {number} [days]
 */
export function stillHolds(store, id, now, days = DEFAULT_REVISIT_DAYS) {
  const row = store.rows("decisions").find((d) => d.id === id);
  if (!row) {
    return { error: `No decision with id "${id}".` };
  }
  if (String(row.status ?? "") === "proposed") {
    return { error: "Det är ett förslag, inte ett beslut. Registrera det först." };
  }
  store.update("decisions", id, { status: "revisited", revisitAt: revisitAt(now, days) });
  return { id, revisitIn: `${days} dagar` };
}

/**
 * Record that a decision was followed on a given day, or was not.
 *
 * One call for both kinds, because they are one act with a flag: the whole
 * design is that the two counts sit in one collection and are never added
 * together, and two functions would be two places to keep that true.
 *
 * `observation` points at a row that already exists on somebody's page. It is
 * never a copy: "somebody broke this" is a statement about a person, it belongs
 * on that person, and restating it here would rebuild the duplication the
 * replace-an-observation work exists to remove - two rows saying one thing, with
 * a correction to either leaving the other standing.
 *
 * App only. There is no MCP tool, and that is a question on the card rather than
 * a decision taken here: a deviation is an assertion about another person, which
 * is the same class of row as writing an assessment - already parked, and
 * answered "no" for observations on 2026-09-09.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} args.decision
 * @param {boolean} args.held True when it was followed.
 * @param {string} [args.why] A short word on the occasion, not on the person.
 * @param {string} [args.observation] An existing observation to point at.
 * @param {number} [args.at] When it happened. Defaults to now.
 * @param {number} args.now
 */
export function markDecision(store, { decision, held, why, observation, at, now }) {
  const row = store.rows("decisions").find((d) => String(d.id) === String(decision));
  if (!row) {
    return { error: `Inget beslut med id "${decision}".` };
  }
  if (typeof held !== "boolean") {
    return {
      error: "En notering måste säga vilket av de två den är: hållet eller brutet."
    };
  }

  /*
   * A pointer at nothing is worse than no pointer: it reads on the page as
   * though there is evidence to look at. Checked here rather than shrugged at,
   * because the id comes from a picker and a stale one means the observation was
   * erased between opening the dialog and confirming it.
   */
  let points = null;
  if (observation !== undefined && String(observation).trim() !== "") {
    const found = store
      .rows("evidence")
      .find((e) => String(e.id) === String(observation).trim());
    if (!found) {
      return { error: "Observationen finns inte längre - den kan ha tagits bort." };
    }
    points = String(found.id);
  }

  const when = Number(at);
  const id = store.create("decisionMarks", {
    decision: String(row.id),
    held,
    why: String(why ?? "").trim() || null,
    observation: points,
    at: Number.isFinite(when) && when > 0 ? when : now
  });
  return { id, decision: String(row.id), held };
}

/**
 * Take back a mark that was entered against the wrong decision, or twice.
 *
 * Removed outright rather than superseded, unlike an observation. A mark carries
 * no reading of anybody: it is a tally entry saying an occasion happened, so
 * there is no earlier judgement worth keeping beside a corrected one. What it
 * points AT is untouched - the observation is somebody else's row and stays
 * exactly where it was.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} id
 */
export function unmarkDecision(store, id) {
  const row = store.rows("decisionMarks").find((m) => String(m.id) === String(id));
  if (!row) {
    return { error: `Ingen notering med id "${id}".` };
  }
  store.remove("decisionMarks", String(row.id));
  return { id: String(row.id), removed: true };
}
