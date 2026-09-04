/**
 * Tests for the three decisions made on 2026-08-23: two separate duties for
 * feedback and record-keeping, three monthly questions, and a delegation level
 * that sits on a piece of work with an owner.
 *
 * Plus the Nib binding, which is how notes reach any of it.
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import * as api from "../src/service/api.js";
import * as nibService from "../src/service/nib.js";
import { openStore } from "../src/storage/store.js";
import { DEFAULT_SIGNALS, SIGNAL_CADENCE_DAYS, signalsDue } from "../src/domain/signals.js";
import { LEVELS, LEVEL_OPTIONS, isLevel, isUnspecified, reviewInterval, reviewPhrase } from "../src/domain/workstreams.js";
import { DAY_MS } from "../src/domain/time.js";
import { failed, ok } from "./helpers.mjs";

const NOW = 1_800_000_000_000;
/** @param {number} n */
const daysAgo = (n) => NOW - n * DAY_MS;

/** @type {string} */
let dir;
/** @type {string} */
let nibDir;
/** @type {import("../src/storage/store.js").TendStore} */
let store;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tend-sw-"));
  nibDir = mkdtempSync(join(tmpdir(), "tend-nib-"));
  let t = NOW - 1_000_000;
  store = openStore({ dataDir: dir, role: "app", host: "test", now: () => t++ });

  for (const s of DEFAULT_SIGNALS) {
    store.create("signals", { ...s, status: "active", cadenceDays: SIGNAL_CADENCE_DAYS });
  }
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
  store.create("people", { id: "nadia", name: "Nadia Ohlsson", relation: "lead-and-manage", since: daysAgo(200) });
  store.create("projects", { id: "tidepool", name: "Strandkanten", since: daysAgo(200) });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(nibDir, { recursive: true, force: true });
});

/** Write a Nib index.json in the shape Nib itself writes. */
function writeNib(/** @type {any[]} */ categories) {
  writeFileSync(
    join(nibDir, "index.json"),
    JSON.stringify({
      version: 2,
      tags: [{ id: "tag-one-to-one", name: "1-1", color: "#6f9cff", description: "" }],
      categories
    }),
    "utf8"
  );
}

describe("the monthly questions", () => {
  it("is three questions, not six", () => {
    assert.equal(DEFAULT_SIGNALS.length, 3, "three get answered; six get skipped");
  });

  it("covers one person withdrawing, the team going quiet, and his own blind spot", () => {
    const ids = DEFAULT_SIGNALS.map((s) => s.id);
    assert.deepEqual(ids.sort(), ["signal-pushback", "signal-quiet-retro", "signal-unseen-work"]);
  });

  it("every question explains why it is worth asking", () => {
    for (const s of DEFAULT_SIGNALS) {
      assert.ok(s.why.length > 80, `${s.id} needs a reason a person would accept`);
    }
  });

  it("asks a never-answered question straight away", () => {
    const due = signalsDue(store.rows("signals"), [], NOW, daysAgo(60));
    assert.equal(due.length, 3);
    assert.ok(due.every((s) => !s.everAnswered));
    assert.ok(due.every((s) => s.severity !== "ok"));
  });

  it("goes quiet for a month after a no", () => {
    api.answerSignal(store, { signal: "signal-pushback", answer: "no", now: NOW });
    const asked = api.signals(store, NOW).find((s) => s.id === "signal-pushback");
    assert.equal(asked?.due, false);
    assert.equal(asked?.lastAnswer, "no");
  });

  it("comes back in a week after a yes, not a month", () => {
    store.create("signalAnswers", {
      signal: "signal-pushback",
      answer: "yes",
      note: "Sofia stopped arguing in design review",
      at: daysAgo(9)
    });
    const due = signalsDue(store.rows("signals"), store.rows("signalAnswers"), NOW);
    const pushback = due.find((s) => s.id === "signal-pushback");
    assert.notEqual(pushback?.severity, "ok", "a flagged problem should not wait a full cycle");
  });

  it("refuses a bare yes, because a yes with no note is useless later", () => {
    const r = api.answerSignal(store, { signal: "signal-pushback", answer: "yes", now: NOW });
    assert.match(String(r.error), /behöver en anteckning/);
  });

  it("accepts a yes with a note", () => {
    const r = api.answerSignal(store, {
      signal: "signal-quiet-retro",
      answer: "yes",
      note: "Retro ended in nine minutes and nobody raised the release",
      now: NOW
    });
    assert.equal(r.nextAskedIn, "7 dagar");
  });

  it("rejects an answer that is neither yes nor no", () => {
    assert.ok(api.answerSignal(store, { signal: "signal-pushback", answer: /** @type {any} */ ("maybe"), now: NOW }).error);
  });

  it("surfaces a due question in the Now view", () => {
    const a = api.attention(store, NOW);
    // Its own text rather than a phrase from it: this test is about whether a
    // due question reaches the front page, not about how it is worded.
    const asks = String(DEFAULT_SIGNALS.find((x) => x.id === "signal-pushback")?.text);
    const question = [...a.needsYou, ...a.nudges].find((/** @type {any} */ i) =>
      String(i.what).includes(asks)
    );
    assert.ok(question, "the monthly question should appear like anything else that needs him");
  });
});

describe("delegation levels", () => {
  it("has three, and each one says how often you look", () => {
    assert.deepEqual(Object.keys(LEVELS), ["doing", "close", "theirs"]);
    for (const key of Object.keys(LEVELS)) {
      assert.ok(LEVELS[/** @type {keyof typeof LEVELS} */ (key)].review > 0, `${key} needs a review interval`);
    }
  });

  it("derives the option list from the definition rather than repeating it", () => {
    // The fifth hand-copied list in the window, and the one that could lie
    // quietly: it spelled the review intervals out as words, so moving `review`
    // here left the dropdown promising the old one.
    assert.deepEqual(
      LEVEL_OPTIONS.map((o) => o.value),
      Object.keys(LEVELS)
    );
  });

  it("tells the reader of the dropdown the interval the level actually implies", () => {
    for (const option of LEVEL_OPTIONS) {
      const level = LEVELS[option.value];
      assert.ok(
        option.label.includes(reviewPhrase(level.review)),
        `${option.value} does not say how often you look: "${option.label}"`
      );
      assert.ok(option.label.startsWith(level.label), `${option.value} does not name the level: "${option.label}"`);
    }
  });

  it("names the intervals it has a word for and counts the days when it has none", () => {
    assert.equal(reviewPhrase(7), "varje vecka");
    assert.equal(reviewPhrase(21), "var 21:e dag");
  });

  it("looks more often the less you have handed over", () => {
    assert.ok(LEVELS.doing.review < LEVELS.close.review);
    assert.ok(LEVELS.close.review < LEVELS.theirs.review);
  });

  it("sits on the work and its owner together", () => {
    const r = api.addWorkstream(store, {
      name: "Strandkanten rendering",
      owner: "nadia",
      project: "tidepool",
      level: "close",
      now: NOW
    });
    assert.ok(!r.error);
    const [w] = api.workstreams(store, NOW);
    assert.equal(w.owner, "Nadia Ohlsson");
    assert.equal(w.project, "Strandkanten");
    assert.equal(w.reviewEvery, "14 dagar");
  });

  it("errs towards looking too often when the level is unknown", () => {
    assert.equal(reviewInterval("nonsense"), LEVELS.doing.review);
    assert.equal(reviewInterval(undefined), LEVELS.doing.review);
  });

  it("treats a missing level as a finding, not as missing data", () => {
    api.addWorkstream(store, { name: "Strandkanten physics", owner: "nadia", now: NOW });
    const a = api.attention(store, NOW);
    const item = [...a.needsYou, ...a.nudges].find((/** @type {any} */ i) => /Ingen delegeringsnivå/.test(i.what));
    assert.ok(item, "unstated delegation is the failure Grove names, so it must surface");
    assert.match(String(item.why), /ansvaret flyttat och informationen inte har/);
  });

  it("stops flagging it once a level is set", () => {
    const { id } = api.addWorkstream(store, { name: "Strandkanten physics", owner: "nadia", now: NOW });
    api.setDelegationLevel(store, String(id), "theirs");
    const a = api.attention(store, NOW);
    assert.equal(
      [...a.needsYou, ...a.nudges].some((/** @type {any} */ i) => /Ingen delegeringsnivå/.test(i.what)),
      false
    );
    assert.equal(isUnspecified(store.rows("workstreams")[0]), false);
  });

  it("refuses an invented level", () => {
    assert.match(String(api.addWorkstream(store, { name: "x", level: "vibes", now: NOW }).error), /Unknown level/);
    assert.equal(isLevel("vibes"), false);
  });

  it("refuses an owner who is not on the roster", () => {
    assert.ok(api.addWorkstream(store, { name: "x", owner: "Ghost", level: "close", now: NOW }).error);
  });
});

describe("binding Nib folders to people", () => {
  beforeEach(() => {
    writeNib([
      {
        id: "cat-1to1",
        name: "1-1",
        subs: [
          { id: "sub-nadia", name: "Nadia" },
          { id: "sub-johan", name: "Johan" }
        ],
        notes: [
          {
            id: "note-a",
            categoryId: "cat-1to1",
            subId: "sub-nadia",
            title: "1-1 14 aug",
            created: daysAgo(13),
            edited: daysAgo(13),
            alerts: [{ id: "al-1", text: "Kolla med Nina om GDC-delegationen", done: false }],
            flag: "",
            tags: ["tag-one-to-one"]
          },
          {
            id: "note-b",
            categoryId: "cat-1to1",
            subId: "sub-nadia",
            title: "1-1 30 juli",
            created: daysAgo(38),
            edited: daysAgo(38),
            alerts: [{ id: "al-2", text: "Svara om render pass", done: true }],
            flag: ""
          },
          { id: "note-loose", categoryId: "cat-1to1", subId: null, title: "Losa tankar", created: daysAgo(5), edited: daysAgo(5), alerts: [], flag: "" }
        ]
      }
    ]);
  });

  it("lists the folders available to bind, with note counts", () => {
    const r = nibService.listNibFolders(nibDir);
    assert.equal(r.available, true);
    const labels = r.folders.map((f) => `${f.label}:${f.notes}`);
    assert.deepEqual(labels, ["1-1:1", "1-1 / Nadia:2", "1-1 / Johan:0"]);
  });

  it("says so rather than throwing when Nib has never been opened", () => {
    const r = nibService.listNibFolders(join(nibDir, "nothing-here"));
    assert.equal(r.available, false);
    assert.match(r.why, /Ingen Nib-data/);
  });

  it("binds a folder to a person as a kind of contact", () => {
    const r = api.bindSource(store, {
      person: "nadia",
      categoryId: "cat-1to1",
      subId: "sub-nadia",
      label: "1-1 / Nadia"
    });
    assert.ok(!r.error);
    assert.equal(ok(api.sources(store)).length, 1);
  });

  it("refuses to bind one folder to two people", () => {
    api.bindSource(store, { person: "nadia", categoryId: "cat-1to1", subId: "sub-nadia" });
    api.addPerson(store, { name: "Johan Lind", relation: "manage-remotely", now: NOW });
    const r = api.bindSource(store, { person: "Johan", categoryId: "cat-1to1", subId: "sub-nadia" });
    assert.match(String(r.error), /redan bunden till Nadia Ohlsson/);
  });

  it("a category binding covers only its loose notes, not its sub-categories", () => {
    const notes = nibService.notesIn(
      /** @type {any} */ (nibService.readNibIndex(nibDir)).categories,
      "cat-1to1",
      null
    );
    assert.deepEqual(notes.map((n) => n.id), ["note-loose"]);
  });
});

describe("indexing Nib", () => {
  beforeEach(() => {
    writeNib([
      {
        id: "cat-1to1",
        name: "1-1",
        subs: [{ id: "sub-nadia", name: "Nadia" }],
        notes: [
          {
            id: "note-a",
            categoryId: "cat-1to1",
            subId: "sub-nadia",
            title: "1-1 14 aug",
            created: daysAgo(13),
            edited: daysAgo(13),
            alerts: [{ id: "al-1", text: "Kolla med Nina om GDC-delegationen", done: false }],
            flag: "",
            tags: ["tag-one-to-one"]
          },
          {
            id: "note-b",
            categoryId: "cat-1to1",
            subId: "sub-nadia",
            title: "1-1 30 juli",
            created: daysAgo(38),
            edited: daysAgo(38),
            alerts: [{ id: "al-2", text: "Svara om render pass", done: false }],
            flag: "",
            tags: ["tag-one-to-one"]
          }
        ]
      }
    ]);
    const bound = api.bindSource(store, {
      person: "nadia",
      categoryId: "cat-1to1",
      subId: "sub-nadia",
      label: "1-1 / Nadia"
    });
    // The binding says WHO. What a note counts AS is its tag, mapped here.
    api.setSourceRules(store, {
      id: String(bound.id),
      rules: [{ tagId: "tag-one-to-one", kind: "one-to-one" }]
    });
  });

  it("an untagged note is not evidence of anything", () => {
    // The direction that matters. A folder holds every sort of note about one
    // person, so counting an untagged one as a 1-1 would say they had spoken
    // when they may only have heard something. A cadence that has not moved is
    // an alert you can answer; a false one is a reassurance you cannot check.
    const other = ok(
      api.addPerson(store, { name: "Nina Berg", relation: "lead-and-manage", now: NOW })
    );
    assert.ok(other.id);
  });

  it("turns notes into contact and flagged blocks into promises", () => {
    const r = ok(nibService.indexNib(store, { dir: nibDir }));
    assert.equal(r.contacts, 2);
    assert.equal(r.promises, 2);
  });

  it("dates a contact when the note was written, not when it was indexed", () => {
    nibService.indexNib(store, { dir: nibDir });
    const p = ok(api.person(store, "nadia", NOW));
    assert.match(String(p.cadences[0]?.lastHappened ?? ""), /för 13 dagar sedan/);
  });

  it("keeps Swedish text intact", () => {
    nibService.indexNib(store, { dir: nibDir });
    assert.ok(
      api.promises(store, NOW).some((x) => x.text === "Kolla med Nina om GDC-delegationen"),
      "å, ä and ö survive the round trip"
    );
  });

  it("is safe to run again and again", () => {
    nibService.indexNib(store, { dir: nibDir });
    const second = ok(nibService.indexNib(store, { dir: nibDir }));
    assert.equal(second.contacts, 0);
    assert.equal(second.promises, 0);
    assert.equal(store.rows("touches").length, 2);
    assert.equal(store.rows("promises").length, 2);
  });

  it("closes a promise when its action point is ticked off in Nib", () => {
    nibService.indexNib(store, { dir: nibDir });
    assert.equal(api.promises(store, NOW).length, 2);

    // He ticks one off in Nib.
    writeNib([
      {
        id: "cat-1to1",
        name: "1-1",
        subs: [{ id: "sub-nadia", name: "Nadia" }],
        notes: [
          {
            id: "note-a",
            categoryId: "cat-1to1",
            subId: "sub-nadia",
            title: "1-1 14 aug",
            created: daysAgo(13),
            edited: daysAgo(1),
            alerts: [{ id: "al-1", text: "Kolla med Nina om GDC-delegationen", done: true }],
            flag: ""
          }
        ]
      }
    ]);

    const r = ok(nibService.indexNib(store, { dir: nibDir }));
    assert.equal(r.resolved, 1);
    assert.equal(api.promises(store, NOW).length, 1, "he should never have to say it twice");
  });

  it("reports rather than writes on a dry run", () => {
    const r = ok(nibService.indexNib(store, { dir: nibDir, dry: true }));
    assert.equal(r.contacts, 2);
    assert.equal(store.rows("touches").length, 0);
  });

  it("explains itself when nothing is bound", () => {
    const empty = openStore({ dataDir: mkdtempSync(join(tmpdir(), "tend-nb-")), role: "app", host: "t" });
    assert.match(failed(nibService.indexNib(empty, { dir: nibDir })), /ingenting att indexera/);
  });

  it("never writes to Nib", () => {
    const path = join(nibDir, "index.json");
    const before = readFileSync(path, "utf8");
    nibService.indexNib(store, { dir: nibDir });
    assert.equal(readFileSync(path, "utf8"), before, "Nib's file must come back byte-identical");
  });

  describe("when the conversation happened, as opposed to when it was written up", () => {
    /*
     * Found against real notes. A 1-1 held on the 19th, written up on the 25th,
     * came in dated the 25th - so the cadence clock moved six days late, and the
     * same conversation logged by hand at its real date showed up twice at two
     * different dates on one page.
     *
     * A title that states a date is somebody saying when the thing happened. A
     * creation timestamp is when they got round to writing it down.
     */

    /** @param {string} title @param {number} created */
    function noteTitled(title, created) {
      writeNib([
        {
          id: "cat-1to1",
          name: "1-1",
          subs: [{ id: "sub-nadia", name: "Nadia" }],
          notes: [
            {
              id: "note-dated",
              categoryId: "cat-1to1",
              subId: "sub-nadia",
              title,
              created,
              edited: created,
              alerts: [{ id: "al-9", text: "Skicka underlaget", done: false }],
              flag: "",
              tags: ["tag-one-to-one"]
            }
          ]
        }
      ]);
    }

    /** The day a touch landed on, as a plain calendar day. */
    function touchDay() {
      const at = Number(store.rows("touches")[0]?.at ?? 0);
      const d = new Date(at);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`;
    }

    it("takes the day from the title when the title states one", () => {
      const written = new Date();
      written.setDate(written.getDate() - 2);
      const held = new Date();
      held.setDate(held.getDate() - 9);
      const heldDay = `${held.getFullYear()}-${String(held.getMonth() + 1).padStart(2, "0")}-${String(
        held.getDate()
      ).padStart(2, "0")}`;

      noteTitled(`${heldDay} 1-1`, written.getTime());
      ok(nibService.indexNib(store, { dir: nibDir }));

      assert.equal(touchDay(), heldDay, "the contact was dated to the write-up, not the conversation");
    });

    it("dates the promise from the same day, since it was given in the conversation", () => {
      // It matters more for a promise than for a contact: a promise's whole
      // urgency is its age, so dating it to the write-up reads as newer than it
      // is - the direction that hides it.
      const written = new Date();
      written.setDate(written.getDate() - 2);
      const held = new Date();
      held.setDate(held.getDate() - 9);
      const heldDay = `${held.getFullYear()}-${String(held.getMonth() + 1).padStart(2, "0")}-${String(
        held.getDate()
      ).padStart(2, "0")}`;

      noteTitled(`${heldDay} 1-1`, written.getTime());
      ok(nibService.indexNib(store, { dir: nibDir }));

      const promise = store.rows("promises").find((p) => String(p.id).startsWith("nib:note-dated"));
      assert.ok(promise, "the flagged block did not become a promise");
      const at = new Date(Number(promise.madeAt));
      assert.equal(at.getDate(), held.getDate());
    });

    it("falls back to the write-up when the title states no date", () => {
      const written = new Date();
      written.setDate(written.getDate() - 4);
      const writtenDay = `${written.getFullYear()}-${String(written.getMonth() + 1).padStart(
        2,
        "0"
      )}-${String(written.getDate()).padStart(2, "0")}`;

      noteTitled("1-1 med Nadia", written.getTime());
      ok(nibService.indexNib(store, { dir: nibDir }));

      assert.equal(touchDay(), writtenDay);
    });

    it("refuses a title dated in the future, because a plan is not a record", () => {
      /*
       * A note can be created before the meeting it is for. Dating a contact
       * forward would satisfy the cadence for a conversation that has not
       * happened, and a nudge that fails to appear is invisible - so the fallback
       * is the one that can only nudge too early.
       */
      const written = new Date();
      const writtenDay = `${written.getFullYear()}-${String(written.getMonth() + 1).padStart(
        2,
        "0"
      )}-${String(written.getDate()).padStart(2, "0")}`;
      const planned = new Date();
      planned.setDate(planned.getDate() + 6);
      const plannedDay = `${planned.getFullYear()}-${String(planned.getMonth() + 1).padStart(
        2,
        "0"
      )}-${String(planned.getDate()).padStart(2, "0")}`;

      noteTitled(`${plannedDay} 1-1`, written.getTime());
      ok(nibService.indexNib(store, { dir: nibDir }));

      assert.equal(touchDay(), writtenDay);
    });
  });

  describe("a derived row that was deleted on purpose", () => {
    it("is not re-created, and is not counted as imported either", () => {
      /*
       * Delete an imported contact and the next import counted it as new and
       * wrote a create for it. Nothing came back - a replayed create only fills
       * in fields an existing row is missing, so the tombstone survived - but the
       * import reported adding a row it had not added. Untrustworthy rather than
       * destructive, which is worse than harmless: the count is the only thing
       * saying what the button just did.
       */
      ok(nibService.indexNib(store, { dir: nibDir }));
      const derived = store.rows("touches").filter((t) => t.from === "nib");
      assert.equal(derived.length, 2);

      store.remove("touches", String(derived[0].id));
      assert.equal(store.rows("touches").filter((t) => t.from === "nib").length, 1);

      const again = ok(nibService.indexNib(store, { dir: nibDir }));
      assert.equal(again.contacts, 0, "it claimed to import a row it cannot bring back");
      assert.equal(store.rows("touches").filter((t) => t.from === "nib").length, 1);
    });

    it("and the same for a promise, which is the other half of the same mistake", () => {
      ok(nibService.indexNib(store, { dir: nibDir }));
      const derived = store.rows("promises").filter((p) => p.from === "nib");
      assert.ok(derived.length >= 1);

      store.remove("promises", String(derived[0].id));
      const before = store.rows("promises").length;

      const again = ok(nibService.indexNib(store, { dir: nibDir }));
      assert.equal(again.promises, 0);
      assert.equal(store.rows("promises").length, before);
    });
  });
});
