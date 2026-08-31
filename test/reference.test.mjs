/**
 * Tests for reference material - the one model call that answers out of its own
 * knowledge rather than out of his notes.
 *
 * No model is called. What is worth testing here is not what a model says about
 * a subject; it is the four properties the rest of the design rests on, and
 * every one of them is a property of the code around the call:
 *
 *   Only the subject leaves the machine. Every other model call in this app
 *   sends notes, so this is the one where somebody reading the code has to be
 *   able to see, without tracing anything, that it does not.
 *
 *   The house rule is inverted on purpose, and says so. Everywhere else the
 *   prompt forbids inventing a fact not in the material; here there is no
 *   material and the model is being asked for exactly that. If that inversion
 *   ever gets silently pasted back to the standard wording, the block starts
 *   refusing to answer and the feature is gone with no error anywhere.
 *
 *   The caution is not the model's to withhold. `spread` decides whether the
 *   card says the people involved outrank it, so anything that is not an
 *   explicit "narrow" has to come out wide.
 *
 *   Nothing is stored, structurally - there is no store to store it in.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { referenceOn } from "../src/service/reference.js";
import { failed, ok } from "./helpers.mjs";

/** A full, valid answer, for the tests that are about something else. */
const ANSWER = {
  says: "Transitions are hard at that age because stopping is a loss, not a delay.",
  starts: [
    { point: "Warn before the switch", because: "It turns an interruption into an ending" },
    { point: "Name what is ending", because: "The complaint is usually about the loss" }
  ],
  spread: "wide",
  needsThePeople: "Whether this one is tired or simply refusing is not something general.",
  wouldAnswer: "Developmental psychology aimed at parents, or the nursery staff who see it daily."
};

/**
 * A stand-in for keel's `ask`, recording what it was asked.
 *
 * @param {any} value What the model "returns".
 * @param {{ ok?: boolean, reason?: string }} [outcome]
 */
function stub(value, outcome = {}) {
  /** @type {{ prompt: string, system: string, model: string, schema: any }[]} */
  const calls = [];
  /** @type {any} */
  const askImpl = async (/** @type {any} */ args) => {
    calls.push({ prompt: args.prompt, system: args.system, model: args.model, schema: args.schema });
    if (outcome.ok === false) {
      return { ok: false, reason: outcome.reason ?? "no" };
    }
    return { ok: true, value, model: "claude-sonnet-5", costUsd: 0.004 };
  };
  askImpl.calls = calls;
  return askImpl;
}

describe("what general knowledge says about a subject", () => {
  it("refuses an empty subject rather than paying to answer nothing", async () => {
    const askImpl = stub(ANSWER);
    assert.match(failed(await referenceOn({ subject: "   ", askImpl })), /what the subject is/);
    assert.equal(askImpl.calls.length, 0);
  });

  it("sends the subject and nothing else", async () => {
    const askImpl = stub(ANSWER);
    ok(await referenceOn({ subject: "bedtime turns into an argument every night", askImpl }));

    // Asserted as the whole prompt rather than as a substring match, because the
    // claim being made on the button - "only the sentence you typed is sent" -
    // is a claim about what is ABSENT. A test that only checked the subject was
    // present would pass just as happily with a page of notes underneath it.
    assert.equal(
      askImpl.calls[0].prompt,
      [
        "The subject:",
        "bedtime turns into an argument every night",
        "",
        "What is generally understood about this, and where would somebody start?"
      ].join("\n")
    );
  });

  it("caps a long subject, because this is a subject and not a document", async () => {
    const askImpl = stub(ANSWER);
    const essay = "a".repeat(5000);
    ok(await referenceOn({ subject: essay, askImpl }));

    assert.ok(
      askImpl.calls[0].prompt.length < 800,
      `the whole essay was sent: ${askImpl.calls[0].prompt.length} characters`
    );
  });

  it("tells the model to answer from general knowledge, inverting the rule the rest of the app states", async () => {
    /*
     * HOUSE_RULES in model.js says "never invent a fact that is not in the
     * material you were given", and it is right to everywhere it is used: the
     * material there is a record about a real person. Here there is no material,
     * so that wording would make the call refuse its own purpose. This test is
     * the guard on the inversion, because the failure mode is silent - a block
     * that politely declines to say anything, with nothing logged.
     */
    const askImpl = stub(ANSWER);
    ok(await referenceOn({ subject: "sleep regressions", askImpl }));

    const system = askImpl.calls[0].system;
    assert.match(system, /generally known rather than refusing/);
    assert.doesNotMatch(system, /never invent a fact/i);
  });

  it("forbids guessing at the people, since it was told nothing about them", async () => {
    const askImpl = stub(ANSWER);
    ok(await referenceOn({ subject: "somebody has gone quiet in meetings", askImpl }));

    const system = askImpl.calls[0].system;
    assert.match(system, /must not guess at them/);
    assert.match(system, /diagnose/);
  });

  it("asks for the standing of what it says, not only for the content", async () => {
    // The one thing that makes a general answer usable is knowing how solid it
    // is. Without this the tier's natural register is confident prose, which is
    // the register this block cannot afford - it has no notes under it to check.
    const askImpl = stub(ANSWER);
    ok(await referenceOn({ subject: "screen time", askImpl }));

    assert.match(askImpl.calls[0].system, /contested or thin/);
  });

  it("names the Swedish letters it is asking the model to keep", async () => {
    const askImpl = stub(ANSWER);
    ok(await referenceOn({ subject: "när någon drar sig undan", askImpl }));

    const system = askImpl.calls[0].system;
    for (const letter of ["å", "ä", "ö"]) {
      assert.ok(system.includes(letter), `the wording rules do not contain ${letter} itself`);
    }
  });

  it("uses the writing tier, because vaguely right reads exactly like right here", async () => {
    const askImpl = stub(ANSWER);
    ok(await referenceOn({ subject: "anything", askImpl }));
    assert.match(askImpl.calls[0].model, /sonnet/);
  });

  it("frames the private half as background rather than as advice about the person", async () => {
    const askImpl = stub(ANSWER);
    ok(await referenceOn({ subject: "bedtime", half: "private", askImpl }));

    const system = askImpl.calls[0].system;
    assert.match(system, /live with or are close to/);
    assert.doesNotMatch(system, /lead a team/);
  });

  it("frames the work half as usable rather than theoretical", async () => {
    const askImpl = stub(ANSWER);
    ok(await referenceOn({ subject: "delegation", half: "work", askImpl }));

    const system = askImpl.calls[0].system;
    assert.match(system, /lead a team/);
    assert.doesNotMatch(system, /live with or are close to/);
  });

  describe("how much it says the subject varies", () => {
    /** @param {any} spread */
    async function spreadFrom(spread) {
      const askImpl = stub({ ...ANSWER, spread });
      return ok(await referenceOn({ subject: "anything", askImpl })).spread;
    }

    it("keeps an explicit narrow", async () => {
      assert.equal(await spreadFrom("narrow"), "narrow");
    });

    it("keeps a narrow that arrived with padding or in the wrong case", async () => {
      assert.equal(await spreadFrom("  Narrow "), "narrow");
    });

    it("comes out wide when the field is missing", async () => {
      assert.equal(await spreadFrom(undefined), "wide");
    });

    it("comes out wide for a value that is neither", async () => {
      // A schema enum is a request, not a guarantee. The two ways of being wrong
      // are not symmetrical: an unnecessary caution is read once and ignored, a
      // missing one leaves a general summary standing unqualified beside a real
      // person.
      assert.equal(await spreadFrom("it depends"), "wide");
    });
  });

  it("drops a starting point with nothing to start on", async () => {
    const askImpl = stub({
      ...ANSWER,
      starts: [{ point: "   ", because: "something" }, { point: "Warn first", because: "" }]
    });
    const result = ok(await referenceOn({ subject: "anything", askImpl }));

    assert.equal(result.starts.length, 1);
    assert.equal(result.starts[0].point, "Warn first");
    assert.equal(result.starts[0].because, "");
  });

  it("carries the subject back, so the block cannot be read against the wrong question", async () => {
    const askImpl = stub(ANSWER);
    const result = ok(await referenceOn({ subject: "  bedtime arguments  ", askImpl }));
    assert.equal(result.subject, "bedtime arguments");
  });

  it("names which model wrote it, since that is the question asked a month later", async () => {
    const askImpl = stub(ANSWER);
    const result = ok(await referenceOn({ subject: "anything", askImpl }));
    assert.equal(result.model, "claude-sonnet-5");
    assert.equal(result.costUsd, 0.004);
  });

  it("passes a failed call back as an error rather than an empty answer", async () => {
    const askImpl = stub(ANSWER, { ok: false, reason: "the model was unreachable" });
    assert.match(failed(await referenceOn({ subject: "anything", askImpl })), /unreachable/);
  });

  it("takes no store, so there is nothing it could save", () => {
    // Structural rather than asserted. The reason nothing is stored is that a
    // general summary can be regenerated identically enough, so a stored copy
    // buys only the risk of being read six months later as though it had been
    // checked. Having no store argument is a stronger guarantee than a test that
    // checks the store did not change.
    assert.equal(referenceOn.length, 1);
  });
});
