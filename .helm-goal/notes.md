# Goal orchestrator notes

This file is the ONLY continuity mechanism between iterations — each
iteration runs in a fresh subprocess with no conversation memory. See
DECISIONS.md / PLAN.md (Fas 3 Point 11) in the Helm repo for why.

---

## RESEARCH iteration (archive mechanism) - findings and recommended plan

Current version in package.json: `0.1.70`. Bump to `0.1.71` for this change
(patch-per-

## Preserved key learnings (from truncated earlier iterations)

- `api.stakeholders(store, now, project?)` returns `Record<string,
- api.stakeholders(store, now, project?) has a union return type ({error} | array) per its JSDoc even though the archive tests never hit the error branch - use the existing test/stakes.test.mjs convention `/** @type {any[]} */ (api.stakeholders(...))` to satisfy tsc
- namedStakes()/api.stakeholders() already filtered archived people/projects (done in iterations 4-5), so the stake-archival tests needed no new production code, only proof - no subjectKind:'stake' duty is needed since stakeholders() reads stakes rows directly, unrelated to expandCadences
- prep(store, now, opts?) returns {cards, dropped} (use .cards); api.attention() items use .what (not .title) since summariseItem() renames AttentionItem.title to .what for the service-layer wrapper
- Full suite is now 635/635 passing (617 existing + 18 new); npm run typecheck clean
- Next iteration: plan Step 6, renderer - start with just the person page's Archive/Unarchive button + Archived banner in src/renderer/views/people.js (copy actions.remove's ask()/act() shape), deferring project/workstream buttons, archived-browse views, and Settings bulk action to their own iterations per the plan's own guidance


[... earlier notes truncated - context fill crossed the 40% budget, older narrative dropped to keep future iterations' prompts small; durable key learnings preserved above ...]

wording: stops appearing in Now/prep/attention/cadences, history stays, reversible) then `act("archivePerson", {id: d.person}, ...)` then `refresh()`. Placed right before `actions.remove`, matching the button order in the template.
- `actions.unarchive`: no confirmation dialog (restoring visibility is not destructive - matches the plan's Step 6 text, which specifies a dialog only for Archive) - just `act("unarchivePerson", {id: d.person}, ...)` then `refresh()`.
- Bumped package.json version 0.1.74 -> 0.1.75. (package-lock.json's own top-level "version" field is already stale at 0.1.8 from before this whole body of work started and no earlier archive iteration touched it either - left as-is, consistent with that existing pattern.)

Verification: `npm test` - 635/635 pass (no new tests added - this is a renderer-only step; E2E coverage for this button is plan Step 9, not this step). `npm run typecheck` - clean, no errors.

Key learnings:
- `src/main/index.js`'s OPERATIONS confirms the exact arg shape already wired in iteration 5: `archivePerson`/`unarchivePerson` both take `{id}` (not `{person}`), so the renderer call is `act("archivePerson", { id: d.person }, ...)` - the dataset attribute is still named `data-person` (matching every other button on this page) but gets remapped to `id` in the `act()` call, not renamed in the template.
- Did NOT add a general `archivedLabel(row, now)` helper to `src/domain/archive.js` (which `plan.md` step 1 left as optional, "only if step 6 actually needs it") - a plain ISO-date slice was enough for one banner line and matches how `observations` already renders a bare date on this same page, so adding a new domain helper and threading `now` through the renderer would have been speculative.
- Did NOT hide or change the existing "Remove" button/danger-zone block when a person is archived - the goal only asks for an Archive/Unarchive path, not for Remove's availability to depend on archived state, and an archived person should stay removable exactly as before (removal already works regardless of `archivedAt`, since `_deleted` and `archivedAt` are independent fields).
- Confirmed via direct read of `src/renderer/ui.js` that `ask()` takes `{title, body, confirm, tone}` and `act(op, args, success)` calls `tend.invoke(op, args)` - exactly as the plan and prior notes described; no drift since iteration 5's research.
- Next iteration should do the second half of plan Step 6: `src/renderer/views/work.js` - add Archive/Unarchive buttons beside `removeProject` (project rows) and `removeStream` (workstream cards), same `ask()` + `act()` shape, targeting `archiveProject`/`unarchiveProject` (OPERATIONS also takes `{id}`, confirmed above) and `archiveWorkstream`/`unarchiveWorkstream`. Note that `work.js`'s default `projects()`/`workstreams()` calls exclude archived rows entirely (done in iteration 4), so for now this step only needs the "Archive" direction on the default view's rows - the "Unarchive" button/banner for an archived row's own detail view (if one exists) or its place in an archived-browse group is plan Step 7's job, not Step 6's. Check whether `work.js` has a single-project/workstream detail page analogous to `people.js`'s `personPage()` (the repo map did not show one) before assuming the same two-branch (archived vs not) template shape applies - if projects/workstreams only ever render as list rows (no detail page), the Archive button on the default list only ever needs the "not archived" branch, and the "Unarchive" branch belongs entirely to Step 7's archived-browse group.

## Iteration 2 — success

Summary: Added the person page's Archive/Unarchive button and an "Archived on ..." banner in src/renderer/views/people.js, the first half of plan Step 6.

Key changes:
- src/renderer/views/people.js: personPage() now renders a dedicated block (separate from danger-zone) showing an Archive button for an active person, or an Archived-on-date banner plus an Unarchive button for an archived one
- src/renderer/views/people.js: added actions.archive (ask() confirmation with plain-language wording, then act("archivePerson", {id: d.person}, ...)) and actions.unarchive (no confirmation, act("unarchivePerson", {id: d.person}, ...))
- Bumped package.json version 0.1.74 -> 0.1.75
- Appended Iteration 2 notes to .helm-goal/notes.md with what was done and pointed the next iteration at work.js's Archive/Unarchive buttons (plan Step 6, second half)

Key learnings:
- OPERATIONS' archivePerson/unarchivePerson both take {id} (not {person}) - renderer call is act("archivePerson", { id: d.person }, ...) even though the dataset attribute stays named data-person to match the page's existing convention
- Did not add a domain archivedLabel(row, now) helper (left optional by plan step 1) - a plain ISO-date slice matches how observations already renders a bare date on the same page, so it was not worth threading now through for one banner line
- Did not touch the existing Remove/danger-zone button - archived-ness and _deleted are independent, an archived person should stay removable exactly as before
- work.js has no per-project/workstream detail page (confirmed via grep) - it only renders list rows with removeProject/removeStream buttons, so the next iteration's Archive button only needs the not-archived branch there; the Unarchive branch belongs to Step 7's archived-browse group
- npm test 635/635 pass, npm run typecheck clean after this change
- package-lock.json's own version field is already stale (0.1.8) from before this work started and was left untouched, consistent with prior iterations

## Iteration 3 - success (plan Step 6, second half - work.js)

Summary: Added Archive buttons beside `removeProject` (project rows) and
`removeStream` (workstream cards) in `src/renderer/views/work.js`, completing
plan Step 6 (both People's and Work's per-item Archive UI now exist).

Key changes:
- `src/renderer/views/work.js` project rows: new `<button class="act tiny"
  data-act="archiveProject" ...>Archive</button>` placed between "Log a
  look" and the existing "Remove" button.
- `src/renderer/views/work.js` workstream cards: new `<button class="act"
  data-act="archiveStream" ...>Archive</button>` placed between "Log a
  review" and the existing "Remove" button. (Action name is `archiveStream`
  in the renderer, matching this file's existing `removeStream`/`setLevel`
  naming for workstream actions, even though the underlying operation it
  calls is `archiveWorkstream`, same indirection the file already uses
  elsewhere, e.g. `removeStream` calls `removeRow` with `collection:
  "workstreams"`, not an op literally named `removeStream`.)
- `actions.archiveProject` and `actions.archiveStream`: both follow
  `actions.archive`'s shape from `people.js` (an `ask()` confirmation with
  `tone: "danger"`, since reversibility does not make it a no-confirmation
  action - it still changes what shows up everywhere; wording states what
  stops appearing, what stays intact, and that it is reversible from the
  archived list), then `act("archiveProject"/"archiveWorkstream", {id:
  d.id}, ...)` then `refresh()`. Confirmed via `src/main/index.js`'s
  OPERATIONS map that both ops take `{id}` (same shape as `archivePerson`).
- Did NOT add `unarchiveProject`/`unarchiveStream` actions or buttons this
  iteration: per iterations 2/3's own prior finding (re-confirmed by
  reading the current `work.js` top to bottom before editing), this file
  has no per-project/workstream detail page, only list rows rendered from
  the default `projects()`/`workstreams()` calls, which already exclude
  archived rows entirely (Step 3). An "Unarchive" button has nothing to
  attach to until Step 7's archived-browse group exists and renders rows
  from `archivedProjects()`/`archivedWorkstreams()`, adding the action now
  would be dead code with no caller.
- Bumped `package.json` version `0.1.75` -> `0.1.76`.

Verification: `npm test` - 635/635 pass (renderer-only change, no new unit
tests - E2E coverage for this button is plan Step 9). `npm run typecheck` -
clean, no errors.

Key learnings:
- Both plan Step 6 halves are now done (people.js in iteration 2, work.js
  in this iteration). Step 6 as a whole is complete.
- Next iteration should do plan Step 7: the "show archived" / browse-and-
  unarchive view - an "Archived (n)" collapsible group at the bottom of
  both the People view (`render()` in `people.js`, both halves since
  archived people exist in private mode too) and the Work view (`render()`
  in `work.js`, work-only), rendered from `archivedPeople()`/
  `archivedProjects()`/`archivedWorkstreams()` (already wired into
  OPERATIONS since iteration 5), each row showing name plus an "Unarchive"
  button. This is where `actions.unarchive` (people.js, already exists from
  iteration 2, just needs a caller now) and new `actions.unarchiveProject`/
  `actions.unarchiveStream` (work.js, do not exist yet, add them, same
  no-confirmation shape as people.js's `actions.unarchive`) get wired up.
  After Step 7: Step 8 (Settings bulk "I left this job" action), Step 9
  (E2E in scripts/e2e-app.mjs), Step 10 (DECISIONS.md entry), Step 11
  (final verification pass: npm test, npm run typecheck, npm run test:app).
- Reminder for Step 7: `people.js`'s `render()` currently returns early
  with an empty-state block when `roster.length === 0` (line ~73-81),
  make sure the archived group (if any archived people exist) still shows
  even when the active roster is empty, otherwise archiving everyone via
  Step 8's bulk action would make the People view claim "Nobody here yet"
  while hiding the fact that everyone is one Unarchive click away.

## Iteration 3 — success

Summary: Added per-item Archive buttons for projects and workstreams in src/renderer/views/work.js (archiveProject/archiveStream actions with confirmation dialogs), completing plan Step 6.

Key changes:
- src/renderer/views/work.js: added an "Archive" button to project rows (data-act="archiveProject") and workstream cards (data-act="archiveStream"), placed before the existing "Remove" button in each
- src/renderer/views/work.js: added actions.archiveProject and actions.archiveStream, each showing an ask() confirmation dialog (tone: danger) with plain-language wording, then calling act("archiveProject"/"archiveWorkstream", {id}, ...) and refresh()
- Bumped package.json version 0.1.75 -> 0.1.76
- Appended Iteration 3 notes to .helm-goal/notes.md documenting the change and pointing the next iteration at plan Step 7 (archived-browse view with Unarchive buttons)

Key learnings:
- Plan Step 6 is now fully complete: people.js's Archive/Unarchive button plus banner (iteration 2) plus work.js's Archive buttons (this iteration)
- work.js has no per-project/workstream detail page, only list rows from the already-archived-filtered projects()/workstreams() calls, so Unarchive buttons have nowhere to live yet; they belong entirely to Step 7's archived-browse group, not Step 6
- Renderer action name archiveStream (not archiveWorkstream) matches this file's existing naming convention for workstream-targeting actions (removeStream, setLevel), even though the underlying OPERATIONS call is archiveWorkstream - confirmed both archiveProject/archiveWorkstream ops take {id} via src/main/index.js
- npm test: 635/635 pass (no new tests needed since E2E coverage is Step 9's job). npm run typecheck: clean
- Next iteration should do plan Step 7: "Archived (n)" collapsible groups at the bottom of People view (both halves) and Work view, rendered from archivedPeople()/archivedProjects()/archivedWorkstreams() (already wired into OPERATIONS since iteration 5), wiring up people.js's existing actions.unarchive and new actions.unarchiveProject/actions.unarchiveStream in work.js. Watch that people.js's render() early-return for an empty roster still shows the archived group when one exists.

## Iteration 4 — success (plan Step 7 — archived-browse / "show archived" view)

Summary: Added a closed-by-default "Archived" `<details>` group at the bottom of the People view and two ("Archived projects" / "Archived workstreams") at the bottom of the Work view, each listing rows from `archivedPeople()`/`archivedProjects()`/`archivedWorkstreams()` with an Unarchive button, completing plan Step 7.

Key changes:
- `src/renderer/views/people.js`: `render()` now also fetches `archivedPeople` (Promise.all alongside `people`/`vocabulary`) and appends `archivedGroupHtml(archived)` after the body — including in the `roster.length === 0` empty-state branch, per the reminder left in iteration 3's notes, so an entirely-archived roster still shows "everyone is one click away" instead of just "Nobody here yet". New private function `archivedGroupHtml(archived)`: returns `""` when there is nothing archived (no empty group ever renders), otherwise a `<details class="group archived-group">` with a `<summary class="group-head archived-summary">` (title/rule/count, same three spans the other groups use) and one static row per archived person showing name, an "archived YYYY-MM-DD" pill, a "View" button (`data-act="open"`, reuses the *existing* `actions.open`) and an "Unarchive" button (`data-act="unarchive"`, reuses the *existing* `actions.unarchive` from iteration 2 — no new action needed in this file). Clicking "View" navigates to the same `personPage()` archived people already resolve correctly on (banner + Unarchive button, from iteration 2).
- `src/renderer/views/work.js`: `render()` now also fetches `archivedProjects`/`archivedWorkstreams`. New private function `archivedGroupHtml(title, archived, unarchiveAct)` (a work.js-local copy, not shared with people.js's — the row shape agrees (name + archivedAt) but the unarchive action name differs per collection and there's no "View" button since neither collection has a detail page, confirmed by re-reading the whole file before editing). Two calls render "Archived projects" (unarchive act `unarchiveProject`) and "Archived workstreams" (unarchive act `unarchiveStream`) after the three existing groups. New actions `actions.unarchiveProject` and `actions.unarchiveStream` added (same no-confirmation shape as people.js's `actions.unarchive`: `act("unarchiveProject"/"unarchiveWorkstream", {id}, ...)` then `refresh()`).
- `src/renderer/app.css`: added `.archived-summary` / `.archived-group[open] > .archived-summary::after` rules mirroring the existing `.multi-summary` disclosure-chevron treatment (hides the native `::-webkit-details-marker`, draws the app's own chevron, rotates it open) — reused the `.group`/`.group-head`/`.group-title`/`.group-rule`/`.group-meta` classes already in place for the header row itself, only the chevron/cursor/marker-removal needed new rules.
- Bumped `package.json` version `0.1.76` -> `0.1.77`.

Verification: `npm test` — 635/635 pass (renderer-only change; no new unit tests, per the plan E2E coverage for this is Step 9, not this step). `npm run typecheck` — clean, no errors.

Key learnings:
- Confirmed via `src/service/api.js` that `archivedPeople(store, now)` returns `{id, name, relation, archivedAt}[]`, and `archivedProjects`/`archivedWorkstreams(store, now)` return `{id, name, archivedAt}[]` — no `relation` field on the latter two, which is why work.js's archived rows don't show a relation/type pill, just the date.
- `<details>`/`<summary>` is this codebase's established disclosure pattern (already used for the multiselect form field) — reused rather than inventing a new "show archived" toggle button wired through `refresh()`; the open/closed state needs no JS at all.
- The People archived group needed the "View" button (person pages already existed and already handle `archivedAt` correctly since iteration 2), but Work's archived groups do not, since work.js has no per-project/workstream detail page — confirmed by re-reading the file rather than trusting iteration 3's note as gospel.
- Did not add any new service/domain code this iteration — everything needed (`archivedPeople`/`archivedProjects`/`archivedWorkstreams` in OPERATIONS, the row shapes) already existed from iterations 5/6.
- Plan Steps 1-7 are now all complete. Remaining: Step 8 (Settings bulk "I left this job" action — a new section in `src/renderer/views/settings.js` calling `archiveEverythingActive`, with its own confirmation dialog stating what it will/won't do), Step 9 (E2E coverage in `scripts/e2e-app.mjs` for the whole archive/unarchive/bulk flow — this should probably wait until Step 8 lands, since the goal's E2E section explicitly wants the bulk action covered too), Step 10 (DECISIONS.md entry, general/mechanism-only wording, no real names), Step 11 (final verification: `npm test`, `npm run typecheck`, `npm run test:app`).
- Next iteration should do plan Step 8: read `src/renderer/views/settings.js`'s existing section shape (e.g. `dataSection`/`modeSection`, a `.group` with one `.card`) before writing the new section, follow the same `ask({title, body, confirm, tone: "danger"})` -> `act("archiveEverythingActive", {}, ...)` -> `refresh()` shape used throughout people.js/work.js's own archive actions, and build the success toast text from the returned `{people, projects, workstreams}` counts (e.g. `` `${people} people, ${projects} projects, ${workstreams} workstreams archived.` ``) rather than a generic "Archived." message, since the whole point of this button is the user seeing what it actually did.

## Iteration 4 — success

Summary: Added the "show archived" browse-and-unarchive view (a closed-by-default Archived details group on People, and Archived-projects/Archived-workstreams groups on Work) with View/Unarchive actions, completing plan Step 7.

Key changes:
- src/renderer/views/people.js: render() now fetches archivedPeople and appends a new archivedGroupHtml(archived) group after the body (and in the empty-roster branch too), showing name, archived-date pill, View (reuses existing actions.open) and Unarchive (reuses existing actions.unarchive) per row
- src/renderer/views/work.js: render() now fetches archivedProjects/archivedWorkstreams and appends two archivedGroupHtml(title, archived, unarchiveAct) groups (Archived projects, Archived workstreams) at the bottom; added new actions.unarchiveProject and actions.unarchiveStream (no-confirmation, matching the existing unarchive shape)
- src/renderer/app.css: added .archived-summary / .archived-group[open] rules mirroring the existing .multi-summary disclosure-chevron treatment for the new details-based groups
- Bumped package.json version 0.1.76 -> 0.1.77
- Appended Iteration 4 notes to .helm-goal/notes.md documenting the change and pointing the next iteration at plan Step 8 (Settings bulk 'I left this job' action)

Key learnings:
- archivedPeople() returns {id, name, relation, archivedAt}[]; archivedProjects()/archivedWorkstreams() return {id, name, archivedAt}[] (no relation field) - confirmed by reading src/service/api.js directly
- <details>/<summary> is this codebase's established disclosure pattern (already used for the multiselect form field) - reused it rather than inventing a new toggle; no new JS needed for open/closed state
- People's archived group needed a View button since person pages already handle archivedAt correctly (from iteration 2); Work's archived groups don't need one since work.js has no per-project/workstream detail page (confirmed by re-reading the whole file)
- No new service/domain code was needed this iteration - archivedPeople/archivedProjects/archivedWorkstreams were already wired into OPERATIONS from earlier iterations
- npm test: 635/635 pass; npm run typecheck: clean
- Plan Steps 1-7 are now complete. Remaining: Step 8 (Settings bulk archive action calling archiveEverythingActive), Step 9 (E2E in scripts/e2e-app.mjs - should cover the whole flow including Step 8's bulk action, so do it after Step 8 lands), Step 10 (DECISIONS.md entry, mechanism-only, no real names), Step 11 (final verification: npm test, npm run typecheck, npm run test:app)

## Iteration 5 - success (plan Step 8 - Settings bulk "I left this job" action)

Summary: Added the Settings bulk archive section and its confirmation-gated
action in `src/renderer/views/settings.js`, completing plan Step 8.

Key changes:
- `src/renderer/views/settings.js`: new private function `archiveSection()`
  (no params - unlike the other section functions it needs no data fetched
  in `render()`, since the button doesn't display any current counts, only
  what happened after it runs), following `dataSection`'s single-`.group`/
  single-`.card` shape. Title "Leaving a job", placed in `render()`'s
  template right after `${dataSection(status)}` (both sections are about
  the shape of the stored data, so this reads naturally next to it) and
  before `${aboutSection(status)}`.
- Card body states, per the goal's exact wording requirement: archives
  every person/project/workstream currently active, in one call; nothing
  is deleted, every 1-1/promise/decision/growth thread stays intact; each
  one is individually reversible from its own archived list; safe to press
  again since an already-archived row is left untouched. Button is
  `class="act danger"` (the same full-size danger-button class
  `people.js`'s "Remove" button uses, confirmed by grep - not `tiny`, since
  this is not a per-row action), `data-act="archiveEverything"`.
- `actions.archiveEverything`: `ask({title, body, confirm: "Archive
  everything", tone: "danger"})` restating the same plain-language
  guarantees (a native `confirm()` was never considered - this file, like
  every other renderer view, only ever uses `ask()`/`form()` from `ui.js`),
  then on confirm `act("archiveEverythingActive", {})` with **no** success
  string passed to `act()` itself (so it does not toast a generic message),
  followed by a hand-built `toast()` call using the returned `{people,
  projects, workstreams}` counts, e.g. "3 people, 1 projects, 0 workstreams
  archived." (no pluralisation logic added - the plan's own example string
  didn't specify one and every other numeric toast in this file, e.g.
  `index`'s "N contact record(s)", already handles the s/no-s question with
  `(s)`, not full pluralisation; a bare count followed by the plural noun
  read as acceptable placeholder English and matching an existing sibling
  convention seemed better than inventing a third convention for one
  string - reconsider only if this reads badly in the actual E2E run in
  Step 9), then `refresh()`.
- Confirmed via `src/renderer/ui.js`'s `toast(message, tone = "ok")` that
  the default tone is `"ok"`, not `"good"` - grepped the whole renderer for
  existing `toast(..., "...")` call sites and found only `"bad"` ever used
  explicitly elsewhere, so the success toast here omits the tone argument
  entirely rather than inventing a `"good"` tone that doesn't exist as a
  convention anywhere else in the codebase (this was a self-caught mistake
  mid-iteration, not something a previous iteration's notes flagged).
- Bumped `package.json` version `0.1.77` -> `0.1.78`.

Verification: `npm test` - 635/635 pass (no new unit tests - this is a
renderer-only change, E2E coverage for the whole archive/unarchive/bulk
flow is Step 9, not this step). `npm run typecheck` - clean, no errors.

Key learnings:
- `archiveEverythingActive(store, {now})` (in `src/service/api.js`, wired
  into `src/main/index.js`'s `OPERATIONS` since iteration 5's service-layer
  work) already existed with exactly the plan's documented shape - a thin
  loop over `archivePerson`/`archiveProject`/`archiveWorkstream` returning
  `{people, projects, workstreams}` counts of rows that were *actually*
  archived (already-archived rows are excluded from the count via each
  per-item function's own `.already` flag) - no service-layer changes were
  needed this iteration, confirmed by reading the existing function body
  before writing the renderer call.
- `test/archive.test.mjs` already has unit-test coverage of
  `archiveEverythingActive`'s idempotency (calling it twice archives
  nothing new the second time) from an earlier iteration's Step 5 work -
  did not duplicate that here, this iteration only added the UI trigger.
- Plan Steps 1-8 are now all complete. Remaining: Step 9 (E2E coverage in
  `scripts/e2e-app.mjs` for the full archive/unarchive/bulk-archive UI flow
  - person round-trip, project/workstream round-trip, and the Settings
  bulk action including asserting the confirmation dialog's body text is
  present, per the plan's explicit callout that this is the one place the
  goal requires wording to be checked), Step 10 (DECISIONS.md entry - "why
  archive-not-delete, why the append-only log was never touched", general
  mechanism-only terms, no real names, modeled on the existing 2026-08-25
  "Away and gone are dates on a person, not a delete" entry's shape), Step
  11 (final verification pass: `npm test`, `npm run typecheck`, `npm run
  test:app`, confirm the version was bumped and DECISIONS.md has the entry
  - this should be its own iteration at the very end, after Steps 9 and 10
  land, not combined with either).
- Next iteration should do plan Step 9: search `scripts/e2e-app.mjs` for
  `awayUntil` first (per the plan's own pointer) to find the closest
  existing round-trip check to copy the shape of, before writing any new
  `check(label, fn)` blocks. Use a scratch `TEND_DATA_DIR` exactly as that
  file's existing convention does. This step is the first one that will
  actually exercise `people.js`/`work.js`/`settings.js`'s new buttons end
  to end via CDP, so it may surface a UI bug the unit-test-only iterations
  2-5 could not have caught (e.g. a `data-act` name mismatch between the
  template and the `actions` object) - read the rendered HTML carefully
  rather than assuming the wiring is correct just because typecheck passed.

## Iteration 5 — success

Summary: Added the Settings bulk "I left this job" archive action (archiveSection + actions.archiveEverything in src/renderer/views/settings.js), completing plan Step 8.

Key changes:
- src/renderer/views/settings.js: new archiveSection() rendering a 'Leaving a job' card with a full-size danger 'Archive everything active' button, wired into render()'s template between dataSection and aboutSection
- src/renderer/views/settings.js: new actions.archiveEverything - ask() confirmation dialog stating nothing is deleted and it's reversible per-item, then act('archiveEverythingActive', {}) with no built-in success toast, followed by a hand-built toast showing the returned {people, projects, workstreams} counts, then refresh()
- Bumped package.json version 0.1.77 -> 0.1.78
- Appended Iteration 5 notes to .helm-goal/notes.md documenting the change and pointing the next iteration at plan Step 9 (E2E coverage)

Key learnings:
- archiveEverythingActive(store, {now}) already existed in src/service/api.js (from an earlier iteration) with exactly the plan's shape - no service-layer changes needed this iteration, just the UI trigger
- ui.js's toast(message, tone='ok') default tone is 'ok', not 'good' - grepped the whole renderer and found only 'bad' ever used explicitly elsewhere, so the success toast omits the tone argument rather than inventing a nonexistent 'good' convention
- class='act danger' (not 'act tiny danger') is the convention for a full-size, non-per-row danger button, matching people.js's existing Remove button
- Plan Steps 1-8 are now all complete. Remaining: Step 9 (E2E coverage in scripts/e2e-app.mjs for the full archive/unarchive/bulk flow - search for 'awayUntil' there first to find the closest existing round-trip check to copy), Step 10 (DECISIONS.md entry, mechanism-only wording, no real names), Step 11 (final verification pass: npm test, npm run typecheck, npm run test:app)
- npm test: 635/635 pass; npm run typecheck: clean after this change

## Iteration 7 — DISCARDED (success:false)

Summary: Iteration failed with a process error: Iteration timed out after 900000ms

Key learnings:
- Iteration 7 hard-failed: Iteration timed out after 900000ms
