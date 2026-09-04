/**
 * Keeping Tend's copy of Nib current, without being asked.
 *
 * ## The failure this exists to remove
 *
 * Indexing was correct and idempotent from the first day, and reachable from
 * exactly two places: a button in Settings and a command in the palette. Which
 * means the app's central claim - "you have not spoken to this person in three
 * weeks" - was true only for somebody who remembered to press a button. Write
 * the 1-1 note, tag it, close Nib, and Tend went on reporting silence.
 *
 * That is the one direction this app must never fail in, and it failed in it by
 * default. Not with a wrong answer either: with a confident right-looking answer
 * built on a stale copy, which is worse, because there is nothing to notice.
 *
 * ## Two triggers, on purpose
 *
 * A watcher on Nib's index, so a note tagged a moment ago counts a moment
 * later, and a slow sweep underneath it. The sweep is not belt-and-braces: the
 * notebook can live in a synced folder, where a file arriving from another
 * machine is written by a background process whose notifications are not
 * something to stake the app's core claim on. A ten-minute floor on staleness
 * costs one small JSON read per sweep and removes a whole class of "why does it
 * not see my note" that would otherwise be unreproducible.
 *
 * The directory is watched rather than the file. Nib writes atomically -
 * temporary file, then rename - and a watch held on the old file survives the
 * rename as a watch on nothing.
 *
 * ## Why this is safe to run unattended
 *
 * Indexing reads `index.json` and nothing else. No note body is opened, so
 * nothing automatic here ever reads a word written about a colleague; that
 * boundary is the reason `noteBody` sits alone at the bottom of nib.js with
 * nothing calling it. Every row written carries a deterministic id, so a sync
 * that runs a hundred times writes what one run would.
 *
 * ## What it will not do
 *
 * It never creates the Nib data directory. A missing directory means Nib is not
 * installed or is configured elsewhere, and the useful response to that is to
 * say so - not to conjure an empty notebook that makes a misconfiguration look
 * like an empty notebook.
 */

import { watch } from "node:fs";

import { indexNib, nibDataDir } from "./nib.js";

/** How long the notebook has to go quiet before a sync runs. */
export const SETTLE_MS = 700;

/** The backstop, for changes the filesystem did not report. */
export const SWEEP_MS = 10 * 60 * 1000;

/**
 * @typedef {object} SyncState
 * @property {number | null} at When the last sync ran, or null if none has.
 * @property {"never" | "unbound" | "clean" | "changed" | "failed"} outcome
 * @property {number} contacts
 * @property {number} promises
 * @property {number} resolved
 * @property {number} retracted
 * @property {number} moves
 * @property {string[]} skipped
 * @property {string | null} error
 * @property {boolean} watching Whether the notebook is being watched at all.
 * @property {string} dir
 */

/**
 * A sync state that has never run.
 *
 * @param {string} dir
 * @returns {SyncState}
 */
export function idleState(dir) {
  return {
    at: null,
    outcome: "never",
    contacts: 0,
    promises: 0,
    resolved: 0,
    retracted: 0,
    moves: 0,
    skipped: [],
    error: null,
    watching: false,
    dir
  };
}

/**
 * Index once, and describe what happened in a form a screen can show.
 *
 * The unbound case is separated from the failed one because they are not the
 * same news. Nothing bound yet is a step not taken; a failure is something to
 * look at. Reporting the first as an error is how a setup screen ends up showing
 * a red state to somebody who has done nothing wrong.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} [opts]
 * @param {string} [opts.dir]
 * @param {number} [opts.now]
 * @returns {SyncState}
 */
export function syncOnce(store, { dir = nibDataDir(), now = Date.now() } = {}) {
  const base = { ...idleState(dir), at: now };

  if (store.rows("sources").length === 0) {
    return { ...base, outcome: "unbound" };
  }

  const result = indexNib(store, { dir });
  if ("error" in result) {
    return { ...base, outcome: "failed", error: result.error };
  }

  const written =
    result.contacts + result.promises + result.resolved + result.retracted + result.moves;

  return {
    ...base,
    outcome: written > 0 ? "changed" : "clean",
    contacts: result.contacts,
    promises: result.promises,
    resolved: result.resolved,
    retracted: result.retracted,
    moves: result.moves,
    skipped: result.skipped
  };
}

/**
 * The last sync, in a sentence.
 *
 * Written for the Settings card, which is the only place somebody goes to ask
 * "is this actually working". So it answers that and not much else: what it
 * found, and when. A count of zero is stated rather than hidden - "nothing new"
 * with a timestamp is the message that makes a silent background job
 * trustworthy, and it is exactly the message a summary that only speaks up on
 * changes cannot send.
 *
 * @param {SyncState} state
 * @param {number} [now]
 * @returns {string}
 */
export function describeSync(state, now = Date.now()) {
  if (state.outcome === "never") {
    return state.watching
      ? "Bevakar ändringar. Inget har behövt importeras än den här sessionen."
      : "Bevakar inte. Nib gick inte att läsa när det här fönstret öppnades.";
  }
  if (state.outcome === "unbound") {
    return "Inget är bundet till någon än, så det finns inget att importera.";
  }
  if (state.outcome === "failed") {
    return `Senaste importen misslyckades ${recentlyWords(state.at, now)}: ${state.error ?? "okänd orsak"}`;
  }

  /** @type {string[]} */
  const parts = [];
  if (state.contacts > 0) {
    parts.push(`${state.contacts} ${state.contacts === 1 ? "kontaktpost" : "kontaktposter"}`);
  }
  if (state.promises > 0) {
    parts.push(`${state.promises} ${state.promises === 1 ? "löfte" : "löften"}`);
  }
  if (state.resolved > 0) {
    parts.push(`${state.resolved} stängda av en bock i Nib`);
  }
  if (state.retracted > 0) {
    parts.push(`${state.retracted} tillbakadragna efter att en tagg ändrades`);
  }
  if (state.moves > 0) {
    parts.push(`${state.moves} ${state.moves === 1 ? "mapp" : "mappar"} följda till en ny plats`);
  }

  const found = parts.length === 0 ? "hittade inget nytt" : `hämtade in ${parts.join(", ")}`;
  const skipped = state.skipped.length > 0 ? ` Hoppade över: ${state.skipped.join("; ")}.` : "";
  return `Importerade ${recentlyWords(state.at, now)} och ${found}.${skipped}`;
}

/**
 * "just now" / "4 minutes ago" / "2 hours ago".
 *
 * Local to this file rather than borrowed from the domain layer, which words
 * durations in days - the right unit for a cadence and the wrong one for
 * something that ran while you were looking at the screen.
 *
 * Named `recentlyWords` and not `agoWords`, which is what it was called while
 * the domain layer also exported an `agoWords` taking a day count. Two
 * exported functions, one name, different signatures and different units: the
 * same hazard as the one-letter text alias that shadowed a row variable seven
 * times over, and it fails the same way, by compiling and answering plausibly.
 *
 * @param {number | null} at
 * @param {number} now
 * @returns {string}
 */
export function recentlyWords(at, now) {
  if (at === null) {
    return "aldrig";
  }
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 45) {
    return "just nu";
  }
  // "för N minuter sedan" - a circumfix, so the whole phrase is built here
  // rather than by appending a suffix. Same reason `agoWords` exists in the
  // domain instead of a "sedan" glued onto `humanDays`.
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `för ${minutes} ${minutes === 1 ? "minut" : "minuter"} sedan`;
  }
  const hours = Math.round(minutes / 60);
  return `för ${hours} ${hours === 1 ? "timme" : "timmar"} sedan`;
}

/**
 * Is this repeated failure worth saying out loud again?
 *
 * A notebook that cannot be read fails on every sweep, for ever, in exactly the
 * same words. Reporting each one buries the warning list under one message
 * repeated six times an hour, which is the same as having no warning list.
 *
 * @param {SyncState} previous
 * @param {SyncState} next
 * @returns {boolean}
 */
export function worthWarning(previous, next) {
  if (next.outcome !== "failed") {
    return false;
  }
  return previous.outcome !== "failed" || previous.error !== next.error;
}

/**
 * Start keeping the copy current, and hand back the handle to it.
 *
 * Never throws. A filesystem that cannot be watched leaves the sweep running
 * and reports why through `onWarning` - one degraded trigger out of two is not
 * a reason for the window to fail to open.
 *
 * @param {object} args
 * @param {import("../storage/store.js").TendStore} args.store
 * @param {string} [args.dir] Nib data directory.
 * @param {() => void} [args.onChange] Called only when a sync wrote something.
 * @param {(msg: string) => void} [args.onWarning]
 * @param {() => number} [args.now]
 * @param {number} [args.settleMs]
 * @param {number} [args.sweepMs]
 * @returns {{ stop: () => void, state: () => SyncState, run: () => SyncState }}
 */
export function startNibSync({
  store,
  dir = nibDataDir(),
  onChange = () => {},
  onWarning = () => {},
  now = Date.now,
  settleMs = SETTLE_MS,
  sweepMs = SWEEP_MS
}) {
  /** @type {SyncState} */
  let state = idleState(dir);
  /** @type {NodeJS.Timeout | null} */
  let settle = null;
  /** @type {import("node:fs").FSWatcher | null} */
  let watcher = null;
  /** @type {NodeJS.Timeout | null} */
  let sweep = null;
  let stopped = false;

  const run = () => {
    if (stopped) {
      return state;
    }
    const previous = state;
    /** @type {SyncState} */
    let next;
    try {
      next = syncOnce(store, { dir, now: now() });
    } catch (error) {
      next = {
        ...idleState(dir),
        at: now(),
        outcome: "failed",
        error: `Importen kastade ett fel: ${describe(error)}`
      };
    }
    // Whether the notebook is being watched is a property of this handle rather
    // than of the sync that just ran, so it survives every result.
    state = { ...next, watching: watcher !== null };

    if (worthWarning(previous, state)) {
      onWarning(`Importing from Nib failed: ${state.error}`);
    }
    if (state.outcome === "changed") {
      try {
        onChange();
      } catch (error) {
        onWarning(`En Nib-import blev klar men fönstret kunde inte få veta: ${describe(error)}`);
      }
    }
    return state;
  };

  try {
    // Deliberately not recursive and deliberately not creating the directory.
    // One filename is interesting; note bodies live in a subdirectory and are
    // rewritten on every save, and watching those would mean a sync per typed
    // sentence for no gain - nothing automatic reads them.
    watcher = watch(dir, { persistent: false }, (_type, filename) => {
      if (typeof filename === "string" && filename !== "index.json") {
        return;
      }
      if (settle !== null) {
        clearTimeout(settle);
      }
      settle = setTimeout(() => {
        settle = null;
        run();
      }, settleMs);
    });
    watcher.on("error", (error) => {
      onWarning(
        `Slutade bevaka Nib efter nya anteckningar, så importen väntar nu på den periodiska kontrollen: ${describe(error)}`
      );
      watcher = null;
      state = { ...state, watching: false };
    });
  } catch (error) {
    watcher = null;
    onWarning(
      `Kunde inte bevaka ${dir} efter nya anteckningar, så anteckningar importeras på en timer i stället: ${describe(error)}`
    );
  }

  sweep = setInterval(run, sweepMs);
  // Nothing here should keep the process alive on its own account.
  sweep.unref?.();

  // Once at startup, before either trigger has had a chance to fire. A window
  // opened after a week away should not show a week-old picture until the first
  // sweep lands.
  run();

  return {
    stop: () => {
      stopped = true;
      if (settle !== null) {
        clearTimeout(settle);
        settle = null;
      }
      if (sweep !== null) {
        clearInterval(sweep);
        sweep = null;
      }
      watcher?.close();
      watcher = null;
    },
    state: () => state,
    run
  };
}

/** @param {unknown} error */
function describe(error) {
  return error instanceof Error ? error.message : String(error);
}
