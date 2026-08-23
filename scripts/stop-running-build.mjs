/**
 * Stop any Tend running out of a given folder, and nothing else.
 *
 * `dist/` cannot be cleared while a packaged Tend holds a file in it, and the
 * app test harness starts exactly such a process. So both packaging and
 * releasing have to clear the way first.
 *
 * The matching is on the executable's path, deliberately. Killing by name would
 * also close an installed Tend, and other Electron apps are often running -
 * a broad kill takes down whatever someone is working in. This has bitten the
 * sibling apps before; it is the reason this file exists rather than a one-line
 * taskkill.
 */

import { execFileSync } from "node:child_process";

/**
 * @param {string} folder Absolute path. Only processes whose executable lives
 *   inside it are stopped.
 * @param {(msg: string) => void} [log]
 */
export function stopRunningBuild(folder, log = console.log) {
  if (process.platform !== "win32") {
    return;
  }

  // Single-quoted PowerShell strings take backslashes literally, so the path
  // needs no escaping beyond doubling any quote in it. Statements are separated
  // with semicolons: joining lines with spaces produced a parser error.
  const root = folder.replace(/'/g, "''");
  const script = [
    `$root = '${root}'`,
    "Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($root) } | ForEach-Object { Write-Host ('Stopping pid ' + $_.ProcessId + ': ' + $_.ExecutablePath); Stop-Process -Id $_.ProcessId -Force }"
  ].join("; ");

  try {
    execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      stdio: "inherit"
    });
  } catch (err) {
    log(`Could not check for running builds: ${err instanceof Error ? err.message : String(err)}`);
  }
}
