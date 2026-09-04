/**
 * Plans: the write side of the second shape.
 *
 * See `domain/plan.js` for why a plan is not a direction. The rules enforced
 * here follow from that, and two of them are the reason this is a service
 * module rather than a generic create:
 *
 * A plan is never accepted as ready. `status` is set from `isReady`, so a plan
 * with unfilled fields is a draft whatever the caller says - it is not
 * possible to start one by claiming it started.
 *
 * And no agent may write one. Not in AGENT_WRITABLE, and there is no MCP tool.
 * A promise is something somebody said out loud and a person is waiting for it;
 * a plan is a decision about whether somebody keeps their job in its current
 * shape. The role map and the decision log draw the same line for the same
 * reason.
 */

import { isLivePlan, isReady, premiseUntested, readiness, theirCopy } from "../domain/plan.js";
import { resolvePerson } from "./resolve.js";

/**
 * Start or replace the plan on somebody.
 *
 * One live plan per person, enforced rather than assumed. Two plans at once
 * means two answers to "is this person below the bar", and the second one is
 * always the one nobody remembers agreeing to.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {Record<string, any>} args
 * @param {number} [now]
 */
export function setPlan(store, args, now = Date.now()) {
  const found = resolvePerson(store, String(args.person ?? ""));
  if (!found.ok) {
    return { error: found.error };
  }

  const existing = store
    .rows("plans")
    .find((p) => !p._deleted && p.person === found.person.id && isLivePlan(String(p.status)));
  if (existing) {
    return {
      error:
        `${found.person.name} already has a live plan. End it before starting another - two at ` +
        `once means two answers to whether somebody is below the bar.`
    };
  }

  const row = fields(args);
  /*
   * The status is decided here and not passed in. A plan is ready or it is a
   * draft, and letting a caller say which would make "started" a claim rather
   * than a fact about the fields.
   */
  const status = isReady({ id: "", person: found.person.id, ...row }) ? "running" : "draft";

  const id = store.create("plans", {
    person: found.person.id,
    ...row,
    status,
    startedAt: status === "running" ? now : null,
    createdAt: now
  });

  return { id, status, missing: readiness({ id: String(id), person: found.person.id, ...row }) };
}

/**
 * Fill in more of a plan.
 *
 * Recomputes the status, so answering the last open field is what starts it -
 * there is no separate "start" action to forget.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {Record<string, any>} args
 * @param {number} [now]
 */
export function updatePlan(store, args, now = Date.now()) {
  const id = String(args.id ?? "");
  const row = store.rows("plans").find((p) => !p._deleted && String(p.id) === id);
  if (!row) {
    return { error: `No plan with id "${id}".` };
  }
  if (!isLivePlan(String(row.status))) {
    return { error: `That plan has ended. Its record stays as it is.` };
  }

  const merged = { ...row, ...fields(args) };
  const ready = isReady(/** @type {any} */ (merged));

  store.update("plans", id, {
    ...fields(args),
    status: ready ? "running" : "draft",
    /* Kept if it was already running, so the clock is not restarted by an edit. */
    startedAt: ready ? (typeof row.startedAt === "number" ? row.startedAt : now) : null
  });

  return { id, status: ready ? "running" : "draft", missing: readiness(/** @type {any} */ (merged)) };
}

/**
 * End a plan, one way or the other.
 *
 * `met`, `notMet` or `dropped`, and the reason is required for the two that
 * are not `met`. A plan that ends with no reason turns into a mood in the room
 * six months later that neither of them can name - the same argument the growth
 * threads make, and it is more load-bearing here because this one had a
 * consequence attached to it.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {Record<string, any>} args
 * @param {number} [now]
 */
export function endPlan(store, args, now = Date.now()) {
  const id = String(args.id ?? "");
  const row = store.rows("plans").find((p) => !p._deleted && String(p.id) === id);
  if (!row) {
    return { error: `No plan with id "${id}".` };
  }
  const as = String(args.as ?? "");
  if (!["met", "notMet", "dropped"].includes(as)) {
    return { error: `A plan ends as met, notMet or dropped. Got "${as}".` };
  }
  const why = String(args.why ?? "").trim();
  if (as !== "met" && why === "") {
    return { error: `Ending a plan as ${as} needs a reason. It is what makes it readable later.` };
  }

  store.update("plans", id, { status: as, endedAt: now, endedWhy: why });
  return { id, status: as };
}

/**
 * The live plan on somebody, with what it still needs.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} personId
 */
export function planFor(store, personId) {
  const row = store
    .rows("plans")
    .find((p) => !p._deleted && p.person === personId && isLivePlan(String(p.status)));
  if (!row) {
    return null;
  }

  const plan = /** @type {any} */ (row);
  return {
    id: String(row.id),
    person: String(row.person),
    status: String(row.status),
    gap: String(row.gap ?? ""),
    theyKnow: typeof row.theyKnow === "boolean" ? row.theyKnow : null,
    saidOutLoud: String(row.saidOutLoud ?? ""),
    goal: String(row.goal ?? ""),
    delivery: String(row.delivery ?? ""),
    measure: String(row.measure ?? ""),
    baseline: String(row.baseline ?? ""),
    dueAt: typeof row.dueAt === "number" ? row.dueAt : null,
    ifNotMet: String(row.ifNotMet ?? ""),
    hr: String(row.hr ?? ""),
    growth: row.growth ? String(row.growth) : null,
    /*
     * What it still needs, and whether its premise survived its own second
     * question. Both computed here rather than in the window, so an agent
     * reading a plan over MCP sees the same answer - and so the window cannot
     * grow its own idea of what "ready" means.
     */
    missing: readiness(plan),
    premiseUntested: premiseUntested(plan),
    theirCopy: theirCopy(plan)
  };
}

/**
 * Every field a caller may set, and nothing else.
 *
 * A whitelist rather than a spread of `args`, so a caller cannot set `status`,
 * `startedAt` or an id by passing one. Those are decided here.
 *
 * @param {Record<string, any>} args
 */
function fields(args) {
  /** @type {Record<string, any>} */
  const out = {};
  for (const key of [
    "gap",
    "saidOutLoud",
    "goal",
    "delivery",
    "measure",
    "baseline",
    "ifNotMet",
    "hr",
    "growth"
  ]) {
    if (typeof args[key] === "string") {
      out[key] = args[key];
    }
  }
  if (typeof args.theyKnow === "boolean") {
    out.theyKnow = args.theyKnow;
  }
  if (typeof args.dueAt === "number" && Number.isFinite(args.dueAt)) {
    out.dueAt = args.dueAt;
  }
  return out;
}
