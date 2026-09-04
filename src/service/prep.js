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
import { isArchived } from "../domain/archive.js";
import { RELATIONS, SEVERITY_ORDER, isRelation } from "../domain/cadence.js";
import { openPromises } from "../domain/promises.js";
import { boundPeople } from "../domain/sources.js";
import { agoWords, daysSince, driftBadge, humanDays } from "../domain/time.js";
import { threadsFor } from "../domain/growth.js";
import { topicsFor } from "../domain/topics.js";
import { LEVELS, isLevel, reviewInterval } from "../domain/workstreams.js";
import { jotDataDir, readBoard, workFor } from "./jot.js";
import { noteBody, notesIn, principlesInNib, readNibIndex } from "./nib.js";
import { unaskedQuestions } from "../domain/unasked.js";
import { forCard } from "../domain/practices.js";

/**
 * The worst severity on one card, across everything that could have put it
 * there.
 *
 * "ok" when nothing is pressing, which is a real answer rather than a missing
 * one: a card earned by a standing question or a growth thread has nothing late
 * on it, and saying so plainly is the point of a page ordered worst first.
 *
 * @param {any} worstCadence The worst-drifting cadence, or undefined.
 * @param {any[]} promises Their open promises, each carrying a status.
 * @returns {string}
 */
function worstSeverity(worstCadence, promises) {
  const all = [
    worstCadence ? String(worstCadence.drift.severity) : "ok",
    ...promises.map((p) => String(p.status?.severity ?? "ok"))
  ];
  // Cast because the values arrive as strings off rows the reducer typed loosely;
  // anything unrecognised sorts to -1 and therefore loses, which is the safe way
  // round: an unknown severity cannot promote a card to critical.
  const rank = (/** @type {string} */ one) =>
    SEVERITY_ORDER.indexOf(/** @type {any} */ (one));
  return all.reduce((worst, one) => (rank(one) > rank(worst) ? one : worst), "ok");
}

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
  const growthRows = store.rows("growth");
  const growthNotes = store.rows("growthNotes");

  const board = readBoard(jotDir ?? jotDataDir());
  const nib = safeNib(nibDir);

  /** @type {any[]} */
  const cards = [];

  for (const person of people) {
    // Archived is checked explicitly rather than relied on to fall out through
    // drift, because drift only happens to read as zero when nothing crossed
    // this person - an archived person with an old open promise would
    // otherwise still earn a card, which is exactly the clutter archiving is
    // for.
    if (isArchived(person)) {
      continue;
    }
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

    // Growth threads are the fourth reason to be on this page, and they earn it
    // the same way topics do: a thread that is asking something is asking it
    // about a conversation with this person, and the moment before that
    // conversation is the only moment the answer is actionable.
    //
    // Deliberately NOT in Now. Nobody is let down today because a direction
    // stood still for a month - the person let down by a broken promise is let
    // down today - and a Now page that shouts about development is a page that
    // gets skimmed, which would cost far more than this gains. But a thread
    // whose person never drifts would then never surface anywhere, so it is
    // allowed to put somebody on this page on its own.
    const growing = threadsFor({
      growth: /** @type {any[]} */ (growthRows),
      notes: /** @type {any[]} */ (growthNotes),
      person: { id, since: typeof person.since === "number" ? person.since : undefined },
      now
    }).filter((t) => t.asks !== null || t.attention !== "ok");

    /*
     * The questions he did not ask last time.
     *
     * Read here rather than after the gate below, because they are one of the
     * reasons to be on this page rather than a decoration on a card that
     * already exists. That is what generalises Inför past the 1-1: a
     * stakeholder and his own manager have no duty behind them and never
     * drift, so before this they could only earn a card through role-map
     * topics - and there are none, on anybody.
     */
    const written = lastNote(nib, bindings, id);
    const toFindOut =
      written === null || nibDir === undefined
        ? readUnasked(written, undefined)
        : readUnasked(written, nibDir);

    if (
      drift <= 0 &&
      theirPromises.length === 0 &&
      worthRaising.length === 0 &&
      growing.length === 0 &&
      toFindOut.length === 0
    ) {
      continue;
    }

    const owned = workstreams.filter((w) => String(w.owner ?? "") === id && !isArchived(w));
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
      why: reasonFor({ drift, worst, promises: theirPromises, worthRaising, growing }),
      behindBy: worst ? driftBadge(worst.drift.driftDays) : null,

      // How bad it is, for the card's own severity stripe. The stylesheet has
      // styled `.card.sev-*` since long before this page existed and this page
      // never set it, so every card on a worst-first list looked equally
      // urgent - which is the one thing a worst-first list must not do.
      //
      // The worst thing on the card rather than the worst cadence. Somebody
      // with every cadence on time and a promise two weeks old is here BECAUSE
      // of the promise, and a stripe reading the cadences alone would paint that
      // card calm.
      urgency: worstSeverity(worst, theirPromises),
      lastSpoke:
        lastTouch === undefined
          ? "aldrig"
          : agoWords((daysSince(lastTouch.at, now) ?? 0)),

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
          mandate: isLevel(level) ? LEVELS[level].authority : "ingen har sagt vem som bestämmer",
          reviewEvery: `${reviewInterval(w.level)} dagar`,
          lastReviewed: reviewed
            ? agoWords(daysSince(reviewed.at, now) ?? 0)
            : "aldrig"
        };
      }),

      // null, not [], when Jot could not be read. "Nothing is open" and "I could
      // not find the board" are different facts and the card says which.
      openWork: board === null ? null : workFor({ board, name: String(person.name ?? ""), areas }),

      lastWrote: written,
      /*
       * Already written down at the end of the last conversation, and until
       * now nothing read it. Capped at six: this is preparation to glance at
       * on the way to a room, and a list of fourteen is one he will skip
       * entirely.
       */
      toFindOut: toFindOut.slice(0, 6),
      toFindOutMore: Math.max(0, toFindOut.length - 6),

      // What to actually say, as opposed to whether to speak at all. Never more
      // than three: a card suggesting eight things to raise in half an hour is
      // a card read as decoration.
      worthRaising: worthRaising.map((t) => ({
        id: t.id,
        text: t.text,
        why: t.why,
        lastRaised: t.everRaised ? agoWords(t.daysSince) : "aldrig"
      })),

      // The direction, and whether it is moving. Two counts rather than one:
      // "discussed six times, seen never" is the whole reading, and either
      // number on its own says nothing.
      growing: growing.map((t) => ({
        id: t.id,
        aim: t.aim,
        marker: t.marker,
        asks: t.asks,
        // Carried so the card can offer the action that is actually next. Before
        // the direction has been put to the person, logging "it came up" is the
        // wrong move: what the conversation produces has nowhere to go.
        stance: t.stance,
        talks: t.talks,
        observations: t.observations,
        lastTalked: t.lastTalked === null ? "aldrig" : agoWords(t.daysSinceTalked),
        // Carried only to answer the stall question, which asks whether the aim
        // is wrong OR the support is missing. Half of that is a judgement nobody
        // can make for him; the other half is a thing he wrote down, and the
        // card was asking the question without showing the answer.
        stalled: t.stalled,
        offering: t.offering
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
 * @param {any[]} [args.growing]
 * @returns {string}
 */
function reasonFor({ drift, worst, promises, worthRaising, growing = [] }) {
  if (drift > 0 && worst) {
    return `${worst.duty.name} är ${humanDays(worst.drift.driftDays)} efter`;
  }
  if (promises.length > 0) {
    return `${promises.length} ${promises.length === 1 ? "öppet löfte" : "öppna löften"}`;
  }
  // Ahead of topics, because a thread asking a question is asking one specific
  // thing, and "3 topics worth raising" is a count. A named question is the more
  // useful reason to be looking at somebody's card.
  const asking = growing.find((/** @type {any} */ t) => t.asks !== null);
  if (asking) {
    return asking.asks;
  }
  if (growing.length > 0) {
    return growing.length === 1
      ? "1 riktning inte diskuterad på ett tag"
      : `${growing.length} riktningar inte diskuterade på ett tag`;
  }
  return worthRaising.length === 1
    ? "1 ämne värt att ta upp"
    : `${worthRaising.length} ämnen värda att ta upp`;
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
 * The unasked questions in one note, or none.
 *
 * Only the newest note, because "the questions he did not ask last time" is
 * about last time. Reading every note would produce a standing list of
 * everything he has ever failed to ask, which is a different and much less
 * useful thing - and it would grow forever.
 *
 * Empty on a read failure as well as on a note with no such section, which is
 * the one place this departs from the null-versus-empty rule elsewhere in the
 * app: both mean "nothing to show" and neither has an action attached, so a
 * third state would be a branch nothing exercises. `lastWrote` already tells
 * the window whether there is a note at all.
 *
 * @param {{ id: string } | null} written
 * @param {string} [dir]
 * @returns {string[]}
 */
function readUnasked(written, dir) {
  if (written === null) {
    return [];
  }
  try {
    const body = noteBody(String(written.id), dir);
    /*
     * `noteBody` answers `{ available, text | why }` rather than a string, and
     * an unavailable note is not an empty one. The distinction does not reach
     * the window here - see the note above on why - but it has to be read
     * correctly, because `String(undefined)` would have put the word
     * "undefined" through the question parser.
     */
    return body.available === true ? unaskedQuestions(body.text) : [];
  } catch {
    return [];
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
  // Through `boundPeople`, because a binding may name several. A folder of
  // shared meeting notes is as much theirs as a folder of their own 1-1s, and
  // reading the field directly would silently stop finding either the moment a
  // binding was written in the newer shape.
  const theirs = bindings.filter((b) => boundPeople(b).includes(personId));
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
