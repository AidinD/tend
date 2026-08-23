/**
 * Tend's icon: four marks, one hanging lower.
 *
 * Minimal dependency-free PNG writer, the same approach Jot and Nib use.
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
 * Everything is supersampled and averaged down; without it the leaning strokes
 * come out as staircases.
 *
 * Run with `node scripts/generate-icon.mjs`. The output is committed to
 * resources/, because electron-builder needs it at package time and a build
 * should never depend on having run a script first.
 */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "resources");
mkdirSync(outDir, { recursive: true });

const BG = [27, 28, 31]; // --bg
const ACCENT = [111, 156, 255]; // --accent
const WARM = [224, 112, 94]; // --critical

const SS = 4;

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

/** @param {Buffer} buffer */
function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** @param {string} type @param {Buffer} data */
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

/**
 * Is (x, y) inside a rounded square inset by `inset` with corner `radius`?
 *
 * @param {number} x @param {number} y @param {number} s
 */
function inPlate(x, y, s) {
  const inset = s * 0.06;
  const radius = s * 0.2;
  const min = inset;
  const max = s - inset;
  if (x < min || y < min || x > max || y > max) {
    return false;
  }
  const dx = Math.max(min + radius - x, 0, x - (max - radius));
  const dy = Math.max(min + radius - y, 0, y - (max - radius));
  return dx * dx + dy * dy <= radius * radius;
}

/**
 * Distance from a point to a segment, and how far along it the nearest point
 * lies. The second value is what lets a stroke taper.
 *
 * @param {number} px @param {number} py
 * @param {number} ax @param {number} ay
 * @param {number} bx @param {number} by
 * @returns {{ distance: number, t: number }}
 */
function nearestOnSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return { distance: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)), t };
}

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

/** @param {number} x @param {number} y @param {number} s */
function draw(x, y, s) {
  if (!inPlate(x, y, s)) {
    return null;
  }

  // Below 32 the strokes have to carry more of the canvas each, or they vanish
  // into the plate. The changeover matches Jot, Nib and Loom.
  const small = s < 32;
  const base = s * (small ? 0.082 : 0.055);

  for (const [px, top, bottom, lean, weight, colour] of small ? MARKS_SMALL : MARKS) {
    const ax = s * Number(px);
    const ay = s * Number(top);
    const bx = s * (Number(px) + Number(lean));
    const by = s * Number(bottom);
    const { distance, t } = nearestOnSegment(x, y, ax, ay, bx, by);
    if (distance <= (base * Number(weight) * penProfile(t)) / 2) {
      return /** @type {number[]} */ (colour);
    }
  }

  return BG;
}

/** @param {number} size */
function renderPng(size) {
  const step = 1 / SS;
  const samples = SS * SS;
  /** @type {Buffer[]} */
  const rows = [];

  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let hits = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const colour = draw(x + (sx + 0.5) * step, y + (sy + 0.5) * step, size);
          if (colour) {
            r += colour[0];
            g += colour[1];
            b += colour[2];
            hits += 1;
          }
        }
      }
      if (hits > 0) {
        row.set(
          [
            Math.round(r / hits),
            Math.round(g / hits),
            Math.round(b / hits),
            Math.round((hits / samples) * 255)
          ],
          1 + x * 4
        );
      }
    }
    rows.push(row);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}


/**
 * A Vista-era .ico: a directory of entries, each holding a whole PNG.
 *
 * Written by hand so the small sizes can be a different drawing. `icon-32.png`
 * used to exist for that reason and could never work: electron-builder takes one
 * icon, so a second PNG sitting beside it is never consulted, and Windows went
 * on resampling the 512 down to 16. Only a multi-size .ico can carry two
 * drawings.
 *
 * @param {{ size: number, png: Buffer }[]} images
 */
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  const directory = [];
  let offset = 6 + images.length * 16;
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size; // 0 means 256
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0; // palette
    entry[3] = 0; // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    directory.push(entry);
    offset += png.length;
  }

  return Buffer.concat([header, ...directory, ...images.map((image) => image.png)]);
}

// The PNG electron-builder falls back to, and what non-Windows targets use.
writeFileSync(join(outDir, "icon.png"), renderPng(512));

// What ships on Windows. 20 and 24 are in here because the taskbar asks for them
// at 125% and 150% display scaling - the two scales where a missing frame means
// Windows resamples a neighbour and the marks go soft again.
writeFileSync(
  join(outDir, "icon.ico"),
  buildIco([256, 128, 64, 48, 32, 24, 20, 16].map((size) => ({ size, png: renderPng(size) })))
);

console.log("Wrote resources/icon.png and resources/icon.ico");
