/**
 * Notice when another process writes to the log.
 *
 * The storage layer is built for concurrent writers - the app, the MCP server
 * and a scheduled job can all be appending at once - and the store re-reads
 * from disk whenever anything asks it for state. What was missing is the
 * asking: a window sitting on a view has no reason to call the store again, so
 * a contact logged over MCP stayed invisible until the user happened to
 * navigate. The data was never wrong; the screen just never asked.
 *
 * ## Its own writes are not news
 *
 * Every writer owns its own segment files, named after its writer id. Telling
 * the app about its own append would redraw the view a second time immediately
 * after the action that caused it - visible as a flicker, and worse, it would
 * make the watcher look like the thing that keeps the app up to date when in
 * fact the action already did.
 *
 * ## Debounced, because a write is not one event
 *
 * One append can produce several filesystem notifications, and if the data
 * directory is in Dropbox a sync can produce a burst of them. The callback
 * fires once per quiet period rather than once per notification.
 */

import { mkdirSync, watch } from "node:fs";

/** How long the directory has to go quiet before the change is reported. */
export const SETTLE_MS = 300;

/**
 * Is this filename a segment belonging to the given writer?
 *
 * Segments are `<writer>.jsonl` and `<writer>.<n>.jsonl`. A plain `startsWith`
 * would also match a different writer whose id begins with this one's, so the
 * character after the id has to be the separator.
 *
 * @param {string} filename
 * @param {string} writer
 * @returns {boolean}
 */
export function belongsTo(filename, writer) {
  if (!filename.startsWith(writer)) {
    return false;
  }
  const rest = filename.slice(writer.length);
  return rest === ".jsonl" || /^\.\d+\.jsonl$/.test(rest);
}

/**
 * Watch an events directory and call back when somebody else appends to it.
 *
 * Never throws. A machine or filesystem that cannot watch is a reason for the
 * window to stop refreshing itself, not a reason for the app to fail to start -
 * so a failure is reported through `onWarning` and the returned stop function
 * still works.
 *
 * @param {object} args
 * @param {string} args.dir The events directory.
 * @param {string} args.self Writer id whose own segments are not news.
 * @param {() => void} args.onChange
 * @param {(msg: string) => void} [args.onWarning]
 * @param {number} [args.settleMs]
 * @returns {() => void} Stop watching.
 */
export function watchEvents({ dir, self, onChange, onWarning = () => {}, settleMs = SETTLE_MS }) {
  /** @type {NodeJS.Timeout | null} */
  let timer = null;
  /** @type {import("node:fs").FSWatcher | null} */
  let watcher = null;

  const fire = () => {
    timer = null;
    try {
      onChange();
    } catch (error) {
      onWarning(`En ändringsnotis kunde inte levereras: ${describe(error)}`);
    }
  };

  try {
    // The directory does not exist until something has been written. Creating
    // it is cheaper than watching the parent and filtering, and the writer
    // would create it moments later anyway.
    mkdirSync(dir, { recursive: true });
    watcher = watch(dir, { persistent: false }, (_type, filename) => {
      // No filename means the platform could not say what changed. Treat it as
      // news: a missed refresh is the bug being fixed here, and an extra one
      // costs a redraw.
      if (typeof filename === "string" && belongsTo(filename, self)) {
        return;
      }
      if (timer !== null) {
        clearTimeout(timer);
      }
      timer = setTimeout(fire, settleMs);
    });
    watcher.on("error", (error) => {
      onWarning(`Slutade bevaka ändringar från andra fönster: ${describe(error)}`);
    });
  } catch (error) {
    onWarning(
      `Kunde inte bevaka ändringar från andra fönster, så det här uppdateras bara när du navigerar: ${describe(error)}`
    );
  }

  return () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    watcher?.close();
    watcher = null;
  };
}

/** @param {unknown} error */
function describe(error) {
  return error instanceof Error ? error.message : String(error);
}
