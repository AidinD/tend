/**
 * Appending events to disk, safely, on a folder Dropbox is syncing.
 *
 * Two rules do the work:
 *   1. A writer only ever appends to its own file, so two processes never
 *      touch the same bytes and Dropbox never produces a conflicted copy.
 *   2. If a file is momentarily unwritable (Dropbox or a virus scanner holding
 *      it, which happens on Windows), the writer retries and then rolls over
 *      to a numbered spill file rather than losing the event.
 *
 * See docs/storage.md.
 */

import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/** Backoff between append attempts, in milliseconds. */
const RETRY_DELAYS = [20, 40, 80, 160, 320];

/** Errors that mean "someone else holds this file right now", not "this is broken". */
const TRANSIENT = new Set(["EPERM", "EACCES", "EBUSY", "ETXTBSY", "EMFILE"]);

/**
 * Block for a few milliseconds without pulling in timers.
 *
 * A synchronous wait is the right tool here: appends are small and rare, and
 * making the write path async would force every caller to be async for a
 * situation that resolves in well under a second.
 *
 * @param {number} ms
 */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Where a writer's events live. Segment 0 is the primary file; higher segments
 * only appear after a file became unwritable.
 *
 * @param {string} dir Events directory.
 * @param {string} w Writer id.
 * @param {number} segment
 * @returns {string}
 */
export function segmentPath(dir, w, segment) {
  return join(dir, segment === 0 ? `${w}.jsonl` : `${w}.${segment}.jsonl`);
}

export class EventWriter {
  /**
   * @param {object} opts
   * @param {string} opts.dir Events directory. Created if missing.
   * @param {string} opts.w Writer id, from writerId().
   * @param {(ms: number) => void} [opts.sleep] Injectable for tests.
   * @param {(msg: string) => void} [opts.onRollover] Called when a spill file is used.
   * @param {(path: string, line: string) => void} [opts.appendImpl] The raw append.
   *   Injectable so tests can reproduce a file held by Dropbox, which is the one
   *   failure mode that matters here and cannot be provoked reliably otherwise.
   */
  constructor({
    dir,
    w,
    sleep = sleepSync,
    onRollover = () => {},
    appendImpl = (path, line) => appendFileSync(path, line, { encoding: "utf8" })
  }) {
    this.dir = dir;
    this.w = w;
    this.segment = 0;
    this.sleep = sleep;
    this.onRollover = onRollover;
    this.appendImpl = appendImpl;
    mkdirSync(dir, { recursive: true });
  }

  /**
   * Append one event. Returns the path it landed in.
   *
   * @param {import("./events.js").TendEvent} event
   * @returns {string}
   */
  append(event) {
    const line = JSON.stringify(event) + "\n";

    for (;;) {
      const path = segmentPath(this.dir, this.w, this.segment);
      const err = this.#tryAppend(path, line);
      if (!err) {
        return path;
      }

      if (!TRANSIENT.has(/** @type {NodeJS.ErrnoException} */ (err).code ?? "")) {
        throw err;
      }

      // The file is held by something else and stayed held. Move to a fresh
      // segment; the reader picks up every segment, so nothing is lost or
      // reordered by this.
      this.segment += 1;
      this.onRollover(
        `Could not append to ${path} after ${RETRY_DELAYS.length} retries ` +
          `(${/** @type {NodeJS.ErrnoException} */ (err).code}). ` +
          `Rolling over to segment ${this.segment}.`
      );

      if (this.segment > 64) {
        throw new Error(`Event log unwritable: rolled over 64 times in ${this.dir}`);
      }
    }
  }

  /**
   * One append with retries. Returns the last error, or null on success.
   *
   * @param {string} path
   * @param {string} line
   * @returns {Error | null}
   */
  #tryAppend(path, line) {
    /** @type {Error | null} */
    let last = null;

    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
      try {
        this.appendImpl(path, line);
        return null;
      } catch (err) {
        last = /** @type {Error} */ (err);
        const code = /** @type {NodeJS.ErrnoException} */ (err).code ?? "";
        if (!TRANSIENT.has(code)) {
          return last;
        }
        if (attempt < RETRY_DELAYS.length) {
          this.sleep(RETRY_DELAYS[attempt]);
        }
      }
    }

    return last;
  }

  /**
   * Start writing to a fresh segment on the next append. Only useful when a
   * caller knows the current file is compromised; normal operation never needs
   * this because append() rolls over on its own.
   */
  rollover() {
    do {
      this.segment += 1;
    } while (existsSync(segmentPath(this.dir, this.w, this.segment)));
  }
}
