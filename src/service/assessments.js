/**
 * Recording and reading a round of feedback about one person.
 *
 * Why the record carries its own axis labels, why there is no figure per
 * person, and why the assessor is named and weighable: see
 * `domain/assessments.js`. This file is the store side of it and the refusals.
 */

import {
  SCALE_MAX,
  SCALE_MIN,
  assessmentStanding,
  byAxis,
  doubleAnswers,
  isScore,
  isWeight,
  occasions
} from "../domain/assessments.js";
import { WEIGHTS } from "../domain/assessments.js";
import { resolvePerson } from "./resolve.js";

/** @param {unknown} value */
const text = (value) => String(value ?? "").trim();

/**
 * Record what one assessor answered about one person.
 *
 * The scores arrive as `[{ axis, score, asked }]` rather than as a map keyed by
 * a question id, because the axis label is the thing being kept: a set may be
 * reworded or deleted afterwards and this row still says what was asked.
 *
 * Three refusals, and each one is a way the round becomes unreadable later:
 *
 *   No assessor. A rating nobody's name is on cannot be weighed, and weighing
 *   it is most of how it gets read - `domain/assessments.js` opens on why.
 *
 *   No axis label. A score against an empty axis is a number with nothing to
 *   compare it to, in a feature whose only purpose is comparison.
 *
 *   A score off the scale, or a fraction of a point. A 3.5 on a five-point
 *   scale is a misread form or somebody splitting a difference the scale does
 *   not have, and both are better refused now than averaged into a round in
 *   six months.
 *
 * The weight is accepted here and used nowhere. That is deliberate: the field
 * has to exist from the first round or today's knowledge of who is careless is
 * gone by the time anybody wants it, while what weight DOES to an aggregate is
 * a decision nobody has made yet. Applying a weighting before that decision
 * would be worse than not having the field.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} args.person Name or id of the person assessed.
 * @param {string} args.assessor Who answered. Never anonymous.
 * @param {{ axis: string, score: number, asked?: string }[]} args.scores
 * @param {string} [args.set] Which question set, for matching rounds.
 * @param {string} [args.setName] What the set is called, for reading.
 * @param {string} [args.assessorRole] What the assessor is to the work.
 * @param {string} [args.assessorWeight] One of WEIGHTS. Defaults to unset.
 * @param {string} [args.weighWhy] Why it is weighed that way.
 * @param {string} [args.note] What the assessor wrote, if anything.
 * @param {number} [args.at] When it was answered. Defaults to now.
 * @param {number} args.now
 */
export function recordAssessment(store, args) {
  const found = resolvePerson(store, args.person);
  if (!found.ok) {
    return { error: found.error };
  }
  if (text(args.assessor) === "") {
    return {
      error:
        "Säg vem som bedömde. Ett betyg utan namn går inte att väga, och att väga det är " +
        "mestadels hur det läses - toppbetyg med tomma kommentarsfält från någon slarvig " +
        "säger mer om bedömaren än om personen."
    };
  }
  if (args.assessorWeight !== undefined && !isWeight(args.assessorWeight)) {
    return {
      error: `Okänd tyngd. Giltiga: ${Object.keys(WEIGHTS).join(", ")}.`
    };
  }

  const asked = Array.isArray(args.scores) ? args.scores : [];
  if (asked.length === 0) {
    return { error: "En bedömning behöver minst en axel med ett svar på." };
  }

  /** @type {{ axis: string, asked: string, score: number }[]} */
  const scores = [];
  for (const one of asked) {
    const axis = text(one?.axis);
    if (axis === "") {
      return {
        error:
          "Varje poäng behöver en axel den är satt på. En siffra utan axel går inte att " +
          "jämföra med något, och jämförelsen är hela skälet att spara den."
      };
    }
    if (!isScore(one?.score)) {
      return {
        error:
          `"${String(one?.score)}" på ${axis} ligger utanför skalan. Ett helt tal mellan ` +
          `${SCALE_MIN} och ${SCALE_MAX}, som ronden kördes.`
      };
    }
    scores.push({ axis, asked: text(one?.asked), score: Number(one.score) });
  }

  const seen = new Set(scores.map((s) => s.axis.toLowerCase()));
  if (seen.size !== scores.length) {
    return {
      error:
        "Samma axel förekommer två gånger i den här bedömningen. Två svar på en fråga från " +
        "en bedömare är ett fel i inmatningen, och lagrat blir det en röst som räknas dubbelt."
    };
  }

  const when = Number(args.at);
  const id = store.create("assessments", {
    person: String(found.person.id),
    assessor: text(args.assessor),
    assessorRole: text(args.assessorRole) || null,
    assessorWeight: isWeight(args.assessorWeight) ? String(args.assessorWeight) : "unset",
    weighWhy: text(args.weighWhy) || null,
    set: text(args.set) || "default",
    setName: text(args.setName) || text(args.set) || "Frågeset utan namn",
    scores,
    note: text(args.note) || null,
    // Backdatable, the same reasoning `addStake` writes out: a round answered
    // last Thursday and entered today has to be sayable, or the first entries
    // are wrong in the flattering direction.
    at: Number.isFinite(when) && when > 0 ? when : args.now
  });

  return {
    id,
    person: found.person.name,
    assessor: text(args.assessor),
    axes: scores.length,
    said: text(args.note) !== ""
  };
}

/**
 * Take back a mis-entered assessment.
 *
 * Removable rather than correctable in place, and only just: an assessment is
 * somebody else's answer, so editing one is putting words in their mouth. What
 * a wrong row needs is to go and be typed again from the form it came from.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} id
 */
export function removeAssessment(store, id) {
  const row = store.rows("assessments").find((a) => String(a.id) === String(id));
  if (!row) {
    return { error: `No assessment with id "${id}".` };
  }
  store.remove("assessments", String(row.id));
  return { removed: `${String(row.assessor ?? "")}, ${String(row.setName ?? "")}` };
}

/**
 * Everything answered about one person, newest first, with the aggregate.
 *
 * There is no figure for the person in what comes back, and that is the shape
 * rather than an omission. `byAxis` is per axis and per set with its own count,
 * so two assessors who answered different questions cannot meet in one number -
 * see `domain/assessments.js` for the 3.4 that started this.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} who Name or id.
 * @param {number} [now]
 */
export function assessments(store, who, now = Date.now()) {
  const found = resolvePerson(store, who);
  if (!found.ok) {
    return { error: found.error };
  }

  const rows = store
    .rows("assessments")
    .filter((a) => !a._deleted && String(a.person) === String(found.person.id))
    .map((a) => assessmentStanding(a, now))
    .sort((a, b) => b.at - a.at);

  const days = occasions(rows);
  return {
    person: found.person.name,
    personId: String(found.person.id),
    rounds: days.length,
    /*
     * Whether a trend could be drawn at all, said here rather than left to a
     * view to work out. One occasion is a point; the reference implementation
     * draws a curve through three answers from one afternoon, which reads as
     * movement where there is none.
     */
    trendPossible: days.length > 1,
    occasions: days,
    byAxis: byAxis(rows),
    doubles: doubleAnswers(rows),
    answers: rows
  };
}
