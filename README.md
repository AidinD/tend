# Tend

A desktop tool for the leadership half of an engineering job: the standing
responsibilities, the people, and the things that quietly slip when a week gets
busy.

Personal project. A sibling to [Jot](https://github.com/AidinD/jot) and
[Nib](https://github.com/AidinD/nib) rather than part of either.

## The idea

Most tools model a manager's work as a task list. It isn't one. It is a surface
that can be neglected, and the useful question is never "did I tick the box this
week" but "who have I not really spoken to in five weeks, and why is it always
the same person".

So Tend works differently in three ways:

- **Drift, not due dates.** Every cadence carries how far behind it is. There is
  no binary overdue state to learn to ignore.
- **It never asks for what it can derive.** Writing a 1-1 note about someone in
  Nib is the evidence that the conversation happened. No confirmations.
- **It shows only deviations.** When everything is in step the main view is
  nearly empty. That is the design, not a gap.

## Status

Usable. Install it and everything happens in the window: people, contact,
promises, the monthly questions, a focus, delegation levels, and binding Nib
folders to the people their notes are about. The Knowledge view is the one piece
still missing.

See [PLAN.md](PLAN.md) for where it stands and [DECISIONS.md](DECISIONS.md) for
why it is built this way.

## AI, and where it is not

The MCP server is the core. The Electron app is one client of it; Claude Code
and Helm are another, so anything the app can do can also be asked from outside.

The app stays fully usable with the model switched off. Drift, cadences,
promises and budgets are ordinary deterministic code - a radar that is
*usually* right is worse than none, because it gets trusted. The model only
reads prose and writes drafts, and everything it produces is labelled and can be
rejected in one click.

Three buttons use one: a brief before a conversation, reading one of your notes
for a commitment you wrote in passing, and naming what recurs across several
notes about the same person. Each is a button - nothing runs on a timer and
nothing runs when the window opens. It borrows the sign-in Claude Code already
has on the machine, so there is no key to store, and with Claude Code absent the
three buttons say so and everything else is unchanged.

## Storage

Data is an append-only event log with one file per writer, which lets the app,
the MCP server and a scheduled job all write at once, on more than one machine,
inside a folder Dropbox is syncing - without locks and without lost updates.

[docs/storage.md](docs/storage.md) explains the design, the failure modes it
handles, and the ones it does not.

Wire the MCP server into Claude Code and it works today, app or no app. See
[docs/mcp.md](docs/mcp.md).

## Development

Tend depends on [**keel**](https://github.com/AidinD/keel), the shared layer
under the suite, linked from the filesystem - so it has to be checked out
**next to** this repo before `npm install` will work:

```
Tools/
├── tend/
└── keel/
```

```bash
git clone https://github.com/AidinD/keel ../keel
npm install
npm run dev
```

Without the sibling checkout `npm install` still exits 0, linking `file:../keel`
to a dangling symlink — the app then fails at its first import instead. Unlike in
Jot, keel is a real dependency here and ships inside the app: Tend has no
bundler, so `keel/window` is still an import at runtime and electron-builder has
to pack it.

```bash
npm test
```

```bash
npm run test:e2e
```

```bash
npm run test:app
```

```bash
npm run typecheck
```

```bash
npm run seed
```

```bash
npm run package
```

```bash
npm run release
```

`test:app` launches its own Electron instance against a scratch data directory
and drives it over the Chrome DevTools Protocol - it reads the DOM and clicks by
selector rather than moving the pointer, so it never fights whoever is using the
machine. It kills only the process it started.

The source is plain JavaScript with JSDoc types, checked by `tsc`. No build step
for the storage layer, deliberately: the MCP server imports it directly.

## Licence

MIT.
