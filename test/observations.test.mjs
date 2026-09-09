/**
 * Correcting an observation without erasing it.
 *
 * The test that is the reason for the file is "says so on the wrong row itself":
 * a reader who finds only the wrong row must be able to see from that row that
 * it was corrected. That was the whole failure of the prose convention this
 * replaces - "do not read the row above as evidence" only works on somebody who
 * reads both rows, in order, and nothing made them.
 *
 * The rest of it guards the boundary between the two mechanisms, which is the
 * part that will erode. Replacement keeps everything; erasure keeps nothing; and
 * the only thing standing between them is a clock and a state, both of which are
 * cheap to widen and impossible to widen back.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import * as api from "../src/service/api.js";
import { TOOLS, callTool } from "../src/mcp/tools.js";
import {
  MISTAKE_WINDOW_MS,
  inChain,
  removableAsMistake,
  superseded
} from "../src/domain/observations.js";
import { openStore } from "../src/storage/store.js";
import { DAY_MS } from "../src/domain/time.js";
import { failed, ok } from "./helpers.mjs";

const NOW = 1_800_000_000_000;

/** @type {string} */
let dir;
/** @type {import("../src/storage/store.js").TendStore} */
let store;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tend-obs-"));
  let t = NOW - 1_000_000;
  store = openStore({ dataDir: dir, role: "app", host: "test", now: () => t++ });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function person() {
  return ok(api.addPerson(store, { name: "Testkollega ett", relation: "lead-and-manage", now: NOW }));
}

/** @param {string} who @param {string} text @param {number} [at] */
function observe(who, text, at = NOW) {
  return ok(api.logEvidence(store, { person: who, text, area: "kod", now: at }));
}

describe("an observation that turned out to be wrong", () => {
  it("is corrected by a row that points at it, and both survive", () => {
    const who = person();
    const first = observe(String(who.id), "Tog över releasen utan att fråga någon.");

    const fix = ok(
      api.replaceObservation(store, {
        id: String(first.id),
        text: "Releasen var delegerad till hen i förväg, det stod i mötesanteckningen.",
        now: NOW + DAY_MS
      })
    );

    assert.equal(store.rows("evidence").length, 2, "the original was consumed rather than kept");
    assert.equal(String(fix.replaced), String(first.id));
  });

  it("keeps the subject of the original, whatever the correction says", () => {
    /*
     * A row about the wrong person is not something replacement fixes. It was
     * never true of them, so it is the erasure case - and a replacement that
     * could move the subject would relabel a judgment as being about somebody
     * who was never judged, which is worse than the row it corrected.
     */
    const who = person();
    const first = observe(String(who.id), "Missade två avstämningar i rad.");
    const fix = ok(
      api.replaceObservation(store, {
        id: String(first.id),
        text: "Det var en annan person, och hen hade meddelat i förväg.",
        now: NOW + DAY_MS
      })
    );
    const row = store.rows("evidence").find((e) => String(e.id) === String(fix.id));
    assert.ok(row, "the correction was not written");
    assert.equal(String(row.person), String(who.id));
  });

  it("carries the original's area rather than dropping it", () => {
    // An omitted field would mean "clear it", and the axis is what makes an
    // observation more than a pile - see the read in niblinks.js.
    const who = person();
    const first = observe(String(who.id), "Skrev om hela modulen på en kväll.");
    const fix = ok(
      api.replaceObservation(store, {
        id: String(first.id),
        text: "Det var två kvällar, och en till på helgen.",
        now: NOW + DAY_MS
      })
    );
    const row = store.rows("evidence").find((e) => String(e.id) === String(fix.id));
    assert.ok(row, "the correction was not written");
    assert.equal(row.area, "kod");
  });

  it("says so on the wrong row itself, not only on the correction", () => {
    /*
     * THE test. A reader landing on the wrong row has to learn from that row
     * that it was corrected, because nothing makes them read the next one.
     */
    const who = person();
    const first = observe(String(who.id), "Lämnade ett granskningssvar som slog ner stämningen.");
    ok(
      api.replaceObservation(store, {
        id: String(first.id),
        text: "Svaret var korrekt läst av alla utom mig, jag hade missat tråden ovanför.",
        now: NOW + DAY_MS
      })
    );

    const page = ok(api.person(store, String(who.id), NOW + 2 * DAY_MS));
    const wrong = page.observations.find((/** @type {any} */ o) => String(o.id) === String(first.id));
    assert.ok(wrong, "the corrected row disappeared from the page");
    const over = wrong.replacedBy;
    assert.ok(over, "the corrected row does not say it was corrected");
    assert.match(String(over.text), /missat tråden/);

    const right = page.observations.find(
      (/** @type {any} */ o) => String(o.id) === String(over.id)
    );
    assert.ok(right, "the correction is not on the page");
    assert.equal(String(right.replaces), String(first.id));
  });

  it("says so to an agent reading the record, in the same words", () => {
    /*
     * The read a session preparing a 1-1 actually uses. A corrected row that
     * arrives looking current is worse than one that does not arrive at all: it
     * gets quoted back to the person it was wrong about.
     */
    const who = person();
    const first = observe(String(who.id), "Drog sig ur ett åtagande sent.");
    ok(
      api.replaceObservation(store, {
        id: String(first.id),
        text: "Hen drog sig ur på min uppmaning, jag hade dubbelbokat hen.",
        now: NOW + DAY_MS
      })
    );

    const read = ok(callTool(store, "tend_observations", { person: String(who.id) }, NOW));
    const items = read.areas.flatMap((/** @type {any} */ a) => a.items);
    const wrong = items.find((/** @type {any} */ i) => String(i.id) === String(first.id));
    assert.ok(wrong, "the corrected row is not in the agent's read");
    assert.ok(wrong.replacedBy, "an agent reading this cannot tell the row was corrected");
  });

  it("reaches the read even when the correction moved it to another axis", () => {
    /*
     * The bug the annotate-then-filter order exists for. Moving a row onto the
     * axis it belonged on is a likely reason to correct one, and resolving the
     * pointers inside a single area's rows would leave the original looking
     * current under the old axis - the correction invisible in exactly the read
     * that was asked for.
     */
    const who = person();
    const first = observe(String(who.id), "Höll ihop en svår diskussion i granskningen.");
    ok(
      api.replaceObservation(store, {
        id: String(first.id),
        text: "Det var inte i granskningen, det var i planeringen - det här är ledarskap.",
        area: "ägarskap",
        now: NOW + DAY_MS
      })
    );

    const read = ok(
      callTool(store, "tend_observations", { person: String(who.id), area: "kod" }, NOW)
    );
    const items = read.areas.flatMap((/** @type {any} */ a) => a.items);
    const wrong = items.find((/** @type {any} */ i) => String(i.id) === String(first.id));
    assert.ok(wrong, "the original is not under the area it was filed on");
    assert.ok(
      wrong.replacedBy,
      "reading one axis showed a corrected row as current, because the correction sits on another"
    );
  });

  it("refuses a correction with nothing in it", () => {
    // A replacement with no text is a deletion wearing the safe mechanism's name.
    const who = person();
    const first = observe(String(who.id), "Något som visade sig vara fel.");
    const why = failed(
      api.replaceObservation(store, { id: String(first.id), text: "   ", now: NOW + DAY_MS })
    );
    assert.match(why, /rättelse behöver text/);
    assert.equal(store.rows("evidence").length, 1);
  });
});

describe("the row that was never true, and only that row", () => {
  it("goes away completely while it could still be a paste error", () => {
    const who = person();
    const slip = observe(String(who.id), "Ska kunna hålla en svår diskussion utan att ta över.");

    ok(api.forgetObservation(store, { id: String(slip.id), now: NOW + 60_000 }));
    assert.equal(store.rows("evidence").length, 0);

    const page = ok(api.person(store, String(who.id), NOW + 60_000));
    assert.equal(page.observations.length, 0, "the erased row is still on the page");
  });

  it("is refused once it is old enough to be a changed judgment instead", () => {
    const who = person();
    const real = observe(String(who.id), "Tog inte tag i en konflikt i teamet.");

    const why = failed(
      api.forgetObservation(store, { id: String(real.id), now: NOW + MISTAKE_WINDOW_MS + 1000 })
    );
    assert.match(why, /ersätt den i stället/i);
    assert.equal(store.rows("evidence").length, 1, "an old row was erased anyway");
  });

  it("is refused inside a correction, from either end", () => {
    /*
     * Both directions, because they fail differently. Erasing the corrected row
     * would delete the reading that changed - the thing worth the most. Erasing
     * the correction would leave the row underneath struck through with nothing
     * attached saying why, which is a state no view can explain.
     */
    const who = person();
    const first = observe(String(who.id), "En läsning som visade sig vara fel.");
    const fix = ok(
      api.replaceObservation(store, {
        id: String(first.id),
        text: "Så var det inte, och här är vad som hände i stället.",
        now: NOW + 1000
      })
    );

    assert.match(
      failed(api.forgetObservation(store, { id: String(first.id), now: NOW + 2000 })),
      /historik/
    );
    assert.match(
      failed(api.forgetObservation(store, { id: String(fix.id), now: NOW + 2000 })),
      /historik/
    );
    assert.equal(store.rows("evidence").length, 2);
  });

  it("is offered on the page exactly while it is allowed", () => {
    /*
     * The renderer is handed the answer rather than subtracting two numbers
     * itself. Two copies of this rule would agree until one was edited, and the
     * visible failure is a button that errors when pressed.
     */
    const who = person();
    const fresh = observe(String(who.id), "Nyss inskrivet.");

    const soon = ok(api.person(store, String(who.id), NOW + 60_000));
    const later = ok(api.person(store, String(who.id), NOW + MISTAKE_WINDOW_MS + 1000));

    const rowNow = soon.observations.find((/** @type {any} */ o) => String(o.id) === String(fresh.id));
    const rowLater = later.observations.find(
      (/** @type {any} */ o) => String(o.id) === String(fresh.id)
    );
    assert.equal(rowNow?.forgettable, true, "a row inside the window is not offered the button");
    assert.equal(rowLater?.forgettable, false, "an aged row is still offered the button");
  });
});

describe("the two mechanisms stay in the window", () => {
  it("with no MCP tool for either, checked on what a call writes", () => {
    /*
     * Named AND behavioural, the same pair the assessments boundary settled on.
     * A name check alone forbids the wrong thing - it trips on the read tool a
     * feature needs - and a behaviour check alone would pass a tool that is
     * merely broken today.
     *
     * The reasoning is on the card: an agent that can mark a row as superseded
     * can retract a reading that turned out to be inconvenient, and one that can
     * erase a row leaves nothing in any view to notice. Left closed rather than
     * settled.
     */
    const names = TOOLS.map((t) => t.name);
    const writers = names.filter(
      (n) =>
        /(replace|forget|supersede|correct|remove|delete)/i.test(n) && /observ|evidence/i.test(n)
    );
    assert.deepEqual(writers, [], `an MCP tool is named as if it corrects one: ${writers.join(", ")}`);

    const who = person();
    const row = observe(String(who.id), "En rad som ingen agent får röra.");
    const before = store.state().applied;

    for (const name of names.filter((n) => /observ|person/i.test(n))) {
      callTool(store, name, { person: String(who.id), id: String(row.id), text: "nej" }, NOW);
    }

    assert.equal(store.state().applied, before, "an MCP call changed an observation, or removed one");
    assert.equal(store.rows("evidence").length, 1);
  });
});

describe("the pieces underneath", () => {
  it("reports only the newest correction when a row was corrected twice", () => {
    // A line can only be struck through once, and the reader wants what the
    // record says now. The older corrections are still rows in their own right.
    const rows = [
      { id: "a", text: "först", at: NOW },
      { id: "b", text: "rättelse ett", at: NOW + 1000, replaces: "a" },
      { id: "c", text: "rättelse två", at: NOW + 2000, replaces: "a" }
    ];
    const out = superseded(rows);
    const a = out.find((r) => r.id === "a");
    assert.equal(a?.replacedBy?.id, "c");
  });

  it("lets a row read as current again once its correction is gone", () => {
    /*
     * The un-strike. Erasing a correction as a paste error has to leave the row
     * underneath readable, with nothing dangling - and it does, because the
     * store hands back no tombstones and a pointer with no owner resolves to
     * nothing.
     */
    const out = superseded([{ id: "a", text: "först", at: NOW }]);
    assert.equal(out[0]?.replacedBy, null);

    const dangling = superseded([{ id: "b", text: "rättelse", at: NOW, replaces: "gone" }]);
    assert.equal(dangling[0]?.replaces, "gone");
    assert.equal(dangling[0]?.replacedBy, null);
  });

  it("refuses to read a row as its own correction", () => {
    // Not reachable through the service, and the cheapest place to refuse it is
    // before anything walks the pointers.
    const out = superseded([{ id: "a", text: "först", at: NOW, replaces: "a" }]);
    assert.equal(out[0]?.replaces, null);
    assert.equal(out[0]?.replacedBy, null);
    assert.equal(inChain({ id: "a", replaces: "a" }, out), false);
  });

  it("counts a chain from both ends", () => {
    const rows = [
      { id: "a", text: "först", at: NOW },
      { id: "b", text: "sedan", at: NOW + 1000, replaces: "a" },
      { id: "c", text: "orörd", at: NOW + 2000 }
    ];
    assert.equal(inChain(rows[0], rows), true);
    assert.equal(inChain(rows[1], rows), true);
    assert.equal(inChain(rows[2], rows), false);
  });

  it("keeps the window short enough that a judgment cannot reach it", () => {
    /*
     * The asymmetry, asserted rather than trusted to a comment. Too long lets a
     * changed judgment be erased, which is the harm this exists to prevent; too
     * short only means a paste error is corrected by replacement instead. So it
     * has to stay well under a day, and the number itself is a question on the
     * card.
     */
    assert.ok(MISTAKE_WINDOW_MS < DAY_MS / 4, `the window has grown to ${MISTAKE_WINDOW_MS}ms`);
    const row = { id: "a", text: "x", at: NOW };
    assert.equal(removableAsMistake(row, [row], NOW + 60_000).ok, true);
    assert.equal(removableAsMistake(row, [row], NOW + DAY_MS).ok, false);
  });
});
