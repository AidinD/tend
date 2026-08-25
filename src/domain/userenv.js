/**
 * A user environment variable, read from where Windows actually keeps it.
 *
 * `process.env` only carries what a process INHERITED. A variable set after the
 * parent started is not in it, and neither is one set after the terminal that
 * spawned an agent session opened. So a process can be handed a perfectly
 * correct configuration and never see it.
 *
 * The failure is silent, which is what makes it worth a module. The caller
 * falls back to a per-user default, finds a directory there that parses, and
 * reports nothing wrong: for Nib that default is a leftover notebook three
 * years out of date, and for Tend it is a store that an agent session can
 * write to but the installed app never reads. Both cost hours before anybody
 * suspected the path rather than the code.
 *
 * Windows only, and best-effort: anything unexpected means "not set", never a
 * throw. On other platforms the environment really is the whole answer.
 */

import { execFileSync } from "node:child_process";

/**
 * @param {string} name
 * @param {NodeJS.Platform} [platform]
 * @returns {string | null}
 */
export function userEnvironment(name, platform = process.platform) {
  if (platform !== "win32") {
    return null;
  }
  try {
    const out = execFileSync("reg", ["query", "HKCU\\Environment", "/v", name], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    // REG_SZ and REG_EXPAND_SZ both land as `<name>    <TYPE>    <value>`.
    const match = /\s{2,}REG_(?:EXPAND_)?SZ\s{2,}(.+)/.exec(out);
    const value = match?.[1]?.trim() ?? "";
    return value === "" ? null : expand(value);
  } catch {
    // Not set, or `reg` is unavailable. Both mean the same thing here.
    return null;
  }
}

/**
 * Expand `%NAME%` references, which REG_EXPAND_SZ values carry unexpanded.
 *
 * An unknown name expands to nothing rather than being left as `%NAME%`: a path
 * with a literal percent-name in it can never exist, so leaving it in would
 * only turn a missing variable into a confusing file-not-found further away.
 *
 * @param {string} value
 * @returns {string}
 */
function expand(value) {
  return value.replace(/%([^%]+)%/g, (_, key) => process.env[key] ?? "");
}
