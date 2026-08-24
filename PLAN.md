# Plan

## What Tend is

A desktop tool for the leadership half of an engineering job: the standing
responsibilities, the people, and the things that quietly slip when a week gets
busy. A sibling to Jot, Nib, Helm and Loom rather than part of any of them.

The thesis in one line: **the role is not a task list, it is a surface that can
be neglected.** So the tool tracks how far behind each thing is, shows only what
deviates, and derives its evidence from notes rather than asking for
check-boxes.

## Status - 2026-08-23

**Usable without a terminal.** Install it, open it, and everything can be done
from the window: add people, log contact and promises, answer the monthly
questions, run a focus, hand work over with a stated level, bind Nib folders and
import from them. Nothing in the app tells you to run a command.

Six views: Now, Focus, People, Work, Role map, Settings. The Knowledge view is
the one from the original design that does not exist yet - it needs a body of
notes to search, and there isn't one until Nib has been used for a while.

- Storage layer: `src/storage/` - append-only log, safe concurrent writers
- Domain layer: `src/domain/` - drift, relationship types, promises, focus,
  and the Now view
- Service layer: `src/service/api.js` - the operations, called by both clients
- MCP server: `src/mcp/` - twelve tools, verified end to end over stdio.
  See [docs/mcp.md](docs/mcp.md)
- Role map seeding is a button in the app; `npm run seed` does the same thing
  from a terminal for a fresh data directory
- Electron app: `src/main/`, `src/preload/`, `src/renderer/` - buildless, Jot's
  design tokens, frameless with its own header like Jot and Nib
- Monthly signal questions, delegation levels on workstreams, and Nib bindings:
  `src/domain/signals.js`, `src/domain/workstreams.js`, `src/service/nib.js`
- 133 unit tests, 8 MCP end-to-end checks, and a 29-check walkthrough of the
  whole product driven over the Chrome DevTools Protocol. Type check clean
  (`npm test`, `npm run test:e2e`, `npm run test:app`, `npm run typecheck`)
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
6. **Ctrl+K palette**: capture first, commands second, questions third. Local
   matches resolve with no model call.

## Open questions

- **The five proposed duties are still proposals.** `npm run seed` writes them;
  he accepts or declines each in the Role map view. The four judgement questions
  from the research were settled on 2026-08-23 and are recorded in DECISIONS.md.
- **Whether a family of related projects is one row each or one row with
  sub-rows.** When staffing moves between them a fixed schedule per project is
  probably wrong, and "longest untouched" is the better model.
- **Nothing has met real data.** His Nib is empty and no real colleague is in
  the app, so every path is proven against fixtures rather than against use.

Settled: the name is Tend. The data directory follows Jot and Nib - `userData`
by default, relocated with `TEND_DATA_DIR`, confirmed on 2026-08-23 as fine to
point into Dropbox since it is his private account with only his own access.

## Conventions

- Text Tend generates gets pasted into real places, so it never writes out a
  management job title. Describe the role as lead, coaching, or responsibility.
- Swedish text keeps its å, ä and ö, including inside code and fixtures.
