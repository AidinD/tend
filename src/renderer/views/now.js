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
import { dayWords } from "../../domain/time.js";
import { go, refresh } from "../app.js";
import { actions as waitingActions, waitingGroup } from "./waiting.js";
import { T } from "../text.js";

const words = T.now;

export async function render() {
  const [attention, questions, roster, ledger, mine, waits, archived, map, myAims, owed, myOwn] =
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
      tend.invoke("promises"),
      tend.invoke("myActions")
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

  /*
   * The focus on one line.
   *
   * It was a panel: an eyebrow, a quoted heading, a paragraph of cost, a
   * footer and a button, which is five rows for one running priority on the
   * page whose entire job is fitting the day on a screen. The facts are the
   * same four; they are now middot-separated, and the two long sentences the
   * service composes stay as the line's tooltip so nothing said before stopped
   * being available.
   *
   * The button stays. The mock has none, but the mock is a picture and this is
   * the only way into the focus settings from the page it is about.
   */
  const focusFacts = attention.focus
    ? [
        Number.isFinite(attention.focus.daysLeft)
          ? words.focusDaysLeft(attention.focus.daysLeft)
          : words.focusNoEnd,
        attention.focus.costKnown === false
          ? words.costUnknown
          : attention.focus.costDays > 0
            ? words.costBehind(attention.focus.costDays.toFixed(1))
            : words.costNothingBehind,
        attention.heldBackByFocus > 0 ? words.focusHeldShort(attention.heldBackByFocus) : ""
      ].filter((part) => part !== "")
    : [];

  const focus = attention.focus
    ? `<div class="focus-line${attention.focus.overrun ? " overrun" : ""}"
        title="${esc(attention.focus.summary)} ${esc(attention.focus.cost)} ${esc(
          words.focusHeld(attention.heldBackByFocus)
        )}">
        <span class="focus-eyebrow">${words.focusLabel}</span>
        <span class="focus-name">${esc(attention.focus.name)}</span>
        <span class="focus-facts">${focusFacts.map((f) => esc(f)).join(" · ")}</span>
        <button class="act tiny" data-act="openFocus">${words.focusSettings}</button>
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
      ${myActionsBlock(myOwn)}
      ${
        // Still printed on a quiet day, at the bottom, under the sentence that
        // says nothing needs you. Dropping it here instead would make the flag
        // a way of hiding the reminder rather than a way of keeping it quiet.
        signalRows === "" ? "" : mineBlock(signalRows)
      }
    `;
  }

  return `
    <div class="view-head view-head-dated">
      <h1 class="view-title">${words.title}</h1>
      <span class="view-date">${esc(dayWords(Date.now()))}</span>
      <!--
        What the page is, as a tooltip rather than a paragraph. The sentence is
        still worth saying - it is the reason the page is nearly empty on a good
        day - but a front page whose job is overview cannot spend a line on
        explaining itself. Kept as a string so putting it back is one edit.
      -->
      <span class="view-note" title="${esc(words.sub)}">?</span>
    </div>
    ${focus}
    ${
      /*
       * What needs him first, then the roster.
       *
       * This file used to argue the opposite, and the argument was good: the
       * tiles are the map and the cards are the list, so orientation first,
       * then what to do about it. Aidin overruled it - the mock's order stands.
       * The comment defending the old order is gone rather than left sitting
       * above code that does the other thing, which is worse than no comment.
       *
       * The duplication between the two is still real and still deliberate: a
       * tile says a fortnightly duty is running at nineteen weeks, and the card
       * says the same thing with the button that fixes it.
       */
      group(words.needsYouGroup, cards(attention.needsYou), attention.needsYou.length)
    }
    ${rosterBlock(roster)}
    ${group(words.revisitsGroup, revisitCards, revisits.length)}
    ${group(words.questionsGroup, due.map(question).join(""), due.length)}
    ${group(
      words.nudgeGroup,
      cards(attention.nudges) +
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
    ${myActionsBlock(myOwn)}
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
      <span class="group-title" title="${esc(words.teamSub)}">${words.teamHead}</span>
      <span class="group-rule"></span>
      <span class="group-meta">${mandate === undefined ? 0 : mandate.members.length}</span>
    </div>
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
             <span class="group-title" title="${esc(words.aroundSub)}">${words.aroundHead}</span>
             <span class="group-rule"></span>
           </div>
           <div class="band">${strip.map(stripRow).join("")}</div>`
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
        <span class="tile-name"><i class="dot dot-${dotOf(tile)}"></i>${esc(p.name)}</span>
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

  /*
   * Every member, with the phrase on the chip.
   *
   * This used to show only the ones asking for something and collapse the rest
   * to "4 i fas", on the argument that printing eleven quiet names to prove
   * nothing needs you defeats the point. Overruled: the mock shows each person
   * as a chip carrying its own state, "Jonna aldrig talat" beside "Sanna i fas",
   * and a count is not something you can click on the day you want to open
   * somebody who is fine.
   *
   * The order still puts what is asking first, so the collapse's actual value -
   * you never have to read past the quiet ones - survives without hiding them.
   */
  const chips = cluster.members
    .map((p) => ({ p, tile: tileOf(p, cluster.name) }))
    .sort((a, b) => tileWeight(b.tile) - tileWeight(a.tile))
    .map(
      ({ p, tile }) => `<button class="chip chip-${esc(tile.kind)}" data-act="openPerson"
        data-person="${esc(p.id)}" title="${esc(plainPhrase(tile))}">
        <i class="dot dot-${dotOf(tile)}"></i>
        <span class="chip-name">${esc(p.name)}</span>
        <span class="chip-says">${esc(plainPhrase(tile))}</span>
      </button>`
    )
    .join("");

  return `<div class="strip" data-cluster="${esc(cluster.name)}">
    <span class="strip-name" title="${esc(groupNote(cluster.name))}">${groupName(cluster.name)}</span>
    <span class="strip-chips">${chips}</span>
  </div>`;
}

/**
 * The coloured dot beside a name, from the tile's own weight.
 *
 * Derived rather than a second list of kinds. `tileWeight` already ranks every
 * kind for the sort, and a hand-written kind-to-colour map would be the fifth
 * copy of that taxonomy and the one nobody would notice going stale - it only
 * shows up as a wrong colour, which reads as a design choice.
 *
 * Away and left get their own flat colour rather than the calm one: "nothing is
 * expected" and "everything is in step" are both quiet, and they are not the
 * same fact.
 *
 * @param {any} tile
 * @returns {string}
 */
function dotOf(tile) {
  if (tile.kind === "away" || tile.kind === "left") {
    return "off";
  }
  const weight = tileWeight(tile);
  if (weight >= 4) {
    return "crit";
  }
  if (weight >= 2) {
    return "warn";
  }
  return "calm";
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
 * His own action points.
 *
 * The block the Mine option feeds, and the reason that option exists: eleven
 * action points out of one manager meeting had nowhere to go, because a shared
 * note can only offer the other attendees and he is not a person in his own
 * roster.
 *
 * Always drawn, including empty. Every other block on this page hides when it
 * has nothing, and this one does not - it is new, and an absent block cannot
 * say what would put something in it. Once it has been used for a while it
 * should probably hide like the rest.
 *
 * @param {any} myOwn
 */
function myActionsBlock(myOwn) {
  const rows = Array.isArray(myOwn) ? myOwn : [];

  const body =
    rows.length === 0
      ? `<p class="src">${words.myActionsEmpty}</p>`
      : `<div class="mine-grid">${rows
          .map(
            (/** @type {any} */ r) => `<div class="mine-row">
              <span class="mine-text">${esc(r.text)}</span>
              ${r.noteTitle ? `<span class="src">${words.myActionFrom(esc(r.noteTitle))}</span>` : ""}
              <button class="act tiny" data-act="finishMyAction" data-id="${esc(r.id)}">${words.myActionDone}</button>
            </div>`
          )
          .join("")}</div>`;

  return `<section class="aims-block">
    <div class="group-head">
      <span class="group-title">${words.myActionsHead}</span>
      <span class="group-rule"></span>
      ${rows.length > 0 ? `<span class="group-meta">${rows.length}</span>` : ""}
    </div>
    ${body}
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
      : `<div class="mine-grid">${rows
          .map(
            (/** @type {any} */ a) => `<div class="mine-row">
              <span class="mine-text">${esc(a.aim)}</span>
              <!--
                sourceLabel, not source. The raw field is an enum key, so the
                front page read "hur du vet: someone" while Reflektion read
                "hur du vet: Någon annan säger det" off the same row - the
                service has carried both fields all along and this one picked
                the wrong one. Found by a fixture with an aim in it; every
                walkthrough so far had none set.
              -->
              <span class="src">${words.aimSource(esc(a.sourceLabel ?? a.source ?? ""))}</span>
            </div>`
          )
          .join("")}</div>
         <div class="card-foot"><button class="act" data-act="openReflection">${words.aimsOpen}</button></div>`;

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
    <div class="stack cards">${body}</div>
  </div>`;
}

/**
 * The buttons for one item, whether it is a card of its own or a row in a group.
 *
 * Moved out of `card` unchanged when the grouped card arrived. Building this
 * list twice is how the two would come to offer different things for the same
 * row, and the failure is quiet: a card offering a kind of contact that cannot
 * satisfy the cadence it is about records something and still says "Loggat".
 *
 * @param {any} item
 * @returns {string[]}
 */
function actionsFor(item) {
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
  return actions;
}

/**
 * A list of items as cards, with the ones that are one problem drawn together.
 *
 * Six cards imply six actions. One duty that has never run, for six people, is
 * one problem with six subjects, and on the page whose job is saying where to
 * look that difference is the whole point.
 *
 * Order is preserved: a group takes the position of its first member, so the
 * severity sort the service did is not undone here.
 *
 * @param {any[]} items
 * @returns {string}
 */
function cards(items) {
  /** @type {Map<string, any[]>} */
  const groups = new Map();
  /** @type {string[]} */
  const order = [];

  for (const item of items) {
    /*
     * A stable key even for the ungrouped, so one loop draws both kinds and
     * the position of each is decided by where its first member sat.
     */
    const key = typeof item.groupKey === "string" && item.groupKey !== "" ? item.groupKey : item.key;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    (groups.get(key) ?? []).push(item);
  }

  return order
    .map((key) => {
      const members = groups.get(key) ?? [];
      /*
       * One member is a plain card. A head reading "1 person" above a single
       * row says nothing and costs a line on the page that exists to be short.
       */
      return members.length === 1 ? card(members[0]) : groupCard(members);
    })
    .join("");
}

/**
 * One duty in one state, and everybody it applies to.
 *
 * The head says which duty and what state; each row says one person, their own
 * age against the target, and the actions for that person. Deliberately not a
 * merged sentence: the actions are per person, and an age per row is what keeps
 * an outlier visible instead of averaged away.
 *
 * @param {any[]} members
 * @returns {string}
 */
function groupCard(members) {
  const first = members[0];
  const rows = members
    .map(
      (item) => `<div class="card-person">
        <span class="card-person-name">${esc(item.who)}</span>
        <span class="card-person-age">${esc(item.age ?? "")}</span>
        <span class="card-person-acts">${actionsFor(item).join("")}</span>
      </div>`
    )
    .join("");

  return `<article class="card sev-${esc(first.urgency)} card-grouped"
      title="${esc(`${first.why} ${first.from}`)}">
    <div class="card-top">
      <h2 class="card-title">${esc(first.groupLine)}</h2>
      <span class="pill ${esc(first.urgency)}">${words.groupCount(members.length)}</span>
    </div>
    <div class="card-people">${rows}</div>
    ${
      first.guarded
        ? `<div class="card-foot"><span class="src">${words.guardedAlone}</span></div>`
        : ""
    }
  </article>`;
}

/** @param {any} item */
function card(item) {
  const softened =
    item.actualUrgency === "critical" && item.urgency !== "critical"
      ? `<p class="card-why dim">${words.softened}</p>`
      : "";

  const actions = actionsFor(item);

  /*
   * Three slots when the item is about one named subject, and the sentence when
   * it is not.
   *
   * Six cards on this page were identical except for one word: the title was a
   * whole sentence naming a duty and a person, the body was the same sentence
   * on all six, and the foot repeated the duty name a second time on the same
   * card. Read as a set, each card's information content was a name.
   *
   * So the name is the title, the duty and its state are one line, and how long
   * is one more. What came off the face is in the tooltip rather than deleted:
   * the target interval is worth reading once, and `title` and `why` are
   * untouched in the payload because that is what `tend_attention` hands a
   * model.
   *
   * A monthly question and a queue of unfiled commitments have no `who` - their
   * title was never a sentence about one person - so they keep the old shape.
   */
  const named = typeof item.who === "string" && item.who !== "";
  const hint = named ? `${item.why} ${item.from}` : "";

  return `<article class="card sev-${esc(item.urgency)}"${named ? ` title="${esc(hint)}"` : ""}>
    <div class="card-top">
      <h2 class="card-title">${esc(named ? item.who : item.what)}</h2>
      <span class="pill ${esc(item.urgency)}">${esc(item.behindBy)}</span>
    </div>
    ${
      named
        ? `<p class="card-line">${esc(item.line)}</p>
           ${item.age ? `<p class="card-age">${esc(item.age)}</p>` : ""}`
        : `<p class="card-why">${esc(item.why)}</p>`
    }
    ${softened}
    <div class="card-foot">
      <span class="src">${
        named
          ? item.guarded
            ? words.guardedAlone
            : ""
          : `${esc(item.from)}${item.guarded ? words.guarded : ""}`
      }</span>
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

  /** @param {Record<string, string>} d */
  finishMyAction: async (/** @type {Record<string, string>} */ d) => {
    if (await act("finishMyAction", { id: d.id }, words.myActionDoneToast)) {
      refresh();
    }
  },

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
          /*
           * Above "nobody", because it is an answer rather than a dismissal.
           * Below the people, because the common case for a 1-1 note really is
           * a promise to them - it is the shared meeting notes where most of
           * these are his.
           */
          { value: "mine", label: words.fileMine },
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
      if (answer === "mine") {
        /*
         * Counted with the filed rather than separately. From where he is
         * standing he answered the question either way, and a toast that
         * distinguishes "two filed and one kept" is arithmetic he did not ask
         * for.
         */
        if (await act("keepCommitment", { id: item.id })) {
          filed += 1;
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
