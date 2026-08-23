# The MCP server

Tend's core is an MCP server, not the app. The Electron app is one client of it;
Claude Code and Helm are another. Anything the app can do can also be asked for
from outside, and the two can never disagree about what the data says.

It is a standalone Node process reading the same files on disk as the app, so it
works with the app closed. That is the entire reason it is MCP over files rather
than an HTTP API the app would have to be running to serve.

## Wiring it up

```json
{
  "mcpServers": {
    "tend": {
      "command": "node",
      "args": ["D:/Repo/Tools/tend/src/mcp/server.js"],
      "env": { "TEND_DATA_DIR": "D:/Dropbox/tend" }
    }
  }
}
```

`TEND_DATA_DIR` is optional; without it the server computes the same per-user
location Electron would, so both find the same folder either way.

Diagnostics go to stderr. Anything on stdout is protocol.

## Reading

| Tool | Answers |
| --- | --- |
| `tend_attention` | What needs him now, sorted, split into decisions and nudges |
| `tend_person` | Everything about one person, by name or part of one |
| `tend_people` | The roster, filterable by relationship type |
| `tend_promises` | Open promises, oldest first |
| `tend_role_map` | Active duties and pending proposals |
| `tend_focus` | Current focus, what it holds back, what it has cost |
| `tend_projects` | Projects by how long since each was looked at |

These return semantics, not rows. `tend_attention` gives an answer that is
already sorted and already counted, which is the point: an agent pulling raw
records and doing date arithmetic reintroduces exactly the unreliability the
deterministic core exists to prevent.

## Writing

| Tool | Adds |
| --- | --- |
| `tend_log_promise` | Something he said he would do |
| `tend_resolve_promise` | Closes one, kept or dropped |
| `tend_log_touch` | Contact that happened. This is what resets a cadence |
| `tend_log_evidence` | Something observed, for a review six months out |
| `tend_propose_duty` | A suggestion for the role map. Always a proposal |

### Kinds are not interchangeable

`tend_log_touch` takes a `kind`, and the distinction is load-bearing rather than
decorative. `one-to-one` is a conversation with the person. `second-hand` is
hearing about them from someone else. They satisfy different cadences on
purpose: if a second-hand report reset the 1-1 cadence, the blind spot the tool
exists to catch would close itself on paper while staying wide open in reality.

There is a test for this exact confusion.

### The write boundary

An agent may **add** rows: promises, contacts, observations. Those are additive
and attributable - every row records which writer created it, so anything a
model produced can be labelled as such.

An agent may **propose** a duty. It lands as `proposed` and does nothing until
it is accepted in the app.

An agent may **not** decide what the job is. There is no MCP tool that changes a
duty's status, adjusts a cadence, or sets a focus. `decideDuty` exists in the
service layer and is deliberately not exposed here, and there is a test that
fails if a tool matching `decide|accept|activate` ever appears in the manifest.

The boundary lives in the service layer rather than in the tool definitions, so
a second client cannot route around it.

## Errors come back as data

An unknown person returns `No person matching "X". Known: A, B, C.` rather than
throwing. An agent that gets that can correct itself; one that gets a stack
trace cannot. Ambiguous matches are refused rather than guessed, because logging
a promise against the wrong colleague is worse than an error message.

## Checking it works

```bash
npm run test:e2e
```

Starts the real server as a child process, drives it with a real MCP client
against a scratch directory, and checks the protocol handshake, the manifest,
the write boundary and the error shapes. The unit tests prove the tools behave;
this proves the process starts and speaks.
