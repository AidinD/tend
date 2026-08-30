/**
 * Tests for the attention signals.
 *
 * The first one is the important one, and it is not about arithmetic. Every
 * signal has to be about the user rather than about a colleague, because the
 * easier and more impressive version of this feature is surveillance and a
 * future session reading "attention signals" will reach for it. A prose rule in
 * a document does not stop that. A failing test does.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { WINDOW_DAYS, myAttention } from "../src/domain/myattention.js";
import { DAY_MS } from "../src/domain/time.js";

const NOW = 1_800_000_000_000;
/** @param {number} n */
const daysAgo = (n) => NOW - n * DAY_MS;

/** @param {number} n */
const roster = (n) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Person ${i}`, relation: "lead-and-manage" }));

describe("the line", () => {
  it("every signal speaks in the first person, about me", () => {
    // The mechanical check. A signal whose sentence has a colleague as its
    // subject is a measurement of them, which this file exists not to be.
    const signals = myAttention({
      people: roster(6),
      touches: [
        { subject: "p0", kind: "one-to-one", at: daysAgo(2) },
        { subject: "p0", kind: "one-to-one", at: daysAgo(5) },
        { subject: "p0", kind: "one-to-one", at: daysAgo(9) },
        { subject: "p1", kind: "one-to-one", at: daysAgo(3) },
        { subject: "p1", kind: "one-to-one", at: daysAgo(8) },
        { subject: "p2", kind: "second-hand", at: daysAgo(4) }
      ],
      // Enough evenings to make the unread signal fire too. This check is the
      // only mechanical guard on the first-person rule, so the fixture has to
      // produce EVERY signal - one that never appears here is one the rule is
      // not actually being enforced on.
      entries: Array.from({ length: 6 }, (_, i) => ({
        id: `e${i}`,
        at: daysAgo(i + 1),
        took: `Day ${i}`
      })),
      now: NOW
    });

    assert.ok(signals.length > 0, "the fixture should produce signals at all");
    // Named rather than counted, so adding a signal without adding it here is a
    // failure rather than a silent gap.
    assert.deepEqual(
      [...signals.map((s) => s.key)].sort(),
      [
        "i-have-not-reflected",
        "i-have-not-spoken-to",
        "i-have-only-heard-about",
        "i-have-written-and-not-read",
        "my-attention-is-concentrated"
      ],
      "the fixture no longer produces every signal, so the rule is unchecked on the missing one"
    );
    for (const signal of signals) {
      assert.match(
        signal.text,
        /^(I |My |Everything I |\d+% of my )/,
        `"${signal.text}" is not a sentence about me`
      );
    }
  });

  it("the module contains none of the measurements that would make it surveillance", () => {
    // Named explicitly, because these are the exact things the obvious version
    // reaches for and they are all easier to compute than what is here.
    const source = readFileSync(new URL("../src/domain/myattention.js", import.meta.url), "utf8");
    const body = source.slice(source.indexOf("export const WINDOW_DAYS"));
    for (const forbidden of ["reviewLatency", "responseTime", "reviewsGiven", "retroSilence", "prCount"]) {
      assert.equal(body.includes(forbidden), false, `${forbidden} does not belong here`);
    }
  });
});

describe("who I have not spoken to", () => {
  it("counts the people I have heard nothing from", () => {
    const [signal] = myAttention({
      people: roster(4),
      touches: [{ subject: "p0", kind: "one-to-one", at: daysAgo(3) }],
      now: NOW
    });
    assert.match(signal.text, /^I have not spoken to 3 of 4 people/);
    assert.match(String(signal.detail), /Person 1/);
  });

  it("ignores contact older than the window", () => {
    const signals = myAttention({
      people: roster(2),
      touches: [
        { subject: "p0", kind: "one-to-one", at: daysAgo(3) },
        { subject: "p1", kind: "one-to-one", at: daysAgo(WINDOW_DAYS + 5) }
      ],
      now: NOW
    });
    assert.match(signals[0].text, /1 of 2/);
  });

  it("says nothing about a roster of one", () => {
    // "I have not spoken to 1 of 1 people" is not a signal, it is a tautology.
    assert.deepEqual(myAttention({ people: roster(1), touches: [], now: NOW }), []);
  });
});

describe("where my attention went", () => {
  it("names the few who got most of it", () => {
    const touches = [
      ...Array.from({ length: 8 }, (_, i) => ({ subject: "p0", kind: "one-to-one", at: daysAgo(i + 1) })),
      { subject: "p1", kind: "one-to-one", at: daysAgo(2) },
      { subject: "p2", kind: "one-to-one", at: daysAgo(3) },
      { subject: "p3", kind: "one-to-one", at: daysAgo(4) },
      { subject: "p4", kind: "one-to-one", at: daysAgo(5) }
    ];
    const signal = myAttention({ people: roster(5), touches, now: NOW }).find(
      (s) => s.key === "my-attention-is-concentrated"
    );
    assert.ok(signal, "lopsided contact should be said out loud");
    assert.match(signal.text, /% of my contact/);
    assert.match(String(signal.detail), /Person 0/);
  });

  it("stays quiet when contact is spread evenly", () => {
    const touches = roster(6).map((p, i) => ({ subject: p.id, kind: "one-to-one", at: daysAgo(i + 1) }));
    const signals = myAttention({ people: roster(6), touches, now: NOW });
    assert.equal(
      signals.some((s) => s.key === "my-attention-is-concentrated"),
      false
    );
  });

  it("stays quiet on too little data to have a shape", () => {
    // Three touches across four people is not a pattern, and calling it one is
    // how a signal loses its credibility on the first week.
    const signals = myAttention({
      people: roster(4),
      touches: [
        { subject: "p0", kind: "one-to-one", at: daysAgo(1) },
        { subject: "p0", kind: "one-to-one", at: daysAgo(2) },
        { subject: "p0", kind: "one-to-one", at: daysAgo(3) }
      ],
      now: NOW
    });
    assert.equal(
      signals.some((s) => s.key === "my-attention-is-concentrated"),
      false
    );
  });
});

describe("second-hand only", () => {
  it("says when everything I know came through somebody else", () => {
    const signal = myAttention({
      people: roster(3),
      touches: [
        { subject: "p0", kind: "one-to-one", at: daysAgo(2) },
        { subject: "p1", kind: "second-hand", at: daysAgo(3) },
        { subject: "p1", kind: "second-hand", at: daysAgo(10) }
      ],
      now: NOW
    }).find((s) => s.key === "i-have-only-heard-about");

    assert.ok(signal, "the blind spot Tend exists for");
    assert.match(signal.text, /came through somebody else/);
    assert.match(String(signal.detail), /Person 1/);
  });

  it("stays quiet when there has also been first-hand contact", () => {
    const signals = myAttention({
      people: roster(3),
      touches: [
        { subject: "p1", kind: "second-hand", at: daysAgo(3) },
        { subject: "p1", kind: "one-to-one", at: daysAgo(4) }
      ],
      now: NOW
    });
    assert.equal(
      signals.some((s) => s.key === "i-have-only-heard-about"),
      false
    );
  });
});

describe("a quiet month", () => {
  it("produces nothing at all when everyone has been seen first-hand", () => {
    const touches = roster(4).map((p, i) => ({ subject: p.id, kind: "one-to-one", at: daysAgo(i + 1) }));
    assert.deepEqual(myAttention({ people: roster(4), touches, now: NOW }), []);
  });
});
