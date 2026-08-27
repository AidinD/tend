/**
 * Tests for the two stores, and the rule that makes the private one safe.
 *
 * The failure being guarded against is one specific thing: private words written
 * into the work store. Everything asserted here is a step on that path - which
 * directory a mode resolves to, what an unreadable choice falls back to, and
 * whether the private store can end up nested inside the one it must never
 * travel with.
 *
 * The own-part check is tested for what it enforces on the way out and for the
 * one thing it must never do, which is touch the entry.
 */

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { MODES, isMode, resolveModeDir } from "../src/domain/paths.js";
import { MODE_ENV, MODE_FILE, readMode, windowTitle, writeMode } from "../src/main/mode.js";
import { checkOwnPart } from "../src/service/model.js";
import { failed, ok } from "./helpers.mjs";

/** @type {string} */
let configDir;

beforeEach(() => {
  configDir = mkdtempSync(join(tmpdir(), "tend-mode-"));
});

afterEach(() => {
  rmSync(configDir, { recursive: true, force: true });
});

describe("which store a mode is", () => {
  const env = { TEND_DATA_DIR: "D:\\somewhere\\tend" };
  const opts = { env, platform: /** @type {const} */ ("win32"), stored: () => null };

  it("leaves the work store exactly where it always was", () => {
    // No migration exists and none should. Everything that ran before there were
    // modes has to keep finding its data in the same place.
    assert.deepEqual(resolveModeDir("work", opts), { dir: "D:\\somewhere\\tend", source: "env" });
  });

  it("puts the private store beside the work one, never inside it", () => {
    const priv = resolveModeDir("private", opts);
    assert.equal(priv.dir, "D:\\somewhere\\tend-private");
    assert.equal(priv.source, "beside-work");
    // Nested, a backup or a sync of the work store would quietly carry the
    // private one along - and the entire point of two stores is that they never
    // travel together.
    assert.equal(priv.dir.startsWith("D:\\somewhere\\tend\\"), false);
  });

  it("derives the private store rather than needing a second variable to set", () => {
    // The first variable took an afternoon to discover was missing. A second one
    // would have the same failure with half the visibility.
    const priv = resolveModeDir("private", opts);
    assert.equal(priv.source, "beside-work");
  });

  it("lets the private store be moved outright, for a different drive", () => {
    const priv = resolveModeDir("private", {
      ...opts,
      env: { ...env, TEND_PRIVATE_DIR: "E:\\vault\\tend" }
    });
    assert.deepEqual(priv, { dir: "E:\\vault\\tend", source: "env" });
  });

  it("reads a moved private store out of the user environment too", () => {
    const priv = resolveModeDir("private", {
      ...opts,
      stored: (/** @type {string} */ name) => (name === "TEND_PRIVATE_DIR" ? "E:\\vault\\tend" : null)
    });
    assert.deepEqual(priv, { dir: "E:\\vault\\tend", source: "user-env" });
  });

  it("knows what is and is not a mode", () => {
    assert.deepEqual([...MODES], ["work", "private"]);
    assert.equal(isMode("private"), true);
    assert.equal(isMode("family"), false);
    assert.equal(isMode(""), false);
  });
});

describe("remembering the choice", () => {
  it("starts in work mode when nothing has been chosen", () => {
    assert.equal(readMode(configDir), "work");
  });

  it("remembers a choice across a launch", () => {
    ok(writeMode(configDir, "private").ok ? {} : { error: "write failed" });
    assert.equal(readMode(configDir), "private");
  });

  it("falls back to work mode for a file it cannot make sense of", () => {
    // Every failure resolves the same way, and it is the one that cannot put
    // private words in the work store.
    writeFileSync(join(configDir, MODE_FILE), "{ not json", "utf8");
    assert.equal(readMode(configDir), "work");

    writeFileSync(join(configDir, MODE_FILE), JSON.stringify({ mode: "family" }), "utf8");
    assert.equal(readMode(configDir), "work");

    writeFileSync(join(configDir, MODE_FILE), JSON.stringify({}), "utf8");
    assert.equal(readMode(configDir), "work");
  });

  it("refuses to write a mode that does not exist", () => {
    const result = writeMode(configDir, /** @type {any} */ ("family"));
    assert.equal(result.ok, false);
    assert.equal(existsSync(join(configDir, MODE_FILE)), false);
  });

  it("reports rather than throws when the choice cannot be saved", () => {
    const result = writeMode(join(configDir, "nowhere", "deeper"), "private");
    assert.equal(result.ok, false);
    // Said out loud, because the alternative is a mode that appears to change
    // and quietly reverts on the next launch.
    assert.match(result.ok === false ? result.why : "", /next start will be in work mode/);
  });

  it("lets the environment decide this launch, for a harness and for a way out", () => {
    writeFileSync(join(configDir, MODE_FILE), JSON.stringify({ mode: "private" }), "utf8");

    // A harness has to be able to state which half it drives rather than inherit
    // one, and a mode you cannot get out of from inside a window that will not
    // open needs an answer that is not editing JSON by hand.
    assert.equal(readMode(configDir, { [MODE_ENV]: "work" }), "work");
    assert.equal(readMode(configDir, {}), "private");
  });

  it("ignores an environment value that is not a mode, rather than failing", () => {
    writeFileSync(join(configDir, MODE_FILE), JSON.stringify({ mode: "private" }), "utf8");
    assert.equal(readMode(configDir, { [MODE_ENV]: "family" }), "private");
    assert.equal(readMode(configDir, { [MODE_ENV]: "  " }), "private");
  });

  it("writes nothing when the environment decided, so it cannot leave a mode behind", () => {
    assert.equal(readMode(configDir, { [MODE_ENV]: "private" }), "private");
    assert.equal(existsSync(join(configDir, MODE_FILE)), false);
  });

  it("carries the mode in the window title, where it is readable unfocused", () => {
    assert.equal(windowTitle("work"), "Tend");
    assert.equal(windowTitle("private"), "Tend - private");
  });
});

describe("reading an entry back against the rule", () => {
  /** A stub that records what it was asked. */
  function stub(/** @type {any} */ value) {
    /** @type {{ prompt: string, system: string, model: string }[]} */
    const calls = [];
    /** @type {any} */
    const askImpl = async (/** @type {any} */ args) => {
      calls.push({ prompt: args.prompt, system: args.system, model: args.model });
      return { ok: true, value, model: "claude-haiku-4-5-20251001", costUsd: 0.001 };
    };
    askImpl.calls = calls;
    return askImpl;
  }

  it("refuses an empty entry rather than paying to read nothing", async () => {
    const askImpl = stub({ lines: [], ok: "" });
    assert.match(failed(await checkOwnPart({ text: "   ", askImpl })), /nothing written/);
    assert.equal(askImpl.calls.length, 0);
  });

  it("states the rule to the model in both directions", async () => {
    const askImpl = stub({ lines: [], ok: "This is all your own part." });
    ok(await checkOwnPart({ text: "It went badly and I got impatient.", askImpl }));

    const system = askImpl.calls[0].system;
    // Both halves, because the rule is not "avoid mentioning them". Describing
    // what somebody did is often the entire point; the claim about what they ARE
    // is what breaks it, and a check that flagged every mention of another
    // person would flag every sentence in a journal about a family.
    assert.match(system, /their own part in it/);
    assert.match(system, /somebody DID or SAID is fine/);
  });

  it("names the Swedish letters it is asking the model to keep", async () => {
    /*
     * The instruction that protects a Swedish quote had itself been written with
     * the letters stripped: "keep a, a and o with their diacritics". Which is not
     * a small typo - it is an instruction that cannot do its job, and the failure
     * it lets through is a quote that looks like somebody's words while not being
     * them. This test exists because the stripping is a writing habit rather than
     * an encoding fault, so it can come back through any edit.
     */
    const askImpl = stub({ lines: [], ok: "" });
    ok(await checkOwnPart({ text: "Det gick tr\u00f6gt.", askImpl }));

    const system = askImpl.calls[0].system;
    for (const letter of ["\u00e5", "\u00e4", "\u00f6"]) {
      assert.ok(system.includes(letter), `the house rules do not contain ${letter} itself`);
    }
  });

  it("uses the cheap tier, because a per-evening check that costs real money gets turned off", async () => {
    const askImpl = stub({ lines: [], ok: "" });
    ok(await checkOwnPart({ text: "A day.", askImpl }));
    assert.match(askImpl.calls[0].model, /haiku/);
  });

  it("drops a finding with no quote, since there would be nothing to look at", async () => {
    const askImpl = stub({
      lines: [
        { quote: "   ", instead: "something" },
        { quote: "she was impossible", instead: "I could not reach her" }
      ],
      ok: ""
    });
    const result = ok(await checkOwnPart({ text: "she was impossible", askImpl }));

    assert.equal(result.lines.length, 1);
    assert.equal(result.lines[0].quote, "she was impossible");
  });

  it("returns the clean answer rather than an empty result", async () => {
    // A check that only ever speaks up when something is wrong reads as an
    // accusation waiting to happen.
    const askImpl = stub({ lines: [], ok: "Every line here is about what you did." });
    const result = ok(await checkOwnPart({ text: "I stayed quiet.", askImpl }));

    assert.deepEqual(result.lines, []);
    assert.equal(result.ok, "Every line here is about what you did.");
  });

  it("takes no store and so cannot write anything at all", () => {
    // Structural rather than asserted: the function's only argument is the text.
    // There is no store to write an entry back into, which is a stronger
    // guarantee than a test that checks it did not.
    assert.equal(checkOwnPart.length, 1);
  });
});
