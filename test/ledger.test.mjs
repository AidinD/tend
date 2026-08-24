/**
 * Tests for the decision log.
 *
 * The write boundary matters most: an agent may propose, only the user records.
 * The rest is about the revisit date, which is the field that makes this a tool
 * rather than an archive - a decision that stops coming back has stopped being
 * useful, and there are three ways to lose it by accident.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import * as api from "../src/service/api.js";
import { DEFAULT_REVISIT_DAYS, revisitStatus, thin } from "../src/domain/decisions.js";
import { TOOLS, callTool } from "../src/mcp/tools.js";
import { openStore } from "../src/storage/store.js";
import { DAY_MS } from "../src/domain/time.js";
import { ok } from "./helpers.mjs";

const NOW = 1_800_000_000_000;

/** @type {string} */
let dir;
/** @type {import("../src/storage/store.js").TendStore} */
let store;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tend-ledger-"));
  let t = NOW - 1_000_000;
  store = openStore({ dataDir: dir, role: "app", host: "test", now: () => t++ });
  store.create("people", { id: "p-nina", name: "Nina Berg", relation: "lead-and-manage" });
  store.create("people", { id: "p-tom", name: "Tom Ek", relation: "lead-and-manage" });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("recording a decision", () => {
  it("needs a sentence, and says so", () => {
    const result = api.logDecision(store, { what: "   ", now: NOW });
    assert.match(String(result.error), /needs a sentence/);
  });

  it("resolves who was consulted against the roster", () => {
    ok(api.logDecision(store, { what: "Not backfilling that role", consulted: ["Nina", "Tom"], now: NOW }));
    const [logged] = api.decisions(store, NOW);
    assert.deepEqual(logged.consulted, ["Nina Berg", "Tom Ek"]);
  });

  it("refuses the whole call when one name does not resolve", () => {
    // Dropping the unknown one would record "consulted two people" when three
    // were named, and nobody would ever notice.
    const result = api.logDecision(store, { what: "A thing", consulted: ["Nina", "Nobody"], now: NOW });
    assert.match(String(result.error), /Nobody/);
    assert.deepEqual(api.decisions(store, NOW), []);
  });

  it("sets a revisit date, because that is what makes it a tool", () => {
    ok(api.logDecision(store, { what: "Platform team owns the pipsignee", now: NOW }));
    const [logged] = api.decisions(store, NOW);
    assert.equal(logged.revisitAt, NOW + DEFAULT_REVISIT_DAYS * DAY_MS);
    assert.equal(logged.revisitDue, false);
  });

  it("says what the record is missing without refusing it", () => {
    // Advice, not validation. A decision with only its text still beats one
    // nobody wrote down.
    const result = ok(api.logDecision(store, { what: "Something terse", now: NOW }));
    assert.equal(result.missing.length, 3);
    assert.match(result.missing.join(" "), /why/);
  });
});

describe("the revisit date", () => {
  it("comes due, and says how overdue", () => {
    ok(api.logDecision(store, { what: "A call worth revisiting", revisitDays: 30, now: NOW }));
    const later = NOW + 45 * DAY_MS;

    const [due] = api.revisitsDue(store, later);
    assert.equal(due.revisitDue, true);
    assert.match(String(due.revisitOverdueBy), /weeks|days/);
  });

  it("does not come due for a proposal, which has not been decided", () => {
    ok(api.logDecision(store, { what: "Maybe a decision", status: "proposed", source: "a note", now: NOW }));
    const [proposal] = api.decisions(store, NOW + 400 * DAY_MS);
    assert.equal(proposal.revisitAt, null);
    assert.deepEqual(api.revisitsDue(store, NOW + 400 * DAY_MS), []);
  });

  it("stops for a reversed decision, because that is history now", () => {
    const { id } = ok(api.logDecision(store, { what: "Superseded later", revisitDays: 1, now: NOW }));
    ok(api.decideDecision(store, id, { status: "reversed" }, NOW));
    assert.deepEqual(api.revisitsDue(store, NOW + 400 * DAY_MS), []);
  });

  it('"it still holds" pushes it out rather than deleting it', () => {
    // The common answer, and it has to cost one click. Without this the honest
    // move is to clear the date, and then it never comes back at all.
    const { id } = ok(api.logDecision(store, { what: "Still fine", revisitDays: 30, now: NOW }));
    const later = NOW + 40 * DAY_MS;
    assert.equal(api.revisitsDue(store, later).length, 1);

    ok(api.stillHolds(store, id, later, 60));

    assert.deepEqual(api.revisitsDue(store, later), []);
    const [after] = api.decisions(store, later);
    assert.equal(after.status, "revisited");
    assert.equal(after.revisitAt, later + 60 * DAY_MS);
  });

  it("refuses to revisit a proposal, which has not been decided yet", () => {
    const { id } = ok(api.logDecision(store, { what: "Maybe", status: "proposed", source: "a note", now: NOW }));
    assert.match(String(api.stillHolds(store, id, NOW).error), /proposal/);
  });
});

describe("the write boundary", () => {
  it("the MCP tool can only propose, whatever it is asked for", () => {
    // Load-bearing. An agent that both proposes and records is an agent writing
    // his decision log, and he would have no way to tell.
    const result = ok(
      callTool(store, "tend_propose_decision", { what: "An agent's suggestion", source: "Nib: a note", status: "recorded" }, NOW)
    );
    const [logged] = api.decisions(store, NOW);
    assert.equal(logged.status, "proposed");
    assert.equal(logged.revisitAt, null, "and no clock has started");
    assert.ok(result.id);
  });

  it("there is no MCP tool that records or accepts one", () => {
    const names = TOOLS.map((t) => t.name);
    for (const forbidden of ["tend_log_decision", "tend_decide_decision", "tend_record_decision"]) {
      assert.equal(names.includes(forbidden), false, `${forbidden} must not exist`);
    }
  });

  it("recording a proposal in the app is what starts the clock", () => {
    const { id } = ok(
      callTool(store, "tend_propose_decision", { what: "Read out of a 1-1", source: "Nib: 12 Aug" }, NOW)
    );
    const accepted = NOW + 3 * DAY_MS;
    ok(api.decideDecision(store, id, { status: "recorded" }, accepted));

    const [logged] = api.decisions(store, accepted);
    assert.equal(logged.status, "recorded");
    assert.equal(logged.revisitAt, accepted + DEFAULT_REVISIT_DAYS * DAY_MS);
    assert.equal(logged.decidedAt, accepted);
  });

  it("keeps where a proposal came from, so the claim is checkable", () => {
    ok(callTool(store, "tend_propose_decision", { what: "A thing", source: "Nib: 1-1 with Nina, 12 Aug" }, NOW));
    const [logged] = api.decisions(store, NOW);
    assert.equal(logged.source, "Nib: 1-1 with Nina, 12 Aug");
  });
});

describe("thin", () => {
  it("names the three fields that make a record survive being read later", () => {
    assert.equal(thin({ what: "x" }).length, 3);
    assert.equal(thin({ what: "x", because: "y", rejected: "z", consulted: ["a"] }).length, 0);
  });
});

describe("revisitStatus", () => {
  it("treats a missing date as not due, rather than as overdue since 1970", () => {
    assert.deepEqual(revisitStatus({ status: "recorded" }, NOW), { due: false, overdueDays: 0 });
    assert.deepEqual(revisitStatus({ status: "recorded", revisitAt: 0 }, NOW), { due: false, overdueDays: 0 });
  });
});
