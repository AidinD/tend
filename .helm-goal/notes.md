# Goal orchestrator notes

This file is the ONLY continuity mechanism between iterations — each
iteration runs in a fresh subprocess with no conversation memory. See
DECISIONS.md / PLAN.md (Fas 3 Point 11) in the Helm repo for why.

---

# RESEARCH ITERATION - reflection feature

Full codebase read for the reflection-feature goal. Below is everything the PLAN
iteration needs; no further exploratio

[... earlier notes truncated - context fill crossed the 40% budget, older narrative dropped to keep future iterations' prompts small; durable key learnings preserved above ...]

raph comment
explaining why it exists and how it differs from neighbors - same voice
needed here). Only ONE new collection (no companion notes/chases table).
Suggested comment, contrasting with "entries" (the day, never prompted, about
everywhere the day went) and "moments" (one interaction with named people):

  A short, prompted look back at how the last week or so went - what went
  well, what he would do differently. Not the day, which is a nightly
  retrospective that never prompts and is about everywhere the day went; not
  a moment, which is one interaction with named people. This is about
  himself, occasional by design, and asks two or three fixed questions rather
  than inviting a diary.

Also add "reflections" to api.js's removeRow() removable list (currently
lines ~1294-1317 in the read portion) - the comment already on that list
explains a past bug where forgetting a collection there left a dead Remove
button; do not repeat that mistake.

## Service layer: src/service/api.js - NOT FULLY READ (only lines 1-1528 of
2792 total). MUST read lines 1529-2792 before writing code, specifically:
- The exact implementation of logEntry (to mirror validation style for
  logReflection - journal.js's philosophy is "everything optional, including
  all of it," which is DIFFERENT from logMoment's "part is required" rule;
  decide whether logReflection requires at least one field non-blank the way
  logEvidence/logMoment refuse pure-empty writes, or allows a fully-empty row
  the way logEntry apparently might. Recommend: require at least one of the
  two primary fields non-blank, matching hasContent's spirit, returning
  { error: "..." } otherwise - consistent with logEvidence's "Evidence needs
  text" and logMoment's "part in it" required-field pattern, since a
  fully-blank reflection row is pointless in a way a fully-blank day entry
  arguably still marks "a day happened."
- lastReviewRun's exact body (referenced at line 117 and 2097) - copy its
  shape exactly for a new lastReflectedAt helper.
- journal(), reviews(), keepReview(), vocabulary() (this last one is what
  app.js's applyHalf() consumes for half/views/relations/personBlocks/home -
  confirm it wraps halves.js's viewsIn/homeViewIn/personBlocksIn/
  relationOptionsIn/defaultRelationIn so a new work-half view just needs an
  entry in halves.js's VIEWS array to show up there, OR whether api.js's
  vocabulary() has its own hand-copied logic that also needs updating).

Two new exported functions needed in api.js:
1. logReflection(store, { wellDone, differently, notes, at, now }) - validate
   (see above), reject future dates via isLaterDay (same rule logMoment/
   logTouch/markRaised already enforce - "nothing here logs something that
   has not happened yet"), store.create("reflections", {...}), return
   { id, logged: ... }.
2. reflections(store, { limit, since, now }) - read, newest-first (sort by at
   descending, tie-break by _at like moments.js's byNewestMoment if two share
   a timestamp - probably unnecessary here since `at` will usually be
   Date.now()-precise, but check goal's "newest-first" requirement is met
   either way). Return plain objects: { id, at, when (agoWords), wellDone,
   differently, notes }. Mirror moments(store, now)'s shape/simplicity - no
   person filtering needed (reflections have no people).

Do NOT add "reflections" to AGENT_WRITABLE (line 74: currently ["promises",
"touches", "evidence"]) - a reflection is the owner's own retrospective, not
something an agent should be creating on the user's behalf; keep it strictly
app-only for writing, matching how logEntry/logMoment (private/self journal
material) have NO MCP write tool at all today (confirmed by reading tools.js
in full: no tend_log_entry, no tend_log_moment, no tend_journal-write of any
kind exists - only tend_journal [read] and tend_reviews [read] exist for that
whole area). This is the strongest, most consistent precedent: self-directed
personal material in this app is never written via MCP.

## MCP exposure decision (src/mcp/tools.js)

tools.js was read in FULL. Confirmed: entries and moments (the two other
purely-self, no-other-person, unprompted personal-record collections) have
ZERO MCP surface - not even a read tool exists for "moments," and "entries"
only surfaces indirectly via tend_journal (which bundles entries + counts +
focus cost) and tend_reviews (kept readings), never raw. Reflection is
structurally closest to moments/entries (self-directed, no named people, not
operationally useful to an agent running the job day-to-day) rather than to
signals/growth/decisions/topics (which DO have MCP tools because an agent
plausibly needs them to help run the job for someone else, or to propose
things). RECOMMENDATION: give reflection NO MCP tool at all - matches moments
exactly, and sidesteps the awkwardness of an agent reading/writing the user's
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
