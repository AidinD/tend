# Decisions

Newest first. Each entry: the date, what was decided, what else was considered,
and why this won.

## 2026-08-23 - The packaged app ships source, not a bundle

**Decided.** electron-builder packs `src/**` directly. No electron-vite, no
`out/`, matching the buildless decision below.

**What it costs.** The packaged app resolves the preload and the renderer from
inside an asar archive, where a path that works in development can fail with
nothing but a blank window and no error in main. So `npm run test:app --
--packaged` exists and runs the same eleven checks against
`dist/win-unpacked/Tend.exe`. A packaged build is not considered working until
that passes.

**Auto-update** is electron-updater against GitHub releases, checked once at
startup and installed on quit. Skipped entirely when not packaged, where it only
produces a confusing error.

**The upload must go through electron-builder's publisher.** `latest.yml`
references the installer by its dashed name while the file on disk has spaces;
electron-builder renames it on upload. A hand-rolled `gh release create` gives
the asset the spaced name and electron-updater 404s on a release that looks
perfectly published. Nib learned this one first.

**Only this build's processes are stopped before clearing `dist/`**, matched on
executable path. Killing Electron by name would close whichever other Electron
app happens to be open, which has bitten the sibling apps before.

## 2026-08-23 - Nib folders are bound to people in Tend, not by convention

**Decided.** The user binds a
Nib category or sub-category to a person inside Tend, and the binding says what
kind of contact notes there count as. One person can have several.

**Considered and rejected:** a naming convention in Nib (a sub-category per
person under a "1-1" category), or matching a person's name in note titles. The
convention means remembering a rule while writing, and locks the structure;
name matching is guessing, and a mismatch hangs a promise on the wrong
colleague.

**Why this wins.** Nib gets organised however suits, and changing your mind
edits one binding instead of rewriting notes. Same principle as the role map:
the thing that could go stale is editable data, not structure baked into code.

**The binding carries the kind, and that is the load-bearing part.** One folder
can be "1-1 notes about someone" and another "what their team's lead said about
them", satisfying different cadences. Without it, indexing would collapse every
kind of contact into one and close the blind spot on paper.

**A useful accident:** Nib already models flagged blocks as action points with a
done state. Those are promises, structured by hand, which means the single
highest-value thing Tend tracks needs no model at all - and ticking one off in
Nib resolves it here, so nothing has to be said twice.

## 2026-08-23 - Feedback and record-keeping are two duties, not one

**Decided.** "Feedback close to the event" and "running record of what each
person delivered" stay separate, and can each nag independently.

**Why.** They look alike and are not. One is something you *say to the person*;
the other is something you *write down for yourself*. Merged, you could tick off
one by doing the other, and the failure they guard against is precisely the
common one: having formed a view of someone and never told them.

## 2026-08-23 - Three monthly questions, not six

**Decided.** Three signal questions: has anyone stopped pushing back, do retros
end early with nothing resolved, is there anyone whose work you have not seen.
One covers an individual withdrawing, one the team going quiet, one the
structural blind spot of a crossed reporting line.

**Why three.** Six fit on a screen; three get answered. An unanswered question is
worth nothing, and this is the one thing in the whole tool that cannot be
derived, so its only cost is attention.

**Two rules that came out of building it:** a "yes" requires a note saying what
was seen, because a bare yes is useless three months later; and a yes brings the
question back in a week rather than a month, since a flagged problem should not
wait for the next cycle. A never-answered question is due immediately - adding a
question means wanting an answer.

## 2026-08-23 - A delegation level sits on a piece of work with an owner

**Decided.** Not on the project and not on the person, but on the pair: "this
subsystem, this person, delegated with close follow-up" is one row. Three levels,
and each one carries its own review interval - weekly, fortnightly, every two
months.

**Why.** Grove's task-relevant maturity is about how experienced *this person* is
at *this task*, so a project-wide level would be a guess and a person-wide one a
judgement about them rather than the work. The review interval is the level's
whole meaning: a level with no interval is a label, which is the abdication Grove
warns about with better branding.

**A workstream with no level set is surfaced as a finding**, not treated as
incomplete data. That unstated middle - responsibility moved, information did
not - is the failure mode itself.

## 2026-08-23 - An agent may record reality; only the user defines the job

**Decided.** The write boundary is drawn between *facts* and *the role*, not
between reading and writing.

An agent may record what is true: add a person, change their relationship type
after a reorg, add a project, log a promise, a contact or an observation. All of
it is additive and attributable.

An agent may not define what the job is. Duties always land as proposals;
`decideDuty` is app-only.

**Why here and not somewhere tidier.** Changing someone's relationship type has
a large effect - every cadence that applies to them changes. It is tempting to
call that structural and lock it to the app. But it is a fact about the world,
and telling Claude Code "this person moved teams" should simply work,
because the alternative is that the tool's picture of the org silently goes
stale. What must stay the user's is the answer to "what does this job require of
me", which is the role map and nothing else.

## 2026-08-23 - A buildless renderer, no framework

**Decided.** The Electron renderer is plain HTML, CSS and a single ES module
that talks to main over one `invoke` bridge. No React, no Vite, no build step.

**Considered and rejected:** electron-vite plus React, as in Jot and Nib.
Consistent with the family and better if the UI grows large. But the whole app
is three views of a list, the mock was already vanilla, and the rest of the repo
is deliberately buildless so the MCP server can import the same code with no
compile step between an agent writing an event and the file existing.

**Revisit if** the renderer grows past what one file can hold clearly. The
storage, domain and service layers should stay buildless regardless - those are
the ones the MCP server imports.

**One thing this cost:** the Electron preload script has to be named `.mjs`.
Electron loads a preload as CommonJS based on the file extension, ignoring
`type: "module"` in package.json, and the failure is a silent
`window.tend is undefined` in the renderer rather than an error in main.

## 2026-08-23 - One service layer, two clients

**Decided.** Operations live in `src/service/api.js`. The MCP server calls them
and serialises; the Electron app will call the same functions and render. No
capability is implemented twice.

**Why this won.** It is what makes "the MCP server is the core, the app is a
client" real rather than aspirational. If the tool surface were implemented
against the store directly, the app would grow its own slightly different
version of every query within a month, and the two would drift.

**The write boundary lives here, not in the tool definitions.** `proposeDuty`
always writes `status: "proposed"` regardless of caller, and `decideDuty` is
simply not exported to MCP. Putting the rule in the service layer means a second
client cannot route around it. A test asserts that no tool matching
`decide|accept|activate` ever appears in the manifest.

**Errors are return values, not exceptions.** An agent that receives
`No person matching "X". Known: A, B, C.` can correct itself. One that receives
a stack trace cannot. Ambiguous name matches are refused rather than guessed,
because logging a promise against the wrong colleague is worse than an error.

## 2026-08-23 - Cadences are generated, not stored

**Decided.** There is no cadence table. A cadence is produced at read time by
crossing an active duty with every subject it applies to. A duty names which
relationship types it covers ("second-hand read" applies to `manage-remotely`
and nothing else), and the cross does the rest.

**Why this won.** It is what makes "I might reorganise, I might change job,
don't let that break everything" actually hold. When someone
moves to another team you change one field - their relationship type - and every
cadence that applies to them changes with it. No migration, no orphaned rows, and
their entire history survives because it was never attached to the cadence in the
first place. There is a test for exactly this.

**Considered and rejected:** storing a cadence row per person per duty. It is the
obvious model and it means every org change is a data migration, which for a
personal tool means every org change is the moment you stop using it.

## 2026-08-23 - A focus can soften how something reads, never whether it is seen

**Decided.** Every drift carries two severities: `severity` after the focus
stretch, and `trueSeverity` ignoring it. Existence is decided by `trueSeverity`,
placement by `severity`. Anything genuinely critical is never held back, only
possibly demoted from "needs you" to a nudge. Anything the stretch flattened all
the way to "ok" is counted in `muted` rather than disappearing.

**Why.** Writing the contract tests found a real hole: a stretch could push an
item below the display threshold entirely, so the focus was hiding things while
reporting that it was holding back nothing. The count was honest about what it
knew and the mechanism made sure it knew less. Splitting fact from policy fixes
it at the root, and the fact is now the thing that decides visibility.

**Rule that follows:** drift is truth, severity is policy. Any future feature
that wants to dampen something has to go through `stretchFor`, which is the one
place the contract could be broken and is under test.

## 2026-08-23 - Append-only event log, one file per writer

**Decided.** All data is an append-only stream of events under
`<dataDir>/events/`, with one file per `<machine>-<role>` writer. State is
produced by merging every file and replaying in a deterministic order. Nothing
is ever rewritten in place and nothing is ever deleted; removal is a tombstone.

**Considered and rejected:**

- *One `todos.json`-style file, rewritten atomically* (how Jot and Nib work).
  It works for them because one process owns the file. Tend has three writers
  and two of them must work while the app is closed, so an atomic rewrite is
  just a lost update with better manners.
- *A lock file.* Requires every writer to behave, breaks when a process dies
  holding the lock, and does nothing about Dropbox syncing the same file from
  two machines.
- *The app owns the file, MCP sends it messages.* Clean, but it makes the MCP
  server useless when Electron is closed, which is exactly when a scheduled job
  runs.
- *A real database (SQLite).* Solves concurrency properly on one machine, and
  is actively hostile to a file that Dropbox syncs between machines.

**Why this won.** Two writers never touch the same bytes, so there is no lost
update and Dropbox never produces a conflicted copy. It works with the app
closed, it needs no coordination between processes, and it gives history for
free. Full reasoning and the failure modes in [docs/storage.md](docs/storage.md).

**Deliberately not built:** compaction. A few hundred events a month stays under
a megabyte a year, and compaction would be the only operation in the system that
destroys data. Not having it is a feature.

## 2026-08-23 - No AI in the core, but AI inside the app as one client

**Decided.** The MCP server is the core. The Electron app is one client of it;
Claude Code and Helm are another. No feature exists twice.

The app **must stay fully usable with the model switched off**. Drift, cadences,
promises, focus budget - all plain deterministic code. The model only reads
prose and writes drafts. It never computes the radar.

**Considered and rejected:**

- *Model-driven attention.* Asking a model "who has drifted" is slower, costs
  money on every app open, and is occasionally wrong. A wrong radar is worse
  than no radar, because it is trusted.
- *No AI anywhere, only an MCP surface* (the position held for about an hour on
  2026-08-23). It is cleaner, but it means extracting a promise from a note
  requires switching to another window, which is precisely the friction the tool
  exists to remove.

**Why this won.** The deterministic parts are the ones that must never be wrong;
the language parts are the ones a model is actually good at. Routing both
through one MCP layer means the app and an external agent can never disagree
about what the data says.

**Rules that follow:**

- Everything model-generated is labelled with its source and model, and can be
  rejected in one click.
- An agent may **create** rows freely (promises, check-ins, evidence) but may
  only **propose** changes to the user's structure - the role map, cadences, focus.
  Otherwise an agent can quietly rewrite what he believes the job is.
- Heavy work runs on write or on a schedule, never on app open.
- Model tiering: Haiku for extraction and tagging, Sonnet for briefs and search,
  Opus for the conversational rehearsal mode.

## 2026-08-23 - MCP over files, never HTTP

**Decided.** The external interface is an MCP server: a standalone process that
reads the same files on disk as the app.

**Considered and rejected:**

- *A local HTTP API.* Requires the Electron app to be running, so a scheduled
  nightly job fails because a window was closed.
- *Let Claude Code read the JSON directly*, the way the `jot-watch` skill reads
  `todos.json`. Cheaper to build, but then the model does date arithmetic on raw
  data - reintroducing exactly the unreliability the deterministic core exists
  to prevent. `tend_attention()` is right every time; a model counting weeks in
  400 lines of JSON is right most of the time.

**Why this won.** MCP gives semantics instead of structure: fewer tokens, no
arithmetic mistakes, and tool names that carry their own intent.

## 2026-08-23 - Plain JavaScript with JSDoc types, checked by tsc

**Decided.** `src/` is `.js` with JSDoc annotations, type-checked with
`tsc --checkJs --noEmit`. No build step.

**Considered and rejected:** TypeScript, as in Jot and Nib. Consistent with the
family, but the storage layer is imported by both Electron and a bare Node MCP
process, and a build step between an agent writing an event and the file
existing is friction with no payoff at this size.

**Revisit if** the renderer grows enough that JSDoc becomes painful. The storage
layer should stay buildless regardless.

## 2026-08-23 - Nib owns the notes; Tend reads them

**Decided.** Raw prose - 1-1 notes, lessons from books, observations - lives in
Nib. Tend indexes it and keeps its own structured layer beside it. Same relation
Helm has to Jot.

**Considered and rejected:** Tend owning its own notes. It would mean two places
to write a note, and one of them would go unused within a month.

## 2026-08-23 - Drift, not due dates

**Decided.** Every cadence carries a "how far behind am I" number per person or
project. There is no binary overdue state.

**Considered and rejected:** recurring tasks with due dates, as in a normal todo
app. A date that passes turns red, and red that appears every bad week gets
ignored. Drift sorts itself, survives a bad month, and makes the pattern visible
over time - that it is always the same person who slips matters more than that
someone slipped this week.

## 2026-08-23 - Never ask for what can be derived

**Decided.** Writing a 1-1 note about someone in Nib *is* the evidence that the
cadence was met. No check-boxes for things the data already knows.

**Why.** Every manual confirmation is a future reason to abandon the app.

## 2026-08-23 - Focus dampens noise, never alarms

**Decided.** A focus is a time-boxed priority with a percentage budget. While one
is active, soft nudge thresholds stretch and proposed duties stop surfacing.
Guarded duties are never muted and nothing is ever removed from "Needs you". The
focus shows what it cost in drift, and every stretched threshold reverts on the
end date whether or not the work is done.

**Why.** Without the contract a focus quietly becomes the whole job, which was
the stated concern behind the feature.

## 2026-08-23 - People are grouped by relationship, not by org chart

**Decided.** Each person carries a relationship type: lead-and-manage,
lead-only, manage-remotely, equal-lead. Attention rules differ per type.

**Why.** Tend is built for a crossed reporting line: some people you lead you do
not manage, and some you manage you no longer observe. "Someone you manage but
cannot see" is a guarded alert, because that is the blind spot everything else
widens. A tool that assumes team == reports models the one thing that is not
true here.

## 2026-08-23 - Authentication reuses Claude Code's login

**Decided.** Model access goes through the Agent SDK using Claude Code's
existing authentication, as Helm does. No separate API key to store.

**Trade accepted:** it ties Tend to the Agent SDK being installed. Given it is a
personal tool on machines that already have it, that is fine.
