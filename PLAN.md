# Plan

## What Tend is

A desktop tool for the leadership half of an engineering job: the standing
responsibilities, the people, and the things that quietly slip when a week gets
busy. A sibling to Jot, Nib, Helm and Loom rather than part of any of them.

The thesis in one line: **the role is not a task list, it is a surface that can
be neglected.** So the tool tracks how far behind each thing is, shows only what
deviates, and derives its evidence from notes rather than asking for
check-boxes.

## Status - 2026-09-03

**Usable without a terminal.** Install it, open it, and everything can be done
from the window: add people, log contact and promises, answer the monthly
questions, run a focus, hand work over with a stated level, bind Nib folders and
import from them. Nothing in the app tells you to run a command.

Eleven views in the work half: Now, Prep, Focus, People, Work, The day,
Reflection, Role map, Decisions, Knowledge, Settings. Knowledge exists now - it
was the one view from the original design that had to wait for a body of notes to
search.

Five of those are shared with the private half - People, The day, Reflection,
Knowledge and Settings - and `src/domain/halves.js` is the single declaration
that decides it. Everything else derives from it: the rail, the palette, what a
person may be, what the service accepts, and which attention signals mean
anything. That file's header explains the rule for what belongs in a half better
than this document can, and it is worth reading before touching navigation.

**The private half was subtracted rather than designed**, so assume anything
shared between the halves was never checked against the private one. That
assumption has already paid twice.

The user's own goals live in `aims` - a goal that names where its verdict comes
from, refused at the write without one, two open at a time per half. It is the
only thing in the app that is about the user rather than about somebody they
lead, along with the attention signals and the journal.

- Storage layer: `src/storage/` - append-only log, safe concurrent writers
- Domain layer: `src/domain/` - drift, relationship types, promises, focus,
  and the Now view
- Service layer: `src/service/api.js` - the operations, called by both clients
- MCP server: `src/mcp/` - forty-eight tools, verified end to end over stdio.
  See [docs/mcp.md](docs/mcp.md)
- Role map seeding is a button in the app; `npm run seed` does the same thing
  from a terminal for a fresh data directory
- Electron app: `src/main/`, `src/preload/`, `src/renderer/` - buildless, Jot's
  design tokens, frameless with its own header like Jot and Nib
- Monthly signal questions, delegation levels on workstreams, and Nib bindings:
  `src/domain/signals.js`, `src/domain/workstreams.js`, `src/service/nib.js`
- 1021 unit tests, 8 MCP end-to-end checks, a 198-check walkthrough of the
  whole product driven over the Chrome DevTools Protocol, and 17 more for the
  private half. Type check clean (`npm test`, `npm run test:e2e`, `npm run test:app`,
  `npm run test:private`, `npm run typecheck`)
- **A check that asserts nothing is worse than no check**, and this project has
  now found six of them. The two shapes to know: a `check()` body that does its
  reading inside and returns a promise is recorded as passing before the
  assertion runs, and `querySelectorAll` finds elements inside a closed
  `<details>`, so a check counting controls in a folded block passes against
  controls nobody can reach. Read first, assert second. Mutate the source and
  watch the check go red before believing it
- The walkthrough photographs every view with `--shots`, one image per view plus
  a person's page. Off by default: `Page.captureScreenshot` hangs for its full
  timeout often enough that eleven calls turn an occasional minute into an
  occasional five, on a suite whose whole worth is that it gets run
- The walkthrough can only ever drive the Electron it started: it refuses to
  begin when the debugging port is already taken, naming the PID, and checks the
  attached app's data directory against this run's scratch folder. `--port=N`
  for a second run at once. See `scripts/e2e-port.mjs`
- **Every word the app says is in one file**, `src/renderer/text.js`, namespaced
  by the screen it appears on. Seventeen renderer files were carrying their own
  prose, so reading what the app says meant reading its markup. Three tests hold
  the line: no renderer file may keep a sentence of its own, no key may go
  unread, and the rail's labels must match the names the palette uses for the
  same views. The move changed no wording; the translation was a later pass, and
  came last
- Concurrency design: [docs/storage.md](docs/storage.md)
- Role map research across several books and current practice:
  [docs/role-map-research.md](docs/role-map-research.md) - **needs a review pass
  before anything from it becomes a real duty**
- Decisions and their alternatives: [DECISIONS.md](DECISIONS.md)

## The views

| View | What it is |
| --- | --- |
| **Now** | The only view opened daily. Deviations only: what drifted, which promises are ageing, which signals need an answer, today's meetings with briefs. Nearly empty when everything is in step, by design. |
| **Focus** | The current time-boxed priority, its budget, what it costs in drift, which duties are guarded, and what reverts when it ends. |
| **People** | One page per person, grouped by relationship type. History, recurring themes, open promises, survey input. |
| **Role map** | What the job is, in your words, and how you are doing against it. Duties carry a source, so book-seeded ones are distinguishable from your own. Editable: reorg or job change edits the map, people and history survive. |
| **Work** | Projects by how long since each was looked at, and workstreams with an owner and a stated delegation level. |
| **Settings** | Where the data lives, which Nib folders are bound to whom, and the update status. |
| **Knowledge** | Not built. Principles and lived cases searched by situation. Waiting on there being notes to search. |

## Architecture

```
Nib notes ──read──┐
                  ├──> MCP server (the core) <──> Claude Code / Helm
Tend event log <──┤
                  └──> Electron app (another client)
```

- The MCP server is the core. The app is one client, external agents another.
  No feature exists twice.
- The app is fully usable with the model switched off. Drift, cadences and
  budgets are deterministic code; the model only reads prose and writes drafts.
- Storage is an append-only event log, one file per writer, safe for concurrent
  writers on a Dropbox-synced folder.

## Next steps

1. ~~**Domain layer**~~ done. `src/domain/`: relationship types, drift, evidence
   matching, promises, the focus contract, and `buildAttention` which assembles
   the Now view. Pure functions over state, no store coupling.
2. ~~**MCP server**~~ done. Twelve tools over a shared service layer the app
   will call too, so no capability exists twice. Runs standalone, so a
   scheduled job works with the app closed. [docs/mcp.md](docs/mcp.md).
3. ~~**Electron shell**~~ done, and complete enough to use. Six views, every
   operation available from the window, dialogs and forms built rather than
   borrowed. Driven in tests over the DevTools protocol rather than the mouse.
4. ~~**Nib indexing**~~ built. Bindings map a Nib folder to a person and say
   what kind of contact notes there count as; `tend_index_nib` turns notes into
   contact and flagged action points into promises, and resolves a promise when
   its action point is ticked off in Nib. Nib is only ever read.
   **Not yet exercised against real notes** - his Nib is empty.
5. ~~**Model layer**~~ built. Three jobs, each behind a button: a brief before a
   conversation, one note read for a commitment written in prose, and what
   recurs across several notes about one person. Nothing runs on app open and a
   test enforces it. Briefs are shown and thrown away, extracted promises are
   candidates until kept, and themes are the only thing a model may write.
   The app is fully usable with Claude Code absent - the three buttons say why
   they are off and nothing else changes. **Exercised against fixtures and one
   real call; not yet against real notes.**
6. ~~**Ctrl+K palette**~~ built. `Nina: look at the render pass` logs a promise
   without leaving the page; commands are the rail plus the handful of things
   that would otherwise mean finding a view first; questions are answered from
   Tend's own data, and only what falls through that list is *offered* to a
   model. The parsing lives in `src/domain/parse.js` rather than in the overlay,
   because that is the part where a bug attaches a promise to the wrong person.
7. ~~**One file for the words**~~ done. `src/renderer/text.js`, and the first
   slice of the wording overhaul. Moved, not reworded: 472 sentences were
   verified present verbatim in the module against the commit before each file
   moved, because a diff that both relocates and rewrites four hundred strings
   is a diff nobody can review.
8. ~~**The vocabulary pass**~~ done. [docs/vocabulary.md](docs/vocabulary.md)
   is the survey and the decisions. It refuted its own premise: the app is not
   full of jargon, the questions it asks are plain first-person English, and
   `driver`, `stance` and `horizon` never reach the screen at all. What was
   actually wrong was five internal names leaking into the sentences that
   explain a field, so a reader met each word for the first time in an
   explanation of something else - worst of them a Ctrl+K row hinted "from the
   drift log", naming a page that does not exist. Twenty sentences fixed.
   Then three words carrying two meanings, of which one moved: the app's mode
   is now **the private side** and **the work side**, because `side` was
   already the app's own word for it. `half` stays as the internal name and
   the comments must not be "fixed" to match.

9. ~~**Läget, the front door**~~ done. Replaces `Now` and absorbs `Focus`, so
   the rail lost an entry rather than gaining one. The roster as tiles: the
   people he holds a mandate over get a grid, the other three clusters get one
   line each. Every tile phrase comes from `src/domain/tiles.js` - one closed
   set per cluster, decided by rule, never written by a model, and a test walks
   every declared phrase from a real row so an unhandled state cannot render as
   a blank tile about a named colleague.
10. ~~**Inför**~~ done for its core. `worthRaising` is fed from the "Frågor jag
   inte ställde" section of the last Nib note - the preparation for the next
   conversation was already written at the end of the last one and nothing read
   it. `src/domain/unasked.js` reads it by the shape of the document and never
   by meaning, so a hand-written note degrades to empty rather than to nonsense.
   It also generalises the page past the 1-1: unasked questions are now a
   reason to be on it, which is the only reason a stakeholder or his own
   manager ever gets a card.
11. ~~**Mine**~~ done. A commitment out of a shared note can be filed as his own
   work. `myActions` is its own collection, not a promise with a flag: a
   promise needs somebody waiting, and filing his own work as one inflates the
   nearest attendee's card and puts work that is not about them into their 1-1
   prep. The absence of this cost eleven tracked action points from one meeting.
12. ~~**Plan**~~ done. The second shape beside a direction, with the table of
   differences in `src/domain/plan.js`. The second field is the important one -
   *does the person know?* - and "no" is an answer rather than an unfilled
   field. Unfilled fields read as "not ready to start" rather than as
   validation errors. The copy the person is handed is a named five-line subset
   rather than everything minus the private fields, so a goal like "document
   that we tried" cannot reach it by default when a field is added later.
13. ~~**The translation**~~ done. Everything the app says is Swedish: all
   1214 strings in `src/renderer/text.js`, the option labels that live in the
   domain beside their values, the three duration composers in
   `src/domain/time.js`, and the seeded role map, monthly questions and topic
   seeds. Last by his decision, twice, and the order was right: the new screens
   had no strings when it was deferred, so translating earlier meant writing
   Swedish twice.

   Four things it turned out to be about rather than word choice:

   - **`durationOf` had to return parts, not a phrase.** "för 5 veckor sedan"
     wraps its number and a suffix cannot express it. That went in first, on its
     own, before any wording moved.
   - **`const t = T.people` collided with the row variable `t`** in seven of
     thirteen views. Every collision compiled and would have rendered a text key
     where a name belonged. The alias is `words` everywhere now.
   - **Four strings had escaped the extraction pass**, and none of them read
     like prose to a search: a button label starting with a bare "I", a pill
     beginning lowercase, a second hardcoded copy of the palette's own composer
     twenty lines from the one that used the module, and four English nouns
     handed to `readFailedHtml`, which wraps its argument in "Kunde inte läsa
     ...". Each was found by a check going red, not by reading.
   - **Two hundred walkthrough checks matched English literals**, and about
     seventy unit tests. They read from `T`, `RELATIONS`, `TILE_SETS` and the
     seeds now, so the next rewording does not break a check about behaviour.
   - **Swedish adjectives agree and English ones do not**, so a
     `n === 1 ? "ämne" : "ämnen"` ternary silently produced "1 ämne värda att
     ta upp". The whole phrase has to branch, not the noun.

   Work jargon he already speaks in English stays English inside the Swedish
   sentence - `stakeholder`, `casual`, `sideways`, `second hand`,
   `feedback` - and `drift` is **eftersläpning**, never the English word.

   **Where Swedish stops is a stated rule, not a leftover:** a string a person
   can put on their own screen is Swedish wherever it is composed; the 81 that
   are keyed by an id or an enum stay English, because only a caller passing bad
   arguments can produce one. See DECISIONS.md.

## Not built, and why

**The private half's signals.** The questions Tend asks rather than derives, over
the private journal. Held back on purpose until there are around twenty real
entries to build them on: signals guessed at in advance are worse than none,
because a question nobody recognises teaches you to ignore the page it is on.

Still held back as of 2026-09-01, and by then the mechanism was not the reason.
Signals are seeded rows in a store and every store has the machinery, so building
them is now nothing but writing the questions - which is exactly the guess. What
the material says instead: three moments logged, all three inside one nine-minute
sitting, none since. So the pass over what IS written was built first, and it
refuses that shape of material out loud rather than reading it.

~~**The Knowledge view.**~~ Built. Situation search over the notebook, a reading
pass that opens only what survived it, and - since 2026-08-31 - a general-knowledge
block for the part the notes do not answer.

## Open questions

- **The five proposed duties are still proposals.** `npm run seed` writes them;
  he accepts or declines each in the Role map view. The four judgement questions
  from the research were settled on 2026-08-23 and are recorded in DECISIONS.md.
- **Whether a family of related projects is one row each or one row with
  sub-rows.** When staffing moves between them a fixed schedule per project is
  probably wrong, and "longest untouched" is the better model.
- ~~**Nothing has met real data.**~~ It has, and it found things fixtures could
  not: the scope rule that emptied the practice block entirely, and undo buttons
  that squeezed against a long real note. Both are in DECISIONS.md. The paths
  still least exercised are the ones needing a second person or a long history.

Settled: the name is Tend. The data directory follows Jot and Nib - `userData`
by default, relocated with `TEND_DATA_DIR`, confirmed on 2026-08-23 as fine to
point into Dropbox since it is his private account with only his own access.

## Conventions

- Text Tend generates gets pasted into real places, so it never writes out a
  management job title. Describe the role as lead, coaching, or responsibility.
- Swedish text keeps its å, ä and ö, including inside code and fixtures.

## A private mode, for relationships outside work

Discussed 2026-08-25. The first three steps of the build order below - the mode
switch, the journal on both sides, and the model check that reads an entry back
against the first-person rule - landed 2026-08-27 and are recorded in
DECISIONS.md under "Two stores, one at a time". The fourth, the reference
material, landed 2026-08-31 and is recorded under "Reference material is a second
answer, not a second store" - not as the stored cards described below, and that
entry says why. What is left is the signals, last and deliberately.

The design below stands as written; read it for the reasoning rather than for
what exists.

The idea is that the model underneath Tend is not work-specific. A person, a
relationship, things you owe them, a record of contact, promises - none of that
belongs only to a job. The name already covers it.

**What does not transfer: drift.** The whole tool rests on "you have not spoken
to this person in N days, and that is a deviation". For somebody you live with,
contact is continuous, so the cadence machinery produces either permanent green
or something faintly grotesque. Duties and drift are therefore switched off in
this mode rather than reused.

**What does transfer: the journal and the pattern-finding.** Which is the
thinnest part of the app today - `evidence` and `themes` - so building it
properly improves the work side at the same time. A review conversation is built
from the same material.

**The mode swaps the data directory, it does not filter one.** Two stores that
never merge and are never read across. The mode has to be visible and sticky, so
you cannot be in it without noticing. Nib already models this with a scope per
category and needs no change: it holds the notes for both halves already.

**The constraint that makes it safe is the one `myattention.js` already
enforces.** Every signal has a first-person subject. Applied here it becomes a
rule about what a journal entry may say: record the interaction and your own part
in it, not the other person's state. "That conversation went badly and I got
impatient" rather than "they were impossible." Three reasons, and the third is
the one that matters: it is the half you can change, it keeps the signals honest,
and it is the only version you could show the person it is about.

A model pass on each entry enforces that rule where good intentions do not - the
review is shown and thrown away, never stored and never rewriting the entry, the
same boundary `draftBrief` already keeps. A smaller model is the right size for a
per-entry check. An input form shaped as a few specific questions rather than a
free box may do more of the work than any review can, by moving it upstream.

**Build order.** Mode switch, then the journal entry, then the model review, then
the reference material, then the signals. Signals last on purpose: built on
twenty real entries rather than on a guess about which patterns exist. The review
comes before the signals because it improves the entries, and signals built on
poor entries are worse than none.

*Amended 2026-09-01.* One step was missing between the reference material and the
signals, and it was the one that makes the entries worth writing: reading ACROSS
them. The order above assumed the guided form was what stood between a few entries
and a month of them, and the form turned out not to be the obstacle - the three
real entries were written in nine minutes with both fields filled. What was
missing was any reason to come back, because nothing in this half ever read what
had been written. That reading is built; the signals still wait.

**Reference material carries its provenance.** A card summarised from general
knowledge says so, distinctly from one drawn from a specific book that was
actually read. Same rule as `themes` carrying `source` to the screen: what a
model wrote has to be visible, so it can be read with the right scepticism.
Where a subject has a wide range of individual variation, general summaries are a
starting point and are marked as one - the people involved outrank them.

*Built 2026-08-31, and "card" turned out to be the wrong noun: it is a second
answer inside the knowledge view rather than a stored row, because a general
summary regenerates identically enough that keeping one buys only the risk of
reading it later as though it had been checked. The provenance rule above is what
survived intact, and it is now the whole safety property.*

**Settled 2026-08-31: one private store holds every relationship.** The closest
ones are not separated further; a third store would sit on the same disk under
the same account and protect nothing the second does not, while splitting the
entries that the periodic pass needs. Reasoning in DECISIONS.md.

### The journal, and the loop it closes

Agreed 2026-08-25. Wanted on both sides of the mode switch, so it is one build.

**It is nice to have, not a discipline.** Days will be missed and that is
expected, so nothing prompts for it, nothing counts a streak, and no field is
required. A tool that asks every evening becomes a tool that is avoided every
evening, and the data then stops entirely rather than arriving unevenly.

**The value is in the periodic pass, not in the entry.** An entry on its own is
a note; twenty of them are a pattern. So the summary is the product and the form
is the means, which inverts the build order: the form only has to be good enough
to make writing cheap.

**The loop.** Entries accumulate. A pass reads them and says what keeps coming
up. What keeps coming up points at a principle. He flags that principle in Nib,
and it then appears above the Prep cards until it comes naturally. Three of the
four parts already exist - `themes` is the precedent for a model writing a
structured finding, and it carries `source` to the screen for the same reason
anything here does.

**Three or four fields, and none of them a question Tend can answer itself.**
Not "who did you speak to": the store knows. The fields have to be the things
only he can say - where the day actually went as opposed to where it was meant
to, what he avoided, what he would do differently. Plus a longer box for when
there is more to write.

**How much was read is part of the answer.** A monthly pass over five entries
and one over twenty-five are different claims, and a summary that does not say
which is a summary that sounds equally confident either way. Same rule as
`openWork` being null rather than empty when the board cannot be read.

**Model sizes differ by job.** A per-entry check is small and cheap. A synthesis
across a month of entries is not, and pretending otherwise produces a confident
paragraph built on nothing.

**The per-entry check belongs in the private mode and is optional in the work
one.** In private it enforces the rule that an entry records the interaction and
his own part in it rather than the other person's state, which is what protects
the relationship being written about. Against a work entry the same check is
friction on the one thing that has to stay frictionless.
