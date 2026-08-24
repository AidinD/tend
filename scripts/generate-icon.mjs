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
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
