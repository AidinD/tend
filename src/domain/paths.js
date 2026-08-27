/**
 * Where Tend's data lives.
 *
 * Two very different processes have to agree on this: the Electron app, which
 * could ask Electron, and the MCP server, which is bare Node and cannot. So the
 * default is computed the same way Electron computes `userData`, rather than
 * read from Electron - that way the MCP server finds the same folder with the
 * app closed.
 *
 * `TEND_DATA_DIR` overrides it, which is how the data ends up in Dropbox. Same
 * pattern as Jot and Nib.
 */

import { homedir } from "node:os";
import { join } from "node:path";

import { userEnvironment } from "./userenv.js";

/** Matches package.json `name`, which is what Electron uses for userData. */
export const APP_NAME = "tend";

/**
 * The default per-user application data directory for this platform.
 *
 * Mirrors Electron's `app.getPath("userData")`. Kept as its own function so the
 * one place that has to match Electron's behaviour is visible and testable.
 *
 * @param {object} [opts]
 * @param {NodeJS.Platform} [opts.platform]
 * @param {Record<string, string | undefined>} [opts.env]
 * @param {string} [opts.home]
 * @returns {string}
 */
export function defaultUserDataDir({
  platform = process.platform,
  env = process.env,
  home = homedir()
} = {}) {
  if (platform === "win32") {
    return join(env.APPDATA ?? join(home, "AppData", "Roaming"), APP_NAME);
  }
  if (platform === "darwin") {
    return join(home, "Library", "Application Support", APP_NAME);
  }
  return join(env.XDG_CONFIG_HOME ?? join(home, ".config"), APP_NAME);
}

/**
 * The data directory to use.
 *
 * Three places, in this order.
 *
 * The middle one is the important one. `TEND_DATA_DIR` in `process.env` only
 * covers what this process inherited, so a variable set after the terminal that
 * spawned it opened is invisible - and then Tend quietly uses the per-user
 * default, which is a real directory that parses and reports nothing wrong. An
 * agent session on this machine writes into an app-container overlay of that
 * default which the installed app never reads, so the two halves of the same
 * tool end up on separate stores, each convinced it is right. Reading the
 * variable from where Windows keeps it closes that.
 *
 * The inherited value still wins, because that is how a test points the app at
 * a scratch folder.
 *
 * @param {object} [opts]
 * @param {Record<string, string | undefined>} [opts.env]
 * @param {NodeJS.Platform} [opts.platform]
 * @param {string} [opts.home]
 * @param {(name: string, platform?: NodeJS.Platform) => string | null} [opts.stored]
 * @returns {{ dir: string, source: "env" | "user-env" | "default" }}
 */
export function resolveDataDir({
  env = process.env,
  platform = process.platform,
  home,
  stored = userEnvironment
} = {}) {
  const override = env.TEND_DATA_DIR?.trim();
  if (override) {
    return { dir: override, source: "env" };
  }
  const fromRegistry = stored("TEND_DATA_DIR", platform)?.trim();
  if (fromRegistry) {
    return { dir: fromRegistry, source: "user-env" };
  }
  return { dir: defaultUserDataDir({ platform, env, home }), source: "default" };
}

/**
 * The two modes, and which store each one is.
 *
 * `work` is the directory everything used before there were modes, so nothing
 * moves and no migration exists. `private` is a sibling directory rather than a
 * subfolder of it: nested, a backup or a sync of the work store would quietly
 * carry the private one along, and the whole point of two stores is that they
 * never travel together.
 */
export const MODES = /** @type {const} */ (["work", "private"]);

/** @typedef {(typeof MODES)[number]} Mode */

/** @param {string} v @returns {v is Mode} */
export const isMode = (v) => MODES.includes(/** @type {any} */ (v));

/**
 * Where a mode's data lives.
 *
 * The private one is derived from the work one by default, so there is no second
 * environment variable to set and forget. That matters more than it looks: the
 * first variable took a whole afternoon to discover was missing, and a second
 * one would have the same failure with half the visibility.
 *
 * `TEND_PRIVATE_DIR` overrides it for the cases the default cannot cover - a
 * different drive, or an encrypted volume.
 *
 * @param {Mode} mode
 * @param {object} [opts]
 * @param {Record<string, string | undefined>} [opts.env]
 * @param {NodeJS.Platform} [opts.platform]
 * @param {string} [opts.home]
 * @param {(name: string, platform?: NodeJS.Platform) => string | null} [opts.stored]
 * @returns {{ dir: string, source: "env" | "user-env" | "default" | "beside-work" }}
 */
export function resolveModeDir(mode, opts = {}) {
  const work = resolveDataDir(opts);
  if (mode !== "private") {
    return work;
  }

  const { env = process.env, platform = process.platform, stored = userEnvironment } = opts;

  const override = env.TEND_PRIVATE_DIR?.trim();
  if (override) {
    return { dir: override, source: "env" };
  }
  const fromRegistry = stored("TEND_PRIVATE_DIR", platform)?.trim();
  if (fromRegistry) {
    return { dir: fromRegistry, source: "user-env" };
  }
  return { dir: `${work.dir.replace(/[\/]+$/, "")}-private`, source: "beside-work" };
}
