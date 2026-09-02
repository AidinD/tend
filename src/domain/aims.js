/**
 * Goals he sets for himself.
 *
 * ## Why this is not a practice, and not a growth thread
 *
 * A practice is a principle from something he read, flagged in Nib, emphasised
 * until it starts coming naturally. `practices.js` refuses to put a clock on one
 * and is right to: a deadline on internalising a habit is a deadline on
 * something that does not have one. An aim is the other thing - something he
 * wants to be able to DO, with a stated way of telling whether it happened.
 *
 * A growth thread has almost exactly the right shape and is about somebody else.
 * Its fields that carry consent - what they said, whether it has been put to
 * them, whether they want it - are meaningless turned inward, and the question
 * that decides whether a self-set goal is worth anything has no field there at
 * all.
 *
 * ## That question, which is the whole design
 *
 * Who judges? The person assessing is the person doing, so "I feel I handled
 * that better" is not evidence, it is a mood. It is also exactly what a rolling
 * development point already is, and a real one was seen rolling for a second
 * time the day this was built: kept to next meeting, with its owner's own
 * summary of it being "you can always get better".
 *
 * So an aim has to name where its verdict comes from, and only three answers are
 * honest:
 *
 *   `record`  Arithmetic over rows he already writes. The app can count it, and
 *             counting cannot be talked out of an answer.
 *   `asked`   Somebody else says so, and the aim names who. Costs a
 *             conversation, which is the point.
 *   `logged`  He records an instance each time it happens, dated. A count of
 *             occasions rather than an impression of a quarter.
 *
 * An aim with no source is refused at the write. Same reason a duty whose
 * evidence kinds can never match its subject is refused: a goal nothing can ever
 * satisfy is not a goal, it is a standing reproach.
 *
 * ## And the half that makes it usable
 *
 * `through` - which real work this happens in. Both development directions that
 * landed well this week landed because they sat inside work already being done,
 * and the two that had stalled were the ones living in somebody's spare time.
 * A goal with no `through` is a goal waiting for a free evening.
 *
 * Nothing here touches the store.
 */

/**
 * Where an aim's verdict comes from. See the header for why there are three.
 *
 * @type {Record<string, { label: string, means: string, asks: string }>}
 */
export const SOURCES = {
  record: {
    label: "The record can count it",
    means: "Arithmetic over rows already written. No judgement, and no talking yourself round.",
    asks: "Which number, and what does it have to read?"
  },
  asked: {
    label: "Somebody else says so",
    means: "It costs a conversation, which is what makes it worth having.",
    asks: "Who, and when will you ask them?"
  },
  logged: {
    label: "You log it when it happens",
    means:
      "A dated occasion each time, so the answer is a count rather than an impression. " +
      "Occasions you missed count too - the gap between them IS the reading.",
    asks: "What counts as one instance, plainly enough that you cannot argue with it later?"
  }
};

/** @param {unknown} source */
export function isSource(source) {
  return typeof source === "string" && Object.hasOwn(SOURCES, source);
}

/**
 * How often an aim should come up, by default.
 *
 * Three weeks. A month is long enough that a wrong aim eats a quarter, and a
 * fortnight turns a direction into a status report on your own character. This
 * is deliberately shorter than a growth thread's month, because nobody else is
 * in the room to notice it has gone quiet.
 */
export const DEFAULT_CADENCE_DAYS = 21;

/**
 * How long before the aim itself gets questioned rather than pursued.
 *
 * A horizon is not a deadline. Nothing is late when it passes; the aim simply
 * stops being taken for granted and gets asked about: is this still the thing?
 */
export const DEFAULT_HORIZON_DAYS = 120;

/**
 * The most aims live at once.
 *
 * Two. Three of anything is the limit this app keeps for things it shows, and
 * for things he is personally trying to change it is lower still: working on
 * four aspects of your own conduct at once is working on none, and unlike a
 * roster there is no way to divide the attention.
 */
export const AT_ONCE = 2;

/** @typedef {"open" | "reached" | "dropped"} AimStatus */

/** @type {Record<string, { label: string }>} */
export const STATUSES = {
  open: { label: "Open" },
  reached: { label: "Reached" },
  dropped: { label: "Let go" }
};

/** @param {any} row */
export function isLive(row) {
  return !row._deleted && String(row.status ?? "open") === "open";
}

/**
 * What an aim is still missing, asked per sitting rather than demanded up front.
 *
 * An aim that cannot be created until every field is answered is an aim created
 * in a text file instead. But the gaps stay visible, and the ones here are the
 * ones that decide whether it is a goal at all.
 *
 * @param {any} row
 * @returns {string[]}
 */
export function missing(row) {
  /** @type {string[]} */
  const gaps = [];

  if (String(row.measure ?? "").trim() === "") {
    gaps.push(
      isSource(row.source)
        ? SOURCES[String(row.source)].asks
        : "How will you know? Name the source before the test."
    );
  }
  if (String(row.source ?? "") === "asked" && String(row.asksWho ?? "").trim() === "") {
    gaps.push("Who are you asking, and when?");
  }
  if (String(row.through ?? "").trim() === "") {
    gaps.push("Which real work does this happen in? Not a habit in the abstract.");
  }
  return gaps;
}

/**
 * One aim as it stands, with how overdue the thinking is.
 *
 * `seen` and `missed` are separate counts on purpose, and the pair is the whole
 * evaluation: logged eight times and seen twice says something no single number
 * says. The same reasoning as a growth thread's talked-versus-observed.
 *
 * @param {any} row
 * @param {any[]} notes
 * @param {number} now
 */
export function aimStanding(row, notes, now) {
  const mine = notes.filter((n) => String(n.aim) === String(row.id));
  const seen = mine.filter((n) => n.happened === true);
  const missed = mine.filter((n) => n.happened === false);

  const last = mine
    .map((n) => Number(n.at ?? 0))
    .sort((a, b) => b - a)[0];
  const from = last ?? Number(row.startedAt ?? now);
  const daysSince = Math.max(0, Math.floor((now - from) / 86_400_000));
  const cadence = Number(row.cadenceDays) > 0 ? Number(row.cadenceDays) : DEFAULT_CADENCE_DAYS;

  return {
    id: String(row.id),
    aim: String(row.aim ?? ""),
    why: String(row.why ?? ""),
    source: String(row.source ?? ""),
    measure: String(row.measure ?? ""),
    asksWho: String(row.asksWho ?? ""),
    through: String(row.through ?? ""),
    status: String(row.status ?? "open"),
    logged: mine.length,
    seen: seen.length,
    missed: missed.length,
    lastAt: last ?? null,
    daysSince,
    cadenceDays: cadence,
    // Nothing is late when a horizon passes. It stops being taken for granted.
    pastHorizon:
      typeof row.horizon === "number" && Number.isFinite(row.horizon) ? now > row.horizon : false,
    overdue: isLive(row) && daysSince > cadence,
    missing: missing(row)
  };
}
