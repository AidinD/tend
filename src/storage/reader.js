/**
 * Reading the event log back.
 *
 * The reader is deliberately forgiving about individual lines and strict about
 * ordering. A partially synced file is a normal, temporary state in a Dropbox
 * folder, so a torn last line is skipped rather than treated as corruption -
 * the next read sees it whole. Ordering, on the other hand, is fixed by
 * compareEvents so the same files always produce the same state.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { compareEvents, isEvent } from "./events.js";

/** Matches `<writer>.jsonl` and `<writer>.<segment>.jsonl`. */
const SEGMENT_RE = /^(.+?)(?:\.(\d+))?\.jsonl$/;

/**
 * @typedef {object} ReadResult
 * @property {import("./events.js").TendEvent[]} events In total order.
 * @property {number} skipped Lines that could not be used.
 * @property {string[]} files Segment files that were read.
 * @property {number} stamp Newest mtime seen, for cheap change detection.
 */

/**
 * List the segment files in an events directory.
 *
 * @param {string} dir
 * @returns {string[]} Absolute paths, sorted for stable reads.
 */
export function listSegments(dir) {
  /** @type {string[]} */
  let names;
  try {
    names = readdirSync(dir);
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === "ENOENT") {
      return [];
    }
    throw err;
  }

  return names
    .filter((n) => SEGMENT_RE.test(n))
    .sort()
    .map((n) => join(dir, n));
}

/**
 * Parse one segment file into events, skipping anything unusable.
 *
 * @param {string} path
 * @returns {{ events: import("./events.js").TendEvent[], skipped: number }}
 */
export function readSegment(path) {
  /** @type {import("./events.js").TendEvent[]} */
  const events = [];
  let skipped = 0;

  /** @type {string} */
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === "ENOENT") {
      return { events, skipped };
    }
    throw err;
  }

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      skipped += 1;
      continue;
    }
    if (!isEvent(parsed)) {
      skipped += 1;
      continue;
    }
    events.push(parsed);
  }

  return { events, skipped };
}

/**
 * Read every segment in an events directory and merge them into one ordered
 * stream.
 *
 * @param {string} dir
 * @returns {ReadResult}
 */
export function readAll(dir) {
  const files = listSegments(dir);
  /** @type {import("./events.js").TendEvent[]} */
  const events = [];
  let skipped = 0;
  let stamp = 0;

  for (const file of files) {
    const { events: found, skipped: bad } = readSegment(file);
    events.push(...found);
    skipped += bad;
    try {
      stamp = Math.max(stamp, statSync(file).mtimeMs);
    } catch {
      // The file disappeared between listing and stat. Harmless: the events we
      // already parsed are still valid, and a later read will settle it.
    }
  }

  events.sort(compareEvents);
  return { events, skipped, files, stamp };
}

/**
 * Cheap check for "has anything changed since I last read".
 *
 * Compares the newest mtime and the file count, which is enough because events
 * are only ever appended - a change always moves an mtime or adds a file.
 *
 * @param {string} dir
 * @returns {{ stamp: number, count: number }}
 */
export function readStamp(dir) {
  const files = listSegments(dir);
  let stamp = 0;
  for (const file of files) {
    try {
      stamp = Math.max(stamp, statSync(file).mtimeMs);
    } catch {
      // Ignore: a file we cannot stat cannot contribute a newer stamp.
    }
  }
  return { stamp, count: files.length };
}
