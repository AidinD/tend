/**
 * Reading one plain sentence into a proposal.
 *
 * ## The fault this exists to fix
 *
 * His own words, 2026-09-17: "jag drar mig lite från att använda det manuellt
 * för att jag inte riktigt förstår och vet vad som ska in vart och hur." He
 * built the app and still navigates it by asking. The questions from one session
 * were all about entry: "var lägger jag in det?", "vad lägger jag in på de andra
 * fälten?", "ska jag tagga den casual eller lämna den otaggad?", "ska den loggas
 * någon mer stans? eller en observation?"
 *
 * The vocabulary is not the fault and must not be collapsed to fix this. The
 * sideways duty exists because nothing in a calendar forces contact with peers,
 * and a second-hand report must never reset the 1-1 cadence - see
 * `domain/contact.js`, which is the file that would have to be wrong for the
 * easy fix to be right. Promise, commitment and duty mean different things on
 * purpose too.
 *
 * The fault is WHERE the precision is exposed. Eight contact kinds meet him in
 * the moment of entry, which is the store's precision presented as the user's
 * choice. So: he writes what happened, and the kind, the day and the routing are
 * DERIVED. This module is the derivation.
 *
 * ## What an adversarial pass did to the first version of this file
 *
 * It broke it, comprehensively, on ordinary Swedish rather than on corner cases,
 * and the lesson is worth more than the list. The first version's header claimed
 * the cue lists were "high precision, low recall". They were not, and nothing
 * checked the claim - the tests were written from the same head as the cues, so
 * they asserted the sentences that head had already thought of.
 *
 * What it found, all of it reproduced before anything was changed:
 *
 * - `\b1[-:\s]?1\b` matched the bare number **11**. "kl 11:15 med Nina i
 *   korridoren" read as the recurring 1-1. So did any sentence carrying an ISO
 *   date in September 2026.
 * - `\benligt\b` is ordinary Swedish, not a report. "vårt 1-1 med Nina igår,
 *   allt går enligt plan" read as second-hand: the 1-1 clock stayed behind AND
 *   the blind-spot signal went quiet for somebody he had just sat down with.
 * - `granskade` and `påtalade` carry no subject. "Nina granskade min kod" read
 *   as HIM observing HER work, with the direction reversed.
 * - The name scan took the first prose word that was a PREFIX of anybody on the
 *   roster, minimum two characters. With a Viktor on the roster, "**vi** hade
 *   vårt 1-1 med Nina" filed against Viktor. Same shape for om/Omar, han/Hanna,
 *   till/Tilde, tar/Tara.
 * - "hörde från Tova att Nina är frustrerad" filed the second-hand touch against
 *   **Tova** - the one person in the sentence he actually spoke to - leaving
 *   Nina's blind spot open and resetting Tova's clock instead.
 *
 * Every one of those produced a `settled` reading, which in the first design
 * meant a confirmation with no fields on it and an Enter key. That combination
 * is what made them dangerous rather than merely annoying, and it is why the
 * dialog changed too; see `renderer/capture.js`.
 *
 * ## Refuse rather than guess, and this time it is enforced
 *
 * `domain/parse.js` already runs on that rule and it is more load-bearing here.
 * A guess that names the wrong colleague shows up the moment it is read back; a
 * guess between `one-to-one` and `casual` does not, because it resets a cadence
 * that then reads green for a fortnight.
 *
 * Three rules carry it now, and each exists because something got through:
 *
 * 1. **A cue must name the occasion** - not a topic, and not a word that merely
 *    appears in the sentence. Anything that could be about a third party, or
 *    that reads as ordinary prose, was deleted rather than narrowed.
 * 2. **A name must match in FULL, never as a prefix.** Prefixes are right for
 *    the palette, where somebody is typing a name on purpose; they are wrong for
 *    scanning prose, where every short function word becomes a candidate.
 * 3. **Two people named means no person derived.** One is a sentence about
 *    somebody; two is a sentence whose subject only he knows.
 *
 * There is no cue for a bare "pratade med", and there never will be: that
 * sentence is honestly both the recurring 1-1 and two minutes by the coffee
 * machine, and those two are the pair the whole drift model rests on.
 *
 * ## Everything derived carries the words that derived it
 *
 * Each field comes back with the fragment that produced it, so the dialog can
 * show its evidence instead of asserting a conclusion. "Läst ur 'i fredags'" is
 * checkable at a glance; "12 september" is a conclusion he would have to
 * re-derive in his head, which is the work this was supposed to remove.
 *
 * That applies to the PERSON too. The first version computed `personFrom` and
 * then never displayed it, which is precisely why the two worst breaks above
 * were invisible on screen: it said "Om vem: Viktor", not `Läst ur "vi"`.
 */

import { DAY_MS, middayOn } from "./time.js";

/**
 * @typedef {{ id: string, name: string }} Named
 */

/**
 * @typedef {object} Derived
 * @property {string} value What was read.
 * @property {string} from The words in his sentence that produced it.
 */

/**
 * The cues for each contact kind, in the order they are tried.
 *
 * ## The order is evidence strength, not taxonomy
 *
 * A word naming WHERE a conversation happened beats a word naming what it was
 * ABOUT. "pratade med Nina i korridoren om planeringen inför hösten" is a
 * corridor chat that touched on planning, and the first version read it as a
 * meeting because `meeting` was tried first and "planeringen" was on its list.
 * So `casual` and `one-to-one` both come before `meeting` now, and "planeringen"
 * and "demo" are gone from it - they name subjects, not occasions.
 *
 * ## What was deleted outright, and why narrowing was not enough
 *
 * **`feedback` and `observation` have no cues at all any more.** Every phrasing
 * that suggests them - "granskade", "påtalade", "sa till hen", "såg hens
 * arbete" - is equally true with the colleague as the subject. "Nina granskade
 * min kod" and "jag granskade Ninas kod" differ by word order alone, and a regex
 * that gets that wrong records him observing her work when she reviewed his.
 * There is no narrowing that supplies a missing subject, so both kinds are now
 * only ever chosen from the list.
 *
 * **`enligt` and `hörde av`** left `second-hand` for the same class of reason:
 * "allt går enligt plan" is not a report about anybody, and "jag hörde av mig
 * till Nina" is him making contact rather than hearing about her.
 *
 * @type {{ kind: string, cues: RegExp[] }[]}
 */
const KIND_CUES = [
  {
    kind: "second-hand",
    cues: [
      /\bhörde (?:att|från|om)\b/i,
      /\bfick höra\b/i,
      /\bandrahandsuppgift/i,
      /\bi andra hand\b/i
    ]
  },
  {
    kind: "casual",
    cues: [
      /\bi förbifarten\b/i,
      /\bi korridoren\b/i,
      /\bvid kaffe(?:maskinen|t)\b/i,
      /\bi fikarummet\b/i,
      /\bstämde av snabbt\b/i,
      /\bsmåprata/i
    ]
  },
  {
    kind: "one-to-one",
    cues: [
      /*
       * `1-1` and `1:1` only. The first version allowed an optional SPACE
       * between the digits, which made the pattern match a bare "11" - so both
       * "kl 11:15" and the date "2026-09-11" read as the recurring conversation.
       */
      /\b1[-:]1\b/,
      /\bone[-\s]?to[-\s]?one\b/i,
      /\bvårt (?:återkommande )?samtal\b/i,
      /\bveckosamtal(?:et)?\b/i,
      /\bpratade enskilt\b/i
    ]
  },
  {
    kind: "meeting",
    cues: [/\bmöte[nt]?\b/i, /\bstand-?up\b/i, /\bretro[n]?\b/i, /\bworkshop(?:en)?\b/i]
  },
  {
    kind: "sideways",
    cues: [/\bsidledes\b/i, /\bmotsvarande ledare\b/i, /\bkollega på samma nivå\b/i]
  }
];

/**
 * Cues that a commitment of HIS OWN is in the sentence.
 *
 * First person, not negated, and not under a conditional. Each of those three is
 * a separate thing that got through the first version:
 *
 * - "Nina ska kolla på det" is a note about Nina. Filed as a promise it becomes
 *   a debt in his ledger that ages, turns red and is read back to him as a
 *   failure he never incurred.
 * - "jag tar inte det här, Nina äger det" is the opposite of a commitment.
 * - "Om jag ska vara ärlig, hen verkade less" is filler. The lookbehind for
 *   om/att/när/ifall is what keeps it out.
 */
const PROMISE_CUES = [
  /(?<!\b(?:om|att|när|ifall) )\bjag (?:ska|skall|lovade|lovar) (?!inte\b)/i,
  /(?<!\b(?:om|att|när|ifall) )\bjag (?:tar|fixar|ordnar|återkommer) (?!inte\b)/i,
  /\bjag hör av mig\b/i
];

/** The weekday names, Monday first, as the "i ...s" form names them. */
const WEEKDAYS = ["måndags", "tisdags", "onsdags", "torsdags", "fredags", "lördags", "söndags"];

/**
 * Midday on the day `offset` days before `now`, in LOCAL time.
 *
 * Two things are going on and both are load-bearing.
 *
 * It goes through `middayOn` rather than returning the subtracted instant,
 * because subtracting a day across a daylight-saving change lands on 23:00 the
 * evening before and the date is then out by one. Every dated row in the app is
 * stored at midday for that reason.
 *
 * And the day is read off LOCAL components, not `toISOString`. The first version
 * used the ISO string, which is UTC, and that is wrong here in the way that
 * cannot be seen from a desk in the afternoon: at 00:30 in Stockholm the UTC
 * date is still yesterday, so "idag" resolved to yesterday and the contact went
 * in a day early with nothing failing. Writing the day up late in the evening is
 * exactly when somebody types into a box that takes plain words. West of
 * Greenwich it failed the other way and worse - at 18:00 in San Francisco the
 * UTC date is already tomorrow, so `logTouch` refused every capture with "den
 * dagen har inte kommit än" and a derived date left nothing to click past it.
 *
 * Local is also what the rest of the app means by a day - `asDateInput` reads
 * local components, `middayOn` parses at local midday, and `isLaterDay` says out
 * loud that the question is about the user's day and there is one user in one
 * place.
 *
 * @param {number} now
 * @param {number} offset
 * @returns {number}
 */
function daysBack(now, offset) {
  const at = new Date(now - offset * DAY_MS);
  const pad = (/** @type {number} */ n) => String(n).padStart(2, "0");
  const day = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  return middayOn(day) ?? now;
}

/**
 * The day his sentence names, or null when it names none.
 *
 * Null and not "today" on purpose. A sentence with no day word was almost
 * certainly written about today, but "almost certainly" is the caller's
 * inference to make and state, not something to bury here - the dialog says
 * "idag" either way, and only one of those two has evidence behind it.
 *
 * @param {string} text
 * @param {number} now
 * @returns {Derived | null}
 */
export function readDay(text, now) {
  const said = String(text ?? "");

  const plain = [
    { cue: /\b(i ?dag)\b/i, back: 0 },
    { cue: /\b(i ?går)\b/i, back: 1 },
    { cue: /\b(i ?förrgår)\b/i, back: 2 }
  ];
  for (const { cue, back } of plain) {
    const hit = cue.exec(said);
    if (hit) {
      return { value: String(daysBack(now, back)), from: hit[1] };
    }
  }

  // "i fredags" - the most recent one that has already happened. A Friday said
  // on a Friday means a week ago, not today: "i fredags" is never the day you
  // are standing in.
  const weekday = /\bi (måndags|tisdags|onsdags|torsdags|fredags|lördags|söndags)\b/i.exec(said);
  if (weekday) {
    const wanted = WEEKDAYS.indexOf(weekday[1].toLowerCase());
    const here = new Date(now);
    // getDay() is Sunday-first; WEEKDAYS is Monday-first. Local on both sides,
    // matching daysBack - the first version read the weekday locally and then
    // formatted the answer in UTC, so the two disagreed either side of midnight.
    const today = (here.getDay() + 6) % 7;
    const back = ((today - wanted + 7) % 7) || 7;
    return { value: String(daysBack(now, back)), from: weekday[0] };
  }

  const iso = /\b(\d{4}-\d{2}-\d{2})\b/.exec(said);
  if (iso) {
    const at = middayOn(iso[1]);
    return at === null ? null : { value: String(at), from: iso[1] };
  }

  return null;
}

/**
 * The contact kind his sentence evidences, or null when nothing fires.
 *
 * @param {string} text
 * @returns {Derived | null}
 */
export function readKind(text) {
  const said = String(text ?? "");
  for (const { kind, cues } of KIND_CUES) {
    for (const cue of cues) {
      const hit = cue.exec(said);
      if (hit) {
        return { value: kind, from: hit[0].trim() };
      }
    }
  }
  return null;
}

/**
 * The clause in which he committed to something, or null.
 *
 * Returned as the clause rather than the whole sentence, and the clause ENDS at
 * the next comma as well as at a full stop. The first version only looked
 * leftwards for a comma, so a sentence opening with the commitment - "jag ska
 * kolla på bygget, Nina var less på hela releasen" - produced a promise whose
 * text was the entire note. That is verbatim the failure this function's own
 * comment claimed to prevent, and it went into an append-only log.
 *
 * @param {string} text
 * @returns {Derived | null}
 */
export function readPromise(text) {
  const said = String(text ?? "");
  for (const cue of PROMISE_CUES) {
    const hit = cue.exec(said);
    if (!hit) {
      continue;
    }
    const from = said.lastIndexOf(",", hit.index) + 1;
    const stops = [",", ".", ";", "\n"]
      .map((mark) => said.indexOf(mark, hit.index))
      .filter((i) => i >= 0);
    const to = stops.length === 0 ? said.length : Math.min(...stops);
    const clause = said.slice(from, to).trim();
    return clause === "" ? null : { value: clause, from: hit[0].trim() };
  }
  return null;
}

/**
 * The one person the sentence is about, or null.
 *
 * ## Full matches only, never prefixes
 *
 * `parse.js` matches a name by prefix, which is right where it is used: somebody
 * typing into the palette is aiming at a row and wants to stop typing early.
 * Here the candidates come out of ordinary prose, where every short word is a
 * candidate, and a two-character floor turned "vi", "om", "han" and "tar" into
 * names. So a run must equal a whole name, or one whole part of one.
 *
 * ## Two people named means nobody derived
 *
 * "hörde från Tova att Nina är frustrerad" is the canonical second-hand
 * sentence, and first-match-wins filed it against Tova - the one person he
 * demonstrably DID speak to - leaving Nina's blind spot open. Nothing in the
 * words says which of the two the row is about; that is his to say. Same for
 * "mötet med Nina och Tova", where the honest answer is that a meeting is
 * contact with everybody in it and this flow records one subject.
 *
 * ## Genitives
 *
 * "granskade Ninas PR" named nobody, and the genitive is exactly how a sentence
 * about somebody's work gets written. A trailing "s" is stripped only when the
 * unstripped form matched nobody, so a colleague actually called Hans is found
 * before "hans" is tried as a genitive of "Han".
 *
 * @param {Named[]} roster
 * @param {string} said
 * @returns {{ person: Named, from: string } | null}
 */
export function readPerson(roster, said) {
  const words = String(said ?? "")
    .split(/[^\p{L}\p{N}-]+/u)
    .filter((w) => w !== "");

  /** @type {string[]} */
  const runs = [];
  for (let width = 3; width >= 1; width -= 1) {
    for (let i = 0; i + width <= words.length; i += 1) {
      runs.push(words.slice(i, i + width).join(" "));
    }
  }

  /** @param {string} run */
  const whole = (run) => {
    const needle = run.toLowerCase();
    return (Array.isArray(roster) ? roster : []).filter((p) => {
      const name = String(p?.name ?? "").toLowerCase();
      return name === needle || name.split(/\s+/).includes(needle);
    });
  };

  /** @type {Map<string, { person: Named, from: string }>} */
  const found = new Map();
  for (const run of runs) {
    for (const person of whole(run)) {
      if (!found.has(person.id)) {
        found.set(person.id, { person, from: run });
      }
    }
  }

  // Genitives, and only when nothing matched plainly.
  if (found.size === 0) {
    for (const run of runs) {
      if (run.length < 4 || !/s$/i.test(run)) {
        continue;
      }
      for (const person of whole(run.slice(0, -1))) {
        if (!found.has(person.id)) {
          found.set(person.id, { person, from: run });
        }
      }
    }
  }

  return found.size === 1 ? [...found.values()][0] : null;
}

/**
 * @typedef {object} Reading
 * @property {Named | null} person Who it is about, when exactly one was named.
 * @property {string | null} personFrom The words that named them. SHOWN, always.
 * @property {Derived | null} day
 * @property {Derived | null} kind
 * @property {Derived | null} promise
 * @property {string} note The sentence, unchanged.
 * @property {boolean} settled Whether anything is left unanswered.
 */

/**
 * Read a whole sentence.
 *
 * `settled` is true only when the person AND the kind both came out of the text.
 * Everything else has a defensible default - no day word means today, no promise
 * cue means no promise - and both are stated where he can see them. A missing
 * KIND has no defensible default, which is the entire argument of this file.
 *
 * It no longer decides whether anything is EDITABLE, only what the dialog says
 * about itself. Letting it decide that was the first version's mistake: a
 * settled reading rendered as uncorrectable facts, so every break listed in the
 * header met a screen with nothing to click and an Enter key.
 *
 * @param {string} text
 * @param {Named[]} roster
 * @param {number} now
 * @returns {Reading}
 */
export function read(text, roster, now) {
  const said = String(text ?? "").trim();
  const who = readPerson(roster, said);
  const kind = readKind(said);

  return {
    person: who?.person ?? null,
    personFrom: who?.from ?? null,
    day: readDay(said, now),
    kind,
    promise: readPromise(said),
    note: said,
    settled: who !== null && kind !== null
  };
}
