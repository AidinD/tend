/**
 * One assessor's answers about one person, on one occasion.
 *
 * A recurring feedback round is the one duty in the role map that produces
 * numbers, and until now the numbers landed outside the tool: in a form, in a
 * spreadsheet, in nobody's memory by the next round. The whole point of storing
 * them is comparison across rounds, and everything below is about the ways that
 * comparison quietly becomes wrong.
 *
 * ## The record carries what was asked, not a pointer to it
 *
 * The reference implementation stores the question set as an editable row and
 * the answers as question ids pointing into it. Editing a question's wording
 * then changes the meaning of every historical answer to it, with nothing
 * failing anywhere - a round from March silently becomes answers to a question
 * that was not asked in March. So an axis's label, and the prompt if there was
 * one, are copied onto the record when it is written. A set may be renamed,
 * reworded or deleted afterwards and last spring stays what it was.
 *
 * The set's identity is kept too, because "which set was this" is the question
 * that decides whether two rounds are comparable at all. Both, for the same
 * reason a person's page shows a duty's label and its id: one is for reading
 * and one is for matching.
 *
 * ## There is no average for a person
 *
 * Deliberately absent, and it is the single most important thing here. The
 * reference implementation shows one figure per person, averaged over every
 * response about them - so a 3.4 was produced from one assessor answering about
 * technical quality and another about delivery. That number is not a weak
 * signal, it is not a signal: nothing was measured twice.
 *
 * `byAxis` below is the aggregate, and it is per axis with its own count. Two
 * assessors who answered different questions never meet in one figure, because
 * there is no code path that could put them there. A rule in a document would
 * have been re-derived by the next person who wanted a sortable column.
 *
 * ## An assessor is named, and their weight is a field
 *
 * A rating is unreadable without knowing who gave it. A 5/5/4 with every
 * comment box empty, from somebody known to be careless, says more about the
 * assessor than about the subject - and that knowledge lives in one person's
 * head until the row outlives their memory of it, which is about six months.
 *
 * So `assessor` is required and never anonymous, and the record has room for
 * how much the assessment is worth and why. This module stores and reports
 * those two fields and does nothing else with them: what weight DOES to an
 * aggregate is a separate decision, and a weighting applied before anybody has
 * decided what it means would be worse than none.
 *
 * ## Nothing here is a measurement of the team
 *
 * Same boundary as `myattention.js`, and it needs stating because this file is
 * the closest the tool comes to crossing it. These rows exist because he ran a
 * round and somebody answered; they are not derived from anybody's behaviour,
 * not computed from activity, and nothing here produces a ranking. Every row
 * has a human author whose name is on it.
 *
 * Nothing here touches the store.
 */

import { daysSince } from "./time.js";

/** The scale every axis is answered on. Five points, as the round was run. */
export const SCALE_MIN = 1;
export const SCALE_MAX = 5;

/**
 * How much an assessment is worth, in the assessor's own right.
 *
 * Three levels and no number. A number invites arithmetic - a weighted mean -
 * and the weight is a judgement about a colleague made in a moment, not a
 * coefficient. Naming the three keeps it a note the reader applies rather than
 * a factor the code applies before anybody decided it should.
 *
 * `unset` is the honest default and stays visible as a gap: an assessment whose
 * weight nobody has said anything about is different from one weighed and found
 * ordinary.
 *
 * @type {Record<string, { label: string }>}
 */
export const WEIGHTS = {
  unset: { label: "Inte vägd" },
  low: { label: "Läs med tvekan" },
  normal: { label: "Väger normalt" },
  high: { label: "Väger tungt" }
};

/** @param {unknown} weight */
export function isWeight(weight) {
  return typeof weight === "string" && Object.hasOwn(WEIGHTS, weight);
}

/**
 * Is this a score on the scale the round was run on?
 *
 * Whole numbers only. A 3.5 on a five-point scale is either a misread form or
 * somebody splitting a difference the scale does not have, and both are better
 * refused at the write than averaged into a round six months later.
 *
 * @param {unknown} score
 */
export function isScore(score) {
  return (
    typeof score === "number" &&
    Number.isInteger(score) &&
    score >= SCALE_MIN &&
    score <= SCALE_MAX
  );
}

/**
 * One stored assessment, read back.
 *
 * @param {Record<string, any>} row
 * @param {number} now
 */
export function assessmentStanding(row, now) {
  const scores = Array.isArray(row.scores) ? row.scores : [];
  const weight = isWeight(row.assessorWeight) ? String(row.assessorWeight) : "unset";

  return {
    id: String(row.id),
    person: String(row.person ?? ""),
    at: Number(row.at ?? 0),
    daysSince: daysSince(Number(row.at ?? 0), now) ?? 0,
    assessor: String(row.assessor ?? ""),
    assessorRole: String(row.assessorRole ?? ""),
    assessorWeight: weight,
    assessorWeightLabel: WEIGHTS[weight].label,
    weighWhy: String(row.weighWhy ?? ""),
    setName: String(row.setName ?? ""),
    set: String(row.set ?? ""),
    scores: scores.map((s) => ({
      axis: String(s.axis ?? ""),
      asked: String(s.asked ?? ""),
      score: isScore(s.score) ? Number(s.score) : null
    })),
    note: String(row.note ?? ""),
    /*
     * Whether the assessor wrote anything at all, as its own fact.
     *
     * Top marks with every box empty is the shape that started this: it reads
     * as a strong result and is closer to no answer. Counted here so a reader
     * can see it without opening the row, and never folded into the scores -
     * silence is not a low score.
     */
    saidAnything: String(row.note ?? "").trim() !== ""
  };
}

/**
 * What the answers about one person amount to, per axis.
 *
 * Per axis with its own count, and there is deliberately no figure for the
 * person. See the header: one number over answers to different questions is not
 * a weak signal, it is nothing measured twice. Keeping the aggregate at this
 * shape is what makes that structural rather than remembered.
 *
 * Axes are matched on their label rather than on a question id, because the
 * label is what was actually asked and the id points at a row somebody may have
 * reworded since.
 *
 * ## What the assessor's weight does to these figures, and what it must not
 *
 * The mean is the mean. Every answer counts once, whatever it is weighed, and
 * there is deliberately no weighted average anywhere in here.
 *
 * A weighted mean was the obvious thing to build and it is the wrong thing. It
 * produces one number that silently contains a judgement about the assessors -
 * so the figure that gets quoted in a review is neither what people answered nor
 * something anybody can check, and the weighting is invisible at exactly the
 * moment it matters. The multipliers would also be invented: there is no sense in
 * which a careless producer's answer is worth 0.5 of a careful one.
 *
 * Instead the figure is reported twice, and the second one only when it says
 * something: `meanDiscounting` is the same axis over the answers NOT weighed
 * low, with `discounted` saying how many were set aside. That answers the actual
 * question - is this figure being carried by the answers I do not trust - and it
 * answers it without replacing the honest number.
 *
 * The asymmetry is deliberate. Weighing somebody LOW sets their answer aside on
 * request; weighing somebody HIGH does nothing to any figure. Distrust is
 * actionable, because the question "what does this look like without them" has a
 * real answer. Confidence is not: counting an answer twice because it is a good
 * one invents precision that nobody measured.
 *
 * `meanDiscounting` is null when every answer on the axis was weighed low. That
 * is not a figure of zero and must never be shown as one - it is the finding that
 * an axis rests entirely on answers he distrusts, which is worth more than any
 * mean on the row.
 *
 * The case this comes from, 2026-09-07: 5/5/4 with all three comment boxes
 * empty, from one of the weaker producers. The knowledge that the numbers said
 * more about the assessor than about the subject lived only in his head, and in
 * six months the row is all that is left.
 *
 * @param {ReturnType<typeof assessmentStanding>[]} rows
 * @returns {{ set: string, setName: string, axis: string, mean: number, n: number,
 *   low: number, high: number, spread: number, meanDiscounting: number | null,
 *   nDiscounting: number, discounted: number }[]}
 */
export function byAxis(rows) {
  /**
   * The scores per axis, each carrying how much its assessor is weighed - so the
   * discounted figure comes off the same pass rather than a second grouping that
   * could drift out of step with the first.
   *
   * @type {Map<string, { set: string, setName: string, axis: string,
   *   scores: { score: number, weight: string }[] }>}
   */
  const groups = new Map();

  for (const row of rows) {
    for (const s of row.scores) {
      if (s.score === null || s.axis === "") {
        continue;
      }
      /*
       * Keyed on the set AND the axis. Two sets can both have an axis called
       * "Kommunikation" and mean different things by it - a producer's set and a
       * lead's set would be the obvious pair - so merging them on the label
       * alone would rebuild the cross-set average this file exists to refuse,
       * one axis at a time.
       *
       * Joined on a NUL because it is the one character neither half can
       * contain, so no pair of labels can collide by containing the separator.
       * Written as an escape rather than as the byte: as a literal it made this
       * file read as binary to grep and to `file`, which cost a real detour once
       * while looking for something else in it.
       */
      const key = `${row.set}\u0000${s.axis}`;
      const scored = { score: s.score, weight: row.assessorWeight };
      const at = groups.get(key);
      if (at === undefined) {
        groups.set(key, { set: row.set, setName: row.setName, axis: s.axis, scores: [scored] });
      } else {
        at.scores.push(scored);
      }
    }
  }

  return [...groups.values()]
    .map((g) => {
      const all = g.scores.map((x) => x.score);
      const total = all.reduce((sum, n) => sum + n, 0);
      const low = Math.min(...all);
      const high = Math.max(...all);

      // The same axis over the answers he has not set aside. Null rather than
      // zero when there are none: "every answer here is one you distrust" is a
      // finding, and a zero would print as a score on the scale.
      const kept = g.scores.filter((x) => x.weight !== "low").map((x) => x.score);
      const keptTotal = kept.reduce((sum, n) => sum + n, 0);

      return {
        set: g.set,
        setName: g.setName,
        axis: g.axis,
        mean: total / all.length,
        n: all.length,
        low,
        high,
        /*
         * Reported beside the mean and never instead of it. A view shows this
         * only when `discounted` is above zero, because an identical pair of
         * numbers on every row teaches somebody to stop reading both.
         */
        meanDiscounting: kept.length === 0 ? null : keptTotal / kept.length,
        nDiscounting: kept.length,
        discounted: all.length - kept.length,
        /*
         * The spread, carried beside the mean rather than left to be worked
         * out. Three assessors at 2, 3 and 5 average to the same place as three
         * at 3, 3 and 4 and mean something entirely different, and a mean shown
         * without it is the figure that gets quoted.
         */
        spread: high - low
      };
    })
    .sort((a, b) => a.setName.localeCompare(b.setName) || a.axis.localeCompare(b.axis));
}

/**
 * The rounds, as a history rather than a pile of answers.
 *
 * ## What this is for
 *
 * A flat list by date answers "what came in lately". The question the whole
 * feature exists for is the other one: what did this round say, and what did the
 * one before it say. Grouping by occasion puts those side by side in the order
 * they happened, which is the comparison - no curve needed and none drawn.
 *
 * ## Why there is no change figure, which is the obvious thing to add
 *
 * A round's assessors are not the round before's. Feedback rounds cannot demand
 * they be: people move teams, a producer leaves the project, somebody new is
 * asked precisely because the last round had a gap. So the difference between
 * two rounds' means is a difference between two means taken over two different
 * populations - which is not a change in the person, and is exactly the fault
 * `focusCost` was rewritten for on 2026-09-08 after reporting a newcomer's
 * backlog as the price of a focus.
 *
 * Each round therefore reports its own mean, its own count and WHO answered, and
 * the reader does the comparing with the assessors in front of them. A subtracted
 * number would read as movement in the person and be movement in the roster.
 * That decision belongs to the trend card, which cannot avoid it.
 *
 * ## Grouped by day, keyed per set
 *
 * A day, not an instant: a round is a form sent out and answered over an
 * afternoon or a week, and answers arriving an hour apart are one occasion. The
 * per-axis figures inside a round come from `byAxis` on that round's rows alone,
 * so the refusal to average across question sets holds inside a round exactly as
 * it does across all of them.
 *
 * Newest first, like every other history in the app.
 *
 * @param {ReturnType<typeof assessmentStanding>[]} rows
 * @returns {{ day: string, n: number, assessors: string[], silent: number,
 *   byAxis: ReturnType<typeof byAxis>, answers: ReturnType<typeof assessmentStanding>[] }[]}
 */
export function rounds(rows) {
  /** @type {Map<string, ReturnType<typeof assessmentStanding>[]>} */
  const byDay = new Map();

  for (const row of rows) {
    if (row.at === 0) {
      continue;
    }
    const day = new Date(row.at).toISOString().slice(0, 10);
    const at = byDay.get(day);
    if (at === undefined) {
      byDay.set(day, [row]);
    } else {
      at.push(row);
    }
  }

  return [...byDay.entries()]
    .map(([day, answers]) => {
      const sorted = [...answers].sort((a, b) => b.at - a.at);
      return {
        day,
        n: sorted.length,
        /*
         * Who answered, deduplicated and sorted. This is the field that makes
         * the round comparable to another one, so it is not decoration: two
         * rounds with no assessor in common are two different measurements,
         * however alike their means look.
         */
        assessors: [...new Set(sorted.map((r) => r.assessor).filter((a) => a !== ""))].sort(
          (a, b) => a.localeCompare(b)
        ),
        /* Top marks with every box empty reads as a strong result and is closer
           to no answer, so the count travels with the round. */
        silent: sorted.filter((r) => !r.saidAnything).length,
        byAxis: byAxis(sorted),
        answers: sorted
      };
    })
    .sort((a, b) => b.day.localeCompare(a.day));
}

/**
 * One axis over the rounds it was asked in - the trend, without a curve.
 *
 * ## What this is and why it is a list
 *
 * `rounds` takes the round as the unit and answers "what did this round say".
 * This takes the AXIS as the unit and answers the other half: what has this one
 * axis done over time. Same answers, and the two are complements rather than
 * alternatives - which is why both exist and neither replaces the other.
 *
 * It is a list of points and not a plotted line. The reference implementation
 * draws a curve through three answers from one afternoon, which reads as
 * movement where nothing moved, and a line between two points implies the values
 * in between were measured. They were not: there is no value between two rounds,
 * there is nothing.
 *
 * No point carries a change against the point before it, for the reason set out
 * in `rounds`: a round's assessors are not the last round's, so the difference
 * between two means is a difference between two populations. Each point carries
 * its own n and its own assessors instead, and the reader compares with those in
 * front of them.
 *
 * ## Oldest first, unlike every other history here
 *
 * Deliberate, and the one place the app reverses itself. A history answers "what
 * happened lately" and reads newest-first; a series answers "which way has this
 * gone" and only reads in the direction time ran. Reversing it would make every
 * axis appear to move backwards.
 *
 * ## An axis not asked in a round says so
 *
 * A round that did not ask about an axis leaves a gap, and the gap is reported
 * rather than closed up. Silently skipping it would put two figures next to each
 * other as though they were consecutive measurements, when a round in between
 * asked about something else - and a set can be reworded between rounds, which is
 * precisely when this happens.
 *
 * @param {ReturnType<typeof assessmentStanding>[]} rows
 * @returns {{ set: string, setName: string, axis: string, asked: number,
 *   points: { day: string, asked: boolean, mean: number | null, n: number,
 *     assessors: string[] }[] }[]}
 */
export function axisSeries(rows) {
  const history = rounds(rows);
  // Oldest first: see the header. `rounds` hands them back newest-first.
  const days = history.map((r) => r.day).reverse();

  /** @type {Map<string, { set: string, setName: string, axis: string }>} */
  const axes = new Map();
  for (const round of history) {
    for (const axis of round.byAxis) {
      axes.set(`${axis.set}\u0000${axis.axis}`, {
        set: axis.set,
        setName: axis.setName,
        axis: axis.axis
      });
    }
  }

  return [...axes.entries()]
    .map(([key, meta]) => {
      const points = days.map((day) => {
        const round = history.find((r) => r.day === day);
        const figure = round?.byAxis.find((a) => `${a.set}\u0000${a.axis}` === key);
        if (figure === undefined) {
          return { day, asked: false, mean: null, n: 0, assessors: /** @type {string[]} */ ([]) };
        }
        /*
         * Who answered THIS axis in this round, not who answered the round. An
         * assessor can skip an axis, and naming them under a figure they did not
         * give is the sort of error that only shows up in a conversation.
         */
        const assessors = [
          ...new Set(
            (round?.answers ?? [])
              .filter(
                (a) =>
                  a.set === meta.set &&
                  a.scores.some((sc) => sc.axis === meta.axis && sc.score !== null)
              )
              .map((a) => a.assessor)
              .filter((a) => a !== "")
          )
        ].sort((a, b) => a.localeCompare(b));
        return { day, asked: true, mean: figure.mean, n: figure.n, assessors };
      });

      return {
        ...meta,
        /* How many rounds actually asked about it, so a view can say "asked
           once" rather than drawing a series of one point and a gap. */
        asked: points.filter((pt) => pt.asked).length,
        points
      };
    })
    .sort((a, b) => a.setName.localeCompare(b.setName) || a.axis.localeCompare(b.axis));
}

/**
 * What survives a round once the answers are gone.
 *
 * ## Why this shape exists
 *
 * The day he leaves the job, the scores go and the fact a round happened stays -
 * alternative B on the epic, chosen 2026-09-10. That needs a round that can
 * outlive its own answers, and until now there was no such thing: a round is
 * derived by grouping answers, so deleting the answers deleted the rounds with
 * them. This is the row that is materialised instead.
 *
 * ## What it deliberately does not carry
 *
 * No person, no assessor names, no scores, no notes, no weights. Just that a
 * round on a question set ran on a day, and how much came back.
 *
 * B's own wording lists the date, the set and how many answered - and no
 * subject. That is the right reading rather than an omission: what he keeps is
 * his own record as a leader, which is that he ran rounds, this often, with
 * these sets. Keeping the person would mean carrying "this named colleague was
 * assessed" out of a job he has left, which is a fact about them and the exact
 * thing alternative B exists to stop him taking with him.
 *
 * People are counted, not named, because "a round covering four people" is about
 * how he worked and "a round covering her" is about her.
 *
 * @param {ReturnType<typeof assessmentStanding>[]} rows
 * @returns {{ day: string, set: string, setName: string, answers: number,
 *   assessors: number, people: number, silent: number }[]}
 */
export function roundSummaries(rows) {
  /** @type {Map<string, { day: string, set: string, setName: string,
   *   answers: number, assessors: Set<string>, people: Set<string>, silent: number }>} */
  const groups = new Map();

  for (const row of rows) {
    if (row.at === 0) {
      continue;
    }
    const day = new Date(row.at).toISOString().slice(0, 10);
    const key = `${day}\u0000${row.set}`;
    const at = groups.get(key) ?? {
      day,
      set: row.set,
      setName: row.setName,
      answers: 0,
      assessors: new Set(),
      people: new Set(),
      silent: 0
    };
    at.answers += 1;
    if (row.assessor !== "") {
      at.assessors.add(row.assessor);
    }
    if (row.person !== "") {
      at.people.add(row.person);
    }
    if (!row.saidAnything) {
      at.silent += 1;
    }
    groups.set(key, at);
  }

  return [...groups.values()]
    .map((g) => ({
      day: g.day,
      set: g.set,
      setName: g.setName,
      answers: g.answers,
      /* Counts, and the Sets never leave this function - so no name can reach a
         stored row by accident later. */
      assessors: g.assessors.size,
      people: g.people.size,
      silent: g.silent
    }))
    .sort((a, b) => b.day.localeCompare(a.day) || a.setName.localeCompare(b.setName));
}

/**
 * Assessments that look like the same assessor answering twice about the same
 * person on the same day.
 *
 * Reported rather than silently dropped. The reference implementation has a
 * real pair like this - one assessor, one day, 4.3 and 3.0 - and neither
 * automatic answer is right: keeping both counts one opinion twice and moves
 * every mean, while picking one is the tool deciding which of two things
 * somebody said is the one they meant. So both stay, both are counted, and the
 * collision is surfaced for a person to resolve.
 *
 * Matched on the day rather than the instant, because a form filled in twice
 * within a minute and twice within an hour are the same mistake.
 *
 * @param {ReturnType<typeof assessmentStanding>[]} rows
 * @returns {{ assessor: string, day: string, ids: string[] }[]}
 */
export function doubleAnswers(rows) {
  /** @type {Map<string, { assessor: string, day: string, ids: string[] }>} */
  const seen = new Map();

  for (const row of rows) {
    const who = row.assessor.trim().toLowerCase();
    if (who === "" || row.at === 0) {
      continue;
    }
    const day = new Date(row.at).toISOString().slice(0, 10);
    const key = `${who}\u0000${day}`;
    const at = seen.get(key);
    if (at === undefined) {
      seen.set(key, { assessor: row.assessor, day, ids: [row.id] });
    } else {
      at.ids.push(row.id);
    }
  }

  return [...seen.values()].filter((g) => g.ids.length > 1);
}

/**
 * The distinct occasions a person has been assessed on.
 *
 * Days rather than rows, because a round is one occasion however many people
 * answered it - and it is what decides whether a trend can be drawn at all. The
 * reference implementation draws a curve over three answers from one afternoon,
 * which looks like movement and is one point.
 *
 * @param {ReturnType<typeof assessmentStanding>[]} rows
 * @returns {string[]} ISO days, oldest first.
 */
export function occasions(rows) {
  const days = new Set(
    rows.filter((r) => r.at > 0).map((r) => new Date(r.at).toISOString().slice(0, 10))
  );
  return [...days].sort();
}
