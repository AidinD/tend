/**
 * Tend's icon: a multi-size .ico built from the supplied artwork.
 *
 * The mark is NOT drawn here. Unlike Jot, Nib, Loom and Nudge, whose marks are
 * geometry in their generators, Tend's is a picture - an open hand with a flame
 * rising out of it, at `src/renderer/assets/tend-logo.png`. This script only
 * changes how it is delivered.
 *
 * ## Why a picture and not geometry
 *
 * It was tried the other way first, at length. About forty drawings of a hand
 * holding a flame, all as distance fields, and every one failed the same way: a
 * solid shape sitting in a curved one reads as an object in a vessel - a
 * cupcake, an ice cream, a hat - and a hand drawn well enough to escape that
 * becomes a comb below 24px. What the geometry could produce was a gesture, and
 * a gesture was not what the mark was supposed to be.
 *
 * So the drawing is a drawing. It is worth being clear about the trade, because
 * it is the same one Helm made and it is permanent: the hand has fingers and
 * the flame has a counter inside it, and below about 32px those close up. A
 * mark held as geometry can drop its own detail for the small frames - Nib
 * drops its vent hole, Jot widens its ring's gap - and a bitmap cannot. 16px
 * stays dense. That was accepted deliberately.
 *
 * ## What this does fix
 *
 * `build.win.icon` pointing straight at a 512px PNG makes electron-builder
 * produce the whole icon from one bitmap and lets Windows scale it to whatever
 * it needs. Here each frame is resampled from the source at its own size, by
 * area-averaging every source pixel that falls inside it, and the ladder
 * includes 20 and 24 - the sizes the taskbar asks for at 125% and 150% display
 * scaling, where a missing frame means Windows resamples a neighbour.
 *
 * Run with `node scripts/generate-icon.mjs`. The output is committed to
 * resources/, because electron-builder needs it at package time and a build
 * should never depend on having run a script first.
 *
 * ## Two marks, because there are two halves
 *
 * The private half gets its own `.ico`, set on the window at runtime. That is the
 * only marking of the two halves visible when the app is not focused - the title
 * says which one, but a taskbar shows an icon - and it is the signal least likely
 * to be misread when both windows are open at once.
 *
 * Its source is `assets/tend-logo-private.png` when that exists. When it does
 * not, this writes a recoloured copy of the work mark there as a default and says
 * so; real artwork dropped in that slot is never overwritten.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_LADDER, buildIco, decodePng, encodePng, resample } from "keel/icon";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const source = join(root, "src", "renderer", "assets", "tend-logo.png");
const outDir = join(root, "resources");
mkdirSync(outDir, { recursive: true });

const artwork = decodePng(readFileSync(source));
if (artwork.width !== artwork.height) {
  throw new Error(`the artwork must be square; it is ${artwork.width}x${artwork.height}`);
}

/**
 * One frame, area-averaged from the full-size artwork.
 *
 * Always from the source, never from a frame already shrunk. Chaining
 * reductions compounds the softening, and the small frames are exactly the ones
 * that cannot afford it.
 *
 * @param {number} size
 */
const frame = (size) => encodePng(size, size, resample(artwork, size));

// What non-Windows targets use, and electron-builder's fallback.
writeFileSync(join(outDir, "icon.png"), frame(512));

// What ships on Windows.
writeFileSync(join(outDir, "icon.ico"), buildIco(DEFAULT_LADDER.map((size) => ({ size, png: frame(size) }))));

console.log(`Wrote resources/icon.png and resources/icon.ico from ${artwork.width}px artwork`);

/* ------------------------------------------------------- the private half -- */

/**
 * The private half's accent, from app.css.
 *
 * Duplicated here rather than parsed out of the stylesheet, and that is a real
 * copy worth admitting: if the accent changes in one place the icon keeps the old
 * one until this is run again. The alternative is a build step that reads CSS,
 * which is a larger thing to maintain than one hex value with a comment on it.
 */
const PRIVATE_ACCENT = [0x59, 0xb5, 0x8f];

/**
 * The same drawing, in the private half's colour.
 *
 * Recoloured rather than redrawn. Every pixel keeps its alpha and its relative
 * lightness and takes the new hue, so the silhouette, the counters and the
 * antialiased edges survive - which matters most at 16px, where the mark is
 * almost entirely edge.
 *
 * This is the DEFAULT, not the intent. Two halves that differ only in colour is
 * a weaker signal than two different silhouettes, and the file it writes is
 * overridden by real artwork the moment there is any.
 *
 * @param {{ width: number, height: number, pixels: Buffer }} image
 */
function tinted(image) {
  const pixels = Buffer.from(image.pixels);
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) {
      continue;
    }
    // Rec. 601 luma, which is the one that tracks perceived lightness closely
    // enough for a two-tone mark and needs no gamma work.
    const luma = (0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]) / 255;
    for (let c = 0; c < 3; c += 1) {
      // Lighter source pixels land lighter in the new hue, so the artwork's own
      // shading is not flattened into one block of colour.
      pixels[i + c] = Math.round(PRIVATE_ACCENT[c] * (0.55 + 0.45 * luma));
    }
  }
  return { width: image.width, height: image.height, pixels };
}

const privateSource = join(root, "src", "renderer", "assets", "tend-logo-private.png");

/*
 * His artwork wins, and is never overwritten.
 *
 * A generated default in the same slot as the real thing would be confusing if
 * the two were interchangeable, so the rule is one-directional: the file is
 * written only when it is absent, and the message says which happened.
 */
let privateArt;
if (existsSync(privateSource)) {
  privateArt = decodePng(readFileSync(privateSource));
  if (privateArt.width !== privateArt.height) {
    throw new Error(
      `the private artwork must be square; it is ${privateArt.width}x${privateArt.height}`
    );
  }
  console.log(`Using the private artwork at ${privateSource}`);
} else {
  privateArt = tinted(artwork);
  writeFileSync(privateSource, encodePng(privateArt.width, privateArt.height, privateArt.pixels));
  console.log(
    `No private artwork found, so wrote a tinted copy of the work mark to\n  ${privateSource}\n` +
      `Replace that file with real artwork and run this again - it is never overwritten.`
  );
}

/** @param {number} size */
const privateFrame = (size) => encodePng(size, size, resample(privateArt, size));

writeFileSync(join(outDir, "icon-private.png"), privateFrame(512));
writeFileSync(
  join(outDir, "icon-private.ico"),
  buildIco(DEFAULT_LADDER.map((size) => ({ size, png: privateFrame(size) })))
);

console.log("Wrote resources/icon-private.png and resources/icon-private.ico");
