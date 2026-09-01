/**
 * Reading across the moments, as opposed to reading one.
 *
 * ## What a moment is, and why the pass over them is a different pass
 *
 * A moment is one thing that happened and the writer's own part in it. The work
 * half has a pass over end-of-day entries; this is its sibling over events, and
 * the two must not be folded together - a day is a retrospective written once in
 * the evening, a moment is an event and a day holds as many as it holds.
 *
 * ## The one thing this file exists to enforce
 *
 * The private half has no themes, on purpose: the work half's themes read
 * observations ABOUT a person and name patterns in them, and run over a family
 * that is a character profile of your own child. So the pattern-finding that does
 * belong here reads the writer's OWN part. Every finding's subject is the person
 * writing, which is the same constraint `myattention.js` enforces from the other
 * direction, and it is what makes this safe to run at all.
 *
 * ## Why there is a floor rather than a hedge
 *
 * Same floors as the journal pass, imported rather than restated so the two
 * cannot drift apart. The spread rule is the one that earns its keep here: three
 * moments written in one nine-minute sitting are one data point, and a pass that
 * ran on them anyway would name a pattern from a single afternoon and be read as
 * fact a month later.
 */

import { MIN_ENTRIES, MIN_SPREAD } from "./review.js";
import { DAY_MS } from "./time.js";

/**
 * The moments inside the window, newest first.
 *
 * @param {Record<string, any>[]} moments
 * @param {number} now
 * @param {number} days
 * @returns {Record<string, any>[]}
 */
export function momentsSince(moments, now, days) {
  const from = now - days * DAY_MS;
  return moments
    .filter((m) => Number(m.at ?? 0) >= from && String(m.part ?? "").trim() !== "")
    .sort((a, b) => Number(b.at ?? 0) - Number(a.at ?? 0));
}

/**
 * How much there is to read, and over how many separate days.
 *
 * `spread` counts days rather than moments because it is the honest denominator:
 * several logged in one sitting describe one afternoon however many rows they
 * make.
 *
 * @param {Record<string, any>[]} moments Already windowed.
 * @param {number} days
 * @returns {{ moments: number, days: number, spread: number, summary: string }}
 */
export function momentCoverage(moments, days) {
  const dates = new Set(
    moments.map((m) => new Date(Number(m.at ?? 0)).toISOString().slice(0, 10))
  );
  const spread = dates.size;
  return {
    moments: moments.length,
    days,
    spread,
    summary:
      moments.length === 0
        ? `Nothing logged in the last ${days} days.`
        : `${moments.length} ${moments.length === 1 ? "moment" : "moments"} across ${spread} ${
            spread === 1 ? "day" : "days"
          }, out of the last ${days}.`
  };
}

/**
 * Is there enough logged to read across?
 *
 * Refused rather than hedged, and the refusal says what would fix it - the same
 * rule the journal pass follows, for the same reason: a pass that runs on
 * anything and lowers its voice when the material is thin produces output that
 * has to be read twice, once for what it says and once for how much to believe.
 *
 * @param {{ moments: number, spread: number, days: number }} cover
 * @returns {{ ready: boolean, why: string }}
 */
export function momentReadiness(cover) {
  if (cover.moments === 0) {
    return {
      ready: false,
      why: `Nothing logged in the last ${cover.days} days, so there is nothing to read across.`
    };
  }
  if (cover.moments < MIN_ENTRIES) {
    const short = MIN_ENTRIES - cover.moments;
    return {
      ready: false,
      why:
        `${cover.moments} ${cover.moments === 1 ? "moment" : "moments"} in the last ${cover.days} days. ` +
        `A pass needs at least ${MIN_ENTRIES} - ${short} more - because a pattern named from two is ` +
        "one afternoon restated with confidence."
    };
  }
  if (cover.spread < MIN_SPREAD) {
    return {
      ready: false,
      why:
        `Those ${cover.moments} moments cover only ${cover.spread} ${cover.spread === 1 ? "day" : "days"}. ` +
        `A pass needs at least ${MIN_SPREAD}, because several logged in one sitting describe one ` +
        "afternoon however many rows they make."
    };
  }
  return { ready: true, why: "" };
}

/**
 * One moment as the lines the pass reads.
 *
 * His own words, unedited. Nothing from the roster is added: the app never puts a
 * name into this material that he did not write himself, which is a narrower
 * promise than "no names are sent" and the only one that is true - his own prose
 * is his to write, and stripping names out of it would mangle the evidence the
 * pass quotes back.
 *
 * @param {Record<string, any>} moment
 * @returns {string}
 */
export function momentLines(moment) {
  const when = new Date(Number(moment.at ?? 0)).toISOString().slice(0, 10);
  const what = String(moment.what ?? "").trim();
  return [
    `- ${when}`,
    what === "" ? null : `  what happened: ${what}`,
    `  my part: ${String(moment.part ?? "").trim()}`
  ]
    .filter((line) => line !== null)
    .join("\n");
}
