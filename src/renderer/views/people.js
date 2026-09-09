/**
 * People, grouped by relationship rather than by org chart.
 *
 * The grouping is the point in the work half. What you owe someone you lead
 * daily is not what you owe someone you manage from two teams away, and a tool
 * that lists them together hides the one gap that matters most.
 *
 * ## Both halves, from one file
 *
 * The private half has people too, and this page draws them - with a different
 * vocabulary and a much shorter person page. What differs is asked rather than
 * branched on: `vocabulary` says which relationships exist here and `person`
 * says which blocks this page may show, both from `domain/halves.js`.
 *
 * The first version of the private half did none of this, and the symptom was
 * exact: "Add someone" asked whether this person was one you lead and manage,
 * manage remotely, or are a stakeholder to. Six management relationships offered
 * for somebody's family, because the list was a constant compiled into this
 * file.
 */

import {
  act,
  ask,
  asDateInput,
  kindsFor,
  esc,
  form,
  pill,
  readFailed,
  readFailedHtml,
  tend,
  toast
} from "../ui.js";
import { go, refresh } from "../app.js";
import { personBlocksIn } from "../../domain/halves.js";
import { WEIGHTS } from "../../domain/assessments.js";
import { isRunning, modelActions, modelStatus, resultFor, run, themesHtml } from "../model.js";
import { actions as growthActions, threadsBlock } from "./growth.js";
import { actions as planActions, planBlock } from "./plan.js";
import { actions as journalActions } from "./journal.js";
import { actions as waitingActions, waitingBlock } from "./waiting.js";
import { T } from "../text.js";

const words = T.people;

/**
 * This half's vocabulary, asked once per draw.
 *
 * Derived rather than written out, because the hand-written version of the group
 * list was the fourth copy of the same thing and it hid people: it had no row for
 * one relationship type, so everybody with that type simply did not appear on the
 * roster. No error, no empty group, no trace - in the store and off the page.
 *
 * Asked per draw rather than cached, because it is a local call and a cache here
 * would be the thing that survives a switch of halves.
 */
async function vocabulary() {
  const v = await tend.invoke("vocabulary");
  return {
    half: String(v?.half ?? "work"),
    relations: Array.isArray(v?.relations) ? v.relations : [],
    defaultRelation: String(v?.defaultRelation ?? "lead-and-manage")
  };
}

/** @param {Record<string, any>} params */
export async function render(params) {
  if (params.person) {
    return personPage(params.person);
  }

  const [roster, vocab, archived] = await Promise.all([
    tend.invoke("people"),
    vocabulary(),
    tend.invoke("archivedPeople")
  ]);
  const isPrivate = vocab.half === "private";

  const header = `
    <div class="view-head">
      <div class="head-row">
        <div>
          <h1 class="view-title">${words.title}</h1>
          <p class="view-sub">${
            isPrivate
              ? words.subPrivate
              : words.subWork
          }</p>
        </div>
        <button class="act primary" data-act="addPerson">${words.addButton}</button>
      </div>
    </div>`;

  // Its own group rather than a filter on the roster above: an archived
  // person is not a kind of active person, and mixing the two into one
  // list is how "who is active" quietly stops being a question this page
  // answers. Rendered even when the active roster is empty - the whole
  // roster archived one afternoon should not read as "nobody here", it
  // should read as "everybody is one click away".
  const archivedGroup = archivedGroupHtml(archived);

  if (readFailed(roster)) {
    return `${header}${readFailedHtml(words.readFailedRoster, roster)}${archivedGroup}`;
  }

  if (!Array.isArray(roster) || roster.length === 0) {
    // "Nobody yet" and "everybody is archived" are different facts, and after
    // the bulk archive the second one is the common case. Telling somebody who
    // has just archived a whole roster to "add the people you lead" reads as
    // though the record is gone.
    const anyArchived = Array.isArray(archived) && archived.length > 0;
    return `${header}<div class="empty">
      ${
        anyArchived
          ? words.emptyArchived
          : isPrivate
            ? words.emptyPrivate
            : words.emptyWork
      }
    </div>${archivedGroup}`;
  }

  const body = vocab.relations.map((/** @type {any} */ { value: relation, label }) => {
    const members = roster.filter((/** @type {any} */ p) => p.relation === relation);
    if (members.length === 0) {
      return "";
    }
    const rows = members
      .map(
        /*
         * The row carries the drift's severity, not only a pill saying it.
         *
         * A person 26 weeks behind used to look exactly like a person who is
         * fine, give or take one small word on the far right - so a roster had
         * to be read rather than scanned, which on the page whose whole job is
         * "who needs me" is the wrong way round. Cards already speak this
         * language; the roster now speaks the same one.
         *
         * Not in the private half: there is no drift there, and marking family
         * by urgency is the thing the empty right-hand side above exists to
         * avoid.
         */
        (/** @type {any} */ p) => `<button class="row${!isPrivate && p.worstDrift ? ` sev-${esc(p.worstDrift.urgency)}` : ""}" data-act="open" data-person="${esc(p.id)}">
          <span class="row-name">${esc(p.name)}</span>
          <span class="row-right">
            ${p.availability && !isPrivate ? `<span class="pill plain">${esc(p.availability)}</span>` : ""}
            ${
              isPrivate
                ? // Nothing on the right at all. There is no drift here, and "no
                  // duty applies" written beside somebody's family is worse than
                  // an empty row - it answers a question nobody asked.
                  ""
                : p.worstDrift
                  ? `<span class="row-meta">${esc(p.worstDrift.duty)}</span>${pill(p.worstDrift.urgency)}<span class="pill plain">${esc(p.worstDrift.behindBy)}</span>`
                  : `<span class="row-meta">${p.availability === "away" ? words.awayNothing : p.availability === "left" ? words.leftNothing : words.noDuty}</span>`
            }
          </span>
        </button>`
      )
      .join("");
    return `<div class="group">
      <div class="group-head"><span class="group-title">${esc(label)}</span><span class="group-rule"></span><span class="group-meta">${members.length}</span></div>
      <div class="rows">${rows}</div>
    </div>`;
  }).join("");

  return header + body + archivedGroup;
}

/**
 * The "show archived" path: a closed-by-default group at the bottom of the
 * roster, not a fourth relationship group above - an archived person is not
 * currently anyone you lead, manage or live beside, and listing them
 * alongside people who are would make the roster answer "who is active"
 * wrong. `<details>` rather than a toggle button wired to `refresh()`: the
 * open/closed state is free, and it needs no action of its own - only
 * `actions.open` and `actions.unarchive`, both of which already exist.
 *
 * @param {any[] | {error: string}} archived
 */
function archivedGroupHtml(archived) {
  // A failed read said "nothing is archived", which on the one page where the
  // archived group may be the only content is the most misleading answer
  // available.
  if (readFailed(archived)) {
    return readFailedHtml(words.readFailedArchived, archived);
  }
  const rows = Array.isArray(archived) ? archived : [];
  if (rows.length === 0) {
    return "";
  }
  const items = rows
    .map(
      (/** @type {any} */ p) => `<div class="row static">
        <span class="row-name">${esc(p.name)}</span>
        <span class="row-right">
          <span class="pill plain">${words.archivedOn(esc(new Date(Number(p.archivedAt)).toISOString().slice(0, 10)))}</span>
          <button class="act tiny" data-act="open" data-person="${esc(p.id)}">${words.view}</button>
          <button class="act tiny" data-act="unarchive" data-person="${esc(p.id)}" data-name="${esc(p.name)}">${words.unarchive}</button>
        </span>
      </div>`
    )
    .join("");
  return `<details class="group archived-group">
    <summary class="group-head archived-summary">
      <span class="group-title">${words.archivedGroup}</span><span class="group-rule"></span><span class="group-meta">${rows.length}</span>
    </summary>
    <div class="rows">${items}</div>
  </details>`;
}

/** @param {string} id */
async function personPage(id) {
  const p = await tend.invoke("person", { person: id });
  if (p.error) {
    return `<div class="card sev-critical"><div class="card-top">
      <h2 class="card-title">${words.notFoundTitle}</h2></div><p class="card-why">${esc(p.error)}</p>
      <div class="card-foot"><button class="act" data-act="back">${words.allPeople}</button></div></div>`;
  }

  /*
   * Which blocks this page may show. From the service, which reads the store's
   * own half.
   *
   * The fallback is derived rather than written out, and the hand-written one it
   * replaces had gone stale exactly as this file's own header warns: it still
   * said `themes: true`, a flag renamed to `observations` some time ago, and it
   * had never gained `moments`. So the one path that used it - a payload with no
   * blocks at all - would have hidden two blocks and shown neither.
   */
  const blocks = p.blocks ?? personBlocksIn("work");

  /*
   * A second read, the same shape as `momentsFor` below and gated the same way.
   * Kept out of `person()` because the aggregate is its own thing with its own
   * refusals, and folding it in would have put a colleague's ratings into every
   * payload that asks who somebody is.
   */
  const rated = blocks.assessments
    ? await tend.invoke("assessments", { person: String(p.id) })
    : null;

  const list = (/** @type {string} */ title, /** @type {string} */ body, /** @type {string} */ emptyText) =>
    `<div class="block"><div class="block-title">${esc(title)}</div>${body || `<div class="empty">${esc(emptyText)}</div>`}</div>`;

  /*
   * A block whose rows are shut, with a line saying what they amount to.
   *
   * `<details>` rather than a button wired to a refresh, the same choice the
   * archived roster group makes and for the same reason: the open state is free
   * and it needs no action of its own.
   *
   * The summary line is not a repeat of the title. The title says what the
   * block is; the line says what is in it, which is the part that decides
   * whether it is worth opening.
   */
  const folded = (
    /** @type {string} */ title,
    /** @type {string} */ summary,
    /** @type {string} */ body,
    /** @type {string} */ emptyText
  ) =>
    body === ""
      ? `<div class="block"><div class="block-title">${esc(title)}</div><div class="empty">${esc(emptyText)}</div></div>`
      : `<details class="block block-fold">
          <summary class="block-fold-head">
            <span class="block-title">${esc(title)}</span>
            <span class="block-fold-sum">${esc(summary)}</span>
          </summary>
          ${body}
        </details>`;

  /*
   * One row per clock that applies to this person, running or switched off.
   *
   * The switched-off one is here rather than absent, which is the whole reason
   * this list stopped being built from `expandCadences`: a duty he silenced for
   * one person generates no cadence, so an absence was the only trace of the
   * decision - and an absence reads as a gap in the setup rather than as a
   * choice. The pill says which of the three it is, so "the duty's interval",
   * "his own" and "off" are never guesses from the number.
   *
   * The button is on the row rather than in the block head, because the thing
   * being set is the pair. A control above a list of four duties would have to
   * ask which one, having just shown them.
   */
  const cadences = p.cadences
    .map((/** @type {any} */ c) => {
      const state = c.muted
        ? `<span class="pill plain">${words.cadenceMutedPill}</span>`
        : c.fromDuty
          ? pill(c.urgency)
          : `<span class="pill plain">${words.cadenceOwnPill(Number(c.everyDays))}</span>${pill(c.urgency)}`;

      /*
       * The row carries the drift, not only the pill at the far right of it.
       *
       * On a wide window the pill is most of a screen away from the sentence it
       * is about, so a page of these read as one grey field and the late one was
       * no easier to find than the rest. A switched-off clock gets no bar: there
       * is no drift to be urgent about, and a coloured edge would be the page
       * inventing one.
       */
      return `<div class="line${c.muted || !c.urgency ? "" : ` sev-${esc(String(c.urgency))}`}">
        <span class="line-when">${esc(String(c.behindBy ?? ""))}</span>
        <span class="line-text">${
          c.muted
            ? words.cadenceMutedLine(esc(c.duty), esc(c.lastHappened))
            : words.cadenceLine(esc(c.duty), esc(c.target), esc(c.lastHappened))
        }${c.why ? `<span class="src">${esc(c.why)}</span>` : ""}</span>
        <span class="line-right">
          ${state}
          <button class="act tiny" data-act="setPersonCadence" data-person="${esc(p.id)}"
            data-person-name="${esc(p.name)}"
            data-duty="${esc(c.dutyId)}" data-duty-name="${esc(c.duty)}"
            data-duty-days="${esc(String(c.dutyDays ?? ""))}"
            data-every="${esc(c.fromDuty || c.muted ? "" : String(c.everyDays))}"
            data-muted="${c.muted ? "1" : ""}">${words.cadenceSetButton}</button>
        </span>
      </div>`;
    })
    .join("");

  /*
   * Feedback rounds, in three parts: what every answer amounts to per axis, any
   * collision, and then the rounds themselves in the order they happened.
   *
   * There is no figure for the person anywhere in here, and the service does
   * not send one. The reference implementation this was ported from shows a 3.4
   * averaged over one assessor answering about technical quality and another
   * about delivery, and that number is not a weak signal - nothing was measured
   * twice. Per axis and per set, each with its own n.
   *
   * The answers sit inside the round they arrived on rather than in one flat
   * list by date. The flat list was the first version and it read as one long
   * pile: twelve rows all carrying the same date are twelve chances to mistake
   * one occasion for twelve, and comparing this round against the last meant
   * finding where one date stopped and the other began. What the feature exists
   * for is that comparison.
   */
  const assessed = (() => {
    if (rated === null || rated.error) {
      return "";
    }
    const answers = Array.isArray(rated.answers) ? rated.answers : [];
    const button = `<button class="act" data-act="recordAssessment" data-person="${esc(p.id)}"
        data-person-name="${esc(p.name)}">${words.assessmentRecordButton}</button>`;

    if (answers.length === 0) {
      return `<div class="block">
        <div class="block-title">${esc(words.assessmentsBlock)}</div>
        <div class="empty">${words.assessmentsNone}</div>
        ${button}
      </div>`;
    }

    /*
     * The offer, above the figures rather than under them.
     *
     * It is a question about what the numbers below it mean - whether a round
     * counts - so reading them first and then being asked is the wrong order.
     * It says what accepting claims and what it will write, because a button
     * that silences a ninety-day duty may not be a button whose effect has to
     * be remembered.
     */
    const offer = rated.offer;
    const offerBlock =
      offer === null || offer === undefined
        ? ""
        : `<div class="prep-block">
             <h3 class="prep-head">${words.assessmentOfferTitle}</h3>
             <p class="prep-note">${words.assessmentOffer(
               Number(offer.answers),
               Number(offer.assessors)
             )}</p>
             ${
               Number(offer.saidNothing) === 0
                 ? ""
                 : `<p class="card-why warn-text">${words.assessmentOfferSilent(
                     Number(offer.saidNothing)
                   )}</p>`
             }
             <p class="prep-note">${words.assessmentOfferWhat(
               esc(offer.duties.map((/** @type {any} */ d) => d.name).join(", "))
             )}</p>
             <div class="card-foot">
               <button class="act primary" data-act="markRoundRun" data-person="${esc(p.id)}"
                 data-person-name="${esc(p.name)}">${words.assessmentOfferButton}</button>
             </div>
           </div>`;


    /*
     * One answer. The date is on the round above it rather than repeated on
     * every row, which is the whole gain of grouping: twelve rows that all said
     * the same date were twelve chances to read the list as twelve occasions.
     *
     * @param {any} r
     */
    const answerLine = (/** @type {any} */ r) => `<div class="line">
          <span class="line-text">
            <strong>${esc(words.assessmentBy(r.assessor, r.assessorRole))}</strong>
            <span class="src">${esc(r.setName)} - ${r.scores
              .map((/** @type {any} */ x) => `${esc(x.axis)} ${x.score}`)
              .join(", ")}</span>
            ${r.note ? `<span class="src">${esc(r.note)}</span>` : `<span class="src">${words.assessmentSaidNothing}</span>`}
            ${r.weighWhy ? `<span class="src">${words.assessmentWeighed(esc(r.weighWhy))}</span>` : ""}
          </span>
          <span class="line-right">
            ${r.assessorWeight === "unset" ? "" : `<span class="pill plain">${esc(r.assessorWeightLabel)}</span>`}
            <button class="act tiny" data-act="removeAssessment" data-id="${esc(r.id)}"
              data-who="${esc(r.assessor)}">${words.assessmentRemove}</button>
          </span>
        </div>`;

    /*
     * One axis figure, used both for the aggregate over everything and inside a
     * single round. The same shape in both places on purpose: a reader comparing
     * a round against the whole record should not have to also translate between
     * two layouts.
     *
     * @param {any} a
     */
    /*
     * What the weight adds to an axis, and only when it says something.
     *
     * The mean stays the mean - every answer counts once and there is no
     * weighted average anywhere. This is the same axis with the answers he
     * weighed low set aside, which answers the question the weight was recorded
     * for: is this figure being carried by the answers I do not trust.
     *
     * Absent when nothing was weighed low, because a second number that always
     * equals the first teaches somebody to stop reading either. When EVERY
     * answer was weighed low there is no second figure to show, and the finding
     * is said in words instead - that is worth more than any mean on the row.
     *
     * @param {any} a
     */
    const discounting = (/** @type {any} */ a) => {
      if (Number(a.discounted) === 0) {
        return "";
      }
      return `<span class="src">${
        a.meanDiscounting === null
          ? words.assessmentAllDiscounted(Number(a.n))
          : words.assessmentDiscounting(
              Number(a.meanDiscounting).toFixed(1),
              Number(a.nDiscounting),
              Number(a.discounted)
            )
      }</span>`;
    };

    /*
     * The score as something to look at rather than as a string to parse.
     *
     * Five pips with the mean filled in, which is the one thing on the row that
     * can be read without reading. It is deliberately not coloured by value: a
     * red 2 and a green 5 against a named colleague's name is the tool passing
     * judgement in the margin, and the scale's own 3 is defined as "delivers to
     * plan" - good, not mediocre - so any colour ramp would say the wrong thing
     * before a word had been read.
     *
     * @param {number} mean
     */
    const pips = (/** @type {number} */ mean) =>
      `<span class="pips" aria-hidden="true">${[1, 2, 3, 4, 5]
        .map(
          (step) =>
            `<span class="pip${
              mean >= step ? " on" : mean > step - 1 ? " half" : ""
            }"></span>`
        )
        .join("")}</span>`;

    const axisLine = (/** @type {any} */ a) => `<div class="line axis-line">
          <span class="axis-score">
            <span class="axis-mean">${words.assessmentAxisMean(a.mean.toFixed(1))}</span>
            <span class="axis-of">${words.assessmentAxisOutOf}</span>
          </span>
          ${pips(Number(a.mean))}
          <span class="line-text">${esc(a.axis)}${discounting(a)}</span>
          <span class="line-right">
            <span class="src">${words.assessmentAxisCount(Number(a.n))}</span>
            ${
              /*
               * Only when there is a spread to report. Three assessors at 2, 3
               * and 5 mean something entirely different from three at 3, 3 and
               * 4 - but ONE assessor has no spread at all, and printing "alla
               * lika" on every row of a first round is a pill that says nothing
               * on every line.
               */
              Number(a.n) < 2
                ? ""
                : `<span class="pill plain">${
                    a.spread === 0
                      ? words.assessmentNoSpread
                      : words.assessmentAxisSpread(a.low, a.high)
                  }</span>`
            }
          </span>
        </div>`;

    /*
     * Axes gathered under the set they belong to, with the set named once.
     *
     * It used to be repeated under every axis - three rows of the same grey set
     * name under three axes - which is most of what made the block read as a
     * wall. The set still has to be visible, because
     * two sets can ask about an axis of the same name and mean different things
     * by it, but it is a property of the group and not of each row.
     *
     * @param {any[]} axes
     */
    const axisGroups = (/** @type {any[]} */ axes) => {
      /** @type {Map<string, any[]>} */
      const bySet = new Map();
      for (const a of axes) {
        const at = bySet.get(a.set);
        if (at === undefined) {
          bySet.set(a.set, [a]);
        } else {
          at.push(a);
        }
      }
      return [...bySet.values()]
        .map(
          (group) => `<div class="axis-set">
            <div class="axis-set-name">${esc(group[0].setName)}</div>
            ${group.map(axisLine).join("")}
          </div>`
        )
        .join("");
    };

    /*
     * The axis over the rounds, and the one block on this page that only appears
     * once there is something to compare.
     *
     * Gated on `trendPossible`, which the service works out - one occasion is a
     * point, and the reference implementation draws a curve through three answers
     * from one afternoon. The gate lives there rather than here so the block and
     * the sentence explaining its absence cannot disagree.
     *
     * An axis asked in only one round so far says so instead of drawing one
     * figure and a row of gaps, which reads as a broken series rather than a
     * young one.
     */
    const seriesBlock = (() => {
      if (rated.trendPossible !== true) {
        return "";
      }
      const series = Array.isArray(rated.series) ? rated.series : [];
      if (series.length === 0) {
        return "";
      }
      return `<div class="block-title block-title-second">${esc(words.assessmentSeries)}</div>
        <p class="card-why dim">${words.assessmentSeriesWhy}</p>
        ${series
          .map(
            (/** @type {any} */ ax) => `<div class="prep-block">
              <h3 class="prep-head">${words.assessmentSeriesAxis(
                esc(ax.axis),
                esc(ax.setName)
              )}</h3>
              ${
                Number(ax.asked) < 2
                  ? `<p class="prep-note">${words.assessmentSeriesOnce}</p>`
                  : ""
              }
              ${(Array.isArray(ax.points) ? ax.points : [])
                .map(
                  (/** @type {any} */ pt) => `<div class="line${pt.asked ? "" : " dim"}">
                    <span class="line-when">${
                      pt.asked
                        ? `${words.assessmentAxisMean(Number(pt.mean).toFixed(1))} ${
                            words.assessmentAxisOutOf
                          }`
                        : words.assessmentSeriesNotAsked
                    }</span>
                    <span class="line-text">${esc(pt.day)}${
                      pt.asked
                        ? `<span class="src">${words.assessmentAxisCount(Number(pt.n))}</span>`
                        : ""
                    }</span>
                    ${
                      pt.asked && pt.assessors.length > 0
                        ? `<span class="line-note">${esc(
                            words.assessmentSeriesWho(pt.assessors.join(", "))
                          )}</span>`
                        : ""
                    }
                  </div>`
                )
                .join("")}
            </div>`
          )
          .join("")}`;
    })();

    /*
     * A round: what it said, who said it, and the answers under it.
     *
     * Deliberately carrying no change against the round before. The reasoning
     * is in `domain/assessments.js` and stated on the page itself, because a
     * missing number is the one thing a reader will assume is an oversight: a
     * round's assessors are not the last round's, so subtracting the means
     * compares two populations and reports it as movement in the person.
     */
    const roundBlocks = (Array.isArray(rated.roundHistory) ? rated.roundHistory : [])
      .map(
        (/** @type {any} */ round) => `<div class="prep-block">
          <h3 class="prep-head">${words.assessmentRoundHead(esc(round.day), Number(round.n))}</h3>
          <p class="prep-note">${words.assessmentRoundWho(esc(round.assessors.join(", ")))}</p>
          ${
            Number(round.silent) === 0
              ? ""
              : `<p class="card-why warn-text">${words.assessmentRoundSilent(Number(round.silent))}</p>`
          }
          ${axisGroups(Array.isArray(round.byAxis) ? round.byAxis : [])}
          ${(Array.isArray(round.answers) ? round.answers : []).map(answerLine).join("")}
        </div>`
      )
      .join("");

    /*
     * A collision is reported and never resolved. Two answers from one assessor
     * on one day counts one opinion twice and moves every mean, but picking one
     * of them is the tool deciding which of two things somebody said is the one
     * they meant.
     */
    const doubles = (Array.isArray(rated.doubles) ? rated.doubles : [])
      .map(
        (/** @type {any} */ d) => `<p class="card-why warn-text">${words.assessmentDouble(
          esc(d.assessor),
          esc(d.day)
        )}</p>`
      )
      .join("");

    return `<div class="block">
      <div class="block-title">${esc(words.assessmentsBlock)}</div>
      <p class="card-why dim">${words.assessmentsSummary(Number(rated.rounds), answers.length)}${
        rated.trendPossible ? "" : ` ${words.assessmentsOneOccasion}`
      }</p>
      ${doubles ? `<div class="prep-block"><h3 class="prep-head">${words.assessmentDoubleTitle}</h3>${doubles}</div>` : ""}
      ${offerBlock}
      ${axisGroups(Array.isArray(rated.byAxis) ? rated.byAxis : [])}
      <div class="block-title block-title-second">${esc(words.assessmentRounds)}</div>
      <p class="card-why dim">${words.assessmentRoundsWhy}</p>
      ${roundBlocks}
      ${seriesBlock}
      ${button}
    </div>`;
  })();

  const promises = p.openPromises
    .map(
      (/** @type {any} */ x) => `<div class="line sev-${esc(String(x.urgency))}">
        <span class="line-when">${esc(x.openFor)}</span>
        <span class="line-text">${esc(x.text)}</span>
        <span class="line-right">
          ${pill(x.urgency)}
          <button class="act tiny" data-act="resolvePromise" data-id="${esc(x.id)}">Done</button>
        </span>
      </div>`
    )
    .join("");

  /*
   * Each line can be taken back. A contact logged against the wrong person, or
   * as the wrong kind, is worse than no log at all: it moves a clock and then
   * looks identical to a real one. There was no way to undo it.
   *
   * The button goes inside `line-right` like every other control on a `line`,
   * and that wrapper is not decoration - it carries `flex: none`. Without it the
   * button is a shrinkable flex item beside a note that can be a paragraph, so a
   * long note squeezed "Not right" until the label wrapped onto two lines and the
   * row grew to fit it. Three rows had been written without it.
   */
  /** One history row, with its own take-it-back button. */
  const contactLine = (/** @type {any} */ row) => `<div class="line">
        <span class="line-when">${esc(row.when)}</span>
        <span class="line-text"><strong>${esc(row.kind)}</strong>${row.note ? ` - ${esc(row.note)}` : ""}</span>
        <span class="line-right">
          ${
            /*
             * Said only when it came from somewhere. A label on every row stops
             * being read, and "typed by hand" is the assumption anyway - what
             * needs marking is the row nobody typed, because that is the one
             * whose text and date came from a note rather than from a decision.
             */
            row.from === "nib" ? `<span class="pill plain">${words.fromANote}</span>` : ""
          }
          <button class="act tiny danger" data-act="unlogContact" data-id="${esc(row.id)}"
            data-what="${esc(row.kind)}${row.note ? ` - ${esc(row.note)}` : ""}">${words.notRight}</button>
        </span>
      </div>`;

  /*
   * Runs of identical rows fold into one, and open again on a click.
   *
   * Fifteen consecutive rows reading "1-1 (backfilled from the calendar)" are
   * one fact - an import ran - written fifteen times. Folding them is not
   * hiding anything: each row keeps its own "Not right" button one click away,
   * which matters because a mislogged contact moves a clock and then looks
   * exactly like a real one.
   *
   * Consecutive only. Two identical rows either side of a real conversation are
   * not the same run, and merging across it would put the conversation inside a
   * fold that claims to be about the import.
   */
  /** @type {{ key: string, rows: any[] }[]} */
  const runs = [];
  for (const row of p.recentContact) {
    /*
     * `JSON.stringify` rather than the two joined by a separator character.
     *
     * A separator has to be a byte that cannot appear in either half, and the
     * obvious choices are exactly the bytes that get eaten in transit - a space
     * written here once arrived as a NUL, which left the file classified as
     * binary while behaving correctly. An encoded array has no separator to
     * lose, and `nib.js` reaches for it for the same reason.
     */
    const key = JSON.stringify([row.kind ?? null, row.note ?? null]);
    const last = runs[runs.length - 1];
    if (last !== undefined && last.key === key) {
      last.rows.push(row);
    } else {
      runs.push({ key, rows: [row] });
    }
  }

  const contact = runs
    .map((run) => {
      if (run.rows.length < 3) {
        return run.rows.map(contactLine).join("");
      }
      const first = run.rows[run.rows.length - 1];
      const latest = run.rows[0];
      const one = run.rows[0];
      return `<details class="line-fold">
        <summary class="line">
          <span class="line-when">${esc(first.when)} - ${esc(latest.when)}</span>
          <span class="line-text"><strong>${esc(one.kind)}</strong>${one.note ? ` - ${esc(one.note)}` : ""}</span>
          <span class="line-right"><span class="pill plain">${words.identical(run.rows.length)}</span></span>
        </summary>
        <div class="line-fold-rows">${run.rows.map(contactLine).join("")}</div>
      </details>`;
    })
    .join("");

  /*
   * What the rows amount to, said in one line so the rows themselves can stay
   * shut. Every number comes from the service, counted over the whole set
   * rather than the capped twenty rendered above - see domain/contact.js.
   */
  const cs = p.contactSummary ?? { total: 0 };
  const month = (/** @type {number} */ at) =>
    new Date(at).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  const contactSummaryLine =
    cs.total === 0
      ? words.noContactYet
      : [
          words.countOf(cs.total, cs.total === 1 ? words.conversationOne : words.conversationMany),
          cs.firstAt === null || cs.total < 2 ? null : words.since(month(cs.firstAt)),
          cs.everyDays === null
            ? null
            : words.roughlyEvery(cs.everyDays, cs.everyDays === 1 ? words.dayOne : words.dayMany),
          cs.lastWords === null || cs.lastWords === undefined ? null : words.lastAt(cs.lastWords)
        ]
          .filter((part) => part !== null)
          .join(" · ");

  // Kept as its own block. A cancellation is not a conversation, and the two
  // have to stay legible as different things - the whole value is in the
  // difference between "we never booked it" and "we booked it three times".
  const skipped = (p.skipped ?? [])
    .map(
      (/** @type {any} */ sk) => `<div class="line">
        <span class="line-when">${esc(sk.when)}</span>
        <span class="line-text">${words.didNotHappen(esc(sk.kind), sk.why ? words.skipWhy(esc(sk.why)) : "")}</span>
        <span class="line-right">
          <button class="act tiny danger" data-act="unlogSkip" data-id="${esc(sk.id)}"
            data-what="${words.skipWhat(esc(sk.kind))}">${words.notRight}</button>
        </span>
      </div>`
    )
    .join("");

  /*
   * What this page may show, decided by the half rather than by conditions
   * scattered down the middle of this function.
   *
   * The distinction is not cosmetic. A growth thread is a direction you have
   * decided somebody should develop in, with a marker you watch for - run that
   * on your own child and the tool has become something else. An observation is
   * a record of somebody else's state, which is precisely what the private
   * journal's one rule forbids. Contact and cancellations feed cadences, and
   * there are none here.
   */
  const model = await modelStatus();
  const themesKey = `themes:${p.id}`;
  const growing = blocks.growth ? await threadsBlock(String(p.id)) : "";
  /*
   * Gated on the same block flag as growth, so the private side never shows
   * one. A performance plan is a work-half object by definition - there is no
   * bar to be below outside a job.
   */
  const plan = blocks.growth ? await planBlock(String(p.id)) : "";
  const waitingOn = blocks.waiting ? await waitingBlock(String(p.id)) : "";

  /*
   * Moments: one thing that happened, and his own part in it.
   *
   * The answer to "how has it been going", which promises and waiting cannot
   * give. His own part is shown first and in full, because it is the half of the
   * record that is his and the half worth re-reading; what happened sits under it
   * as context and is often absent, which is fine.
   */
  const moments = blocks.moments
    ? /** @type {any[]} */ (await tend.invoke("momentsFor", { person: String(p.id) }))
    : [];
  const momentLines = (Array.isArray(moments) ? moments : [])
    .map(
      (/** @type {any} */ m) => `<div class="line">
        <span class="line-when">${esc(m.when)}</span>
        <span class="line-text">${esc(m.part)}${
          m.what ? `<span class="src">${esc(m.what)}</span>` : ""
        }${
          (m.alsoThere ?? []).length > 0
            ? `<span class="src">${words.alsoThere(esc(m.alsoThere.join(", ")))}</span>`
            : ""
        }</span>
        <span class="line-right">
          <button class="act tiny danger" data-act="unlogMoment" data-id="${esc(m.id)}"
            data-what="${esc(m.part)}">${words.notRight}</button>
        </span>
      </div>`
    )
    .join("");


  /*
   * One line each, opening onto the paragraph.
   *
   * These grew to eight dense paragraphs and were the longest thing on the page
   * by a wide margin - and also the most valuable thing on it, which is why
   * neither of the obvious fixes is right. Folding the whole block puts the
   * material a review conversation is built from behind a click by default;
   * showing only the latest few rebuilds the recency bias the feedback rounds
   * exist to counter, on the page the record is read from.
   *
   * So nothing is hidden and nothing is summarised: every observation is a
   * scannable line that expands to its full text, exactly the answer the
   * proposed duties on the front page arrived at for the same problem. Past a
   * cap the remainder goes behind one more fold with its count, because
   * fifty short lines is still a wall.
   */
  const OBSERVATIONS_SHOWN = 6;

  /*
   * The two actions on an observation, and why they are not one.
   *
   * Replace is offered on every row that is still current. Erase is offered
   * only while the row could still be a paste error, and the service decides
   * that - see `forgettable`. A row that has already been corrected offers
   * neither: it is history, and the thing to revise is the correction sitting
   * above it.
   *
   * @param {any} e
   */
  const observationActions = (/** @type {any} */ e) => {
    if (e.replacedBy) {
      return "";
    }
    return `<span class="line-right">
      <button class="act tiny" data-act="replaceObservation" data-id="${esc(e.id)}"
        data-area="${esc(e.area ?? "")}"
        data-was="${esc(String(e.text ?? ""))}">${words.replaceObservation}</button>
      ${
        e.forgettable
          ? `<button class="act tiny danger" data-act="forgetObservation" data-id="${esc(e.id)}"
              data-what="${esc(words.observationHandle(String(e.text ?? "")))}">${
                words.pastedByMistake
              }</button>`
          : ""
      }
    </span>`;
  };

  const observationLine = (/** @type {any} */ e) => {
    const day = new Date(Number(e.at)).toISOString().slice(0, 10);
    const full = String(e.text ?? "");
    const handle = words.observationHandle(full);

    /*
     * What a corrected row says about itself.
     *
     * Struck through, and labelled with when it was corrected. Both, because
     * either alone fails: a strike-through with no date is a row somebody has to
     * go looking for the reason for, and a label with no strike-through is a
     * sentence at the end of a line that still reads as current at a glance -
     * which is the failure mode of the prose convention this replaces.
     *
     * The correction itself is a row in this same list, in date order, saying
     * that it replaces one. Nothing needs to be nested for the pair to read.
     */
    const state = e.replacedBy
      ? ` replaced`
      : e.replaces
        ? ` correction`
        : "";
    /*
     * A sibling of the text rather than a child of it, which is not a detail.
     *
     * `.line-text .src` is `display: block` - context prose belongs under its
     * line - and a folded summary's text is `nowrap` inside `overflow: hidden`
     * so the handle can be cut to the measure. Put together, a label inside the
     * text on a folded row lands on a second line that is either clipped away or
     * makes the row two lines tall, and one line per observation is the whole
     * point of the fold. As its own flex item at `flex: none` it stays on the
     * row and the handle shrinks around it.
     */
    const note = e.replacedBy
      ? `<span class="line-note">${words.replacedOn(
          esc(new Date(Number(e.replacedBy.at)).toISOString().slice(0, 10))
        )}</span>`
      : e.replaces
        ? `<span class="line-note">${words.replacesRow}</span>`
        : "";

    // Nothing to open when the whole note already fits on its line. A fold over
    // no hidden text is a control that does nothing, and one of those teaches
    // somebody that the others might not do anything either.
    if (handle === full.replace(/\s+/g, " ").trim()) {
      return `<div class="line obs-line${state}">
        <span class="line-when">${esc(day)}</span>
        <span class="line-text">${esc(full)}</span>
        ${note}
        ${observationActions(e)}
      </div>`;
    }

    /*
     * The buttons sit under the opened text rather than on the summary row.
     *
     * Partly because a button inside a `<summary>` also toggles the fold, so the
     * two controls fight. Mostly because this is where they belong: replacing a
     * reading of somebody should follow reading the whole of it, and a row whose
     * visible third is a handle is not the whole of it. On a short row the text
     * IS the line, so the buttons on the line are the same position.
     */
    return `<details class="line-fold obs-fold obs-line${state}">
      <summary class="line">
        <span class="line-when">${esc(day)}</span>
        <span class="line-text">${esc(handle)}</span>
        ${note}
      </summary>
      <p class="line-fold-text">${esc(full)}</p>
      <div class="line-fold-act">${observationActions(e)}</div>
    </details>`;
  };

  const observationRows = /** @type {any[]} */ (p.observations ?? []);
  const observations =
    observationRows.length === 0
      ? ""
      : observationRows.slice(0, OBSERVATIONS_SHOWN).map(observationLine).join("") +
        (observationRows.length <= OBSERVATIONS_SHOWN
          ? ""
          : `<details class="line-fold obs-older">
              <summary class="line">
                <span class="line-text">${words.observationsOlder(
                  observationRows.length - OBSERVATIONS_SHOWN
                )}</span>
              </summary>
              <div class="line-fold-rows">${observationRows
                .slice(OBSERVATIONS_SHOWN)
                .map(observationLine)
                .join("")}</div>
            </details>`);

  /*
   * Material that lives elsewhere.
   *
   * The age is on every row and it is not decoration. A reading prepared before
   * a conversation stops being current the moment that conversation happens, and
   * an undated link on somebody's page reads as advice months after it stopped
   * being any such thing. Nothing expires on its own - deciding a reading is
   * spent is a judgement, and quietly hiding it would be worse than showing it
   * plainly marked as six months old.
   *
   * A real anchor rather than a button: the main process already sends anything
   * outside the app to the real browser, so this needs no action of its own and
   * gets middle-click and copy-link for free.
   */
  const linked = (p.links ?? [])
    .map(
      (/** @type {any} */ l) => `<div class="line">
        <span class="line-when">${esc(l.added)}</span>
        <span class="line-text">
          <a href="${esc(l.url)}" target="_blank" rel="noreferrer noopener">${esc(l.title)}</a>
          ${l.note ? `<span class="src"> ${esc(l.note)}</span>` : ""}
        </span>
        <span class="line-right">
          <button class="act tiny danger" data-act="unlink" data-id="${esc(l.id)}" data-name="${esc(l.title)}">${words.remove}</button>
        </span>
      </div>`
    )
    .join("");

  return `
    <div class="view-head"><button class="act" data-act="back">${words.back}</button></div>
    <div class="panel">
      <div class="panel-head">
        <div>
          <h2 class="panel-name">${esc(p.name)}</h2>
          <p class="panel-role">${esc(p.relationMeans)}</p>
        </div>
        <div class="panel-actions">
          <span class="tag">${esc(p.relation)}</span>
          <button class="act" data-act="edit" data-person="${esc(p.id)}">${words.edit}</button>
        </div>
      </div>

      <div class="button-row">
        ${blocks.cadences ? `<button class="act primary" data-act="logContact" data-person="${esc(p.id)}">${words.logContactButton}</button>` : ""}
        ${blocks.skips ? `<button class="act" data-act="logSkip" data-person="${esc(p.id)}">${words.logSkipButton}</button>` : ""}
        <!--
          The one action that is in both halves, and the primary one where it is
          the only one. A promise is owed the same way to somebody you live with,
          and the person let down is let down in the same way.
        -->
        ${
          blocks.moments
            ? `<button class="act primary" data-act="logMoment" data-person="${esc(p.id)}">${words.logMomentButton}</button>`
            : ""
        }
        <button class="act" data-act="logPromise" data-person="${esc(p.id)}">${words.logPromiseButton}</button>
        <button class="act" data-act="link" data-person="${esc(p.id)}">${words.linkButton}</button>
        ${blocks.observations ? `<button class="act" data-act="logEvidence" data-person="${esc(p.id)}">${words.observationButton}</button>` : ""}
        ${
          blocks.observations && model.available
            ? isRunning(themesKey)
              ? `<button class="act" disabled>${words.readingNotes}</button>`
              : `<button class="act" data-act="findThemes" data-person="${esc(p.id)}">${words.themesButton}</button>`
            : ""
        }
      </div>

      ${resultFor(themesKey) === null ? "" : themesHtml(themesKey, resultFor(themesKey))}

      ${blocks.cadences ? list(words.cadencesBlock, cadences, words.cadencesNone) : ""}
      ${list(words.promisesBlock, promises, words.promisesNone)}
      ${waitingOn}
      ${growing}
      ${
        /*
         * Directly under the directions, because the two have to be read
         * together: a plan and a direction can share the same work, and seeing
         * them apart is how one quietly becomes the other.
         */
        plan
      }
      ${blocks.skips && p.skipPattern ? `<p class="card-why dim">${esc(p.skipPattern)}</p>` : ""}
      ${
        /*
         * Observations first, history after, and the history shut.
         *
         * The order was the other way round, which put fifteen rows saying an
         * import ran above the material a review conversation is built from.
         * Contact history answers "are we in step", which the cadences block
         * above has already answered in one badge; the rows themselves are only
         * wanted when something looks wrong.
         */
        blocks.observations
          ? list(words.observationsBlock, observations, words.observationsNone)
          : ""
      }
      ${
        /*
         * Under the observations and above the contact history, for the same
         * reason the observations sit there: both are material a review
         * conversation is built from, and a round of somebody else's ratings is
         * the most of that on the page. The history answers "are we in step",
         * which the cadence block has already answered in a badge.
         */
        assessed
      }
      ${
        blocks.cadences
          ? folded(words.historyBlock, contactSummaryLine, contact, words.noContactYet)
          : ""
      }
      ${blocks.skips && skipped ? list(words.skippedBlock, skipped, "") : ""}
      ${list(words.linkedBlock, linked, words.linkedNone)}
      ${
        blocks.moments
          ? list(
              words.momentsBlock,
              momentLines,
              words.momentsNone
            )
          : ""
      }

      <!--
        Own block, not inside danger-zone: archiving is reversible and does
        not belong beside Remove, which is not. Confusing the two would put
        the one destructive action a click away from the one that is not.
      -->
      <div class="block">
        ${
          p.archivedAt
            ? `<p class="card-why dim">${words.archivedNote(esc(new Date(Number(p.archivedAt)).toISOString().slice(0, 10)))}</p>
               <button class="act" data-act="unarchive" data-person="${esc(p.id)}" data-name="${esc(p.name)}">${words.unarchiveNamed(esc(p.name))}</button>`
            : `<button class="act" data-act="archive" data-person="${esc(p.id)}" data-name="${esc(p.name)}">${words.archiveNamed(esc(p.name))}</button>`
        }
      </div>

      <div class="block danger-zone">
        <button class="act danger" data-act="remove" data-person="${esc(p.id)}" data-name="${esc(p.name)}">${words.removeNamed(esc(p.name))}</button>
      </div>
    </div>
  `;
}

/**
 * Shared with the Now view's first-run card.
 *
 * @returns {Promise<boolean>} Whether someone was added.
 */
export async function addPersonDialog() {
  const vocab = await vocabulary();
  const isPrivate = vocab.half === "private";

  const values = await form({
    title: words.addTitle,
    intro: isPrivate
      ? // No mention of duties, because there are none. The relationship here is a
        // label: it groups the list and it sits on their page, and nothing is
        // derived from it. Saying so is the difference between a field somebody
        // answers carefully and a field somebody answers wrong on purpose.
        words.addIntroPrivate
      : words.addIntroWork,
    fields: [
      { name: "name", label: words.nameLabel, required: true, placeholder: isPrivate ? words.namePlaceholderPrivate : words.namePlaceholderWork },
      {
        name: "relation",
        label: isPrivate ? words.relationPrivate : words.relationWork,
        type: "select",
        // Asked, not compiled in. This is the field that offered six management
        // relationships for somebody's family.
        options: vocab.relations.map((/** @type {any} */ r) => ({ value: r.value, label: r.choice })),
        value: vocab.defaultRelation
      },
      // The start date exists to give a cadence something to measure from before
      // there is contact to measure from instead. With no cadences it is a
      // question with no consequence, and asking "since when" about a parent is
      // its own small absurdity.
      ...(isPrivate
        ? []
        : [
            {
              name: "since",
              label: words.sinceLabel,
              type: /** @type {const} */ ("date"),
              value: asDateInput(Date.now()),
              hint: words.addSinceHint
            }
          ])
    ],
    confirm: words.add
  });
  if (!values) {
    return false;
  }
  return Boolean(await act("addPerson", values, words.addedNamed(values.name)));
}

/**
 * Define a question set, from the point where one is missing.
 *
 * Reached from the picker rather than from a settings page, because the moment
 * somebody needs a set is the moment they are holding an answer with nowhere to
 * put it - and a flow that sends them elsewhere to define structure first loses
 * the answer they came to enter.
 *
 * Returns the set as the picker would have handed it over, so the caller does not
 * care which of the two paths produced it. Null when the dialog was dismissed or
 * the service refused.
 *
 * @returns {Promise<{ id: string, name: string, axes: { axis: string, asked: string }[] } | null>}
 */
async function defineQuestionSet() {
  const values = await form({
    title: words.setDefineTitle,
    intro: words.setDefineIntro,
    fields: [
      { name: "name", label: words.setNameLabel, placeholder: words.setNamePlaceholder, required: true },
      {
        name: "discipline",
        label: words.setDisciplineLabel,
        placeholder: words.setDisciplinePlaceholder
      },
      {
        name: "axes",
        label: words.setAxesLabel,
        type: "textarea",
        hint: words.setAxesHint,
        required: true
      }
    ],
    confirm: words.setDefineConfirm
  });
  if (!values) {
    return null;
  }

  /*
   * One axis per line, with anything after a colon kept as the question or the
   * anchors behind it. Split on the FIRST colon rather than the last: an axis
   * label is short and the prose after it is where a colon is likely to turn up
   * again, which is the opposite of the score parser below.
   */
  const axes = String(values.axes ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => {
      const at = line.indexOf(":");
      return at < 0
        ? { axis: line, asked: "" }
        : { axis: line.slice(0, at).trim(), asked: line.slice(at + 1).trim() };
    });

  const made = /** @type {any} */ (
    await tend.invoke("addQuestionSet", {
      name: values.name,
      discipline: values.discipline,
      axes
    })
  );
  if (made?.error) {
    toast(String(made.error), "bad");
    return null;
  }
  toast(words.setDefinedToast);
  return { id: String(made.id), name: String(values.name).trim(), axes };
}

export const actions = {
  // Growth's dialogs are shared with the prep card rather than written twice.
  // Both surfaces offer the same six things, and a second copy of any of them is
  // a copy that drifts.
  ...growthActions,
  ...planActions,
  ...waitingActions,

  /** The retry offered when a read failed rather than came back empty. */
  reload: () => {
    refresh();
  },

  /*
   * Logging a moment is the journal's dialog, opened with this person pre-ticked.
   *
   * Shared rather than written twice. It is the same act from two places, and two
   * copies of a form with a required field and a person picker is two copies that
   * drift - which this project has paid for four times over in derived lists.
   */
  logMoment: (/** @type {Record<string, string>} */ d) => journalActions.logMoment(d),

  /** @param {Record<string, string>} d */
  unlogMoment: async (d) => {
    const sure = await ask({
      title: words.unlogMomentTitle,
      body: words.unlogMomentBody(d.what),
      confirm: words.remove,
      tone: "danger"
    });
    if (sure && (await act("removeRow", { collection: "moments", id: d.id }, words.removedToast))) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  logSkip: async (d) => {
    const values = await form({
      title: words.skipTitle,
      intro: words.skipIntro,
      fields: [
        {
          name: "kind",
          label: words.skipKindLabel,
          type: "select",
          options: kindsFor("person").filter((k) => k.value !== "second-hand" && k.value !== "survey"),
          value: "one-to-one"
        },
        {
          name: "why",
          label: words.skipWhyLabel,
          placeholder: words.skipWhyPlaceholder,
          hint: words.skipWhyHint
        },
        { name: "at", label: words.skipWhenLabel, type: "date", value: asDateInput(Date.now()) }
      ],
      confirm: words.recordIt
    });
    if (!values) {
      return;
    }
    if (await act("logSkip", { person: d.person, ...values }, words.recordedToast)) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  unlogSkip: async (d) => {
    const sure = await ask({
      title: words.takeBackTitle,
      body: words.unlogSkipBody(d.what),
      confirm: words.takeItBack,
      tone: "danger"
    });
    if (sure && (await act("removeRow", { collection: "skips", id: d.id }, words.takenBackToast))) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  unlogContact: async (d) => {
    const sure = await ask({
      title: words.takeBackTitle,
      body: words.unlogContactBody(d.what),
      confirm: words.takeItBack,
      tone: "danger"
    });
    if (sure && (await act("removeRow", { collection: "touches", id: d.id }, words.takenBackToast))) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  open: (d) => go("people", { person: d.person }),
  back: () => go("people"),

  /**
   * Read across their notes and name what recurs.
   *
   * A draft, and only ever a draft. There used to be a second path that wrote
   * what it found into the record, guarded by an `apply` flag - and nothing
   * ever passed it, so the collection it wrote to could not contain a row while
   * Settings told the user a model might have put one there. The write is gone
   * rather than wired up: a stored claim about a colleague goes stale as the
   * notes under it change, which is the same reason a brief is never kept.
   *
   * @param {Record<string, string>} d
   */
  findThemes: (d) => run(`themes:${d.person}`, "detectThemes", { person: d.person }),

  ...modelActions(),

  addPerson: async () => {
    if (await addPersonDialog()) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  edit: async (d) => {
    const [p, editVocab] = await Promise.all([
      tend.invoke("person", { person: d.person }),
      vocabulary()
    ]);
    if (p.error) {
      return;
    }
    const values = await form({
      title: words.editTitle(p.name),
      intro: words.editIntro,
      fields: [
        { name: "name", label: words.nameLabel, value: p.name, required: true },
        {
          name: "relation",
          label: editVocab.half === "private" ? words.relationPrivate : words.relationWork,
          type: "select",
          // The half's own vocabulary. Offering the work list here would let a
          // private person be edited into a management relationship, and the
          // service would then refuse the save with a message about duties.
          options: editVocab.relations.map((/** @type {any} */ r) => ({ value: r.value, label: r.choice })),
          value: p.relation
        },
        {
          name: "since",
          label: words.sinceLabel,
          type: "date",
          value: p.since ? asDateInput(p.since) : "",
          hint: words.editSinceHint
        },
        {
          name: "awayUntil",
          label: words.awayLabel,
          type: "date",
          value: p.awayUntil ? asDateInput(p.awayUntil) : "",
          hint: words.awayHint
        },
        {
          name: "leftAt",
          label: words.leftLabel,
          type: "date",
          value: p.leftAt ? asDateInput(p.leftAt) : "",
          hint: words.leftHint
        }
      ],
      confirm: words.save
    });
    if (!values) {
      return;
    }
    // An empty date field arrives as undefined, which the service reads as
    // "leave it alone". For these two, empty has to mean "clear it" - somebody
    // coming back early, or a resignation withdrawn - so it is made explicit.
    const fields = {
      ...values,
      awayUntil: values.awayUntil ?? null,
      leftAt: values.leftAt ?? null
    };
    if (await act("updatePerson", { person: d.person, fields }, words.updatedToast)) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  logContact: async (d) => {
    const values = await form({
      title: words.logTitle,
      intro: words.logIntro,
      fields: [
        // A person can only be the subject of the person kinds. The project and
        // workstream ones were on this list too, and picking one recorded
        // something that satisfied nothing while the toast still said Logged.
        { name: "kind", label: words.logKindLabel, type: "select", options: kindsFor("person"), value: "one-to-one" },
        { name: "note", label: words.logNoteLabel, placeholder: words.logNotePlaceholder },
        { name: "at", label: words.when, type: "date", value: asDateInput(Date.now()), hint: words.logWhenHint }
      ],
      confirm: words.logIt
    });
    if (!values) {
      return;
    }
    if (await act("logTouch", { subject: d.person, ...values }, words.loggedToast)) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  logPromise: async (d) => {
    const values = await form({
      title: words.promiseTitle,
      intro: words.promiseIntro,
      fields: [
        { name: "text", label: words.promiseTextLabel, required: true, type: "textarea", placeholder: words.promiseTextPlaceholder },
        { name: "due", label: words.promiseDueLabel, type: "date" },
        { name: "madeAt", label: words.promiseMadeLabel, type: "date", value: asDateInput(Date.now()), hint: words.promiseMadeHint }
      ],
      confirm: words.logIt
    });
    if (!values) {
      return;
    }
    if (await act("logPromise", { person: d.person, ...values }, words.loggedToast)) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  /**
   * Point at material that lives outside Tend.
   *
   * @param {Record<string, string>} d
   */
  link: async (d) => {
    const values = await form({
      title: words.linkTitle,
      intro: words.linkIntro,
      fields: [
        { name: "url", label: words.linkUrlLabel, placeholder: words.linkUrlPlaceholder, required: true },
        { name: "title", label: words.linkTitleLabel, placeholder: words.linkTitlePlaceholder },
        { name: "note", label: words.linkNoteLabel, type: "textarea" }
      ],
      confirm: words.linkConfirm
    });
    if (!values) {
      return;
    }
    if (await act("linkTo", { person: d.person, ...values }, words.linkedToast)) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  unlink: async (d) => {
    const sure = await ask({
      title: words.unlinkTitle(d.name),
      body: words.unlinkBody,
      confirm: words.remove,
      tone: "danger"
    });
    if (sure && (await act("unlink", { id: d.id }, words.removedToast))) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  logEvidence: async (d) => {
    const values = await form({
      title: words.observationTitle,
      intro: words.observationIntro,
      fields: [
        { name: "text", label: words.observationTextLabel, type: "textarea", required: true },
        { name: "area", label: words.observationAreaLabel, placeholder: words.observationAreaPlaceholder }
      ],
      confirm: words.recordIt
    });
    if (!values) {
      return;
    }
    if (await act("logEvidence", { person: d.person, ...values }, words.recordedToast)) {
      refresh();
    }
  },

  /**
   * File the right observation over a wrong one.
   *
   * The old text is shown as a `note` rather than prefilled into the textarea.
   * A correction is a new reading, and handing back the sentence being corrected
   * as an editable draft invites it to be tidied into agreement with the new one
   * - which is the outcome this whole mechanism exists to prevent, arrived at
   * one word at a time.
   *
   * Written through `attempt` so a refusal keeps the dialog open with the
   * paragraph still in it.
   *
   * @param {Record<string, string>} d
   */
  replaceObservation: async (d) => {
    const values = await form({
      title: words.replaceTitle,
      intro: words.replaceIntro,
      fields: [
        { name: "was", label: words.observationsBlock, type: "note", value: d.was ?? "" },
        { name: "text", label: words.replaceTextLabel, type: "textarea", required: true },
        {
          name: "area",
          label: words.observationAreaLabel,
          placeholder: words.observationAreaPlaceholder,
          value: d.area ?? ""
        }
      ],
      confirm: words.recordIt,
      attempt: async (v) => {
        const result = await tend.invoke("replaceObservation", {
          id: d.id,
          text: v.text,
          area: v.area
        });
        return result?.error ? String(result.error) : null;
      }
    });
    if (values) {
      toast(words.replacedToast);
      refresh();
    }
  },

  /**
   * Erase a row that was never true.
   *
   * The dialog names the other mechanism instead of only warning, because the
   * decision being made here is which of the two happened - and somebody who
   * reaches for this button having changed their mind about a colleague needs to
   * be told that the thing they want is the other button, not that this one is
   * dangerous.
   *
   * @param {Record<string, string>} d
   */
  forgetObservation: async (d) => {
    const sure = await ask({
      title: words.forgetTitle,
      body: `${d.what ? `"${d.what}"

` : ""}${words.forgetBody}`,
      confirm: words.forgetConfirm,
      tone: "danger"
    });
    if (sure && (await act("forgetObservation", { id: d.id }, words.forgotToast))) {
      refresh();
    }
  },

  /**
   * How often one duty runs for this one person.
   *
   * Three answers from one form rather than two controls, because they are one
   * decision: follow the duty, run at your own interval, or do not run at all.
   * An empty days field with the switch left alone means "follow the duty", so
   * clearing an override is the same gesture as never having set one - and the
   * service removes the row rather than copying the duty's current number into
   * it, so changing the duty later still moves this person with everybody else.
   *
   * The reason is asked for on the form and enforced in the service, not here.
   * A rule that lives in a dialog is a rule the other client does not have.
   *
   * @param {Record<string, string>} d
   */
  setPersonCadence: async (d) => {
    const dutyDays = Number(d.dutyDays);
    const values = await form({
      title: words.cadenceSetTitle(d.dutyName, d.personName),
      intro: words.cadenceSetIntro,
      fields: [
        {
          /*
           * Prefilled with the override in force, and empty when the duty's own
           * interval is what is running. So the field always shows what would
           * change rather than what the number happens to be right now, and
           * emptying it is a legible way to say "follow the duty again".
           */
          name: "cadenceDays",
          label: words.cadenceSetDaysLabel,
          value: String(d.every ?? ""),
          hint: dutyDays > 0 ? words.cadenceSetDefaultHint(dutyDays) : ""
        },
        {
          name: "off",
          label: words.cadenceSetOffLabel,
          type: "select",
          value: d.muted ? "yes" : "no",
          options: [
            { value: "no", label: words.cadenceSetOffNo },
            { value: "yes", label: words.cadenceSetOffYes }
          ]
        },
        { name: "why", label: words.cadenceSetWhyLabel, hint: words.cadenceSetWhyHint }
      ],
      confirm: words.cadenceSetConfirm
    });
    if (!values) {
      return;
    }

    const off = values.off === "yes";
    const days = String(values.cadenceDays ?? "").trim();

    /*
     * Nothing said at all is a request to follow the duty again, which is a
     * removal rather than a write. Sending it as a write would have to invent a
     * number, and the invented number is the one that stops following the duty.
     */
    if (!off && days === "") {
      if (await act("clearPersonCadence", { person: d.person, duty: d.duty }, words.cadenceClearedToast)) {
        refresh();
      }
      return;
    }

    const sent = await act(
      "setPersonCadence",
      {
        person: d.person,
        duty: d.duty,
        cadenceDays: off ? null : Number(days),
        why: values.why
      },
      words.cadenceSetToast
    );
    if (sent) {
      refresh();
    }
  },

  /**
   * Record one assessor's answers about somebody.
   *
   * ## Two dialogs, and why it is not one
   *
   * The set is chosen first, then the answers are entered against that set's
   * axes with the labels already filled in. It has to be two, because a form is
   * built once: choosing a set has to decide which axes the next screen asks
   * about, and a single dialog cannot rewrite its own fields.
   *
   * The gain is the whole point of the sets card. The axes used to be retyped by
   * hand for every answer, and the aggregate groups on the raw label - so round
   * two was comparable to round one only if two or three labels were retyped
   * identically after ninety days, and a typo made a separate axis with an n of
   * one. Nothing would have failed.
   *
   * Still parsed as lines rather than as a field per axis: the scores are filled
   * in beside labels the picker put there, so the labels are no longer typed,
   * and a field per axis would mean a form whose shape changes per set for no
   * further gain. Validated in the service either way.
   *
   * With no sets defined, this falls back to typing both - the behaviour before
   * the card. A tool that refuses to record anything until structure is defined
   * is a tool that loses the first round.
   *
   * @param {Record<string, string>} d
   */
  recordAssessment: async (d) => {
    const sets = /** @type {any} */ (await tend.invoke("questionSets", {}));
    const live = Array.isArray(sets?.live) ? sets.live : [];

    /** @type {any} */
    let chosen = null;
    if (live.length > 0) {
      const NEW = "__new__";
      const picked = await form({
        title: words.assessmentSetPickTitle,
        intro: words.assessmentSetPickIntro,
        fields: [
          {
            name: "set",
            label: words.assessmentSetLabel,
            type: "select",
            value: String(live[0].id),
            options: [
              ...live.map((/** @type {any} */ q) => ({
                value: String(q.id),
                label: q.discipline ? `${q.name} - ${q.discipline}` : String(q.name)
              })),
              { value: NEW, label: words.assessmentSetNew }
            ]
          }
        ],
        confirm: words.assessmentSetNext
      });
      if (!picked) {
        return;
      }
      if (String(picked.set) === NEW) {
        const made = await defineQuestionSet();
        if (!made) {
          return;
        }
        chosen = made;
      } else {
        chosen = live.find((/** @type {any} */ q) => String(q.id) === String(picked.set)) ?? null;
      }
    }

    /*
     * The labels, pre-filled with an empty score each, so what is typed is the
     * numbers. The same "Axel: poäng" shape the parser below already reads, so
     * the free-text path and the set path produce one thing.
     */
    const prefill =
      chosen === null
        ? ""
        : chosen.axes.map((/** @type {any} */ a) => `${a.axis}: `).join("\n");

    const values = await form({
      title: words.assessmentTitle,
      intro: chosen === null ? words.assessmentIntro : words.assessmentIntroSet(chosen.name),
      fields: [
        {
          name: "assessor",
          label: words.assessmentWhoLabel,
          hint: words.assessmentWhoHint,
          required: true
        },
        {
          name: "assessorRole",
          label: words.assessmentRoleLabel,
          placeholder: words.assessmentRolePlaceholder
        },
        /*
         * Shown as a fact rather than asked again once a set is chosen. It is
         * the field this whole flow exists to stop being typed, and rendering it
         * as an input invites exactly the retyped variant that splits an axis.
         */
        chosen === null
          ? {
              name: "set",
              label: words.assessmentSetLabel,
              placeholder: words.assessmentSetPlaceholder
            }
          : { name: "setShown", label: words.assessmentSetLabel, type: "note", value: chosen.name },
        {
          name: "axes",
          label: words.assessmentAxesLabel,
          type: "textarea",
          hint: chosen === null ? words.assessmentAxesHint : words.assessmentAxesHintSet,
          required: true,
          value: prefill
        },
        { name: "note", label: words.assessmentNoteLabel, type: "textarea" },
        {
          name: "assessorWeight",
          label: words.assessmentWeightLabel,
          type: "select",
          value: "unset",
          options: Object.entries(WEIGHTS).map(([value, w]) => ({ value, label: w.label }))
        },
        {
          name: "weighWhy",
          label: words.assessmentWeighWhyLabel,
          hint: words.assessmentWeighWhyHint
        },
        { name: "at", label: words.assessmentDateLabel, type: "date" }
      ],
      confirm: words.assessmentConfirm
    });
    if (!values) {
      return;
    }

    /*
     * One axis per line, "name: score". Refused here rather than shrugged at,
     * because a line that does not parse would otherwise be silently dropped -
     * and a round entered with two of its three axes missing looks complete.
     */
    /** @type {{ axis: string, score: number }[]} */
    const scores = [];
    for (const line of String(values.axes ?? "").split(/\r?\n/)) {
      if (line.trim() === "") {
        continue;
      }
      const at = line.lastIndexOf(":");
      const axis = at < 0 ? "" : line.slice(0, at).trim();
      const score = at < 0 ? NaN : Number(line.slice(at + 1).trim().replace(",", "."));
      if (axis === "" || !Number.isFinite(score)) {
        toast(words.assessmentBadAxis(line.trim()), "bad");
        return;
      }
      scores.push({ axis, score });
    }

    const sent = await act(
      "recordAssessment",
      {
        person: d.person,
        assessor: values.assessor,
        assessorRole: values.assessorRole,
        assessorWeight: values.assessorWeight,
        weighWhy: values.weighWhy,
        /*
         * The id and the name apart, when a set was chosen. The aggregate groups
         * on `set`, so that is the stable half and must not be a label somebody
         * can retype; `setName` is what a page prints. Without a set they are
         * the same free text they always were.
         */
        set: chosen === null ? values.set : chosen.id,
        setName: chosen === null ? values.set : chosen.name,
        scores,
        note: values.note,
        /*
         * Passed through, not parsed again.
         *
         * A `date` field already answers with a timestamp - `form()` runs the
         * raw value through `middayOn` so a timezone shift cannot move it to
         * the day before. Re-parsing that number as a date string produced NaN,
         * the service read NaN as "no date given" and fell back to now, and the
         * answer was silently filed as today. Every other date field in the app
         * is spread straight into the call; this was the only one that touched
         * it, and nothing failed - the toast still said Registrerat.
         *
         * Found while building the round history, which is where it shows: an
         * answer that came in last quarter could not be entered as last
         * quarter's, so a second occasion was unreachable.
         */
        at: values.at
      },
      words.assessmentToast
    );
    if (sent) {
      refresh();
    }
  },

  /**
   * Accept that the round has been run.
   *
   * Confirmed rather than fired on the press. This is the one button on the page
   * that makes a duty go quiet for a whole period, and the thing it is easiest
   * to do by reflex after entering answers is exactly the thing that should not
   * be done by reflex.
   *
   * @param {Record<string, string>} d
   */
  markRoundRun: async (d) => {
    const yes = await ask({
      title: words.assessmentOfferTitle,
      body: words.assessmentConfirmRound(d.personName),
      confirm: words.assessmentOfferButton
    });
    if (!yes) {
      return;
    }
    if (await act("markRoundRun", { person: d.person }, words.assessmentOfferToast)) {
      refresh();
    }
  },

  /**
   * Take back a mis-entered assessment.
   *
   * Removed rather than edited, and only just: an assessment is somebody else's
   * answer, so correcting one in place is putting words in their mouth. A wrong
   * row goes and gets typed again from the form it came from.
   *
   * @param {Record<string, string>} d
   */
  removeAssessment: async (d) => {
    if (await act("removeAssessment", { id: d.id }, words.assessmentRemovedToast)) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  resolvePromise: async (d) => {
    if (await act("resolvePromise", { id: d.id, as: "resolved" }, words.closedToast)) {
      refresh();
    }
  },

  /**
   * Reversible, unlike `remove` below - so it gets its own, gentler dialog
   * rather than reusing the danger-zone one.
   *
   * @param {Record<string, string>} d
   */
  archive: async (d) => {
    const sure = await ask({
      title: words.archiveTitle(d.name),
      body: words.archiveBody,
      confirm: words.archive,
      tone: "danger"
    });
    if (!sure) {
      return;
    }
    if (await act("archivePerson", { id: d.person }, words.archivedToast(d.name))) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  unarchive: async (d) => {
    if (await act("unarchivePerson", { id: d.person }, words.unarchivedToast(d.name))) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  remove: async (d) => {
    const sure = await ask({
      title: words.removeTitle(d.name),
      body: words.removeBody,
      confirm: words.remove,
      tone: "danger"
    });
    if (!sure) {
      return;
    }
    if (await act("removeRow", { collection: "people", id: d.person }, words.removedNamed(d.name))) {
      go("people");
    }
  }
};
