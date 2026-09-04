/**
 * A Nib folder bound to several people.
 *
 * Written for a real case: a standing weekly meeting with two other people,
 * written up once in Nib, which then had to be typed into Tend again once per
 * attendee because a binding named exactly one person.
 *
 * The asymmetry is the thing these tests exist to pin down, and it is the part
 * that is easy to get backwards. Contact MUST fan out - everybody there was
 * spoken to. Commitments MUST NOT - one flagged action point is one thing
 * somebody said they would do, and fanning four of them across two attendees
 * turns four obligations into eight.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import * as api from "../src/service/api.js";
import * as nibService from "../src/service/nib.js";
import { openStore } from "../src/storage/store.js";
import { buildAttention } from "../src/domain/attention.js";
import { CONTACT_KINDS } from "../src/domain/contact.js";
import { callTool } from "../src/mcp/tools.js";
import { boundPeople, isShared, sourceName } from "../src/domain/sources.js";
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
  dir = mkdtempSync(join(tmpdir(), "tend-shared-"));
  nibDir = mkdtempSync(join(tmpdir(), "tend-shared-nib-"));
  let t = NOW - 1_000_000;
  store = openStore({ dataDir: dir, role: "app", host: "test", now: () => t++ });

  store.create("people", { id: "ilva", name: "Ilva Brandt", relation: "peer-lead", since: daysAgo(300) });
  store.create("people", { id: "rune", name: "Rune Falk", relation: "managed-by", since: daysAgo(300) });
  store.create("people", { id: "otto", name: "Otto Wenner", relation: "lead-and-manage", since: daysAgo(300) });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(nibDir, { recursive: true, force: true });
});

/**
 * One Nib folder holding one meeting note.
 *
 * @param {object} [opts]
 * @param {{ id: string, text: string, done: boolean }[]} [opts.alerts]
 * @param {string[]} [opts.tags]
 * @param {string} [opts.title]
 */
function writeMeetingNote({ alerts = [], tags = ["tag-meeting"], title = "Tuesday sync" } = {}) {
  writeFileSync(
    join(nibDir, "index.json"),
    JSON.stringify({
      version: 2,
      tags: [
        { id: "tag-meeting", name: "Meeting", color: "#6f9cff", description: "" },
        { id: "tag-one-to-one", name: "1-1", color: "#6f9cff", description: "" }
      ],
      categories: [
        {
          id: "cat-org",
          name: "Org",
          subs: [{ id: "sub-sync", name: "Tuesday sync" }],
          notes: [
            {
              id: "note-sync",
              categoryId: "cat-org",
              subId: "sub-sync",
              title,
              created: daysAgo(3),
              edited: daysAgo(3),
              alerts,
              flag: "",
              tags
            }
          ]
        }
      ]
    }),
    "utf8"
  );
}

/**
 * Bind the meeting folder to whoever, with the meeting tag mapped.
 *
 * @param {string[]} people
 * @param {string} [name]
 */
function bindMeeting(people, name = "Tuesday sync") {
  const bound = ok(
    api.bindSource(store, {
      people,
      name,
      categoryId: "cat-org",
      subId: "sub-sync",
      label: "Org / Tuesday sync"
    })
  );
  ok(api.setSourceRules(store, { id: String(bound.id), rules: [{ tagId: "tag-meeting", kind: "meeting" }] }));
  return bound;
}

describe("a contact kind for a room with several people in it", () => {
  it("exists, and is about a person", () => {
    const meeting = CONTACT_KINDS.find((k) => k.value === "meeting");
    assert.ok(meeting, "there is no kind for a conversation several people were in");
    assert.equal(meeting.subject, "person");
  });

  it("is not the 1-1 kind, so it cannot answer a 1-1 duty by accident", () => {
    /*
     * The whole reason this kind exists rather than reusing `one-to-one`. A
     * quarter of group meetings must not be able to read as a quarter of 1-1s,
     * because the person who never got a real conversation is exactly the one
     * the app is supposed to surface.
     */
    store.create("duties", {
      id: "d-1to1",
      name: "1-1",
      subjectKind: "person",
      cadenceDays: 14,
      evidenceKinds: ["one-to-one"],
      relations: ["peer-lead", "managed-by", "lead-and-manage"],
      guarded: true,
      status: "active"
    });
    store.create("touches", { subject: "ilva", kind: "meeting", at: daysAgo(1) });

    const items = buildAttention(store.state(), NOW)
      .needs.concat(buildAttention(store.state(), NOW).nudges)
      .filter((i) => i.subject === "ilva" && i.key.startsWith("cadence:d-1to1"));
    assert.equal(items.length, 1, "a group meeting silenced the 1-1 duty");
  });
});

describe("binding one folder to several people", () => {
  it("records everybody, and says so", () => {
    const bound = bindMeeting(["ilva", "rune"]);
    assert.match(String(bound.bound), /Ilva Brandt, Rune Falk/);

    const [row] = ok(api.sources(store));
    assert.deepEqual(
      row.people.map((/** @type {any} */ p) => p.name),
      ["Ilva Brandt", "Rune Falk"]
    );
    assert.equal(row.shared, true);
    assert.equal(row.name, "Tuesday sync");
  });

  it("keeps the single-person form working, because that is still the ordinary case", () => {
    const bound = ok(
      api.bindSource(store, { person: "Otto Wenner", categoryId: "cat-org", subId: "sub-sync" })
    );
    assert.match(String(bound.bound), /Otto Wenner/);
    const [row] = ok(api.sources(store));
    assert.equal(row.shared, false, "one person is not a shared meeting");
  });

  it("refuses a binding with nobody on it rather than writing contact with no subject", () => {
    failed(api.bindSource(store, { people: [], categoryId: "cat-org", subId: "sub-sync" }));
  });

  it("counts a person named twice once, so one note is not two rows of contact", () => {
    ok(api.bindSource(store, { people: ["ilva", "Ilva Brandt"], categoryId: "cat-org", subId: "sub-sync" }));
    const [row] = ok(api.sources(store));
    assert.equal(row.people.length, 1);
  });

  it("names everyone in the clash message, not just the first", () => {
    bindMeeting(["ilva", "rune"]);
    const why = failed(
      api.bindSource(store, { people: ["otto"], categoryId: "cat-org", subId: "sub-sync" })
    );
    assert.match(why, /Ilva Brandt, Rune Falk/);
  });

  it("falls back to the Nib path when he has not named the binding", () => {
    // The folder's path is Nib's to change and the name is his. A page that can
    // only show the path makes him translate it every time he reads it.
    assert.equal(sourceName({ label: "Org / Tuesday sync" }), "Org / Tuesday sync");
    assert.equal(sourceName({ name: "Manager sync", label: "Org / Tuesday sync" }), "Manager sync");
  });

  it("reads a binding written before there were lists", () => {
    assert.deepEqual(boundPeople({ person: "rune" }), ["rune"]);
    assert.equal(isShared({ person: "rune" }), false);
    assert.deepEqual(boundPeople({ people: ["ilva", "rune"] }), ["ilva", "rune"]);
    assert.equal(isShared({ people: ["ilva", "rune"] }), true);
  });
});

describe("contact from a shared note", () => {
  it("lands on every attendee, once each", () => {
    writeMeetingNote();
    bindMeeting(["ilva", "rune"]);

    const run = ok(nibService.indexNib(store, { dir: nibDir }));
    assert.equal(run.contacts, 2);

    const touches = store.rows("touches");
    assert.deepEqual(
      touches.map((t) => String(t.subject)).sort(),
      ["ilva", "rune"],
      "the meeting did not reach both people"
    );
    assert.ok(
      touches.every((t) => String(t.kind) === "meeting"),
      "the tag rule did not decide the kind"
    );
  });

  it("puts the person in the row id, so two attendees cannot collide", () => {
    /*
     * The bug this prevents is silent. With the old id shape - note plus kind -
     * both attendees want the same id, the second is read as already written,
     * and exactly one of them gets no contact recorded at all.
     */
    writeMeetingNote();
    bindMeeting(["ilva", "rune"]);
    ok(nibService.indexNib(store, { dir: nibDir }));

    const ids = store.rows("touches").map((t) => String(t.id)).sort();
    assert.deepEqual(ids, ["nib:note-sync:ilva:meeting", "nib:note-sync:rune:meeting"]);
  });

  it("writes nothing new on a second pass", () => {
    writeMeetingNote();
    bindMeeting(["ilva", "rune"]);
    ok(nibService.indexNib(store, { dir: nibDir }));

    const again = ok(nibService.indexNib(store, { dir: nibDir }));
    assert.equal(again.contacts, 0);
    assert.equal(store.rows("touches").length, 2);
  });

  it("counts each attendee separately in a dry run", () => {
    // A dry run that reports one contact and then writes two is a dry run
    // nobody can use to decide whether to run the real thing.
    writeMeetingNote();
    bindMeeting(["ilva", "rune"]);

    const dry = ok(nibService.indexNib(store, { dir: nibDir, dry: true }));
    assert.equal(dry.contacts, 2);
    assert.equal(store.rows("touches").length, 0, "a dry run wrote something");
  });

  it("skips a binding nobody is named on, and says why", () => {
    writeMeetingNote();
    store.create("sources", { people: [], categoryId: "cat-org", subId: "sub-sync", label: "Org / Tuesday sync", rules: [] });

    const run = ok(nibService.indexNib(store, { dir: nibDir }));
    assert.equal(run.contacts, 0);
    assert.match(run.skipped.join(" "), /ingen är namngiven/);
  });
});

describe("contact rows written before the id carried the person", () => {
  /*
   * Every derived row in the real store is in the old shape. Re-deriving them
   * under the new one would write a second row for every conversation ever
   * imported - and worse, would resurrect the ones deleted on purpose, whose
   * tombstones are filed under the old ids.
   */

  it("recognises an old-shape row and leaves it alone", () => {
    writeMeetingNote();
    store.create("touches", {
      id: "nib:note-sync:meeting",
      subject: "ilva",
      kind: "meeting",
      at: daysAgo(3),
      from: "nib"
    });
    bindMeeting(["ilva"]);

    const run = ok(nibService.indexNib(store, { dir: nibDir }));
    assert.equal(run.contacts, 0, "the conversation was imported a second time under a new id");
    assert.equal(store.rows("touches").length, 1);
  });

  it("keeps an old-shape row deleted on purpose deleted", () => {
    // The one that costs something. A contact he threw away coming back on
    // every sync is the app arguing with him about what happened.
    writeMeetingNote();
    store.create("touches", {
      id: "nib:note-sync:meeting",
      subject: "ilva",
      kind: "meeting",
      at: daysAgo(3),
      from: "nib"
    });
    store.remove("touches", "nib:note-sync:meeting");
    bindMeeting(["ilva"]);

    ok(nibService.indexNib(store, { dir: nibDir }));
    assert.equal(store.rows("touches").length, 0, "a deliberately deleted contact came back");
  });

  it("still imports the OTHER attendee when one has an old-shape row", () => {
    /*
     * The migration case that has to work: a folder that was one person's and
     * becomes a meeting. His existing rows stay, and the person he added is
     * imported for the notes that are already there.
     */
    writeMeetingNote();
    store.create("touches", {
      id: "nib:note-sync:meeting",
      subject: "ilva",
      kind: "meeting",
      at: daysAgo(3),
      from: "nib"
    });
    bindMeeting(["ilva", "rune"]);

    const run = ok(nibService.indexNib(store, { dir: nibDir }));
    assert.equal(run.contacts, 1, "adding somebody to the binding did not import the folder for them");
    assert.deepEqual(
      store.rows("touches").map((t) => String(t.subject)).sort(),
      ["ilva", "rune"]
    );
  });

  it("does not let a hand-logged contact block an import", () => {
    // A contact typed in by hand is his own record and has a generated id. It
    // must never be read as "this note is already imported".
    writeMeetingNote();
    store.create("touches", { subject: "ilva", kind: "meeting", at: daysAgo(3) });
    bindMeeting(["ilva"]);

    const run = ok(nibService.indexNib(store, { dir: nibDir }));
    assert.equal(run.contacts, 1);
  });

  it("reads a row whose shape it cannot parse as not-ours rather than as done", () => {
    // Failing towards a duplicate rather than towards an absence: a duplicate
    // is on the page and can be deleted, and a conversation the app quietly
    // decided not to record is invisible.
    assert.equal(nibService.derivedTouch({ id: "nib:weird", from: "nib" }), null);
    assert.equal(nibService.derivedTouch({ id: "nib:note-sync:meeting", from: "nib" }), null);
    assert.equal(nibService.derivedTouch({ id: "abc-123", from: null }), null);
  });

  it("keeps a withdrawn tag withdrawn without touching who was there", () => {
    /*
     * Retraction is keyed on the kind alone even though a row now names a
     * person. Dropping somebody from a meeting must not delete the record of
     * conversations they were actually in: a tag coming off a note corrects
     * what the note was, an attendee list says who comes from now on.
     */
    writeMeetingNote();
    bindMeeting(["ilva", "rune"]);
    ok(nibService.indexNib(store, { dir: nibDir }));
    assert.equal(store.rows("touches").length, 2);

    // Rune leaves the meeting. His past contact stands.
    const [binding] = store.rows("sources");
    store.update("sources", String(binding.id), { people: ["ilva"] });
    ok(nibService.indexNib(store, { dir: nibDir }));
    assert.equal(store.rows("touches").length, 2, "history was rewritten when the attendee list changed");

    // The tag comes off the note. That IS a correction, so it retracts.
    writeMeetingNote({ tags: [] });
    const run = ok(nibService.indexNib(store, { dir: nibDir }));
    assert.equal(run.retracted, 2);
    assert.equal(store.rows("touches").length, 0);
  });
});

describe("commitments out of a shared note", () => {
  const alerts = [
    { id: "al-1", text: "Draft the handover plan", done: false },
    { id: "al-2", text: "Book the workshop room", done: false }
  ];

  it("wait to be told whose they are instead of being copied onto everybody", () => {
    writeMeetingNote({ alerts });
    bindMeeting(["ilva", "rune"]);

    const run = ok(nibService.indexNib(store, { dir: nibDir }));
    assert.equal(run.waiting, 2, "two action points did not produce two waiting commitments");
    assert.equal(run.promises, 0, "a shared note guessed an owner");
    assert.equal(store.rows("promises").length, 0);
    assert.equal(
      store.rows("pendingPromises").length,
      2,
      "four obligations from a two-person meeting would have been the bug"
    );
  });

  it("go straight through when the folder names one person", () => {
    writeMeetingNote({ alerts });
    bindMeeting(["ilva"]);

    const run = ok(nibService.indexNib(store, { dir: nibDir }));
    assert.equal(run.promises, 2);
    assert.equal(run.waiting, 0);
    assert.ok(store.rows("promises").every((p) => String(p.person) === "ilva"));
  });

  it("carry the attendees as the people it could be, and the meeting's name", () => {
    writeMeetingNote({ alerts });
    bindMeeting(["ilva", "rune"], "Manager sync");
    ok(nibService.indexNib(store, { dir: nibDir }));

    const { groups, count } = api.pendingCommitments(store);
    assert.equal(count, 2);
    assert.equal(groups.length, 1, "one meeting is one thing to sit down with");
    assert.equal(groups[0].meeting, "Manager sync");
    assert.equal(groups[0].note, "Tuesday sync");
    assert.deepEqual(
      groups[0].items[0].candidates.map((/** @type {any} */ c) => c.name),
      ["Ilva Brandt", "Rune Falk"]
    );
  });

  it("are dated to the conversation, not to the sync that read it", () => {
    writeMeetingNote({ alerts });
    bindMeeting(["ilva", "rune"]);
    ok(nibService.indexNib(store, { dir: nibDir }));

    const [row] = store.rows("pendingPromises");
    assert.equal(Number(row.madeAt), daysAgo(3), "a promise's whole urgency is its age");
  });

  it("are not queued twice on a second pass", () => {
    writeMeetingNote({ alerts });
    bindMeeting(["ilva", "rune"]);
    ok(nibService.indexNib(store, { dir: nibDir }));

    const again = ok(nibService.indexNib(store, { dir: nibDir }));
    assert.equal(again.waiting, 0);
    assert.equal(store.rows("pendingPromises").length, 2);
  });

  it("become a real promise when he says whose it is", () => {
    writeMeetingNote({ alerts });
    bindMeeting(["ilva", "rune"]);
    ok(nibService.indexNib(store, { dir: nibDir }));

    const { groups } = api.pendingCommitments(store);
    const first = groups[0].items[0];
    ok(api.assignCommitment(store, { id: first.id, person: "Rune Falk" }));

    const promises = store.rows("promises");
    assert.equal(promises.length, 1);
    assert.equal(String(promises[0].person), "rune");
    assert.equal(String(promises[0].text), first.text);
    assert.equal(Number(promises[0].madeAt), daysAgo(3), "filing it re-dated it to today");
    assert.equal(store.rows("pendingPromises").length, 1, "the queued row was left behind");
  });

  it("keeps its id when filed, so the next sync writes nothing", () => {
    // The handover between the two collections is where a duplicate would come
    // from: the next import looks for exactly this id in `promises`.
    writeMeetingNote({ alerts });
    bindMeeting(["ilva", "rune"]);
    ok(nibService.indexNib(store, { dir: nibDir }));
    const { groups } = api.pendingCommitments(store);
    ok(api.assignCommitment(store, { id: groups[0].items[0].id, person: "rune" }));

    const again = ok(nibService.indexNib(store, { dir: nibDir }));
    assert.equal(again.waiting, 0);
    assert.equal(again.promises, 0);
    assert.equal(store.rows("promises").length, 1);
  });

  it("still closes when it is ticked off in Nib after being filed", () => {
    /*
     * The reason the promise reuses the pending row's id, and the half a
     * duplicate check does not cover. Ticking an action point off in Nib
     * resolves its promise here, and that loop finds the promise BY the id
     * derived from the note. Mint a fresh id when filing and nothing is
     * duplicated - the queue's own tombstone sees to that - but the loop back
     * from Nib is quietly severed, so a commitment marked done over there stays
     * open here for ever.
     */
    writeMeetingNote({ alerts });
    bindMeeting(["ilva", "rune"]);
    ok(nibService.indexNib(store, { dir: nibDir }));
    const { groups } = api.pendingCommitments(store);
    ok(api.assignCommitment(store, { id: groups[0].items[0].id, person: "rune" }));

    writeMeetingNote({ alerts: [{ ...alerts[0], done: true }, alerts[1]] });
    const run = ok(nibService.indexNib(store, { dir: nibDir }));

    assert.equal(run.resolved, 1, "ticking it off in Nib did not close the promise it became");
    assert.equal(String(store.rows("promises")[0].state), "resolved");
  });

  it("stays gone when he says it is nobody's promise", () => {
    writeMeetingNote({ alerts });
    bindMeeting(["ilva", "rune"]);
    ok(nibService.indexNib(store, { dir: nibDir }));
    const { groups } = api.pendingCommitments(store);
    ok(api.dropCommitment(store, groups[0].items[0].id));

    const again = ok(nibService.indexNib(store, { dir: nibDir }));
    assert.equal(again.waiting, 0, "a discarded commitment was offered again");
    assert.equal(store.rows("pendingPromises").length, 1);
    assert.equal(store.rows("promises").length, 0);
  });

  it("stays gone even if the folder is later narrowed to one person", () => {
    /*
     * The gap this closes: a commitment queued while the folder was shared and
     * then thrown away would come back as a promise the moment the binding lost
     * its second name, because the single-person path only looked in
     * `promises`.
     */
    writeMeetingNote({ alerts });
    bindMeeting(["ilva", "rune"]);
    ok(nibService.indexNib(store, { dir: nibDir }));
    const { groups } = api.pendingCommitments(store);
    ok(api.dropCommitment(store, groups[0].items[0].id));

    const [binding] = store.rows("sources");
    store.update("sources", String(binding.id), { people: ["ilva"] });
    const again = ok(nibService.indexNib(store, { dir: nibDir }));

    assert.equal(again.promises, 0, "a discarded commitment came back when the binding was narrowed");
    assert.equal(store.rows("promises").length, 0);
  });

  it("does not re-attribute what is still waiting when the binding is narrowed", () => {
    /*
     * Narrowing the attendee list is not an answer to "whose is this". The
     * person who left may be exactly the one who owed it, so filing everything
     * queued against whoever remains would put a real obligation on the wrong
     * page - and quietly, as a side effect of editing a binding. It keeps
     * waiting, and its candidates stay as they were, because both of them were
     * genuinely in the room.
     */
    writeMeetingNote({ alerts });
    bindMeeting(["ilva", "rune"]);
    ok(nibService.indexNib(store, { dir: nibDir }));

    const [binding] = store.rows("sources");
    store.update("sources", String(binding.id), { people: ["ilva"] });
    ok(nibService.indexNib(store, { dir: nibDir }));

    assert.equal(store.rows("promises").length, 0);
    assert.equal(store.rows("pendingPromises").length, 2);
    const { groups } = api.pendingCommitments(store);
    assert.deepEqual(
      groups[0].items[0].candidates.map((/** @type {any} */ c) => c.name),
      ["Ilva Brandt", "Rune Falk"]
    );
  });

  it("is dropped rather than filed when it is ticked off in Nib first", () => {
    // Asking who owes a thing that is already done is a question whose answer
    // changes nothing.
    writeMeetingNote({ alerts });
    bindMeeting(["ilva", "rune"]);
    ok(nibService.indexNib(store, { dir: nibDir }));
    assert.equal(store.rows("pendingPromises").length, 2);

    writeMeetingNote({ alerts: [{ ...alerts[0], done: true }, alerts[1]] });
    const run = ok(nibService.indexNib(store, { dir: nibDir }));
    assert.equal(run.dropped, 1);
    assert.equal(store.rows("pendingPromises").length, 1);
  });

  it("never queues an action point already ticked off", () => {
    writeMeetingNote({ alerts: [{ id: "al-9", text: "Already handled", done: true }] });
    bindMeeting(["ilva", "rune"]);

    const run = ok(nibService.indexNib(store, { dir: nibDir }));
    assert.equal(run.waiting, 0);
    assert.equal(store.rows("pendingPromises").length, 0);
  });

  it("refuses to file one that is not waiting", () => {
    failed(api.assignCommitment(store, { id: "nib:nope:al-1", person: "ilva" }));
    failed(api.dropCommitment(store, "nib:nope:al-1"));
  });

  it("refuses a person it cannot resolve, rather than filing it against nobody", () => {
    writeMeetingNote({ alerts });
    bindMeeting(["ilva", "rune"]);
    ok(nibService.indexNib(store, { dir: nibDir }));
    const { groups } = api.pendingCommitments(store);

    failed(api.assignCommitment(store, { id: groups[0].items[0].id, person: "Nobody At All" }));
    assert.equal(store.rows("pendingPromises").length, 2, "the queued row was consumed by a failed file");
  });
});

describe("everything else that looks a binding up by person", () => {
  /*
   * Found by the app walkthrough rather than by any of these, which is the
   * reason this block exists. Two places filtered bindings on `b.person`
   * directly, so the moment `bindSource` started writing a list they matched
   * nothing - and neither failed. Prep simply stopped offering the note behind
   * a card, and theme detection would have said no folder was bound at all.
   *
   * Nothing errors when a lookup like this goes quiet. It just stops finding
   * things, which is why it needs a test per caller rather than trust.
   */

  it("prep still finds the note behind a person's card", async () => {
    const { prep } = await import("../src/service/prep.js");

    // Enough drift to earn a card at all: a duty they are behind on.
    store.create("duties", {
      id: "d-1to1",
      name: "1-1",
      subjectKind: "person",
      cadenceDays: 14,
      evidenceKinds: ["one-to-one"],
      relations: ["peer-lead"],
      guarded: true,
      status: "active"
    });
    writeMeetingNote();
    bindMeeting(["ilva", "rune"]);

    const card = prep(store, NOW, { nibDir, jotDir: dir }).cards.find(
      (/** @type {any} */ c) => c.person === "Ilva Brandt"
    );
    assert.ok(card, "nobody earned a card, so the lookup was not exercised");
    assert.equal(card.lastWrote?.title, "Tuesday sync", "a shared binding's note did not reach the card");
  });

  it("theme detection still sees a folder as bound to each attendee", async () => {
    const model = await import("../src/service/model.js");
    writeMeetingNote();
    bindMeeting(["ilva", "rune"]);

    // A stand-in model, so what is under test is the lookup rather than a call.
    const answer = await model.detectThemes(store, {
      person: "Rune Falk",
      now: NOW,
      nibDir,
      askImpl: async () => ({ ok: true, value: { themes: [] }, model: "stub", costUsd: 0 })
    });

    assert.ok(
      !("error" in answer) || !/No Nib folder is bound/.test(String(answer.error)),
      `a shared binding was invisible to theme detection: ${JSON.stringify(answer)}`
    );
  });
});

describe("reading observations back", () => {
  /*
   * There was a way to file review material and no way to read it. An agent
   * could add an observation and never see one, and unread material is
   * indistinguishable from none - which is a bad property for the one feature
   * whose value is being complete six months later.
   */

  it("groups by the axis a review is actually held against", () => {
    ok(api.logEvidence(store, { person: "ilva", text: "Carried the migration", area: "team-lead", now: NOW }));
    ok(api.logEvidence(store, { person: "ilva", text: "Wrote the runbook", area: "rnd", now: NOW }));
    ok(api.logEvidence(store, { person: "ilva", text: "Steady in the incident", area: "team-lead", now: NOW }));

    const read = ok(api.observations(store, { person: "ilva" }));
    assert.equal(read.count, 3);
    assert.deepEqual(
      read.areas.map((/** @type {any} */ a) => `${a.area}:${a.items.length}`).sort(),
      ["rnd:1", "team-lead:2"]
    );
  });

  it("keeps the ones with no area rather than hiding most of the record", () => {
    // Most real observations have no area. A read that dropped them would show
    // a fraction of the record and look complete.
    ok(api.logEvidence(store, { person: "rune", text: "Asked the awkward question", now: NOW }));

    const read = ok(api.observations(store, { person: "rune" }));
    assert.equal(read.count, 1);
    assert.equal(read.areas[0].area, "(no area)");
  });

  it("says whose it is, and says nobody for one about his own work", () => {
    ok(api.logEvidence(store, { person: "ilva", text: "Hers", now: NOW }));
    ok(api.logEvidence(store, { text: "Mine", now: NOW }));

    const all = ok(api.observations(store));
    const items = all.areas.flatMap((/** @type {any} */ a) => a.items);
    assert.equal(items.find((/** @type {any} */ i) => i.text === "Hers").person, "Ilva Brandt");
    assert.equal(items.find((/** @type {any} */ i) => i.text === "Mine").person, null);
  });

  it("can be narrowed to one axis", () => {
    ok(api.logEvidence(store, { person: "ilva", text: "One", area: "team-lead", now: NOW }));
    ok(api.logEvidence(store, { person: "ilva", text: "Two", area: "rnd", now: NOW }));

    const read = ok(api.observations(store, { person: "ilva", area: "rnd" }));
    assert.equal(read.count, 1);
    assert.equal(read.areas[0].items[0].text, "Two");
  });

  it("refuses a person it cannot resolve rather than returning everybody's", () => {
    // The dangerous default: a typo silently widening a read about one person
    // into a read about the whole team.
    failed(api.observations(store, { person: "Nobody At All" }));
  });

  it("is reachable through the agent surface, which is where it was missing", () => {
    ok(api.logEvidence(store, { person: "ilva", text: "Carried the migration", area: "team-lead", now: NOW }));
    const read = callTool(store, "tend_observations", { person: "ilva" }, NOW);
    assert.equal(read.count, 1);
  });
});

describe("the same thing through the agent surface", () => {
  it("binds a meeting, reads the queue, and files one - without touching the app", () => {
    /*
     * The rule the whole tool surface is held to: no feature exists in the UI
     * only. An agent asked to tidy up after a meeting has to be able to do the
     * same three things by name.
     */
    writeMeetingNote({
      alerts: [
        { id: "al-1", text: "Draft the handover plan", done: false },
        { id: "al-2", text: "Book the workshop room", done: false }
      ]
    });

    const bound = callTool(
      store,
      "tend_bind_source",
      {
        people: ["Ilva Brandt", "Rune Falk"],
        name: "Tuesday sync",
        categoryId: "cat-org",
        subId: "sub-sync",
        kind: "meeting",
        label: "Org / Tuesday sync"
      },
      NOW
    );
    ok(api.setSourceRules(store, { id: String(bound.id), rules: [{ tagId: "tag-meeting", kind: "meeting" }] }));
    ok(nibService.indexNib(store, { dir: nibDir }));

    const queue = callTool(store, "tend_pending_commitments", {}, NOW);
    assert.equal(queue.count, 2);

    callTool(store, "tend_assign_commitment", { id: queue.groups[0].items[0].id, person: "rune" }, NOW);
    callTool(store, "tend_drop_commitment", { id: queue.groups[0].items[1].id }, NOW);

    assert.equal(store.rows("promises").length, 1);
    assert.equal(store.rows("pendingPromises").length, 0);
    assert.equal(callTool(store, "tend_pending_commitments", {}, NOW).count, 0);
  });
});

describe("what the daily page says about a queue nobody has answered", () => {
  it("says it once per meeting rather than once per commitment", () => {
    // Four flagged blocks from one Tuesday are one thing to sit down with. Four
    // rows would make the page look like four separate problems, which is how a
    // page teaches somebody to skim it.
    writeMeetingNote({
      alerts: [
        { id: "al-1", text: "Draft the handover plan", done: false },
        { id: "al-2", text: "Book the workshop room", done: false },
        { id: "al-3", text: "Write the exit template", done: false }
      ]
    });
    bindMeeting(["ilva", "rune"]);
    ok(nibService.indexNib(store, { dir: nibDir }));

    const a = buildAttention(store.state(), NOW);
    const unfiled = a.needs.concat(a.nudges).filter((i) => i.kind === "unfiled");
    assert.equal(unfiled.length, 1);
    assert.match(unfiled[0].title, /3 commitments/);
    assert.match(unfiled[0].title, /Tuesday sync/);
  });

  it("is loud enough that a focus cannot bury it", () => {
    /*
     * Not critical - nobody has been let down yet, and the note still says what
     * was agreed. But not the softest tier either, because a queue nobody is
     * told about quietly becomes a list of promises he never made good on. Only
     * `watch` and `ok` are held back by a focus.
     */
    writeMeetingNote({ alerts: [{ id: "al-1", text: "Draft the handover plan", done: false }] });
    bindMeeting(["ilva", "rune"]);
    ok(nibService.indexNib(store, { dir: nibDir }));

    const a = buildAttention(store.state(), NOW);
    const item = a.needs.concat(a.nudges).find((i) => i.kind === "unfiled");
    assert.ok(item);
    assert.equal(item.severity, "warn");
  });

  it("goes quiet once everything is filed", () => {
    writeMeetingNote({ alerts: [{ id: "al-1", text: "Draft the handover plan", done: false }] });
    bindMeeting(["ilva", "rune"]);
    ok(nibService.indexNib(store, { dir: nibDir }));
    const { groups } = api.pendingCommitments(store);
    ok(api.assignCommitment(store, { id: groups[0].items[0].id, person: "ilva" }));

    const a = buildAttention(store.state(), NOW);
    assert.equal(a.needs.concat(a.nudges).filter((i) => i.kind === "unfiled").length, 0);
  });
});
