/**
 * Drift: how far behind a recurring responsibility is.
 *
 * This is the core idea of the whole tool, so it is worth stating plainly. A
 * cadence does not have a due date that turns red and stays red - red that
 * shows up every busy week gets ignored within a month. It has a *drift*: how
 * many days past its target interval it now is. Drift sorts itself, survives a
 * bad month, and makes the pattern visible over time, which matters more than
 * any single week.
 *
 * Nothing here touches the store. These are pure functions over plain values so
 * the part that must never be wrong is the part that is trivial to test.
 */

import { daysBetween } from "./time.js";

/** @typedef {"ok" | "watch" | "warn" | "critical"} Severity */

/** Ascending urgency, for sorting and comparison. */
export const SEVERITY_ORDER = /** @type {const} */ (["ok", "watch", "warn", "critical"]);

/**
 * How the user relates to a person. Attention rules differ per type, because what
 * you owe someone you lead daily is not what you owe someone you manage from
 * two teams away.
 *
 * Three strings each, and all three live here. `label` names it, `note` says
 * what it means on a card, and `choice` is how it reads in a dropdown - written
 * for that job rather than derived, because a list of options wants to be
 * scannable and a note wants to be read.
 *
 * The renderer had its own hand-copied version of the list for a while. Adding
 * a relationship type here then left it unpickable in the window, with nothing
 * failing anywhere: the type existed, the service accepted it, and the only way
 * to notice was to open the dropdown and find it absent.
 */
export const RELATIONS = /** @type {const} */ ({
  "lead-and-manage": {
    label: "Leder och ansvarar för",
    note: "Du ser deras arbete och du ansvarar för dem.",
    choice: "Leder och ansvarar för - du ser deras arbete och har ansvaret"
  },
  "lead-only": {
    label: "Leder utan kanal",
    note: "Du ser deras arbete dagligen men har ingen formell kanal.",
    choice: "Leder utan kanal - du ser deras arbete, ingen formell kanal"
  },
  "manage-remotely": {
    label: "Ansvarar för på distans",
    note: "Du har mandatet och ingenting av observationen. Den blinda fläcken.",
    choice: "Ansvarar för på distans - mandatet utan observationen"
  },
  "equal-lead": {
    label: "Sidoordnad",
    note: "Ingen bestämmanderätt någon väg. Inflytandet vilar helt på goodwill.",
    choice: "Sidoordnad - ingen bestämmanderätt någon väg"
  },
  "own-manager": {
    label: "Min chef",
    note: "Uppåt. Andra plikter gäller.",
    choice: "Min chef"
  },
  stakeholder: {
    label: "Stakeholder",
    note: "Du levererar till dem. Du är skyldig dem en bild, inte ett samtal.",
    choice: "Stakeholder - du levererar till dem, de är inte dina att leda"
  }
});

/** @typedef {keyof typeof RELATIONS} Relation */

/**
 * The four clusters the front page lays the roster out in.
 *
 * A second grouping of the same six types, which is the thing to be careful
 * about rather than the thing to avoid: the roster groups one-per-type, and
 * Läget needs fewer and bigger groups because the point of that page is where
 * to look first, not who is who.
 *
 * ## Why these four
 *
 * `mandate` is the two types where you are accountable for the person, and it
 * owns the vertical space on the page. `manage-remotely` is in it precisely
 * because it is the blind spot - the mandate without the observation - so it
 * belongs where the eye goes rather than in a strip at the bottom.
 *
 * The other three are one line each. `noChannel` is someone whose work you see
 * daily with no formal channel to act through; `peers` is influence resting
 * entirely on goodwill; `outward` is the two directions that are not yours to
 * lead at all - upward to your own manager, outward to somebody you owe a
 * picture rather than a conversation.
 *
 * ## Order is load-bearing
 *
 * The page renders these in declaration order and gives the first one a grid
 * and the rest a strip. So the order is a design decision recorded here rather
 * than a loop index in the renderer.
 *
 * ## Structure here, words in text.js
 *
 * Which types are in which cluster is a fact about the domain and cannot be a
 * translation question. What the cluster is *called* is the opposite. RELATIONS
 * above keeps its own three strings for historical reasons; this does not
 * extend that.
 *
 * @type {Record<string, { relations: Relation[] }>}
 */
export const RELATION_GROUPS = {
  mandate: { relations: ["lead-and-manage", "manage-remotely"] },
  noChannel: { relations: ["lead-only"] },
  peers: { relations: ["equal-lead"] },
  outward: { relations: ["own-manager", "stakeholder"] }
};

/** @typedef {keyof typeof RELATION_GROUPS} RelationGroup */

/**
 * Which cluster a relationship type is in, or null if it is not a type.
 *
 * Null rather than a default cluster. A type with no cluster is a bug in the
 * declaration above, and putting it somewhere reasonable is how the roster lost
 * people the first time - present in the data, absent from the page, no error.
 *
 * @param {string} relation
 * @returns {string | null}
 */
export function groupOf(relation) {
  for (const [name, group] of Object.entries(RELATION_GROUPS)) {
    if (/** @type {string[]} */ (group.relations).includes(relation)) {
      return name;
    }
  }
  return null;
}

/**
 * @param {string} v
 * @returns {v is Relation}
 */
export function isRelation(v) {
  return Object.prototype.hasOwnProperty.call(RELATIONS, v);
}

/**
 * Every relationship type, as options for a list.
 *
 * Derived rather than written out again, so a type added above cannot be
 * missing from the window - which is a failure with no symptom other than a
 * dropdown that quietly does not offer it.
 *
 * @type {{ value: Relation, label: string }[]}
 */
export const RELATION_OPTIONS = Object.entries(RELATIONS).map(([value, r]) => ({
  value: /** @type {Relation} */ (value),
  label: r.choice
}));

/**
 * Severity for a drift, relative to the interval it drifted from.
 *
 * Scaled to the interval on purpose: three days late on a weekly cadence is
 * worse than three days late on a monthly one, and a fixed day threshold would
 * call them the same.
 *
 * @param {number} driftDays Positive means behind.
 * @param {number} intervalDays The interval it is measured against.
 * @returns {Severity}
 */
export function severityFor(driftDays, intervalDays) {
  if (driftDays <= 0) {
    return "ok";
  }
  if (driftDays <= intervalDays * 0.5) {
    return "watch";
  }
  if (driftDays <= intervalDays) {
    return "warn";
  }
  return "critical";
}

/**
 * @typedef {object} Drift
 * @property {number} daysSince Days since the last evidence, or since it started.
 * @property {number} driftDays How far past the interval. Negative means early.
 * @property {number} interval The target interval as configured.
 * @property {number} effectiveInterval After any focus stretch.
 * @property {Severity} severity How urgently it reads, after any focus stretch.
 * @property {Severity} trueSeverity How urgent it actually is, ignoring the focus.
 *   Kept separate so a focus can never make something disappear without being
 *   counted: policy may soften the reading, it may not rewrite the fact.
 * @property {boolean} everHappened False if there is no evidence at all yet.
 * @property {boolean} stretched True if a focus relaxed the threshold.
 */

/**
 * Compute drift for one cadence.
 *
 * `stretch` is how a focus dampens noise: it multiplies the interval, so the
 * drift number itself never changes - only how urgently it reads. Drift is
 * truth, severity is policy. A guarded cadence passes stretch 1 and is
 * therefore never dampened.
 *
 * @param {object} args
 * @param {number} args.intervalDays Target interval.
 * @param {number | null} args.lastAt Last evidence, ms since epoch, or null.
 * @param {number} args.since When this cadence started applying, ms since epoch.
 *   Used when there is no evidence yet, so a brand new person is not instantly
 *   critical.
 * @param {number} args.now
 * @param {number} [args.stretch] Multiplier from an active focus. 1 = none.
 * @returns {Drift}
 */
export function computeDrift({ intervalDays, lastAt, since, now, stretch = 1 }) {
  if (!(intervalDays > 0)) {
    throw new Error(`Cadence interval must be positive, got ${intervalDays}`);
  }

  const everHappened = lastAt !== null;
  const from = everHappened ? lastAt : since;
  const daysSince = Math.max(0, daysBetween(from, now));
  const effectiveInterval = intervalDays * stretch;
  const driftDays = daysSince - effectiveInterval;

  return {
    daysSince,
    driftDays,
    interval: intervalDays,
    effectiveInterval,
    severity: severityFor(driftDays, effectiveInterval),
    trueSeverity: severityFor(daysSince - intervalDays, intervalDays),
    everHappened,
    stretched: stretch !== 1
  };
}

/**
 * Timestamp of the most recent piece of evidence for a subject.
 *
 * "Evidence" is deliberately narrow: a 1-1 note satisfies the 1-1 cadence, and
 * does not satisfy the separate cadence for hearing about that person from
 * someone else. If one kind of contact could satisfy every cadence, the blind
 * spot the tool exists to catch would close itself on paper.
 *
 * @param {{ subject?: string, kind?: string, at?: number, _deleted?: boolean }[]} touches
 * @param {string} subject Subject id.
 * @param {string[]} kinds Which kinds count. Empty means any.
 * @returns {number | null}
 */
export function latestEvidence(touches, subject, kinds) {
  let latest = null;
  for (const t of touches) {
    if (t._deleted || t.subject !== subject || typeof t.at !== "number") {
      continue;
    }
    if (kinds.length > 0 && !kinds.includes(t.kind ?? "")) {
      continue;
    }
    if (latest === null || t.at > latest) {
      latest = t.at;
    }
  }
  return latest;
}

/**
 * Rank two drifts, worst first. Ties break on the raw day count so the person
 * who has waited longest wins, not whoever happens to sort first by name.
 *
 * @param {Drift} a
 * @param {Drift} b
 * @returns {number}
 */
export function compareDrift(a, b) {
  const sev = SEVERITY_ORDER.indexOf(b.severity) - SEVERITY_ORDER.indexOf(a.severity);
  if (sev !== 0) {
    return sev;
  }
  return b.driftDays - a.driftDays;
}
