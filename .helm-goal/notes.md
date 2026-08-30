# Goal orchestrator notes

This file is the ONLY continuity mechanism between iterations — each
iteration runs in a fresh subprocess with no conversation memory. See
DECISIONS.md / PLAN.md (Fas 3 Point 11) in the Helm repo for why.

---

# RESEARCH ITERATION - reflection feature

Full codebase read for the reflection-feature goal. Below is everything the PLAN
iteration needs; no further exploratio

## Preserved key learnings (from truncated earlier iterations)

- signals.js/signalsDue is the WRONG model to copy for the reflection nudge: its severity can reach 'critical' and buildAttention() folds it into Now's needs list, violating the 'never critical' constraint.
- src/domain/myattention.js ('My month' on the Now view) is the structurally correct, already-approved home: its signals have no severity field at all so they cannot become critical, they're rendered in a dedicated low-key block, and DECISIONS.md's growth entry already establishes the precedent that things genuinely about the user himself belong there.
- Adding a new myAttention signal will require updating test/myattention.test.mjs's exact-key-list assertion (assert.deepEqual of sorted signal keys) - must be done deliberately.
- src/mcp/tools.js was read in full: entries and moments (the closest analogues - self-directed, no named people) have ZERO MCP surface, not even read-only. Strong precedent to give reflection no MCP tool at all, or at most a read-only one modeled on tend_reviews.
- AGENT_WRITABLE in api.js should NOT include reflections - it's the owner's own retrospective, not agent-creatable material.
- src/service/api.js is 2792 lines; only lines 1-1528 were read this iteration. Lines 1529+ (including logEntry's exact validation style, lastReviewRun's implementation, and vocabulary()) MUST be read before writing code.
- app.js's applyHalf() removes .nav-btn elements not belonging to the current half, implying nav buttons are hand-authored in an HTML file (not yet located/read) - adding a standalone view likely requires editing that HTML too.
- scripts/e2e-app.mjs is long (2000+ lines); only the first 140 lines were read. The journal-view flow around lines 1579-1650 (data-act='writeEntry') is the template to copy for the new reflection E2E flow.
- Tend's existing precedent (topics only on prep cards, moments folded into journal.js) suggests leaning toward folding reflection into an existing view rather than adding a new nav rail entry, though the goal leaves this an open choice.
- Per project convention (bump patch on every commit, one commit per iteration), every future code-touching iteration in this goal should bump package.json's patch version itself, not just a final iteration.
- Nav buttons are hand-authored in src/renderer/index.html (confirmed by reading it) and pruned per-half by app.js's applyHalf() - adding a standalone view requires editing index.html, halves.js VIEWS, and app.js's VIEWS object together.
- journal.js is the


[... earlier notes truncated - context fill crossed the 40% budget, older narrative dropped to keep future iterations' prompts small; durable key learnings preserved above ...]

ideal UI template: its 'no nav-count, own rail slot, occasional habit' pattern and its writeEntry/entry()/dropEntry action shapes map almost directly onto the new reflection.js view.
- api.js's moments()/logMoment()/logEntry()/journal() functions (read in full, lines ~1791-2160) are the exact templates for logReflection/reflections - copy their validation and newest-first sorting idioms.
- removeRow()'s removable list and OPERATIONS in main/index.js are simple whitelist arrays - reflections just needs to be added to both, no new generic machinery needed.
- test/journal.test.mjs mirrors both domain-level pure-function tests and service-level 'through the store' tests in one file - this is the template for the new test/reflection.test.mjs; logMoment's own tests actually live in test/mode.test.mjs (private-mode tests), showing test placement in this repo follows feature relevance rather than a strict one-file-per-service-function rule.
- The em-dash linter rejected the first draft of plan.md; had to rewrite entirely with hyphens instead of em dashes throughout (the project's CLAUDE.md explicitly bans em dashes).
- scripts/e2e-app.mjs's journal section (lines ~1577-1660) is the concrete template for the new E2E reflection flow, including the nav-count-absent check pattern.

## Iteration 3 — success

Summary: Add src/domain/reflection.js (fixed-prompt weekly reflection fields, hasContent, cadence constant) as step 1 of the reflection feature plan, and bump package.json to 0.1.71.

Key changes:
- Created src/domain/reflection.js with REFLECTION_FIELDS (wellDone, differently, notes), REFLECTION_CADENCE_DAYS=7, and hasContent(row), plus a house-style doc comment explaining why this is not a diary, not a growth thread, not the day/moment, and never critical.
- Bumped package.json version 0.1.70 -> 0.1.71 per project convention (bump patch every commit).
- Verified npm run typecheck and npm test both pass (617/617 tests green) with the new file in place; the module is not yet imported anywhere else (that wiring is later plan steps).

Key learnings:
- This was step 1 of .helm-goal/plan.md's 10-step build order; steps 2-10 (storage collection, service layer, myattention nudge, halves/view registration, renderer view, unit tests, E2E flow, DECISIONS.md entry, final verification) remain, each intended as its own small implement iteration per the plan's explicit instruction not to batch steps.
- Confirmed via grep for the em-dash character that none slipped into the new file's prose (project CLAUDE.md forbids em dashes; used ' - ' throughout).
- src/domain/reflection.js deliberately has no 'days since / is due' helper - per the plan, that arithmetic belongs in myattention.js (step 4), keeping this file symmetric with journal.js's minimalism.
- Next iteration should do step 2: add 'reflections' to COLLECTIONS in src/storage/reduce.js (with the contrast comment vs. entries/moments) and add 'reflections' to removeRow()'s removable list in src/service/api.js (around line 1298-1317), then rerun npm test.

## Iteration 4 — success

Summary: Add step 2 of the reflection-feature plan: register "reflections" as
a storage collection and make its rows removable, then bump the version.

Key changes:
- src/storage/reduce.js: added "reflections" to COLLECTIONS (after "moments"),
  with a comment contrasting it with entries and moments specifically, per
  the plan's step 2 wording.
- src/service/api.js: added "reflections" to the `removable` list inside
  removeRow() (after "moments"), so a future Remove button on the reflection
  view works from day one instead of repeating the historical touches/stakes/
  topics bug the comment above that list describes.
- package.json: bumped 0.1.71 -> 0.1.72.
- Verified npm run typecheck (clean) and npm test (617/617 green) with no
  other files touched - this step intentionally has no new behavior yet,
  just the plumbing.

Key learnings:
- test/storage.test.mjs does NOT enumerate COLLECTIONS explicitly (grepped,
  no match) - it only iterates the array generically, so no test file needed
  changes for this step, confirming the plan's own note that this might be
  skippable.
- Next step is step 3 in .helm-goal/plan.md: add `logReflection` and
  `reflections` (read) to src/service/api.js, near the moments()/journal()
  section, following the plan's sketched implementation almost verbatim
  (import REFLECTION_FIELDS from ../domain/reflection.js, validate at least
  one of wellDone/differently non-blank, refuse future dates via isLaterDay,
  do NOT add "reflections" to AGENT_WRITABLE). Also add a lastReflectedAt(store)
  helper mirroring lastReviewRun's shape, for step 4's nudge to use. Read
  src/service/api.js lines ~1529-2160 in full first (moments()/logMoment()/
  logEntry()/journal() plus lastReviewRun) before writing, per plan step 3's
  own instruction, since the exact reflections()/logReflection() signatures
  should match whichever call shape moments()/journal() actually use today.

## Iteration 4 — success

Summary: Register "reflections" as a storage collection in reduce.js and make its rows removable in api.js's removeRow(), completing step 2 of the reflection-feature plan, and bump the patch version.

Key changes:
- Added "reflections" to COLLECTIONS in src/storage/reduce.js, with a house-voice comment contrasting it with entries and moments
- Added "reflections" to the removable list inside removeRow() in src/service/api.js
- Bumped package.json version 0.1.71 -> 0.1.72
- Verified npm run typecheck (clean) and npm test (617/617 passing) with no other files touched

Key learnings:
- test/storage.test.mjs does not enumerate COLLECTIONS explicitly, so no test changes were needed for this step
- Next step (plan step 3) is adding logReflection and reflections (read) to src/service/api.js near moments()/journal(), plus a lastReflectedAt() helper mirroring lastReviewRun's shape; must read api.js lines ~1529-2160 in full first to match moments()/journal()'s exact call signatures before writing
- Do not add "reflections" to AGENT_WRITABLE - confirmed decision from earlier research/plan iterations still holds

## Iteration 5 — success

Summary: Add service-layer logReflection, reflections, and lastReflectedAt functions to src/service/api.js (step 3 of the reflection-feature plan), and bump the patch version.

Key changes:
- src/service/api.js: imported REFLECTION_FIELDS from ../domain/reflection.js and added a new reflection banner section with logReflection (validates at least one of wellDone/differently is non-blank, refuses future dates via isLaterDay, stores via store.create('reflections', row)), reflections(store, now, { limit, since }) returning newest-first mapped rows with an agoWords 'when' string, and lastReflectedAt(store) mirroring lastReviewRun's shape
- Did NOT add 'reflections' to AGENT_WRITABLE, per the locked-in plan decision
- package.json: bumped version 0.1.72 -> 0.1.73
- Verified npm run typecheck (clean) and npm test (617/617 passing) with no other files touched

Key learnings:
- logEntry/journal (journal.js's log/read pair) and lastReviewRun were the exact templates used, per the plan's own citation - copied their validation idiom (trim-and-null-if-blank per field, isLaterDay guard) and their agoWords-based 'when' mapping almost verbatim
- No new tests were added this iteration - plan step 7 explicitly owns test/reflection.test.mjs and the myattention.test.mjs extensions as its own step, so this iteration deliberately stayed service-layer-only per the 'do not batch several steps' instruction; existing 617 tests still pass unchanged since nothing wired these new exports into any UI/nudge path yet
- Next step is plan step 4: the myattention.js nudge signal (reflections param, i-have-not-reflected signal, low weight, no severity field) plus wiring myAttentionSignals(store, now) in api.js to pass reflections: store.rows('reflections') into myAttention(...), and adding logReflection/reflections to src/main/index.js's OPERATIONS map
- reflections() signature chosen as (store, now, { limit, since } = {}) to match the plan's sketch exactly, distinct from moments(store, now) which takes no options

## Iteration 1 — success

Summary: Add the never-critical weekly-reflection nudge signal to src/domain/myattention.js, wire reflections data through src/service/api.js's myAttentionSignals and src/main/index.js's OPERATIONS (logReflection/reflections), and bump the patch version.

Key changes:
- src/domain/myattention.js: added a reflections param to myAttention(), a new i-have-not-reflected signal (weight 20, lowest of all signals, no severity field, first-person text) gated so it never fires until real app usage (a touch or entry) is at least REFLECTION_CADENCE_DAYS old, and clears once a reflection has been logged inside the cadence window
- src/service/api.js: myAttentionSignals now passes reflections: store.rows('reflections') into myAttention(...)
- src/main/index.js: added logReflection and reflections to OPERATIONS, mirroring the existing logMoment/moments pair
- test/myattention.test.mjs: updated the 'every signal speaks in the first person' fixture's expected key list to include the new i-have-not-reflected key (the fixture's touches/entries happen to be old enough to trigger it)
- package.json: bumped version 0.1.73 -> 0.1.74
- Verified npm test (617/617 green) and npm run typecheck (clean)

Key learnings:
- This was step 4 of .helm-goal/plan.md. Step 3's service-layer functions (logReflection/reflections/lastReflectedAt) were already fully implemented in a prior iteration exactly per the plan's sketch, so this iteration only needed the myattention.js signal plus the one-line api.js wiring and the main/index.js OPERATIONS entries.
- The nudge's text must start with 'I ' (or 'My '/'Everything I '/'N% of my ') to satisfy the existing first-person regex assertion in myattention.test.mjs - an initial draft worded as 'It has been N days since I last reflected...' would have silently violated that rule; final wording is 'I have not reflected on the week in N days.'
- Adding any new myAttention signal requires updating the exact sorted-key-list assertion in test/myattention.test.mjs's 'every signal speaks in the first person' test, since that fixture's touches/entries (max age 9 days) happen to be old enough to trigger the new cadence gate and no reflections are in the fixture - this was expected per earlier iterations' notes and confirmed by actually running the suite.
- Verified by hand-tracing every other test case in myattention.test.mjs that none of them accidentally cross the REFLECTION_CADENCE_DAYS=7 gate with the new signal (all other fixtures use touches/entries no older than 6 days, or the new signal sorts below the signal under test via weight so .find()/[0] assertions are unaffected) - no other test file needed changes.
- Next step is plan step 5: half/view registration - add the 'reflection' entry to VIEWS in src/domain/halves.js (work-half only, after 'journal'), add a rail button in src/renderer/index.html after the journal button with no nav-count span, and register the new view module in src/renderer/app.js's VIEWS object and imports. Read src/renderer/app.js's exact import style for the journal view first before writing the new import line.
- Remaining plan steps after that: step 6 (src/renderer/views/reflection.js, new file), step 7 (test/reflection.test.mjs plus further myattention.test.mjs cases for fire/clear/never-critical), step 8 (E2E flow in scripts/e2e-app.mjs), step 9 (DECISIONS.md entry), step 10 (final verification pass). None of these were touched this iteration.

## Iteration 2 — success

Summary: Completed plan steps 5 and 6 together (half/view registration plus
the actual renderer view file, since registering an import to a
not-yet-existing module would break the build/typecheck), and bumped the
patch version.

Key changes:
- src/domain/halves.js: added `{ id: "reflection", name: "Reflection", hint: "how the week went", halves: ["work"] }` to VIEWS, directly after the "journal" entry, work-half only.
- src/renderer/index.html: added a `.nav-btn[data-view="reflection"]` button directly after the journal button, with a comment mirroring the journal button's "no count, deliberately" reasoning, and no `.nav-count` span.
- src/renderer/app.js: added `import * as reflection from "./views/reflection.js";` (matching the existing namespace-import style for every other view) and added `reflection` to the `VIEWS` object.
- src/renderer/views/reflection.js (new file): render() calls `tend.invoke("reflections")` and `tend.invoke("myAttention")` in parallel, finds the `i-have-not-reflected` signal (same lookup pattern as journal.js's `backlog`) and shows it inline via the existing `.mine-row`/`.mine-text` CSS classes (confirmed present in app.css) rather than inventing new markup, a header with an "Add a reflection" button, an empty state naming both questions, and a list of `<article class="card" data-reflection="...">` cards (newest first, per the service's own sort) each showing non-blank REFLECTION_FIELDS and a "Remove" button. `actions.addReflection` opens `form()` with the three REFLECTION_FIELDS as optional textareas and calls `act("logReflection", values, "Kept.")` (relies on `act()`'s existing automatic `{error}`-to-toast surfacing, confirmed by reading ui.js's `act()` - no `attempt` option needed, matching journal.js's `writeEntry`, which also doesn't use `attempt`). `actions.removeReflection` calls `act("removeRow", { collection: "reflections", id }, ...)`, no confirmation dialog, matching journal.js's `dropEntry`.
- test/mode.test.mjs: updated the hardcoded work-half view count from 10 to 11, and added `"reflection"` to the list of views asserted absent from the private half (it's work-only, so it belongs in the "gone" list alongside now/prep/focus/work/role/decisions).
- package.json: bumped version 0.1.74 -> 0.1.75.
- Verified `npm test` (617/617 green) and `npm run typecheck` (clean).

Key learnings:
- Registering a new view module in app.js's VIEWS object requires the module file to exist before typecheck/tests pass, so plan steps 5 and 6 cannot actually be split into separate iterations without leaving the tree in a broken state in between - did both in one iteration, which is a deliberate deviation from the plan's literal step boundaries but keeps every iteration's tree green as the phase rules require.
- `act()` in src/renderer/ui.js already turns any `{ error }` response from `tend.invoke` into a toast and returns null - no special-casing needed in the view for the "at least one of two fields" validation the service enforces; this resolves one of the plan's explicitly-open questions.
- `form()`'s `attempt` option (keep dialog open on failure, retry without losing typed text) exists but is NOT used by journal.js's own `writeEntry`, so `addReflection` deliberately matches that simpler precedent rather than using `attempt` - if a future iteration wants "keep the dialog open on validation failure" behavior, that would be a deviation from both journal.js and this file, not a bug.
- `.mine-row`/`.mine-text` CSS classes already exist in src/renderer/app.css (used by journal.js's backlog line) and were reused as-is with no new CSS needed.
- Changing halves.js's VIEWS array length breaks a hardcoded count assertion in test/mode.test.mjs ("gives the work half every view..." expects `viewsIn("work").length === 10`) - had to bump it to 11. Any future change to VIEWS should grep test/mode.test.mjs for hardcoded lengths first.
- Remaining plan steps: step 7 (test/reflection.test.mjs - domain + through-the-store tests; further myattention.test.mjs cases for fire/clear/never-critical/never-fires-on-fresh-install, since so far only the "every signal speaks in first person" fixture's key list was updated, not dedicated fire/clear tests), step 8 (E2E flow in scripts/e2e-app.mjs), step 9 (DECISIONS.md entry), step 10 (final verification pass including `npm run test:app`). None of steps 7-10 were touched this iteration.
- Not yet run this iteration: `npm run test:app` (the Electron E2E harness). Should be run once step 8 adds the reflection flow to scripts/e2e-app.mjs, but it would also be reasonable for a near-future iteration to run it as-is first (before step 8) just to confirm the new rail button/view doesn't break the existing E2E flow's assumptions about rail contents (e.g. any test that counts `.nav-btn` elements in the work half).

## Iteration 2 — success

Summary: Register the reflection view in halves.js/index.html/app.js and add the src/renderer/views/reflection.js UI (list + add-a-reflection form), completing plan steps 5 and 6 together, and bump the patch version.

Key changes:
- src/domain/halves.js: added a work-half-only "reflection" entry to VIEWS, directly after "journal"
- src/renderer/index.html: added a .nav-btn[data-view="reflection"] rail button after the journal button, with no nav-count span (comment mirrors journal's "no count, deliberately" reasoning)
- src/renderer/app.js: imported the new reflection view module (namespace import, matching existing style) and registered it in the VIEWS object
- src/renderer/views/reflection.js (new file): render() shows the i-have-not-reflected myAttention nudge inline via existing .mine-row/.mine-text CSS, an empty state naming both questions, and newest-first reflection cards; addReflection opens a form with the three REFLECTION_FIELDS as optional textareas (relies on act()'s existing automatic {error}-to-toast surfacing); removeReflection removes a row with no confirmation, matching journal.js's dropEntry
- test/mode.test.mjs: updated the hardcoded work-half view count (10 -> 11) and added "reflection" to the private-half exclusion list
- package.json: bumped version 0.1.74 -> 0.1.75
- Verified npm test (617/617 green) and npm run typecheck (clean); confirmed by reading scripts/e2e-app.mjs that no existing E2E check hardcodes an exact rail-button count that the new button would break

Key learnings:
- Plan steps 5 and 6 could not be split across iterations without leaving the tree broken (app.js's import of the new view module requires the file to exist for typecheck/tests to pass), so both were done together in one iteration - a deliberate, justified deviation from the plan's literal one-step-per-iteration instruction, done to keep every iteration's tree green.
- act() in src/renderer/ui.js already converts any {error} response from tend.invoke into a toast automatically and returns null - resolves the plan's open question about error surfacing; no special client-side validation needed for the 'at least one of wellDone/differently' rule the service enforces.
- form()'s attempt option (keep dialog open on failure) exists in ui.js but journal.js's own writeEntry does not use it, so addReflection deliberately matches that simpler existing precedent instead.
- .mine-row/.mine-text CSS classes already exist in app.css (used by journal.js's backlog line) and were reused as-is, no new CSS needed.
- Changing halves.js's VIEWS array length breaks a hardcoded count assertion in test/mode.test.mjs ('gives the work half every view...' expected exactly 10) - had to bump it to 11; any future VIEWS change should grep test/mode.test.mjs for hardcoded lengths first.
- Remaining plan steps: step 7 (new test/reflection.test.mjs domain+service tests, plus dedicated myattention.test.mjs fire/clear/never-fires-on-fresh-install/never-critical test cases beyond the incidental key-list update already done in a prior iteration), step 8 (extend scripts/e2e-app.mjs with an add-a-reflection-and-see-it-listed flow, then run npm run test:app), step 9 (DECISIONS.md entry), step 10 (final full verification pass: npm test, npm run typecheck, npm run test:app all green). npm run test:app itself was not run this iteration (no new E2E flow was added yet, and reading the script confirmed no existing check would break from the new rail button).

## Iteration - success (plan step 7)

Summary: Added test/reflection.test.mjs (domain hasContent tests plus a full
"through the store" describe block for logReflection/reflections/
lastReflectedAt/removeRow) and extended test/myattention.test.mjs with a
dedicated "how the week went" describe block covering fire/clear/re-fire/
never-critical/ordering, completing plan step 7, and bumped the patch version.

Key changes:
- test/reflection.test.mjs (new): mirrors test/journal.test.mjs's shape -
  a domain describe block (REFLECTION_FIELDS names/labels/hints, hasContent
  including the deliberate "notes alone still counts as hasContent even
  though logReflection refuses to store notes-only" contrast) and a
  "through the store" describe block using openStore in a tmp dir: refuses
  blank, refuses notes-only, accepts wellDone-alone/differently-alone/both,
  refuses a future date, reflections() newest-first, reflections() limit/
  since, lastReflectedAt() tracks the max, removeRow works, and logging a
  reflection never reaches api.attention()'s needsYou/nudges (mirrors
  journal.test.mjs's own "does not reach the Now view" test).
- test/myattention.test.mjs: added a new "how the week went" describe block
  with 5 tests - stays quiet on a fresh install (no aged activity), fires
  once activity is older than REFLECTION_CADENCE_DAYS and nothing has ever
  been written, clears once a reflection lands inside the cadence window,
  fires again once a kept reflection ages past the cadence, and an ordering
  test that asserts the signal always sorts last among whatever else fires
  (weight 20 is the lowest) plus asserts `"severity" in signal` is false.
  The existing "every signal speaks in the first person" test already
  exercised the key (from a prior iteration's fixture) so no change was
  needed there.
- package.json: bumped version 0.1.75 -> 0.1.76.
- Verified npm test (635/635 green, up from 617 - 18 new tests) and
  npm run typecheck (clean). Grepped both new/edited test files for the
  em-dash character to confirm none slipped in.

Key learnings:
- myAttention()'s returned array is genuinely sorted descending by weight
  (`return signals.sort((a, b) => b.weight - a.weight)` at the end of the
  file) - confirmed by reading the file before writing the ordering test,
  so `signals[signals.length - 1]` being the reflection signal whenever
  anything else fires is a real invariant, not a coincidence of the fixture.
- test/storage.test.mjs does not enumerate COLLECTIONS anywhere (grepped,
  zero matches) - confirmed again, no change needed there, matching every
  earlier iteration's finding.
- Remaining plan steps: step 8 (extend scripts/e2e-app.mjs with an
  add-a-reflection-and-see-it-listed flow in work-half mode, then run
  `npm run test:app` unpackaged and iterate on selectors/timing until
  green - the plan explicitly budgets more than one iteration for this if
  needed), step 9 (DECISIONS.md entry, dated 2026-08-30, in the file's
  existing bold-lead-in voice, covering why prompt-based not diary/why not
  journal.js/why the nudge lives in myattention.js/why no MCP tool - see
  the plan's own step 9 section for the exact content outline), step 10
  (final verification pass: npm test + npm run typecheck + npm run
  test:app all green, then confirm goalReached). `npm run test:app` itself
  has still never been run in this whole build - it should be run as-is
  once early in step 8's iteration (before adding the new E2E section) to
  confirm the reflection rail button/view do not break any existing E2E
  assumption, per the note two iterations ago that this was still an open
  check.

## Iteration 3 — success

Summary: Add test/reflection.test.mjs (domain + through-the-store tests) and extend test/myattention.test.mjs with fire/clear/re-fire/never-critical/ordering tests for the weekly-reflection nudge, completing plan step 7, and bump the patch version.

Key changes:
- test/reflection.test.mjs (new): domain describe block for REFLECTION_FIELDS shape and hasContent, plus a 'through the store' describe block covering logReflection validation (blank refused, notes-only refused, wellDone/differently/both accepted, future date refused), reflections() newest-first/limit/since, lastReflectedAt(), removeRow, and confirming a reflection never reaches api.attention()'s needsYou/nudges
- test/myattention.test.mjs: added a 'how the week went' describe block with 5 tests (quiet on fresh install, fires after cadence-aged activity with nothing written, clears once logged, fires again once stale, and an ordering test asserting the signal always sorts last with no severity field)
- package.json: bumped version 0.1.75 -> 0.1.76
- Verified npm test (635/635 green, up from 617) and npm run typecheck (clean); grepped new/edited files for em-dashes (none found)

Key learnings:
- myAttention()'s returned signals array is genuinely sorted descending by weight (confirmed in source), so asserting the reflection signal is always last among whatever else fires is a real invariant worth testing, not fixture luck
- test/storage.test.mjs still does not enumerate COLLECTIONS anywhere (re-grepped, confirmed again) - no change needed there
- Remaining plan steps: step 8 (extend scripts/e2e-app.mjs with an add-a-reflection-and-see-it-listed flow in work-half mode, then run npm run test:app and iterate on selectors/timing - budget more than one iteration if needed; also run npm run test:app once as-is first since it has never been run yet in this whole build, to confirm the existing reflection rail button/view don't break any current E2E assumption), step 9 (DECISIONS.md entry dated 2026-08-30 in the file's existing bold-lead-in voice), step 10 (final verification: npm test + npm run typecheck + npm run test:app all green, then goalReached can be true)
- The .helm-goal/notes.md file already had a large uncommitted trim applied before this iteration started (visible in git status at the start) - this is expected context-budget housekeeping from the harness, not something this iteration caused or should revert
