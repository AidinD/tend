/**
 * Tend's icon: four marks, one hanging lower.
 *
 * Four strokes cut by hand, three roughly level and one reaching well past
 * them in the warm colour. That is the app in one picture - not a checklist,
 * but a set of things kept in step and the one that has fallen behind. The
 * marks lean slightly differently and are not evenly spaced, because a ruler
 * says dashboard and a hand says somebody has been keeping count.
 *
 * Two details that took a round to get right. There is no fifth diagonal
 * stroke: four-and-a-slash means "five" in every counting system there is, and
 * reads as struck through besides. And each stroke tapers from where the pen
 * went down to where it lifted, which is the difference between drawn and
 * measured.
 *
 * The PNG writer, the ICO writer and the distance-field helpers live in
 * `keel/icon`, shared with the rest of the suite. This file is only Tend's
 * geometry and its colour. It used to carry its own copy of all of that, and it
 * was the last of the four copies to go.
 *
 * Run with `node scripts/generate-icon.mjs`. The output is committed to
 * resources/, because electron-builder needs it at package time and a build
 * should never depend on having run a script first.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderPng, renderIco, coverage, distRoundedRect, distSegmentAt, SMALL_BELOW } from "keel/icon";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "resources");
mkdirSync(outDir, { recursive: true });

const BG = [27, 28, 31]; // --bg
const ACCENT = [111, 156, 255]; // --accent
const WARM = [224, 112, 94]; // --critical

/**
 * The marks: [x at top, top, bottom, lean, thickness, colour].
 *
 * Positions and leans are hand-chosen rather than generated - evenly spaced
 * marks with alternating leans look mechanical, which is the whole thing this
 * design is avoiding.
 */
const MARKS = [
  [0.295, 0.245, 0.6, 0.022, 1.0, ACCENT],
  [0.415, 0.235, 0.625, -0.016, 0.94, ACCENT],
  [0.535, 0.26, 0.575, 0.018, 1.04, ACCENT],
  [0.665, 0.24, 0.855, -0.01, 1.0, WARM]
];

/**
 * The same picture with a stroke taken out, for 16 and 24.
 *
 * Four marks at 16px is four one-pixel lines a pixel apart, which averages to a
 * single smear - the thing reads as a blue smudge with a warm edge, not as marks
 * at all. Three, spread wider and cut heavier, still says "several kept in step
 * and one fallen behind", which is the whole content of the picture. The count
 * was never the point; the odd one out is.
 */
const MARKS_SMALL = [
  [0.33, 0.25, 0.6, 0.02, 1.3, ACCENT],
  [0.5, 0.24, 0.62, -0.015, 1.24, ACCENT],
  [0.68, 0.245, 0.86, -0.01, 1.34, WARM]
];

/**
 * A stroke that is slightly narrower where the pen lands, fullest through the
 * middle, and eases off as it lifts.
 *
 * The range matters more than the shape. A first attempt started at zero, which
 * is what a pen does in physics and not what it does on paper: it produced four
 * sharp points and the icon read as arrows or pen nibs rather than as marks.
 * The variation has to be felt rather than seen.
 *
 * @param {number} t Position along the stroke, 0 at the top.
 * @returns {number} Multiplier on the base half-width, always well above zero.
 */
function penProfile(t) {
  const land = 0.86 + 0.14 * Math.min(1, t / 0.22);
  const lift = 1 - Math.pow(t, 3) * 0.24;
  return land * lift;
}

/**
 * @param {number[]} under @param {number[]} over @param {number} alpha
 * @returns {number[]}
 */
const blend = (under, over, alpha) => under.map((c, i) => Math.round(c + (over[i] - c) * alpha));

/**
 * Marks on a rounded plate.
 *
 * This used to supersample a hard in-or-out test 16 times per pixel. It is a
 * distance field now, like the rest of the family: the anti-aliasing is
 * computed rather than sampled, which is both sharper and sixteen times less
 * arithmetic. The geometry is untouched - same marks, same plate, same leans.
 *
 * @param {number} x @param {number} y @param {number} size
 */
function shadeMark(x, y, size) {
  // The plate is a filled shape, so its distance is signed and its coverage is
  // taken against zero rather than against a stroke width.
  const plate = coverage(distRoundedRect(x, y, size * 0.06, size * 0.06, size * 0.88, size * 0.88, size * 0.2), 0);
  if (plate === 0) {
    return [0, 0, 0, 0];
  }

  // Below 32 the strokes have to carry more of the canvas each, or they vanish
  // into the plate. The changeover matches Jot, Nib and Loom.
  const small = size < SMALL_BELOW;
  const base = size * (small ? 0.082 : 0.055);

  let ink = BG;
  let inked = 0;
  for (const [px, top, bottom, lean, weight, colour] of small ? MARKS_SMALL : MARKS) {
    const { distance, t } = distSegmentAt(
      x,
      y,
      size * Number(px),
      size * Number(top),
      size * (Number(px) + Number(lean)),
      size * Number(bottom)
    );
    const alpha = coverage(distance, (base * Number(weight) * penProfile(t)) / 2);
    // The marks do not overlap, so the nearest one simply wins; taking the max
    // rather than painting in order keeps that true if one ever does.
    if (alpha > inked) {
      inked = alpha;
      ink = /** @type {number[]} */ (colour);
    }
  }

  const [red, green, blue] = blend(BG, ink, inked);
  return [red, green, blue, Math.round(255 * plate)];
}

// The PNG electron-builder falls back to, and what non-Windows targets use.
writeFileSync(join(outDir, "icon.png"), renderPng(512, shadeMark));

// What ships on Windows. 20 and 24 are in the ladder because the taskbar asks
// for them at 125% and 150% display scaling - the two scales where a missing
// frame means Windows resamples a neighbour and the marks go soft again.
writeFileSync(join(outDir, "icon.ico"), renderIco(shadeMark));

console.log("Wrote resources/icon.png and resources/icon.ico");
