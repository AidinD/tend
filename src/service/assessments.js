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
  axisSeries,
  isWeight,
  occasions,
  roundSummaries,
  rounds
} from "../domain/assessments.js";
import { WEIGHTS } from "../domain/assessments.js";
import { dutyLabel } from "../domain/attention.js";
import { agoWords, daysSince } from "../domain/time.js";
import { logTouch } from "./writing.js";

/**
 * The kind of contact a completed round is.
 *
 * Named once rather than spelled at each use, and read from nowhere else: the
 * duty's own `evidenceKinds` is what decides whether this satisfies anything,
 * and this only has to agree with the kind that exists in `domain/contact.js`.
 */
const ROUND_EVIDENCE = "survey";
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
 * Whether there is a round to offer as run, and what accepting would say.
 *
 * ## Why an offer and not a write
 *
 * Recording an assessment could satisfy the duty by itself - the plumbing is one
 * call, because the duty already declares `survey` as its evidence and `survey`
 * is a real contact kind. It deliberately does not, and the reason is a real
 * case rather than a principle: one assessor answered 5/5/4 with every comment
 * box empty and is weighed low. Had that silenced a ninety-day duty, the person
 * would have read as tended for a year on one careless row.
 *
 * The other direction was worse in practice. Nothing automatic is what the tool
 * already did, and two people's rounds were entered and left standing as never
 * run, with the contacts logged by hand afterwards - so "he will remember" had
 * already been tested and failed the same afternoon.
 *
 * So it is a proposal he accepts, which is the shape the rest of the app uses
 * for anything that changes what the job is: agents and forms propose, the
 * window accepts.
 *
 * ## Why it is derived and not stored
 *
 * A prompt shown once after recording is a prompt that can be missed, and
 * missing it leaves exactly the state this was built to fix. This is computed
 * from what is in the store, so it appears on its own, survives a restart, goes
 * away when acted on - and was already true for the rounds entered before it
 * existed, which a fire-once prompt could never have covered.
 *
 * ## Which duty, and the date
 *
 * Never a hardcoded duty. Any duty that reaches this person and consumes
 * `survey` evidence is what an accepted offer would satisfy; if none does,
 * there is nothing to offer and this returns null. A round on somebody whose
 * duties do not ask for one is not a round anybody owed.
 *
 * The contact is dated to the newest assessment it covers rather than to today.
 * The round happened when the answers came in, and stamping it with the day the
 * offer was accepted would overstate how current the picture is - by exactly
 * the gap between running a round and getting round to filing it.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} personId
 * @param {number} now
 */
export function roundOffer(store, personId, now) {
  const person = store.rows("people").find((p) => String(p.id) === String(personId));
  if (!person) {
    return null;
  }

  const duties = store
    .rows("duties")
    .filter(
      (d) =>
        !d._deleted &&
        (d.status ?? "active") === "active" &&
        d.subjectKind === "person" &&
        Array.isArray(d.evidenceKinds) &&
        d.evidenceKinds.includes(ROUND_EVIDENCE) &&
        (!Array.isArray(d.relations) ||
          d.relations.length === 0 ||
          d.relations.includes(String(person.relation)))
    );
  if (duties.length === 0) {
    return null;
  }

  const marked = store
    .rows("touches")
    .filter(
      (t) =>
        !t._deleted &&
        String(t.subject) === String(personId) &&
        String(t.kind) === ROUND_EVIDENCE &&
        typeof t.at === "number"
    )
    .reduce((newest, t) => Math.max(newest, Number(t.at)), 0);

  /*
   * Only answers newer than the last time a round was marked. Otherwise the
   * offer would stand for ever on anybody who has ever been assessed, which is
   * a permanent item on a page whose whole value is that everything on it is
   * actionable.
   */
  const fresh = store
    .rows("assessments")
    .filter((a) => !a._deleted && String(a.person) === String(personId))
    .map((a) => assessmentStanding(a, now))
    .filter((a) => a.at > marked);

  if (fresh.length === 0) {
    return null;
  }

  const coversUpTo = fresh.reduce((newest, a) => Math.max(newest, a.at), 0);
  return {
    answers: fresh.length,
    assessors: [...new Set(fresh.map((a) => a.assessor))].length,
    /* How many of those said nothing at all, so the offer can be refused on an
       informed basis rather than accepted because a number looked fine. */
    saidNothing: fresh.filter((a) => !a.saidAnything).length,
    coversUpTo,
    markedBefore: marked === 0 ? null : marked,
    duties: duties.map((d) => ({ id: String(d.id), name: dutyLabel(d) }))
  };
}

/**
 * Accept it: log the round as run, on the date it was actually answered.
 *
 * A contact of the kind the duty already asks for, through the same path a
 * hand-logged one takes. Nothing here is special-cased into the cadence code -
 * the duty consumes `survey` evidence and this produces `survey` evidence, and
 * that is the whole connection.
 *
 * Not exposed over MCP. `tend_log_touch` can already log a survey contact and
 * that is unchanged - an agent may record that something happened. This is a
 * different claim: that a round is complete, drawn from the answers, which is a
 * judgement about how much evidence is enough.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} args.person Name or id.
 * @param {number} args.now
 */
export function markRoundRun(store, { person: who, now }) {
  const found = resolvePerson(store, who);
  if (!found.ok) {
    return { error: found.error };
  }

  const offer = roundOffer(store, String(found.person.id), now);
  if (offer === null) {
    return {
      error:
        "Det finns ingen rond att markera. Antingen är den redan markerad, eller så saknar " +
        "personen någon plikt som en enkätrunda kan uppfylla."
    };
  }

  const said = offer.answers - offer.saidNothing;
  return {
    ...logTouch(store, {
      subject: String(found.person.id),
      kind: ROUND_EVIDENCE,
      /*
       * The note says what the round was, because a bare survey contact in the
       * history a year from now is unreadable. How many answered, from how many
       * assessors, and how many of them wrote nothing - the last one being the
       * fact most likely to change what the round is worth.
       */
      note:
        `${offer.answers} bedömningar från ${offer.assessors} bedömare` +
        (offer.saidNothing > 0 ? `, ${said} med fritext` : ""),
      at: offer.coversUpTo,
      now
    }),
    person: found.person.name,
    covered: offer.answers,
    duties: offer.duties.map((d) => d.name)
  };
}

/**
 * What the rounds about one person amount to, without anybody's answer.
 *
 * The aggregate and nothing else: how many occasions, how long ago, and the
 * per-axis figures with their counts. No assessor names, no free text, no
 * individual rows.
 *
 * That split is the point rather than an economy. An aggregate is about the
 * subject; an individual answer is about the assessor as much as about them -
 * who said it, how much it is worth and why - and that belongs behind an
 * explicit ask instead of arriving in every payload that asks who somebody is.
 * `assessments` below is that ask.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} personId
 * @param {number} now
 */
export function assessmentSummary(store, personId, now) {
  const rows = store
    .rows("assessments")
    .filter((a) => !a._deleted && String(a.person) === String(personId))
    .map((a) => assessmentStanding(a, now));

  if (rows.length === 0) {
    return null;
  }

  const days = occasions(rows);
  const last = rows.reduce((newest, r) => Math.max(newest, r.at), 0);
  return {
    answers: rows.length,
    /* The COUNT of occasions. `roundHistory` below is the occasions themselves -
       two different questions, and the summary line asks this one. */
    rounds: days.length,
    lastAt: last,
    lastAnswered: agoWords(daysSince(last, now) ?? 0),
    trendPossible: days.length > 1,
    /*
     * How many answers came with nothing written. Carried in the summary
     * because it changes how every figure beside it should be read, and
     * because it is the one thing a reader would otherwise have to open the
     * rows to find out. Top marks with every box empty reads as a strong
     * result and is closer to no answer at all.
     */
    saidNothing: rows.filter((r) => !r.saidAnything).length,
    /* Same reasoning: a colliding pair moves every mean above it. */
    doubles: doubleAnswers(rows).length,
    byAxis: byAxis(rows)
  };
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
    /*
     * The same answers grouped into the occasions they arrived on, so a round
     * can be read against the one before it. Carried beside the flat list
     * rather than instead of it: the aggregate answers "where does this person
     * stand", the history answers "what has each round said", and collapsing
     * them into one shape would lose whichever question was not asked.
     */
    roundHistory: rounds(rows),
    /*
     * The same answers with the axis as the unit instead of the round: what has
     * this one axis done over time. Sent whether or not it can be shown - the
     * view decides that off `trendPossible`, so the two cannot disagree about
     * whether one occasion is a trend.
     */
    series: axisSeries(rows),
    doubles: doubleAnswers(rows),
    /*
     * Whether there is a round to offer as run. Carried on the read the block
     * already makes rather than needing its own, so the offer cannot be out of
     * step with the answers it is derived from.
     */
    offer: roundOffer(store, String(found.person.id), now),
    answers: rows
  };
}

/**
 * The rounds that ran, after their answers were retired.
 *
 * Read separately from `assessments` because it answers a different question and
 * survives when that one has nothing left to answer with: this is his record of
 * how he worked, not a record about anybody.
 *
 * @param {import("../storage/store.js").TendStore} store
 */
export function roundsRan(store) {
  return store
    .rows("roundsRan")
    .filter((r) => !r._deleted)
    .map((r) => ({
      id: String(r.id),
      day: String(r.day ?? ""),
      setName: String(r.setName ?? ""),
      answers: Number(r.answers ?? 0),
      assessors: Number(r.assessors ?? 0),
      people: Number(r.people ?? 0),
      silent: Number(r.silent ?? 0),
      retiredAt: Number(r.retiredAt ?? 0)
    }))
    .sort((a, b) => b.day.localeCompare(a.day));
}

/**
 * Retire the answers and keep the rounds - alternative B, the day the job ends.
 *
 * ## What it does, in order
 *
 * Writes one `roundsRan` row per (day, question set) from the answers as they
 * stand, then blanks every assessment's fields and tombstones it. The summaries
 * are written FIRST and deliberately: if the second half fails halfway the
 * record of what happened exists, which is the direction to fail in - the
 * alternative is scores gone and no trace that anything was ever run.
 *
 * ## What survives, and what does not
 *
 * The day, the set, and how many answered. No person, no assessor, no score, no
 * note, no weight. See `roundSummaries` for why the subject goes too.
 *
 * ## The limit this cannot get past, stated rather than implied
 *
 * `store.remove` is a tombstone: the reducer marks the row deleted and every
 * read path filters it, but the log is append-only and the original
 * `assessments.create` event is still in the file with the scores, the notes and
 * the assessor names in it. Blanking the fields first means a REPLAY of the log
 * ends with nothing readable - but the bytes of the original event are still on
 * disk and a reader of the file can see them.
 *
 * Nothing here can change that. Removing them from the file is compaction, which
 * this project refuses on the grounds that it is the only operation that
 * destroys data; the honest alternative is to export what survives and start a
 * fresh data directory. That is his call and is not what this does.
 *
 * So this makes the numbers unreachable from the app, permanently and by every
 * path the app has. It does not shred the file, and calling it "deleted" without
 * that sentence would be the more comfortable lie.
 *
 * App only, and irreversible by design - there is no undo, unlike the bulk
 * archive which promises that nothing is removed.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {number} args.now
 * @param {boolean} [args.dry] Report what would go without writing.
 */
export function retireAssessments(store, { now, dry }) {
  const live = store.rows("assessments").filter((a) => !a._deleted);
  const rows = live.map((a) => assessmentStanding(a, now));
  const summaries = roundSummaries(rows);

  if (dry) {
    return {
      dry: true,
      rounds: summaries.length,
      answers: live.length,
      summaries
    };
  }

  for (const round of summaries) {
    /*
     * A deterministic id, so running this twice cannot write a second copy of
     * the same round - and so a round retired in an earlier pass is left exactly
     * as it was rather than gaining a new stamp.
     */
    store.create("roundsRan", {
      id: `ran:${round.day}:${round.set}`,
      day: round.day,
      setName: round.setName,
      answers: round.answers,
      assessors: round.assessors,
      people: round.people,
      silent: round.silent,
      retiredAt: now
    });
  }

  for (const row of live) {
    /*
     * Blanked before it is tombstoned. A tombstone keeps the row's fields, so
     * without this the scores would still be in the reduced state behind a
     * `_deleted` flag - one careless read away from the page. Blanking makes a
     * replay end with nothing readable; see the header for what it still cannot
     * do about the bytes already in the file.
     */
    store.update("assessments", String(row.id), {
      assessor: null,
      assessorRole: null,
      assessorWeight: "unset",
      weighWhy: null,
      scores: [],
      note: null
    });
    store.remove("assessments", String(row.id));
  }

  return {
    rounds: summaries.length,
    answers: live.length,
    /* Said back so the confirmation can repeat it, and so a caller cannot
       report success over a store that had nothing in it. */
    kept: summaries.map((r) => `${r.day} ${r.setName}`)
  };
}
