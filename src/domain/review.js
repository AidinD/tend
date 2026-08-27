/**
 * The pass that reads the journal.
 *
 * ## Why the entries were never the product
 *
 * One entry is a note to nobody. Twenty are a record of where the weeks went,
 * and the two things worth knowing from them - what keeps eating the days, and
 * what keeps being avoided - are invisible on the day and obvious across a
 * month. That gap is the only reason the form exists, and until now nothing
 * closed it: the entries were written by him and read by nothing.
 *
 * ## What is code here, and what is not
 *
 * Everything in this file is arithmetic over what the store already holds: how
 * many entries there are, how many separate days they cover, what was recorded
 * in the same window, and which focus was in force while it happened. None of it
 * is a judgement.
 *
 * The judgement - reading four boxes of prose across twenty evenings and naming
 * what recurs - is the model's, and it happens in the service layer. The split
 * is the same one the rest of the app makes: the numbers are deterministic and
 * the prose is not, and the numbers travel with the prose so a paragraph cannot
 * quietly sound more certain than what it was built on.
 *
 * ## Why there is a floor
 *
 * A pattern named from two entries is not a pattern, it is one evening restated
 * with confidence. Worse, it survives: it gets read next month as a fact about
 * how the work went. So a pass below the floor is refused outright rather than
 * hedged, which is the same rule that stops a theme being called a theme after
 * one note.
 *
 * ## The recorded half is events, not hours
 *
 * The ledger counts conversations, promises, decisions and growth notes in the
 * window. It deliberately does not claim to be a timesheet - the store has never
 * held hours and inventing a share-of-week from event counts would be a made-up
 * number with a real-looking denominator. What CAN be stated honestly is what
 * the focus cost, because that is measured: mean drift when it was set against
 * mean drift now. Everything else is a count, labelled as a count.
 *
 * Nothing here touches the store.
 */

import { DAY_MS } from "./time.js";
import { hasContent } from "./journal.js";

/**
 * The fewest entries a pass will read.
 *
 * Four rather than two, because the interesting field is avoidance and a thing
 * avoided twice in two entries is a coincidence. The number is arbitrary; having
 * one is not.
 */
export const MIN_ENTRIES = 4;

/**
 * The fewest separate days those entries must cover.
 *
 * Four entries written in one sitting about one week are one data point, not
 * four - and a catch-up evening produces exactly that shape. Spread is the
 * honest denominator.
 */
export const MIN_SPREAD = 3;

/**
 * Is there enough written to read?
 *
 * Refused rather than hedged, and the refusal says what would fix it. A pass
 * that runs on anything and lowers its voice when the material is thin is a pass
 * whose output has to be read twice: once for what it says and once for how much
 * to believe it.
 *
 * @param {{ entries: number, spread: number, days: number }} coverage
 * @returns {{ ready: boolean, why: string }}
 */
export function readiness(coverage) {
  if (coverage.entries === 0) {
    return {
      ready: false,
      why: `Nothing was written in the last ${coverage.days} days, so there is nothing to read.`
    };
  }
  if (coverage.entries < MIN_ENTRIES) {
    const short = MIN_ENTRIES - coverage.entries;
    return {
      ready: false,
      why:
        `${coverage.entries} ${coverage.entries === 1 ? "entry" : "entries"} in the last ${coverage.days} days. ` +
        `A pass needs at least ${MIN_ENTRIES} - ${short} more ${short === 1 ? "evening" : "evenings"} - because a ` +
        "pattern named from two is one evening restated with confidence, and it gets read as a fact next month."
    };
  }
  if (coverage.spread < MIN_SPREAD) {
    return {
      ready: false,
      why:
        `Those entries cover only ${coverage.spread} ${coverage.spread === 1 ? "day" : "days"}. ` +
        `A pass needs at least ${MIN_SPREAD}, because several written in one sitting about one week are one ` +
        "data point rather than several."
    };
  }
  return { ready: true, why: "" };
}

/**
 * @typedef {object} Ledger
 * @property {number} days The window, in days.
 * @property {number} conversations Contact recorded, however it got there.
 * @property {number} promisesMade
 * @property {number} promisesKept
 * @property {number} promisesStillOpen Open now, made at any time.
 * @property {number} decisions
 * @property {number} growthNotes Times a growth thread came up.
 * @property {number} growthObserved Times the marker was actually seen.
 * @property {number} skips Meetings booked that did not happen.
 * @property {number} chases Times somebody was chased for an answer.
 * @property {number} journalled Days with an entry.
 */

/**
 * What the store recorded in the same window.
 *
 * Passed to the model as the ground truth beside the prose, for one specific
 * reason: an evening's writing is a memory of a day, and a memory of a month of
 * days is worse. "Every week went into meetings" reads very differently next to
 * four recorded conversations, and only one of the two numbers is checkable.
 *
 * Counts only, and named as counts. See the note at the top of this file about
 * why there is no share-of-week here.
 *
 * @param {object} rows
 * @param {Record<string, any>[]} [rows.touches]
 * @param {Record<string, any>[]} [rows.promises]
 * @param {Record<string, any>[]} [rows.decisions]
 * @param {Record<string, any>[]} [rows.growthNotes]
 * @param {Record<string, any>[]} [rows.skips]
 * @param {Record<string, any>[]} [rows.chases]
 * @param {Record<string, any>[]} [rows.entries]
 * @param {number} now
 * @param {number} days
 * @returns {Ledger}
 */
export function ledger(rows, now, days) {
  const since = now - Math.max(1, days) * DAY_MS;
  const live = (/** @type {Record<string, any>[] | undefined} */ list) =>
    (list ?? []).filter((r) => !r._deleted);
  /**
   * @param {Record<string, any>[] | undefined} list
   * @param {string} field
   */
  const inWindow = (list, field) =>
    live(list).filter((r) => Number(r[field] ?? 0) >= since && Number(r[field] ?? 0) <= now);

  const promises = live(rows.promises);
  const growth = inWindow(rows.growthNotes, "at");
  const entries = inWindow(rows.entries, "at").filter((e) => hasContent(e));

  return {
    days,
    conversations: inWindow(rows.touches, "at").length,
    promisesMade: promises.filter(
      (p) => Number(p.madeAt ?? 0) >= since && Number(p.madeAt ?? 0) <= now
    ).length,
    // Resolved in the window is not recorded separately from resolved at all -
    // the state is a field, not an event with its own date - so this is the
    // honest reading: promises made in the window that are now closed.
    promisesKept: promises.filter(
      (p) =>
        Number(p.madeAt ?? 0) >= since &&
        Number(p.madeAt ?? 0) <= now &&
        String(p.state ?? "open") === "resolved"
    ).length,
    promisesStillOpen: promises.filter((p) => String(p.state ?? "open") === "open").length,
    decisions: inWindow(rows.decisions, "at").length,
    growthNotes: growth.length,
    growthObserved: growth.filter((n) => n.observed === true).length,
    skips: inWindow(rows.skips, "at").length,
    chases: inWindow(rows.chases, "at").length,
    journalled: new Set(
      entries.map((e) => new Date(Number(e.at ?? 0)).toISOString().slice(0, 10))
    ).size
  };
}

/**
 * The ledger as a handful of lines, for a model prompt and for a card.
 *
 * A zero is stated rather than omitted. "No decisions recorded" is one of the
 * more interesting things a month can say, and a list that only shows what
 * happened cannot say it.
 *
 * @param {Ledger} l
 * @returns {string[]}
 */
export function ledgerLines(l) {
  return [
    `Days with an entry: ${l.journalled} of the last ${l.days}.`,
    `Conversations recorded: ${l.conversations}.`,
    `Promises made in the window: ${l.promisesMade}, of which ${l.promisesKept} are now closed.`,
    `Promises open right now, made at any time: ${l.promisesStillOpen}.`,
    `Decisions recorded: ${l.decisions}.`,
    `Growth threads discussed: ${l.growthNotes}, with the marker actually observed ${l.growthObserved} time(s).`,
    `Meetings that did not happen: ${l.skips}.`,
    `Times somebody was chased for an answer: ${l.chases}.`
  ];
}

/**
 * What was declared for the window, so the prose has something to be set beside.
 *
 * A focus is the only place in the app where an intention about where attention
 * WOULD go is written down, which makes it the only thing "where it actually
 * went" can be compared to. Its cost is already measured elsewhere and is passed
 * in rather than recomputed here.
 *
 * Returns null when no focus was in force, and the caller must then leave the
 * comparison out entirely rather than inventing an intention to compare against.
 *
 * @param {import("./focus.js").FocusRow | null} focus
 * @param {number} now
 * @param {number} days
 * @param {string} [costSummary]
 * @returns {{ name: string, budgetOfWeek: number | null, overlapDays: number, cost: string } | null}
 */
export function declared(focus, now, days, costSummary) {
  if (!focus || String(focus.name ?? "").trim() === "") {
    return null;
  }
  const windowStart = now - Math.max(1, days) * DAY_MS;
  const from = Math.max(windowStart, Number(focus.startedAt ?? windowStart));
  const to = Math.min(now, Number(focus.endsAt ?? now));
  const overlapDays = Math.max(0, Math.round((to - from) / DAY_MS));
  if (overlapDays === 0) {
    return null;
  }
  return {
    name: String(focus.name),
    budgetOfWeek: typeof focus.budget === "number" ? focus.budget : null,
    overlapDays,
    cost: costSummary ?? "The cost of this focus was not measured."
  };
}

/**
 * How much has been written that no pass has read.
 *
 * Counted from the last time a pass actually RAN, not from the last one that was
 * kept. Reading a month and deciding it said nothing is a complete act; a nudge
 * that came back the next day to suggest reading what had just been read would
 * be wrong in the way that matters most for a nudge, which is that it teaches you
 * to ignore it.
 *
 * Not windowed. The pass reads the last thirty days, but the question here is
 * whether anything has gone unread at all - three months of entries nobody has
 * looked at is exactly the state worth saying out loud, and a thirty-day window
 * would report it as one month's worth.
 *
 * @param {Record<string, any>[]} entries
 * @param {number | null} lastReadAt When a pass last ran, or null if never.
 * @param {number} now
 * @returns {{ entries: number, spread: number, lastReadAt: number | null, sinceDays: number | null }}
 */
export function unread(entries, lastReadAt, now) {
  const written = entries.filter(
    (e) =>
      !e._deleted &&
      hasContent(e) &&
      Number(e.at ?? 0) <= now &&
      (lastReadAt === null || Number(e.at ?? 0) > lastReadAt)
  );
  const days = new Set(
    written.map((e) => new Date(Number(e.at ?? 0)).toISOString().slice(0, 10))
  );
  return {
    entries: written.length,
    spread: days.size,
    lastReadAt,
    sinceDays: lastReadAt === null ? null : Math.max(0, Math.floor((now - lastReadAt) / DAY_MS))
  };
}

/**
 * How long a gap counts as long.
 *
 * Half again the window the pass reads. A month between readings is the rhythm
 * this is built for - the pass reads thirty days, so running it twice in a week
 * reads almost the same material twice - and six weeks is where a gap stops being
 * the rhythm and starts being a habit that lapsed.
 */
export const LONG_GAP_DAYS = 45;
