# Plan: reflection feature

Read `.helm-goal/notes.md` first - it has the research this plan is built on,
plus citations for every convention referenced below. This file makes the
remaining open decisions explicit and turns the goal into an ordered, small-
step build list. Follow the steps in order; each is sized to be one
`implement`-phase iteration. Do not batch several steps into one iteration.

Every step that touches a tracked file must also bump `package.json`'s patch
version by exactly 1 (current: `0.1.70`, so step 1 -> `0.1.71`, step 2 ->
`0.1.72`, and so on). Do not touch minor/major.

## Decisions locked in by this plan (do not re-litigate mid-build)

1. **Field names**: `wellDone` ("What went well?"), `differently` ("What would
   you do differently?"), `notes` (optional, clearly secondary - "Anything
   else"). Row shape: `{ id, at, wellDone, differently, notes }`, all string-
   or-null except `id`/`at`. No status, no lifecycle.
2. **Collection name**: `reflections`, singular concept, one row per entry.
3. **Cadence**: `REFLECTION_CADENCE_DAYS = 7` in `src/domain/reflection.js`.
4. **Validation**: `logReflection` requires at least one of `wellDone` /
   `differently` non-blank (mirrors `hasContent`'s spirit and `logEvidence`'s
   "needs text" refusal). `notes` alone, with the two primary fields blank,
   is refused with the same error - `notes` is secondary, not a way around
   the two questions the feature exists to ask. Future dates are refused via
   `isLaterDay`, same rule as `logMoment`/`logTouch`/`markRaised`.
5. **Nudge home**: `src/domain/myattention.js`, a new signal alongside
   `i-have-written-and-not-read`. Never critical - `myAttention()` signals
   have no severity field and `buildAttention()`/Now's "Needs you"/"Nudge"
   groups never see them; they render only in Now's low-key "My month" block
   and, optionally, inline on the feature's own page. This is the same
   reasoning as the existing DECISIONS.md entry "Attention signals measure
   me, and the line is in the code" (2026-08-24) - reuse that mechanism
   rather than inventing a second one, and reuse `journal.js`'s existing
   pattern of also surfacing the one relevant `myAttention` signal inline on
   the feature's own page.
6. **UI home**: a **new standalone view**, `reflection`, work-half only, with
   its own rail entry placed directly after "The day" and with **no nav
   count** - same reasoning as journal.js's rail comment: an occasional,
   never-late habit earns no badge, because a badge on it is a reproach.
   (Rejected: folding into `now.js` or `work.js`. `now.js` is deviations-only
   and reflections are not a deviation from anything; `work.js` is about
   projects/delegation, a poor conceptual fit. `journal.js` already proves
   the codebase gives a small, occasional, self-directed habit its own rail
   slot rather than forcing it into an unrelated view.)
7. **MCP**: **no new tool**. `entries` and `moments` - the two existing
   collections that are self-directed and name no other person - have zero
   MCP surface, not even read-only. Reflection is the same shape (arguably
   more private: it is explicitly about the owner's own performance) and
   nothing in the job-running surface needs it. Do not add an
   `AGENT_WRITABLE` entry either.
8. **Test placement**: mirror `test/journal.test.mjs` exactly - one new file,
   `test/reflection.test.mjs`, with a domain-level `describe` block (pure
   functions from `src/domain/reflection.js`) and a "through the store"
   `describe` block (service-level `logReflection`/`reflections` against a
   real `openStore` in a tmp dir, using the `ok`/`failed` helpers from
   `test/helpers.mjs`). Extend `test/myattention.test.mjs` for the new
   signal. Extend `test/storage.test.mjs` only if it enumerates `COLLECTIONS`
   explicitly (check first).

## Step-by-step build order

### Step 1 - domain module `src/domain/reflection.js`

New file. Nothing here touches the store (matches every other domain
module). Contents:

- A house-voice doc comment at the top, same register as `growth.js`'s "Why
  this is not a development plan" and `journal.js`'s intro. Cover, briefly:
  why this is fixed prompts and not a diary; why it is one flat log row with
  no status/lifecycle (contrast with `growth.js`'s threads, which *do* have
  a lifecycle because they track an open question over time - a reflection
  has nothing left open once it's written); why it is not `journal.js`'s day
  entry (the day is nightly, never prompted, and about everywhere the day
  went - this is weekly-ish, gently prompted, and about a narrower "how did
  the week go" question); why it is not `journal.js`'s moment (a moment
  names other people and one event; this names nobody and is about a
  stretch of time); and why it must never become critical (same line
  `growth.js` draws for growth threads - this is a pattern about the owner,
  never a fire to put out today).
- `export const REFLECTION_FIELDS = [...]` - three entries, each
  `{ name, label, hint }`, modeled on `JOURNAL_FIELDS`'s shape:
  - `{ name: "wellDone", label: "What went well?", hint: "..." }`
  - `{ name: "differently", label: "What would you do differently?", hint: "..." }`
  - `{ name: "notes", label: "Anything else", hint: "Optional, and clearly secondary to the two questions above." }`
- `export const REFLECTION_CADENCE_DAYS = 7;`
- `export function hasContent(row) { ... }` - true if any
  `REFLECTION_FIELDS` value on `row` is a non-blank string. Copy
  `journal.js`'s `hasContent` implementation pattern exactly (same blank-
  check idiom).

Do not add a "days since / is due" function here - put that arithmetic in
`myattention.js` in step 4, same as how the journal backlog signal computes
its own gap rather than journal.js exporting one. Keep this file small.

### Step 2 - storage collection

`src/storage/reduce.js`: add `"reflections"` to the `COLLECTIONS` array,
after `"moments"` (the list's last entry), with a comment in the same voice
as its neighbors - one paragraph, contrasting with `entries` and `moments`
specifically since those are the two nearest concepts. Something close to:

```
/**
 * A short, occasionally-prompted look back at how the last week or so went -
 * what went well, what he would do differently. Not the day, which is a
 * nightly retrospective that never prompts and is about everywhere the day
 * went; not a moment, which is one event with named people. This names
 * nobody and asks two or three fixed questions on purpose, so it stays a
 * log rather than becoming the diary this app otherwise avoids.
 */
"reflections"
```

Adjust wording to fit but keep the contrast with both `entries` and
`moments` explicit, since that is the non-obvious part.

Also in this step: add `"reflections"` to the `removable` list inside
`removeRow()` in `src/service/api.js` (around line 1298-1317) - the comment
already there explains why a forgotten collection leaves a dead Remove
button; add reflections in reading order (after `"moments"` is fine).

Run `npm test` after this step - no behavior changed yet, just confirms
nothing broke.

### Step 3 - service layer: `logReflection` and `reflections` in `src/service/api.js`

Add near the journal section (after `moments()`, before `lastReviewRun`, or
in a clearly-marked new `/* ----- reflection ----- */` section - this file
groups functions by feature with banner comments, follow that).

```js
/**
 * One short look back: what went well, what he'd do differently, and
 * optionally anything else. See the header of reflection.js for why this is
 * fixed prompts rather than a diary field, and why it is not the day and not
 * a moment.
 *
 * At least one of the two primary questions has to carry something - a
 * fully blank row, or one with only the secondary field filled, records
 * nothing the two questions exist to ask.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} [args.wellDone]
 * @param {string} [args.differently]
 * @param {string} [args.notes]
 * @param {number} [args.at] Defaults to now.
 * @param {number} args.now
 */
export function logReflection(store, { wellDone, differently, notes, at, now }) {
  const when = typeof at === "number" ? at : now;
  if (isLaterDay(when, now)) {
    return { error: "That week has not happened yet." };
  }

  /** @type {Record<string, any>} */
  const row = { at: when };
  for (const field of REFLECTION_FIELDS) {
    const value = String({ wellDone, differently, notes }[field.name] ?? "").trim();
    row[field.name] = value === "" ? null : value;
  }

  if (!String(row.wellDone ?? "").trim() && !String(row.differently ?? "").trim()) {
    return { error: "Answer at least one of the two questions - notes alone is not a reflection." };
  }

  const id = store.create("reflections", row);
  return { id };
}

/**
 * Recent reflections, newest first.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {number} now
 * @param {object} [opts]
 * @param {number} [opts.limit]
 * @param {number} [opts.since]
 */
export function reflections(store, now, { limit, since } = {}) {
  let rows = store.rows("reflections").filter((r) => Number(r.at ?? 0) > 0);
  if (typeof since === "number") {
    rows = rows.filter((r) => Number(r.at) >= since);
  }
  rows = rows.sort((a, b) => Number(b.at ?? 0) - Number(a.at ?? 0));
  if (typeof limit === "number") {
    rows = rows.slice(0, limit);
  }
  return rows.map((r) => ({
    id: String(r.id),
    at: Number(r.at ?? 0),
    when: agoWords(Math.max(0, Math.floor((now - Number(r.at ?? now)) / 86_400_000))),
    wellDone: r.wellDone ?? null,
    differently: r.differently ?? null,
    notes: r.notes ?? null
  }));
}
```

(Exact `reflections()` signature - `(store, now, opts)` vs `(store, opts)`
with `now` folded in - should match whichever of the two shapes
`journal()`/`moments()` use most consistently; `moments(store, now)` takes
no options at all today, so it is fine to add `{ limit, since }` as a third
optional arg the way sketched above. Keep it simple; the goal only requires
"recent entries newest-first for display".)

Add the matching import at the top: `REFLECTION_FIELDS` from
`../domain/reflection.js`. Do not add `"reflections"` to `AGENT_WRITABLE`.

Add a `lastReflectedAt(store)` helper next to `lastReviewRun` (or inline
where step 4 needs it) that returns the max `at` across `reflections` rows,
or `null` - copy `lastReviewRun`'s shape exactly.

### Step 4 - the nudge: `src/domain/myattention.js` + wiring

In `myattention.js`:

- Add a `reflections` param to `myAttention({ ... })` (array of
  `{ at }`-shaped rows, default `[]`), following the same defensive-default
  pattern as `stakes`/`entries`.
- Add a new signal block, placed after the "written and never read" block
  (lowest priority - this is even less urgent than an unread journal, since
  the journal already has content waiting and this doesn't). Logic:
  - `lastReflectedAt = reflections.length ? Math.max(...reflections.map(r => Number(r.at ?? 0))) : null`
  - `daysSinceLast = lastReflectedAt === null ? null : daysBetween(lastReflectedAt, now)` (import `daysBetween` from `./time.js`, already used elsewhere in the codebase - check `time.js`'s exact export name and use it instead of hand-rolling day math)
  - Only consider firing if there is evidence the app has actually been in
    use for at least `REFLECTION_CADENCE_DAYS` (reuse `touches`/`entries`
    already passed in: find the earliest `at` across both; if none, or it's
    more recent than `REFLECTION_CADENCE_DAYS` ago, do not fire - a brand
    new install should not be nagged about a week that hasn't happened).
  - Fire when `(lastReflectedAt === null || daysSinceLast >= REFLECTION_CADENCE_DAYS)` and the usage-age gate above passes.
  - Text, first person, e.g.:
    `lastReflectedAt === null ? "I have not written a weekly reflection yet." : \`It has been ${daysSinceLast} days since I last reflected on the week.\`` - adjust wording to taste but keep first-person subject (the existing test in `myattention.test.mjs` asserts every signal's `text` starts in the first person - do not break that assertion).
  - `key: "i-have-not-reflected"`, low `weight` (lower than the unread-
    journal signal's `40 + ...`, e.g. base `20`), so it never competes with
    a signal about a person.
  - Do **not** give this signal a severity field - none of the signals in
    this file have one, which is exactly what keeps them out of
    `buildAttention()`'s critical/warn machinery. Do not touch
    `attention.js` or `cadence.js` at all for this feature.
- Update the file's own doc-comment only if the new signal needs a caveat
  explaining why it's the second signal here with no colleague in it at all
  (the unread-journal signal already sets this precedent - a short note
  referencing it, or none at all, is fine; do not over-comment).

In `src/service/api.js`'s `myAttentionSignals(store, now)`: add
`reflections: store.rows("reflections")` to the object passed into
`myAttention(...)`.

In `src/main/index.js`'s `OPERATIONS`: add
`logReflection: (a) => api.logReflection(store, { ...a, now: a.now ?? Date.now() }),`
and
`reflections: (a) => api.reflections(store, a.now ?? Date.now(), { limit: a.limit, since: a.since }),`
in the journal-adjacent block (near `logEntry`/`moments`). `removeRow` needs
no change here - it is already generic and now accepts `"reflections"` from
step 2.

### Step 5 - half/view registration

`src/domain/halves.js`: add one entry to the `VIEWS` array, directly after
the `"journal"` entry:

```js
{ id: "reflection", name: "Reflection", hint: "how the week went", halves: ["work"] },
```

No change needed to `personBlocksIn()` - this is a page-level view, not a
per-person block.

`src/renderer/index.html`: add a rail button directly after the `"journal"`
button, no nav-count span (mirror the comment already on the journal button
explaining why it has none):

```html
<!-- Same reasoning as "The day": occasional and never late, so a badge
     here would only ever be a reproach. -->
<button class="nav-btn" data-view="reflection">Reflection</button>
```

`src/renderer/app.js`: import the new view module and add it to the `VIEWS`
object at line ~33 (`const VIEWS = { now, prep, journal, people, work, role, decisions, focus, knowledge, settings, reflection };`) plus the corresponding import line (match the existing import style at the top of the file for other views, e.g. whatever `journal` uses - check before writing this line, since it may be a namespace import or a named `{ render, actions }` import).

### Step 6 - the view: `src/renderer/views/reflection.js`

New file. Model directly on `journal.js`'s structure but much smaller - no
model integration, no private-half branching, no coverage line, no
readings/kept-readings sections. Shape:

- Doc comment: why this has its own rail slot (see step 5's reasoning,
  restated briefly), why it's fixed prompts not a diary (one line, points
  back to `reflection.js`'s own header for the full reasoning rather than
  repeating it).
- `render()`:
  - `Promise.all([tend.invoke("reflections"), tend.invoke("myAttention")])`
  - Find the `i-have-not-reflected` signal in the `myAttention` result (same
    pattern as `journal.js`'s `backlog` lookup) and show it inline near the
    top if present - a soft, dismissible-by-ignoring line, not a banner. No
    dismiss button needed; it clears itself the moment a reflection is
    logged (its `null`/`daysSinceLast` recomputes).
  - Header with title "Reflection", one sub-line explaining it's occasional
    and asks two or three fixed questions, and an "Add a reflection" primary
    button (`data-act="addReflection"`).
  - Empty state (no rows): short paragraph naming the two questions, same
    tone as `journal.js`'s empty state.
  - List of past reflections, newest first, each a `<article class="card"
    data-reflection="...">` (use `data-reflection`, mirroring `journal.js`'s
    `data-entry`, so a test can find "a reflection card" unambiguously)
    showing the date (`new Date(r.at).toLocaleDateString("sv-SE")`, matching
    the rest of the app), then a `.prep-block` per non-null field (label +
    text, same pattern as `journal.js`'s `entry()` - skip blank fields
    entirely rather than showing a dash), then a footer with a "Remove"
    button (`data-act="removeReflection"` -> `act("removeRow", { collection: "reflections", id: d.id }, "Removed.")`).
- `actions`:
  - `addReflection`: opens `form({...})` with the three `REFLECTION_FIELDS`
    as `textarea` fields (labels/hints from the domain module - import
    `REFLECTION_FIELDS` from `../../domain/reflection.js`), all optional at
    the form-field level (the service enforces the real rule and returns
    `{ error }`, which `act()` already surfaces as a toast - check how
    `act()` reports `{ error }` responses today, e.g. in `work.js` or
    `journal.js`'s `writeEntry`, and rely on that rather than duplicating
    the validation client-side). `confirm: "Keep it"`. On success, `refresh()`.
  - `removeReflection`: as sketched above, with no confirmation dialog -
    check `journal.js`'s `dropEntry`, which does not confirm either, and
    match that since a reflection removal is exactly as low-stakes as
    removing a day entry.

Check `src/renderer/ui.js` for the exact `form()`/`act()`/`ask()`/`esc()`
signatures before writing this file - they are used but not yet read in
full during research; do not guess field option names.

### Step 7 - unit tests

`test/reflection.test.mjs` (new), mirroring `test/journal.test.mjs`'s
structure:

- A pure-function `describe` block for `hasContent()`: blank row is not
  content; one filled field is; `notes` alone still counts as `hasContent`
  even though `logReflection` refuses to store notes-only (these are
  different rules at different layers - say so in a comment if it isn't
  obvious from the test names).
- A `describe("through the store", ...)` block, using `openStore` in a tmp
  dir (copy the `beforeEach`/`afterEach` scaffolding from
  `journal.test.mjs` verbatim):
  - `logReflection` refuses a fully blank row.
  - `logReflection` refuses a row with only `notes`.
  - `logReflection` accepts `wellDone` alone, `differently` alone, or both.
  - `logReflection` refuses a future date (`isLaterDay`).
  - `reflections()` returns newest-first.
  - `reflections()` respects `limit`/`since` if implemented.
  - `removeRow(store, "reflections", id)` removes it (confirms step 2's
    wiring).

`test/myattention.test.mjs`: add cases for the new signal:
- fires when no reflection has ever been logged and there's enough aged
  activity (touches/entries older than `REFLECTION_CADENCE_DAYS`) to prove
  the gate.
- does not fire on a fresh install with only same-day activity.
- clears once a reflection has been logged inside the cadence window.
- fires again once a kept reflection ages past the cadence.
- never carries a `severity` field, and its `text` starts in the first
  person (the existing "every signal speaks in the first person" test in
  this file iterates all signals generically - check whether it already
  covers a new key automatically or needs the fixture updated to actually
  produce this signal at least once; if the fixture only exercises specific
  signals, add this one to it deliberately rather than relying on
  incidental coverage).

`test/storage.test.mjs`: grep for `COLLECTIONS` - if it enumerates the array
directly (e.g. asserts its length or contents), add `"reflections"` there
too. If it only iterates `COLLECTIONS` generically (create/update/tombstone
round-trip per collection), no change is needed beyond the array itself
already changed in step 2.

Run `npm test` and `npm run typecheck` after this step; both must be green
before moving on.

### Step 8 - E2E flow

Extend `scripts/e2e-app.mjs`, in work-half mode, right after the existing
"the day" section (after the block ending around the nav-count check, before
whatever comes next - check what currently follows so the new section is
inserted cleanly rather than splitting an existing one).

Template closely on the journal section already in that file:

```js
step("A weekly reflection");

await page.click('.nav-btn[data-view="reflection"]');
await page.waitFor("document.querySelector('.view-title') !== null", "the reflection view");

const emptyReflection = await page.text("#main");
check("an empty reflection page names the two questions it asks", () => {
  if (!/went well/i.test(emptyReflection) || !/differently/i.test(emptyReflection)) {
    throw new Error(`the empty state does not name the two questions: ${emptyReflection.slice(0, 200)}`);
  }
});

await page.click('[data-act="addReflection"]');
await page.fillDialog({ wellDone: "Skeppet höll kursen genom hela veckan" });
await page.waitFor(
  "document.body.textContent.includes('Skeppet höll kursen genom hela veckan')",
  "the reflection on the page"
);

const reflectionCards = await page.evaluate("document.querySelectorAll('[data-reflection]').length");
check("a reflection with only one question answered is still kept", () => {
  if (Number(reflectionCards) !== 1) {
    throw new Error(`${reflectionCards} reflection cards, expected 1`);
  }
});

const railCount = await page.evaluate(
  `(() => { const b = document.querySelector('.nav-btn[data-view="reflection"] .nav-count');
    return b === null ? "none" : b.textContent; })()`
);
check("the rail carries no count for it either, same reasoning as the day", () => {
  if (String(railCount).trim() !== "none" && String(railCount).trim() !== "") {
    throw new Error(`the rail shows "${railCount}"`);
  }
});
```

Adjust selectors once step 6's actual markup exists. Use Swedish text in
fixture content per `CLAUDE.md`'s "Swedish keeps its å, ä and ö" rule and to
match this script's existing fixture style (see the `Feedbackrundorna`
example already in the file) - this is invented fixture content, not a real
name or situation, which is what the privacy rule requires.

Run `npm run test:app` (unpackaged) after this step and confirm the new
section passes alongside everything existing. This is the step most likely
to need iteration on exact selectors/timing - that's expected, budget more
than one implement-phase turn for it if needed, but keep each turn's diff
small and re-verify with `npm test`, `npm run typecheck`, and `npm run
test:app` every time.

### Step 9 - DECISIONS.md entry

Add one new entry at the very top of the "newest first" list (after the
file's one-paragraph intro, before the existing `## 2026-08-26` entries),
dated `## 2026-08-30 - <short title>` (e.g. "A weekly reflection is three
fixed questions, not a diary field"). Voice: bold lead-ins (`**Decided.**`,
`**Why not a diary.**`, `**Why not the journal.**`, `**Why the nudge lives
where attention signals already live.**`), plain prose, hyphens not em
dashes, generic "he"/"his" the way the growth.js decision entry does. Cover:
- Why prompt-based rather than an open textarea (restate `growth.js`'s
  "why this is not a development plan" reasoning at this feature's scale:
  three fixed questions instead of one blank box, because a blank box
  becomes a diary and a diary is not what any part of this app keeps).
- Why this is not `journal.js`'s day entry and not a moment (different
  subject and different cadence - see step 1's reasoning, condensed).
- Why the nudge is a `myAttention` signal rather than a new critical-capable
  path - ties directly to the existing "Attention signals measure me, and
  the line is in the code" entry (2026-08-24): this is the mirror case,
  something genuinely about the owner himself, so it belongs exactly there.
- Why there is no MCP tool (mirrors `entries`/`moments` precedent - this is
  private, self-directed material with nothing the job-running surface
  needs).

Do not name any real person, employer, or describe the owner's actual
situation - write about the mechanism and its rationale only, per the goal's
explicit instruction.

### Step 10 - final verification pass

One last iteration (or folded into step 8/9 if everything is already green)
that runs, in order, and confirms all green before declaring the goal done:

1. `npm test`
2. `npm run typecheck`
3. `npm run test:app` (work-half mode; the default)

If anything is still red, that is real remaining work - do not mark
`goalReached: true` until all three are green and the DECISIONS.md entry and
final version bump are in place.

## Open items intentionally left for the implement phase to resolve in-line

These are small enough not to warrant blocking the plan, but are genuinely
undecided and should be resolved by reading the relevant file at the time,
not guessed:

- The exact `import` style used for view modules in `app.js` (named vs
  namespace import) - copy whatever `journal` already uses.
- Whether `act()` surfaces a service `{ error }` response as a toast
  automatically, or whether `journal.js`/`work.js` do something extra to
  show it - read one call site before writing `addReflection`'s handler.
- The precise wording of `REFLECTION_FIELDS[].hint` strings and the nudge's
  `text`/`detail` strings - keep first-person, keep short, no house-style
  violations (no em dashes, `å`/`ä`/`ö` preserved if Swedish fixture text is
  used anywhere).
- Exact weight/threshold numbers in the new `myattention.js` signal - the
  plan gives the shape and relative ordering (below the unread-journal
  signal); exact constants are the implementer's call as long as tests
  cover fire/clear/never-critical.

## Definition of done

All of: the six numbered goal items in the original prompt implemented per
the decisions above; `npm test`, `npm run typecheck`, and `npm run test:app`
all green; `scripts/e2e-app.mjs` covers add-a-reflection-and-see-it-listed;
`DECISIONS.md` has the new entry; `package.json`'s patch version has been
bumped once per commit across the whole build (not just once at the end);
everything committed to `main` with no feature branch, nothing under
`.claude/worktrees/` touched, nothing pushed.
