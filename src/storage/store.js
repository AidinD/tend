/**
 * The store: the only thing the rest of Tend talks to.
 *
 * The Electron app opens one with role "app", the MCP server opens one with
 * role "mcp", and a scheduled job opens one with role "job". They can all run
 * at once, on one machine or several, without coordinating - see
 * docs/storage.md for why that holds.
 */

import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { makeEventFactory, writerId } from "./events.js";
import { readAll, readStamp } from "./reader.js";
import { reduce, rows } from "./reduce.js";
import { EventWriter } from "./writer.js";

/**
 * @typedef {object} StoreOptions
 * @property {string} dataDir Root data directory. `events/` is created inside it.
 * @property {"app" | "mcp" | "job"} role Which process this is.
 * @property {"work" | "private"} [half] Which half of the app this store is.
 *   Defaults to work, which is what every store was before there were two.
 *
 *   Carried here rather than passed down through every call because the half IS
 *   the store: two directories that are never read across, so the question "which
 *   vocabulary applies" has exactly one honest answer per store and it is known
 *   the moment it is opened. Threading a parameter instead would mean every new
 *   function is one somebody can forget to pass it to.
 * @property {string} [host] Override the machine name (tests).
 * @property {() => number} [now] Clock (tests).
 * @property {(msg: string) => void} [onWarning] Surfaced to the user, not swallowed.
 */

export class TendStore {
  /** @param {StoreOptions} opts */
  constructor({ dataDir, role, half = "work", host, now = Date.now, onWarning = () => {} }) {
    this.dataDir = dataDir;
    this.half = half;
    this.eventsDir = join(dataDir, "events");
    this.w = writerId(role, host);
    this.event = makeEventFactory(this.w, now);
    this.onWarning = onWarning;
    this.writer = new EventWriter({
      dir: this.eventsDir,
      w: this.w,
      onRollover: onWarning
    });

    /** @type {import("./reduce.js").TendState | null} */
    this._state = null;
    /** @type {{ stamp: number, count: number } | null} */
    this._stamp = null;
  }

  /**
   * Current state, re-read from disk only when something changed.
   *
   * @param {boolean} [force] Skip the change check.
   * @returns {import("./reduce.js").TendState}
   */
  state(force = false) {
    const stamp = readStamp(this.eventsDir);

    if (
      !force &&
      this._state !== null &&
      this._stamp !== null &&
      this._stamp.stamp === stamp.stamp &&
      this._stamp.count === stamp.count
    ) {
      return this._state;
    }

    const { events, skipped } = readAll(this.eventsDir);
    if (skipped > 0) {
      this.onWarning(
        `${skipped} event line(s) could not be read and were skipped. ` +
          `This is expected while Dropbox is mid-sync; they are picked up on the next read.`
      );
    }

    this._state = reduce(events);
    this._stamp = stamp;
    return this._state;
  }

  /**
   * Write one event and drop the cache.
   *
   * @param {string} op
   * @param {object} payload
   * @returns {import("./events.js").TendEvent}
   */
  emit(op, payload) {
    const e = this.event(op, payload);
    this.writer.append(e);
    this._state = null;
    this._stamp = null;
    return e;
  }

  /**
   * @param {string} collection
   * @param {Record<string, any>} fields Without an id, one is generated.
   * @returns {string} The row id.
   */
  create(collection, fields) {
    const id = typeof fields.id === "string" ? fields.id : randomUUID();
    this.emit(`${collection}.create`, { ...fields, id });
    return id;
  }

  /**
   * @param {string} collection
   * @param {string} id
   * @param {Record<string, any>} fields Only the fields that change.
   */
  update(collection, id, fields) {
    this.emit(`${collection}.update`, { ...fields, id });
  }

  /**
   * Tombstone a row. Nothing is removed from the log; history stays readable.
   *
   * @param {string} collection
   * @param {string} id
   */
  remove(collection, id) {
    this.emit(`${collection}.delete`, { id });
  }

  /**
   * @param {string} collection
   * @returns {import("./reduce.js").Entity[]}
   */
  rows(collection) {
    return rows(this.state(), collection);
  }

  /**
   * Every id this collection has ever held, tombstones included.
   *
   * ## The question it answers
   *
   * "Have I written this row before?" - which is not the same question as "is
   * this row here", and the difference is the whole point. Anything that derives
   * rows from an outside source builds its id from that source, so a deleted row
   * is a deliberate "not this one" that `rows()` cannot see, because `rows()`
   * filters tombstones out.
   *
   * The Nib import asked the wrong one. Delete an imported contact and every
   * later import counted it as new and wrote a create for it. The reducer keeps
   * the tombstone - an existing row only gains the fields it is missing, so
   * `_deleted` survives a replayed create - so nothing came back, and the import
   * reported adding a row it had not added. Harmless and untrustworthy, which is
   * worse than harmless.
   *
   * @param {string} collection
   * @returns {Set<string>}
   */
  takenIds(collection) {
    return new Set(Object.keys(this.state().c[collection] ?? {}));
  }

  /**
   * Every row this collection has ever held, tombstones included, with their
   * contents.
   *
   * `takenIds` answers "have I written this row before" and that is enough
   * while the id carries everything the caller needs. It stopped being enough
   * when the Nib import changed the shape of the ids it derives: recognising an
   * id written under the old shape means reading a field off it, and the ones
   * that matter most are precisely the deleted ones - a derived row deleted by
   * hand is a deliberate "not this one" that must survive the change of shape.
   *
   * A tombstone keeps its fields (the reducer sets `_deleted` on the existing
   * row rather than replacing it), so they are readable here. Callers should
   * expect `_deleted` on some of what they get back and must not treat this as
   * a list of live rows - use `rows` for that.
   *
   * @param {string} collection
   * @returns {import("./reduce.js").Entity[]}
   */
  takenRows(collection) {
    return Object.values(this.state().c[collection] ?? {});
  }

  /** @returns {import("./reduce.js").Entity | null} */
  focus() {
    return this.state().focus;
  }
}

/**
 * @param {StoreOptions} opts
 * @returns {TendStore}
 */
export function openStore(opts) {
  return new TendStore(opts);
}
