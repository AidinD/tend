# Storage: how concurrent writers stay safe

Tend's data is written by up to three kinds of process at once, on more than one
machine, inside a folder Dropbox is actively syncing:

- the **Electron app**, when someone does something in the UI
- the **MCP server**, when Claude Code or Helm logs a promise or a check-in
- a **scheduled job**, when a nightly pass extracts promises from new Nib notes

None of them can assume the others are stopped, and the MCP server must keep
working when the app is closed. That rules out the two obvious designs: a single
JSON file rewritten in place, and a lock held by whichever process is "the
owner".

## The design

**Every change is an append-only event, and every writer owns its own file.**

```
<dataDir>/events/
  desktop-app.jsonl
  desktop-mcp.jsonl
  desktop-job.jsonl
  laptop-app.jsonl
```

A writer id is `<machine>-<role>`. Two processes never append to the same file,
so two processes never touch the same bytes. Current state is produced by
reading every file, merging the events into one order, and replaying them.

That single decision removes most of the problem:

- **No lost update.** Nobody rewrites a file, so nobody overwrites anyone.
- **No Dropbox conflicted copy.** Dropbox produces those when the same file is
  modified in two places. Here each file has exactly one author on exactly one
  machine, so Dropbox only ever has to move bytes.
- **No lock, and no dependency on the app running.** The MCP server appends to
  its own file whether or not Electron is open.
- **History is free.** Nothing is ever destroyed, so "what did this look like in
  June" is answerable, and a bad automated write can be inspected rather than
  guessed at.

## Ordering

Events sort by `(ts, writerId, seq)`:

- `ts` is the writer's wall clock in milliseconds
- `writerId` breaks ties between machines, deterministically rather than by luck
- `seq` is a per-writer counter that separates events inside one millisecond

The same set of files therefore always reduces to the same state, on any
machine, in any read order. This is what makes the app and the MCP server agree
without talking to each other.

Clock skew between two machines can reorder events that happened seconds apart.
For this data - promises, check-ins, notes about people - that is harmless: the
entities are nearly always touched by one writer at a time, and the resolution
below handles the rest. It would not be acceptable for, say, financial ledgers.

## Conflict resolution

Updates are field-level last-write-wins, decided by event order rather than by
which process reached the disk first. If the MCP server sets a promise's due
date while the app resolves it, both changes survive: the row ends up resolved
*and* dated.

Two edge cases are handled explicitly, because they are normal across two
machines rather than exotic:

- **An update that arrives before its create** keeps the update's fields; the
  later create fills in only what is missing. Without this, a slow-syncing
  create would silently undo an edit.
- **A replayed create** does not clobber later edits, for the same reason.

## Surviving a folder that is mid-sync

Two failure modes come from Dropbox itself, and both are handled rather than
avoided.

**A torn line.** A file can be read while only part of the newest line has
arrived. The reader parses line by line and skips anything that is not valid
JSON *and* not shaped like an event. The line is picked up whole on the next
read. The store reports how many lines it skipped rather than swallowing it
silently.

**A locked file.** Windows will refuse a write while Dropbox or a virus scanner
holds the file open. The writer retries five times with backoff (20 ms up to
320 ms), and if the file is still unwritable it rolls over to a numbered spill
file - `desktop-app.1.jsonl` - and carries on. The reader treats every segment
as part of the same stream, so a rollover costs nothing but a file. This is
reported as a warning, because a machine that rolls over constantly has a real
problem worth seeing.

## Compaction

There is none, on purpose.

Realistic volume is a few hundred events per month. At roughly 150 bytes each
that is well under a megabyte per year, so the log stays trivially small for the
lifetime of the tool. Compaction would be the single most dangerous operation in
the system - it is the only one that would delete data - so not having it is a
feature. If the log ever does get unwieldy, rotate by year into
`events/2026/` rather than rewriting anything.

## What this does not solve

- **Semantic conflicts.** If two writers set the same field to different values
  within the same second, one wins. Nothing warns about it. For a single-user
  tool this is the right trade.
- **A corrupt or hostile writer.** Anything with write access to the folder can
  append anything. The reducer rejects unknown collections and actions and
  records them, but this is not a security boundary.
- **Deleting for real.** Tombstones hide rows; the events stay. Genuinely
  removing something means editing the log by hand, deliberately.

## Reading the code

| File | What it owns |
| --- | --- |
| `src/storage/events.js` | Event shape, writer ids, the total order |
| `src/storage/writer.js` | Appending, retries, rollover to a spill file |
| `src/storage/reader.js` | Listing segments, skipping bad lines, merging |
| `src/storage/reduce.js` | Replaying events into current state |
| `src/storage/store.js` | The API the app and the MCP server both use |

Every claim on this page has a test in `test/storage.test.mjs`. If a claim here
is not exercised there, it is a claim we have not earned.
