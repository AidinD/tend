/**
 * Event shape and identity.
 *
 * Every change to Tend's data is one append-only event. Nothing is ever
 * rewritten in place, which is what makes concurrent writers safe. See
 * docs/storage.md for the reasoning.
 */

import { hostname } from "node:os";

/**
 * @typedef {object} TendEvent
 * @property {string} id    Unique, sortable within a writer: `<ts36>-<seq36>`.
 * @property {number} ts    Milliseconds since epoch, when the writer created it.
 * @property {string} w     Writer id, e.g. "desktop-app".
 * @property {number} seq   Per-writer sequence number, breaks same-millisecond ties.
 * @property {string} op    Operation, e.g. "promise.create".
 * @property {Record<string, any>} p Payload. Deliberately loose: the reducer
 *   validates what it needs per operation, so an older client writing an extra
 *   field is carried through rather than rejected.
 */

/** Roles that write to the log. One file per writer, never shared. */
export const ROLES = /** @type {const} */ (["app", "mcp", "job"]);

/**
 * Build a writer id from the machine and the role.
 *
 * Two processes on the same machine must never share a writer id, and neither
 * must the same role on two machines - a writer id owns its file exclusively.
 *
 * @param {string} role One of ROLES.
 * @param {string} [host] Override the machine name (tests).
 * @returns {string}
 */
export function writerId(role, host = hostname()) {
  if (!ROLES.includes(/** @type {any} */ (role))) {
    throw new Error(`Unknown writer role "${role}". Expected one of: ${ROLES.join(", ")}`);
  }
  const machine = host.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${machine || "unknown"}-${role}`;
}

/**
 * Create a sequencer for one writer. Sequence numbers only need to be unique
 * within a writer, so a plain counter is enough and needs no persistence:
 * the timestamp already separates events from different runs.
 *
 * @param {string} w Writer id.
 * @param {() => number} [now] Clock, injectable for tests.
 */
export function makeEventFactory(w, now = Date.now) {
  let seq = 0;
  /**
   * @param {string} op
   * @param {Record<string, any>} p
   * @returns {TendEvent}
   */
  return function event(op, p) {
    const ts = now();
    const n = seq++;
    return { id: `${ts.toString(36)}-${n.toString(36)}`, ts, w, seq: n, op, p };
  };
}

/**
 * Total order over events from any set of writers.
 *
 * Deterministic on purpose: the same files always reduce to the same state, on
 * any machine, in any read order. Timestamp first, then writer id, then the
 * per-writer sequence.
 *
 * @param {TendEvent} a
 * @param {TendEvent} b
 * @returns {number}
 */
export function compareEvents(a, b) {
  if (a.ts !== b.ts) {
    return a.ts - b.ts;
  }
  if (a.w !== b.w) {
    return a.w < b.w ? -1 : 1;
  }
  return a.seq - b.seq;
}

/**
 * Is this parsed object actually an event we can apply?
 *
 * A half-synced line from Dropbox can be valid JSON but structurally wrong, so
 * this checks shape rather than trusting the parse.
 *
 * @param {unknown} v
 * @returns {v is TendEvent}
 */
export function isEvent(v) {
  if (typeof v !== "object" || v === null) {
    return false;
  }
  const e = /** @type {Record<string, unknown>} */ (v);
  return (
    typeof e.id === "string" &&
    typeof e.ts === "number" &&
    Number.isFinite(e.ts) &&
    typeof e.w === "string" &&
    typeof e.seq === "number" &&
    typeof e.op === "string" &&
    typeof e.p === "object" &&
    e.p !== null
  );
}
