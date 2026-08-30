# Goal orchestrator notes

This file is the ONLY continuity mechanism between iterations — each
iteration runs in a fresh subprocess with no conversation memory. See
DECISIONS.md / PLAN.md (Fas 3 Point 11) in the Helm repo for why.

---

## RESEARCH iteration (archive mechanism) - findings and recommended plan

Current version in package.json: `0.1.70`. Bump to `0.1.71` for this change
(patch-per-commit; if implementation spans multiple commits, bump on each).

### 1. Storage layer - how it actually works (confirmed by reading reduce.js/store.js)

- `COLLECTIONS` in `src/storage/reduce.js` is a whitelist array (`"people"`,
  `"projects"`, `"workstreams"`, etc.). Adding `archivedAt` needs **no change
  here** - rows are untyped bags of fields (`Record<string, any> & {id, _by,
  _at, ...}`), so `archivedAt` just becomes a field written via the existing
  generic `create`/`update` event verbs. No new collection, no new event verb.
- `store.create(collection, fields)` calls emit `${collection}.create`.
  `store.update(collection, id, fields)` emits `${collection}.update`
  (last-write-wins per field, via `Object.assign` in `applyEvent`).
  `store.remove(collection, id)` emits `${collection}.delete`, which sets
  `_deleted: true` on the row (reduce.js `applyEvent`, action `"delete"`).
  **There is no restore/undelete verb anywhere** - `_deleted` is one-way in
  practice today, even though the log technically retains the delete event.
- `store.rows(collection)` (via `rows(state, collection)` in reduce.js) filters
  out `_deleted` rows. **It does NOT know about `archivedAt` and must not be
  taught to** - archived rows must stay fully readable through `store.rows()`
  so history (touches, promises, decisions, growth, evidence) keeps resolving
  against them. Filtering-by-archived has to happen at each *call site* that
  builds a live view (attention, prep, cadence crossing, default listings),
  not inside the generic row reader.
- `resolvePerson`/`resolveProject`/`resolveWorkstream` (`src/service/resolve.js`)
  all read via `store.rows(...)`, so they filter `_deleted` but will **still
  resolve an archived row** (archived is not the same as deleted). This is
  exactly the behaviour the goal wants: `api.person(store, query, now)` (the
  person page) needs zero changes to keep working for an archived person -
  resolution already passes through untouched. Same would apply to a
  project/workstream detail view, if one exists.

### 2. `_deleted` (existing "Remove") vs `archivedAt` (new) - they must stay distinct

The "Remove" button already on people/projects/workstreams/etc
(`api.removeRow`, wired in `people.js`/`work.js` renderer views) sets
`_deleted: true`. Its own confirm copy already claims "Nothing is destroyed
... can be recovered" - but there is **no actual restore path** anywhere in
service/UI/MCP today. It also makes the row **unresolvable by name/id**
(`resolvePerson` etc. would 404 it), unlike an archived row.

So `_deleted` and `archivedAt` are two different, deliberately separate
mechanisms:
- `_deleted` = "Remove": a full tombstone, currently one-way from the user's
  perspective, row disappears even from lookup-by-id.
- `archivedAt` = "Archive": reversible, explicit, row stays fully resolvable
  and its person/project page keeps working; only *default/aggregate* views
  (roster, Now, prep, cadence expansion) hide it, and there is an explicit
  "show archived" path back.

Do not merge them, do not make Remove imply Archive or vice versa. Both
should keep existing separately (Remove stays exactly as it is today).

### 3. Existing precedent worth citing in the DECISIONS.md entry

`src/domain/people.js` already solves *almost* this exact problem for one
collection: `awayUntil`/`leftAt` are **dates on a person, not a delete**
(see the file's own header comment, and the DECISIONS.md entry dated
2026-08-25, "Away and gone are dates on a person, not a delete" - the
closest existing analogue in voice/shape to the archive decision to be
written). `hasLeft`/`isAway`/`inScope`/`notBefore`/`availability` in that
file are the pattern: a date field, absent means normal, present means a
status that suppresses cadences/promises while keeping history untouched.

**Important distinction to keep in the design**: `leftAt`/`awayUntil` are
person-specific and carry notice-period/return-date semantics
(`appliesWhileLeaving`, "clock restarts from return"). `archivedAt` is a
simpler, symmetric, three-collection, purely-boolean-in-effect status (no
"period", no "return date" logic) triggered by an explicit user action, with
its own bulk trigger ("I left this job"). They should NOT be unified into one
field or one set of helper functions - but `people.js`'s `inScope(person,
now)` is the natural place to ALSO exclude archived people (one extra `&&
!isArchived(person)` clause), because every call site that already relies on
`inScope` (attention.js's cadence crossing, myattention.js, growthQuestions)
then automatically stops counting archived people for free. Confirmed no
other file redefines this "in scope" concept for projects/workstreams, so
those two need direct filtering at each call site (see section 5 below).

### 4. Recommended shape for the new field/helpers

- Add `archivedAt?: number` to people/projects/workstreams rows. No
  `ProjectRow`/`WorkstreamRow`/`PersonRow` JSDoc typedefs exist anywhere
  today (checked: only `GrowthRow`, `FocusRow`, `PromiseRow`, `WaitRow`,
  `ChaseRow` exist as row typedefs; people/projects/workstreams rows are
  untyped `Record<string, any>` throughout `api.js`). There is also **no
  dedicated `src/domain/projects.js`** - project logic lives directly in
  `api.js`/`attention.js`/`prep.js`. Don't invent new typedef files just for
  this; a short JSDoc comment at each read site (as `people.js` already does
  for `leftAt`/`awayUntil`) fits the codebase better than retrofitting
  typedefs nothing else has.
- Suggested: a new small domain file `src/domain/archive.js`, matching the
  narrative-header house style of `growth.js`/`halves.js`/`people.js` (a
  "why" essay up top, short pure functions below, "Nothing here touches the
  store"). It should hold the one thing genuinely shared across all three
  collections: `isArchived(row)` (`typeof row.archivedAt === "number"`) and
  maybe a tiny label helper for the UI ("archived 12 days ago"). Keep it
  small - this is a boolean flag, not a state machine. `people.js`'s
  `inScope` gets one extra clause importing from it.

### 5. Every call site that currently assumes "every row is live" (must filter archived)

**`src/domain/attention.js`** (`expandCadences`, `buildAttention`):
  - `cross(live("people").filter((p) => inScope(p, now)), "person")` is
    covered for free if `inScope` gains the archived check (section 3).
  - `cross(live("projects"), "project")` and `cross(live("workstreams"),
    "workstream")` need an explicit `.filter(w => !isArchived(w))` added;
    no existing helper covers these.
  - `namedStakes(live("stakes"), live("people"), live("projects"))`: a stake
    tied to an archived person or project should probably stop generating
    cadence noise too, even though `stakes` itself is not one of the three
    archivable collections. Open question for the plan phase: filter stakes
    whose `person`/`project` is archived, at this cross() call, rather than
    adding `archivedAt` to stakes themselves.
  - `buildAttention`'s promise loop already has a `hasLeft(person, now)`
    skip - needs a matching `isArchived` skip (a promise to an archived
    person must not show as "needs you" even though the promise row itself
    is untouched).
  - `buildAttention`'s "unspecified workstream" loop (`for (const w of
    live("workstreams"))`) needs the same `!isArchived(w)` filter.

**`src/domain/myattention.js`**: `here = people.filter((p) => inScope(p,
  now))` is covered for free once `inScope` excludes archived (section 3).
  No workstream/project logic in this file.

**`src/service/prep.js`**: `for (const person of people)` where `people =
  store.rows("people")` has **no `inScope` filtering at all today** (drift
  happens to read as 0 for an away/left person because `expandCadences`
  already excluded them, but open promises/topics/growth are NOT filtered by
  scope in this file currently - this looks like a pre-existing gap, not
  something in scope to fix here, but archived people MUST be excluded
  explicitly per the goal's requirement, so add an early `continue` for
  archived people at the top of the loop, not just rely on drift being 0).
  Also `owned = workstreams.filter((w) => owner === id)` for the "they own"
  block - filter out archived workstreams there too, so an archived
  workstream doesn't clutter a prep card's review reminders.

**`src/service/api.js`**:
  - `people(store, now, relation)` (roster/default listing): must exclude
    archived by default. Needs an opt-in path for "show archived" (a new
    param, or a separate function, see section 7 UI notes; precedent for a
    grouped-by-status return shape already exists in `roleMap`, which returns
    `{active, proposed, declined}` - a similar `{active, archived}` shape, or
    a boolean option threaded through, are both plausible; decide in the plan
    phase).
  - `projects(store, now)` / `workstreams(store, now)`: same, default list
    must exclude archived, with an explicit path to see archived ones.
  - `person(store, query, now)`: **no change needed**, see section 1;
    resolution still works, only the returned shape might usefully gain
    something like `archived: true`/`archivedAt` so the person page can show
    an "Archived" banner and offer Unarchive instead of Archive.
  - `stakeholders(store, now, project)`: reads `namedStakes` over
    `store.rows("stakes"/"people"/"projects")` with no archived filtering;
    same question as attention.js's stake crossing - decide once, apply in
    both places (maybe a shared helper: `liveStakes(stakes, people,
    projects)`).
  - New functions needed: `archivePerson(store, id, {now})`,
    `unarchivePerson(store, id)`, `archiveProject`/`unarchiveProject`,
    `archiveWorkstream`/`unarchiveWorkstream`, all following the
    look-up-then-`store.update`-then-return-summary shape used by e.g.
    `resolvePromise`/`updateThread`/`setDelegationLevel`. **Idempotency
    requirement from the goal (re-runnable bulk action)**: archiving an
    already-archived row must be a no-op, not an error, and should NOT
    overwrite the existing `archivedAt` timestamp with a new `now` (re-running
    the bulk action a week later must not make everyone look freshly archived
    today). So `archivePerson` etc. should short-circuit: `if
    (isArchived(found.person)) return {id, name, archivedAt:
    found.person.archivedAt, already: true}` before calling `store.update`.
    Same symmetric no-op for `unarchive*` on an already-active row.
  - New bulk function: `archiveEverythingActive(store, {now})`: thin
    wrapper that calls the three per-item archive functions over every
    currently-non-archived row in `people`/`projects`/`workstreams` (reusing
    `store.rows(...)` which already excludes `_deleted`, and skipping
    already-archived rows via the idempotency check above, or just calling
    archivePerson/etc. for every row and letting their own no-op guards
    handle it). Return a summary count, e.g. `{people: n, projects: n,
    workstreams: n}`.

### 6. MCP surface - recommend NOT adding archive/unarchive tools

Strong existing precedent that *structural/roster decisions* are
deliberately kept off the MCP surface, matching the project rule "Agents
create, they do not restructure" (see CLAUDE.md) and the file header comment
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
