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
 * @param {object} [opts]
 * @param {Record<string, string | undefined>} [opts.env]
 * @param {NodeJS.Platform} [opts.platform]
 * @param {string} [opts.home]
 * @returns {{ dir: string, source: "env" | "default" }}
 */
export function resolveDataDir({ env = process.env, platform, home } = {}) {
  const override = env.TEND_DATA_DIR?.trim();
  if (override) {
    return { dir: override, source: "env" };
  }
  return { dir: defaultUserDataDir({ platform, env, home }), source: "default" };
}
