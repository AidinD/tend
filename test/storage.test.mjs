/**
 * Tests for the concurrency guarantees the storage layer claims.
 *
 * Each test maps to one sentence in docs/storage.md. If a claim there is not
 * exercised here, it is a claim we have not earned.
 */

import assert from "node:assert/strict";
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { compareEvents, makeEventFactory, writerId } from "../src/storage/events.js";
import { listSegments, readAll } from "../src/storage/reader.js";
import { reduce, rows } from "../src/storage/reduce.js";
import { openStore } from "../src/storage/store.js";
import { EventWriter, segmentPath } from "../src/storage/writer.js";

/** @type {string} */
let dir;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tend-test-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/**
 * A clock that advances by one millisecond per call, so events from different
 * writers interleave the way they would in real use.
 *
 * @param {number} [start]
 */
function tickingClock(start = 1_700_000_000_000) {
  let t = start;
  return () => t++;
}

describe("writer identity", () => {
  it("keeps two roles on one machine apart", () => {
    assert.notEqual(writerId("app", "DESKTOP-01"), writerId("mcp", "DESKTOP-01"));
  });

  it("keeps one role on two machines apart", () => {
    assert.notEqual(writerId("app", "desktop"), writerId("app", "laptop"));
  });

  it("normalises the machine name so a file name is always safe", () => {
    assert.equal(writerId("app", "Someone's PC!"), "someone-s-pc-app");
  });

  it("refuses an unknown role rather than inventing a file", () => {
    assert.throws(() => writerId("agent"), /Unknown writer role/);
  });
});

describe("ordering", () => {
  it("is total and deterministic across writers", () => {
    const a = { id: "x", ts: 5, w: "b-app", seq: 0, op: "o", p: {} };
    const b = { id: "y", ts: 5, w: "a-app", seq: 9, op: "o", p: {} };
    const c = { id: "z", ts: 4, w: "z-app", seq: 0, op: "o", p: {} };

    const sorted = [a, b, c].sort(compareEvents).map((e) => e.id);
    assert.deepEqual(sorted, ["z", "y", "x"]);
  });

  it("produces the same state regardless of the order files are read in", () => {
    const events = [];
    const app = makeEventFactory("desktop-app", tickingClock());
    const mcp = makeEventFactory("desktop-mcp", tickingClock());

    events.push(app("people.create", { id: "p1", name: "Nadia" }));
    events.push(mcp("people.update", { id: "p1", relation: "lead-and-manage" }));
    events.push(app("people.update", { id: "p1", relation: "lead-only" }));

    const forward = reduce([...events].sort(compareEvents));
    const backward = reduce([...events].reverse().sort(compareEvents));

    assert.equal(forward.c.people.p1.relation, backward.c.people.p1.relation);
    assert.equal(forward.c.people.p1.relation, "lead-only");
  });
});

describe("concurrent writers", () => {
  it("never share a file, so nothing is lost when both write", () => {
    const app = openStore({ dataDir: dir, role: "app", host: "desktop", now: tickingClock() });
    const mcp = openStore({ dataDir: dir, role: "mcp", host: "desktop", now: tickingClock(1_700_000_000_500) });

    app.create("people", { id: "p1", name: "Nadia" });
    mcp.create("promises", { id: "pr1", person: "p1", text: "render pass answer" });
    app.create("touches", { id: "t1", person: "p1", kind: "1-1" });
    mcp.create("promises", { id: "pr2", person: "p1", text: "conference" });

    const segments = listSegments(join(dir, "events")).map((p) => p.split(/[\\/]/).pop());
    assert.deepEqual(segments.sort(), ["desktop-app.jsonl", "desktop-mcp.jsonl"]);

    const state = reduce(readAll(join(dir, "events")).events);
    assert.equal(rows(state, "people").length, 1);
    assert.equal(rows(state, "promises").length, 2);
    assert.equal(rows(state, "touches").length, 1);
  });

  it("resolves a genuine conflict field by field, latest wins", () => {
    const clock = tickingClock();
    const app = openStore({ dataDir: dir, role: "app", host: "desktop", now: clock });
    const mcp = openStore({ dataDir: dir, role: "mcp", host: "desktop", now: clock });

    app.create("promises", { id: "pr1", text: "ask Nina", due: null, state: "open" });
    mcp.update("promises", "pr1", { due: "2026-08-29" });
    app.update("promises", "pr1", { state: "resolved" });

    const state = reduce(readAll(join(dir, "events")).events);
    const row = state.c.promises.pr1;

    assert.equal(row.state, "resolved");
    assert.equal(row.due, "2026-08-29", "the other writer's field survives");
    assert.equal(row.text, "ask Nina");
  });

  it("tolerates an update that arrives before its create", () => {
    const clock = tickingClock();
    const early = makeEventFactory("laptop-mcp", clock);
    const late = makeEventFactory("desktop-app", clock);

    const update = early("people.update", { id: "p9", relation: "equal-lead" });
    const create = late("people.create", { id: "p9", name: "Sofia", relation: "unknown" });

    const state = reduce([update, create].sort(compareEvents));
    assert.equal(state.c.people.p9.name, "Sofia");
    assert.equal(state.c.people.p9.relation, "equal-lead", "the later create must not clobber the edit");
  });
});

describe("a folder Dropbox is syncing", () => {
  it("skips a torn line and reads everything around it", () => {
    const store = openStore({ dataDir: dir, role: "app", host: "desktop", now: tickingClock() });
    store.create("people", { id: "p1", name: "Nadia" });
    store.create("people", { id: "p2", name: "Priya" });

    // Simulate a half-synced append landing between two whole lines.
    const path = segmentPath(join(dir, "events"), "desktop-app", 0);
    const lines = readFileSync(path, "utf8").split("\n").filter(Boolean);
    writeFileSync(path, `${lines[0]}\n{"id":"broken","ts":17000000\n${lines[1]}\n`, "utf8");

    const { events, skipped } = readAll(join(dir, "events"));
    assert.equal(skipped, 1);
    assert.equal(events.length, 2);
    assert.deepEqual(
      reduce(events).c.people && Object.keys(reduce(events).c.people).sort(),
      ["p1", "p2"]
    );
  });

  it("skips a line that parses but is not an event", () => {
    const eventsDir = join(dir, "events");
    const store = openStore({ dataDir: dir, role: "app", host: "desktop", now: tickingClock() });
    store.create("people", { id: "p1", name: "Nadia" });

    appendFileSync(segmentPath(eventsDir, "desktop-app", 0), '{"hello":"world"}\n', "utf8");

    const { events, skipped } = readAll(eventsDir);
    assert.equal(skipped, 1);
    assert.equal(events.length, 1);
  });

  it("rolls over to a spill file when the primary stays locked, losing nothing", () => {
    const eventsDir = join(dir, "events");
    const locked = segmentPath(eventsDir, "desktop-app", 0);
    /** @type {string[]} */
    const warnings = [];

    const writer = new EventWriter({
      dir: eventsDir,
      w: "desktop-app",
      sleep: () => {},
      onRollover: (m) => warnings.push(m),
      appendImpl: (path, line) => {
        if (path === locked) {
          const err = new Error("EPERM: operation not permitted");
          /** @type {NodeJS.ErrnoException} */ (err).code = "EPERM";
          throw err;
        }
        appendFileSync(path, line, { encoding: "utf8" });
      }
    });

    const event = makeEventFactory("desktop-app", tickingClock());
    const landed = writer.append(event("people.create", { id: "p1", name: "Nadia" }));

    assert.equal(landed, segmentPath(eventsDir, "desktop-app", 1));
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /EPERM/);

    const { events } = readAll(eventsDir);
    assert.equal(events.length, 1, "the event survived the lock");
  });

  it("reads primary and spill segments as one stream", () => {
    const eventsDir = join(dir, "events");
    const clock = tickingClock();
    const event = makeEventFactory("desktop-app", clock);

    const writer = new EventWriter({ dir: eventsDir, w: "desktop-app", sleep: () => {} });
    writer.append(event("people.create", { id: "p1", name: "Nadia" }));
    writer.rollover();
    writer.append(event("people.update", { id: "p1", relation: "lead-and-manage" }));

    assert.equal(listSegments(eventsDir).length, 2);
    const state = reduce(readAll(eventsDir).events);
    assert.equal(state.c.people.p1.relation, "lead-and-manage");
  });

  it("gives back nothing rather than throwing when the log does not exist yet", () => {
    const { events, skipped, files } = readAll(join(dir, "no-such-dir"));
    assert.deepEqual(events, []);
    assert.equal(skipped, 0);
    assert.deepEqual(files, []);
  });
});

describe("store behaviour", () => {
  it("does not re-read when nothing changed", () => {
    const store = openStore({ dataDir: dir, role: "app", host: "desktop", now: tickingClock() });
    store.create("people", { id: "p1", name: "Nadia" });

    const first = store.state();
    const second = store.state();
    assert.equal(first, second, "the same object comes back, so no reparse happened");
  });

  it("re-reads after another process writes", () => {
    const app = openStore({ dataDir: dir, role: "app", host: "desktop", now: tickingClock() });
    const mcp = openStore({ dataDir: dir, role: "mcp", host: "desktop", now: tickingClock(1_700_000_100_000) });

    app.create("people", { id: "p1", name: "Nadia" });
    assert.equal(app.rows("people").length, 1);

    mcp.create("people", { id: "p2", name: "Priya" });
    assert.equal(app.rows("people").length, 2, "the app sees the MCP server's write");
  });

  it("tombstones rather than deletes, keeping history readable", () => {
    const store = openStore({ dataDir: dir, role: "app", host: "desktop", now: tickingClock() });
    const id = store.create("promises", { text: "ask Nina" });
    store.remove("promises", id);

    assert.equal(store.rows("promises").length, 0);
    assert.equal(readAll(join(dir, "events")).events.length, 2, "both events are still on disk");
  });

  it("records who wrote each row, so generated content can be labelled", () => {
    const clock = tickingClock();
    const app = openStore({ dataDir: dir, role: "app", host: "desktop", now: clock });
    const job = openStore({ dataDir: dir, role: "job", host: "desktop", now: clock });

    app.create("people", { id: "p1", name: "Nadia" });
    job.create("promises", { id: "pr1", person: "p1", text: "extracted from a note" });
    job.update("people", "p1", { themes: ["architecture"] });

    const state = app.state(true);
    assert.equal(state.c.people.p1._by, "desktop-app");
    assert.equal(state.c.promises.pr1._by, "desktop-job", "an agent's write is attributable");
    assert.equal(state.c.people.p1._editedBy, "desktop-job");
  });

  it("keeps one focus at a time", () => {
    const store = openStore({ dataDir: dir, role: "app", host: "desktop", now: tickingClock() });
    store.emit("focus.set", { id: "f1", name: "Get Skiff running", budget: 0.5 });
    assert.equal(store.focus()?.name, "Get Skiff running");

    store.emit("focus.set", { id: "f2", name: "Q3 reviews", budget: 0.3 });
    assert.equal(store.focus()?.id, "f2");

    store.emit("focus.end", {});
    assert.equal(store.focus(), null);
  });

  it("records an unusable event instead of failing the whole read", () => {
    const store = openStore({ dataDir: dir, role: "app", host: "desktop", now: tickingClock() });
    store.create("people", { id: "p1", name: "Nadia" });
    store.emit("aliens.create", { id: "x1" });
    store.emit("people.frobnicate", { id: "p1" });

    const state = store.state(true);
    assert.equal(state.applied, 1);
    assert.equal(state.rejected.length, 2);
    assert.equal(state.rejected[0].reason, "unknown collection");
    assert.equal(state.rejected[1].reason, "unknown action");
  });
});
