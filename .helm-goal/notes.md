# Goal orchestrator notes

This file is the ONLY continuity mechanism between iterations — each
iteration runs in a fresh subprocess with no conversation memory. See
DECISIONS.md / PLAN.md (Fas 3 Point 11) in the Helm repo for why.

---

## RESEARCH iteration (archive mechanism) - findings and recommended plan

Current version in package.json: `0.1.70`. Bump to `0.1.71` for this change
(patch-per-

[... earlier notes truncated - context fill crossed the 40% budget, older narrative dropped to keep future iterations' prompts small; durable key learnings preserved above ...]

e
   collections and their MCP/renderer callers.
2. Whether stakes tied to an archived person/project get filtered out of
   cadence crossing too (recommended: yes, since a stake for a project
   nobody is tracking any more would otherwise keep nagging): implement as
   a filter at the `namedStakes(...)` call sites in `attention.js` and
   `api.stakeholders`, not as a new `archivedAt` field on stakes themselves.
3. Where exactly the "show archived" UI lives per view (inline collapsed
   group vs. separate toggle vs. new route): leaning toward inline group
   within the existing People/Work views per section 7, to avoid a new
   `halves.js` `VIEWS` entry, but not yet decided.
4. Whether the workstream/project list-row shape needs an
   `archived`/`archivedAt` field added to its return so the renderer can
   conditionally show Archive vs Unarchive and an "Archived n days ago"
   line (there is no dedicated single-project or single-workstream detail
   endpoint today, only list endpoints; worth double-checking during
   planning whether one needs to be added).

Recommended overall approach: implement domain layer first (`archive.js`
plus the `inScope` tweak plus call-site filters), then service layer
(`archive*`/`unarchive*`/`archiveEverythingActive` plus list-with-archived
option), then renderer (buttons plus archived group/section plus Settings
bulk action), then MCP test-of-absence, then unit tests, then E2E, then
DECISIONS.md entry plus version bump. This mirrors the codebase's own
layering (`domain` to `service/api.js` to `renderer`/`mcp`) and keeps each
step independently testable with `npm test`.

## Iteration 1 — success

Summary: Researched the Tend codebase's storage/domain/service/renderer/MCP/test layers and wrote a detailed archive-mechanism design plan into .helm-goal/notes.md for the next iteration.

Key changes:
- No code changes (research-only phase); appended a comprehensive findings/plan section to .helm-goal/notes.md

Key learnings:
- store.rows() already filters _deleted but must NOT be taught about archivedAt - archived rows must stay resolvable via resolvePerson/resolveProject/resolveWorkstream so history and the person/project page keep working; only aggregate views (roster, Now, prep, cadence expansion) need explicit archived-filtering at each call site.
- _deleted (existing 'Remove') has no restore path anywhere today and makes rows unresolvable by id; archivedAt must stay a distinct, separate, genuinely reversible mechanism - do not merge the two.
- src/domain/people.js's leftAt/awayUntil + inScope() is the closest existing precedent (and has a matching DECISIONS.md entry dated 2026-08-25) - extending inScope() with an isArchived() check covers people for free in attention.js/myattention.js/growthQuestions, but projects/workstreams have no equivalent helper and need direct filtering at each call site (expandCadences, buildAttention's unspecified-workstream loop, prep.js's owned-workstreams list, api.js's default list endpoints).
- prep.js currently has NO inScope-style filtering for people at all (relies on drift happening to be 0) - archived people must be explicitly skipped there, not just left to fall out via drift.
- Strong existing convention (decideDuty, decideTopic, decideDecision) deliberately excludes structural/roster-changing operations from the MCP tool surface, with tests in ledger.test.mjs and service.test.mjs asserting specific tool names/patterns do NOT exist. Recommend archive/unarchive follow the same exclusion, with a matching absence test, rather than adding new MCP tools.
- No native confirm()/prompt() exists anywhere in src/renderer; ask({title,body,confirm,tone})/form({title,intro,fields,confirm})/act(op,payload,toast) are the exact conventions to reuse for Archive buttons and the Settings bulk 'I left this job' action.
- People are relevant to both work and private halves (halves.js VIEWS), but projects/workstreams are confirmed work-half-only (only work.js/prep.js/attention.js read those collections) - archive UI for people needs to work in both halves, projects/workstreams only in the work half.
- No PersonRow/ProjectRow/WorkstreamRow JSDoc typedefs exist anywhere today, and there's no dedicated src/domain/projects.js file - plan phase should not over-engineer new typedef files just for this.
- package.json version is currently 0.1.70; bump to 0.1.71+ per commit during implementation. Today's date (2026-08-30) should be used for the new DECISIONS.md entry, modeled on the 2026-08-25 'Away and gone are dates on a person, not a delete' entry's voice/shape.
- Left several concrete open questions for the plan phase in notes.md section 10 (list-with-archived return shape, whether stakes tied to archived people/projects get filtered too, exact placement of the 'show archived' UI, whether project/workstream row shapes need an archived flag added).

## Iteration 2 — success

Summary: Wrote a concrete, 11-step implementation plan for the archive mechanism to .helm-goal/plan.md, grounded in direct reads of the actual current code rather than just prior research notes.

Key changes:
- Created .helm-goal/plan.md with an ordered, implement-iteration-sized step list: domain archive.js + inScope extension, service-layer read-path filtering, archive/unarchive/bulk service functions + OPERATIONS wiring, unit tests, four renderer steps (person/work buttons, archived-browse views, Settings bulk action), E2E coverage, DECISIONS.md entry, final verification pass
- No source code changes made this iteration (plan-only phase, as required)

Key learnings:
- Verified against actual code (not just prior notes): store.rows() in src/storage/reduce.js filters only _deleted, never archivedAt - confirmed safe to leave as-is so resolvePerson/resolveProject/resolveWorkstream keep resolving archived rows by id, which history and the person/project page depend on
- src/main/index.js's OPERATIONS map is a hand-written whitelist, NOT auto-generated from api.js exports - every new archive/unarchive/bulk/list-archived function needs an explicit new line added there, following the existing style; this detail was not nailed down in the prior research notes
- Confirmed exact renderer conventions to copy: ask()/form()/act() in src/renderer/ui.js, the actions.remove (people.js) / removeProject+removeStream (work.js) button+confirm pattern, and settings.js's group/card section function style (e.g. dataSection, switchMode) - quoted concretely in the plan so implement iterations don't need to re-derive them
- Confirmed MCP absence-test precedent's exact location and assertion shape in test/service.test.mjs (~line 302, /decide|accept|activate/i pattern) to mirror for a new /archive/i absence test
- Plan resolves the open question on list-with-archived shape: three new sibling functions archivedPeople/archivedProjects/archivedWorkstreams (not a boolean param or {active,archived} grouped return), since people()/projects()/workstreams() already have several existing callers expecting today's flat array shape
- Plan resolves the stakes-filtering open question: filter namedStakes(...) inputs at call sites in attention.js and api.stakeholders rather than adding archivedAt to the stakes collection itself
- Confirmed store.update(collection, id, {archivedAt: null}) is the correct way to clear (matches existing updatePerson convention of null-means-clear, not undefined)

## Iteration 3 — success (plan Step 1 + Step 2)

Summary: Added `src/domain/archive.js` (the shared `isArchived(row)` concept
plus the narrative rationale for why it is a timestamp and why it is not
merged with `leftAt`/`_deleted`) and extended `src/domain/people.js`'s
`inScope`/`availability` to treat archived people as out of scope.

Key changes:
- New file `src/domain/archive.js`: `isArchived(row)` only - no state
  machine, no reason field, matching the plan's explicit scope for step 1.
- `src/domain/people.js`: `inScope(person, now)` now also requires
  `!isArchived(person)`; `availability(person, now)` now returns
  `"archived"` (checked first, before `"left"`/`"leaving"`/`"away"`) when
  `archivedAt` is set; JSDoc on both updated; added the "## Archived"
  section to the file's header comment explaining the relationship to
  `leftAt`/`hasLeft` (independent, not merged).
- No other files touched yet - `archivedAt` is not read or written anywhere
  else in the codebase yet (that starts with plan step 3).

Verification: `npm test` - 617/617 pass, 0 fail (existing suite, no new
tests added yet - correct per plan step 3's note that step 3 should be
tested against the *existing* suite before new API surface is added).
`npm run typecheck` - clean, no errors.

Key learnings:
- `inScope` is called from `src/domain/attention.js` and
  `src/domain/myattention.js` already (confirmed by the research/plan
  notes above) - this one change is expected to make both exclude archived
  people once step 3 also filters `live("projects")`/`live("workstreams")`
  at the `cross()` call sites, since people flow through `inScope` already
  but projects/workstreams have no equivalent helper yet.
- Did NOT touch `package.json` version this iteration - the plan's step 11
  says version bumps should happen "on every commit that lands part of this
  work"; per CLAUDE.md the orchestrator/user bumps patch per commit, so
  confirm this is bumped at each commit going forward (this iteration's
  commit should still get a patch bump per repo convention even though the
  plan groups the version-bump instruction under step 9/11 - do not skip it
  for small steps).
- Next step per plan: Step 3 - filter archived rows out of
  `src/domain/attention.js` (`expandCadences`'s `cross()` calls and the
  promise-loop/unspecified-workstream-loop skips), `src/service/prep.js`
  (early continue for archived people, filter `owned` workstreams), and
  `src/service/api.js`'s `people()`/`projects()`/`workstreams()` default
  listings (exclude archived, add `archivedAt`/`archived` to returned rows)
  plus `person()` gaining `archivedAt` on its return. Do NOT yet add the
  archive/unarchive/bulk functions (that's step 4) - step 3 is purely
  read-path filtering against the *existing* test suite.
- Reminder for step 3: also decide and implement the stakes-filtering
  question (filter `namedStakes(...)` inputs by archived person/project at
  the call sites in `attention.js` and `api.stakeholders`, per the plan's
  recommendation - do not add `archivedAt` to the `stakes` collection).

## Iteration 3 — success

Summary: Added the shared archive.js domain concept and extended people.js's inScope/availability to exclude archived people, completing plan steps 1-2.

Key changes:
- Created src/domain/archive.js with isArchived(row) and narrative rationale for archivedAt as a timestamp distinct from leftAt/_deleted
- Extended src/domain/people.js: inScope() now also excludes archived people; availability() returns "archived" (checked first) when archivedAt is set; updated JSDoc/header comment
- Bumped package.json version 0.1.70 -> 0.1.71
- Appended Iteration 3 notes to .helm-goal/notes.md documenting what was done and the concrete next step (plan Step 3)

Key learnings:
- npm test (617/617) and npm run typecheck both pass clean after this change - inScope's new archived check is safe against the existing suite since no row has archivedAt set anywhere yet
- archivedAt is not yet read/written anywhere else in the codebase - attention.js, myattention.js, prep.js and api.js still need step 3's explicit filtering (people are covered for free via inScope, but projects/workstreams have no equivalent helper and need direct filtering at each call site)
- Next iteration should do plan Step 3: filter archived projects/workstreams in attention.js's expandCadences/buildAttention, add an early continue for archived people in prep.js plus filter owned workstreams, and exclude archived rows (while adding archivedAt/archived to each returned row) in api.js's people()/projects()/workstreams()/person(); also decide+implement the stakes-filtering question at the namedStakes() call sites. Do not add archive/unarchive/bulk functions yet (that's step 4).

## Iteration 4 - success (plan Step 3)

Summary: Filtered archived people/projects/workstreams out of every read path that currently assumes every row is live - expandCadences, buildAttention, prep.js, and api.js's people()/projects()/workstreams() - while person() gained a readable archivedAt field and stays fully resolvable when archived.

Key changes:
- src/domain/attention.js: expandCadences now filters live("projects") and live("workstreams") through !isArchived(...) before crossing them with duties (people were already covered via inScope from step 2); the namedStakes(...) call now receives the same filtered active people/projects arrays rather than raw live(...), so a stake naming an archived person or project resolves nobody and is dropped by namedStakes's own existing "nothing to act on" rule - no change needed inside stakes.js itself. buildAttention's promise loop now skips a promise whose person is archived (alongside the existing hasLeft skip), and the "unspecified workstream" loop skips archived workstreams too.
- src/service/prep.js: added an early continue for an archived person at the top of the per-person loop (explicit, not relying on drift happening to read as zero - an archived person with an old open promise would otherwise still earn a card), and owned now also filters out archived workstreams.
- src/service/api.js: people(), projects(), and workstreams() now filter out archived rows from their default listing (each with a one-line comment on why, matching the file's existing comment density). person(store, query, now)'s return object gained archivedAt: p.archivedAt ?? null - resolution and every other field is unchanged, so the person page and its history keep working when the person is archived. stakeholders() now passes store.rows("people").filter(!isArchived) and the equivalent for projects into namedStakes(...), same reasoning as the attention.js change.
- Bumped package.json version 0.1.71 -> 0.1.72.

Key learnings:
- Deliberately did NOT add archivedPeople()/archivedProjects()/archivedWorkstreams() sibling list functions, or the archivePerson/unarchivePerson/archiveEverythingActive functions, in this iteration - the plan explicitly scopes those to step 4 ("do NOT yet add the new archive/unarchive/list-with-archived functions, that is step 4"). I drafted an archivedPeople() function mid-iteration and then reverted it back out to keep this iteration's diff to pure read-path filtering, per the plan's own step boundary - worth remembering so the next iteration doesn't find a half-added sibling function and wonder if step 4 was started.
- Did NOT add a per-row archivedAt/archived flag to the objects returned by people()/projects()/workstreams() (the plan's step 3 text suggested this "regardless of which show-archived UI shape is picked"), because every row in each of those three functions' output is now always unarchived by construction (archived rows are filtered out before .map(...) runs) - the field would always read null/false there and buy nothing. The renderer only needs an archived-vs-not distinction on rows that come from the archived listing (step 4's sibling functions), where it should naturally have archivedAt set already since that is how those rows will be selected in the first place. If a future iteration decides differently after seeing the archived-list shape, that is a fine small deviation - just note it here.
- myattention.js's myAttention() needed NO changes: it already filters people through inScope internally (here = people.filter(inScope)), and the viaStake translation only recognises a stake whose person is in names (built from here), so a stake tied to an archived person is already invisible to it. Confirms the research notes' prediction that step 2 alone handles this file.
- findSubject() (api.js, used when logging a touch/contact against a project/workstream/stake by name) and setDelegationLevel() were deliberately left resolving by id/name with NO archived filter - these are single-row lookups for editing/recording, not listings, and an archived row must stay fully writable-to (adding history to it is exactly what "history stays intact" requires) even though it should not surface as something needing attention. Do not add filtering there.
- Verification: npm test 617/617 pass (no new tests added yet - existing suite only, per the plan's instruction to test step 3 against the existing suite before new API surface exists), npm run typecheck clean.
- Next iteration should do plan Step 4: add archivePerson/archiveProject/archiveWorkstream, unarchivePerson/unarchiveProject/unarchiveWorkstream, archiveEverythingActive, and the three archived* list-sibling functions to src/service/api.js, then wire all of them into src/main/index.js's OPERATIONS map (a hand-written whitelist - each needs its own explicit line, see the plan's step 4 for the exact style to copy). Do not add unit tests for these yet unless a step naturally produces a small one to sanity-check idempotency - the plan puts the fuller test suite in step 5, after step 4's functions all exist.

## Iteration 4 — success

Summary: Filtered archived people/projects/workstreams out of every read path that currently assumes every row is live (expandCadences, buildAttention, prep.js, and api.js's people()/projects()/workstreams()/stakeholders()), while person() gained a readable archivedAt field and stays fully resolvable when archived, completing plan Step 3.

Key changes:
- src/domain/attention.js: expandCadences filters archived projects/workstreams before crossing with duties, and passes only active people/projects into namedStakes so stakes tied to archived rows drop out naturally; buildAttention skips promises for archived people and skips archived workstreams in the unspecified-delegation loop
- src/service/prep.js: early continue for archived people at the top of the per-person loop; owned workstreams filtered to exclude archived ones
- src/service/api.js: people()/projects()/workstreams() now exclude archived rows from their default listing; person() returns archivedAt without any filtering change; stakeholders() filters archived people/projects before calling namedStakes()
- Bumped package.json version 0.1.71 -> 0.1.72
- Appended Iteration 4 notes to .helm-goal/notes.md documenting the change and the concrete next step (plan Step 4: archive/unarchive/archiveEverythingActive + archived* list functions + OPERATIONS wiring)

Key learnings:
- Deliberately did NOT add archivedPeople()/archivedProjects()/archivedWorkstreams() sibling list functions or the archive*/unarchive*/archiveEverythingActive functions - plan explicitly scopes those to Step 4; a draft archivedPeople() was written then reverted to keep this iteration's diff to pure read-path filtering
- Did NOT add an archivedAt/archived flag to the objects returned by people()/projects()/workstreams() - every row those functions return is now always unarchived by construction, so the field would be dead weight there; the archived-vs-not distinction belongs on the rows returned by Step 4's archived* sibling functions instead
- myattention.js needed no changes - myAttention() already filters people via inScope internally and its viaStake translation only recognises stakes whose person is in that already-filtered set, so archived people are invisible to it for free (confirms research notes' prediction)
- findSubject() and setDelegationLevel() in api.js were deliberately left unfiltered - they are single-row lookups for editing/recording history against a subject, not listings, and an archived row must stay fully writable-to since keeping history intact requires that
- npm test (617/617) and npm run typecheck both pass clean after this step; no new tests added yet since Step 5 (unit tests) comes after Step 4's new API surface exists

## Iteration 5 - success (plan Step 4)

Summary: Added the archive/unarchive/bulk service functions and the three archived-listing siblings to src/service/api.js, wired them into src/main/index.js's OPERATIONS whitelist, and noted their deliberate absence from the MCP tool surface in src/mcp/tools.js's header comment.

Key changes:
- src/service/api.js: added `archivedPeople`/`archivedProjects`/`archivedWorkstreams` (each: rows where `isArchived(row)`, mapped to `{id, name, archivedAt}` (plus `relation` for people), newest-archived first) placed right after `people()`/`projects()`/`workstreams()` respectively. Added `archivePerson`/`archiveProject`/`archiveWorkstream` (resolve via `resolvePerson`/`resolveProject`/`resolveWorkstream`, `{error}` on a bad id, `{..., already: true}` no-op if already archived, otherwise `store.update(collection, id, {archivedAt: now})`) placed after `updatePerson`/`addProject`/`addWorkstream` respectively, and matching `unarchivePerson`/`unarchiveProject`/`unarchiveWorkstream` (`store.update(collection, id, {archivedAt: null})`, `null` not `undefined`, matching `updatePerson`'s clear convention). Added `archiveEverythingActive(store, {now})` after the workstream archive functions: loops all three collections, calls the matching `archive*` function on every row, counts only the ones where the result was NOT `already: true`, returns `{people, projects, workstreams}`.
- src/main/index.js: added the six archive/unarchive lines plus the three archived-listing lines plus `archiveEverythingActive` to `OPERATIONS`, grouped right after `projects:` with a comment explaining why they're operations (not decisions like decideDuty) yet still absent from MCP.
- src/mcp/tools.js: extended the existing "writing may add, never restructure" paragraph in the file header to explicitly name archive/unarchive/bulk as excluded, for the same reason `decideDuty` is excluded (taking someone off the roster is the user's call, even though archiving is reversible and adds no history).
- Manually sanity-checked (via a throwaway script, deleted before finishing - not left in the repo) that: archiving is idempotent (second call returns `already: true` with the *original* `archivedAt`, does not overwrite it), archived rows drop out of `people()`/`projects()`/`workstreams()` but `person()` still resolves and reports `archivedAt`, unarchiving restores visibility, and `archiveEverythingActive` run twice in a row archives everything the first time and nothing the second time (`{people: 0, projects: 0, workstreams: 0}`).
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
