/**
 * Which of the two stores this window is looking at, and how it is remembered.
 *
 * ## Why the choice is not a row in either store
 *
 * The two stores never merge and are never read across, so a mode remembered
 * inside one of them would be a fact about both halves living in one of them -
 * and it would have to be written twice to stay true, which is how the two
 * halves start disagreeing.
 *
 * So it is not data: it is one small file in the app's own per-user
 * configuration directory, alongside window state and everything else that
 * belongs to this machine rather than to the record. When nothing overrides
 * `TEND_DATA_DIR` that directory is also where the work store lives, so the file
 * can end up sitting beside it - which is why the file holds one word and never
 * anything from the private half.
 *
 * A machine that has never chosen is in work mode, which is where everything was
 * before there were modes.
 *
 * ## Why it is sticky at all
 *
 * A mode that resets on restart is one you have to re-choose, and a mode you
 * re-choose is a mode you eventually forget to. Sticky plus loud is the pair that
 * works: the app remembers, and says so where it cannot be missed.
 *
 * Nothing here throws. An unreadable or nonsense file means work mode, which is
 * the safe default in the only direction that matters - the failure to avoid is
 * private data written into the work store, and work mode cannot cause it.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { isMode } from "../domain/paths.js";

/**
 * An override, for the two cases the file cannot serve.
 *
 * A test harness needs to state which half it is driving rather than inherit
 * whichever one the real app was last left in - every check in the work suite is
 * written against the work half, and a run that silently opened the other one
 * would fail in a screenful of ways with nothing in the output naming the cause.
 *
 * And it is the way out of a mode you cannot get out of. The switch lives inside
 * the app, so a window that will not open is a window whose mode cannot be
 * changed; being able to say it on the command line means that is an annoyance
 * rather than an editing-JSON-by-hand afternoon.
 *
 * Deliberately not sticky: it decides this launch and writes nothing, so it
 * cannot leave a machine in a mode nobody chose.
 */
export const MODE_ENV = "TEND_MODE";

/** The file, inside whichever configuration directory is handed in. */
export const MODE_FILE = "mode.json";

/**
 * The mode this launch runs in.
 *
 * The environment first, then the remembered file, then work. A nonsense value
 * in the environment is ignored rather than treated as a failure - the same rule
 * the file follows, and for the same reason: every way of not understanding the
 * answer resolves to the half that cannot leak.
 *
 * @param {string} configDir
 * @param {Record<string, string | undefined>} [env]
 * @returns {import("../domain/paths.js").Mode}
 */
export function readMode(configDir, env = process.env) {
  const override = env[MODE_ENV]?.trim();
  if (override !== undefined && isMode(override)) {
    return override;
  }
  try {
    const parsed = JSON.parse(readFileSync(join(configDir, MODE_FILE), "utf8"));
    const mode = String(parsed?.mode ?? "");
    return isMode(mode) ? mode : "work";
  } catch {
    // Missing, unreadable, half-written: all the same answer, and it is the one
    // that cannot put private words in the work store.
    return "work";
  }
}

/**
 * Remember a mode, and say plainly when it could not be remembered.
 *
 * A failure here is not fatal - the window can still be switched, it just will
 * not come back in the same mode - so it is reported rather than thrown. Silently
 * failing would be worse than either: the mode would appear to change and then
 * quietly revert on the next launch.
 *
 * @param {string} configDir
 * @param {import("../domain/paths.js").Mode} mode
 * @returns {{ ok: true } | { ok: false, why: string }}
 */
export function writeMode(configDir, mode) {
  if (!isMode(mode)) {
    return { ok: false, why: `"${mode}" is not a mode.` };
  }
  try {
    writeFileSync(join(configDir, MODE_FILE), JSON.stringify({ mode }, null, 2), "utf8");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      why: `Läget kunde inte sparas, så nästa start blir i arbetsläge: ${
        error instanceof Error ? error.message : String(error)
      }`
    };
  }
}

/**
 * What the window is called in each mode.
 *
 * The title bar is the one label that is visible when the app is not focused -
 * in the taskbar, in a window switcher - so it is the one that has to carry the
 * mode. A window you cannot identify without bringing it forward is a window you
 * can type into by mistake.
 *
 * @param {import("../domain/paths.js").Mode} mode
 * @returns {string}
 */
export function windowTitle(mode) {
  return mode === "private" ? "Tend - private" : "Tend";
}
