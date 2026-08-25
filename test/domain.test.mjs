/**
 * Tests for the domain layer.
 *
 * The focus contract has its own describe block near the bottom. Those tests
 * exist to fail loudly if anyone ever makes a focus able to hide something it
 * must not, which is the one way this tool could quietly stop working while
 * still looking fine.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { compareEvents, makeEventFactory } from "../src/storage/events.js";
import { reduce } from "../src/storage/reduce.js";
import { buildAttention, expandCadences, meanDrift } from "../src/domain/attention.js";
import { computeDrift, isRelation, latestEvidence, severityFor } from "../src/domain/cadence.js";
import { DEFAULT_STRETCH, focusCost, focusStatus, stretchFor } from "../src/domain/focus.js";
import { defaultUserDataDir, resolveDataDir } from "../src/domain/paths.js";
import { PROMISE_GUARD_DAYS, openPromises, promiseStatus } from "../src/domain/promises.js";
import { DAY_MS, daysBetween, driftBadge, humanDays } from "../src/domain/time.js";

const NOW = 1_800_000_000_000;
/** @param {number} n */
const daysAgo = (n) => NOW - n * DAY_MS;
/** @param {number} n */
const inDays = (n) => NOW + n * DAY_MS;

describe("data directory", () => {
  // The stored-variable lookup is injected in every case here. Left to its
  // default it reads this machine's registry, which makes the answer depend on
  // whose laptop the suite ran on - and on a machine where the variable IS set,
  // the fallback cases fail for a reason that has nothing to do with the code.
  const nothingStored = () => null;
  /** @param {string} value @returns {() => string} */
  const storedAs = (value) => () => value;

  it("prefers TEND_DATA_DIR when it is set", () => {
    const r = resolveDataDir({ env: { TEND_DATA_DIR: "D:\\Dropbox\\tend" }, stored: nothingStored });
    assert.equal(r.dir, "D:\\Dropbox\\tend");
    assert.equal(r.source, "env");
  });

  it("ignores an empty or whitespace override", () => {
    assert.equal(
      resolveDataDir({
        env: { TEND_DATA_DIR: "   " },
        platform: "win32",
        home: "C:\\u",
        stored: nothingStored
      }).source,
      "default"
    );
  });

  it("reads the variable Windows has stored when the process did not inherit it", () => {
    // The failure this prevents is silent. A process started before the variable
    // was set falls through to the per-user default, which is a real directory
    // that parses and reports nothing wrong - so the app and a helper process
    // end up on two different stores, each verifying its own writes.
    const r = resolveDataDir({ env: {}, platform: "win32", stored: storedAs("D:\\Dropbox\\tend") });
    assert.equal(r.dir, "D:\\Dropbox\\tend");
    assert.equal(r.source, "user-env");
  });

  it("still lets an inherited value win, which is how a test gets a scratch folder", () => {
    const r = resolveDataDir({
      env: { TEND_DATA_DIR: "D:\\scratch" },
      platform: "win32",
      stored: storedAs("D:\\Dropbox\\tend")
    });
    assert.equal(r.dir, "D:\\scratch");
    assert.equal(r.source, "env");
  });

  it("ignores a stored value that is blank", () => {
    const r = resolveDataDir({
      env: { APPDATA: "C:\\u\\AppData\\Roaming" },
      platform: "win32",
      stored: storedAs("  ")
    });
    assert.equal(r.source, "default");
  });

  it("matches Electron's userData location per platform", () => {
    // Asserted on shape rather than exact separators, so the expectation holds
    // whichever platform the tests run on.
    assert.match(
      defaultUserDataDir({ platform: "win32", env: { APPDATA: "C:\\u\\AppData\\Roaming" }, home: "C:\\u" }),
      /Roaming[/\\]tend$/
    );
    assert.match(defaultUserDataDir({ platform: "darwin", env: {}, home: "/Users/a" }), /Application Support[/\\]tend$/);
    assert.match(defaultUserDataDir({ platform: "linux", env: {}, home: "/home/a" }), /\.config[/\\]tend$/);
  });

  it("falls back when APPDATA is missing on Windows", () => {
    assert.match(
      defaultUserDataDir({ platform: "win32", env: {}, home: "C:\\u" }),
      /AppData[/\\]Roaming[/\\]tend$/
    );
  });
});

describe("time", () => {
  it("counts whole days, rounding down", () => {
    assert.equal(daysBetween(daysAgo(3), NOW), 3);
    assert.equal(daysBetween(NOW - DAY_MS * 2.9, NOW), 2);
    assert.equal(daysBetween(NOW, inDays(5)), 5);
    assert.equal(daysBetween(inDays(5), NOW), -5);
  });

  it("reads day counts the way a person would", () => {
    assert.equal(humanDays(0), "today");
    assert.equal(humanDays(1), "1 day");
    assert.equal(humanDays(9), "9 days");
    assert.equal(humanDays(38), "5 weeks");
  });

  it("badges drift compactly", () => {
    assert.equal(driftBadge(-3), "on time");
    assert.equal(driftBadge(0), "on time");
    assert.equal(driftBadge(5), "+5d");
    assert.equal(driftBadge(28), "+4w");
  });
});

describe("drift", () => {
  it("scales severity to the interval, not to a fixed day count", () => {
    // Three days late is serious on a weekly cadence...
    assert.equal(severityFor(3, 7), "watch");
    assert.equal(severityFor(8, 7), "critical");
    // ...and barely anything on a monthly one.
    assert.equal(severityFor(3, 30), "watch");
    assert.equal(severityFor(8, 30), "watch");
    assert.equal(severityFor(31, 30), "critical");
  });

  it("is ok exactly at the interval", () => {
    const d = computeDrift({ intervalDays: 14, lastAt: daysAgo(14), since: daysAgo(90), now: NOW });
    assert.equal(d.driftDays, 0);
    assert.equal(d.severity, "ok");
  });

  it("measures from the start when nothing has ever happened", () => {
    const d = computeDrift({ intervalDays: 14, lastAt: null, since: daysAgo(40), now: NOW });
    assert.equal(d.everHappened, false);
    assert.equal(d.daysSince, 40);
    assert.equal(d.severity, "critical");
  });

  it("does not make a brand new subject instantly critical", () => {
    const d = computeDrift({ intervalDays: 14, lastAt: null, since: daysAgo(1), now: NOW });
    assert.equal(d.severity, "ok");
  });

  it("keeps the drift number honest when a focus stretches the threshold", () => {
    const plain = computeDrift({ intervalDays: 14, lastAt: daysAgo(24), since: daysAgo(90), now: NOW });
    const stretched = computeDrift({ intervalDays: 14, lastAt: daysAgo(24), since: daysAgo(90), now: NOW, stretch: 1.5 });

    assert.equal(plain.daysSince, stretched.daysSince, "days since is a fact, not a policy");
    assert.equal(plain.severity, "warn");
    assert.equal(stretched.severity, "watch", "the same drift reads less urgently under a focus");
    assert.equal(stretched.stretched, true);
  });

  it("refuses a nonsensical interval instead of dividing by zero later", () => {
    assert.throws(() => computeDrift({ intervalDays: 0, lastAt: null, since: NOW, now: NOW }), /must be positive/);
  });

  it("knows the relationship types and rejects invented ones", () => {
    assert.ok(isRelation("manage-remotely"));
    assert.ok(isRelation("equal-lead"));
    assert.equal(isRelation("skip-level"), false);
  });
});

describe("evidence", () => {
  const touches = [
    { subject: "p1", kind: "one-to-one", at: daysAgo(10) },
    { subject: "p1", kind: "second-hand", at: daysAgo(2) },
    { subject: "p1", kind: "one-to-one", at: daysAgo(40) },
    { subject: "p2", kind: "one-to-one", at: daysAgo(1) },
    { subject: "p1", kind: "one-to-one", at: daysAgo(3), _deleted: true }
  ];

  it("takes the most recent matching kind", () => {
    assert.equal(latestEvidence(touches, "p1", ["one-to-one"]), daysAgo(10));
  });

  it("does not let one kind of contact satisfy another cadence", () => {
    // Hearing about Johan from Nova's lead two days ago must NOT reset the 1-1
    // cadence. If it did, the blind spot would close itself on paper.
    assert.equal(latestEvidence(touches, "p1", ["one-to-one"]), daysAgo(10));
    assert.equal(latestEvidence(touches, "p1", ["second-hand"]), daysAgo(2));
  });

  it("accepts any kind when none is specified", () => {
    assert.equal(latestEvidence(touches, "p1", []), daysAgo(2));
  });

  it("ignores tombstoned evidence", () => {
    assert.notEqual(latestEvidence(touches, "p1", ["one-to-one"]), daysAgo(3));
  });

  it("returns null when there is none", () => {
    assert.equal(latestEvidence(touches, "p9", ["one-to-one"]), null);
  });
});

describe("promises", () => {
  it("escalates past two weeks no matter what", () => {
    const s = promiseStatus({ id: "x", madeAt: daysAgo(PROMISE_GUARD_DAYS + 1) }, NOW);
    assert.equal(s.severity, "critical");
    assert.equal(s.guarded, true);
  });

  it("uses the stated date when there is one", () => {
    assert.equal(promiseStatus({ id: "x", madeAt: daysAgo(5), due: inDays(2) }, NOW).severity, "ok");
    assert.equal(promiseStatus({ id: "x", madeAt: daysAgo(5), due: daysAgo(1) }, NOW).severity, "warn");
    assert.equal(promiseStatus({ id: "x", madeAt: daysAgo(6), due: daysAgo(5) }, NOW).severity, "critical");
  });

  it("surfaces an undated promise after a few days, and escalates it after a week", () => {
    // Shortened from a fortnight on 2026-08-24 after real use: by two weeks the
    // other person has already concluded you forgot, which is the exact leak
    // this exists to catch.
    assert.equal(promiseStatus({ id: "x", madeAt: daysAgo(2) }, NOW).severity, "ok");
    assert.equal(promiseStatus({ id: "x", madeAt: daysAgo(5) }, NOW).severity, "warn");
    assert.equal(promiseStatus({ id: "x", madeAt: daysAgo(9) }, NOW).severity, "critical");
  });

  it("lists open ones oldest first and leaves resolved ones out", () => {
    const list = openPromises(
      [
        { id: "a", madeAt: daysAgo(3) },
        { id: "b", madeAt: daysAgo(20) },
        { id: "c", madeAt: daysAgo(30), state: "resolved" },
        { id: "d", madeAt: daysAgo(9), _deleted: true }
      ],
      NOW
    );
    assert.deepEqual(list.map((p) => p.id), ["b", "a"]);
  });
});

describe("focus", () => {
  const focus = {
    id: "f1",
    name: "Get Skiff running",
    startedAt: daysAgo(17),
    endsAt: inDays(21),
    budget: 0.5,
    stretch: DEFAULT_STRETCH,
    guarded: ["d-remote"],
    bassigneeDrift: 0.4
  };

  it("reports how long is left", () => {
    const s = focusStatus(focus, NOW);
    assert.equal(s.active, true);
    assert.equal(s.daysLeft, 21);
    assert.equal(s.stretch, DEFAULT_STRETCH);
  });

  it("states its cost as a number rather than a fesigneg", () => {
    const cost = focusCost(focus, 1.8);
    assert.equal(cost.known, true);
    assert.match(cost.summary, /0\.4 to 1\.8 days/);
  });

  it("says so when no bassignee was captured", () => {
    assert.equal(focusCost({ id: "f", name: "x" }, 3).known, false);
  });

  it("reverts every stretch on the end date, done or not", () => {
    const past = { ...focus, endsAt: daysAgo(2) };
    const s = focusStatus(past, NOW);
    assert.equal(s.overrun, true);
    assert.equal(s.stretch, 1, "an overrun focus dampens nothing");
    assert.equal(stretchFor(past, NOW, { id: "d-soft" }), 1);
  });
});

describe("the focus contract", () => {
  const focus = {
    id: "f1",
    name: "Get Skiff running",
    endsAt: inDays(21),
    stretch: DEFAULT_STRETCH,
    guarded: ["d-listed"],
    bassigneeDrift: 0
  };

  it("never stretches a duty marked guarded", () => {
    assert.equal(stretchFor(focus, NOW, { id: "d-any", guarded: true }), 1);
  });

  it("never stretches a duty the focus itself listed as guarded", () => {
    assert.equal(stretchFor(focus, NOW, { id: "d-listed" }), 1);
  });

  it("does stretch an ordinary duty, which is the whole point", () => {
    assert.equal(stretchFor(focus, NOW, { id: "d-soft" }), DEFAULT_STRETCH);
  });

  it("stretches nothing when there is no focus", () => {
    assert.equal(stretchFor(null, NOW, { id: "d-soft" }), 1);
  });
});

/**
 * Build a state the way the app would: through events, in order.
 *
 * @param {any[]} ops Pairs of `[operation, payload]`.
 */
function stateFrom(ops) {
  const event = makeEventFactory("test-app", (() => {
    let t = NOW - 1_000_000;
    return () => t++;
  })());
  return reduce(ops.map(([op, p]) => event(op, p)).sort(compareEvents));
}

/** A role map and a roster with the crossed structure the tool is built for. */
function realisticOps() {
  return [
    ["duties.create", {
      id: "d-1to1",
      name: "1-1",
      subjectKind: "person",
      cadenceDays: 14,
      evidenceKinds: ["one-to-one"],
      relations: ["lead-and-manage", "manage-remotely"],
      guarded: true,
      status: "active"
    }],
    ["duties.create", {
      id: "d-remote",
      name: "Second-hand read",
      subjectKind: "person",
      cadenceDays: 30,
      evidenceKinds: ["second-hand"],
      relations: ["manage-remotely"],
      guarded: true,
      status: "active"
    }],
    ["duties.create", {
      id: "d-sideways",
      name: "Sideways contact",
      subjectKind: "person",
      cadenceDays: 7,
      evidenceKinds: ["sideways"],
      relations: ["equal-lead"],
      guarded: false,
      status: "active"
    }],
    ["duties.create", {
      id: "d-project",
      name: "Project check-in",
      subjectKind: "project",
      cadenceDays: 14,
      evidenceKinds: ["check-in"],
      guarded: false,
      status: "active"
    }],
    ["duties.create", {
      id: "d-proposed",
      name: "Written development plan",
      subjectKind: "person",
      cadenceDays: 180,
      evidenceKinds: ["dev-plan"],
      guarded: false,
      status: "proposed"
    }],

    // `since` matters: these are people he has had for months, not rows created
    // a second ago. Without it every cadence measures from row-creation time and
    // nothing can ever be behind.
    ["people.create", { id: "nadia", name: "Nadia Ohlsson", relation: "lead-and-manage", since: daysAgo(200) }],
    ["people.create", { id: "johan", name: "Johan Lind", relation: "manage-remotely", since: daysAgo(200) }],
    ["people.create", { id: "sofia", name: "Sofia Krantz", relation: "equal-lead", since: daysAgo(200) }],
    ["projects.create", { id: "tidepool", name: "Tidepool", since: daysAgo(200) }],

    ["touches.create", { id: "t1", subject: "nadia", kind: "one-to-one", at: daysAgo(13) }],
    ["touches.create", { id: "t2", subject: "johan", kind: "one-to-one", at: daysAgo(42) }],
    ["touches.create", { id: "t3", subject: "sofia", kind: "sideways", at: daysAgo(21) }],
    ["touches.create", { id: "t4", subject: "tidepool", kind: "check-in", at: daysAgo(19) }]
  ];
}

describe("attention", () => {
  it("only applies a duty to the relationship types it names", () => {
    const cadences = expandCadences(stateFrom(realisticOps()), NOW);
    const pairs = cadences.map((c) => `${c.duty.id}/${c.subject.id}`);

    assert.ok(pairs.includes("d-1to1/nadia"));
    assert.ok(pairs.includes("d-1to1/johan"));
    assert.ok(pairs.includes("d-remote/johan"));
    assert.ok(pairs.includes("d-sideways/sofia"));

    assert.ok(!pairs.includes("d-remote/nadia"), "a person you see needs no second-hand channel");
    assert.ok(!pairs.includes("d-sideways/nadia"), "sideways is for equals only");
    assert.ok(!pairs.includes("d-1to1/sofia"), "you do not run 1-1s with a peer lead");
  });

  it("leaves proposed duties out until they are accepted", () => {
    const cadences = expandCadences(stateFrom(realisticOps()), NOW);
    assert.equal(cadences.filter((c) => c.duty.id === "d-proposed").length, 0);
  });

  it("follows a person when their relationship changes, with no migration", () => {
    // The reorg case: Nadia moves to another team. He keeps
    // his history; the duties that apply to him change by themselves.
    const before = expandCadences(stateFrom(realisticOps()), NOW);
    assert.equal(before.filter((c) => c.subject.id === "nadia" && c.duty.id === "d-remote").length, 0);

    const after = expandCadences(
      stateFrom([...realisticOps(), ["people.update", { id: "nadia", relation: "manage-remotely" }]]),
      NOW
    );
    const nadia = after.filter((c) => c.subject.id === "nadia");
    assert.deepEqual(nadia.map((c) => c.duty.id).sort(), ["d-1to1", "d-remote"]);
    assert.equal(nadia.find((c) => c.duty.id === "d-1to1")?.drift.daysSince, 13, "history survived");
  });

  it("puts the worst thing first", () => {
    const { needs } = buildAttention(stateFrom(realisticOps()), NOW);
    assert.ok(needs.length > 0);
    assert.equal(needs[0].severity, "critical");
    assert.match(needs[0].title, /Johan/);
  });

  it("says nothing at all when everything is in step", () => {
    const ops = [
      ["duties.create", { id: "d-1to1", name: "1-1", subjectKind: "person", cadenceDays: 14, evidenceKinds: ["one-to-one"], status: "active" }],
      ["people.create", { id: "nadia", name: "Nadia Ohlsson", relation: "lead-and-manage" }],
      ["touches.create", { id: "t1", subject: "nadia", kind: "one-to-one", at: daysAgo(2) }]
    ];
    const a = buildAttention(stateFrom(ops), NOW);
    assert.equal(a.quiet, true);
    assert.deepEqual(a.needs, []);
    assert.deepEqual(a.nudges, []);
  });

  it("flags a long-standing person no duty has ever been satisfied for", () => {
    const ops = [
      ...realisticOps(),
      ["people.create", { id: "signe", name: "Signe Wahlström", relation: "manage-remotely", since: daysAgo(120) }]
    ];
    const { needs } = buildAttention(stateFrom(ops), NOW);
    assert.ok(needs.some((i) => /never happened/.test(i.title) && i.subject === "signe"));
  });

  it("gives a newly added person the grace of their own start date", () => {
    const ops = [
      ...realisticOps(),
      ["people.create", { id: "new", name: "Someone New", relation: "manage-remotely" }]
    ];
    const shown = buildAttention(stateFrom(ops), NOW);
    assert.ok(
      ![...shown.needs, ...shown.nudges].some((i) => i.subject === "new"),
      "adding a person must not immediately accuse you of neglecting them"
    );
  });

  it("surfaces an ageing promise against the right person", () => {
    const ops = [
      ...realisticOps(),
      ["promises.create", { id: "pr1", person: "nadia", text: "Answer on the render pass", madeAt: daysAgo(16) }]
    ];
    const { needs } = buildAttention(stateFrom(ops), NOW);
    const promise = needs.find((i) => i.kind === "promise");
    assert.ok(promise);
    assert.match(promise.title, /Nadia Ohlsson/);
    assert.equal(promise.guarded, true);
  });
});

describe("attention under a focus", () => {
  /** @param {any[]} [extra] */
  const withFocus = (extra = []) =>
    stateFrom([
      ...realisticOps(),
      ...extra,
      ["focus.set", {
        id: "f1",
        name: "Get Skiff running",
        endsAt: inDays(21),
        stretch: DEFAULT_STRETCH,
        budget: 0.5,
        bassigneeDrift: 0.4
      }]
    ]);

  it("never holds back anything that is genuinely critical", () => {
    const plain = buildAttention(stateFrom(realisticOps()), NOW);
    const focused = buildAttention(withFocus(), NOW);

    /** @param {ReturnType<typeof buildAttention>} a */
    const trulyCritical = (a) =>
      [...a.needs, ...a.nudges].filter((i) => i.trueSeverity === "critical").map((i) => i.key).sort();

    assert.deepEqual(
      trulyCritical(focused),
      trulyCritical(plain),
      "a focus may soften how a critical item reads, but never hide it"
    );
    assert.ok(trulyCritical(plain).length > 0, "the fixture has critical items, so this test can fail");
  });

  it("may soften an unguarded critical item into a nudge, but not out of sight", () => {
    // Sofia's sideways cadence is 7 days and 21 days stale: critical on the
    // facts, softened to a nudge by the stretch. It has to stay visible.
    const focused = buildAttention(withFocus(), NOW);
    const sofia = [...focused.needs, ...focused.nudges].find((i) => i.key === "cadence:d-sideways:sofia");

    assert.ok(sofia, "still shown");
    assert.equal(sofia.trueSeverity, "critical");
    assert.notEqual(sofia.severity, "critical", "it reads less urgently under the focus");
  });

  it("never mutes a guarded duty", () => {
    const focused = buildAttention(withFocus(), NOW);
    const shown = [...focused.needs, ...focused.nudges].map((i) => i.key);
    assert.ok(shown.includes("cadence:d-1to1:johan"));
    assert.ok(shown.includes("cadence:d-remote:johan"));
  });

  it("holds back only the softest tier, and counts what it held", () => {
    const ops = [
      ["duties.create", { id: "d-soft", name: "Soft thing", subjectKind: "project", cadenceDays: 30, evidenceKinds: ["check-in"], guarded: false, status: "active" }],
      ["projects.create", { id: "proj", name: "Something" }],
      ["touches.create", { id: "t", subject: "proj", kind: "check-in", at: daysAgo(34) }]
    ];

    const plain = buildAttention(stateFrom(ops), NOW);
    assert.equal(plain.nudges.length, 1);
    assert.equal(plain.nudges[0].severity, "watch");
    assert.equal(plain.muted, 0);

    const focused = buildAttention(
      stateFrom([...ops, ["focus.set", { id: "f1", name: "F", endsAt: inDays(10), stretch: DEFAULT_STRETCH }]]),
      NOW
    );
    assert.equal(focused.nudges.length, 0);
    assert.equal(focused.muted, 1, "held back, and said so");
  });

  it("stops holding anything back once the focus has run out", () => {
    const ops = [
      ["duties.create", { id: "d-soft", name: "Soft thing", subjectKind: "project", cadenceDays: 30, evidenceKinds: ["check-in"], guarded: false, status: "active" }],
      ["projects.create", { id: "proj", name: "Something" }],
      ["touches.create", { id: "t", subject: "proj", kind: "check-in", at: daysAgo(34) }],
      ["focus.set", { id: "f1", name: "F", endsAt: daysAgo(1), stretch: DEFAULT_STRETCH }]
    ];
    const a = buildAttention(stateFrom(ops), NOW);
    assert.equal(a.muted, 0);
    assert.equal(a.nudges.length, 1);
    assert.equal(a.focus.overrun, true);
  });

  it("measures its cost on what it was allowed to dampen", () => {
    const state = withFocus();
    const cadences = expandCadences(state, NOW);
    const mean = meanDrift(cadences);
    assert.ok(mean > 0);
    assert.ok(
      cadences.filter((c) => c.duty.guarded).length > 0,
      "guarded cadences exist and are excluded from the mean, so the focus is not flattered"
    );
  });
});
