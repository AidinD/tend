/**
 * Turn the supplied hand-and-heart JPG into the private half's mark.
 *
 * Three problems with the source, all of them ordinary for artwork that came out
 * of a chat window:
 *
 *   It is a JPEG, and the icon pipeline reads PNG. Electron's own image decoder
 *   does the conversion, which is why this runs under Electron rather than node.
 *
 *   Its transparency is PAINTED - a grey checkerboard baked into the pixels.
 *   Used as-is, an icon would carry grey squares. The mark is one flat colour and
 *   the checkerboard is greyscale, so saturation separates them cleanly: a pixel
 *   whose channels are nearly equal is background, whatever its lightness.
 *
 *   It is portrait, and mostly empty. Icons are square and are looked at from
 *   16px up, so the mark is cropped to its own bounding box and padded to a
 *   square with a small even margin. Without that the hand would be a thin
 *   diagonal smear in the taskbar.
 *
 * Recoloured to the private accent on the way through. The two halves then differ
 * in silhouette AND colour, which is the point of having a second mark at all -
 * two windows open at once must not be mistakable for each other.
 *
 * Kept in the repo rather than thrown away after one use: artwork arrives this
 * way - out of a chat window, as a JPEG, with a painted checkerboard - and doing
 * it again by hand would mean rediscovering the saturation key.
 *
 *   node_modules/electron/dist/electron.exe scripts/private-mark-from-artwork.cjs <source>
 *
 * Then Wrote resources/icon.png and resources/icon.ico from 924px artwork
Using the private artwork at D:\Repo\Tools	end\srcendererssets	end-logo-private.png
Wrote resources/icon-private.png and resources/icon-private.ico to rebuild the .ico from it.
 */

const { app, nativeImage } = require("electron");
const { writeFileSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "src", "renderer", "assets", "tend-logo-private.png");

/** The private half's accent, from app.css. */
const ACCENT = [0x59, 0xb5, 0x8f];

/** Below this much colour, a pixel is the painted checkerboard. */
const KEY_LOW = 24;
/** Above this much, it is solidly the mark. Between the two is the soft edge. */
const KEY_HIGH = 70;

/** How much empty space to leave around the mark, as a share of its longest side. */
const MARGIN = 0.06;

app.whenReady().then(async () => {
  const source = process.argv[process.argv.length - 1];
  const { decodePng, encodePng } = await import("keel/icon");

  const png = nativeImage.createFromPath(source).toPNG();
  if (png.length === 0) {
    console.error(`Electron could not read ${source}`);
    app.exit(1);
    return;
  }
  const image = decodePng(png);
  console.log(`Read ${image.width}x${image.height} from ${source}`);

  // ------------------------------------------------------------- keying --
  const alpha = new Uint8Array(image.width * image.height);
  for (let i = 0, p = 0; i < image.pixels.length; i += 4, p += 1) {
    const r = image.pixels[i];
    const g = image.pixels[i + 1];
    const b = image.pixels[i + 2];
    const colour = Math.max(r, g, b) - Math.min(r, g, b);
    alpha[p] =
      colour <= KEY_LOW
        ? 0
        : colour >= KEY_HIGH
          ? 255
          : Math.round(((colour - KEY_LOW) / (KEY_HIGH - KEY_LOW)) * 255);
  }

  // ------------------------------------------------- the mark's own box --
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      // A threshold rather than "any alpha at all", so JPEG ringing around the
      // checkerboard cannot stretch the box to the whole canvas.
      if (alpha[y * image.width + x] > 40) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) {
    console.error("nothing was keyed as the mark - the thresholds are wrong for this image");
    app.exit(1);
    return;
  }
  const markWidth = maxX - minX + 1;
  const markHeight = maxY - minY + 1;
  console.log(`The mark occupies ${markWidth}x${markHeight} at (${minX},${minY})`);

  // --------------------------------------------------- square and centred --
  const longest = Math.max(markWidth, markHeight);
  const side = Math.round(longest * (1 + 2 * MARGIN));
  const offsetX = Math.round((side - markWidth) / 2);
  const offsetY = Math.round((side - markHeight) / 2);

  const out = Buffer.alloc(side * side * 4);
  for (let y = 0; y < markHeight; y += 1) {
    for (let x = 0; x < markWidth; x += 1) {
      const a = alpha[(minY + y) * image.width + (minX + x)];
      if (a === 0) {
        continue;
      }
      const to = ((offsetY + y) * side + (offsetX + x)) * 4;
      out[to] = ACCENT[0];
      out[to + 1] = ACCENT[1];
      out[to + 2] = ACCENT[2];
      out[to + 3] = a;
    }
  }

  writeFileSync(OUT, encodePng(side, side, out));
  console.log(`Wrote ${side}x${side} to ${OUT}`);
  app.exit(0);
});
