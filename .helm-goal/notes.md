# Goal orchestrator notes

This file is the ONLY continuity mechanism between iterations - each
iteration runs in a fresh subprocess with no conversation memory. See
DECISIONS.md / PLAN.md (Fas 3 Point 11) in the Helm repo for why.

---

## RESEARCH findings (2026-08-30)

Repo root for this goal: `D:\Repo\Tools\tend-worktrees\goal-0131edd7-70d7-4915-8dd9-b57521be9ee5`
(a worktree - do NOT touch `.claude/worktrees/`, that's unrelated).

### src/renderer/views/growth.js - exact current shape

`prepareFields(values = {}, opening = false)` (line ~210-293):
- builds `fields = []`
- `if (opening)` block (line 223-234) currently pushes only the `aim` field
  already (required, textarea, hint about "their own answer comes later").
  BUT there is no `return fields` after it, so execution falls through to
  the unconditional `fields.push(driver, need, ifNothingChanges, alreadySeen,
  offering)` block (lines 236-290), which always runs regardless of `opening`.
  This is the bug REQUIRED CHANGE 1 targets: add `return fields;` right after
  the `if (opening) { fields.push({aim...}); }` block, so opening truly stops
  at one field. Also append a sentence to the aim field's `hint` saying the
  rest (driver, what you've already seen, what you're putting in) can wait
  until "Prepare" on the card.
- When `opening` is false, keep everything as-is (used by `threadPrepare`,
  line ~484-502, which calls `prepareFields(current.fields)` with opening
  defaulted false - must stay untouched/unaffected).

`actions.openThread` (line ~409-430): the `form({...})` call's `intro` (line
414-416) currently reads: "Your own preparation, in four questions. What THEY
want comes in a second form after you have asked them - a plan filled in
alone at your desk is a plan you wrote for them." -> REQUIRED CHANGE 2: shorten
to say opening only needs one sentence, and the rest (whether they want it or
the job needs it, what you've seen, what you're putting in) comes later via
"Prepare" on the card whenever there's an answer.

Note: `threadPrepare`'s own form intro (line ~492) already says "Your side of
it. Reopened where you left it rather than asking again." - fine as-is, no
change needed there.

### src/service/api.js

`openThread` (line 2405) only requires `aim` - confirmed, matches the goal's
premise. No change needed there.

### test/growth.test.mjs

Checked all `api.openThread(...)` call sites (lines 295, 311, 316, 357, 358,
413, 422, 434, 497, 521, 572). None require driver/need/etc at open time -
they either only pass `aim` (+ person/now), or pass driver/need directly to
the SERVICE call (bypassing the renderer's `prepareFields` entirely, since
this is a domain/service-level test, not a UI test). Test at line 311 asserts
opening with blank aim fails ("one sentence"); line 315-318 asserts
`missing.prepare` is non-empty when only aim given - this is exactly the
"missing() surfaces it" mechanism the goal describes. Conclusion: no changes
needed in test/growth.test.mjs. (Re-verify quickly in the implement phase but
this looks solid.)

### scripts/e2e-app.mjs - the section to restructure

`step("A direction for somebody")` starts at line 1022. Current flow:
1. Navigate to person page, click `[data-act="openThread"]` (line 1039).
2. Immediately calls `page.dialogOptions("driver")` and asserts wants/needs/unknown
   options exist (lines 1040-1048) - THIS WILL BREAK once change 1 lands,
   since the driver select won't be in the open dialog anymore.
3. Asserts dialog text has "What you think the direction is" and does NOT have
   "What do you think the direction is" (lines 1050-1062) - reusable almost as-is,
   need to ALSO assert dialog does NOT contain the driver question text
   ("Do they want this, or does the job need it?") and does NOT contain "in
   their words" (currently a separate check at 1064-1068 already checks "in
   their words" not present - can keep, just re-verify after restructure).
   Need to add assertion for a "can wait" type phrase per the goal (the new
   hint sentence added in change 1).
4. Checks `need` field hidden (lines 1073-1080) - needs to move to the
   Prepare dialog since need field won't exist in openThread dialog anymore.
5. Simulates picking driver="needs" via raw DOM event dispatch (lines
   1082-1087), checks need+ifNothingChanges reveal (1089-1097), checks
   "What happens if nothing changes" text present with "this is a wish"
   (1099-1107) - ALL of this needs to move to run against the `threadPrepare`
   dialog instead (opened via `[data-act="threadPrepare"]` on the new thread's
   card), per REQUIRED CHANGE 3.
6. `page.fillDialog({aim, driver, need, ifNothingChanges, alreadySeen, offering})`
   all at once (lines 1109-1116) - this call fills the OPEN dialog which after
   the change only has `aim`. Must split: first `fillDialog({aim: "Leder
   designgenomgången utan mig i rummet"})` on the open dialog, wait for thread
   to appear (`document.body.textContent.includes('designgenomgången')` per
   line 1117), THEN click `[data-act="threadPrepare"]` on the new thread's
   card and fillDialog with driver/need/ifNothingChanges/alreadySeen/offering
   there, waiting for e.g. "flaskhals" substring (present in
   ifNothingChanges Swedish text: "jag ar kvar som flaskhals och han star
   still" - good candidate to wait on, per the goal's suggestion) before
   continuing.
7. Lines 1119-1157 do assertions on the panel after the thread is created
   (no "It came up" yet, "After the conversation" offered, aim text present,
   "Ask them" posed message, no "I saw it" yet) - these read the panel AFTER
   both dialogs are filled, so should still work UNCHANGED as long as by that
   point both dialogs have been submitted (aim via open, rest via Prepare).
   Just need to make sure the ordering/waits are right - these checks currently
   sit between the single fillDialog call and `page.click('[data-act="threadAsked"]')`
   at line 1159, so after restructuring they should sit after the Prepare
   dialog's fillDialog+wait, in the same relative order.
8. From line 1159 (`threadAsked` click) onward - unchanged, per the goal.

Exact Swedish strings currently used (reuse verbatim, note å/ä/ö preserved):
- need: "teamet stannar av nar jag ar borta" (with a-with-diaeresis chars as in file)
- ifNothingChanges: "jag ar kvar som flaskhals och han star still"
- alreadySeen: "tog over retrot i juni utan att bli tillfragad"
- offering: "arkitekturgenomgangen, och jag slutar skriva migreringsplanen sjalv"
- aim: "Leder designgenomgangen utan mig i rummet"
(Read the actual file for exact accented characters - do not retype from
memory in the implement phase, copy the literal source lines instead.)

Helper methods used: `page.click`, `page.text`, `page.waitFor`, `page.evaluate`,
`page.dialogOptions`, `page.fillDialog` - all defined elsewhere in
scripts/e2e-app.mjs (or a shared harness module); did not need to modify them,
only call them in a different order/split.

### Other grep results - old dialog text elsewhere

Grep for phrases like "four questions", "whose need is it", "What happens if
nothing changes", "already seen them do", "What are you putting in" matched
only: src/renderer/views/growth.js (the source, to be edited),
src/domain/growth.js (worth double-checking exact match context - likely just
shares wording in `missing()`'s generated nudge text, which is fine/expected
to keep, not the open-dialog text), and scripts/e2e-app.mjs (the E2E test,
to be restructured). No docs (PLAN.md/DECISIONS.md/README) reference the old
4-question open dialog by name - DECISIONS.md's most recent entry (2026-08-26,
"A form asks each question once, and only where it applies") discusses the
OLD bug fix (duplicate direction question) and is a separate, still-valid
decision; don't touch it, just add a NEW entry above it (newest-first).

### DECISIONS.md format

File starts with "# Decisions", then "Newest first. Each entry: the date, what
was decided, what else was considered, and why this won.", then entries
starting "## <date> - <short title>" followed by "**Bold lead phrase.** prose...".
New entry should go directly after that preamble, before the existing
2026-08-26 entry. Use today's date (2026-08-30) per system context. Must not
mention any person's name or describe the owner's personal situation - keep it
about the mechanism (service already required only `aim`; `missing()` already
nudges; `Prepare` dialog already existed to carry the rest) per the goal's
DOCUMENT instruction.

### Versioning

package.json version is currently "0.1.70" - bump patch to "0.1.71" as part of
the commit (per project rule: bump patch on every commit that touches
package.json's version field).

### Verification commands (from CLAUDE.md)

- `npm test` - unit tests (test/growth.test.mjs is part of this).
- `npm run typecheck` - JSDoc type check.
- `npm run test:app` - E2E harness (scripts/e2e-app.mjs), launches its own
  Electron instance; must point `TEND_DATA_DIR` at a scratch dir, but the npm
  script likely already handles this. Goal says "work-half mode" - check how
  test:app is invoked with a mode flag (grep package.json scripts and
  e2e-app.mjs arg parsing for "work" mode / half selection in the
  implement/verify phase).

### Recommended approach for IMPLEMENT phase

1. Edit `prepareFields` in growth.js: add `return fields;` after the `if
   (opening)` block, extend the aim field's `hint` string with the
   "rest can wait until Prepare" sentence.
2. Edit `actions.openThread`'s form `intro` string to the shortened version.
3. Restructure scripts/e2e-app.mjs lines ~1039-1116 (approximately) per point
   6 above: split into an open-dialog phase (assert reduced content, fill
   only aim, wait for thread) and a Prepare-dialog phase (click
   threadPrepare, run the driver/showIf/need/ifNothingChanges checks there,
   fill all five remaining fields, wait for "flaskhals" or similar Swedish
   substring). Keep everything from `threadAsked` (line 1159) onward
   unmodified - those checks read `.panel`/`.thread` text that should be
   unaffected as long as both dialogs are submitted before that point.
4. Double-check test/growth.test.mjs needs no changes (research above
   suggests none needed, but re-verify quickly).
5. Add DECISIONS.md entry (newest-first, right after preamble).
6. Bump package.json version 0.1.70 to 0.1.71.
7. Run `npm test`, `npm run typecheck`, `npm run test:app` (work-half mode -
   find exact invocation) and fix anything red before considering this done.
8. Do not commit - the orchestrator commits after each iteration; the plan
   and implement phases should make the actual edits and run verification,
   this research phase only wrote notes and touched no other file.

## Iteration 1 — success

Summary: Researched growth.js, api.js, growth.test.mjs, and e2e-app.mjs to map out exactly what the simplify-the-open-dialog goal requires and wrote detailed findings/recommended approach to .helm-goal/notes.md.

Key changes:
- No code changes - this was a read-only research iteration; only .helm-goal/notes.md was updated

Key learnings:
- prepareFields' opening branch already pushes only the aim field but is missing a `return fields;`, so it falls through to push driver/need/ifNothingChanges/alreadySeen/offering anyway - that's the actual bug to fix
- test/growth.test.mjs's openThread calls go straight through the service layer (not prepareFields), and already only require aim / already assert missing.prepare is populated - no changes needed there
- e2e-app.mjs 'A direction for somebody' step (starts line 1022) needs restructuring: open-dialog assertions/fill move to just aim, then click threadPrepare on the new card and run the driver/showIf/consequence checks and remaining fields there before continuing to threadAsked (line 1159) unchanged
- Exact Swedish test strings and their accented characters must be copied verbatim from the source file in the implement phase, not retyped from memory
- package.json version is 0.1.70, needs bumping to 0.1.71 on commit
- DECISIONS.md is newest-first with a fixed preamble; new entry goes directly after the preamble, before the existing 2026-08-26 entry
- No other docs/scripts reference the old 4-question dialog besides growth.js and e2e-app.mjs themselves
