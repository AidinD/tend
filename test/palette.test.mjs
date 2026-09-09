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

import { SEVERITY_ORDER } from "../src/domain/cadence.js";
import { T } from "../src/renderer/text.js";

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

describe("the spacing scale inside a card", () => {
  /** The four bonds, tightest first. */
  const BONDS = ["sp-sub", "sp-label", "sp-item", "sp-block"];

  it("is four bonds, each clearly looser than the one before", () => {
    const steps = [...split().root.matchAll(/--(sp-[a-z]+):\s*([\d.]+)px/g)].map((m) => ({
      name: m[1],
      px: Number(m[2])
    }));

    assert.equal(steps.length, BONDS.length, `found ${steps.map((s) => s.name).join(", ")}`);
    assert.deepEqual(
      steps.map((s) => s.name),
      BONDS,
      "declared out of order, which makes the file lie about the hierarchy"
    );

    /* The original numbers were 2, 6, 5 and 12 - four levels inside ten pixels,
       which is one soft margin repeated four times as far as the eye is
       concerned. 1.6x is the point where a gap starts reading as a different
       kind of gap. */
    for (let i = 1; i < steps.length; i++) {
      const factor = steps[i].px / steps[i - 1].px;
      assert.ok(
        factor >= 1.6,
        `--${steps[i - 1].name} and --${steps[i].name} are ${factor.toFixed(2)}x apart, which reads as one gap`
      );
    }
  });

  it("keeps a heading closer to its own content than the content is to itself", () => {
    /*
     * The fault that did the real damage, and the one hardest to see: a section
     * label sat 6px from its list while the list's own items sat 5px from each
     * other. The most tightly bound thing on the card had the most air, so a
     * heading grouped nothing and the card read as one column of text.
     *
     * Proximity is what grouping IS, so this ordering is not a nicety.
     */
    /** @type {Record<string, number>} */
    const t = {};
    for (const m of split().root.matchAll(/--(sp-[a-z]+):\s*([\d.]+)px/g)) {
      t[m[1]] = Number(m[2]);
    }
    /** @param {string} name */
    const px = (name) => t[name];

    for (const name of BONDS) {
      assert.ok(t[name] !== undefined, `--${name} should be defined in :root`);
    }
    assert.ok(
      px("sp-label") < px("sp-item"),
      `a label sits ${px("sp-label")}px from its content and items sit ${px("sp-item")}px apart - the bond is inverted`
    );
    assert.ok(
      px("sp-sub") < px("sp-item"),
      "a line's own second line must sit closer to it than the next item does"
    );
    assert.ok(
      px("sp-item") < px("sp-block"),
      "two items in one list must sit closer than two separate blocks"
    );
  });

  it("is the only source of vertical space on a prep block", () => {
    const { rest } = split();

    /* The three rules that carry the rhythm. If one goes back to a literal, the
       scale is decorative. */
    for (const [selector, property] of [
      [".prep-block", "margin-top"],
      [".prep-head", "margin"],
      [".prep-list", "gap"]
    ]) {
      const at = rest.indexOf(`${selector} {`);
      assert.ok(at >= 0, `${selector} should exist`);
      const block = rest.slice(at, rest.indexOf("}", at));
      const line = block.split("\n").find((l) => l.trim().startsWith(`${property}:`));
      assert.ok(line !== undefined, `${selector} should set ${property}`);
      assert.match(
        line,
        /var\(--sp-/,
        `${selector} sets ${property} to a literal:${line.replace(/\s+/g, " ")}`
      );
    }
  });

  /*
   * The same guard the type scale gets, and it exists for the same measured
   * reason. Counted 2026-09-04, before this: four declared steps against 239
   * hardcoded spacing literals - seventeen distinct gap values, seventeen
   * margin values and twenty-four padding values - with 48 of the literals
   * being a declared step spelled out. No single commit was wrong. The result
   * was air that reads as uneven, and the mock reads tight rather than cramped
   * for the opposite reason: it uses about three values, applied everywhere.
   */
  const spacing = () => {
    const { root, rest } = split();
    /** @type {Map<number, string>} */
    const steps = new Map();
    for (const m of root.matchAll(/--(sp-[a-z]+):\s*([\d.]+)px/g)) {
      steps.set(Number(m[2]), `--${m[1]}`);
    }
    /* Comments out, or a px in a sentence explaining a px gets counted. */
    return { steps, code: rest.replace(/\/\*[\s\S]*?\*\//g, "") };
  };

  /** @param {string} code @param {RegExp} prop */
  const declarations = (code, prop) => {
    const found = [];
    for (const raw of code.split("\n")) {
      const m = raw.trim().match(/^(-?[a-z-]+)\s*:\s*([^;]+);/);
      if (m && prop.test(m[1])) {
        found.push({ prop: m[1], value: m[2].trim() });
      }
    }
    return found;
  };

  it("is the only source of a gap, anywhere in the file", () => {
    /*
     * Gaps and nothing else, because a gap is only ever the rhythm between
     * siblings - which is exactly what the four steps are. There were 57
     * hardcoded ones across seventeen values, most of them within a pixel or
     * two of a step: 10px and 8px sixteen and eleven times each, beside a
     * `var(--sp-item)` that means 9px.
     */
    const { code } = spacing();
    const all = declarations(code, /^(row-|column-)?gap$/);
    assert.ok(all.length > 20, `only ${all.length} gap declarations found, so this proved nothing`);

    const literals = all.filter((d) => /\d+px/.test(d.value));
    assert.deepEqual(
      literals.map((d) => `${d.prop}: ${d.value}`),
      [],
      "a gap is a literal, so the scale is decorative again"
    );
  });

  it("and no padding or margin spells out a step it already has a name for", () => {
    /*
     * Deliberately narrower than the gap rule above. "Round every padding to
     * the nearest of four steps" is not executable and would not be right if
     * it were: a card's `13px 15px 12px 17px` is the inside of a box, tuned
     * against a tinted band and a font size, not the rhythm between things.
     * Four rhythm steps cannot express it, and inventing a fifth rhythm step
     * to cover it would be the drift this test exists to catch.
     *
     * What IS unambiguous is writing 9px where `--sp-item` already means 9px.
     * That was 36 declarations, and every one of them was a coincidence
     * waiting to come apart the day a step moves.
     *
     * The remaining ~200 literals with no step for their value are a real
     * finding and are reported rather than rounded: they want a small set for
     * the inside of a control, which is a decision and not a cleanup.
     */
    const { steps, code } = spacing();
    const all = declarations(code, /^(padding|margin)(-(top|right|bottom|left))?$/);
    assert.ok(all.length > 50, `only ${all.length} found, so this proved nothing`);

    const spelled = [];
    for (const d of all) {
      for (const m of d.value.matchAll(/(?<![\w.-])(\d+(?:\.\d+)?)px/g)) {
        const name = steps.get(Number(m[1]));
        if (name !== undefined) {
          spelled.push(`${d.prop}: ${d.value}  (${m[1]}px is ${name})`);
        }
      }
    }
    assert.deepEqual(spelled, [], "a literal was written where a step already names that value");
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

  it("puts a card's severity in a band, not across its whole surface", () => {
    /*
     * The tint was measured on a narrow card and was right there. On a wide
     * monitor the same 13% alpha becomes two thousand pixels of colour for a
     * signal that has not got any stronger, so the amount of colour tracked the
     * window width rather than the urgency.
     *
     * A band is width-independent. This asserts the shape rather than the
     * pixels: the card itself must not paint a tinted background, and the head
     * must.
     */
    const { rest } = split();

    for (const sev of ["critical", "warn"]) {
      const at = rest.indexOf(`.card.sev-${sev} {`);
      assert.ok(at >= 0, `.card.sev-${sev} should exist`);
      const own = rest.slice(at, rest.indexOf("}", at));
      assert.ok(
        !/background/.test(own),
        `.card.sev-${sev} paints its whole surface: ${own.replace(/\s+/g, " ")}`
      );

      const head = rest.indexOf(`.card.sev-${sev} > .card-top {`);
      assert.ok(head >= 0, `.card.sev-${sev} > .card-top should carry the band`);
      const band = rest.slice(head, rest.indexOf("}", head));
      assert.match(band, new RegExp(`--${sev}-soft`), `the band should use --${sev}-soft`);
    }
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

  it("and on a line, which is the surface a person's page is made of", () => {
    /*
     * The one that was missing, and the reason a person's page read as one grey
     * field: a feedback round fifty weeks overdue and a conversation in step
     * were the same slab, because `.line` was the only surface in this file
     * with no severity vocabulary at all.
     */
    for (const sev of ["critical", "warn", "watch", "ok"]) {
      // Searched as a string rather than a regex. The row's twin above needs a
      // regex because it matches two shapes; this one does not, and a dotted
      // selector inside a template literal is exactly where an escape gets
      // eaten and the check quietly matches nothing.
      assert.ok(
        css.includes(`.line.sev-${sev} {`) || css.includes(`.line.sev-${sev}::before`),
        `.line.sev-${sev} should exist, or a line cannot show what a row can`
      );
    }
  });

  it("gives a line somewhere to hang a bar, or the bar is not drawn where it belongs", () => {
    // `position: relative` and `overflow: hidden`, the two a card sets and the
    // row had to be given when it gained a bar. An absolutely positioned
    // ::before inside a static parent hangs off the nearest ancestor that is
    // not, which draws the bar down the side of the whole card instead.
    const at = css.indexOf(".line {");
    assert.ok(at >= 0, ".line should exist");
    const own = css.slice(at, css.indexOf("}", at));
    assert.match(own, /position:\s*relative/, `.line: ${own.replace(/\s+/g, " ")}`);
    assert.match(own, /overflow:\s*hidden/, `.line: ${own.replace(/\s+/g, " ")}`);
  });

  it("does not let the bar's own positioning capture the fold marker", () => {
    /*
     * Two rules share `.line::before`, and they want opposite things from it.
     * The severity bar needs `position: absolute` to stretch down the row's
     * left edge; the observation fold marker needs to sit IN the flex row so it
     * lines up with the text beside it. The bar was written second, so the
     * marker inherited absolute positioning it never asked for and got pinned
     * to the row's top-left corner - with the `align-self: center` above it
     * dead, since that cannot apply to an absolutely positioned box.
     *
     * Nothing about the markup looks wrong when this happens, and it survived a
     * screenshot review once. The running app measures it too (e2e-app.mjs
     * reads the pseudo-element's computed position); this is the cheap copy
     * that fails in a second rather than in four minutes.
     */
    const at = css.indexOf(".obs-fold > summary.line::before");
    assert.ok(at >= 0, "the fold marker rule should exist");
    const own = css.slice(at, css.indexOf("}", at));
    assert.match(
      own,
      /position:\s*static/,
      `the fold marker does not win back its position: ${own.replace(/\s+/g, " ")}`
    );
  });

  it("words every severity it can paint, rather than printing the key", () => {
    /*
     * `pill()` used to render the severity key straight into the markup, so a
     * Swedish page said "critical" and "ok" in lowercase English on every row
     * carrying a drift. The translation sweep could not have found it: the
     * string was never written down anywhere, it WAS the identifier.
     *
     * Read from the domain rather than listed here, so a fifth severity has to
     * be worded before it can reach a page.
     */
    for (const sev of SEVERITY_ORDER) {
      const word = /** @type {Record<string, string>} */ (T.severity)[sev];
      assert.ok(
        typeof word === "string" && word.trim() !== "",
        `severity "${sev}" has no word, so a pill would print the key`
      );
      assert.notEqual(word, sev, `severity "${sev}" is worded as its own key`);
    }
  });

  it("holds the content column, and does not let a ceiling defeat the cap", () => {
    /*
     * Nothing capped the column, so on a wide monitor every card, row and block
     * was the full width of the window and no two things on a page differed in
     * shape. It also put the two halves of one mistake side by side: prose
     * capped at 68ch sat as a narrow strip in a mostly empty box while a row's
     * text had no cap at all and ran the whole width in a single line.
     *
     * Asserted in the source rather than in the window because the rendered
     * check can only run when the window happens to be wider than the cap, and
     * a check that skips is not a check. This is also the exact shape of the
     * bug it is guarding: the first version wrote the padding as a `clamp` with
     * a 12vw ceiling, and on a 3240px window the ceiling won - so the cap held
     * on every window that did not need it and on none that did.
     */
    const at = css.indexOf("main {");
    assert.ok(at >= 0, "main should exist");
    const own = css.slice(at, css.indexOf("}", at));

    assert.match(
      own,
      /padding:[^;]*calc\(\(100% - \d+px\) \/ 2\)/,
      `main does not hold the column: ${own.replace(/\s+/g, " ")}`
    );
    assert.ok(
      !/clamp\(/.test(own),
      `a clamp puts a ceiling on the padding, which caps the column only on narrow windows: ${own.replace(/\s+/g, " ")}`
    );
  });
});
