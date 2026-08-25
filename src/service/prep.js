/**
 * Prep: one card per person you should actually talk to.
 *
 * Who they are and when you last spoke (here), what you promised them (here),
 * what they own and how long since you checked in (here), what is open in their
 * area (Jot), and the last thing you wrote about them (Nib). Four sources, one
 * card, no new typing.
 *
 * The pain a manager actually has before a conversation is not laziness. It is
 * that the preparation is spread across three windows, so it does not happen.
 *
 * ## Why drift and not the calendar
 *
 * The original idea was a card per meeting tomorrow, which needs a calendar -
 * either a secret iCal feed whose attendee lines are unreliable, or an OAuth app
 * with a consent screen that expires refresh tokens every seven days while it
 * sits in Testing. Both are real work and neither is Tend.
 *
 * Drift is already here. "Who am I behind with" is a question Tend can answer
 * from what it already models, and it is arguably the better question: a meeting
 * that is already booked will happen anyway, whereas the conversation you are
 * quietly six weeks behind on is the one that does not.
 *
 * A calendar becomes an *input* to this view later - a different way of choosing
 * whose cards to show - rather than its precondition. That is what makes it
 * cheap to add: the join is the expensive half and it is done.
 *
 * ## The limit is the feature
 *
 * Six cards, worst drift first. A list of everyone is a roster, and Tend already
 * has one of those. This is meant to be read before a day starts and then be
 * finished, which is the same discipline Brief keeps and for the same reason: a
 * queue nobody reaches the end of is a queue nobody reads the top of either.
 */

import { expandCadences } from "../domain/attention.js";
import { RELATIONS, isRelation } from "../domain/cadence.js";
import { openPromises } from "../domain/promises.js";
import { agoWords, driftBadge, humanDays } from "../domain/time.js";
import { topicsFor } from "../domain/topics.js";
import { LEVELS, isLevel, reviewInterval } from "../domain/workstreams.js";
import { jotDataDir, readBoard, workFor } from "./jot.js";
import { notesIn, principlesInNib, readNibIndex } from "./nib.js";
import { forCard } from "../domain/practices.js";

/** How many cards. Not a page size - a limit. */
export const PREP_CARDS = 6;

/**
 * @param {import("../storage/store.js").TendStore} store
 * @param {number} now
 * @param {object} [where]
 * @param {string} [where.jotDir]
 * @param {string} [where.nibDir]
 */
export function prep(store, now, { jotDir, nibDir } = {}) {
  const state = store.state();
  const people = store.rows("people");
  const cadences = expandCadences(state, now);
  const promises = openPromises(store.rows("promises"), now);
  const touches = store.rows("touches");
  const workstreams = store.rows("workstreams");
  const projects = new Map(store.rows("projects").map((p) => [String(p.id), String(p.name ?? "")]));
  const bindings = store.rows("sources");
  const topicRows = store.rows("topics").filter((t) => (t.status ?? "active") === "active");
  const raised = store.rows("raised");

  const board = readBoard(jotDir ?? jotDataDir());
  const nib = safeNib(nibDir);

  /** @type {any[]} */
  const cards = [];

  for (const person of people) {
    const id = String(person.id);
    const theirs = cadences.filter((c) => c.subject.id === id);

    // The worst-drifting duty decides whether they belong on the page at all,
    // and how far up. Somebody in step needs no preparation from you today.
    const worst = theirs.sort((a, b) => b.drift.driftDays - a.drift.driftDays)[0];
    const drift = worst ? worst.drift.driftDays : 0;
    const theirPromises = promises.filter((x) => x.person === id);

    // Topics are the third reason to be on this page, and the weakest one on
    // purpose. Somebody you owe nothing and are behind on nothing still has
    // standing questions attached to them - your own manager most of all, since
    // no duty covers that direction - and a card that never appears is a
    // feature nobody uses.
    const worthRaising = topicsFor({
      topics: topicRows,
      raised,
      person: {
        id,
        relation: String(person.relation ?? ""),
        since: typeof person.since === "number" ? person.since : undefined
      },
      now
    });

    if (drift <= 0 && theirPromises.length === 0 && worthRaising.length === 0) {
      continue;
    }

    const owned = workstreams.filter((w) => String(w.owner ?? "") === id);
    // Both the project and the workstream's own name.
    //
    // Only projects at first, which missed every case where the workstream is
    // the specific thing and the project is a bucket above it. "Renderingen"
    // owned inside a project called something broader is exactly how people
    // name these, and it produced a card with no open work while the matching
    // Jot category sat right there.
    const areas = owned
      .flatMap((w) => [w.project ? (projects.get(String(w.project)) ?? "") : "", String(w.name ?? "")])
      .filter((name) => name !== "");

    const relation = String(person.relation ?? "");
    const lastTouch = touches
      .filter((t) => t.subject === id)
      .sort((a, b) => Number(b.at ?? 0) - Number(a.at ?? 0))[0];

    cards.push({
      person: String(person.name ?? ""),
      relation: person.relation ?? null,
      relationMeans: isRelation(relation) ? RELATIONS[relation].note : null,

      // Why this card is here at all, in words. Every list in this app says why.
      //
      // Read off what actually put them on the page, not off whichever field
      // happens to be populated: somebody can have a cadence that is perfectly
      // on time and still be here because of a promise, and saying "1-1 is on
      // time" as the reason for their being listed is worse than saying nothing.
      // Words here, the compact badge in `behindBy`. "1-1 is +5d" is a badge
      // wearing a sentence's clothes; a reason is read once and has to parse.
      why: reasonFor({ drift, worst, promises: theirPromises, worthRaising }),
      behindBy: worst ? driftBadge(worst.drift.driftDays) : null,
      lastSpoke:
        lastTouch === undefined
          ? "never"
          : agoWords(Math.max(0, Math.floor((now - Number(lastTouch.at ?? now)) / 86_400_000))),

      youPromised: theirPromises.map((x) => ({
        text: x.text,
        openFor: humanDays(x.status.ageDays),
        urgency: x.status.severity
      })),

      theyOwn: owned.map((w) => {
        const level = String(w.level ?? "");
        const reviewed = touches
          .filter((t) => t.subject === w.id && t.kind === "delegation-review")
          .sort((a, b) => Number(b.at ?? 0) - Number(a.at ?? 0))[0];
        return {
          name: String(w.name ?? ""),
          mandate: isLevel(level) ? LEVELS[level].authority : "nobody has said who decides",
          reviewEvery: `${reviewInterval(w.level)} days`,
          lastReviewed: reviewed
            ? agoWords(Math.max(0, Math.floor((now - Number(reviewed.at)) / 86_400_000)))
            : "never"
        };
      }),

      // null, not [], when Jot could not be read. "Nothing is open" and "I could
      // not find the board" are different facts and the card says which.
      openWork: board === null ? null : workFor({ board, name: String(person.name ?? ""), areas }),

      lastWrote: lastNote(nib, bindings, id),

      // What to actually say, as opposed to whether to speak at all. Never more
      // than three: a card suggesting eight things to raise in half an hour is
      // a card read as decoration.
      worthRaising: worthRaising.map((t) => ({
        id: t.id,
        text: t.text,
        why: t.why,
        lastRaised: t.everRaised ? agoWords(t.daysSince) : "never"
      })),

      driftDays: drift
    });
  }

  cards.sort((a, b) => b.driftDays - a.driftDays);

  return {
    cards: cards.slice(0, PREP_CARDS),
    dropped: Math.max(0, cards.length - PREP_CARDS),
    jotFound: board !== null,
    nibFound: nib !== null,
    // Once for the page rather than once per card. These are about him, not
    // about a person, so repeating them beside every name is the wallpaper
    // failure this view is otherwise careful to avoid.
    practising: practising(nibDir)
  };
}

/**
 * The principles he is working on, and anything he said he would do about one.
 *
 * Read from Nib on every call rather than copied into Tend. He raises and lowers
 * the flag over there, and a copy here would be a second answer to the question
 * "what am I practising" that could disagree with the first.
 *
 * The reason is carried when it cannot be read, because "nothing is flagged" and
 * "the notebook could not be opened" look identical as an empty block, and only
 * one of them is something to act on.
 *
 * @param {string} [dir]
 */
function practising(dir) {
  let found;
  try {
    found = principlesInNib(dir);
  } catch (error) {
    return { available: false, why: error instanceof Error ? error.message : String(error) };
  }
  if (!found.available) {
    return { available: false, why: found.why };
  }
  const card = forCard(found.practices);
  return {
    available: true,
    active: card.shown,
    more: card.more,
    tooMany: card.note,
    // Sorted oldest first by the domain, so the one that has been waiting
    // longest is the one on top.
    actionPoints: found.actionPoints.map((a) => ({
      id: a.id,
      note: a.note,
      noteTitle: a.noteTitle,
      text: a.text
    }))
  };
}

/**
 * Why this person is on the page, in words.
 *
 * Read off what actually put them here rather than off whichever field happens
 * to be populated. Somebody can be perfectly in step and still be listed
 * because of a promise, and naming the cadence as the reason would be worse
 * than saying nothing at all.
 *
 * @param {object} args
 * @param {number} args.drift
 * @param {any} args.worst
 * @param {any[]} args.promises
 * @param {any[]} args.worthRaising
 * @returns {string}
 */
function reasonFor({ drift, worst, promises, worthRaising }) {
  if (drift > 0 && worst) {
    return `${worst.duty.name} is ${humanDays(worst.drift.driftDays)} behind`;
  }
  if (promises.length > 0) {
    return `${promises.length} open promise${promises.length === 1 ? "" : "s"}`;
  }
  return `${worthRaising.length} topic${worthRaising.length === 1 ? "" : "s"} worth raising`;
}

/**
 * Nib's index, or null.
 *
 * `readNibIndex` returns a discriminated union rather than throwing, so the
 * `available` flag is the thing to read - checking for a categories array
 * happens to work and stops being true the moment that shape changes.
 *
 * @param {string} [dir]
 * @returns {{ categories: any[] } | null}
 */
function safeNib(dir) {
  try {
    const index = readNibIndex(dir);
    return index.available ? { categories: index.categories } : null;
  } catch {
    return null;
  }
}

/**
 * The most recent note in any Nib folder bound to this person.
 *
 * The title and the date only. What you wrote is in Nib, and copying prose in
 * here would be a second place for it to go stale - the card's job is to remind
 * you that it exists and roughly when.
 *
 * @param {any} nib
 * @param {any[]} bindings
 * @param {string} personId
 */
function lastNote(nib, bindings, personId) {
  if (nib === null) {
    return null;
  }
  const theirs = bindings.filter((b) => String(b.person ?? "") === personId);
  /** @type {any} */
  let newest = null;
  for (const binding of theirs) {
    for (const note of notesIn(nib.categories, String(binding.categoryId), binding.subId ?? null)) {
      if (newest === null || note.edited > newest.edited) {
        newest = note;
      }
    }
  }
  if (newest === null) {
    return null;
  }
  // The id as well as the title: it is what a model pass over the note's own
  // text needs, and it is the only handle on a note that Tend ever holds.
  return { id: newest.id, title: newest.title, edited: newest.edited };
}
