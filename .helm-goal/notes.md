# Goal orchestrator notes

This file is the ONLY continuity mechanism between iterations — each
iteration runs in a fresh subprocess with no conversation memory. See
DECISIONS.md / PLAN.md (Fas 3 Point 11) in the Helm repo for why.

---

## RESEARCH iteration (archive mechanism) - findings and recommended plan

Current version in package.json: `0.1.70`. Bump to `0.1.71` for this change
(patch-per-

[... earlier notes truncated - context fill crossed the 40% budget, older narrative dropped to keep future iterations' prompts small; durable key learnings preserved above ...]

he file header comment
in `src/mcp/tools.js` ("Writing may add, never restructure... It cannot
decide what the job is - `decideDuty` is not on this list, deliberately"):
  - `decideDuty` (accept/decline a proposed duty): app-only, not in `TOOLS`.
  - `decideTopic`: same.
  - `decideDecision`/recording a decision: same; and there is a **test that
    locks this in**: `test/ledger.test.mjs` asserts `tend_log_decision` /
    `tend_decide_decision` / `tend_record_decision` do not exist in `TOOLS`
    (`names.includes(forbidden) === false`). `test/service.test.mjs` has an
    equivalent assertion for duties: `TOOLS.find((t) =>
    /decide|accept|activate/i.test(t.name))` must be `undefined`.

Archiving a person/project/workstream is the same *kind* of action as
accepting a duty or recording a decision: it changes what the roster/role
map/Now *means* going forward, not a fact an agent observed. So the
recommended plan is: **do not add archive/unarchive to `src/mcp/tools.js`**,
and add a test mirroring the two above (e.g. assert no tool name matches
`/archive/i`) to lock the decision in the same way the codebase already does
for duties/decisions. This directly answers goal point 6 ("match existing
conventions, don't invent a new shape"): the existing convention for this
*class* of mutation is exclusion, not a new tool shape.

### 7. Renderer / UI - concrete integration points

Dialog helpers (`src/renderer/ui.js`), confirmed shape, use these directly.
No native `confirm()`/`prompt()` exists anywhere in `src/renderer` and none
should be added:
```js
ask({ title, body, confirm, tone })       // -> Promise<boolean>, tone: "danger" for destructive
form({ title, intro, fields, confirm })   // -> Promise<Record<string,any>|null>
act(opName, payload, successToastText)    // -> calls tend.invoke(op, payload), toasts on error, returns null on error
```
Existing "Remove" buttons follow the exact pattern to copy for "Archive":
`src/renderer/views/people.js` `actions.remove` (person page, "danger zone"
block near the bottom) and `src/renderer/views/work.js`
`removeProject`/`removeStream` (three "Remove" buttons: projects list rows,
stakeholders rows, workstream cards). Add "Archive" buttons beside "Remove"
in all three places (person page, project rows, workstream cards), each:
`ask({title: "Archive X?", body: "<plain-language: what will and will not
happen>", confirm: "Archive", tone: "danger"})` then `act("archivePerson"/
"archiveProject"/"archiveWorkstream", {id}, "Archived.")` then `refresh()`.

For "show archived" / unarchive path (goal point 5): `src/domain/halves.js`
`VIEWS` currently has no archive-related entry; the **Work** view
(`halves: ["work"]` only) is where projects/workstreams live, and **People**
(`halves: ["work", "private"]`) is where people live. Confirmed people ARE
private-half-relevant (the private half has its own people, e.g. family),
so the People archive/unarchive UI must work correctly in both halves, but
Work (projects/workstreams) is work-half only by construction (confirmed:
`work.js`/`prep.js`/`attention.js` are the only readers of the `projects`/
`workstreams` collections; `journal.js` and `knowledge.js`, the two
private-half views besides People/Settings, never touch them). So:
  - People: add an "Archived" toggle/section within the existing People view
    (grouped like the relationship groups already are), reachable in both
    halves, or a small "Archived (n)" link near the "Add someone" button.
  - Work: same idea for projects/workstreams within the existing Work view.
  - Simpler alternative matching `roleMap`'s pattern (`{active, proposed,
    declined}` groups already rendered together in `role.js`): make the
    existing People/Work views render an "Archived" group alongside the
    live ones (collapsed/at the bottom) rather than a whole separate route,
    likely less new plumbing than a new entry in `halves.js` `VIEWS`. Decide
    in the plan phase; both are legitimate, `halves.js`'s comment already
    warns against a *fifth* hand-written derived list, so whichever is
    chosen should still derive from one place if it needs its own list of
    views/sections.
  - Settings (`src/renderer/views/settings.js`) is where the bulk "I left
    this job" action belongs (goal point 5, explicit). Follow the existing
    `<div class="group">`/`<article class="card">` section pattern (see
    `modeSection`/`dataSection` for the shape): a new section, its own
    `ask({..., tone: "danger"})` confirm dialog whose body states in plain
    words: archives everyone/everything currently active; does not delete
    any history; fully reversible one at a time. Then `act
    ("archiveEverythingActive", {}, "...")` then `refresh()`.

### 8. Tests - conventions confirmed, ready to copy

- Unit/domain/service tests: `node:test` `describe`/`it`,
  `beforeEach`/`afterEach` opening a fresh `openStore` over a `mkdtempSync`
  scratch dir, `ok(result)`/`failed(result)` helpers from `test/helpers.mjs`
  to unwrap the `{error}`-or-success union. See `test/service.test.mjs`,
  `test/people.test.mjs` (the latter already tests `removeRow` directly,
  a good template for archive/unarchive tests: idempotency, "still shows up
  in history", cadence exclusion via `expandCadences`).
- MCP absence test pattern: `test/ledger.test.mjs` (around lines 135-140) and
  `test/service.test.mjs` (around lines 302-307, quoted above in section 6):
  copy this shape for a new "archive tools are not exposed over MCP"
  assertion.
- E2E (`scripts/e2e-app.mjs`): `check(label, fn)` harness, CDP-driven,
  `TEND_DATA_DIR` scratch dir via `mkdtempSync`. The closest existing
  end-to-end analogue to copy for archive/unarchive is the away/leave
  round-trip check (search for `awayUntil` in that file): open person, then
  `fillDialog` a status field, then assert they disappear from a computed
  list, then clear the field via edit again, then assert they reappear. A
  new archive check should follow: click Archive on a person/project/
  workstream, confirm dialog, assert gone from roster/Now/prep listing,
  open "show archived", assert visible there with an Unarchive action,
  click it, assert back in the normal listing. Also add a check for the
  Settings bulk action: open Settings, trigger "I left this job", assert the
  confirmation dialog wording, confirm, assert roster/Now/Work are now empty
  of active items, assert history/person pages still resolve.

### 9. Version/commit notes

- `package.json` version is currently `0.1.70` at research time. Bump patch
  on whatever commit(s) land this work, per CLAUDE.md rule (bump on every
  commit, never touch minor/major without asking).
- DECISIONS.md entries are dated `## YYYY-MM-DD - <sentence-case title>`,
  each with bolded lead-ins (`**Decided.**`, `**Why.**`, `**Rejected:
  ...**`). Newest entries currently dated `2026-08-27`; today's date per the
  environment is `2026-08-30`, use that for the new entry. The 2026-08-25
  "Away and gone are dates on a person, not a delete" entry is the closest
  voice/shape template (has its own "Rejected: hiding a promise the moment a
  resignation is known" subsection): model the new entry's shape on it, but
  do not name any person or describe the owner's real situation (per the
  goal's constraint); write only about the mechanism in general terms.

### 10. Open questions to settle in the PLAN phase (not yet decided)

1. Exact shape of "list with archived included": a boolean option threaded
   through `people()`/`projects()`/`workstreams()`, or a `{active,
   archived}` grouped return (mirrors `roleMap`'s `{active, proposed,
   declined}`), or dedicated `archivedPeople()`/etc. functions. Recommend
   the grouped-return shape for consistency with `roleMap`, but either is
   acceptable; pick one and use it consistently across all three
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
