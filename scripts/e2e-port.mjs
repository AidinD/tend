/**
 * Which port the app harness drives, and proof that it is driving its own app.
 *
 * `scripts/e2e-app.mjs` attaches over the Chrome DevTools Protocol by polling
 * `http://127.0.0.1:<port>/json/list` for a page target. For a long time it
 * asked no further questions, and on 2026-08-25 that cost a whole run: an
 * earlier `--keep` had left an Electron alive on 9411, a fresh run attached to
 * that old instance, and four checks failed - main never reported the scratch
 * dir, the first-run view was already People, and then nothing matched
 * `[data-act=seed]`. Not one of them had anything to do with the code, and
 * killing the stale process made the same run pass 83 of 83.
 *
 * That is the worst way for this harness to fail. It is the evidence gate before
 * every release, so a run that fails for reasons unrelated to the code teaches
 * everybody to re-run until green, and that is how a real failure gets waved
 * through the gate.
 *
 * So there are two gates, and the pure half of each lives here where a test can
 * check it without starting a process:
 *
 *   Before the spawn, refuse if anything is already listening, and name the PID
 *   holding the port. The harness never kills it. Stopping a process it did not
 *   start is the mistake this repo warns about twice over - the only process it
 *   may kill is the one it spawned, by that PID and never by name.
 *
 *   After attaching, ask the app which data directory it is using. This run made
 *   a fresh scratch folder, so an instance reporting any other path is somebody
 *   else's: a stale run, or the real app with real notes in it. One legible
 *   failure instead of four wrong assertions.
 *
 * The port check alone would have caught the observed failure. The identity
 * check is what makes the guarantee unconditional - it closes the gap between
 * "the port was free when I looked" and "Electron bound it", and it is the only
 * one of the two that still holds when the OS lookup is unavailable.
 */

import { execFileSync } from "node:child_process";
import { createConnection } from "node:net";
import { resolve } from "node:path";

/**
 * The default debugging port.
 *
 * Fixed rather than random so it is predictable: `--keep` leaves a window open
 * for someone to attach a real DevTools to, and telling them to read the port
 * out of the log first is worse than telling them the number. Two runs at once
 * pass `--port`.
 */
export const DEFAULT_PORT = 9411;

/** How long a connect attempt may take before the port counts as free. */
const PROBE_TIMEOUT = 1500;

/**
 * Read `--port=N` off a command line.
 *
 * @param {string[]} argv
 * @returns {{ port: number, error?: undefined } | { port?: undefined, error: string }}
 */
export function parsePort(argv) {
  const flag = argv.find((arg) => arg.startsWith("--port="));
  if (!flag) {
    return { port: DEFAULT_PORT };
  }

  const raw = flag.slice("--port=".length);
  const port = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isInteger(port) || port < 1024 || port > 65535) {
    return { error: `--port wants a whole number between 1024 and 65535, not "${raw}".` };
  }
  return { port };
}

/**
 * Is anything listening on the port?
 *
 * A plain TCP connect rather than an HTTP request to `/json/list`, because the
 * question is not "is there a DevTools endpoint there" - it is "can Electron
 * bind this port", and any listener at all is a no. Asking over HTTP would let
 * an unrelated server through, and Electron would then fail to bind and the run
 * would attach to that server's absent page list instead.
 *
 * @param {number} port
 * @returns {Promise<boolean>}
 */
export function portInUse(port) {
  return new Promise((done) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    /** @param {boolean} answer */
    const settle = (answer) => {
      socket.destroy();
      done(answer);
    };
    socket.setTimeout(PROBE_TIMEOUT);
    socket.once("connect", () => settle(true));
    socket.once("timeout", () => settle(false));
    socket.once("error", () => settle(false));
  });
}

/**
 * The PowerShell that names who holds a port.
 *
 * Exported so a test can read it without starting a process, the way keel
 * exports `stopScript` - and for the same reason. This one only ever reports:
 * there is no `Stop-Process` in it and there must not be, because the process it
 * finds is by definition one this harness did not start.
 *
 * @param {number} port
 * @returns {string}
 */
export function listenerScript(port) {
  // Semicolons between statements: joining the lines with spaces is a parser
  // error. `Sort-Object -Unique` after the expansion rather than
  // `Select-Object -Unique`, which uniques whole objects and would list a
  // process once per listening socket it holds.
  return [
    `$port = ${Number(port)}`,
    "$owners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $_.OwningProcess } | Sort-Object -Unique)",
    "foreach ($owner in $owners) { $path = (Get-Process -Id $owner -ErrorAction SilentlyContinue).Path; if (-not $path) { $path = 'unknown executable' }; Write-Output ('pid ' + $owner + ': ' + $path) }"
  ].join("; ");
}

/**
 * Who is holding the port, as lines for an error message.
 *
 * Best effort by design. The refusal does not depend on this working - a port
 * that is in use is a refusal whether or not we can put a name to it - so every
 * failure here degrades to `null` and a message that says so, rather than
 * turning a clear "the port is taken" into an obscure tooling error.
 *
 * @param {number} port
 * @param {object} [deps]
 * @param {(command: string, args: string[]) => string} [deps.run] Injected so a
 *   test can assert what would be run.
 * @param {NodeJS.Platform} [deps.platform]
 * @returns {string[] | null}
 */
export function describeListener(port, { run, platform = process.platform } = {}) {
  const exec =
    run ??
    ((/** @type {string} */ command, /** @type {string[]} */ args) =>
      String(execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })));

  try {
    if (platform === "win32") {
      const out = exec("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        listenerScript(port)
      ]);
      const lines = out
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      return lines.length > 0 ? lines : null;
    }

    const out = exec("lsof", ["-nP", `-iTCP:${Number(port)}`, "-sTCP:LISTEN", "-t"]);
    const pids = out
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^\d+$/.test(line));
    return pids.length > 0 ? pids.map((pid) => `pid ${pid}`) : null;
  } catch {
    return null;
  }
}

/**
 * What to print instead of starting a run.
 *
 * @param {number} port
 * @param {string[] | null} owners
 * @param {boolean} [explicit] The port came from `--port` rather than the default.
 * @returns {string}
 */
export function refusalMessage(port, owners, explicit = false) {
  const who =
    owners && owners.length > 0
      ? owners.map((owner) => `  ${owner}`).join("\n")
      : "  could not identify the process holding it";

  const escape = explicit
    ? `Kill that process, or pass a different --port.`
    : `Kill that process, or run with --port=${port + 1}.`;

  return [
    `Port ${port} is already in use, so this run refused to start.`,
    "",
    who,
    "",
    "Something is already listening there - most likely an Electron this harness",
    "left behind with --keep, or another run in flight. Attaching to it would drive",
    "the wrong app and fail checks that have nothing to do with the code.",
    "",
    escape,
    "This harness will not stop a process it did not start."
  ].join("\n");
}

/**
 * Same directory, allowing for how the platform spells one.
 *
 * The app hands `TEND_DATA_DIR` back verbatim, so an exact match is the normal
 * case. Resolving and case-folding on Windows is there so a difference in
 * spelling can never be read as a difference in identity - failing a good run
 * over a capital letter would be its own version of the bug this file exists to
 * stop.
 *
 * @param {string} a
 * @param {string} b
 * @param {NodeJS.Platform} [platform]
 * @returns {boolean}
 */
export function samePath(a, b, platform = process.platform) {
  const one = resolve(a.trim());
  const two = resolve(b.trim());
  if (platform === "win32") {
    return one.toLowerCase() === two.toLowerCase();
  }
  return one === two;
}

/**
 * Does the attached instance belong to this run?
 *
 * Returns the reason it does not, or `null` when it does. The check is the
 * scratch directory: this run made it with `mkdtemp` moments ago, so no other
 * instance on the machine can be reporting it.
 *
 * @param {object} seen
 * @param {number} seen.port
 * @param {string} seen.expected The scratch directory this run created.
 * @param {unknown} seen.status What the app's `status` operation returned.
 * @param {NodeJS.Platform} [seen.platform]
 * @returns {string | null}
 */
export function wrongInstance({ port, expected, status, platform = process.platform }) {
  const preamble = `Attached to an app on port ${port} that this run did not start.`;
  const advice = [
    "",
    "That is a stale Electron - very likely one a --keep run left behind - or the",
    "real app. Every check from here would be measuring the wrong window, so the",
    "run stopped instead.",
    "",
    "Kill that process, or run with --port=<other>.",
    "This harness will not stop a process it did not start."
  ].join("\n");

  if (!status || typeof status !== "object") {
    return `${preamble}\n\n  it did not answer status at all: ${JSON.stringify(status)}${advice}`;
  }

  const dataDir = /** @type {{ dataDir?: unknown }} */ (status).dataDir;
  if (typeof dataDir !== "string" || dataDir.trim() === "") {
    return `${preamble}\n\n  it reported no data directory: ${JSON.stringify(status)}${advice}`;
  }

  if (!samePath(dataDir, expected, platform)) {
    return [
      preamble,
      "",
      `  it is using   ${dataDir}`,
      `  this run made ${expected}`,
      advice
    ].join("\n");
  }

  return null;
}
