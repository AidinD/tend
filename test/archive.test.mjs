/**
 * Tests for the archive mechanism: `archivedAt` on people, projects and
 * workstreams.
 *
 * The property that matters most is the one in `src/domain/archive.js`'s own
 * header: an archived row disappears from every view that assumes every row
 * is live, while everything ever recorded about it - touches, promises,
 * growth threads - stays exactly as it was and reappears the moment the row
 * is unarchived. A test that only checked "it disappears from the roster"
 * would pass just as happily against a delete.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import * as api from "../src/service/api.js";
import { TOOLS } from "../src/mcp/tools.js";
import { openStore } from "../src/storage/store.js";
import { prep } from "../src/service/prep.js";
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
  dir = mkdtempSync(join(tmpdir(), "tend-archive-"));
  let t = NOW - 1_000_000;
  store = openStore({ dataDir: dir, role: "app", host: "test", now: () => t++ });

  store.create("duties", {
    id: "d-1to1",
    name: "1-1",
    subjectKind: "person",
    cadenceDays: 14,
    evidenceKinds: ["one-to-one"],
    relations: ["lead-and-manage"],
    guarded: true,
    status: "active"
  });

  // 200 days with no contact, so this person surfaces in attention/prep the
  // moment they are not archived - the control for every "disappears" test.
  store.create("people", { id: "nadia", name: "Nadia Ohlsson", relation: "lead-and-manage", since: daysAgo(200) });
  store.create("projects", { id: "tidepool", name: "Strandkanten", since: daysAgo(200) });
  store.create("workstreams", { id: "ws-1", name: "Renderpipen", owner: "nadia", level: "watch", since: daysAgo(200) });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("archiving a person", () => {
  it("removes them from the roster but leaves the row resolvable", () => {
    assert.equal(api.people(store, NOW).some((p) => p.id === "nadia"), true);

    ok(api.archivePerson(store, "nadia", { now: NOW }));

    assert.equal(api.people(store, NOW).some((p) => p.id === "nadia"), false);
    const p = ok(api.person(store, "nadia", NOW));
    assert.equal(p.name, "Nadia Ohlsson");
    assert.equal(p.archivedAt, NOW);
  });

  it("stops surfacing them in attention, while keeping their history untouched", () => {
    // Before archiving: 200 days of silence is a critical cadence item.
    const before = api.attention(store, NOW);
    assert.ok(before.needsYou.some((i) => /Nadia/.test(i.what)));

    const { id: promiseId } = ok(api.logPromise(store, { person: "nadia", text: "Answer on the render pass", madeAt: daysAgo(20), now: NOW }));
    ok(api.logTouch(store, { subject: "nadia", kind: "one-to-one", note: "Kickoff", at: daysAgo(300), now: NOW }));

    ok(api.archivePerson(store, "nadia", { now: NOW }));

    const after = api.attention(store, NOW);
    assert.equal(after.needsYou.some((i) => /Nadia/.test(i.what)), false, "cadence drift stops nagging once archived");
    assert.equal(after.nudges.some((i) => /Nadia/.test(i.what)), false, "not even as a soft nudge");

    // The promise still exists and is still tied to her - archiving hides it
    // from "needs you", it does not resolve or delete it.
    assert.equal(store.rows("promises").find((p) => p.id === promiseId)?.text, "Answer on the render pass");
    assert.equal(store.rows("promises").find((p) => p.id === promiseId)?.status, undefined, "never resolved");

    // Her contact history is exactly as it was, still readable from the
    // person page.
    const page = ok(api.person(store, "nadia", NOW));
    assert.equal(page.recentContact.length, 1);
    assert.equal(page.recentContact[0].note, "Kickoff");
    assert.equal(page.openPromises.length, 1, "an open promise made to her is still hers to answer");
  });

  it("drops out of Prep, explicitly rather than by drift happening to read as zero", () => {
    const cards = prep(store, NOW).cards;
    assert.ok(cards.some((c) => c.person === "Nadia Ohlsson"));

    ok(api.archivePerson(store, "nadia", { now: NOW }));

    const after = prep(store, NOW).cards;
    assert.equal(after.some((c) => c.person === "Nadia Ohlsson"), false);
  });

  it("is idempotent: archiving twice does not move the timestamp", () => {
    const first = ok(api.archivePerson(store, "nadia", { now: NOW }));
    assert.equal(first.already, undefined);
    assert.equal(first.archivedAt, NOW);

    const second = ok(api.archivePerson(store, "nadia", { now: NOW + 10 * DAY_MS }));
    assert.equal(second.already, true);
    assert.equal(second.archivedAt, NOW, "re-archiving does not look freshly archived");
  });

  it("unarchiving restores visibility everywhere", () => {
    ok(api.archivePerson(store, "nadia", { now: NOW }));
    assert.equal(api.people(store, NOW).some((p) => p.id === "nadia"), false);

    ok(api.unarchivePerson(store, "nadia"));

    assert.equal(api.people(store, NOW).some((p) => p.id === "nadia"), true);
    assert.equal(ok(api.person(store, "nadia", NOW)).archivedAt, null);
    assert.ok(api.attention(store, NOW).needsYou.some((i) => /Nadia/.test(i.what)), "the drift was never gone, only hidden");
    assert.ok(prep(store, NOW).cards.some((c) => c.person === "Nadia Ohlsson"));
  });

  it("unarchiving somebody already active is a harmless no-op", () => {
    const r = ok(api.unarchivePerson(store, "nadia"));
    assert.equal(r.already, true);
  });

  it("refuses an unknown id rather than silently doing nothing", () => {
    assert.ok(failed(api.archivePerson(store, "not-a-real-id", { now: NOW })));
    assert.ok(failed(api.unarchivePerson(store, "not-a-real-id")));
  });

  it("appears in the archived list with none of the active people alongside it", () => {
    ok(api.archivePerson(store, "nadia", { now: NOW }));
    const archived = api.archivedPeople(store, NOW);
    assert.equal(archived.length, 1);
    assert.equal(archived[0].id, "nadia");
    assert.equal(archived[0].archivedAt, NOW);
  });
});

describe("archiving a project", () => {
  it("drops out of the default list and cadence crossing, and comes back on unarchive", () => {
    assert.ok(api.projects(store, NOW).some((p) => p.id === "tidepool"));

    ok(api.archiveProject(store, "tidepool", { now: NOW }));
    assert.equal(api.projects(store, NOW).some((p) => p.id === "tidepool"), false);
    assert.equal(api.archivedProjects(store, NOW).some((p) => p.id === "tidepool"), true);

    ok(api.unarchiveProject(store, "tidepool"));
    assert.ok(api.projects(store, NOW).some((p) => p.id === "tidepool"));
    assert.equal(api.archivedProjects(store, NOW).length, 0);
  });

  it("is idempotent", () => {
    const first = ok(api.archiveProject(store, "tidepool", { now: NOW }));
    const second = ok(api.archiveProject(store, "tidepool", { now: NOW + DAY_MS }));
    assert.equal(second.already, true);
    assert.equal(second.archivedAt, first.archivedAt);
  });
});

describe("archiving a workstream", () => {
  it("drops out of the default list and out of its owner's Prep card, and comes back on unarchive", () => {
    assert.ok(api.workstreams(store, NOW).some((w) => w.id === "ws-1"));
    const before = prep(store, NOW).cards.find((c) => c.person === "Nadia Ohlsson");
    assert.ok(before?.theyOwn.some((/** @type {any} */ w) => w.name === "Renderpipen"));

    ok(api.archiveWorkstream(store, "ws-1", { now: NOW }));
    assert.equal(api.workstreams(store, NOW).some((w) => w.id === "ws-1"), false);
    assert.equal(api.archivedWorkstreams(store, NOW).some((w) => w.id === "ws-1"), true);
    const after = prep(store, NOW).cards.find((c) => c.person === "Nadia Ohlsson");
    assert.equal(after?.theyOwn.some((/** @type {any} */ w) => w.name === "Renderpipen"), false);

    ok(api.unarchiveWorkstream(store, "ws-1"));
    assert.ok(api.workstreams(store, NOW).some((w) => w.id === "ws-1"));
  });

  it("is idempotent", () => {
    ok(api.archiveWorkstream(store, "ws-1", { now: NOW }));
    const second = ok(api.archiveWorkstream(store, "ws-1", { now: NOW + DAY_MS }));
    assert.equal(second.already, true);
  });
});

describe("a stake naming an archived person or project", () => {
  it("stops appearing in the stakeholder list once its person is archived", () => {
    ok(api.addStake(store, { person: "nadia", project: "tidepool", cadenceDays: 30, what: "budget", since: daysAgo(90) }));

    const before = /** @type {any[]} */ (api.stakeholders(store, NOW));
    assert.equal(before.length, 1);

    ok(api.archivePerson(store, "nadia", { now: NOW }));

    const after = /** @type {any[]} */ (api.stakeholders(store, NOW));
    assert.equal(after.length, 0, "a stake naming an archived person resolves nobody and drops out");
  });

  it("stops appearing once its project is archived", () => {
    ok(api.addStake(store, { person: "nadia", project: "tidepool", cadenceDays: 30, what: "budget", since: daysAgo(90) }));
    assert.equal(/** @type {any[]} */ (api.stakeholders(store, NOW)).length, 1);

    ok(api.archiveProject(store, "tidepool", { now: NOW }));

    assert.equal(/** @type {any[]} */ (api.stakeholders(store, NOW)).length, 0);
  });
});

describe("the bulk 'archive everything active' action", () => {
  it("archives every currently active person, project and workstream in one call", () => {
    store.create("people", { id: "johan", name: "Johan Lind", relation: "lead-and-manage", since: daysAgo(200) });

    const summary = api.archiveEverythingActive(store, { now: NOW });
    assert.equal(summary.people, 2);
    assert.equal(summary.projects, 1);
    assert.equal(summary.workstreams, 1);

    assert.equal(api.people(store, NOW).length, 0);
    assert.equal(api.projects(store, NOW).length, 0);
    assert.equal(api.workstreams(store, NOW).length, 0);
    assert.equal(api.attention(store, NOW).allInStep, true, "nothing active left to be behind on");

    // History is not touched by the bulk action any more than by the
    // per-item one.
    const page = ok(api.person(store, "nadia", NOW));
    assert.equal(page.name, "Nadia Ohlsson");
  });

  it("is safe to run twice: the second run archives nothing new", () => {
    api.archiveEverythingActive(store, { now: NOW });
    const second = api.archiveEverythingActive(store, { now: NOW + 30 * DAY_MS });
    assert.deepEqual(second, { people: 0, projects: 0, workstreams: 0 });
  });

  it("does not disturb the archivedAt of a row archived before the bulk run", () => {
    const early = ok(api.archivePerson(store, "nadia", { now: NOW - 30 * DAY_MS }));
    api.archiveEverythingActive(store, { now: NOW });
    const page = ok(api.person(store, "nadia", NOW));
    assert.equal(page.archivedAt, early.archivedAt, "re-running a bulk archive later must not look like a fresh one");
  });
});

describe("MCP exposure", () => {
  it("does not expose archive, unarchive or the bulk action - taking someone off the roster stays the user's call", () => {
    assert.equal(
      TOOLS.find((t) => /archive/i.test(t.name)),
      undefined,
      "no MCP tool may archive, unarchive or bulk-archive a person, project or workstream"
    );
  });
});
