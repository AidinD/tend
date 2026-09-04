/**
 * Tests for the change watcher.
 *
 * The one that matters is that a writer does not hear its own writes back. Get
 * that wrong and every action in the window redraws twice - which looks like a
 * flicker and reads like the watcher being what keeps the app current, when in
 * fact the action already did.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { belongsTo, watchEvents } from "../src/storage/watch.js";

describe("whose segment is it", () => {
  it("recognises a writer's own segments", () => {
    assert.equal(belongsTo("desktop-app.jsonl", "desktop-app"), true);
    assert.equal(belongsTo("desktop-app.7.jsonl", "desktop-app"), true);
  });

  it("does not claim another writer's", () => {
    assert.equal(belongsTo("desktop-mcp.jsonl", "desktop-app"), false);
    assert.equal(belongsTo("desktop-job.2.jsonl", "desktop-app"), false);
  });

  it("does not claim a writer whose id merely starts the same way", () => {
    // "desktop-app-two" starts with "desktop-app". A plain startsWith would
    // silently swallow every write from that machine.
    assert.equal(belongsTo("desktop-app-two.jsonl", "desktop-app"), false);
  });
});

describe("watching a directory", () => {
  /** @type {string} */
  let dir;
  /** @type {(() => void) | null} */
  let stop = null;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "tend-watch-"));
  });

  afterEach(() => {
    stop?.();
    stop = null;
    rmSync(dir, { recursive: true, force: true });
  });

  /** @param {number} ms */
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

  it("reports another writer's append", async () => {
    let calls = 0;
    stop = watchEvents({ dir, self: "here-app", onChange: () => (calls += 1), settleMs: 30 });

    writeFileSync(join(dir, "elsewhere-mcp.jsonl"), "{}\n");
    await sleep(400);

    assert.equal(calls, 1);
  });

  it("stays silent about the watcher's own writer", async () => {
    let calls = 0;
    stop = watchEvents({ dir, self: "here-app", onChange: () => (calls += 1), settleMs: 30 });

    writeFileSync(join(dir, "here-app.jsonl"), "{}\n");
    await sleep(400);

    assert.equal(calls, 0);
  });

  it("collapses a burst into one report", async () => {
    let calls = 0;
    stop = watchEvents({ dir, self: "here-app", onChange: () => (calls += 1), settleMs: 120 });

    for (let i = 0; i < 5; i++) {
      writeFileSync(join(dir, "elsewhere-mcp.jsonl"), `{"n":${i}}\n`);
      await sleep(15);
    }
    await sleep(500);

    assert.equal(calls, 1, "a burst of notifications is one change, not five");
  });

  it("stops reporting once it is stopped", async () => {
    let calls = 0;
    const close = watchEvents({ dir, self: "here-app", onChange: () => (calls += 1), settleMs: 30 });
    close();

    writeFileSync(join(dir, "elsewhere-mcp.jsonl"), "{}\n");
    await sleep(300);

    assert.equal(calls, 0);
  });

  it("warns rather than throwing when the directory cannot be watched", () => {
    /** @type {string[]} */
    const warnings = [];
    // A path under a FILE cannot be created or watched.
    const file = join(dir, "not-a-directory");
    writeFileSync(file, "x");

    assert.doesNotThrow(() => {
      stop = watchEvents({
        dir: join(file, "events"),
        self: "here-app",
        onChange: () => {},
        onWarning: (msg) => warnings.push(msg)
      });
    });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /uppdateras bara när du navigerar/);
  });
});
