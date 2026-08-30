# Goal orchestrator notes

This file is the ONLY continuity mechanism between iterations — each
iteration runs in a fresh subprocess with no conversation memory. See
DECISIONS.md / PLAN.md (Fas 3 Point 11) in the Helm repo for why.

---

## RESEARCH iteration (archive mechanism) - findings and recommended plan

Current version in package.json: `0.1.70`. Bump to `0.1.71` for this change
(patch-per-

## Preserved key learnings (from truncated earlier iterations)

- Deliberately did NOT add archivedPeople()/archivedProjects()/archivedWorkstreams() sibling list functions or the archive*/unarchive*/archiveEverythingActive functions - plan explicitly scopes those to Step 4; a draft archivedPeople() was written then reverted to keep this iteration's diff to pure read-path filtering
- Did NOT add an archivedAt/archived flag to the objects returned by people()/projects()/workstreams() - every row those functions return is now always unarchived by construction, so the field would be dead weight there; the archived-vs-not distinction belongs on the rows returned by Step 4's archived* sibling functions instead
- myattention.js needed no changes - myAttention() already filters people via inScope internally and its viaStake translation only recognises stakes whose person is in that already-filtered set, so archived people are invisible to it for free (confirms research notes' prediction)
- findSubject() and setDelegationLevel() in api.js were deliberately left unfiltered - they are single-row lookups for editing/recording history against a subject, not listings, and an archived row must stay fully writable-to since keeping history intact requires that
- npm test (617/617) and npm run typecheck both pass clean after this step; no new tests added yet since Step 5 (unit tests) comes after Step 4's new API surface exists


[... earlier notes truncated - context fill crossed the 40% budget, older narrative dropped to keep future iterations' prompts small; durable key learnings preserved above ...]

)`/`projects()`/`workstreams()` but `person()` still resolves and reports `archivedAt`, unarchiving restores visibility, and `archiveEverythingActive` run twice in a row archives everything the first time and nothing the second time (`{people: 0, projects: 0, workstreams: 0}`).
- Bumped package.json version 0.1.72 -> 0.1.73.

Key learnings:
- Discovered while sanity-checking: `addPerson` in the work half rejects relation `"peer"` - valid work-half relations are `lead-and-manage`, `lead-only`, `manage-remotely`, `equal-lead`, `own-manager`, `stakeholder` (from `src/domain/halves.js` `relationsIn`). Future unit tests (plan Step 5) need a valid relation constant like `"equal-lead"`, not an invented one - check `test/service.test.mjs`'s existing fixtures for whatever they already use rather than guessing again.
- `resolvePerson`/`resolveProject`/`resolveWorkstream` all accept an id directly (checked before the fuzzy-name match), so `archivePerson(store, id, {now})` etc. correctly resolve by the id the renderer/MCP would pass, not just by name - confirmed by the sanity script.
- Local variable names `people`/`projects`/`workstreams` inside `archiveEverythingActive` shadow the exported functions of the same name in the same module - this is valid JS (function-scoped shadowing) and `tsc --noEmit` raised no complaint; flagging only so a future reviewer doesn't think it's a bug.
- Did NOT add any new unit tests yet - this iteration is plan Step 4 (service layer plus wiring only); the plan's Step 5 explicitly comes next and should add `test/service.test.mjs`-style coverage for all of the above (idempotency, unarchive, bulk, archived-listing shape) plus the MCP absence test (`/archive/i` should match no `TOOLS` entry in `src/mcp/tools.js`, mirroring the existing `/decide|accept|activate/i` assertion near the decideDuty test in that file, around line 302).
- `npm test` (617/617, unchanged - no new tests added this iteration) and `npm run typecheck` both pass clean.
- Next iteration should do plan Step 5: unit tests in `test/service.test.mjs` (or a new `test/archive.test.mjs` if that reads cleaner - check the existing file's size/organization first) covering everything listed in the plan's Step 5, plus the MCP absence test. After that, Steps 6-8 are the three renderer iterations (person/work archive buttons plus banners, archived-browse groups in People/Work views, Settings bulk action), then Step 9 (E2E), Step 10 (DECISIONS.md entry), Step 11 (final verification pass).

## Iteration 5 — success

Summary: Implemented plan Step 4: added the archive/unarchive/bulk-archive/archived-listing service functions to src/service/api.js, wired them into src/main/index.js's OPERATIONS whitelist, and documented their deliberate absence from the MCP tool surface.

Key changes:
- Added archivePerson/archiveProject/archiveWorkstream and unarchivePerson/unarchiveProject/unarchiveWorkstream to src/service/api.js, each idempotent (already:true no-op if already in that state), using resolvePerson/resolveProject/resolveWorkstream for the existing error style
- Added archiveEverythingActive(store, {now}) as a thin wrapper looping all three collections and calling the per-item archive functions, counting only rows that actually changed
- Added archivedPeople/archivedProjects/archivedWorkstreams sibling list functions returning only archived rows (id, name, archivedAt, newest first)
- Wired all ten new functions into src/main/index.js's OPERATIONS whitelist with a comment explaining they are operations (not MCP tools), grouped after the projects: entry
- Extended src/mcp/tools.js's header comment to explicitly name archive/unarchive/bulk as deliberately excluded from the MCP surface, same rationale as decideDuty
- Bumped package.json version 0.1.72 -> 0.1.73
- Appended Iteration 5 notes to .helm-goal/notes.md with what was done, a discovered gotcha, and the concrete next step

Key learnings:
- addPerson in the work half rejects relation "peer" - valid values are lead-and-manage, lead-only, manage-remotely, equal-lead, own-manager, stakeholder (from src/domain/halves.js relationsIn) - use one of these in future test fixtures for this work
- Manually sanity-checked (throwaway script, deleted before finishing, not committed) that archiving is idempotent and preserves the original archivedAt on a second call, unarchive restores visibility in people()/projects()/workstreams(), person() still resolves an archived person and reports archivedAt, and archiveEverythingActive run twice archives everything the first time and nothing the second time
- Local variable names people/projects/workstreams inside archiveEverythingActive shadow the exported functions of the same name in the same module scope - valid JS, tsc raised no complaint, not a bug, just worth flagging for a future reader
- npm test (617/617) and npm run typecheck both pass clean; no new unit tests were added this iteration since that is scoped to plan Step 5
- Next iteration should do plan Step 5: add unit tests (test/service.test.mjs or a new test/archive.test.mjs) covering idempotency, unarchive, bulk archive, archived-listing shape, and history staying intact, plus an MCP absence test asserting no TOOLS entry matches /archive/i (mirror the existing /decide|accept|activate/i assertion near decideDuty's test, around line 302 in test/service.test.mjs). After that: Steps 6-8 (renderer: person/work buttons, archived-browse views, Settings bulk action), Step 9 (E2E), Step 10 (DECISIONS.md entry), Step 11 (final verification pass)

## Iteration 6 - success (plan Step 5)

Summary: Added `test/archive.test.mjs`, a new dedicated test file (18 tests)
covering every item in the plan's Step 5 checklist for the service layer,
plus the MCP absence test.

Key changes:
- New file `test/archive.test.mjs`, following `test/service.test.mjs`'s
  exact conventions (`mkdtempSync`/`openStore`/`ok`/`failed` from
  `test/helpers.mjs`, one duty + one person/project/workstream fixture per
  `beforeEach`, a 200-day-silent person as the "would surface if not
  archived" control). Covers: archiving removes a row from
  `people()`/`projects()`/`workstreams()` while `person()` keeps resolving
  it and reports `archivedAt`; archiving removes cadence drift from
  `api.attention()`'s `needsYou`/`nudges` while an open promise and a
  logged touch made against the archived person stay in the store
  untouched and still readable from `person().openPromises`/
  `.recentContact`; archiving removes the person from `prep()`'s cards
  explicitly (not just via drift); idempotency (`already: true`, original
  `archivedAt` preserved on a second call, for a person, project and
  workstream); unarchive restores visibility in the listings, attention and
  prep; unarchiving an already-active row is a harmless no-op;
  `archivePerson`/`unarchivePerson` on an unknown id return `{error}`;
  `archivedPeople`/`archivedProjects`/`archivedWorkstreams` return exactly
  the archived rows; a stake naming an archived person or an archived
  project drops out of `api.stakeholders()`; `archiveEverythingActive`
  archives every active row across all three collections in one call, is
  safe to run twice (second run returns `{people:0, projects:0,
  workstreams:0}`), and does not disturb the `archivedAt` of a row that
  was already archived before the bulk call; and the MCP absence test
  (`TOOLS.find((t) => /archive/i.test(t.name))` is `undefined`).
- No other files touched - this iteration is test-only, per the plan's
  Step 5 scope.
- Bumped `package.json` version `0.1.73` -> `0.1.74`.

Verification: `npm test` - 635/635 pass (617 existing + 18 new), 0 fail.
`npm run typecheck` - clean after one fix (see learnings below).

Key learnings:
- `api.stakeholders(store, now, project?)` returns `Record<string,
  any>[] | {error: string}` (it can error only when a `project` filter
  argument is given and does not resolve) - even though my calls never
  pass a `project` arg and can never hit that branch, `tsc` still infers
  the union return type from the function signature and rejects
  `.length` on it directly. Fixed by following `test/stakes.test.mjs`'s
  own existing convention for this exact function:
  `/** @type {any[]} */ (api.stakeholders(store, NOW)).length`. Worth
  remembering for any future test that calls `stakeholders()` without
  narrowing via `Array.isArray(...)` first.
- Confirmed `namedStakes()` (src/domain/stakes.js) already filters by
  identity (`byPerson.has(...)`/`byProject.has(...)`), and
  `api.stakeholders()` already passes it only
  `!isArchived(...)`-filtered people/projects (done in iteration 4/5) - so
  the stake-archival behaviour needed NO new production code this
  iteration, only a test proving it. No duty of `subjectKind: "stake"` is
  needed to exercise `api.stakeholders()`; that function reads `stakes`
  rows directly and has nothing to do with `expandCadences`/duties. (An
  earlier draft of the test added such a duty out of habit copied from
  `attention.js` reasoning - removed it since it exercised nothing.)
- `prep(store, now, opts?)` returns `{cards, dropped}`, not a bare array -
  `.cards` is the field to assert against (confirmed by reading
  `src/service/prep.js`'s return statement directly, not just the plan's
  prose).
- `api.attention(store, now)` returns `{needsYou, nudges, heldBackByFocus,
  allInStep, focus}` - `needsYou[i].what` is the summarised title
  (`summariseItem` in api.js maps `AttentionItem.title` to `.what`), not
  `.title` - matters for anyone writing a new attention-shaped assertion
  by pattern-matching the domain-layer `AttentionItem` typedef instead of
  the service-layer wrapper.
- Did NOT touch `test/service.test.mjs` itself - a new dedicated file read
  cleaner than growing the already-395-line `service.test.mjs` further,
  and the plan explicitly allowed either ("test/service.test.mjs or a new
  test/archive.test.mjs"). The MCP absence test lives in
  `test/archive.test.mjs` rather than being duplicated in
  `service.test.mjs`.
- Next iteration should start plan Step 6: renderer per-item Archive/
  Unarchive buttons. Read `src/renderer/views/people.js`'s
  `actions.remove` (danger-zone block) and `src/renderer/views/work.js`'s
  `actions.removeProject`/`actions.removeStream` first for the exact
  `ask()`/`act()` shape to copy, and `src/renderer/ui.js` for the
  `ask({title, body, confirm, tone})`/`act(op, args, successText)`
  signatures (both already confirmed accurate against the current code by
  earlier research iterations, but re-check line numbers since renderer
  files were not touched by iterations 3-6 and may have shifted only
  trivially, if at all). Keep this iteration scoped to just the person
  page's Archive/Unarchive button plus the "Archived" banner (using
  `p.archivedAt` already returned by `api.person()`) - defer the
  project/workstream buttons (Step 6's second half) and the archived-browse
  views (Step 7) and Settings bulk action (Step 8) to their own iterations,
  per the plan's own note that "Steps 6-8 touch three different view files;
  each can be its own iteration."

## Iteration 1 — success

Summary: Added test/archive.test.mjs with 18 unit tests covering the archive/unarchive/bulk-archive/archived-listing service functions (idempotency, history preservation, attention/prep exclusion, MCP absence), completing plan Step 5.

Key changes:
- New file test/archive.test.mjs: 18 tests covering archivePerson/archiveProject/archiveWorkstream, unarchive counterparts, archivedPeople/archivedProjects/archivedWorkstreams, archiveEverythingActive, stake filtering, and MCP tool-surface absence
- Bumped package.json version 0.1.73 -> 0.1.74
- Appended Iteration 6 notes to .helm-goal/notes.md documenting what was tested and pointing the next iteration at plan Step 6 (renderer Archive/Unarchive button on the person page)

Key learnings:
- api.stakeholders(store, now, project?) has a union return type ({error} | array) per its JSDoc even though the archive tests never hit the error branch - use the existing test/stakes.test.mjs convention `/** @type {any[]} */ (api.stakeholders(...))` to satisfy tsc
- namedStakes()/api.stakeholders() already filtered archived people/projects (done in iterations 4-5), so the stake-archival tests needed no new production code, only proof - no subjectKind:'stake' duty is needed since stakeholders() reads stakes rows directly, unrelated to expandCadences
- prep(store, now, opts?) returns {cards, dropped} (use .cards); api.attention() items use .what (not .title) since summariseItem() renames AttentionItem.title to .what for the service-layer wrapper
- Full suite is now 635/635 passing (617 existing + 18 new); npm run typecheck clean
- Next iteration: plan Step 6, renderer - start with just the person page's Archive/Unarchive button + Archived banner in src/renderer/views/people.js (copy actions.remove's ask()/act() shape), deferring project/workstream buttons, archived-browse views, and Settings bulk action to their own iterations per the plan's own guidance

## Iteration 2 - success (plan Step 6, person page only)

Summary: Added the person page's Archive/Unarchive button plus an "Archived on ..." banner in src/renderer/views/people.js, the first of the three renderer steps.

Key changes:
- src/renderer/views/people.js `personPage()`: new `<div class="block">` inserted between the existing content and the `.danger-zone` block (deliberately its own block, not inside danger-zone, with a comment explaining why - Archive is reversible and Remove is not, and putting them side by side risked the two being confused). When `p.archivedAt` is set it renders a one-line banner ("Archived on YYYY-MM-DD. They stop appearing in Now, prep, attention nudges and duty cadences - everything already on this page stays exactly as it is.") plus an "Unarchive `<name>`" button; otherwise it renders an "Archive `<name>`" button. Date is formatted the same way `observations` already does on this same page (`new Date(...).toISOString().slice(0, 10)`), matching the existing convention that the renderer does not do "N days ago" math itself for a one-off date - that lives in `api.js` via `agoWords`, which was not worth threading through for one banner line.
- `actions.archive`: `ask({title, body, confirm: "Archive", tone: "danger"})` with plain-language wording (mirrors the goal's own required wording: stops appearing in Now/prep/attention/cadences, history stays, reversible) then `act("archivePerson", {id: d.person}, ...)` then `refresh()`. Placed right before `actions.remove`, matching the button order in the template.
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
