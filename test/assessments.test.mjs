/**
 * A round of feedback about one person.
 *
 * Most of this file is about the three faults in the implementation this was
 * ported from, because each of them is the kind that produces a plausible
 * number rather than an error:
 *
 *   One figure per person, averaged over answers to different questions. A 3.4
 *   from one assessor answering about technical quality and another about
 *   delivery is not a weak signal - nothing was measured twice. Refused by
 *   there being no code path that could produce it, and asserted here as an
 *   absence in what the service returns.
 *
 *   A trend over one date. Three answers from one afternoon drawn as a curve
 *   reads as movement where there is none, so the service says whether a trend
 *   is possible at all rather than leaving a view to work it out.
 *
 *   Two answers from one assessor on one day, both counted. Reported and never
 *   resolved: dropping one is the tool deciding which of two things somebody
 *   said is the one they meant.
 *
 * And one fault that was not on the list. The reference stores answers as
 * question ids pointing into an editable set, so rewording a question changes
 * the meaning of every historical answer to it. The record copies the axis
 * label instead, and the last test here is what says so.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import * as api from "../src/service/api.js";
import { TOOLS, callTool } from "../src/mcp/tools.js";
import {
  WEIGHTS,
  byAxis,
  doubleAnswers,
  isScore,
  occasions,
  rounds
} from "../src/domain/assessments.js";
import { personBlocksIn } from "../src/domain/halves.js";
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
  dir = mkdtempSync(join(tmpdir(), "tend-assess-"));
  let t = NOW - 1_000_000;
  store = openStore({ dataDir: dir, role: "app", host: "test", now: () => t++ });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** @param {object} [over] */
function person(over = {}) {
  return ok(
    api.addPerson(store, {
      name: "Testkodare",
      relation: "lead-and-manage",
      since: daysAgo(400),
      now: NOW,
      ...over
    })
  );
}

/** @param {string} who @param {object} [over] */
function record(who, over = {}) {
  return api.recordAssessment(store, {
    person: who,
    assessor: "Testproducent",
    set: "producentrond",
    setName: "Producentrond",
    scores: [
      { axis: "Leverans och ägarskap", score: 4 },
      { axis: "Kommunikation", score: 3 }
    ],
    note: "Driver sitt eget arbete, hörs sällan av sig själv",
    now: NOW,
    ...over
  });
}

describe("what a record has to carry", () => {
  it("keeps the date, the assessor, the set, a score per axis and the free text", () => {
    const who = person();
    const made = ok(record(String(who.id)));
    assert.equal(made.axes, 2);
    assert.equal(made.said, true);

    const read = ok(api.assessments(store, String(who.id), NOW));
    const [row] = read.answers;
    assert.equal(row.assessor, "Testproducent");
    assert.equal(row.setName, "Producentrond");
    assert.equal(row.at, NOW);
    assert.deepEqual(
      row.scores.map((/** @type {any} */ s) => `${s.axis} ${s.score}`),
      ["Leverans och ägarskap 4", "Kommunikation 3"]
    );
    assert.match(row.note, /Driver sitt eget arbete/);
  });

  it("refuses one with nobody's name on it", () => {
    /*
     * The load-bearing refusal. A rating cannot be weighed without knowing who
     * gave it, and weighing it is most of how it gets read - top marks with
     * every comment box empty from somebody careless says more about the
     * assessor than the subject.
     */
    const who = person();
    const why = failed(record(String(who.id), { assessor: "  " }));
    assert.match(why, /vem som bedömde/i);
    assert.equal(store.rows("assessments").length, 0);
  });

  it("refuses a score off the scale or split between two points", () => {
    const who = person();
    for (const bad of [0, 6, 3.5, "fyra", null]) {
      failed(
        record(String(who.id), {
          scores: [{ axis: "Kommunikation", score: /** @type {any} */ (bad) }]
        })
      );
    }
    assert.equal(store.rows("assessments").length, 0);
  });

  it("refuses a score with no axis to compare it against", () => {
    const who = person();
    const why = failed(record(String(who.id), { scores: [{ axis: "  ", score: 4 }] }));
    assert.match(why, /axel/i);
  });

  it("refuses the same axis twice in one answer", () => {
    // Two answers to one question from one assessor is an input mistake, and
    // stored it is one voice counted twice inside a single row.
    const who = person();
    const why = failed(
      record(String(who.id), {
        scores: [
          { axis: "Kommunikation", score: 4 },
          { axis: "kommunikation", score: 2 }
        ]
      })
    );
    assert.match(why, /två gånger/);
  });

  it("takes a backdated answer, because a round is entered after it is run", () => {
    const who = person();
    ok(record(String(who.id), { at: daysAgo(6) }));
    const read = ok(api.assessments(store, String(who.id), NOW));
    assert.equal(read.answers[0].at, daysAgo(6));
    assert.equal(read.answers[0].daysSince, 6);
  });

  it("says when an assessor wrote nothing at all, as its own fact", () => {
    /*
     * The shape that started the whole card: 5/5/4 with every comment box
     * empty. It reads as a strong result and is closer to no answer, so silence
     * is reported and never folded into the scores as a low one.
     */
    const who = person();
    ok(
      record(String(who.id), {
        note: "",
        scores: [
          { axis: "Leverans och ägarskap", score: 5 },
          { axis: "Problemlösning", score: 5 },
          { axis: "Kommunikation", score: 4 }
        ]
      })
    );
    const read = ok(api.assessments(store, String(who.id), NOW));
    assert.equal(read.answers[0].saidAnything, false);
    // By axis name rather than by position: `byAxis` sorts alphabetically, so
    // an assertion on the order was really an assertion about the sort.
    assert.deepEqual(
      Object.fromEntries(read.byAxis.map((/** @type {any} */ a) => [a.axis, a.mean])),
      { "Kommunikation": 4, "Leverans och ägarskap": 5, "Problemlösning": 5 },
      "silence was scored rather than reported"
    );
  });
});

describe("the assessor's weight is stored from the first round", () => {
  it("takes the weight and the reason, and keeps them on the row", () => {
    /*
     * The knowledge that an assessor is careless lives in one person's head
     * until the row outlives their memory of it. If the field arrives later, the
     * first round is the one it is missing from - which is the round that
     * prompted the card.
     */
    const who = person();
    ok(
      record(String(who.id), {
        assessorWeight: "low",
        weighWhy: "slarvig, satte toppbetyg utan att skriva något"
      })
    );
    const read = ok(api.assessments(store, String(who.id), NOW));
    assert.equal(read.answers[0].assessorWeight, "low");
    assert.equal(read.answers[0].assessorWeightLabel, WEIGHTS.low.label);
    assert.match(read.answers[0].weighWhy, /slarvig/);
  });

  it("defaults to unset rather than to normal, so an unweighed row stays a gap", () => {
    // "Nobody has said anything about this assessor" and "weighed and found
    // ordinary" are different facts, and a default of normal would erase the
    // first into the second.
    const who = person();
    ok(record(String(who.id)));
    assert.equal(ok(api.assessments(store, String(who.id), NOW)).answers[0].assessorWeight, "unset");
  });

  it("refuses a weight nobody declared", () => {
    const who = person();
    failed(record(String(who.id), { assessorWeight: "tungt" }));
  });

  it("does not let the weight touch the aggregate yet", () => {
    /*
     * Deliberate, and the reason it is a test rather than a comment: a
     * weighting applied before anybody decided what weight MEANS would be worse
     * than not having the field, because the resulting numbers would look
     * considered. Two answers, one dismissed and one heavy, still average
     * plainly.
     */
    const who = person();
    ok(record(String(who.id), { assessor: "En", assessorWeight: "low", scores: [{ axis: "Kommunikation", score: 2 }] }));
    ok(record(String(who.id), { assessor: "Två", assessorWeight: "high", scores: [{ axis: "Kommunikation", score: 4 }] }));

    const read = ok(api.assessments(store, String(who.id), NOW));
    const axis = read.byAxis.find((/** @type {any} */ a) => a.axis === "Kommunikation");
    assert.ok(axis, "the axis is missing, so this proved nothing");
    assert.equal(axis.mean, 3, "the weight has started moving the mean without a decision");
    assert.equal(axis.n, 2);
  });
});

describe("the three faults it was ported without", () => {
  it("never produces one figure for a person", () => {
    /*
     * The most important assertion in the file. Two assessors answering about
     * different things, and the reference implementation shows their average.
     * Checked as an absence in the whole payload rather than by inspecting one
     * field, so a helpful addition of `average` later fails here.
     */
    const who = person();
    ok(record(String(who.id), { assessor: "En", scores: [{ axis: "Teknisk kvalitet", score: 4 }] }));
    ok(record(String(who.id), { assessor: "Två", scores: [{ axis: "Leverans och ägarskap", score: 3 }] }));

    const read = ok(api.assessments(store, String(who.id), NOW));
    const named = Object.keys(read);
    assert.deepEqual(
      named.filter((k) => /average|mean|score|overall|total/i.test(k)),
      [],
      `a figure for the person appeared in the payload: ${named.join(", ")}`
    );

    // And the two answers stay apart, one axis each with n=1.
    assert.deepEqual(
      read.byAxis.map((/** @type {any} */ a) => `${a.axis} ${a.mean} n=${a.n}`),
      ["Leverans och ägarskap 3 n=1", "Teknisk kvalitet 4 n=1"]
    );
  });

  it("keeps two sets apart even when they share an axis name", () => {
    /*
     * The same fault one level down. A producer's set and a lead's set can both
     * have an axis called Kommunikation and mean different things by it, so
     * merging on the label alone rebuilds the cross-set average one axis at a
     * time.
     */
    const who = person();
    ok(record(String(who.id), { assessor: "En", set: "producent", setName: "Producentrond", scores: [{ axis: "Kommunikation", score: 5 }] }));
    ok(record(String(who.id), { assessor: "Två", set: "lead", setName: "Leadrond", scores: [{ axis: "Kommunikation", score: 1 }] }));

    const read = ok(api.assessments(store, String(who.id), NOW));
    assert.equal(read.byAxis.length, 2, JSON.stringify(read.byAxis));
    for (const a of read.byAxis) {
      assert.equal(a.n, 1, `${a.setName} merged two sets into one figure`);
    }
  });

  it("says a trend is not possible over a single occasion", () => {
    const who = person();
    ok(record(String(who.id), { assessor: "En" }));
    ok(record(String(who.id), { assessor: "Två" }));
    ok(record(String(who.id), { assessor: "Tre" }));

    const one = ok(api.assessments(store, String(who.id), NOW));
    assert.equal(one.rounds, 1, "three answers from one day counted as three occasions");
    assert.equal(one.trendPossible, false);

    ok(record(String(who.id), { assessor: "Fyra", at: daysAgo(95) }));
    const two = ok(api.assessments(store, String(who.id), NOW));
    assert.equal(two.rounds, 2);
    assert.equal(two.trendPossible, true);
  });

  it("reports two answers from one assessor on one day, and counts both", () => {
    /*
     * Both, on purpose. Keeping them counts one opinion twice and moves the
     * mean; dropping one is the tool deciding which of two things somebody said
     * is the one they meant. So the collision is surfaced for a person.
     */
    const who = person();
    ok(record(String(who.id), { assessor: "Testproducent", scores: [{ axis: "Kommunikation", score: 4 }] }));
    ok(record(String(who.id), { assessor: "testproducent ", scores: [{ axis: "Kommunikation", score: 3 }] }));

    const read = ok(api.assessments(store, String(who.id), NOW));
    assert.equal(read.doubles.length, 1, JSON.stringify(read.doubles));
    assert.equal(read.doubles[0].ids.length, 2);
    assert.equal(read.byAxis[0].n, 2, "a colliding answer was silently dropped");
  });

  it("and a mis-entered row can be taken back", () => {
    const who = person();
    const made = ok(record(String(who.id)));
    ok(api.removeAssessment(store, String(made.id)));
    assert.equal(ok(api.assessments(store, String(who.id), NOW)).answers.length, 0);
  });
});

describe("a record survives its question set being rewritten", () => {
  it("carries the axis labels it was answered on, not a pointer to them", () => {
    /*
     * The fault that was not on the list. Answers stored as question ids into
     * an editable set mean that rewording a question changes what everybody
     * answered last spring, with nothing failing. So the label - and the prompt
     * if there was one - is copied onto the row when it is written.
     */
    const who = person();
    ok(
      record(String(who.id), {
        scores: [
          {
            axis: "Leverans och ägarskap",
            asked: "När Testkodare får en uppgift, hur upplever du deras förmåga att driva den i mål?",
            score: 4
          }
        ]
      })
    );

    const row = store.rows("assessments")[0];
    assert.equal(row.scores[0].axis, "Leverans och ägarskap");
    assert.match(String(row.scores[0].asked), /driva den i mål/);
    assert.equal(
      Object.keys(row.scores[0]).some((k) => /questionId|question$/.test(k)),
      false,
      "the row points at a question row instead of carrying what was asked"
    );
  });
});

describe("where these rows may and may not appear", () => {
  it("is a work-half block and never a private one", () => {
    // Other people's ratings of a third person. Run over a family it is not a
    // tool that has become something else, it has no meaning at all.
    assert.equal(personBlocksIn("work").assessments, true);
    assert.equal(personBlocksIn("private").assessments, false);
  });

  it("lets an agent read a round, so a 1-1 is prepared from the same ground", () => {
    /*
     * A session preparing a review from a different picture of the same person
     * is worse than one with nothing, because it reads as agreement.
     */
    const who = person();
    ok(record(String(who.id), { assessor: "Testproducent" }));

    const read = ok(callTool(store, "tend_assessments", { person: String(who.id) }, NOW));
    assert.equal(read.answers.length, 1);
    assert.equal(read.answers[0].assessor, "Testproducent");
  });

  it("and no agent a way to write one", () => {
    /*
     * Left closed rather than settled: a number about a named colleague,
     * produced by anything other than the colleague who gave it, is the
     * highest-consequence row in this app. Whether an agent may transcribe a
     * form response is on the card as a question, and this stops it being
     * answered by quietly adding a tool.
     *
     * Checked on behaviour and not only on names, which is the fix to this
     * check rather than an addition to it. The first version refused any tool
     * whose name mentioned assessments at all, so the read tool this card
     * exists to add tripped it - a check that forbade the wrong thing. What is
     * actually forbidden is a write, and the store can say whether one
     * happened.
     */
    const names = TOOLS.map((t) => t.name);
    const writers = names.filter((n) =>
      /(record|log|add|set|write|remove|delete|update)/i.test(n) && /assess|rating|evaluat/i.test(n)
    );
    assert.deepEqual(writers, [], `an MCP tool is named as if it writes one: ${writers.join(", ")}`);

    const who = person();
    ok(record(String(who.id)));
    const before = store.state().applied;

    for (const name of names.filter((n) => /assess|person/i.test(n))) {
      callTool(store, name, { person: String(who.id) }, NOW);
    }

    assert.equal(
      store.state().applied,
      before,
      "reading a person or their rounds over MCP wrote something to the log"
    );
  });
});

describe("the pieces underneath", () => {
  it("accepts whole points on the scale and nothing else", () => {
    assert.equal(isScore(1), true);
    assert.equal(isScore(5), true);
    assert.equal(isScore(0), false);
    assert.equal(isScore(6), false);
    assert.equal(isScore(3.5), false);
    assert.equal(isScore("4"), false);
  });

  it("carries the spread beside the mean", () => {
    // Three assessors at 2, 3 and 5 average to the same place as three at 3, 3
    // and 4 and mean something entirely different. A mean shown without the
    // spread is the figure that gets quoted.
    const rows = [2, 3, 5].map((score, i) => ({
      id: `a${i}`,
      set: "s",
      setName: "S",
      at: NOW,
      assessor: `nummer ${i}`,
      scores: [{ axis: "Kommunikation", asked: "", score }]
    }));
    const [axis] = byAxis(/** @type {any} */ (rows));
    assert.ok(axis, "byAxis returned nothing, so this proved nothing");
    assert.equal(axis.mean, 10 / 3);
    assert.equal(axis.n, 3);
    assert.equal(axis.low, 2);
    assert.equal(axis.high, 5);
    assert.equal(axis.spread, 3);
  });

  it("counts occasions as days, not as rows", () => {
    const rows = [
      { id: "a", at: NOW, assessor: "en", scores: [] },
      { id: "b", at: NOW + 1000, assessor: "två", scores: [] },
      { id: "c", at: daysAgo(90), assessor: "tre", scores: [] }
    ];
    assert.equal(occasions(/** @type {any} */ (rows)).length, 2);
  });

  it("ignores an unnamed or undated row when looking for collisions", () => {
    const rows = [
      { id: "a", at: 0, assessor: "en", scores: [] },
      { id: "b", at: 0, assessor: "en", scores: [] },
      { id: "c", at: NOW, assessor: "  ", scores: [] },
      { id: "d", at: NOW, assessor: "  ", scores: [] }
    ];
    assert.deepEqual(doubleAnswers(/** @type {any} */ (rows)), []);
  });
});

describe("what a person's page carries about a round, and what it does not", () => {
  it("carries the aggregate so a session sees the same ground as the window", () => {
    /*
     * The gap this card exists for: a round was entered in the app and no read
     * outside it could say the rows had landed at all.
     */
    const who = person();
    ok(record(String(who.id), { assessor: "En" }));
    ok(record(String(who.id), { assessor: "Två", scores: [{ axis: "Kommunikation", score: 5 }] }));

    const page = ok(api.person(store, String(who.id), NOW));
    assert.ok(page.assessments, "a person's page says nothing about their rounds");
    assert.equal(page.assessments.answers, 2);
    assert.equal(page.assessments.rounds, 1);
    assert.equal(page.assessments.trendPossible, false);
    assert.ok(
      page.assessments.byAxis.some((/** @type {any} */ a) => a.axis === "Kommunikation" && a.n === 2)
    );
  });

  it("but not who said what, nor what they wrote", () => {
    /*
     * The split is the point rather than an economy. An aggregate is about the
     * subject; an individual answer is about the assessor as much as about them,
     * so it is asked for through tend_assessments instead of arriving in every
     * payload that asks who somebody is.
     */
    const who = person();
    ok(
      record(String(who.id), {
        assessor: "Testproducent",
        note: "en mening som inte ska läcka hit",
        weighWhy: "slarvig"
      })
    );

    const page = ok(api.person(store, String(who.id), NOW));
    const json = JSON.stringify(page.assessments);
    assert.doesNotMatch(json, /Testproducent/, "an assessor's name is in the person payload");
    assert.doesNotMatch(json, /inte ska läcka/, "an assessor's free text is in the person payload");
    assert.doesNotMatch(json, /slarvig/, "why an assessor is weighed low is in the person payload");
  });

  it("says nothing rather than zero when nobody has been assessed", () => {
    // Null and not an empty aggregate: "no round has been run" and "a round came
    // back empty" are different facts, and one figure of 0 would read as the
    // second.
    const who = person();
    assert.equal(ok(api.person(store, String(who.id), NOW)).assessments, null);
  });

  it("carries the two facts that change how every figure beside them reads", () => {
    /*
     * How many assessors wrote nothing, and whether anybody answered twice in a
     * day. Both are in the summary because a reader would otherwise have to
     * open the rows to find out, and both change what the means mean.
     */
    const who = person();
    ok(record(String(who.id), { assessor: "Testproducent", note: "" }));
    ok(record(String(who.id), { assessor: "testproducent", note: "" }));

    const summary = ok(api.person(store, String(who.id), NOW)).assessments;
    assert.ok(summary, "no aggregate at all, so this proved nothing");
    assert.equal(summary.saidNothing, 2);
    assert.equal(summary.doubles, 1);
  });
});

describe("the rounds read as a history rather than a pile", () => {
  it("groups the answers into the occasions they arrived on, newest first", () => {
    const who = person();
    ok(record(String(who.id), { assessor: "Testproducent", now: daysAgo(200) }));
    ok(record(String(who.id), { assessor: "Testregissör", now: daysAgo(200) + 3600_000 }));
    ok(record(String(who.id), { assessor: "Testproducent", now: NOW }));

    const read = ok(api.assessments(store, String(who.id), NOW));
    assert.equal(read.roundHistory.length, 2, "two occasions were not seen as two");
    assert.ok(
      read.roundHistory[0].day > read.roundHistory[1].day,
      "the history is not newest first"
    );
    assert.equal(read.roundHistory[1].n, 2, "the two answers from one day did not group");
  });

  it("counts answers an hour apart as one occasion, not two", () => {
    // A round is a form sent out and answered over an afternoon or a week. An
    // instant would make every answer its own round and the history useless.
    const who = person();
    ok(record(String(who.id), { assessor: "Testproducent", now: NOW }));
    ok(record(String(who.id), { assessor: "Testregissör", now: NOW + 3600_000 }));

    const read = ok(api.assessments(store, String(who.id), NOW));
    assert.equal(read.roundHistory.length, 1);
    assert.equal(read.roundHistory[0].n, 2);
  });

  it("names who answered each round, because that is what makes two comparable", () => {
    /*
     * The field the whole no-delta decision rests on. Two rounds with no
     * assessor in common are two different measurements however alike their
     * means look, and a reader can only see that if the names travel with the
     * round.
     */
    const who = person();
    ok(record(String(who.id), { assessor: "Testregissör", now: daysAgo(200) }));
    ok(record(String(who.id), { assessor: "Testproducent", now: NOW }));

    const read = ok(api.assessments(store, String(who.id), NOW));
    assert.deepEqual(read.roundHistory[0].assessors, ["Testproducent"]);
    assert.deepEqual(read.roundHistory[1].assessors, ["Testregissör"]);
  });

  it("carries no change against the round before it, anywhere", () => {
    /*
     * THE test for this card. Subtracting one round's mean from the last one's
     * is the obvious feature and it is wrong: the assessors differ, so the
     * difference is between two populations and would be read as movement in
     * the person. Same fault the focus price had on 2026-09-08.
     *
     * Asserted on the shape rather than on a rendered string, so it also fails
     * if somebody adds the field intending the view to use it later.
     */
    const who = person();
    ok(
      record(String(who.id), {
        assessor: "Testregissör",
        scores: [{ axis: "Kommunikation", score: 2 }],
        now: daysAgo(200)
      })
    );
    ok(
      record(String(who.id), {
        assessor: "Testproducent",
        scores: [{ axis: "Kommunikation", score: 5 }],
        now: NOW
      })
    );

    const read = ok(api.assessments(store, String(who.id), NOW));
    for (const round of read.roundHistory) {
      const fields = Object.keys(round).concat(Object.keys(round.byAxis[0] ?? {}));
      const movement = fields.filter((f) => /change|delta|diff|trend|since|prev|movement/i.test(f));
      assert.deepEqual(movement, [], `a round carries a change figure: ${movement.join(", ")}`);
    }
  });

  it("keeps two question sets apart inside one round, exactly as it does across all of them", () => {
    /*
     * The invariant this feature could quietly break. Grouping by day and then
     * averaging the day would rebuild the cross-set mean the file exists to
     * refuse - a producer's Kommunikation and a lead's Kommunikation are not the
     * same question - so a round's figures come from `byAxis` on its own rows.
     */
    const who = person();
    ok(
      record(String(who.id), {
        assessor: "Testproducent",
        set: "producentrond",
        setName: "Producentrond",
        scores: [{ axis: "Kommunikation", score: 5 }],
        now: NOW
      })
    );
    ok(
      record(String(who.id), {
        assessor: "Testregissör",
        set: "regirond",
        setName: "Regirond",
        scores: [{ axis: "Kommunikation", score: 1 }],
        now: NOW
      })
    );

    const read = ok(api.assessments(store, String(who.id), NOW));
    assert.equal(read.roundHistory.length, 1, "one day should be one round");
    const [round] = read.roundHistory;
    assert.equal(round.byAxis.length, 2, "one round merged two question sets into one figure");
    for (const axis of round.byAxis) {
      assert.equal(axis.n, 1, `${axis.setName} ${axis.axis} counted somebody else's answer`);
    }
  });

  it("figures a round over its own answers only, not over every round's", () => {
    /*
     * Found by mutation: swapping the round's own rows for all of them left
     * every test green, because they all used a single day. So each round would
     * have reported the whole record's mean under its own date - two rounds
     * showing an identical figure that belongs to neither, which is worse than
     * no history at all since it looks like stability.
     */
    const who = person();
    ok(
      record(String(who.id), {
        assessor: "Testregissör",
        scores: [{ axis: "Kommunikation", score: 2 }],
        now: daysAgo(200)
      })
    );
    ok(
      record(String(who.id), {
        assessor: "Testproducent",
        scores: [{ axis: "Kommunikation", score: 4 }],
        now: NOW
      })
    );

    const read = ok(api.assessments(store, String(who.id), NOW));
    const [newest, oldest] = read.roundHistory;
    assert.equal(newest.byAxis.length, 1);
    assert.equal(newest.byAxis[0].n, 1, "the newest round counted the older round's answer");
    assert.equal(newest.byAxis[0].mean, 4, `the newest round reads ${newest.byAxis[0].mean}`);
    assert.equal(oldest.byAxis[0].n, 1, "the oldest round counted the newer round's answer");
    assert.equal(oldest.byAxis[0].mean, 2, `the oldest round reads ${oldest.byAxis[0].mean}`);

    /* And the aggregate over everything is still the aggregate - the mean of
       both - so the two shapes are genuinely answering different questions. */
    const all = read.byAxis.find((/** @type {any} */ a) => a.axis === "Kommunikation");
    assert.ok(all, "the aggregate lost the axis");
    assert.equal(all.n, 2);
    assert.equal(all.mean, 3);
  });

  it("reports the silent answers per round, not only over the whole record", () => {
    // Top marks with every box empty reads as a strong result and is closer to
    // no answer. Which ROUND that happened in is the useful version.
    const who = person();
    ok(record(String(who.id), { assessor: "Testproducent", note: "", now: NOW }));
    ok(record(String(who.id), { assessor: "Testregissör", note: "Skrev en hel del", now: NOW }));

    const read = ok(api.assessments(store, String(who.id), NOW));
    assert.equal(read.roundHistory[0].silent, 1);
  });

  it("and the count of occasions still means occasions, beside the history", () => {
    // `rounds` is the number and `roundHistory` is the list. They answer
    // different questions and the summary line asks the first.
    const who = person();
    ok(record(String(who.id), { now: daysAgo(200) }));
    ok(record(String(who.id), { assessor: "Testregissör", now: NOW }));

    const read = ok(api.assessments(store, String(who.id), NOW));
    assert.equal(read.rounds, 2);
    assert.equal(read.roundHistory.length, 2);
    assert.equal(read.trendPossible, true);
  });

  it("dates an answer by when it was answered, not by when it was typed in", () => {
    /*
     * The half of the round history that nothing covered, and it was broken.
     *
     * The form has a date field precisely because answers arrive after the fact,
     * and `recordAssessment` honours `at` over `now` - but the renderer was
     * re-parsing the timestamp the form had already produced, so every answer
     * was filed as today and a second occasion was unreachable. The e2e drives
     * the form; this holds the service's own promise, which is the thing the
     * renderer relies on.
     */
    const who = person();
    const answered = daysAgo(190);
    ok(record(String(who.id), { at: answered, now: NOW }));

    const read = ok(api.assessments(store, String(who.id), NOW));
    assert.equal(read.answers[0].at, answered, "the answer was filed under the wrong instant");
    assert.equal(
      read.roundHistory[0].day,
      new Date(answered).toISOString().slice(0, 10),
      "the round is not under the day it was answered on"
    );
  });

  it("falls back to now when the date given is not a usable instant", () => {
    // NaN was what the renderer actually sent, and "no date" is the right
    // reading of it - the wrong part was producing it, not handling it.
    const who = person();
    ok(record(String(who.id), { at: Number.NaN, now: NOW }));
    const read = ok(api.assessments(store, String(who.id), NOW));
    assert.equal(read.answers[0].at, NOW);
  });

  it("drops a row with no date rather than inventing a round for it", () => {
    // Straight at the domain: `at` of 0 is a row that never got a date, and
    // 1970 as its own occasion at the bottom of the history is worse than
    // nothing.
    const out = rounds(
      /** @type {any} */ ([
        { id: "a", at: 0, assessor: "Ingen", scores: [], saidAnything: false, set: "s", setName: "S" },
        { id: "b", at: NOW, assessor: "Någon", scores: [], saidAnything: true, set: "s", setName: "S" }
      ])
    );
    assert.equal(out.length, 1);
    assert.equal(out[0].n, 1);
  });
});

describe("when a round counts as run", () => {
  /** A duty that a survey round can satisfy, which is what makes an offer possible. */
  const roundDuty = () => {
    const made = ok(
      api.proposeDuty(store, {
        name: "Feedbackrunda",
        means: "Två frågeuppsättningar på en skala, mappade mot nivåaxlarna",
        source: "yours",
        subjectKind: "person",
        cadenceDays: 90,
        evidenceKinds: ["survey"],
        relations: ["lead-and-manage"]
      })
    );
    ok(api.decideDuty(store, String(made.id), "active"));
    return String(made.id);
  };

  it("does not count as run just because an answer was recorded", () => {
    /*
     * The load-bearing refusal, and it is a real case rather than a principle:
     * one assessor answered 5/5/4 with every comment box empty and is weighed
     * low. Had that silenced a ninety-day duty, the person would have read as
     * tended for a year on one careless row.
     */
    roundDuty();
    const who = person();
    ok(record(String(who.id), { note: "" }));

    const cadences = api.person(store, String(who.id), NOW);
    const round = ok(cadences).cadences.find((/** @type {any} */ c) => /Feedbackrunda/.test(c.duty));
    assert.ok(round, "the round duty does not reach this person, so this proved nothing");
    assert.equal(round.lastHappened, "aldrig", "recording an answer silenced the duty by itself");
  });

  it("offers it instead, derived rather than fired once", () => {
    /*
     * Derived is the point. A prompt shown once after recording can be missed,
     * and missing it leaves the state this was built to fix - which had already
     * happened twice by hand. This appears on its own and was true of the rounds
     * entered before it existed.
     */
    roundDuty();
    const who = person();
    ok(record(String(who.id), { assessor: "En", note: "" }));
    ok(record(String(who.id), { assessor: "Två", note: "skrev något" }));

    const offer = api.roundOffer(store, String(who.id), NOW);
    assert.ok(offer, "nothing was offered");
    assert.equal(offer.answers, 2);
    assert.equal(offer.assessors, 2);
    assert.equal(offer.saidNothing, 1, "the offer does not say how many wrote nothing");
    assert.deepEqual(
      offer.duties.map((/** @type {any} */ d) => d.name),
      ["Feedbackrunda"]
    );
  });

  it("offers nothing when no duty on that person asks for a round", () => {
    // A round on somebody whose duties do not ask for one is not a round
    // anybody owed, so there is nothing to satisfy and nothing to offer.
    const who = person({ name: "Testkollega", relation: "equal-lead" });
    ok(record(String(who.id)));
    assert.equal(api.roundOffer(store, String(who.id), NOW), null);
  });

  it("stops offering once it has been accepted, and starts again on a new answer", () => {
    /*
     * Self-clearing, which is what keeps it off a page whose whole value is that
     * everything on it is actionable. A standing offer on anybody ever assessed
     * would be a permanent item.
     */
    roundDuty();
    const who = person();
    ok(record(String(who.id), { assessor: "En" }));

    ok(api.markRoundRun(store, { person: String(who.id), now: NOW }));
    assert.equal(api.roundOffer(store, String(who.id), NOW), null);

    ok(api.recordAssessment(store, {
      person: String(who.id),
      assessor: "Tre",
      scores: [{ axis: "Kommunikation", score: 4 }],
      at: NOW + DAY_MS,
      now: NOW + DAY_MS
    }));
    const again = api.roundOffer(store, String(who.id), NOW + DAY_MS);
    assert.ok(again, "a later answer did not raise the offer again");
    assert.equal(again.answers, 1, "an accepted round is being counted twice");
  });

  it("dates the contact to the newest answer, not to the day it was accepted", () => {
    /*
     * The round happened when the answers came in. Stamping it with the day the
     * offer was accepted would overstate how current the picture is, by exactly
     * the gap between running a round and getting round to filing it.
     */
    roundDuty();
    const who = person();
    const answered = NOW - 12 * DAY_MS;
    ok(record(String(who.id), { at: answered }));

    ok(api.markRoundRun(store, { person: String(who.id), now: NOW }));
    const touch = store.rows("touches").find((t) => String(t.kind) === "survey");
    assert.ok(touch, "no survey contact was logged");
    assert.equal(touch.at, answered);
  });

  it("says in the contact what the round was, so the row reads in a year", () => {
    roundDuty();
    const who = person();
    ok(record(String(who.id), { assessor: "En", note: "" }));
    ok(record(String(who.id), { assessor: "Två", note: "skrev något" }));
    ok(api.markRoundRun(store, { person: String(who.id), now: NOW }));

    const touch = store.rows("touches").find((t) => String(t.kind) === "survey");
    assert.match(String(touch?.note), /2 bedömningar från 2 bedömare/);
    assert.match(String(touch?.note), /1 med fritext/);
  });

  it("and then the duty is actually in step, which is the whole point", () => {
    roundDuty();
    const who = person();
    ok(record(String(who.id)));
    ok(api.markRoundRun(store, { person: String(who.id), now: NOW }));

    const page = ok(api.person(store, String(who.id), NOW));
    const round = page.cadences.find((/** @type {any} */ c) => /Feedbackrunda/.test(c.duty));
    assert.ok(round, "the round duty is gone from the page, so this proved nothing");
    assert.notEqual(round.lastHappened, "aldrig");
    assert.equal(round.urgency, "ok", `the duty reads ${round.urgency} after being marked`);
  });

  it("refuses to mark a round nobody has answered", () => {
    roundDuty();
    const who = person();
    const why = failed(api.markRoundRun(store, { person: String(who.id), now: NOW }));
    assert.match(why, /ingen rond/i);
  });

  it("gives no agent a way to accept it", () => {
    /*
     * `tend_log_touch` can already log a survey contact and that is unchanged -
     * an agent may record that something happened. This is a different claim:
     * that a ROUND is complete, drawn from the answers, which is a judgement
     * about how much evidence is enough. Same boundary as a cadence.
     */
    const names = TOOLS.map((t) => t.name);
    const found = names.filter((n) => /round|rond/i.test(n));
    assert.deepEqual(found, [], `an MCP tool can mark a round run: ${found.join(", ")}`);
  });
});
