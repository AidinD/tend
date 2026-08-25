# Tend - project notes

Tend is a desktop tool for the leadership half of an engineering job. It sits **beside**
Jot (`D:\Repo\Tools\jot`) and Nib (`D:\Repo\Tools\nib`), not inside either.

## Read these first

- [PLAN.md](PLAN.md) - current status, the views, architecture, next steps,
  open questions.
- [DECISIONS.md](DECISIONS.md) - what was decided and why, with the alternatives
  that lost. Newest first.
- [docs/storage.md](docs/storage.md) - the concurrency design. Read before
  touching anything in `src/storage/`.
- [docs/mcp.md](docs/mcp.md) - the tool surface and the write boundary. Read
  before adding a tool.
- [docs/role-map-research.md](docs/role-map-research.md) - candidate duties and
  where they came from.

Keep PLAN.md and DECISIONS.md current as work happens, not batched at the end.

## keel

Tend depends on **keel** (`github.com/AidinD/keel`), the suite's shared layer,
linked as `file:../keel` - so it must be checked out at `D:\Repo\Tools\keel`.

`npm install` does **not** fail when it is missing - npm 11 links a missing
`file:` dependency to a dangling symlink and exits 0. Here that matters more than
in Jot: keel is imported at runtime, so a missing sibling means a preload that
throws `ERR_MODULE_NOT_FOUND` and window buttons that quietly do nothing. A green
install proves nothing.

It is a real `dependency` here, not a devDependency as in Jot. Jot bundles, so
its copy of keel is inlined at build time; Tend ships its source unbuilt, so the
import survives into the packaged app and electron-builder has to pack keel into
the asar. `npm run test:app -- --packaged` is what proves it did - the window
buttons are the visible symptom of a preload that failed to resolve it, and they
fail silently.

Two things come from it:

- `keel/window` - the three title-bar handlers and the preload bridge. These are
  deliberately *not* in `OPERATIONS`: window chrome is not an operation on Tend's
  data, and routing it through `tend.invoke` made "minimize the window" look like
  a peer of "log a promise". The renderer's type for the bridge is read back off
  keel's own declaration in `src/renderer/ui.js` rather than written out again.
- `keel/icon` - the PNG writer, the ICO writer and the distance-field helpers.
  `scripts/generate-icon.mjs` is now only Tend's geometry.

Editing keel changes Tend immediately, with no rebuild step. It also means a
change there can break the other siblings, so run `npm test` in keel and
regenerate the icon here before assuming it is fine.

## Rules that are easy to get wrong here

**Nib owns the notes.** Tend reads them and keeps its own structured layer
beside them. Never write prose into Tend's store that belongs in a note.

**The app must work with the model switched off.** Drift, cadences, promises and
the focus budget are deterministic code. If you find yourself asking a model to
compute something on that list, that is the bug.

**Agents create, they do not restructure.** An agent with write access may add
promises, check-ins and evidence. Changes to the role map, cadences or focus are
*proposals* the user accepts in the UI. Otherwise an agent can quietly rewrite
what the user believes the job is.

The rule is enforced in `src/service/api.js`, not in the MCP tool definitions,
so a second client cannot route around it. If you add a capability, add it to
the service layer and decide deliberately whether MCP gets it.

**Tend reads Jot now, read-only.** `src/service/jot.js` reads `todos.json` so a
Prep card can show what is open in somebody's area. It is a documented contract
(Jot's INTEGRATION.md) so there is no API. Two consequences that are easy to
miss: a test run must point `JOT_DATA_DIR` at a scratch board like it already
does for Tend and Nib, and `openWork` is **null and not empty** when the board
cannot be read - "nothing is open" and "I could not find Jot" are different
facts, and rendering them identically is the way a broken integration hides for
weeks.

**Agents propose decisions; they never record one.** `tend_propose_decision`
forces `status: "proposed"` inside the tool rather than trusting the caller, and
there is deliberately no MCP tool that records or accepts one - a test asserts
those names do not exist. Recording starts the revisit clock, and something that
could both propose and accept would be writing the decision log with nobody able
to tell. Same boundary as the role map.

**Attention signals are about the user, never measurements of the team.**
`src/domain/myattention.js` has the reasoning; the short version is that the
obvious version of that feature - review latency, who reviews whom, who is quiet
in a retro - is surveillance, and it is easier to build and looks like more
value. Every signal has a first-person subject and a test asserts it, because a
rule in a document does not survive a session that reads "attention signals" and
reaches for the easier thing.

**One implementation, two clients.** The app and the MCP server both call
`src/service/api.js`. Never query the store directly from the app - that is how
the two grow slightly different answers to the same question.

**Contact kinds are not interchangeable.** A `second-hand` report must never
satisfy the `one-to-one` cadence. If it did, the blind spot the tool exists to
catch would close itself on paper. There is a test; do not "simplify" it away.

**Label everything a model produced** with its source and model, and make it
rejectable in one click.

**Never write out a management job title** in anything Tend generates. Describe
the role as lead, coaching, or responsibility. Generated text gets pasted into
real places, and a title can carry a claim the user has not made.

**Swedish keeps its å, ä and ö**, including inside code, fixtures and quoted
notes. Deliverables are otherwise in English.

## Verifying a change in the running app

```bash
npm run test:app
```

Launches its own Electron instance with `--remote-debugging-port`, drives the
renderer over the Chrome DevTools Protocol, and reads the DOM back. Add `--keep`
to leave it running.

Do **not** verify by moving the pointer and clicking. It fights whoever is using
the machine, steals focus, and every coordinate is a guess that goes stale the
moment a layout shifts.

Three rules that come with it:

- **Never kill processes by name.** Other Electron apps are often running. Kill only the PID you started, as the harness does.
- **Always point `TEND_DATA_DIR` at a scratch folder** for a test run. The real
  directory holds notes about real colleagues.
- **A run may only drive the instance it started.** It refuses to begin when
  something already holds the debugging port and names the PID; once attached it
  asks the app for its data directory and stops unless the answer is this run's
  scratch folder. It never kills what it finds - `--port=N` is the way past a
  port somebody else has. A stale Electron on 9411 once produced four failures
  about code that was fine; see `scripts/e2e-port.mjs` and DECISIONS.md.

A check that asserts nothing is worse than no check. Three of the first ones
here passed while testing nothing; if a `check()` body is empty, it is a bug.

## Releases

Versioning follows the sibling apps: **bump the patch on every commit** so any
build traces to an exact commit. Minor and major are deliberate calls - ask
first, never bump them automatically.

A release is: bump, commit, then publish.

```bash
npm run release
```

The script refuses to run on a dirty working tree, refuses a version already on
GitHub, runs tests and the type check, stops any Tend running out of `dist/`,
clears `dist/`, and uploads through electron-builder's own publisher.

That last part is not optional. `latest.yml` references the installer by its
dashed name (`Tend-Setup-0.0.7.exe`) while the file on disk has spaces
(`Tend Setup 0.0.7.exe`); electron-builder renames it on upload. A hand-rolled
`gh release create` uploads the spaced name, and electron-updater then 404s on
an asset in a release that looks perfectly published.

To build without publishing:

```bash
npm run package
```

**Verify a packaged build before releasing it.** Tend ships its source unbuilt,
so the packaged app resolves the preload and renderer from inside an asar
archive, and a path that works in development can fail there with nothing but a
blank window:

```bash
npm run test:app -- --packaged
```

**Never kill Electron by name.** `scripts/stop-running-build.mjs` matches on the
executable path so only a Tend from this `dist/` is stopped. Other Electron apps
are often running, and a broad kill closes whatever someone is working in.

## Storage

Append-only event log, one file per `<machine>-<role>` writer, under
`<dataDir>/events/`. Two writers never touch the same bytes, so there is no lost
update and Dropbox never produces a conflicted copy.

Every claim in `docs/storage.md` has a test in `test/storage.test.mjs`. If you
add a guarantee to that document, add the test that earns it.

```bash
npm test
```

Do **not** add compaction. It is the only operation that would destroy data, and
the log stays under a megabyte a year. See DECISIONS.md.

## Data directory

`userData` by default, relocated with the `TEND_DATA_DIR` environment variable,
exactly as Jot and Nib do. Always point it at a scratch folder for a test run so
a test never writes into real data.

The directory holds assessments of named colleagues. It stays local and private
and is never committed or pushed.

**No real name reaches this repository, and a hook enforces it rather than a
rule.** This repo is public. Colleague first names, a real project name and a
real product name got into test fixtures and code comments here on 2026-08-25,
past a rule that said not to - because writing a fixture is the moment nobody is
thinking about visibility. [privacy] clean - 30 private terms checked against this push, from 2 source(s). now derives the forbidden terms
from the live Tend and Nib data and refuses the push, so there is nothing to
remember and no list in the tree to go stale. Invent fixture names; never borrow
one. See keel/privacy.

**Keep it off the user profile, and check where your writes actually land.**
An agent session may be running inside a Windows app container (MSIX), which
silently redirects writes to `%APPDATA%` and `%LOCALAPPDATA%` into a per-package
overlay under `%LOCALAPPDATA%\Packages\<package>\LocalCache\`. Reads fall
through to the real location, so a script reads the installed app's own event
file, concludes it is in the right place, and writes into a shadow store the app
will never open. Nothing errors. The data is simply somewhere else, and every
verification the script runs on its own writes passes.

The tell is a store that reduces correctly for the script and shows an older
state in the window. To check, list
`%LOCALAPPDATA%\Packages\*\LocalCache\Roaming	end\events` and compare it
with what the same path shows through `%APPDATA%`. A path outside the profile -
`D:\Dropbox	end`, set through `TEND_DATA_DIR` - is not redirected and is why
Jot and Nib were never affected.

The same container virtualises `HKCU` writes, so setting that variable from
inside a session cannot be trusted either. Have the user run it from their own
shell.

## Style

Plain JavaScript with JSDoc types, checked with `npm run typecheck`. No build
step for `src/storage/` - the MCP server imports it directly.

Braces and separate lines for every `if`, no one-liners. No em dashes.
