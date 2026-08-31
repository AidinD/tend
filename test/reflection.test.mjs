/**
 * Tests for the weekly reflection.
 *
 * Two rules carry the design. At least one of the two real questions has to
 * carry something - notes alone is not a reflection, because notes exists to
 * say "and one more thing" about an answer already given, not to give the
 * form a way around the two questions it asks. And it never reaches the Now
 * view, because nothing here is a fact anybody is waiting on.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import * as api from "../src/service/api.js";
import { REFLECTION_FIELDS, hasContent } from "../src/domain/reflection.js";
import { DAY_MS } from "../src/domain/time.js";
import { openStore } from "../src/storage/store.js";
import { ok, failed } from "./helpers.mjs";

const NOW = Date.parse("2026-08-25T21:00:00Z");
/** @param {number} days */
const ago = (days) => NOW - days * DAY_MS;

describe("the questions", () => {
  it("asks the two fixed questions plus one secondary field", () => {
    const names = REFLECTION_FIELDS.map((f) => f.name);
    assert.deepEqual(names, ["wellDone", "differently", "notes"]);
    for (const field of REFLECTION_FIELDS) {
      assert.ok(String(field.label).trim().length > 0, `${field.name} has no label`);
      assert.ok(String(field.hint).trim().length > 0, `${field.name} does not say why it is asked`);
    }
  });

  it("counts a reflection as written when any single box is filled", () => {
    assert.equal(hasContent({}), false);
    assert.equal(hasContent({ wellDone: "   " }), false, "whitespace is not an answer");
    assert.equal(hasContent({ differently: "ship smaller" }), true);
    // Different rule than logReflection's own validation below - hasContent
    // is about whether there is anything at all to show, not about which
    // fields are allowed to carry a whole reflection on their own.
    assert.equal(hasContent({ notes: "a stray thought" }), true, "notes alone is still content");
  });
});

describe("through the store", () => {
  /** @type {string} */
  let dir;
  /** @type {import("../src/storage/store.js").TendStore} */
  let store;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "tend-reflection-"));
    store = openStore({ dataDir: dir, role: "app", host: "test" });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("refuses a fully blank reflection", () => {
    assert.match(
      failed(api.logReflection(store, { now: NOW })),
      /Answer at least one of the two questions/
    );
    assert.equal(store.rows("reflections").length, 0);
  });

  it("refuses a reflection with only notes filled in", () => {
    // Notes is clearly secondary - filling only it is the same as filling
    // nothing, because neither question the feature exists to ask got answered.
    assert.match(
      failed(api.logReflection(store, { notes: "reorganised my desk", now: NOW })),
      /Answer at least one of the two questions/
    );
    assert.equal(store.rows("reflections").length, 0);
  });

  it("keeps a reflection with wellDone alone", () => {
    ok(api.logReflection(store, { wellDone: "shipped the release", now: NOW }));
    const [row] = api.reflections(store, NOW);
    assert.equal(row.wellDone, "shipped the release");
    assert.equal(row.differently, null, "an empty box is absent, not an empty string");
    assert.equal(row.notes, null);
  });

  it("keeps a reflection with differently alone", () => {
    ok(api.logReflection(store, { differently: "start the design doc earlier", now: NOW }));
    const [row] = api.reflections(store, NOW);
    assert.equal(row.differently, "start the design doc earlier");
  });

  it("keeps a reflection with both primary questions and notes", () => {
    ok(
      api.logReflection(store, {
        wellDone: "kept the roadmap review on schedule",
        differently: "raised the risk sooner",
        notes: "worth revisiting next quarter",
        now: NOW
      })
    );
    const [row] = api.reflections(store, NOW);
    assert.equal(row.wellDone, "kept the roadmap review on schedule");
    assert.equal(row.differently, "raised the risk sooner");
    assert.equal(row.notes, "worth revisiting next quarter");
  });

  it("refuses a week that has not happened yet", () => {
    assert.match(
      failed(api.logReflection(store, { wellDone: "too soon", at: NOW + 2 * DAY_MS, now: NOW })),
      /has not happened yet/
    );
  });

  it("returns reflections newest first", () => {
    ok(api.logReflection(store, { wellDone: "oldest", at: ago(20), now: NOW }));
    ok(api.logReflection(store, { wellDone: "newest", at: ago(1), now: NOW }));
    ok(api.logReflection(store, { wellDone: "middle", at: ago(10), now: NOW }));

    assert.deepEqual(
      api.reflections(store, NOW).map((r) => r.wellDone),
      ["newest", "middle", "oldest"]
    );
  });

  it("respects limit and since", () => {
    ok(api.logReflection(store, { wellDone: "oldest", at: ago(20), now: NOW }));
    ok(api.logReflection(store, { wellDone: "newest", at: ago(1), now: NOW }));
    ok(api.logReflection(store, { wellDone: "middle", at: ago(10), now: NOW }));

    assert.deepEqual(
      api.reflections(store, NOW, { limit: 1 }).map((r) => r.wellDone),
      ["newest"]
    );
    assert.deepEqual(
      api.reflections(store, NOW, { since: ago(15) }).map((r) => r.wellDone),
      ["newest", "middle"]
    );
  });

  it("tracks when a reflection was last written", () => {
    assert.equal(api.lastReflectedAt(store), null);
    ok(api.logReflection(store, { wellDone: "a", at: ago(5), now: NOW }));
    ok(api.logReflection(store, { wellDone: "b", at: ago(1), now: NOW }));
    assert.equal(api.lastReflectedAt(store), ago(1));
  });

  it("can be removed", () => {
    const made = ok(api.logReflection(store, { wellDone: "a", now: NOW }));
    ok(api.removeRow(store, "reflections", String(made.id)));
    assert.equal(api.reflections(store, NOW).length, 0);
  });

  it("does not reach the Now view, because nothing here is waiting on anybody", () => {
    // A person who IS behind, so both lists have something in them and "the
    // reflection is not in there" is a real absence rather than an empty store.
    // Without this the test passes even if the reflection nudge were given
    // critical severity, because it lives in `myAttentionSignals` - a different
    // function, on a different list.
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
    store.create("people", {
      id: "behind",
      name: "Tove Ranger",
      relation: "lead-and-manage",
      since: NOW - 200 * DAY_MS
    });

    ok(api.logReflection(store, { wellDone: "a", now: NOW }));

    const a = api.attention(store, NOW);
    const listed = [...a.needsYou, ...a.nudges];
    assert.ok(listed.length > 0, "somebody is behind, so Now has something to say");
    assert.equal(
      listed.some((i) => /reflect/i.test(String(i.what)) || /reflect/i.test(String(i.why ?? ""))),
      false,
      `a reflection must never be reported as something Now needs: ${JSON.stringify(listed.map((i) => i.what))}`
    );
  });
});
