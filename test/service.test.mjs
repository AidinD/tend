/**
 * Tests for the service layer and the MCP tool surface.
 *
 * The write-boundary tests near the bottom matter most: an agent may add rows
 * and propose duties, and must not be able to decide what the job is.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import * as api from "../src/service/api.js";
import { TOOLS, callTool, toolManifest } from "../src/mcp/tools.js";
import { openStore } from "../src/storage/store.js";
import { DAY_MS } from "../src/domain/time.js";
import { failed, ok } from "./helpers.mjs";

const NOW = 1_800_000_000_000;
/** @param {number} n */
const daysAgo = (n) => NOW - n * DAY_MS;

/** @type {string} */
let dir;
/** @type {import("../src/storage/store.js").TendStore} */
let store;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tend-svc-"));
  let t = NOW - 1_000_000;
  store = openStore({ dataDir: dir, role: "app", host: "test", now: () => t++ });

  store.create("duties", {
    id: "d-1to1",
    name: "1-1",
    subjectKind: "person",
    cadenceDays: 14,
    evidenceKinds: ["one-to-one"],
    relations: ["lead-and-manage", "manage-remotely"],
    guarded: true,
    status: "active"
  });
  store.create("duties", {
    id: "d-remote",
    name: "Second-hand read",
    subjectKind: "person",
    cadenceDays: 30,
    evidenceKinds: ["second-hand"],
    relations: ["manage-remotely"],
    guarded: true,
    status: "active"
  });

  store.create("people", { id: "nadia", name: "Nadia Ohlsson", relation: "lead-and-manage", since: daysAgo(200) });
  store.create("people", { id: "johan", name: "Johan Lind", relation: "manage-remotely", since: daysAgo(200) });
  store.create("people", { id: "marta", name: "Marta Sund", relation: "lead-only", since: daysAgo(200) });
  store.create("projects", { id: "tidepool", name: "Tidepool", since: daysAgo(200) });

  store.create("touches", { id: "t1", subject: "nadia", kind: "one-to-one", at: daysAgo(13) });
  store.create("touches", { id: "t2", subject: "johan", kind: "one-to-one", at: daysAgo(42) });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("finding a person by what a human would type", () => {
  it("matches a first name", () => {
    const r = api.resolvePerson(store, "nadia");
    assert.ok(r.ok && r.person.id === "nadia");
  });

  it("matches an id", () => {
    const r = api.resolvePerson(store, "johan");
    assert.ok(r.ok && r.person.name === "Johan Lind");
  });

  it("refuses an ambiguous match rather than guessing", () => {
    // "mar" hits both Nadia and Marta. Logging a promise against the wrong
    // person is worse than an error.
    const r = api.resolvePerson(store, "mar");
    assert.equal(r.ok, false);
    assert.match(r.error, /matches 2 people/);
    assert.match(r.error, /Nadia Ohlsson/);
  });

  it("lists who it does know when it finds nobody", () => {
    const r = api.resolvePerson(store, "nobody");
    assert.equal(r.ok, false);
    assert.match(r.error, /Known: Nadia Ohlsson, Johan Lind, Marta Sund/);
  });
});

describe("reading", () => {
  it("answers 'what needs me' in one call, sorted", () => {
    const a = api.attention(store, NOW);
    assert.equal(a.allInStep, false);
    assert.ok(a.needsYou.length > 0);
    assert.equal(a.needsYou[0].urgency, "critical");
    assert.match(a.needsYou[0].what, /Johan/);
  });

  it("explains what a relationship type means, so an agent need not guess", () => {
    const p = ok(api.person(store, "johan", NOW));
    assert.equal(p.relation, "manage-remotely");
    assert.match(String(p.relationMeans), /mandate and none of the observation/);
  });

  it("shows each cadence for a person with how far behind it is", () => {
    const p = ok(api.person(store, "johan", NOW));
    const names = p.cadences.map((c) => c.duty).sort();
    assert.deepEqual(names, ["1-1", "Second-hand read"]);
    assert.equal(p.cadences.find((c) => c.duty === "Second-hand read")?.lastHappened, "never");
  });

  it("filters the roster by relationship type", () => {
    const remote = api.people(store, NOW, "manage-remotely");
    assert.deepEqual(remote.map((p) => p.name), ["Johan Lind"]);
  });

  it("reports an unknown person as data, not as an exception", () => {
    const p = api.person(store, "who", NOW);
    assert.ok(p.error);
  });
});

describe("adding people and projects", () => {
  it("adds a person with a relationship type", () => {
    const r = ok(api.addPerson(store, { name: "Signe Wahlström", relation: "manage-remotely", now: NOW }));
    assert.ok(r.id);
    assert.equal(api.people(store, NOW, "manage-remotely").length, 2);
  });

  it("keeps the diacritics in a Swedish name", () => {
    api.addPerson(store, { name: "Signe Wahlström", relation: "lead-only", now: NOW });
    assert.ok(store.rows("people").some((p) => p.name === "Signe Wahlström"));
  });

  it("honours `since`, so somebody taken on months ago is not treated as new", () => {
    api.addPerson(store, { name: "Old Hand", relation: "manage-remotely", since: daysAgo(200), now: NOW });
    const a = api.attention(store, NOW);
    assert.ok(
      a.needsYou.some((/** @type {any} */ i) => /Old Hand/.test(i.what)),
      "200 days with no contact should surface immediately"
    );
  });

  it("defaults `since` to now, so a fresh addition does not accuse him on day one", () => {
    api.addPerson(store, { name: "Brand New", relation: "manage-remotely", now: NOW });
    const a = api.attention(store, NOW);
    assert.equal(a.needsYou.some((/** @type {any} */ i) => /Brand New/.test(i.what)), false);
  });

  it("refuses an unknown relationship type", () => {
    assert.match(String(api.addPerson(store, { name: "X", relation: "skip-level", now: NOW }).error), /Unknown relationship/);
  });

  it("refuses a duplicate rather than creating a second row for one person", () => {
    const r = api.addPerson(store, { name: "nadia ek", relation: "lead-only", now: NOW });
    assert.match(String(r.error), /already here/);
  });

  it("changes a relationship, and the duties that apply change with it", () => {
    const before = ok(api.person(store, "nadia", NOW)).cadences.map((/** @type {any} */ c) => c.duty).sort();
    assert.deepEqual(before, ["1-1"]);

    ok(api.setRelation(store, "nadia", "manage-remotely"));

    const after = ok(api.person(store, "nadia", NOW));
    assert.deepEqual(after.cadences.map((/** @type {any} */ c) => c.duty).sort(), ["1-1", "Second-hand read"]);
    assert.equal(
      after.cadences.find((/** @type {any} */ c) => c.duty === "1-1")?.behindBy,
      "on time",
      "his history came with him"
    );
  });

  it("adds a project", () => {
    assert.ok(ok(api.addProject(store, { name: "Lodestar", now: NOW })).id);
    assert.equal(api.projects(store, NOW).length, 2);
  });
});

describe("writing", () => {
  it("logs a promise against a person found by first name", () => {
    const r = api.logPromise(store, { person: "nadia", text: "Answer on the render pass", now: NOW });
    assert.ok(!r.error);
    const open = api.promises(store, NOW);
    assert.equal(open.length, 1);
    assert.equal(open[0].to, "Nadia Ohlsson");
  });

  it("honours madeAt so a promise extracted from an old note ages correctly", () => {
    api.logPromise(store, { person: "nadia", text: "Ask Nina", madeAt: daysAgo(20), now: NOW });
    const [p] = api.promises(store, NOW);
    assert.equal(p.urgency, "critical", "20 days old, not brand new");
  });

  it("refuses an empty promise", () => {
    assert.ok(api.logPromise(store, { person: "nadia", text: "   ", now: NOW }).error);
  });

  it("resets the right cadence and only the right one", () => {
    const before = ok(api.person(store, "johan", NOW));
    assert.equal(before.cadences.find((c) => c.duty === "1-1")?.behindBy, "+4w");

    api.logTouch(store, { subject: "johan", kind: "second-hand", note: "Nova's lead", now: NOW });

    const after = ok(api.person(store, "johan", NOW));
    // "today", not "today ago". The test used to assert the second, which is
    // how the wording survived on the person page after Prep had already fixed
    // it - a test can pin a bug in place as firmly as it pins a feature.
    assert.equal(after.cadences.find((c) => c.duty === "Second-hand read")?.lastHappened, "today");
    assert.equal(
      after.cadences.find((c) => c.duty === "1-1")?.behindBy,
      "+4w",
      "hearing about him from someone else does not count as having spoken to him"
    );
  });

  it("accepts a project as a touch subject too", () => {
    const r = api.logTouch(store, { subject: "Tidepool", kind: "check-in", now: NOW });
    assert.ok(!r.error);
    assert.match(String(r.logged), /Tidepool/);
  });

  it("requires a kind on a touch, since kinds are not interchangeable", () => {
    assert.ok(api.logTouch(store, { subject: "nadia", kind: "", now: NOW }).error);
  });

  it("logs evidence with no person, for his own coordinating work", () => {
    const r = api.logEvidence(store, { text: "Pulled the four leads onto one plan", area: "team-lead", now: NOW });
    assert.ok(!r.error);
    assert.equal(store.rows("evidence").length, 1);
    assert.equal(store.rows("evidence")[0].person, null);
  });

  it("closes a promise", () => {
    const { id } = api.logPromise(store, { person: "nadia", text: "x", now: NOW });
    api.resolvePromise(store, String(id));
    assert.equal(api.promises(store, NOW).length, 0);
  });
});

describe("the write boundary", () => {
  it("lands a proposed duty as a proposal, never active", () => {
    api.proposeDuty(store, {
      name: "Protected thinking time",
      means: "90 minutes a week, held like a meeting.",
      source: "High Output Management",
      subjectKind: "person",
      cadenceDays: 7
    });
    const map = api.roleMap(store, NOW);
    assert.equal(map.proposed.length, 1);
    assert.equal(map.active.find((d) => d.name === "Protected thinking time"), undefined);
  });

  it("keeps a proposal out of the attention view entirely", () => {
    const before = api.attention(store, NOW);
    api.proposeDuty(store, {
      name: "Something demanding",
      means: "Every single day.",
      source: "test",
      subjectKind: "person",
      cadenceDays: 1
    });
    const after = api.attention(store, NOW);
    assert.equal(after.needsYou.length, before.needsYou.length, "a proposal cannot start nagging on its own");
    assert.equal(after.nudges.length, before.nudges.length);
  });

  it("rejects a proposal naming a relationship type that does not exist", () => {
    const r = api.proposeDuty(store, {
      name: "x",
      means: "y",
      source: "z",
      subjectKind: "person",
      cadenceDays: 7,
      relations: ["skip-level"]
    });
    assert.match(String(r.error), /Unknown relationship type/);
  });

  it("records who proposed it, so a book's idea is distinguishable from his own", () => {
    let t = NOW;
    const agent = openStore({ dataDir: dir, role: "mcp", host: "test", now: () => t++ });
    api.proposeDuty(agent, {
      name: "From an agent",
      means: "y",
      source: "The Manager's Path, ch. 4",
      subjectKind: "person",
      cadenceDays: 30
    });
    const map = api.roleMap(store, NOW);
    const row = map.proposed.find((d) => d.name === "From an agent");
    assert.equal(row?.proposedBy, "test-mcp");
    assert.equal(row?.source, "The Manager's Path, ch. 4");
  });

  it("only activates a duty through decideDuty, which MCP does not expose", () => {
    assert.equal(
      TOOLS.find((t) => /decide|accept|activate/i.test(t.name)),
      undefined,
      "no MCP tool may change a duty's status"
    );

    api.proposeDuty(store, { name: "x", means: "y", source: "z", subjectKind: "person", cadenceDays: 30 });
    const id = String(api.roleMap(store, NOW).proposed[0].id);
    api.decideDuty(store, id, "active");
    assert.equal(api.roleMap(store, NOW).active.some((d) => d.id === id), true);
  });
});

describe("the MCP surface", () => {
  it("exposes every tool with a schema and a description that says when to use it", () => {
    for (const t of toolManifest()) {
      assert.ok(t.description.length > 60, `${t.name} needs a description that helps an agent choose it`);
      assert.equal(t.inputSchema.type, "object");
      assert.equal(t.inputSchema.additionalProperties, false, `${t.name} should reject unknown arguments`);
    }
  });

  it("declares every required argument in its own properties", () => {
    for (const t of toolManifest()) {
      for (const req of t.inputSchema.required ?? []) {
        assert.ok(t.inputSchema.properties[req], `${t.name} requires "${req}" but does not describe it`);
      }
    }
  });

  it("runs a read tool", () => {
    const r = callTool(store, "tend_attention", {}, NOW);
    assert.ok(Array.isArray(r.needsYou));
  });

  it("runs a write tool and the read tools see it", () => {
    callTool(store, "tend_log_promise", { person: "nadia", text: "Ask about the conference" }, NOW);
    assert.equal(callTool(store, "tend_promises", {}, NOW).length, 1);
  });

  it("returns a usable message for an unknown tool", () => {
    const r = callTool(store, "tend_delete_everything", {}, NOW);
    assert.match(r.error, /Unknown tool/);
    assert.match(r.error, /tend_attention/);
  });

  it("turns a thrown error into data rather than crashing the server", () => {
    const broken = /** @type {any} */ ({ rows: () => { throw new Error("disk gone"); }, state: () => { throw new Error("disk gone"); } });
    const r = callTool(broken, "tend_promises", {}, NOW);
    assert.match(r.error, /tend_promises failed: disk gone/);
  });
});

describe("correcting a person", () => {
  it("renames without losing anything pointed at them", () => {
    const id = ok(api.addPerson(store, { name: "Rasmus Falk", relation: "manage-remotely", now: NOW })).id;
    ok(api.logPromise(store, { person: id, text: "svara om renderingen", now: NOW }));

    ok(api.updatePerson(store, id, { name: "Rasmus Falk" }));

    const after = ok(api.person(store, "Rasmus", NOW));
    assert.equal(after.name, "Rasmus Falk");
    assert.equal(after.openPromises.length, 1, "everything holds the id, so a rename costs nothing");
  });

  it("refuses a name somebody else already has", () => {
    ok(api.addPerson(store, { name: "Nina Berg", relation: "lead-and-manage", now: NOW }));
    const other = ok(api.addPerson(store, { name: "Tom Ek", relation: "lead-and-manage", now: NOW })).id;
    // Two people with one name makes both unreachable from Ctrl+K, which
    // refuses on an ambiguous match rather than guessing.
    assert.match(failed(api.updatePerson(store, other, { name: "nina berg" })), /already called/);
  });

  it("moves the date every cadence measures from", () => {
    const id = ok(api.addPerson(store, { name: "Nina Berg", relation: "lead-and-manage", now: NOW })).id;

    const fresher = ok(api.person(store, id, NOW)).cadences[0];
    ok(api.updatePerson(store, id, { since: NOW - 200 * DAY_MS }));
    const backdated = ok(api.person(store, id, NOW)).cadences[0];

    assert.notEqual(backdated.behindBy, fresher.behindBy, "a placeholder start date is a wrong answer, not a blank one");
  });

  it("refuses an unknown relationship rather than storing it", () => {
    const id = ok(api.addPerson(store, { name: "Nina Berg", relation: "lead-and-manage", now: NOW })).id;
    assert.match(failed(api.updatePerson(store, id, { relation: "friend" })), /Unknown relationship/);
  });

  it("changes nothing when handed nothing", () => {
    const id = ok(api.addPerson(store, { name: "Nina Berg", relation: "lead-and-manage", now: NOW })).id;
    assert.deepEqual(ok(api.updatePerson(store, id, {})).changed, []);
  });
});
