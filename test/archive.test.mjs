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
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
/**
 * An empty board of its own, the convention every other prep test follows.
 *
 * Without it `prep()` falls back to the real Jot data directory and this suite
 * reads whatever board happens to be on the machine running it - harmless to
 * the data, and enough to make a unit test depend on a synced folder.
 *
 * @type {string}
 */
let jotDir;
/** @type {import("../src/storage/store.js").TendStore} */
let store;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tend-archive-"));
  jotDir = mkdtempSync(join(tmpdir(), "tend-archive-jot-"));
  writeFileSync(join(jotDir, "todos.json"), JSON.stringify({ categories: [], todos: [] }), "utf8");
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
  rmSync(jotDir, { recursive: true, force: true });
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
    // The open promise is what makes this test able to fail. Without it, Prep's
    // own archive guard can be deleted and the card still disappears, because
    // the cadence expansion already excluded her and Prep skips a person with
    // nothing at all to talk about. The test then passes for the wrong reason -
    // exactly the reading its own name warns against.
    ok(api.logPromise(store, { person: "nadia", text: "Answer on the render pass", madeAt: daysAgo(20), now: NOW }));

    const cards = prep(store, NOW, { jotDir }).cards;
    assert.ok(cards.some((c) => c.person === "Nadia Ohlsson"));

    ok(api.archivePerson(store, "nadia", { now: NOW }));

    const after = prep(store, NOW, { jotDir }).cards;
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
    assert.ok(prep(store, NOW, { jotDir }).cards.some((c) => c.person === "Nadia Ohlsson"));
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
    // A second, still-active person, so "none of the active people alongside
    // it" is actually exercised. With only the archived one in the store, a
    // list that returned everybody would pass this test unchanged - and that
    // list is what the People view labels "Archived".
    const live = ok(api.addPerson(store, { name: "Tove Ranger", relation: "lead-and-manage", now: NOW }));

    ok(api.archivePerson(store, "nadia", { now: NOW }));
    const archived = api.archivedPeople(store, NOW);
    assert.deepEqual(
      archived.map((p) => p.id),
      ["nadia"],
      "the archived list must hold the archived row and nothing else"
    );
    assert.equal(archived[0].archivedAt, NOW);
    assert.equal(
      archived.some((p) => p.id === live.id),
      false,
      "an active person must never be listed as archived"
    );
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
    const before = prep(store, NOW, { jotDir }).cards.find((c) => c.person === "Nadia Ohlsson");
    assert.ok(before?.theyOwn.some((/** @type {any} */ w) => w.name === "Renderpipen"));

    ok(api.archiveWorkstream(store, "ws-1", { now: NOW }));
    assert.equal(api.workstreams(store, NOW).some((w) => w.id === "ws-1"), false);
    assert.equal(api.archivedWorkstreams(store, NOW).some((w) => w.id === "ws-1"), true);
    const after = prep(store, NOW, { jotDir }).cards.find((c) => c.person === "Nadia Ohlsson");
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

    const summary = ok(api.archiveEverythingActive(store, { now: NOW }));
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

describe("what is still owed by somebody archived", () => {
  /**
   * The three read paths that do not go through `buildAttention` or
   * `expandCadences`, and were therefore missed: the waiting list, the daily
   * page's slice of it, and the open-promise list that reaches both the MCP
   * surface and the material handed to the model. Each one joined against
   * people by id and never asked whether the row was still live.
   */
  beforeEach(() => {
    ok(api.logPromise(store, { person: "nadia", text: "Answer on the render pass", madeAt: daysAgo(40), now: NOW }));
    ok(api.waitFor(store, { person: "nadia", what: "the render numbers", askedAt: daysAgo(35), now: NOW }));
  });

  it("keeps an archived person out of the waiting list and off the daily page", () => {
    assert.equal(ok(api.waits(store, NOW)).length, 1);
    assert.equal(api.waitsOnNow(store, NOW).length, 1);

    ok(api.archivePerson(store, "nadia", { now: NOW }));

    assert.deepEqual(ok(api.waits(store, NOW)), [], "the roster has nobody, so nothing is being waited on");
    assert.deepEqual(api.waitsOnNow(store, NOW), [], "and the daily page must not name them either");
  });

  it("still answers about one archived person when asked for them by name", () => {
    ok(api.archivePerson(store, "nadia", { now: NOW }));
    const theirs = api.waits(store, NOW, "nadia");
    assert.equal(Array.isArray(theirs) && theirs.length, 1, "asked about them directly, answer about them");
  });

  it("keeps an archived person's open promise out of the promise list", () => {
    assert.equal(api.promises(store, NOW).length, 1);

    ok(api.archivePerson(store, "nadia", { now: NOW }));

    assert.deepEqual(api.promises(store, NOW), [], "reported nowhere else, so it must not be reported here");
    // Hidden, never resolved: the row is exactly as it was.
    assert.equal(store.rows("promises")[0].text, "Answer on the render pass");
    assert.equal(store.rows("promises")[0].status, undefined);
    assert.equal(ok(api.person(store, "nadia", NOW)).openPromises.length, 1, "still hers on her own page");
  });

  it("agrees with itself: an empty roster never reports work owed to somebody on it", () => {
    ok(api.archiveEverythingActive(store, { now: NOW }));
    assert.deepEqual(api.people(store, NOW), []);
    // The invariant, asserted between the two lists rather than on each alone.
    for (const owed of [...api.promises(store, NOW), ...api.waitsOnNow(store, NOW)]) {
      assert.fail(`an empty roster still reported owed work: ${JSON.stringify(owed)}`);
    }
  });

  it("brings all of it back when the person is unarchived", () => {
    ok(api.archivePerson(store, "nadia", { now: NOW }));
    ok(api.unarchivePerson(store, "nadia"));
    assert.equal(api.promises(store, NOW).length, 1);
    assert.equal(ok(api.waits(store, NOW)).length, 1);
    assert.equal(api.waitsOnNow(store, NOW).length, 1);
  });
});

describe("cadences whose subject is not a person", () => {
  /**
   * The fixture above declares only a person-subject duty, so no project or
   * workstream cadence is ever expanded and `attention().allInStep` reads true
   * whatever the archive filters in `attention.js` do. Both filters could be
   * deleted with the whole suite still green. These two duties are what make
   * that assertion able to fail.
   */
  beforeEach(() => {
    store.create("duties", {
      id: "d-project-check",
      name: "Project check-in",
      subjectKind: "project",
      cadenceDays: 14,
      evidenceKinds: ["check-in"],
      relations: [],
      guarded: false,
      status: "active"
    });
    store.create("duties", {
      id: "d-delegation",
      name: "Delegation review",
      subjectKind: "workstream",
      cadenceDays: 30,
      evidenceKinds: ["delegation-review"],
      relations: [],
      guarded: false,
      status: "active"
    });
  });

  it("stops reporting an archived project, and reports it again when unarchived", () => {
    const named = () => api.attention(store, NOW).needsYou.some((i) => /Strandkanten/.test(i.what));
    assert.equal(named(), true, "200 days with no check-in is behind, before archiving");

    ok(api.archiveProject(store, "tidepool", { now: NOW }));
    assert.equal(named(), false, "an archived project must not be behind on anything");

    ok(api.unarchiveProject(store, "tidepool"));
    assert.equal(named(), true, "the drift was hidden, never cleared");
  });

  it("stops reporting an archived workstream, and reports it again when unarchived", () => {
    const named = () => api.attention(store, NOW).needsYou.some((i) => /Renderpipen/.test(i.what));
    assert.equal(named(), true);

    ok(api.archiveWorkstream(store, "ws-1", { now: NOW }));
    assert.equal(named(), false, "an archived workstream must not be behind on anything");

    ok(api.unarchiveWorkstream(store, "ws-1"));
    assert.equal(named(), true);
  });

  it("reports everything in step once the bulk action has archived all three kinds", () => {
    ok(api.archiveEverythingActive(store, { now: NOW }));
    const after = api.attention(store, NOW);
    assert.deepEqual(after.needsYou, [], "nothing active is left to be behind on");
    assert.deepEqual(after.nudges, []);
    assert.equal(after.allInStep, true);
  });
});

describe("the instant an archive is stamped with", () => {
  /**
   * Unreachable from the window, which always sends `Date.now()`. Guarded
   * because each of these fails silently rather than loudly: NaN serialises to
   * null and the row reads back ACTIVE while the call reports success, and a
   * far-future stamp makes the archived group's date formatting throw and takes
   * the whole view down with it.
   */
  it("refuses NaN rather than reporting an archive that did not happen", () => {
    assert.match(failed(api.archivePerson(store, "nadia", { now: NaN })), /real instant/);
    assert.equal(api.people(store, NOW).some((p) => p.id === "nadia"), true, "still active, and said so");
    assert.equal(api.archivedPeople(store, NOW).length, 0);
  });

  it("refuses a stamp no date can hold, rather than breaking the archived list", () => {
    assert.match(failed(api.archivePerson(store, "nadia", { now: 1e21 })), /range a date can hold/);
    // The formatting that would have thrown, over a list that must stay usable.
    assert.doesNotThrow(() => api.archivedPeople(store, NOW).map((p) => new Date(Number(p.archivedAt)).toISOString()));
  });

  it("makes the bulk action report a refusal instead of counting it as archived", () => {
    const summary = api.archiveEverythingActive(store, { now: NaN });
    assert.deepEqual(
      { people: summary.people, projects: summary.projects, workstreams: summary.workstreams },
      { people: 0, projects: 0, workstreams: 0 },
      "nothing was archived, so nothing may be counted as archived"
    );
    const refused = /** @type {any} */ (summary).refused;
    assert.ok(Array.isArray(refused) && refused.length > 0, "and it must say so out loud");
    // The invariant between the report and the effect, asserted across both
    // rather than on either alone.
    assert.equal(api.people(store, NOW).length, 1, "the roster is exactly as it was");
    assert.equal(api.archivedPeople(store, NOW).length, 0);
    assert.equal(api.projects(store, NOW).length, 1);
    assert.equal(api.workstreams(store, NOW).length, 1);
  });

  it("refuses zero, which would archive a row into 1970", () => {
    assert.match(failed(api.archiveProject(store, "tidepool", { now: 0 })), /real instant/);
    assert.match(failed(api.archiveWorkstream(store, "ws-1", { now: 0 })), /real instant/);
  });
});

describe("a name held by an archived row", () => {
  /**
   * The dead end this closes: after a bulk archive the roster shows nobody, and
   * every name ever used is still spoken for by a row that is not on any list.
   * The refusal itself is deliberate - Ctrl+K will not guess between two rows
   * with one name - so what has to be true is that the message says the row is
   * ARCHIVED and names a way out. "Already here" pointing at an empty roster,
   * and telling the reader to use an action that does not apply to an archived
   * row, is the bug.
   *
   * @param {string} message
   * @param {string} what
   */
  const saysArchived = (message, what) => {
    assert.match(
      message,
      /archiv/i,
      `${what} must say the name belongs to an archived row, said: ${message}`
    );
    assert.match(message, /unarchive/i, `${what} must name the way out, said: ${message}`);
    assert.doesNotMatch(
      message,
      /setRelation/,
      `${what} must not point at setRelation, which cannot reach an archived row`
    );
  };

  it("tells you a person is archived rather than claiming they are already here", () => {
    ok(api.archivePerson(store, "nadia", { now: NOW }));
    assert.equal(api.people(store, NOW).find((p) => p.name === "Nadia Ohlsson"), undefined);
    saysArchived(
      failed(api.addPerson(store, { name: "Nadia Ohlsson", relation: "lead-and-manage", now: NOW })),
      "adding a person under an archived name"
    );
  });

  it("matches the archived name whatever its case and padding", () => {
    ok(api.archivePerson(store, "nadia", { now: NOW }));
    saysArchived(
      failed(api.addPerson(store, { name: "  nadia OHLSSON  ", relation: "lead-and-manage", now: NOW })),
      "adding a person under an archived name typed differently"
    );
  });

  it("tells you a project is archived rather than claiming it is already here", () => {
    ok(api.archiveProject(store, "strand", { now: NOW }));
    saysArchived(
      failed(api.addProject(store, { name: "Strandkanten", now: NOW })),
      "adding a project under an archived name"
    );
  });

  it("tells you a rename collides with somebody archived", () => {
    ok(api.archivePerson(store, "nadia", { now: NOW }));
    const other = ok(api.addPerson(store, { name: "Tove Ranger", relation: "lead-and-manage", now: NOW }));
    saysArchived(
      failed(api.updatePerson(store, other.id, { name: "Nadia Ohlsson" })),
      "renaming onto an archived name"
    );
  });

  it("still refuses a name held by a LIVE row, in the words it always used", () => {
    const clash = failed(
      api.addPerson(store, { name: "Nadia Ohlsson", relation: "lead-and-manage", now: NOW })
    );
    assert.match(clash, /already here/);
    assert.doesNotMatch(
      clash,
      /archiv/i,
      "a live clash must not be reported as an archived one"
    );
  });

  it("frees the name again once the row is unarchived and removed the normal way", () => {
    ok(api.archivePerson(store, "nadia", { now: NOW }));
    ok(api.unarchivePerson(store, "nadia"));
    const clash = failed(
      api.addPerson(store, { name: "Nadia Ohlsson", relation: "lead-and-manage", now: NOW })
    );
    assert.match(clash, /already here/, "an unarchived row is live again, so its clash is a live one");
  });
});

describe("undoing a bulk archive", () => {
  it("offers nothing to undo until a bulk archive has run", () => {
    assert.equal(api.undoableBulkArchive(store), null);
    assert.match(failed(api.undoBulkArchive(store, { now: NOW })), /no bulk archive/i);
  });

  it("puts back exactly what one press archived", () => {
    ok(api.archiveEverythingActive(store, { now: NOW }));
    assert.deepEqual(api.people(store, NOW), []);

    const offered = api.undoableBulkArchive(store);
    assert.ok(offered !== null, "a run must be on offer");
    assert.deepEqual(
      { people: offered.people, projects: offered.projects, workstreams: offered.workstreams },
      { people: 1, projects: 1, workstreams: 1 },
      "the offer must describe what is still archived from that run"
    );

    const back = api.undoBulkArchive(store, { now: NOW + DAY_MS });
    assert.deepEqual(back, { people: 1, projects: 1, workstreams: 1 });
    assert.equal(api.people(store, NOW).length, 1, "the roster is whole again");
    assert.equal(api.projects(store, NOW).length, 1);
    assert.equal(api.workstreams(store, NOW).length, 1);
    assert.equal(api.archivedPeople(store, NOW).length, 0);
  });

  it("leaves alone a row archived by hand BEFORE the press", () => {
    // The distinction the whole feature turns on: an undo puts back what that
    // press changed, not everything that happens to be archived. Unarchiving a
    // row somebody archived deliberately would be a decision nobody made.
    ok(api.archiveProject(store, "tidepool", { now: NOW - 30 * DAY_MS }));
    ok(api.archiveEverythingActive(store, { now: NOW }));

    ok(api.undoBulkArchive(store, { now: NOW + DAY_MS }));

    assert.equal(api.people(store, NOW).length, 1, "the press's own rows came back");
    assert.equal(
      api.archivedProjects(store, NOW).some((p) => p.id === "tidepool"),
      true,
      "the hand-archived project must stay archived"
    );
  });

  it("does not count a row already brought back by hand as restored", () => {
    ok(api.archiveEverythingActive(store, { now: NOW }));
    ok(api.unarchivePerson(store, "nadia"));

    const offered = api.undoableBulkArchive(store);
    assert.ok(offered !== null, "a run must be on offer");
    assert.equal(offered.people, 0, "already back, so nothing to promise");

    const back = ok(api.undoBulkArchive(store, { now: NOW + DAY_MS }));
    assert.equal(back.people, 0, "and nothing to report as restored");
    assert.equal(api.people(store, NOW).length, 1, "still exactly one active person, not a double restore");
  });

  it("is offered once: a second undo finds nothing rather than reaching further back", () => {
    ok(api.archiveEverythingActive(store, { now: NOW }));
    ok(api.undoBulkArchive(store, { now: NOW + DAY_MS }));

    assert.equal(api.undoableBulkArchive(store), null, "the run is spent");
    assert.match(failed(api.undoBulkArchive(store, { now: NOW + 2 * DAY_MS })), /no bulk archive/i);
  });

  it("undoes the most recent press, not the first one", () => {
    ok(api.archiveEverythingActive(store, { now: NOW }));
    ok(api.undoBulkArchive(store, { now: NOW + DAY_MS }));

    // A second press, then a second undo. If undo reached for the oldest
    // un-undone run it would find the spent one and restore nothing.
    ok(api.archiveEverythingActive(store, { now: NOW + 2 * DAY_MS }));
    const back = api.undoBulkArchive(store, { now: NOW + 3 * DAY_MS });
    assert.deepEqual(back, { people: 1, projects: 1, workstreams: 1 });
    assert.equal(api.people(store, NOW).length, 1);
  });

  it("does not let a second, no-op press hide the run worth undoing", () => {
    ok(api.archiveEverythingActive(store, { now: NOW }));

    // Everything is already archived, so pressing again changes nothing. If
    // that empty press were recorded it would become "the most recent run" and
    // the undo would restore nothing while appearing to work - the accidental
    // double-press being exactly when somebody reaches for undo.
    const second = ok(api.archiveEverythingActive(store, { now: NOW + DAY_MS }));
    assert.deepEqual(second, { people: 0, projects: 0, workstreams: 0 });
    assert.equal(store.rows("bulkArchives").length, 1, "no empty run recorded");

    const offered = api.undoableBulkArchive(store);
    assert.ok(offered !== null, "an offer must still stand");
    assert.equal(offered.at, NOW, "the offer still points at the press that did the work");
    assert.deepEqual(api.undoBulkArchive(store, { now: NOW + 2 * DAY_MS }), {
      people: 1,
      projects: 1,
      workstreams: 1
    });
  });

  it("takes the newest of two runs that are both still standing", () => {
    // Two un-undone runs at once, which is what makes the ordering matter: with
    // only one candidate the sort direction cannot be wrong. Press, bring one
    // person back by hand, press again - now the second run holds just that
    // person, and undo must mean "the last thing I did", not "the first".
    ok(api.archiveEverythingActive(store, { now: NOW }));
    ok(api.unarchivePerson(store, "nadia"));
    ok(api.archiveEverythingActive(store, { now: NOW + DAY_MS }));
    assert.equal(store.rows("bulkArchives").length, 2);

    const offered = api.undoableBulkArchive(store);
    assert.ok(offered !== null);
    assert.equal(offered.at, NOW + DAY_MS, "the newer run is the one on offer");

    const back = ok(api.undoBulkArchive(store, { now: NOW + 2 * DAY_MS }));
    assert.deepEqual(
      back,
      { people: 1, projects: 0, workstreams: 0 },
      "only the person the second press archived - the first run's project and workstream stay"
    );
    assert.equal(api.projects(store, NOW).length, 0, "the older run is untouched and still undoable");
    assert.equal(api.workstreams(store, NOW).length, 0);
  });

  it("keeps the history of the run itself, rather than deleting it", () => {
    ok(api.archiveEverythingActive(store, { now: NOW }));
    ok(api.undoBulkArchive(store, { now: NOW + DAY_MS }));
    const runs = store.rows("bulkArchives");
    assert.equal(runs.length, 1, "the run is marked undone, not removed");
    assert.equal(runs[0].undoneAt, NOW + DAY_MS);
    assert.deepEqual(runs[0].people, ["nadia"], "and it still says what it changed");
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
