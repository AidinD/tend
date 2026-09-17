/**
 * Reading a plain sentence into a proposal.
 *
 * ## Read this before adding a cue
 *
 * The checks that matter most in this file assert a NON-reading. "Pratade med
 * Nina" must come back with no kind, "Nina granskade min kod" must come back
 * with no kind at all, and a sentence naming two people must come back with no
 * person. Every convenience here is worth one click; those three are worth a
 * cadence that reads green for a fortnight while nothing has happened.
 *
 * ## The regression block at the bottom is not optional
 *
 * The first version of this module shipped with a header claiming its cue lists
 * were "high precision, low recall". They were not, and this file did not catch
 * it, because it was written from the same head as the cues - so it asserted the
 * sentences that head had already thought of. An adversarial pass then broke it
 * on five pieces of ordinary Swedish in a few minutes.
 *
 * Every one of those sentences is now a test, verbatim. A cue added later that
 * reintroduces any of them fails here, which is the only part of this that keeps
 * working after everybody has forgotten the argument.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

/*
 * Pinned before anything reads a clock.
 *
 * A day is a local-time question in this app - `isLaterDay` says so out loud -
 * and the late-evening check below is meaningless on a machine already running
 * in UTC, because there the local date and the UTC date never disagree. Pinning
 * it to his own zone makes the check bite wherever it runs.
 */
process.env.TZ = "Europe/Stockholm";

import { read, readDay, readKind, readPerson, readPromise } from "../src/domain/capture.js";

/** A Thursday, so "i fredags" is six days back and "i torsdags" is seven. */
const NOW = new Date("2026-09-17T10:00:00Z").getTime();

const ROSTER = [
  { id: "p1", name: "Nina" },
  { id: "p2", name: "Oskar Vind" },
  { id: "p3", name: "Tova" }
];

/** @param {number | string} at */
const day = (at) => new Date(Number(at)).toISOString().slice(0, 10);

describe("the kind is read from evidence, or not at all", () => {
  it("refuses a bare 'pratade med', which is the whole point", () => {
    /*
     * Both a 1-1 and a chat by the coffee machine are "pratade med", and the
     * sentence holds nothing that tells them apart. Guessing here is the single
     * guess that damages the drift model silently, so it must fall through.
     */
    assert.equal(readKind("pratade med Nina om bygget"), null);
    assert.equal(readKind("hade ett samtal med Nina"), null);
    assert.equal(readKind("snackade med Oskar"), null);
  });

  it("reads the recurring conversation only when it is named", () => {
    assert.equal(readKind("vårt 1-1 idag")?.value, "one-to-one");
    assert.equal(readKind("vi hade vårt samtal")?.value, "one-to-one");
    assert.equal(readKind("pratade enskilt med Nina")?.value, "one-to-one");
  });

  it("reads a chat as casual only when it is placed somewhere incidental", () => {
    assert.equal(readKind("pratade med Nina i förbifarten")?.value, "casual");
    assert.equal(readKind("stötte på Oskar vid kaffemaskinen")?.value, "casual");
  });

  it("reads second hand, and does not let it near the 1-1", () => {
    const heard = readKind("hörde från Tova att Nina är frustrerad");
    assert.equal(heard?.value, "second-hand");
    assert.notEqual(heard?.value, "one-to-one");
  });

  it("lets where it happened beat what it was about", () => {
    /*
     * A corridor chat that touched on planning is a corridor chat. The first
     * version tried `meeting` first and had "planeringen" on its list, so the
     * strongest evidence in the sentence lost to a topic word.
     */
    assert.equal(
      readKind("pratade med Nina i korridoren om planeringen inför hösten")?.value,
      "casual"
    );
    assert.equal(readKind("vårt 1-1 precis innan mötet")?.value, "one-to-one");
  });

  it("says which words it read, so the dialog can show its evidence", () => {
    assert.equal(readKind("vi hade vårt 1-1")?.from, "1-1");
    assert.equal(readKind("pratade i korridoren")?.from, "i korridoren");
  });
});

describe("the day", () => {
  it("reads today, yesterday and the day before", () => {
    assert.equal(day(readDay("pratade idag", NOW)?.value ?? 0), "2026-09-17");
    assert.equal(day(readDay("pratade igår", NOW)?.value ?? 0), "2026-09-16");
    assert.equal(day(readDay("i förrgår", NOW)?.value ?? 0), "2026-09-15");
  });

  it("reads 'i fredags' as the last one that has already happened", () => {
    assert.equal(day(readDay("i fredags", NOW)?.value ?? 0), "2026-09-11");
  });

  it("reads the weekday you are standing in as a week ago, not as today", () => {
    /*
     * NOW is a Thursday. "I torsdags" said on a Thursday is last Thursday - the
     * day you are in is "idag", and nobody says "i torsdags" about it. Reading
     * it as today would backdate nothing and reset a cadence a week early.
     */
    assert.equal(day(readDay("i torsdags", NOW)?.value ?? 0), "2026-09-10");
  });

  it("reads a written date", () => {
    assert.equal(day(readDay("2026-08-04 träffade vi", NOW)?.value ?? 0), "2026-08-04");
  });

  it("reads the day off the LOCAL clock, not off UTC", () => {
    /*
     * Half past midnight in Stockholm, which is still yesterday in UTC.
     *
     * The first version formatted the day with `toISOString`, so "idag" typed at
     * 00:30 resolved to the day before and the contact went in a day early with
     * nothing failing anywhere. West of Greenwich the same seam failed the other
     * way and harder: at 18:00 in San Francisco the UTC date is already
     * tomorrow, `isLaterDay` then refused the write, and a derived date left
     * nothing on the screen to click past it.
     */
    const lateNight = new Date(2026, 8, 17, 0, 30).getTime();
    assert.equal(day(readDay("pratade idag", lateNight)?.value ?? 0), "2026-09-17");
    assert.equal(day(readDay("pratade igår", lateNight)?.value ?? 0), "2026-09-16");
  });

  it("says nothing rather than today when no day is named", () => {
    /*
     * The dialog defaults to today and says so. That default is an inference the
     * screen states out loud; burying it here would make an assumption
     * indistinguishable from a reading.
     */
    assert.equal(readDay("pratade med Nina", NOW), null);
  });
});

describe("a promise of his own", () => {
  it("reads first person only", () => {
    assert.equal(readPromise("jag ska kolla på render passet")?.value, "jag ska kolla på render passet");
  });

  it("refuses what somebody else is going to do", () => {
    /*
     * "Nina ska kolla på det" is a note about Nina. Filed as a promise it
     * becomes a debt in HIS ledger that ages, turns red, and is read back to him
     * as a failure he never incurred.
     */
    assert.equal(readPromise("Nina ska kolla på render passet"), null);
    assert.equal(readPromise("hen lovade att fixa det"), null);
  });

  it("refuses a negation", () => {
    assert.equal(readPromise("jag tar inte det här, Nina äger det"), null);
    assert.equal(readPromise("jag ska inte lägga mig i"), null);
  });

  it("refuses a conditional, which is filler and not a commitment", () => {
    assert.equal(readPromise("Om jag ska vara ärlig, hen verkade less"), null);
    assert.equal(readPromise("hen sa att jag ska höra av mig, men det är inte klart"), null);
  });

  it("keeps the clause and not the whole sentence, in both word orders", () => {
    /*
     * The second of these is the one that got through. The first version only
     * walked LEFT for a comma, so a sentence opening with the commitment handed
     * over the entire note as the promise text - verbatim the failure the
     * function's own comment claimed to prevent, into an append-only log.
     */
    assert.equal(
      readPromise("Nina var frustrerad över bygget, jag ska kolla på det imorgon")?.value,
      "jag ska kolla på det imorgon"
    );
    assert.equal(
      readPromise("jag ska kolla på bygget, Nina var less på hela releasen")?.value,
      "jag ska kolla på bygget"
    );
  });

  it("stops at a full stop", () => {
    assert.equal(readPromise("jag ska kolla på bygget. Nina verkade nöjd")?.value, "jag ska kolla på bygget");
  });
});

describe("who the sentence is about", () => {
  it("finds one name", () => {
    assert.equal(readPerson(ROSTER, "pratade med Nina i förbifarten")?.person.id, "p1");
  });

  it("finds a full name typed out", () => {
    assert.equal(readPerson(ROSTER, "vårt 1-1 med Oskar Vind")?.person.id, "p2");
  });

  it("finds one by a first name alone", () => {
    assert.equal(readPerson(ROSTER, "vårt 1-1 med Oskar")?.person.id, "p2");
  });

  it("matches a whole name part, never a prefix of one", () => {
    /*
     * THE break that mattered most. `parse.js` matches by prefix, which is right
     * for the palette where somebody is typing a name on purpose. Scanning prose
     * it made every short function word a candidate: with a Viktor on the
     * roster, "VI hade vårt 1-1 med Nina" filed against Viktor - and the reading
     * came back settled, so the dialog had nothing on it to correct.
     */
    const withViktor = [{ id: "v", name: "Viktor" }, { id: "n", name: "Nina" }];
    assert.equal(readPerson(withViktor, "vi hade vårt 1-1 med Nina igår")?.person.id, "n");

    const others = [
      { roster: [{ id: "o", name: "Omar" }], said: "pratade om bygget" },
      { roster: [{ id: "h", name: "Hanna" }], said: "han var inte där" },
      { roster: [{ id: "t", name: "Tara" }], said: "jag tar det imorgon" },
      { roster: [{ id: "i", name: "Isabelle" }], said: "det är klart nu" }
    ];
    for (const { roster, said } of others) {
      assert.equal(readPerson(roster, said), null, `"${said}" named ${roster[0].name}`);
    }
  });

  it("refuses when two people are named", () => {
    /*
     * The canonical second-hand sentence. First-match-wins filed it against
     * Tova - the one person he demonstrably DID speak to - which left Nina's
     * blind spot open and reset Tova's clock instead. Nothing in the words says
     * which of the two the row is about.
     */
    assert.equal(readPerson(ROSTER, "hörde från Tova att Nina är frustrerad"), null);
    assert.equal(readPerson(ROSTER, "mötet med Nina och Tova igår"), null);
  });

  it("refuses a first name two people on the roster share", () => {
    const twoNinas = [
      { id: "p4", name: "Nina Berg" },
      { id: "p5", name: "Nina Sund" }
    ];
    assert.equal(readPerson(twoNinas, "pratade med Nina i förbifarten"), null);
  });

  it("reads a genitive, which is how a sentence about somebody's work is written", () => {
    assert.equal(readPerson(ROSTER, "granskade Ninas PR igår")?.person.id, "p1");
  });

  it("prefers a real name over reading it as somebody else's genitive", () => {
    /*
     * A colleague actually called Hans matches "hans" outright, so the genitive
     * pass - which would turn it into "Han" - never runs.
     */
    const withHans = [{ id: "h", name: "Hans" }, { id: "x", name: "Han" }];
    assert.equal(readPerson(withHans, "det var hans förslag")?.person.id, "h");
  });

  it("says which words named them", () => {
    assert.equal(readPerson(ROSTER, "vårt 1-1 med Nina")?.from, "Nina");
  });
});

describe("reading a whole sentence", () => {
  it("settles when the person and the kind both came out of the words", () => {
    const got = read("vårt 1-1 med Nina igår", ROSTER, NOW);
    assert.equal(got.person?.id, "p1");
    assert.equal(got.personFrom, "Nina");
    assert.equal(got.kind?.value, "one-to-one");
    assert.equal(day(got.day?.value ?? 0), "2026-09-16");
    assert.equal(got.settled, true);
  });

  it("does not settle on a missing kind, however clear the rest is", () => {
    const got = read("pratade med Nina igår om bygget", ROSTER, NOW);
    assert.equal(got.person?.id, "p1");
    assert.equal(got.day !== null, true);
    assert.equal(got.kind, null);
    assert.equal(got.settled, false);
  });

  it("carries both a contact and a promise out of one sentence", () => {
    /*
     * One of his verbatim questions was "ska den loggas någon mer stans?" - so a
     * sentence that is both a conversation and a commitment has to produce both,
     * or the answer to that question is still "you work it out".
     */
    const got = read("vårt 1-1 med Nina, jag ska kolla på render passet", ROSTER, NOW);
    assert.equal(got.kind?.value, "one-to-one");
    assert.equal(got.promise?.value, "jag ska kolla på render passet");
  });

  it("keeps his sentence exactly as he wrote it", () => {
    /*
     * The note is what gets read back in six months and nothing recomputes it.
     * Anything this module trimmed out of it would be gone for good - the log is
     * append-only.
     */
    const said = "vårt 1-1 med Nina, hen var nöjd med hur releasen gick";
    assert.equal(read(said, ROSTER, NOW).note, said);
  });

  it("is empty-safe", () => {
    const got = read("", ROSTER, NOW);
    assert.equal(got.person, null);
    assert.equal(got.kind, null);
    assert.equal(got.settled, false);
  });
});

describe("the sentences an adversarial pass broke the first version with", () => {
  /*
   * Verbatim, every one of them. These are not corner cases - they are ordinary
   * Swedish, and each produced a SETTLED reading, which in the first design meant
   * a screen with nothing on it to correct and an Enter key.
   */

  it("a clock time is not the recurring conversation", () => {
    // `\b1[-:\s]?1\b` allowed a space between the digits, so it matched "11".
    assert.notEqual(readKind("stämde av snabbt med Nina vid kaffemaskinen kl 11:15")?.value, "one-to-one");
    assert.equal(readKind("kl 11:15 med Nina i korridoren")?.value, "casual");
  });

  it("nor is a date that happens to hold an eleven", () => {
    assert.equal(readKind("2026-09-11 pratade jag med Nina i förbifarten")?.value, "casual");
  });

  it("'enligt plan' is not a report about anybody", () => {
    /*
     * This one cost twice over: the 1-1 clock stayed behind AND the second-hand
     * clock reset, so the blind-spot signal went quiet for somebody he had just
     * sat down with.
     */
    assert.equal(readKind("vårt 1-1 med Nina igår, allt går enligt plan")?.value, "one-to-one");
  });

  it("hearing FROM somebody is not hearing ABOUT them", () => {
    assert.equal(readKind("jag hörde av mig till Nina igår"), null);
  });

  it("a sentence where the colleague is the one acting reads as nothing", () => {
    /*
     * "Nina granskade min kod" and "jag granskade Ninas kod" differ by word
     * order alone. There is no narrowing that supplies a missing subject, so
     * `feedback` and `observation` have no cues at all now and are only ever
     * chosen from the list.
     */
    assert.equal(readKind("Nina granskade min kod"), null);
    assert.equal(readKind("Nina påtalade att bygget är trasigt"), null);
    assert.equal(readKind("Nina sa till henne att deadlinen flyttas"), null);
  });

  it("and a whole broken sentence comes back unsettled rather than wrong", () => {
    const withViktor = [{ id: "v", name: "Viktor" }, { id: "n", name: "Nina" }];
    const got = read("vi hade vårt 1-1 med Nina", withViktor, NOW);
    assert.equal(got.person?.id, "n");

    const heard = read("hörde från Tova att Nina är frustrerad", ROSTER, NOW);
    assert.equal(heard.person, null);
    assert.equal(heard.settled, false);
  });
});
