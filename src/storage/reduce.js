/**
 * Turning the event stream into current state.
 *
 * The reducer is pure and total-ordered: given the same events it always
 * produces the same state, on any machine. Conflicting edits resolve
 * field-by-field with last-write-wins, which is decided entirely by the event
 * order rather than by which process happened to write first.
 *
 * Every entity carries provenance (`_by`, `_at`, `_editedBy`) so the UI can
 * label anything a model or an agent produced without a separate bookkeeping
 * table.
 */

/**
 * Entities that may be created, updated and tombstoned generically.
 *
 * A whitelist rather than open-ended tables: an agent with write access should
 * be able to add a promise, not invent a new kind of record.
 */
export const COLLECTIONS = /** @type {const} */ ([
  "people",
  "promises",
  "projects",
  "duties",
  "touches",
  "evidence",
  "themes",
  /** Pieces of work with a stated delegation level and an owner. */
  "workstreams",
  /** The questions Tend asks rather than derives, and their answers. */
  "signals",
  "signalAnswers",
  /** Which Nib categories feed which person, and as what kind of contact. */
  "sources"
]);

/**
 * @typedef {Record<string, any> & {
 *   id: string,
 *   _by: string,
 *   _at: number,
 *   _editedBy?: string,
 *   _editedAt?: number,
 *   _deleted?: boolean
 * }} Entity
 */

/**
 * @typedef {object} TendState
 * @property {Record<string, Record<string, Entity>>} c Collections, keyed by id.
 * @property {Entity | null} focus The single active focus, or null.
 * @property {number} applied How many events were applied.
 * @property {{ op: string, reason: string, id: string }[]} rejected Events that did not apply.
 */

/** @returns {TendState} */
export function emptyState() {
  /** @type {Record<string, Record<string, Entity>>} */
  const c = {};
  for (const name of COLLECTIONS) {
    c[name] = {};
  }
  return { c, focus: null, applied: 0, rejected: [] };
}

/**
 * Apply one event to a state, in place.
 *
 * Unknown or malformed events are recorded in `rejected` rather than thrown:
 * a single bad event written by an older or buggier client must not make the
 * whole log unreadable.
 *
 * @param {TendState} state
 * @param {import("./events.js").TendEvent} e
 */
export function applyEvent(state, e) {
  const [collection, action] = e.op.split(".");

  if (collection === "focus") {
    applyFocus(state, action, e);
    return;
  }

  if (!COLLECTIONS.includes(/** @type {any} */ (collection))) {
    state.rejected.push({ op: e.op, reason: "unknown collection", id: e.id });
    return;
  }

  const table = state.c[collection];
  const id = typeof e.p.id === "string" ? e.p.id : null;
  if (!id) {
    state.rejected.push({ op: e.op, reason: "payload has no id", id: e.id });
    return;
  }

  if (action === "create") {
    // A replayed create must not wipe later edits, so an existing row only
    // gains the fields it is missing.
    const existing = table[id];
    if (existing) {
      table[id] = { ...e.p, ...existing, id };
      state.applied += 1;
      return;
    }
    table[id] = { ...e.p, id, _by: e.w, _at: e.ts };
    state.applied += 1;
    return;
  }

  if (action === "update") {
    const existing = table[id];
    if (!existing) {
      // Update before create: keep it as a partial row so the create can fill
      // the rest in. Out-of-order arrival is normal across two machines.
      table[id] = { ...e.p, id, _by: e.w, _at: e.ts, _editedBy: e.w, _editedAt: e.ts };
      state.applied += 1;
      return;
    }
    Object.assign(existing, e.p, { id, _editedBy: e.w, _editedAt: e.ts });
    state.applied += 1;
    return;
  }

  if (action === "delete") {
    const existing = table[id] ?? { id, _by: e.w, _at: e.ts };
    table[id] = { ...existing, _deleted: true, _editedBy: e.w, _editedAt: e.ts };
    state.applied += 1;
    return;
  }

  state.rejected.push({ op: e.op, reason: "unknown action", id: e.id });
}

/**
 * Focus is a singleton rather than a collection: there is one current focus or
 * none, and setting a new one ends the previous.
 *
 * @param {TendState} state
 * @param {string} action
 * @param {import("./events.js").TendEvent} e
 */
function applyFocus(state, action, e) {
  if (action === "set") {
    state.focus = { ...e.p, id: String(e.p.id ?? e.id), _by: e.w, _at: e.ts };
    state.applied += 1;
    return;
  }
  if (action === "update" && state.focus) {
    Object.assign(state.focus, e.p, { _editedBy: e.w, _editedAt: e.ts });
    state.applied += 1;
    return;
  }
  if (action === "end") {
    state.focus = null;
    state.applied += 1;
    return;
  }
  state.rejected.push({ op: e.op, reason: "unknown focus action", id: e.id });
}

/**
 * Reduce an ordered event stream to state.
 *
 * @param {import("./events.js").TendEvent[]} events Must already be in total order.
 * @returns {TendState}
 */
export function reduce(events) {
  const state = emptyState();
  for (const e of events) {
    applyEvent(state, e);
  }
  return state;
}

/**
 * Live rows of one collection, tombstones removed.
 *
 * @param {TendState} state
 * @param {string} collection
 * @returns {Entity[]}
 */
export function rows(state, collection) {
  const table = state.c[collection];
  if (!table) {
    return [];
  }
  return Object.values(table).filter((r) => !r._deleted);
}
