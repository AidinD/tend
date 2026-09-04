/**
 * What each half of the app consists of.
 *
 * ## Why this file exists rather than a check in each place
 *
 * The private half started as three things hidden in the rail, and that was not
 * a half - it was a work app with some buttons taken away. Everything behind
 * those buttons was still reachable: the palette offered every view including
 * the hidden ones, "Add someone" asked which of six management relationships
 * this person was, and navigating to a view that did not exist here fell back to
 * the one view the whole arrangement exists to keep away from private data.
 *
 * The deeper problem was that the list of what belongs in the private half was a
 * hand-written array in the renderer. This project has been bitten four times by
 * a second copy of a derived list - a relationship type that existed and was
 * unpickable, a roster group that hid everybody with one relationship, a
 * dropdown missing an option the service accepted. A fifth copy was not going to
 * end differently.
 *
 * So there is one declaration, here, and everything else derives from it: the
 * rail, the palette, what a person may be, and what the service will accept.
 *
 * ## The rule for what belongs in a half
 *
 * A thing belongs in the private half if it still means something there.
 *
 * Drift does not. Contact with somebody you live with is continuous, so a
 * cadence over it reads as permanently fine and says nothing - and "you have not
 * spoken to them in three days" about a person in the next room is worse than
 * useless. Everything built on drift goes with it: prep, duties, the role map, a
 * focus budget, the ledger of organisational decisions.
 *
 * A promise does. "I said I would sort out the bike" is exactly as owed as
 * anything at work, and the person let down is let down in the same way. So
 * promises transfer, and so does the journal, which was the reason for the half
 * in the first place.
 *
 * ## Why the private relationships carry nothing
 *
 * They are labels. They group a list once there are ten names in it and they say
 * who somebody is on their own page, and that is all they do - no duty, no
 * cadence, no expectation derived from them. That is deliberate and worth being
 * explicit about: the work half's relationship types are the input to what you
 * owe somebody, and reusing that idea here would end with the app telling
 * somebody what they owe their own family on a schedule.
 *
 * Nothing here touches the store.
 */

import { RELATIONS } from "./cadence.js";

/** @typedef {"work" | "private"} Half */

/**
 * Who somebody is, in the private half.
 *
 * Descriptive and deliberately shallow. The set is short because a long one
 * turns naming a person into a taxonomy exercise at the moment you are trying to
 * write down that you snapped at them.
 *
 * Same three strings as the work relationships - `label` names it, `note` sits
 * on their page, `choice` reads in a dropdown - so one renderer draws either
 * half without knowing which it has.
 */
export const PRIVATE_RELATIONS = /** @type {const} */ ({
  partner: {
    label: "Partner",
    note: "Relationen de andra är ordnade omkring.",
    choice: "Partner"
  },
  child: {
    label: "Barn",
    note: "Ditt eget. Den enda relationen där asymmetrin är själva poängen.",
    choice: "Barn"
  },
  /*
   * A partner's child, whether or not you live together.
   *
   * Added because the first version of this list had no honest answer for it, and
   * the two it forced were both wrong: "Child" claims a parenthood that is not
   * yours, and "Wider family" claims a gathering relationship when the real one
   * is closer than that. The fallback was "Someone else", which is accurate and
   * says nothing.
   *
   * Not called a stepchild. That word carries a formal standing this may not
   * have, and the whole difficulty of the relationship is that the involvement is
   * real and the standing is not.
   *
   * "Bonusbarn" is the same refusal in Swedish and for the same reason: it is
   * the word that makes the arrangement sound settled. "Partnerns barn" says
   * only what is true, which is the whole point of the entry.
   */
  "partners-child": {
    label: "Partnerns barn",
    note:
      "I ditt liv genom din partner snarare än genom att vara hens förälder. Verkligt engagemang, " +
      "ingen ställning, och villkoren är inte dina att sätta.",
    choice: "Partnerns barn - i ditt liv genom din partner"
  },
  parent: {
    label: "Förälder",
    note: "Din egen. Relationen som mest sannolikt går på antaganden från tjugo år tillbaka.",
    choice: "Förälder"
  },
  sibling: {
    label: "Syskon",
    note: "Där kontakt är ett val snarare än en självklarhet.",
    choice: "Syskon"
  },
  family: {
    label: "Släkt",
    note: "Svärföräldrar, kusiner, de man ses med på kalas.",
    choice: "Släkt - svärföräldrar, kusiner, de man ses med på kalas"
  },
  "close-friend": {
    label: "Nära vän",
    note: "De få du faktiskt skulle ringa.",
    choice: "Nära vän - de få du faktiskt skulle ringa"
  },
  friend: {
    label: "Vän",
    note: "På riktigt, men inte en av de få.",
    choice: "Vän"
  },
  other: {
    label: "Någon annan",
    note: "Utanför jobbet och ingen av ovanstående.",
    choice: "Någon annan - utanför jobbet och ingen av ovanstående"
  }
});

/**
 * The relationship vocabulary of one half.
 *
 * @param {string} half
 * @returns {Record<string, { label: string, note: string, choice: string }>}
 */
export function relationsIn(half) {
  return half === "private"
    ? /** @type {any} */ (PRIVATE_RELATIONS)
    : /** @type {any} */ (RELATIONS);
}

/**
 * Is this a relationship the given half recognises?
 *
 * Per half, not against the union of both. A store only ever holds one half's
 * people, so accepting the other half's vocabulary would let a row exist that
 * every screen and every grouping treats as unknown - present in the data and
 * absent from the page, which is the exact failure the roster groups were fixed
 * for once already.
 *
 * @param {string} half
 * @param {string} relation
 * @returns {boolean}
 */
export function isRelationIn(half, relation) {
  return Object.prototype.hasOwnProperty.call(relationsIn(half), relation);
}

/**
 * The vocabulary as a list, in declaration order.
 *
 * @param {string} half
 * @returns {{ value: string, label: string, note: string, choice: string }[]}
 */
export function relationOptionsIn(half) {
  return Object.entries(relationsIn(half)).map(([value, r]) => ({
    value,
    label: r.label,
    note: r.note,
    choice: r.choice
  }));
}

/**
 * What a new person defaults to.
 *
 * The most common case in each half, so the usual answer is already selected.
 *
 * @param {string} half
 * @returns {string}
 */
export function defaultRelationIn(half) {
  return half === "private" ? "family" : "lead-and-manage";
}

/**
 * Every view, and which half it belongs to.
 *
 * `name` and `hint` live here rather than in the rail markup and again in the
 * palette, which is how the palette ended up offering "Go to Prep" in a half
 * that has no Prep.
 *
 * ## `rail: false` - a view you can reach and cannot navigate to
 *
 * Läget absorbed Focus. The focus page still exists and still holds the things
 * only it does - the guarded list, the measured cost, starting and ending one -
 * but it stopped being somewhere you go looking, because what you need to know
 * daily is now on the front page and the rest is reached from it.
 *
 * Deleting the entry would have been wrong rather than merely blunt: app.js
 * redirects any route this half does not declare, so the "Focus settings"
 * button and the palette's "Set a focus" would have bounced back to the home
 * view. The distinction the declaration needed was "not in the rail", not "not
 * a view", and it is one property rather than a second list.
 */
export const VIEWS = /** @type {const} */ ([
  /*
   * The front page. Renamed because it stopped being only what deviates: it
   * now carries the roster as tiles, the unanswered proposals and his own
   * aims, and "Now" described the deviation list it used to be.
   *
   * The Swedish name for it is Läget, and it arrives with the translation
   * rather than early - this is that name in the language the rest of the app
   * is currently in.
   */
  { id: "now", name: "Läget", hint: "hela bilden", halves: ["work"] },
  { id: "prep", name: "Inför", hint: "före ett samtal", halves: ["work"] },
  /*
   * Absorbed by the front page. Reachable, not in the rail - see the header.
   */
  { id: "focus", name: "Fokus", hint: "den nuvarande prioriteten", halves: ["work"], rail: false },
  { id: "people", name: "Personer", hint: "rostern", halves: ["work", "private"] },
  { id: "work", name: "Arbete", hint: "projekt och delegering", halves: ["work"] },
  { id: "journal", name: "Dagen", hint: "vad dagen gick till", halves: ["work", "private"] },
  /*
   * Both halves, because both of the things on this page mean something here.
   *
   * The weekly look back is first-person and on no clock, which is the same
   * reason the journal transfers. And an aim about how he is as a parent, or
   * about training, is exactly as measurable as one about how he runs a 1-1 -
   * the goals he set for himself outside work had nowhere to live at all, which
   * is how a second file of them came to exist beside the app.
   *
   * Each half keeps its own two open aims rather than sharing the pair. They are
   * separate stores and separate attention, and "be more present at home" does
   * not compete for the same slot as anything at work.
   */
  { id: "reflection", name: "Reflektion", hint: "hur veckan gick", halves: ["work", "private"] },
  { id: "role", name: "Rollkarta", hint: "vad jobbet är", halves: ["work"] },
  { id: "decisions", name: "Beslut", hint: "loggboken", halves: ["work"] },
  { id: "knowledge", name: "Kunskap", hint: "fråga om en situation", halves: ["work", "private"] },
  { id: "settings", name: "Inställningar", hint: "data, Nib, utkast", halves: ["work", "private"] }
]);

/**
 * The views one half has, in rail order.
 *
 * @param {string} half
 * @returns {{ id: string, name: string, hint: string }[]}
 */
export function viewsIn(half) {
  return VIEWS.filter((v) => /** @type {readonly string[]} */ (v.halves).includes(half)).map(
    (v) => ({ id: v.id, name: v.name, hint: v.hint })
  );
}

/**
 * @param {string} half
 * @param {string} view
 * @returns {boolean}
 */
export function hasView(half, view) {
  return viewsIn(half).some((v) => v.id === view);
}

/**
 * Where a half opens, and where it falls back to.
 *
 * The work half opens on what needs him. The private half opens on the day,
 * because there is nothing there that is late - and because the entry is the one
 * thing that half is for.
 *
 * @param {string} half
 * @returns {string}
 */
export function homeViewIn(half) {
  return half === "private" ? "journal" : "now";
}

/**
 * What a person page may show, per half.
 *
 * Read by the person page rather than a chain of `if (private)` down its
 * middle, so adding a block means deciding which halves it belongs to instead of
 * discovering later that it renders drift over a picture of your family.
 *
 * @param {string} half
 * @returns {{ cadences: boolean, promises: boolean, waiting: boolean, growth: boolean, topics: boolean, skips: boolean, observations: boolean, moments: boolean }}
 */
export function personBlocksIn(half) {
  const isPrivate = half === "private";
  return {
    // Drift, and everything derived from it.
    cadences: !isPrivate,
    // A promise is owed the same way in both halves, and the person let down is
    // let down in the same way. This is the one thing that transfers whole.
    promises: true,
    // The softer mirror of a promise. Somebody owing you an answer is not an
    // idea that changes shape outside work.
    waiting: true,
    // Not in the private half, and the reason is not squeamishness: a growth
    // thread is a direction you have decided somebody should develop in, with a
    // marker you watch for. Run that on your own child and the tool has become
    // something else.
    growth: !isPrivate,
    topics: !isPrivate,
    skips: !isPrivate,
    /*
     * Observations about a person, and the pass that reads across their notes.
     *
     * Both are material for a review conversation and are therefore ABOUT
     * somebody else, which is exactly what the private half refuses to keep -
     * run over a family it is a character file on your own child.
     *
     * This flag used to be called `themes`, after a stored model output that no
     * longer exists and that it never actually gated.
     */
    observations: !isPrivate,
    /*
     * Moments: one thing that happened, and his own part in it.
     *
     * The private half only, and it is what answers "how has it been going" -
     * which promises and waiting cannot. The work half has observations for the
     * same slot, and they are a different thing: material for a review
     * conversation, and therefore about the other person.
     *
     * This started as a checkbox on the day's entry, and that was the wrong
     * shape: a whole-day retrospective attached to four names put one day's text
     * on four pages. The day is the day.
     */
    moments: isPrivate
  };
}
