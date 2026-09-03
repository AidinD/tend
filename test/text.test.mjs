/**
 * The words stay in one place.
 *
 * The module only helps if it is the whole vocabulary. A view that keeps one
 * sentence of its own is worse than a view that keeps all of them: somebody
 * rewriting the wording reads the module, changes what it says, and the app
 * still says the old thing on one screen with nothing failing anywhere.
 *
 * So the guarantee is checked rather than asked for. Two halves: no prose left
 * in a renderer file, and no key in the module that nothing reads.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const ROOT = new URL("../src/renderer/", import.meta.url);

/** Every renderer file that draws something, plus the views. */
function sources() {
  /** @type {{ name: string, source: string }[]} */
  const out = [];
  for (const name of ["app.js", "ui.js", "model.js", "palette.js"]) {
    out.push({ name, source: readFileSync(new URL(name, ROOT), "utf8") });
  }
  for (const name of readdirSync(new URL("views/", ROOT))) {
    if (name.endsWith(".js")) {
      out.push({
        name: `views/${name}`,
        source: readFileSync(new URL(`views/${name}`, ROOT), "utf8")
      });
    }
  }
  return out;
}

/**
 * Source with every comment removed.
 *
 * The comments are where the reasoning lives and they are full of prose, so a
 * check that did not strip them would report every explanation in the file. It
 * does not try to understand a string containing `//` - the only ones in the
 * renderer are urls, which the prose filter rejects anyway.
 *
 * @param {string} source
 */
function withoutComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
}

/**
 * Does this look like a sentence somebody reads, rather than code?
 *
 * Four words or more, and none of the punctuation that only appears in code.
 * Four because three is where identifiers and class lists live - "card sev
 * critical" is three - and because every sentence extracted in this refactor
 * was longer than that.
 *
 * @param {string} raw
 */
function looksLikeProse(raw) {
  const s = raw.replace(/\s+/g, " ").trim();
  if (s.split(" ").length < 4) {
    return false;
  }
  if (!/[A-Za-z]{3} [A-Za-z]{2}/.test(s)) {
    return false;
  }
  if (/[{}<>=|&$]|::|\/\/|@type/.test(s)) {
    return false;
  }
  /*
   * A run of identifiers is not a sentence however long it is, and the tell is
   * that no sentence in English gets through four words without one of these.
   */
  if (!/\b(a|an|the|is|it|you|your|and|not|of|to|that|this|for|in|on|so)\b/i.test(s)) {
    return false;
  }
  return true;
}

/**
 * Prose still written into a file rather than read from the module.
 *
 * Two passes, the same two the migration used: HTML text nodes, and quoted
 * literals. Interpolations go first, so a sentence split by a computed value is
 * judged in the halves it is actually written in.
 *
 * @param {string} source
 */
function proseIn(source) {
  const code = withoutComments(source).replace(/\$\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, " ");

  /** @type {Set<string>} */
  const found = new Set();

  const keep = (/** @type {string} */ part) => {
    if (looksLikeProse(part)) {
      found.add(part.replace(/\s+/g, " ").trim());
    }
  };

  for (const m of code.matchAll(/>([^<>]+)</g)) {
    keep(m[1]);
  }
  for (const m of code.matchAll(/(["'])((?:[^\\\n]|\\.){14,}?)\1/g)) {
    keep(m[2]);
  }
  return [...found];
}

test("the vocabulary lives in one file", async (t) => {
  const files = sources();

  await t.test("this check found the renderer at all", () => {
    /*
     * A vacuous pass here would be silent and permanent - the check would go
     * green on an empty list forever. Seventeen files were migrated, so
     * anything under fifteen means the walk is broken rather than the app
     * clean.
     */
    assert.ok(files.length >= 15, `only found ${files.length} renderer files`);
  });

  await t.test("every renderer file reads the module", () => {
    /*
     * Every one of them, not most of them. A threshold here would let a new
     * view be added with its own words and still go green, which is exactly
     * the case this whole check exists for. The first version of it allowed
     * two stragglers and passed with the import deleted from a view.
     */
    const silent = files
      .filter(
        (f) =>
          !f.source.includes('from "./text.js"') && !f.source.includes('from "../text.js"')
      )
      .map((f) => f.name);
    assert.deepEqual(silent, [], `renderer files not reading the module: ${silent.join(", ")}`);
  });

  await t.test("and no file keeps a sentence of its own", () => {
    /** @type {string[]} */
    const offenders = [];
    for (const { name, source } of files) {
      for (const line of proseIn(source)) {
        offenders.push(`${name}: ${line}`);
      }
    }
    assert.deepEqual(offenders, [], `prose outside the module:\n  ${offenders.join("\n  ")}`);
  });
});

test("nothing in the module is unread", async (t) => {
  const { T } = await import("../src/renderer/text.js");
  const all = sources()
    .map((f) => f.source)
    .join("\n");

  /** Every key in the module, as `section.key`. */
  const keys = Object.entries(T).flatMap(([section, entries]) =>
    Object.keys(entries).map((key) => `${section}.${key}`)
  );

  await t.test("this check found the module at all", () => {
    assert.ok(keys.length >= 400, `only found ${keys.length} keys`);
  });

  await t.test("and every key is read somewhere", () => {
    /*
     * Matched on the key name rather than the whole path, because a view
     * aliases the section it uses - `const words = T.people` - and the section
     * name never appears again in that file.
     */
    /** @type {string[]} */
    const unread = [];
    for (const path of keys) {
      const key = path.split(".")[1];
      if (
        !new RegExp(`\\bwords\\.${key}\\b`).test(all) &&
        !new RegExp(`\\bT\\.\\w+\\.${key}\\b`).test(all)
      ) {
        unread.push(path);
      }
    }
    assert.deepEqual(unread, [], `keys nothing reads:\n  ${unread.join("\n  ")}`);
  });
});

/**
 * The rail says the same thing twice, and the two copies have to agree.
 *
 * A rail button's label is written into index.html, and the same view's name is
 * written into the vocabulary in `halves.js` - which is where the palette reads
 * it from for "Go to Prep". They agree today and nothing made them: editing one
 * gives the same view two names, one in the rail and one in Ctrl+K, which is
 * precisely the failure this refactor exists to stop.
 *
 * Not merged into the module, because the rail is static markup and scripting
 * its labels at boot would be a behaviour change rather than a move. Checked
 * instead.
 */
test("the rail and the palette call each view the same thing", async (t) => {
  const html = readFileSync(new URL("index.html", ROOT), "utf8");
  const { VIEWS } = await import("../src/domain/halves.js");

  /** @type {[string, string][]} */
  const labels = [];
  for (const m of html.matchAll(/data-view="([a-z]+)"\s*>\s*([^<\n]+)/g)) {
    labels.push([m[1], m[2].trim()]);
  }

  await t.test("this check found the rail at all", () => {
    assert.ok(labels.length >= 10, `only found ${labels.length} rail buttons`);
  });

  await t.test("and every label matches the view's name", () => {
    /** @type {string[]} */
    const wrong = [];
    for (const [id, label] of labels) {
      const view = VIEWS.find((/** @type {any} */ v) => v.id === id);
      if (view === undefined) {
        wrong.push(`${id}: in the rail but not in the vocabulary`);
        continue;
      }
      if (view.name !== label) {
        wrong.push(`${id}: rail says "${label}", vocabulary says "${view.name}"`);
      }
    }
    assert.deepEqual(wrong, [], `the rail and the vocabulary disagree:\n  ${wrong.join("\n  ")}`);
  });
});
