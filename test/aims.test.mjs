/**
 * Goals he sets for himself.
 *
 * The design question this feature turns on is who judges, because the person
 * assessing is the person doing. So most of what is tested here is the refusals:
 * an aim with no source, a third aim, a logged occasion that will not say
 * whether the thing happened.
 *
 * The alternative was seen in real data the day this was built - a development
 * point kept to next meeting for a second time, its own summary of it being
 * "you can always get better". That is what an aim with no test becomes, and it
 * rolls for ever because nothing can ever close it.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import * as api from "../src/service/api.js";
import { callTool } from "../src/mcp/tools.js";
import { AT_ONCE, SOURCES, isSource, missing } from "../src/domain/aims.js";
import { myAttention } from "../src/domain/myattention.js";
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
  dir = mkdtempSync(join(tmpdir(), "tend-aims-"));
  let t = NOW - 1_000_000;
  store = openStore({ dataDir: dir, role: "app", host: "test", now: () => t++ });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** @param {object} [over] */
function set(over = {}) {
  return ok(
    api.setAim(store, {
      aim: "Say the hard sentence in the meeting rather than after it",
      source: "logged",
      measure: "One occasion where I said it in the room, logged the same day",
      through: "The Tuesday manager meeting and every 1-1",
      now: NOW,
      ...over
    })
  );
}

describe("where an aim's verdict comes from", () => {
  it("offers three sources and no more", () => {
    // Three because those are the honest answers. A fourth would be a feeling.
    assert.deepEqual(Object.keys(SOURCES).sort(), ["asked", "logged", "record"]);
    assert.equal(isSource("record"), true);
    assert.equal(isSource("feels-better"), false);
  });

  it("refuses an aim that names none", () => {
    /*
     * The load-bearing refusal. Without a source the aim can never be judged,
     * and a goal nothing can satisfy is a standing reproach rather than a goal.
     */
    // Cast because the type says source is required and the runtime check is what
    // matters: an agent over MCP hands this layer whatever it hands it, and a
    // type is not a guarantee across that boundary.
    const why = failed(api.setAim(store, /** @type {any} */ ({ aim: "Be a better listener", now: NOW })));
    assert.match(why, /record/);
    assert.match(why, /asked/);
    assert.match(why, /logged/);
    assert.equal(store.rows("aims").length, 0);
  });

  it("refuses one that names something invented", () => {
    failed(api.setAim(store, { aim: "Be better", source: "vibes", now: NOW }));
  });

  it("asks for the test rather than demanding it up front", () => {
    // An aim that cannot be created until every field is answered is an aim
    // created in a text file instead. But the gap stays visible.
    const made = set({ measure: "", through: "" });
    assert.ok(made.missing.length >= 2, JSON.stringify(made.missing));
    assert.match(made.missing.join(" "), /tillfälle/i);
    assert.match(made.missing.join(" "), /verkligt arbete/i);
  });

  it("asks who, but only when the verdict comes from somebody else", () => {
    assert.match(
      missing({ source: "asked", measure: "x", through: "y" }).join(" "),
      /Vem frågar du/
    );
    assert.deepEqual(missing({ source: "logged", measure: "x", through: "y" }), []);
  });
});

describe("how many at once", () => {
  it(`allows ${AT_ONCE} and refuses the next`, () => {
    // Working on four aspects of your own conduct at once is working on none,
    // and unlike a roster there is no way to divide the attention.
    set();
    set({ aim: "Ask about the workload before adding to it" });

    const why = failed(api.setAim(store, { aim: "A third thing", source: "logged", now: NOW }));
    assert.match(why, /limit/);
    assert.equal(store.rows("aims").filter((a) => a.status === "open").length, AT_ONCE);
  });

  it("frees the slot when one is reached or let go", () => {
    const first = set();
    set({ aim: "Second" });
    ok(api.endAim(store, String(first.id), { status: "reached", why: "It comes naturally now" }));

    ok(api.setAim(store, { aim: "A third, now there is room", source: "logged", now: NOW }));
  });

  it("insists an ending says which kind it was", () => {
    // Reached and dropped are both endings and only one is a success. An aim
    // quietly abandoned is what this whole shape exists to prevent.
    const made = set();
    failed(api.endAim(store, String(made.id), { status: "finished" }));
    ok(api.endAim(store, String(made.id), { status: "dropped", why: "Wrong aim" }));
    assert.equal(String(store.rows("aims")[0].status), "dropped");
  });
});

describe("logging an occasion", () => {
  it("counts the misses as well as the times it worked", () => {
    /*
     * The field that makes the whole thing worth anything. A log of only the
     * good days is a scrapbook, and the gap between occasions taken and missed
     * is the reading - the same reasoning as a growth thread's talked-versus-
     * observed.
     */
    const made = set();
    ok(api.logAim(store, { aim: String(made.id), note: "Said it in the room", happened: true, now: NOW }));
    ok(api.logAim(store, { aim: String(made.id), note: "Let the first answer stand", happened: false, now: NOW }));

    const [row] = ok(api.aims(store, NOW));
    assert.equal(row.logged, 2);
    assert.equal(row.seen, 1);
    assert.equal(row.missed, 1);
  });

  it("refuses a log that will not say which it was", () => {
    const made = set();
    const why = failed(
      api.logAim(store, /** @type {any} */ ({ aim: String(made.id), note: "Went okay", now: NOW }))
    );
    assert.match(why, /scrapbook/);
    assert.equal(store.rows("aimNotes").length, 0);
  });

  it("refuses an occasion with nothing said about it", () => {
    const made = set();
    failed(api.logAim(store, { aim: String(made.id), note: "  ", happened: true, now: NOW }));
  });

  it("refuses one against an aim that does not exist", () => {
    failed(api.logAim(store, { aim: "nope", note: "Something", happened: true, now: NOW }));
  });

  it("reads the occasions back newest first, both kinds", () => {
    const made = set();
    ok(api.logAim(store, { aim: String(made.id), note: "Older", happened: true, at: daysAgo(9), now: NOW }));
    ok(api.logAim(store, { aim: String(made.id), note: "Newer", happened: false, at: NOW, now: NOW }));

    const one = ok(api.aim(store, String(made.id), NOW));
    assert.deepEqual(
      one.occasions.map((/** @type {any} */ o) => o.note),
      ["Newer", "Older"]
    );
    assert.equal(one.occasions[0].happened, false);
    assert.equal(one.occasions[1].when, "för 9 dagar sedan");
  });
});

describe("the nudge", () => {
  /** @param {number} at */
  const signals = (at) =>
    myAttention({
      people: [],
      touches: [],
      aims: /** @type {any[]} */ (store.rows("aims")),
      aimNotes: /** @type {any[]} */ (store.rows("aimNotes")),
      now: at
    });

  it("stays quiet inside the cadence", () => {
    set();
    assert.equal(signals(NOW).filter((s) => s.key.startsWith("aim-quiet")).length, 0);
  });

  it("says something once an aim has gone quiet past its cadence", () => {
    set({ cadenceDays: 21 });
    const later = NOW + 22 * DAY_MS;

    const quiet = signals(later).find((s) => s.key.startsWith("aim-quiet"));
    assert.ok(quiet, "nothing was said about an aim untouched for three weeks");
    assert.match(quiet.text, /^Jag /, "a signal here must have a first-person subject");
  });

  it("carries where the aim is supposed to happen, not just that it exists", () => {
    // He asked for a nudge that says how to apply it. A reminder that only says
    // "you have a goal" is the reminder that trains somebody to ignore the page.
    set({ cadenceDays: 21, through: "The Tuesday manager meeting and every 1-1" });
    const quiet = signals(NOW + 22 * DAY_MS).find((s) => s.key.startsWith("aim-quiet"));
    assert.match(String(quiet?.detail), /Tuesday manager meeting/);
  });

  it("names the absence when no work is attached", () => {
    set({ cadenceDays: 21, through: "" });
    const quiet = signals(NOW + 22 * DAY_MS).find((s) => s.key.startsWith("aim-quiet"));
    assert.match(String(quiet?.detail), /utan någonstans att hända/);
  });

  it("says separately when an aim has no test at all", () => {
    /*
     * A different failure from a quiet one, and louder. A quiet aim is one he
     * has not got to; an unmeasured aim is one he cannot get to, which is the
     * state a rolling development point lives in for ever.
     */
    set({ measure: "" });
    const unmeasured = signals(NOW).find((s) => s.key.startsWith("aim-unmeasured"));
    assert.ok(unmeasured, "an aim with no measure said nothing");
    assert.match(unmeasured.text, /^Jag /);
    assert.match(String(unmeasured.detail), /kept to next time/);
  });

  it("never lets an aim change the daily page's headline", () => {
    // A goal not thought about in three weeks has let nobody down. Every signal
    // from an aim carries habit: true, which is what keeps Now quiet.
    set({ cadenceDays: 21, measure: "" });
    const mine = signals(NOW + 40 * DAY_MS).filter((s) => s.key.startsWith("aim-"));
    assert.ok(mine.length >= 2);
    for (const s of mine) {
      assert.equal(s.habit, true, `${s.key} could stop Now saying nothing needs you`);
    }
  });

  it("goes quiet when the aim is reached, rather than nagging about a finished one", () => {
    const made = set({ cadenceDays: 21 });
    ok(api.endAim(store, String(made.id), { status: "reached" }));
    assert.equal(signals(NOW + 60 * DAY_MS).filter((s) => s.key.startsWith("aim-")).length, 0);
  });
});

describe("through the agent surface", () => {
  it("sets an aim, logs both kinds of occasion, and reads the gap", () => {
    const made = callTool(
      store,
      "tend_set_aim",
      {
        aim: "Say the hard sentence in the room",
        source: "logged",
        measure: "One occasion, logged the same day",
        through: "Every 1-1"
      },
      NOW
    );
    callTool(store, "tend_log_aim", { aim: String(made.id), note: "Said it", happened: true }, NOW);
    callTool(store, "tend_log_aim", { aim: String(made.id), note: "Did not", happened: false }, NOW);

    const [row] = ok(callTool(store, "tend_aims", {}, NOW));
    assert.equal(row.seen, 1);
    assert.equal(row.missed, 1);
  });

  it("refuses a sourceless aim over the agent surface too", () => {
    const r = callTool(store, "tend_set_aim", { aim: "Be better" }, NOW);
    assert.ok(r && typeof r === "object" && "error" in r, "a sourceless aim was accepted");
  });
});
