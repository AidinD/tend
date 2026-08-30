# Goal orchestrator notes

This file is the ONLY continuity mechanism between iterations — each
iteration runs in a fresh subprocess with no conversation memory. See
DECISIONS.md / PLAN.md (Fas 3 Point 11) in the Helm repo for why.

---

# RESEARCH ITERATION - reflection feature

Full codebase read for the reflection-feature goal. Below is everything the PLAN
iteration needs; no further exploratio

[... earlier notes truncated - context fill crossed the 40% budget, older narrative dropped to keep future iterations' prompts small; durable key learnings preserved above ...]

 of an agent reading/writing the user's
own private retrospective. If the BUILD phase decides a read-only
tend_reflections tool adds real value (e.g. so an agent asked "how did my
week go" can answer), it should be modeled tightly on tend_reviews (read-only,
description explains why there's no write equivalent) - but the default,
lower-risk choice consistent with existing precedent is to add none. This is
a judgment call the PLAN phase should make explicitly and record its
reasoning for (either choice is defensible; do not skip deciding).

## Half placement: WORK half only

src/domain/halves.js VIEWS array (lines 191-202) needs a new entry, work-half
only, e.g.:
  { id: "reflection", name: "Reflection", hint: "how the week went", halves: ["work"] }
personBlocksIn() (lines 249-282) does NOT need a new field - reflections are
not shown per-person (no person association at all), so this is a page-level
view, not a person-page block, same category as "journal"/"decisions"/"role"
rather than like "growth"/"topics" (which key off personBlocksIn).

## UI wiring - OPEN QUESTION, requires reading files not yet read this iteration

NOT YET READ (must read before PLAN finalizes UI wiring):
- The nav rail's HTML (likely src/renderer/index.html or similar) - app.js's
  applyHalf() (lines 202-267) REMOVES .nav-btn elements not in the half's view
  list, which strongly implies ALL possible nav buttons are hand-written in
  HTML upfront and JS only prunes/keeps them. If true, adding a standalone
  "Reflection" nav entry requires hand-editing that HTML file too, not just
  halves.js and app.js's VIEWS object (app.js line 33).
- src/renderer/ui.js - for the exact signatures of form()/act()/esc()/tend
  helpers every view uses (seen used, not seen defined).
- src/service/api.js lines 1529-2792 (see above).
- scripts/e2e-app.mjs in full (only lines 1-140 of a much longer file read;
  grep shows a journal-view flow around lines 1579-1650 with
  `.click('[data-act="writeEntry"]')` - this is the closest template for the
  new "add a reflection, see it listed" E2E flow the goal requires. Must read
  that whole block plus the file's helper functions (typeInto, waitFor, etc.
  - names guessed, not confirmed) before writing the new E2E section.

Given Tend's own precedent of NOT giving small features their own nav
button - topics live only on prep cards, moments live as a sub-section
inside journal.js rather than their own nav entry - RECOMMEND the PLAN phase
lean toward folding reflection into an existing view (most likely "now.js" as
a new low-key section near "My month," or possibly its own file that is
reached via a button rather than a rail entry) UNLESS reading index.html shows
adding a rail button is trivial/cheap and the goal's explicit phrasing ("a
small view... own file... or folded into an existing view... your call")
leaves this genuinely open. Weigh implementation cost (new nav button means
editing HTML + halves.js + app.js + CSS potentially) against discoverability
(a feature meant to be used "occasionally" doesn't need to be one click away
permanently). Either is defensible; decide explicitly in the PLAN step rather
than deferring further.

## DECISIONS.md - style notes for the new entry

Format: newest entries at TOP, right after the file's one-paragraph intro
(before the existing "## 2026-08-26" entries). Heading format:
`## 2026-08-30 - <short title>` (today's date, confirmed via system context).
Voice: bold lead-in phrases ("**Decided.**", "**What it is not.**", "**Why
X.**"), plain prose paragraphs after each, hyphen " - " (never an em dash,
per both CLAUDE.md's explicit rule and the file's own consistent usage
throughout). The existing growth.js decision entry uses "he"/"his" to refer to
the app's single hypothetical user in the abstract (e.g. "his own part,"
"his career") - this is established house style for describing the
mechanism's rationale in general terms, NOT a real name or real situation, so
continuing to use "he"/"his" generically is fine and matches precedent; what
must be avoided is anything identifying a real person, employer, or the
owner's actual situation (per the goal's explicit instruction).

Entry should cover: why prompt-based instead of a diary (the growth.js "Why
this is not a development plan" reasoning, restated for this smaller
feature); why deliberately separate from the private journal/review
(different subject - one's about interactions with named people and the
owner's part in them, this is wholly self-directed and names nobody); why the
nudge lives in myAttention rather than as a new critical-capable path (ties to
the DECISIONS.md growth entry's existing "not in My month either... a
question about a thread is not about him" passage - this feature is the
mirror case: it IS about him, so myAttention is exactly right this time).

## Versioning

package.json currently "version": "0.1.70". Per this project's rule ("bump
the patch on every commit... do not touch minor/major") and given the
per-iteration commit model this orchestrator uses (each iteration's diff
becomes its own commit), EVERY future iteration in this goal that changes
tracked files should bump package.json's patch version by exactly 1 as part
of that iteration's own diff - not saved for a single final iteration. This
research iteration made no code changes, so no bump was made here; the first
BUILD-phase iteration that touches any tracked file should bump 0.1.70 ->
0.1.71, the next such iteration -> 0.1.72, and so on.

## Test files - full current list (test/*.test.mjs)

contact, domain, growth, harness, journal, knowledge, ledger, mode, model,
myattention, nibsync, parse, people, practices, prep, review, service,
signals-workstreams, skips, stakes, storage, tagrules, topics, waiting, watch.
No moments-specific or reflection-specific file exists yet. Grepped
test/service.test.mjs for "logMoment"/"describe(" and got no matches at all -
either logMoment/moments tests live in a file not grepped correctly, or they
are genuinely untested at the service layer today (domain-level journal tests
may cover the underlying hasContent/entriesSince logic instead, with
moments/logMoment covered only by the E2E script). PLAN/BUILD phase should
grep more broadly (across all test/*.mjs, not just service.test.mjs) for
"logMoment" before concluding there is no precedent to follow, but should not
be blocked by this - a new test/reflection.test.mjs (domain-level, mirroring
test/journal.test.mjs and test/growth.test.mjs in structure) plus targeted
additions to test/service.test.mjs (logReflection/reflections validation) and
test/myattention.test.mjs (new signal fires/clears, stays first-person, gets
added to the fixture's expected key list) is sufficient to satisfy the goal's
"unit tests for the domain/service layer... nudge/cadence logic fires and
clears... nothing here ever reaches critical/Now severity" requirement. Also
check test/storage.test.mjs for whether it enumerates COLLECTIONS explicitly
(grep for "COLLECTIONS") - if so it needs "reflections" added there too.

## Concrete file touch-list for BUILD phase (summary)

1. src/domain/reflection.js - NEW. Fixed fields, hasContent, cadence const,
   house-style doc comment.
2. src/storage/reduce.js - add "reflections" to COLLECTIONS with comment.
3. src/service/api.js - add logReflection, reflections (read), a
   lastReflectedAt helper; extend myAttentionSignals to pass reflection data
   into myAttention(); add "reflections" to removeRow's removable list.
4. src/domain/myattention.js - add the nudge signal (first-person text, new
   key), new function parameter(s) for reflection data.
5. src/main/index.js - add logReflection/reflections to the OPERATIONS map
   (mirror logMoment/moments, lines 164-166).
6. src/renderer/views/reflection.js (new) OR a section folded into an
   existing view (now.js most likely) - TBD after reading index.html/rail
   markup; list + add-a-reflection form.
7. src/renderer/app.js - register new view in the VIEWS object (line 33) IF
   a standalone view is chosen.
8. Nav rail HTML (location TBD - read index.html first) - new .nav-btn IF a
   standalone view with its own rail entry is chosen.
9. src/domain/halves.js - add the view entry to VIEWS array (work-half only)
   IF a standalone view is chosen; skip entirely if folded into now.js.
10. src/mcp/tools.js - most likely NO new tool (see reasoning above); if the
    PLAN phase decides otherwise, a single read-only tend_reflections tool
    modeled on tend_reviews.
11. test/reflection.test.mjs - NEW, domain unit tests.
12. test/service.test.mjs - add logReflection/reflections tests.
13. test/myattention.test.mjs - extend for the new signal (fixture, expected
    key list, first-person regex already covers correctly-phrased text).
14. test/storage.test.mjs - add "reflections" wherever COLLECTIONS is
    enumerated, if it is.
15. DECISIONS.md - new dated entry at the top (2026-08-30), see style notes
    above.
16. package.json - bump patch version by 1, in the SAME iteration as any
    other tracked-file change (see Versioning section above), every time.
17. scripts/e2e-app.mjs - extend with a short flow: navigate to wherever
    reflection lives, add one, assert it appears in the list. Template:
    the journal-view flow around lines 1579-1650 (`data-act="writeEntry"`).

## Open decisions the PLAN phase must make explicitly (not yet resolved)

- Standalone reflection view vs. folded into an existing view (now.js is the
  leading candidate if folding in) - read index.html/rail markup first.
- Final field names/wording (wellDone/differently/notes are this iteration's
  placeholder suggestions).
- Whether MCP gets a read-only tool or nothing (leaning nothing).
- Exact nudge interval in days (leaning 7).
- Exact validation rule for logReflection (leaning: require at least one of
  the two primary fields non-blank).

## Iteration 1 — success

Summary: Researched the Tend codebase (growth.js, journal.js, signals.js, myattention.js, topics.js, halves.js, attention.js, reduce.js, api.js, tools.js, seed.js, now.js, app.js, DECISIONS.md) and wrote detailed findings, a recommended architecture, and an open-questions list for the reflection feature to .helm-goal/notes.md.

Key changes:
- Appended a large research section to .helm-goal/notes.md (no code files touched, as required for this read-only phase)

Key learnings:
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

## Iteration 2 — success

Summary: Wrote a concrete, step-by-step implementation plan for the reflection feature to .helm-goal/plan.md, resolving all open design questions left by the research iteration.

Key changes:
- Created .helm-goal/plan.md with 10 ordered implementation steps (domain module, storage collection, service layer, myattention nudge, halves/view registration, renderer view, unit tests, E2E flow, DECISIONS.md entry, final verification)
- Locked in decisions the research iteration left open: standalone 'Reflection' rail view (own nav-btn after 'The day', no nav-count) rather than folding into now.js/work.js; no MCP tool at all (matches entries/moments precedent); nudge lives in myattention.js as a new low-weight, severity-less signal; field names wellDone/differently/notes; validation requires at least one of the two primary fields
- No other code files were modified this iteration, per the PLAN phase's read-only constraint

Key learnings:
- Nav buttons are hand-authored in src/renderer/index.html (confirmed by reading it) and pruned per-half by app.js's applyHalf() - adding a standalone view requires editing index.html, halves.js VIEWS, and app.js's VIEWS object together.
- journal.js is the ideal UI template: its 'no nav-count, own rail slot, occasional habit' pattern and its writeEntry/entry()/dropEntry action shapes map almost directly onto the new reflection.js view.
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
