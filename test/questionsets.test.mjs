/**
 * Question sets: what one kind of assessor is asked about.
 *
 * The test that is the reason for the file is "rewording a set leaves every
 * round already run saying what it said". That is the fourth defect found in the
 * reference implementation - there, answers hold question ids pointing into an
 * editable set, so rewording a question changes the meaning of every historical
 * answer to it with nothing failing anywhere. A set here is a template for
 * entry and nothing else, and this is what holds that line.
 *
 * The rest guards the consistency the sets exist for. The aggregate groups on
 * the raw label, so before this a round was comparable to the last one only if
 * two or three labels were retyped identically after ninety days.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import * as api from "../src/service/api.js";
import { TOOLS, callTool } from "../src/mcp/tools.js";
import { MAX_AXES, axisKey, badSet } from "../src/domain/questionsets.js";
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
  dir = mkdtempSync(join(tmpdir(), "tend-sets-"));
  let t = NOW - 1_000_000;
  store = openStore({ dataDir: dir, role: "app", host: "test", now: () => t++ });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** @param {object} [over] */
function producerSet(over = {}) {
  return api.addQuestionSet(store, {
    name: "Producentrond",
    discipline: "producent",
    axes: [
      { axis: "Leverans och ägarskap", asked: "Levererar enligt plan?" },
      { axis: "Kommunikation", asked: "" }
    ],
    now: NOW,
    ...over
  });
}

function person() {
  return ok(api.addPerson(store, { name: "Testkodare", relation: "lead-and-manage", now: NOW }));
}

describe("a set says what one kind of assessor is asked", () => {
  it("keeps its axes, its discipline and the question behind each axis", () => {
    const made = ok(producerSet());
    assert.equal(made.axes, 2);

    const read = api.questionSets(store);
    assert.equal(read.live.length, 1);
    const [set] = read.live;
    assert.equal(set.discipline, "producent");
    assert.deepEqual(
      set.axes.map((/** @type {any} */ a) => a.axis),
      ["Leverans och ägarskap", "Kommunikation"]
    );
    assert.match(set.axes[0].asked, /Levererar enligt plan/);
  });

  it("orders the picker by discipline, so the choice reads as which assessor", () => {
    ok(producerSet());
    ok(
      producerSet({
        name: "Peerrond",
        discipline: "art lead",
        axes: [{ axis: "Hantverk" }]
      })
    );
    const read = api.questionSets(store);
    assert.deepEqual(
      read.live.map((/** @type {any} */ q) => q.discipline),
      ["art lead", "producent"]
    );
  });
});

describe("what a set may not be", () => {
  it("refuses one with no name, because a round is named after it a year later", () => {
    assert.match(failed(producerSet({ name: "  " })), /behöver ett namn/);
  });

  it("refuses one with no axes, since there would be nothing to answer", () => {
    assert.match(failed(producerSet({ axes: [] })), /utan axlar/);
  });

  it("refuses more axes than anybody answers honestly", () => {
    const many = Array.from({ length: MAX_AXES + 1 }, (_, i) => ({ axis: `Axel ${i}` }));
    assert.match(failed(producerSet({ axes: many })), /för många/);
  });

  it("refuses the same axis twice in one set, however it is capitalised", () => {
    /*
     * Two rows the aggregate cannot tell apart, and the second would silently
     * double somebody's answer on that axis. Refused at the set, which is the
     * one place it is still one row to fix.
     */
    const why = failed(
      producerSet({ axes: [{ axis: "Kommunikation" }, { axis: "  kommunikation " }] })
    );
    assert.match(why, /två gånger/);
  });

  it("refuses a second set with the same name, live or retired", () => {
    const made = ok(producerSet());
    assert.match(failed(producerSet()), /finns redan/);

    ok(api.retireQuestionSet(store, String(made.id), { now: NOW }));
    // Still taken: a retired set names the rounds run on it, so reusing the
    // name makes two different sets look like one history.
    assert.match(failed(producerSet()), /pensionerat/);
  });
});

describe("rewording a set cannot reach a round already run", () => {
  it("leaves every stored answer saying exactly what it said", () => {
    /*
     * THE test. In the reference implementation an answer points at a question
     * id inside an editable set, so rewording the question rewrites the meaning
     * of every historical answer to it - and nothing fails, which is what makes
     * it worth a test rather than a comment.
     */
    const made = ok(producerSet());
    const who = person();

    ok(
      api.recordAssessment(store, {
        person: String(who.id),
        assessor: "Testproducent",
        set: String(made.id),
        setName: "Producentrond",
        scores: [
          { axis: "Leverans och ägarskap", score: 4 },
          { axis: "Kommunikation", score: 3 }
        ],
        note: "Höll ihop en svår leverans",
        at: daysAgo(200),
        now: NOW
      })
    );

    ok(
      api.updateQuestionSet(store, String(made.id), {
        name: "Producentrond 2027",
        axes: [{ axis: "Leverans" }, { axis: "Samarbete" }]
      })
    );

    const read = ok(api.assessments(store, String(who.id), NOW));
    const [answer] = read.answers;
    assert.deepEqual(
      answer.scores.map((/** @type {any} */ s) => s.axis),
      ["Leverans och ägarskap", "Kommunikation"],
      "rewording the set changed what somebody answered"
    );
    assert.equal(answer.setName, "Producentrond", "the round was renamed retroactively");
    assert.deepEqual(
      read.byAxis.map((/** @type {any} */ a) => a.axis),
      ["Kommunikation", "Leverans och ägarskap"],
      "the aggregate followed the set instead of the answers"
    );
  });

  it("and changes what the next round is asked", () => {
    // The other half: the edit has to do something, or it is a no-op dressed as
    // a safeguard.
    const made = ok(producerSet());
    ok(api.updateQuestionSet(store, String(made.id), { axes: [{ axis: "Samarbete" }] }));

    const [set] = api.questionSets(store).live;
    assert.deepEqual(
      set.axes.map((/** @type {any} */ a) => a.axis),
      ["Samarbete"]
    );
  });

  it("refuses an edit that would leave a set nobody can answer", () => {
    // Judged against the row as it will be, not against the fields given.
    const made = ok(producerSet());
    assert.match(failed(api.updateQuestionSet(store, String(made.id), { axes: [] })), /utan axlar/);
    assert.equal(api.questionSets(store).live[0].axes.length, 2, "the set was emptied anyway");
  });
});

describe("a set that is done being used", () => {
  it("stops being offered and stays readable", () => {
    const made = ok(producerSet());
    ok(api.retireQuestionSet(store, String(made.id), { now: NOW }));

    const read = api.questionSets(store);
    assert.equal(read.live.length, 0, "a retired set is still on offer");
    assert.equal(read.retired.length, 1, "a retired set became unreadable");
    assert.equal(read.retired[0].name, "Producentrond");
  });

  it("comes back, because a discipline returning is likelier than a mistake", () => {
    const made = ok(producerSet());
    ok(api.retireQuestionSet(store, String(made.id), { now: NOW }));
    ok(api.retireQuestionSet(store, String(made.id), { retired: false, now: NOW }));
    assert.equal(api.questionSets(store).live.length, 1);
  });

  it("and the rounds run on it still name it", () => {
    const made = ok(producerSet());
    const who = person();
    ok(
      api.recordAssessment(store, {
        person: String(who.id),
        assessor: "Testproducent",
        set: String(made.id),
        setName: "Producentrond",
        scores: [{ axis: "Kommunikation", score: 3 }],
        now: NOW
      })
    );
    ok(api.retireQuestionSet(store, String(made.id), { now: NOW }));

    const read = ok(api.assessments(store, String(who.id), NOW));
    assert.equal(read.byAxis[0].setName, "Producentrond");
  });
});

describe("two disciplines are two measurements", () => {
  it("stay apart in the aggregate even when they ask about the same word", () => {
    /*
     * The reason `set` is the stable half and `setName` is only what a page
     * prints. A producer's Kommunikation and an art lead's Kommunikation are not
     * the same question, and merging them on the label would rebuild the
     * cross-set mean the feature refuses - one axis at a time.
     */
    const producer = ok(producerSet({ axes: [{ axis: "Kommunikation" }] }));
    const lead = ok(
      producerSet({ name: "Art lead-rond", discipline: "art lead", axes: [{ axis: "Kommunikation" }] })
    );
    const who = person();

    for (const [set, name, score] of [
      [String(producer.id), "Producentrond", 5],
      [String(lead.id), "Art lead-rond", 1]
    ]) {
      ok(
        api.recordAssessment(store, {
          person: String(who.id),
          assessor: `Test ${name}`,
          set: String(set),
          setName: String(name),
          scores: [{ axis: "Kommunikation", score: Number(score) }],
          now: NOW
        })
      );
    }

    const read = ok(api.assessments(store, String(who.id), NOW));
    assert.equal(read.byAxis.length, 2, "two disciplines were averaged into one figure");
    for (const axis of read.byAxis) {
      assert.equal(axis.n, 1, `${axis.setName} counted the other discipline's answer`);
    }
  });
});

describe("who may define a set", () => {
  it("nobody over MCP, though anybody may read them", () => {
    /*
     * A set decides what a producer is asked about a colleague, which is a
     * claim about how the job is evaluated - the same class of thing as the role
     * map, and his. Checked on names and on what a call writes, the pair the
     * assessments boundary settled on.
     */
    /*
     * The verb has to be a whole word in the name, not a fragment of one. The
     * first version of this filter matched "set" inside "tend_question_sets" and
     * refused the read tool the card exists to add - the same trap the
     * assessments boundary fell into, where a name-only check blocked its own
     * read. That is why the store check below is the one that matters.
     */
    const names = TOOLS.map((t) => t.name);
    const writers = names.filter(
      (n) =>
        /^tend_(add|update|remove|delete|retire|define|set|write)_/i.test(n) &&
        /question|axis|axes/i.test(n)
    );
    assert.deepEqual(writers, [], `an MCP tool is named as if it defines one: ${writers.join(", ")}`);

    ok(producerSet());
    const before = store.state().applied;
    const read = ok(callTool(store, "tend_question_sets", {}, NOW));
    assert.equal(read.live.length, 1, "an agent cannot read the sets at all");
    assert.match(read.live[0].axes[0].asked, /Levererar enligt plan/);
    assert.equal(store.state().applied, before, "reading the sets wrote something");
  });
});

describe("the pieces underneath", () => {
  it("compares axis labels on case and outer space, and nothing cleverer", () => {
    // An axis label is prose he wrote. Stripping punctuation or collapsing inner
    // space would start merging axes he meant to keep apart.
    assert.equal(axisKey("  Kommunikation "), "kommunikation");
    assert.notEqual(axisKey("Kommunikation, muntlig"), axisKey("Kommunikation muntlig"));
  });

  it("drops a blank axis line rather than storing an axis with no name", () => {
    const why = badSet({ name: "Rond", axes: [{ axis: "  " }] });
    assert.match(String(why), /utan axlar/);
  });
});
