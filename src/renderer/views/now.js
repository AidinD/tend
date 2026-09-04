/**
 * Now: the only view opened daily.
 *
 * Deviations only. When everything is in step this is nearly empty, which is
 * the design rather than a gap - a view that shows the whole list every morning
 * becomes background noise inside a month.
 *
 * Every card carries the action that would resolve it, so nothing here is a
 * report you then have to go and act on somewhere else.
 */

import {
  RELATION_GROUPS,
  act,
  ask,
  esc,
  form,
  groupOf,
  humanDays,
  kindsFor,
  tend,
  tileOf,
  tileWeight,
  toast
} from "../ui.js";
import { go, refresh } from "../app.js";
import { actions as waitingActions, waitingGroup } from "./waiting.js";
import { T } from "../text.js";

const words = T.now;

export async function render() {
  const [attention, questions, roster, ledger, mine, waits, archived, map, myAims, owed] =
    await Promise.all([
      tend.invoke("attention"),
      tend.invoke("signals"),
      tend.invoke("people"),
      tend.invoke("decisions"),
      tend.invoke("myAttention"),
      tend.invoke("waitsOnNow"),
      tend.invoke("archivedPeople"),
      tend.invoke("roleMap"),
      tend.invoke("aims"),
      tend.invoke("promises")
    ]);
  const waitingOn = Array.isArray(waits) ? waits : [];

  if (attention.error) {
    return `<div class="card sev-critical"><div class="card-top">
      <h2 class="card-title">${words.readFailedTitle}</h2></div>
      <p class="card-why">${esc(attention.error)}</p></div>`;
  }

  // An empty store is a setup problem, not a quiet day. Say so plainly and
  // offer the way out rather than showing a serene screen that means nothing.
  //
  // But an empty roster is not proof of an empty store: after the bulk archive
  // everybody is off the roster and every one of them is one click from coming
  // back. Showing the first-run instructions to somebody with years of record
  // behind them reads as "your data is gone", which is the one thing archiving
  // promised it would never look like.
  if (!Array.isArray(roster) || roster.length === 0) {
    const anyArchived = Array.isArray(archived) && archived.length > 0;
    return anyArchived ? everybodyArchived(mine) : firstRun();
  }

  const focus = attention.focus
    ? `<div class="focus-bar${attention.focus.overrun ? " overrun" : ""}">
        <div class="focus-eyebrow">${words.focusEyebrow}</div>
        <h2 class="focus-name">${esc(attention.focus.summary)}</h2>
        <p class="focus-cost">${esc(attention.focus.cost)}</p>
        <div class="card-foot">
          <span class="src">${words.focusHeld(attention.heldBackByFocus)}</span>
          <button class="act" data-act="openFocus">${words.focusSettings}</button>
        </div>
      </div>`
    : `<div class="no-focus">
        <span class="src">${words.noFocus}</span>
        <button class="act tiny" data-act="openFocus">${words.noFocusStart}</button>
      </div>`;

  const due = (questions ?? []).filter((/** @type {any} */ q) => q.due);

  /*
   * Decisions asking to be looked at again.
   *
   * They belong on this page and not only on their own, because "nothing needs
   * you" has to be true. A revisit date you set months ago and a cadence that
   * has drifted are the same kind of thing: something you decided to be
   * reminded of, arriving.
   */
  const revisits = (Array.isArray(ledger) ? ledger : []).filter((/** @type {any} */ d) => d.revisitDue);

  const revisitCards = revisits
    .map(
      (/** @type {any} */ d) => `
        <div class="card sev-critical">
          <div class="card-top">
            <h2 class="card-title">${esc(d.what)}</h2>
            <span class="badge">${words.decisionDue(esc(d.revisitOverdueBy ?? words.dueNow))}</span>
          </div>
          ${d.because ? `<p class="card-why">${esc(d.because)}</p>` : ""}
          <div class="card-foot">
            <span class="src">${words.decisionSrc}</span>
            <button class="act" data-act="holds" data-id="${esc(d.id)}">${words.stillHolds}</button>
            <button class="act" data-act="openDecisions">${words.openLog}</button>
          </div>
        </div>`
    )
    .join("");

  /*
   * Patterns in my own month, at the bottom rather than the top.
   *
   * They are not deviations from a duty and nothing is late because of them, so
   * they must not compete with what is. But they are the things that are
   * invisible while they happen and obvious afterwards, which is worth one
   * paragraph on the page you open daily.
   */
  const signals = Array.isArray(mine) ? mine : [];
  /*
   * A habit reminder is still printed, and still never stops the page being
   * quiet. Counting it here changed the headline from "Nothing needs you" to
   * "Now" for as long as a week went unreflected on - which is far louder than
   * the bottom-of-the-page whisper it was designed as, and it says a week
   * without a reflection is a thing needing you, which it is not. The flag is
   * set in `myattention.js`; see "A habit is not a finding" there.
   */
  const pressing = signals.filter((/** @type {any} */ s) => s.habit !== true);
  const signalRows = signals
    .map(
      (/** @type {any} */ s) => `
        <div class="mine-row">
          <span class="mine-text">${esc(s.text)}</span>
          ${s.detail ? `<span class="src">${esc(s.detail)}</span>` : ""}
        </div>`
    )
    .join("");

  if (
    attention.allInStep &&
    due.length === 0 &&
    revisits.length === 0 &&
    pressing.length === 0 &&
    waitingOn.length === 0
  ) {
    return `
      <div class="view-head">
        <h1 class="view-title">${words.quietTitle}</h1>
        <p class="view-sub">${words.quietSub}</p>
      </div>
      ${focus}
      <div class="empty">${words.quietEmpty}</div>
      ${rosterBlock(roster)}
      ${proposedBlock(map)}
      ${aimsBlock(myAims)}
      ${
        // Still printed on a quiet day, at the bottom, under the sentence that
        // says nothing needs you. Dropping it here instead would make the flag
        // a way of hiding the reminder rather than a way of keeping it quiet.
        signalRows === "" ? "" : mineBlock(signalRows)
      }
    `;
  }

  return `
    <div class="view-head">
      <h1 class="view-title">${words.title}</h1>
      <p class="view-sub">${words.sub}</p>
    </div>
    ${focus}
    ${
      /*
       * The roster above the cards, and this is the page's structure rather
       * than a preference.
       *
       * The tiles are the map and the cards are the list. A tile says a
       * fortnightly duty is running at nineteen weeks; the card below says the
       * same thing with the button that fixes it. Orientation first, then what
       * to do about it - which is what makes this a front page rather than a
       * longer version of the deviation list.
       *
       * The duplication is real and deliberate. The alternatives are worse: a
       * page where the mandate group is described once in two different voices
       * and you have to reconcile them, or one where you scroll past three
       * cards before finding out who you are accountable for.
       */
      rosterBlock(roster)
    }
    ${group(words.needsYouGroup, attention.needsYou.map(card).join(""), attention.needsYou.length)}
    ${group(words.revisitsGroup, revisitCards, revisits.length)}
    ${group(words.questionsGroup, due.map(question).join(""), due.length)}
    ${group(
      words.nudgeGroup,
      attention.nudges.map(card).join("") +
        (attention.heldBackByFocus > 0 && !attention.focus
          ? ""
          : attention.heldBackByFocus > 0
            ? `<div class="muted-row">${words.softerHeld(attention.heldBackByFocus)}</div>`
            : ""),
      attention.nudges.length
    )}
    ${waitingGroup(waitingOn)}
    ${owedBlock(owed)}
    ${proposedBlock(map)}
    ${aimsBlock(myAims)}
    ${
      signalRows === "" ? "" : mineBlock(signalRows)
    }
  `;
}

/* --------------------------------------------------------------- Läget -- */

/**
 * The roster as tiles: the people you are accountable for at the size that
 * says so, and everybody else on one line each.
 *
 * The asymmetry is the whole layout. Four names in a grid and eleven on three
 * strips is not a space saving - it is the page saying where to look, and a
 * uniform list of fifteen tiles would say nothing at all.
 *
 * @param {any} roster
 */
function rosterBlock(roster) {
  const rows = Array.isArray(roster) ? roster : [];
  if (rows.length === 0) {
    return "";
  }

  const clusters = Object.keys(RELATION_GROUPS).map((name) => ({
    name,
    members: rows.filter((/** @type {any} */ p) => groupOf(String(p.relation ?? "")) === name)
  }));

  /*
   * The first cluster gets the grid, and it is the first cluster because
   * `cadence.js` declares it first - not because this loop knows which one it
   * is. A test asserts that order, so reordering the declaration moves the grid
   * rather than silently disagreeing with it.
   */
  const [mandate, ...strip] = clusters;

  return `<section class="roster-block">
    <div class="prep-head">
      <span class="group-title">${words.teamHead}</span>
      <span class="group-rule"></span>
      <span class="group-meta">${mandate === undefined ? 0 : mandate.members.length}</span>
    </div>
    <p class="view-sub">${words.teamSub}</p>
    ${mandate === undefined ? "" : mandateGrid(mandate)}
    ${
      /*
       * Its own section rather than three more rows under the grid. "My team"
       * and "everybody else" answer different questions, and one heading over
       * both made the strips read as an afterthought to the grid instead of as
       * the other half of the roster.
       */
      strip.some((c) => c.members.length > 0)
        ? `<div class="prep-head around-head">
             <span class="group-title">${words.aroundHead}</span>
             <span class="group-rule"></span>
           </div>
           <p class="view-sub">${words.aroundSub}</p>
           ${strip.map(stripRow).join("")}`
        : ""
    }
  </section>`;
}

/**
 * @param {{ name: string, members: any[] }} cluster
 */
function mandateGrid(cluster) {
  if (cluster.members.length === 0) {
    /*
     * Drawn rather than dropped. An empty mandate group is a real state - a
     * roster of peers and stakeholders and nobody you are accountable for - and
     * silently removing the page's headline block would read as a broken page
     * rather than as an answer.
     */
    return `<div class="mandate-empty">
      <span class="group-title">${groupName(cluster.name)}</span>
      <p class="src">${words.rosterEmpty}</p>
    </div>`;
  }

  const tiles = [...cluster.members]
    .map((p) => ({ p, tile: tileOf(p, cluster.name) }))
    .sort((a, b) => tileWeight(b.tile) - tileWeight(a.tile))
    .map(
      ({ p, tile }) => `<button class="tile tile-${esc(tile.kind)}" data-act="openPerson"
        data-person="${esc(p.id)}">
        <span class="tile-name">${esc(p.name)}</span>
        <span class="tile-says">${tilePhrase(tile)}</span>
      </button>`
    )
    .join("");

  /*
   * No heading of its own. The section above already says "My team", and this
   * printed the same words again four pixels below it. The count moves up to
   * the section head, which is where it belonged - it counts the section.
   */
  return `<div class="mandate" data-cluster="${esc(cluster.name)}">
    <div class="tile-grid">${tiles}</div>
  </div>`;
}

/**
 * One cluster on one line.
 *
 * Everybody in step collapses to a count. The strip exists so the page can say
 * "and nothing here needs you" in the space of a sentence, and printing eleven
 * quiet names to prove it defeats the point.
 *
 * @param {{ name: string, members: any[] }} cluster
 */
function stripRow(cluster) {
  if (cluster.members.length === 0) {
    return "";
  }

  const withTiles = cluster.members.map((p) => ({ p, tile: tileOf(p, cluster.name) }));
  const asking = withTiles.filter(({ tile }) => tileWeight(tile) >= 2);

  const chips =
    asking.length === 0
      ? `<span class="chip quiet">${words.groupAllInStep(withTiles.length)}</span>`
      : asking
          .sort((a, b) => tileWeight(b.tile) - tileWeight(a.tile))
          .map(
            ({ p, tile }) => `<button class="chip chip-${esc(tile.kind)}" data-act="openPerson"
              data-person="${esc(p.id)}" title="${esc(plainPhrase(tile))}">
              ${esc(p.name)}
            </button>`
          )
          .join("");

  return `<div class="strip" data-cluster="${esc(cluster.name)}">
    <span class="strip-name" title="${esc(groupNote(cluster.name))}">${groupName(cluster.name)}</span>
    <span class="strip-chips">${chips}</span>
  </div>`;
}

/** @param {string} name */
function groupName(name) {
  /*
   * Only the strips ask for a name now - the grid takes the section's. The
   * mandate entry stays in the map anyway, because `mandateGrid` reads it for
   * its empty state and a missing entry there would print the raw cluster key.
   */
  /** @type {Record<string, string>} */
  const names = {
    mandate: words.groupMandate,
    noChannel: words.groupNoChannel,
    peers: words.groupPeers,
    outward: words.groupOutward
  };
  return names[name] ?? name;
}

/**
 * What the cluster IS, for the strip's tooltip. "Peers" alone does not say why
 * those four are on one line while two people have a grid to themselves.
 *
 * @param {string} name
 */
function groupNote(name) {
  /** @type {Record<string, string>} */
  const notes = {
    noChannel: words.groupNoChannelNote,
    peers: words.groupPeersNote,
    outward: words.groupOutwardNote
  };
  return notes[name] ?? "";
}

/**
 * A tile's sentence, from its kind. Every kind in `TILE_KINDS` has a case here
 * and a test asserts it, because a missing one renders as a blank tile about a
 * named colleague.
 *
 * @param {any} tile
 * @returns {string}
 */
function tilePhrase(tile) {
  switch (tile.kind) {
    /* My team. */
    case "away":
      return words.tileAway;
    case "leaving":
      return words.tileLeaving;
    case "needsYou":
      return words.tileNeedsYou(esc(tile.duty));
    case "planNotStarted":
      return words.tilePlanNotStarted;
    case "planRunning":
      return words.tilePlanRunning;
    case "directionShowing":
      return words.tileDirectionShowing;
    case "directionUntested":
      return words.tileDirectionUntested;
    case "noDirection":
      return words.tileNoDirection;

    /* Their work, no channel. */
    case "neverSpoken":
      return words.tileNeverSpoken(esc(tile.duty));
    case "feedbackOverdue":
      return words.tileFeedbackOverdue(esc(tile.duty));
    case "inStep":
      return words.tileInStep;

    /* Peers. */
    case "daysOver":
      return words.tileDaysOver(tile.days);

    /* Upward and outward. */
    case "promisesOwed":
      return words.tilePromisesOwed(tile.count);
    case "questionToAsk":
      return words.tileQuestionToAsk;
    case "updateOverdue":
      return words.tileUpdateOverdue;
    case "updatedRecently":
      return words.tileUpdatedRecently;

    case "unknownCluster":
      return words.tileUnknownCluster(esc(tile.cluster));
    default:
      /*
       * Unreachable while the test walking TILE_KINDS passes. It names the
       * state rather than returning "" - a tile that says nothing about
       * somebody is the failure the whole rule exists to prevent, and an empty
       * span is the one version of it nobody notices.
       */
      return esc(String(tile.kind));
  }
}

/**
 * The same sentence with no markup, for a chip's tooltip.
 *
 * @param {any} tile
 */
function plainPhrase(tile) {
  return tilePhrase(tile).replace(/<[^>]*>/g, "");
}

/**
 * Duties the role map proposed and nobody answered.
 *
 * Here rather than only on the role map, because a proposal does nothing until
 * it is accepted - so four sitting unanswered means the app is not watching
 * four things it has already told you it could watch.
 *
 * @param {any} map
 */
function proposedBlock(map) {
  const proposed = Array.isArray(map?.proposed) ? map.proposed : [];
  if (proposed.length === 0) {
    return "";
  }

  const cards = proposed
    .map(
      (/** @type {any} */ d) => `<div class="card sev-warn">
        <div class="card-top">
          <h2 class="card-title">${esc(d.name)}</h2>
          <span class="badge">${words.proposedEvery(esc(d.every))}</span>
        </div>
        ${d.means ? `<p class="card-why">${esc(d.means)}</p>` : ""}
        <div class="card-foot">
          <span class="src">${esc(d.source ?? "")}</span>
          <button class="act primary" data-act="acceptDuty" data-id="${esc(d.id)}">${words.proposedAccept}</button>
          <button class="act" data-act="declineDuty" data-id="${esc(d.id)}">${words.proposedDecline}</button>
        </div>
      </div>`
    )
    .join("");

  return `<section class="proposed-block">
    <div class="group-head">
      <span class="group-title">${words.proposedHead}</span>
      <span class="group-rule"></span>
      <span class="group-meta">${proposed.length}</span>
    </div>
    <p class="view-sub">${words.proposedSub}</p>
    ${cards}
    <div class="card-foot"><button class="act" data-act="openRole">${words.proposedOpen}</button></div>
  </section>`;
}

/**
 * His own aims.
 *
 * Ships empty on purpose - the goals pass happens after this screen exists - so
 * the empty state is a real sentence saying what an aim is and why there are
 * only two, rather than a dash.
 *
 * @param {any} myAims
 */
function aimsBlock(myAims) {
  const rows = Array.isArray(myAims) ? myAims : [];

  const body =
    rows.length === 0
      ? `<p class="src">${words.aimsEmpty}</p>
         <button class="act" data-act="openReflection">${words.aimsSet}</button>`
      : rows
          .map(
            (/** @type {any} */ a) => `<div class="mine-row">
              <span class="mine-text">${esc(a.aim)}</span>
              <span class="src">${words.aimSource(esc(a.source ?? ""))}</span>
            </div>`
          )
          .join("") +
        `<div class="card-foot"><button class="act" data-act="openReflection">${words.aimsOpen}</button></div>`;

  return `<section class="aims-block">
    <div class="group-head">
      <span class="group-title">${words.aimsHead}</span>
      <span class="group-rule"></span>
    </div>
    ${body}
  </section>`;
}

/**
 * What he said he would do, which is the other half of what needs him.
 *
 * Only when there is something. An empty promise list is not a fact worth a
 * heading on the page that exists to show deviations.
 *
 * @param {any} owed
 */
function owedBlock(owed) {
  const rows = (Array.isArray(owed) ? owed : []).filter((/** @type {any} */ p) => !p.resolvedAt);
  if (rows.length === 0) {
    return "";
  }

  const lines = rows
    .map(
      (/** @type {any} */ p) => `<div class="mine-row">
        <span class="mine-text">${esc(p.text)}</span>
        <span class="src">${words.owedLine(esc(p.person ?? ""), esc(p.openFor ?? ""))}</span>
      </div>`
    )
    .join("");

  return `<section class="owed-block">
    <div class="group-head">
      <span class="group-title">${words.owedHead}</span>
      <span class="group-rule"></span>
      <span class="group-meta">${rows.length}</span>
    </div>
    ${lines}
  </section>`;
}

/**
 * The same block in both branches, so a quiet day and a busy one say it the
 * same way.
 *
 * @param {string} rows
 */
function mineBlock(rows) {
  return `<div class="mine">
    <h2 class="mine-head">${words.mineHead}</h2>
    <p class="mine-sub">${words.mineSub}</p>
    ${rows}
  </div>`;
}

/**
 * Nobody active, but not nobody. Said as a state that can be reversed rather
 * than as a setup step that has not been done.
 *
 * Carries "My month" too: those signals are about you rather than about anybody
 * on the roster, so an empty roster is no reason for them to disappear.
 *
 * @param {any} mine
 */
function everybodyArchived(mine) {
  const rows = (Array.isArray(mine) ? mine : [])
    .map(
      (/** @type {any} */ s) => `
        <div class="mine-row">
          <span class="mine-text">${esc(s.text)}</span>
          ${s.detail ? `<span class="src">${esc(s.detail)}</span>` : ""}
        </div>`
    )
    .join("");
  return `
    <div class="view-head">
      <h1 class="view-title">${words.quietTitle}</h1>
      <p class="view-sub">${words.archivedSub}</p>
    </div>
    ${rows === "" ? "" : mineBlock(rows)}
    <div class="empty">${words.archivedEmpty}</div>
  `;
}

function firstRun() {
  return `
    <div class="view-head">
      <h1 class="view-title">${words.firstTitle}</h1>
      <p class="view-sub">${words.firstSub}</p>
    </div>
    <div class="stack">
      <article class="card sev-warn">
        <div class="card-top"><h2 class="card-title">${words.firstPeopleTitle}</h2></div>
        <p class="card-why">${words.firstPeopleWhy}</p>
        <div class="card-foot">
          <span class="src">${words.firstPeopleNote}</span>
          <button class="act primary" data-act="addPerson">${words.firstPeopleButton}</button>
        </div>
      </article>
      <article class="card sev-book">
        <div class="card-top"><h2 class="card-title">${words.firstRoleTitle}</h2></div>
        <p class="card-why">${words.firstRoleWhy}</p>
        <div class="card-foot">
          <span class="src">${words.firstRoleNote}</span>
          <button class="act primary" data-act="seed">${words.firstRoleButton}</button>
          <button class="act" data-act="openRole">${words.firstRoleLook}</button>
        </div>
      </article>
    </div>
  `;
}

/** @param {string} title @param {string} body @param {number} count */
function group(title, body, count) {
  if (!body.trim()) {
    return "";
  }
  return `<div class="group">
    <div class="group-head">
      <span class="group-title">${esc(title)}</span>
      <span class="group-rule"></span>
      <span class="group-meta">${count}</span>
    </div>
    <div class="stack">${body}</div>
  </div>`;
}

/** @param {any} item */
function card(item) {
  const softened =
    item.actualUrgency === "critical" && item.urgency !== "critical"
      ? `<p class="card-why dim">${words.softened}</p>`
      : "";

  const actions = [];
  if (item.person) {
    // The subject decides both the wording and the kinds the form will offer.
    // A project cadence is answered by looking at the project, not by having a
    // conversation with it, and the old card offered every kind for either -
    // which records something that satisfies nothing and still says "Logged".
    /** @type {Record<string, string>} */
    const LABELS = { project: words.logProject, workstream: words.logWorkstream, stake: words.logStake };
    const kind = String(item.subjectKind ?? "person");
    const label = LABELS[kind] ?? words.logPerson;
    const isPerson = kind === "person";
    actions.push(
      `<button class="act" data-act="logContact" data-person="${esc(item.person)}" data-subject-kind="${esc(item.subjectKind ?? "person")}">${label}</button>`
    );
    // Only people have a page. Sending a project id to the roster showed an
    // empty person rather than saying it had nowhere to go.
    if (isPerson) {
      actions.push(`<button class="act" data-act="openPerson" data-person="${esc(item.person)}">${words.open}</button>`);
    }
  }
  if (item.key.startsWith("promise:")) {
    actions.push(
      `<button class="act primary" data-act="resolvePromise" data-id="${esc(item.key.slice(8))}">${words.done}</button>`,
      `<button class="act" data-act="dropPromise" data-id="${esc(item.key.slice(8))}">${words.drop}</button>`
    );
  }
  if (item.key.startsWith("unspecified:")) {
    actions.push(
      `<button class="act primary" data-act="setLevel" data-id="${esc(item.key.slice(12))}">${words.setLevelButton}</button>`
    );
  }
  if (item.key.startsWith("unfiled:")) {
    actions.push(
      `<button class="act primary" data-act="fileCommitments" data-key="${esc(item.key.slice(8))}">${words.fileButton}</button>`
    );
  }

  return `<article class="card sev-${esc(item.urgency)}">
    <div class="card-top">
      <h2 class="card-title">${esc(item.what)}</h2>
      <span class="pill ${esc(item.urgency)}">${esc(item.behindBy)}</span>
    </div>
    <p class="card-why">${esc(item.why)}</p>
    ${softened}
    <div class="card-foot">
      <span class="src">${esc(item.from)}${item.guarded ? words.guarded : ""}</span>
      ${actions.join("")}
    </div>
  </article>`;
}

/** @param {any} q */
function question(q) {
  return `<article class="card sev-book">
    <div class="card-top">
      <h2 class="card-title">${esc(q.question)}</h2>
      <span class="pill book">${esc(q.lastAsked === "never" ? words.neverAsked : q.lastAsked)}</span>
    </div>
    <p class="card-why">${esc(q.why)}</p>
    <div class="card-foot">
      <span class="src">${words.questionSrc}</span>
      <button class="act primary" data-act="answerNo" data-id="${esc(q.id)}">${words.answerNo}</button>
      <button class="act" data-act="answerYes" data-id="${esc(q.id)}">${words.answerYes}</button>
    </div>
  </article>`;
}

export const actions = {
  // Chasing and closing are the same everywhere they appear.
  ...waitingActions,

  /** @param {Record<string, string>} d */
  openPerson: (d) => go("people", { person: d.person }),
  openFocus: () => go("focus"),
  openRole: () => go("role"),
  openDecisions: () => go("decisions"),
  openReflection: () => go("reflection"),

  /*
   * Answering a proposal from here, because it is where the proposal is now
   * shown. Routing it through `decideDuty` rather than a second path, so the
   * role map and this page cannot come to disagree about what accepting means.
   *
   * @param {Record<string, string>} d
   */
  acceptDuty: async (/** @type {Record<string, string>} */ d) => {
    if (await act("decideDuty", { id: d.id, status: "active" }, words.proposedAcceptedToast)) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  declineDuty: async (/** @type {Record<string, string>} */ d) => {
    if (await act("decideDuty", { id: d.id, status: "declined" }, words.proposedDeclinedToast)) {
      refresh();
    }
  },

  /**
   * "It still holds" from here, so the common answer never needs a second view.
   *
   * @param {Record<string, string>} d
   */
  holds: async (d) => {
    await act("stillHolds", { id: d.id, days: 90 });
    refresh();
  },

  addPerson: async () => {
    const { addPersonDialog } = await import("./people.js");
    if (await addPersonDialog()) {
      refresh();
    }
  },

  /**
   * Name the owner of each commitment out of one shared meeting note.
   *
   * One dialog for the whole meeting rather than one per commitment. He answers
   * these with the meeting in mind - he is remembering one Tuesday, not four
   * unrelated obligations - and a dialog per row would make him re-enter that
   * context three times over.
   *
   * Leaving a row alone is the default and needs no reason. A commitment he is
   * not sure about should stay in the queue rather than be filed against a
   * guess, so "not yet" is the pre-selected answer and doing nothing is safe.
   *
   * @param {Record<string, string>} d
   */
  fileCommitments: async (d) => {
    const pending = await tend.invoke("pendingCommitments");
    const group = (pending?.groups ?? []).find((/** @type {any} */ g) => g.key === d.key);
    if (!group) {
      // The queue moved under him - another window filed them, or a sync
      // dropped them because Nib ticked them off. Say so rather than opening an
      // empty dialog.
      refresh();
      return;
    }

    const values = await form({
      title: words.fileTitle,
      intro: words.fileIntro(group.items.length, group.note),
      fields: group.items.map((/** @type {any} */ item, /** @type {number} */ i) => ({
        name: `c${i}`,
        label: item.text,
        type: "select",
        value: "",
        options: [
          { value: "", label: words.fileNotYet },
          ...item.candidates.map((/** @type {any} */ c) => ({ value: c.id, label: words.filePromiseTo(c.name) })),
          { value: "none", label: words.fileNobody }
        ]
      })),
      confirm: words.fileConfirm
    });
    if (!values) {
      return;
    }

    let filed = 0;
    let discarded = 0;
    for (const [i, item] of group.items.entries()) {
      const answer = String(values[`c${i}`] ?? "");
      if (answer === "") {
        continue;
      }
      if (answer === "none") {
        if (await act("dropCommitment", { id: item.id })) {
          discarded += 1;
        }
        continue;
      }
      if (await act("assignCommitment", { id: item.id, person: answer })) {
        filed += 1;
      }
    }

    if (filed > 0 || discarded > 0) {
      const parts = [];
      if (filed > 0) {
        parts.push(words.filedCount(filed));
      }
      if (discarded > 0) {
        parts.push(words.discardedCount(discarded));
      }
      toast(`${parts.join(", ")}.`);
    }
    refresh();
  },

  seed: async () => {
    const result = await act("seed", {}, words.seededToast);
    if (result) {
      go("role");
    }
  },

  /** @param {Record<string, string>} d */
  logContact: async (d) => {
    const subjectKind = /** @type {any} */ (d.subjectKind ?? "person");
    const options = kindsFor(subjectKind);
    const values = await form({
      title: subjectKind === "person" ? words.logTitlePerson : words.logTitleOther,
      intro: subjectKind === "person" ? words.logIntroPerson : words.logIntroOther,
      fields: [
        { name: "kind", label: words.logKindLabel, type: "select", options, value: options[0]?.value },
        { name: "note", label: words.logNoteLabel, placeholder: words.logNotePlaceholder }
      ],
      confirm: words.logConfirm
    });
    if (!values) {
      return;
    }
    if (await act("logTouch", { subject: d.person, ...values }, words.loggedToast)) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  resolvePromise: async (d) => {
    if (await act("resolvePromise", { id: d.id, as: "resolved" }, words.closedToast)) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  dropPromise: async (d) => {
    const sure = await ask({
      title: words.dropTitle,
      body: words.dropBody,
      confirm: words.dropConfirm
    });
    if (sure && (await act("resolvePromise", { id: d.id, as: "dropped" }, words.droppedToast))) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  setLevel: async (d) => {
    const { setLevelDialog } = await import("./work.js");
    if (await setLevelDialog(d.id)) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  answerNo: async (d) => {
    if (await act("answerSignal", { signal: d.id, answer: "no" }, words.answeredNoToast)) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  answerYes: async (d) => {
    const values = await form({
      title: words.yesTitle,
      intro: words.yesIntro,
      fields: [{ name: "note", label: words.yesLabel, type: "textarea", required: true }],
      confirm: words.yesConfirm
    });
    if (!values) {
      return;
    }
    if (await act("answerSignal", { signal: d.id, answer: "yes", note: values.note }, words.recordedToast)) {
      refresh();
    }
  }
};
