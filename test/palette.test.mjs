/*
 * The stylesheet's own invariants, asserted against its source.
 *
 * Both of the things guarded here already went wrong once, quietly, over many
 * small commits nobody would refuse on its own:
 *
 *   The scale drifted to fifteen font sizes, twelve of the fourteen gaps
 *   between them half a pixel or one. Nothing in the file was WRONG at any
 *   point - each new rule just picked a number near the one beside it, and the
 *   result was a single text size with noise around it, so no screen had
 *   anything that read as more important than anything else.
 *
 *   The dimmest of the three text levels became the most used colour in the
 *   file - more sites than the other two together - at 2.47:1 on the lightest
 *   surface. That is under WCAG's 3:1 floor for large text, let alone the 4.5:1
 *   for body, and it meant most of the labels and counts in the app were drawn
 *   in a colour intended for furniture.
 *
 * Neither is the sort of thing a screenshot catches, because both arrive one
 * shade and one half-pixel at a time. Numbers catch them.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(join(root, "src", "renderer", "app.css"), "utf8");

/** The :root block, and everything after it, kept apart: the tokens are defined
 * in the first and may only be referenced in the second. */
function split() {
  const start = css.indexOf(":root {");
  assert.ok(start >= 0, ":root should exist in app.css");
  const end = css.indexOf("\n}", start);
  assert.ok(end > start, ":root should be closed");
  return { root: css.slice(start, end), rest: css.slice(end) };
}

/** @param {string} hex */
function channels(hex) {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

/**
 * Relative luminance, per WCAG 2.x.
 *
 * @param {string} hex
 */
function luminance(hex) {
  const [r, g, b] = channels(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** @param {string} a @param {string} b */
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Every `--name: #hex;` in :root.
 *
 * @returns {Record<string, string>}
 */
function tokens() {
  /** @type {Record<string, string>} */
  const out = {};
  for (const m of split().root.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    out[m[1]] = m[2];
  }
  return out;
}

const SURFACES = ["bg", "surface", "surface-2", "surface-3"];
const LADDER = ["text", "text-dim", "text-faint"];

describe("the type scale", () => {
  it("is declared in one place, as tokens", () => {
    const steps = [...split().root.matchAll(/--t-([a-z]+):\s*([\d.]+)px/g)].map((m) => ({
      name: m[1],
      px: Number(m[2])
    }));

    assert.equal(steps.length, 6, `expected six steps, found ${steps.map((s) => s.name).join(", ")}`);

    /* Ordered, and far enough apart to be seen. A step under 1.08x is a step
       the eye reads as the same size, which is how fifteen of them accumulated
       without anybody choosing fifteen. */
    const px = steps.map((s) => s.px).sort((a, b) => a - b);
    for (let i = 1; i < px.length; i++) {
      const factor = px[i] / px[i - 1];
      assert.ok(
        factor >= 1.08,
        `${px[i - 1]}px and ${px[i]}px are ${factor.toFixed(3)}x apart, which does not read as two levels`
      );
    }
  });

  it("is the only source of a font size", () => {
    const { rest } = split();
    const declarations = [...rest.matchAll(/font-size:\s*([^;]+);/g)].map((m) => m[1].trim());

    /* The vacuous case: a regex that finds nothing would pass every assertion
       below it and prove that the stylesheet has no text at all. */
    assert.ok(
      declarations.length >= 40,
      `only ${declarations.length} font-size declarations found - the parse is wrong, not the file`
    );

    const raw = declarations.filter((d) => !d.startsWith("var(--t-"));
    assert.deepEqual(raw, [], `these bypass the scale: ${raw.join(", ")}`);
  });
});

describe("the text ladder", () => {
  it("is readable on every surface the app draws it on", () => {
    const t = tokens();

    for (const name of [...LADDER, ...SURFACES]) {
      assert.ok(t[name] !== undefined, `--${name} should be defined in :root`);
    }

    for (const level of LADDER) {
      for (const surface of SURFACES) {
        const ratio = contrast(t[level], t[surface]);
        assert.ok(
          ratio >= 4.5,
          `--${level} on --${surface} is ${ratio.toFixed(2)}:1, under the 4.5:1 needed to read it`
        );
      }
    }
  });

  it("is three levels rather than one repeated", () => {
    const t = tokens();
    for (let i = 1; i < LADDER.length; i++) {
      const ratio = contrast(t[LADDER[i - 1]], t[LADDER[i]]);
      assert.ok(
        ratio >= 1.35,
        `--${LADDER[i - 1]} and --${LADDER[i]} are ${ratio.toFixed(2)}:1 apart and will read as the same level`
      );
    }
  });
});

describe("semantic colour", () => {
  it("is never a loose hex outside the tokens", () => {
    const { rest } = split();

    /* Bare `color: #abc123`. Backgrounds and borders are allowed their own
       one-off values - a tint mixed for one card is not a meaning - but a text
       colour carries severity, and eight of these had already drifted into the
       file, each one typed from memory a shade off the last. */
    const loose = [...rest.matchAll(/(?:^|[^-\w])color:\s*(#[0-9a-fA-F]{3,8})\s*;/gm)].map((m) => m[1]);
    assert.deepEqual(loose, [], `severity should go through a token: ${loose.join(", ")}`);
  });

  it("has a readable text variant for each semantic hue", () => {
    const t = tokens();
    const pairs = [
      ["critical", "critical-text"],
      ["warn", "warn-text"],
      ["ok", "ok-text"],
      ["book", "book-text"]
    ];

    for (const [base, text] of pairs) {
      assert.ok(t[base] !== undefined, `--${base} should be defined`);
      assert.ok(t[text] !== undefined, `--${text} should be defined`);

      /* The point of the pair: the text variant is the one that can be read on
         a tinted pill, so it has to be the lighter of the two and clear the
         floor on the lightest surface. */
      assert.ok(
        luminance(t[text]) > luminance(t[base]),
        `--${text} should be lighter than --${base}, or the pair has no purpose`
      );
      const ratio = contrast(t[text], t["surface-3"]);
      assert.ok(ratio >= 4.5, `--${text} on --surface-3 is ${ratio.toFixed(2)}:1`);
    }
  });
});

describe("severity is visible without reading anything", () => {
  it("marks a plain card with no bar, so a bar means something", () => {
    /* The bar used to default to --line, which is also the card's border
       colour, so a critical card differed from an ordinary one by three pixels
       of colour. An absent bar is the stronger signal, and it only works while
       the default stays transparent. */
    const bar = css.slice(css.indexOf(".card::before"));
    const block = bar.slice(0, bar.indexOf("}"));
    assert.match(block, /background:\s*transparent/);
  });

  it("uses the same language on a roster row as on a card", () => {
    /* Two vocabularies for one meaning is one that gets forgotten. Rows carry
       the severity of the drift on them, and share these rules with cards
       rather than restating them. */
    for (const sev of ["critical", "warn", "ok"]) {
      assert.match(
        css,
        new RegExp(`\\.row\\.sev-${sev}(::before)?[,\\s{]`),
        `.row.sev-${sev} should exist, or a row cannot show what a card can`
      );
    }
  });
});
