# Plan: Simplify "Open a direction" dialog

Goal recap: opening a growth thread should ask only `aim`; everything else
moves to the existing "Prepare" dialog. Fix the E2E test that assumed the old
6-question open dialog. See `.helm-goal/notes.md` for full research (exact
line numbers, exact Swedish strings, exact current text); read it before
starting, it has already located everything precisely.

Work through these steps ONE AT A TIME (one per `implement` iteration). Each
step should leave the repo in a coherent, testable state.

## Step 1: Fix `prepareFields` in src/renderer/views/growth.js
- In `prepareFields(values = {}, opening = false)`, find the `if (opening)`
  block that pushes the `aim` field.
- Add `return fields;` as the last line inside/after that `if (opening)`
  block, so opening truly stops at one field (currently it falls through to
  push driver/need/ifNothingChanges/alreadySeen/offering regardless).
- Extend the `aim` field's `hint` string with an added sentence saying the
  rest (driver, what you've already seen, what you're putting in) can wait
  until "Prepare" on the card.
- Do NOT touch anything below that early return; the non-opening path (used
  by `threadPrepare`) must keep pushing the full field set unchanged.
- Verify: read the edited function back and confirm structurally that
  `opening === true` produces a 1-element fields array and `opening === false`
  produces the original full array.

## Step 2: Shorten the `openThread` action's intro text
- In `actions.openThread`'s `form({...})` call (same file), replace the
  `intro` string with a short version: opening only needs one sentence (the
  aim), and the rest (whether they want it or the job needs it, what you've
  seen, what you're putting in) comes later via "Prepare" on the card
  whenever there's an answer.
- Do not change `threadPrepare`'s own intro text; it already reads correctly
  ("Your side of it. Reopened where you left it rather than asking again.").

## Step 3: Check test/growth.test.mjs
- Per research notes, this file's `openThread` calls go through the service
  layer directly (not `prepareFields`) and already only require `aim`; one
  test already asserts `missing.prepare` is populated when only aim is given.
- Quickly re-verify (grep for `openThread(` in the file) that no test expects
  driver/need to be required or present at open time. If everything checks
  out, make no changes and note that in the iteration's summary. If something
  does assume the old shape, fix it minimally.

## Step 4: Restructure the E2E test in scripts/e2e-app.mjs
This is the biggest step; consider splitting across two implement iterations
if it's large (4a: open-dialog assertions plus aim fill; 4b: Prepare-dialog
assertions plus remaining fields), but a single iteration is fine if it fits.

In `step("A direction for somebody")` (around line 1022 before edits;
re-locate by searching for that string since line numbers may drift after
step 1/2 edits):

1. After `page.click('[data-act="openThread"]')`, replace the immediate
   driver-select/showIf assertions with assertions against the now-reduced
   dialog:
   - dialog text contains "What you think the direction is" (or whatever the
     exact current aim question text is; copy verbatim from the file, do not
     retype from memory).
   - dialog text contains a "can wait"-type phrase (the sentence added in
     Step 1's hint).
   - dialog text does NOT contain the driver question text (e.g. "Do they
     want this, or does the job need it?"; copy exact string from source).
   - dialog text does NOT contain "in their words" (existing check, keep).
   - Remove/relocate the `need` field hidden check, the driver="needs"
     DOM-event simulation, and the ifNothingChanges reveal checks; these
     move to step 5 below, run against the Prepare dialog instead.
2. Call `page.fillDialog({ aim: "Leder designgenomgangen utan mig i rummet" })`
   (copy the exact accented characters from the current file's existing
   fillDialog call; do not retype from this summary).
3. Wait for the new thread to appear (e.g. wait for
   `document.body.textContent.includes('designgenomgangen')`, matching the
   existing wait pattern already in the file for this same string, again
   copying the exact accented spelling from source).
4. Click `[data-act="threadPrepare"]` on the newly created thread's card.
5. Against THAT (Prepare) dialog, run the driver-options-present check, the
   showIf-hidden-by-default check for `need`/`ifNothingChanges`, the
   showIf-reveal-when-driver="needs" check (same DOM event simulation
   approach as before, now targeting the Prepare dialog), and the "What
   happens if nothing changes" / "this is a wish" text check, reusing the
   exact same logic/strings that used to run against the open dialog.
6. Fill the Prepare dialog: `page.fillDialog({ driver: "needs", need: "...",
   ifNothingChanges: "...", alreadySeen: "...", offering: "..." })` using the
   exact same Swedish strings currently in the file (need, ifNothingChanges,
   alreadySeen, offering as they already appear in the source's existing
   fillDialog call today; copy them character-for-character rather than
   retyping from these notes, since the accented characters are easy to
   mistype).
7. Wait for evidence the Prepare data landed, e.g. wait for
   `document.body.textContent.includes('flaskhals')` (a substring already
   present inside the current `ifNothingChanges` test string) before
   continuing.
8. Leave the subsequent panel assertions (no "It came up" yet, "After the
   conversation" offered, aim text present, "Ask them" posed message, no "I
   saw it" yet) in place, now running after both dialogs are submitted, same
   relative order as before (right before `[data-act="threadAsked"]` click).
9. Everything from the `threadAsked` click onward must remain completely
   unmodified.

Verify by actually running the E2E harness at the end of this step (see Step
8 below) rather than just re-reading the diff, since DOM timing/wait
conditions are easy to get subtly wrong.

## Step 5: Grep for other stale references
- Grep the repo for phrases like "four questions", "Do they want this, or
  does the job need it", "already seen them do", "What are you putting in",
  "whose need is it" outside of src/domain/growth.js's `missing()` nudge text
  (which is fine to keep) and outside the two files already edited.
- Per research, nothing else should match, but re-run the grep after steps
  1-4 to confirm no stray doc/script still describes the old dialog. Fix
  anything found.

## Step 6: Add DECISIONS.md entry
- Insert a new entry immediately after the file's fixed preamble (before the
  existing 2026-08-26 entry), dated 2026-08-30, following the file's voice:
  `## 2026-08-30 - <short title>` then a `**Bold lead phrase.** prose...`
  paragraph.
- Content: opening a growth thread now asks one question (the aim) and
  defers the rest to "Prepare" on the card. Explain why: the service layer
  already only required `aim`; the `missing()` nudge already surfaces
  unanswered prep questions on the card; the `Prepare` dialog already existed
  to carry the rest at any later time, so the open dialog was asking for more
  than the system ever required up front.
- Do not mention any person's name or describe anyone's personal situation.
  Keep it about the mechanism.

## Step 7: Version bump
- Bump `package.json` `"version"` from `0.1.70` to `0.1.71` (patch bump per
  project convention). Check the value at execution time in case an earlier
  step already bumped it (unlikely, but check before assuming 0.1.70).

## Step 8: Full verification pass
Run, in order, and fix any failures before declaring success:
1. `npm test` (unit tests, includes test/growth.test.mjs).
2. `npm run typecheck`.
3. `npm run test:app`; check package.json scripts and e2e-app.mjs arg parsing
   for how to select "work half" mode (grep for "work" mode flag / half
   selection argument first), then run it in that mode. Point
   `TEND_DATA_DIR` at a scratch directory per CLAUDE.md rules if the script
   doesn't already do this itself.
All three must be green. This step may need to be its own implement
iteration if steps 1-7 already consumed the iteration, since it may involve
back-and-forth fixes.

## Step 9: Final review pass (can combine with Step 8)
- Re-read the full diff for English-only text, no em dashes, brace/line style
  per CLAUDE.md ("Braces and separate lines for every `if`, no one-liners").
- Confirm no changes touch `.claude/worktrees/`.
- Confirm nothing beyond what's described was added (no scope creep).

## Commit
- Once everything is green, the commit step (done by the orchestrator, not
  by an implement iteration) should use a normal commit message on `main`,
  no feature branch, no push.
