/**
 * Prep: read this before a conversation.
 *
 * One card per person, worst drift first, capped. Everything on a card is
 * already in Tend, Jot or Nib - the point is that it is currently in three
 * windows, which is why the preparation does not happen.
 *
 * Not a roster. `people` is the roster. A card here means something has moved
 * or is owed, and when nothing has, the page is empty on purpose.
 */

import { esc, tend } from "../ui.js";
import { go } from "../app.js";
import {
  briefHtml,
  candidatesHtml,
  isRunning,
  modelActions,
  modelStatus,
  resultFor,
  run
} from "../model.js";

export async function render() {
  const result = await tend.invoke("prep");
  const model = await modelStatus();

  if (result.error) {
    return `<div class="card sev-critical"><div class="card-top">
      <h2 class="card-title">Could not read the data</h2></div>
      <p class="card-why">${esc(result.error)}</p></div>`;
  }

  const cards = Array.isArray(result.cards) ? result.cards : [];

  const head = `
    <div class="view-head">
      <h1 class="view-title">Before you talk to them</h1>
      <p class="view-sub">
        Who has drifted or is owed something, with what they own, what is open on
        the board, and the last thing you wrote. Worst first, and only a few:
        this is meant to be read and finished.
      </p>
    </div>`;

  if (cards.length === 0) {
    return `${head}
      ${practices(result.practising)}
      <div class="empty">
        Nobody is behind and nothing is owed. This page is empty most days, which
        is the point of it.
      </div>
      ${sources(result)}`;
  }

  return `${head}
    ${practices(result.practising)}
    ${cards.map((/** @type {any} */ c) => card(c, model)).join("")}
    ${result.dropped > 0 ? `<p class="prep-dropped">${result.dropped} more further behind than nobody, held back so this page ends.</p>` : ""}
    ${sources(result)}`;
}

/**
 * What he is practising, once for the page.
 *
 * Above the cards rather than on them. A principle about how to talk to people
 * is about him, not about any one of them, and printing the same two lines
 * beside six names is how a card stops being read.
 *
 * The note title is the whole entry. The principle itself is in Nib and copying
 * its text here would be a second copy to go stale - the block's job is to put
 * it back in his head before a conversation, and the title does that.
 *
 * @param {any} practising
 */
function practices(practising) {
  if (practising === undefined || practising === null) {
    return "";
  }
  if (practising.available === false) {
    return `<div class="card prep-practice">
      <div class="card-top"><h2 class="card-title">Nothing to practise</h2></div>
      <p class="card-why">${esc(practising.why)}</p>
    </div>`;
  }

  const active = Array.isArray(practising.active) ? practising.active : [];
  const points = Array.isArray(practising.actionPoints) ? practising.actionPoints : [];
  if (active.length === 0 && points.length === 0) {
    return "";
  }

  const lines = active
    .map(
      (/** @type {any} */ a) => `<li>
        ${esc(a.title)}
        <span class="src">${esc(a.source)}</span>
      </li>`
    )
    .join("");

  const todo = points
    .map(
      (/** @type {any} */ a) => `<li>
        ${esc(a.text)}
        <span class="src">you wrote this on ${esc(a.noteTitle)}</span>
      </li>`
    )
    .join("");

  return `<article class="card prep-practice">
    <div class="card-top">
      <h2 class="card-title">What you are working on</h2>
      <span class="badge">${active.length}</span>
    </div>
    <p class="card-why">
      Flagged in Nib, read from there every time. Lower the flag when it starts
      coming naturally and pick up the next one - the timing is yours, and Tend
      deliberately puts no date on it.
    </p>
    ${lines ? `<div class="prep-block"><ul class="prep-list">${lines}</ul></div>` : ""}
    ${
      todo
        ? `<div class="prep-block">
             <h3 class="prep-head">And one thing you said you would do</h3>
             <ul class="prep-list">${todo}</ul>
           </div>`
        : ""
    }
    ${practising.tooMany ? `<p class="card-why dim">${esc(practising.tooMany)}</p>` : ""}
  </article>`;
}

/**
 * Where the card could not reach.
 *
 * Said out loud, because a card with no open work looks identical whether the
 * board was empty or unreachable. A missing integration that fails quietly can
 * sit there for weeks looking like a calm week.
 *
 * @param {any} result
 */
function sources(result) {
  const missing = [];
  if (!result.jotFound) {
    missing.push("the Jot board");
  }
  if (!result.nibFound) {
    missing.push("Nib's notes");
  }
  if (missing.length === 0) {
    return "";
  }
  return `<p class="prep-missing">
    Could not read ${esc(missing.join(" or "))}, so those parts of every card are
    blank rather than empty. Check the data directories in
    <button class="act" data-act="openSettings">Settings</button>.
  </p>`;
}

/**
 * @param {any} c
 * @param {{ available: boolean, why: string | null }} model
 */
function card(c, model) {
  return `
    <div class="card prep-card">
      <div class="card-top">
        <h2 class="card-title">${esc(c.person)}</h2>
        <span class="badge">${esc(c.behindBy ?? c.why)}</span>
      </div>
      <p class="card-why">
        ${esc(c.why)}. Last spoke ${esc(c.lastSpoke)}.
        ${c.relationMeans ? `<span class="src">${esc(c.relationMeans)}</span>` : ""}
      </p>

      ${section("You promised them", c.youPromised, (/** @type {any} */ p) => `${esc(p.text)} <span class="src">open ${esc(p.openFor)}</span>`)}

      ${raising(c)}

      ${section("They own", c.theyOwn, (/** @type {any} */ w) => `${esc(w.name)} <span class="src">${esc(w.mandate)} &middot; reviewed ${esc(w.lastReviewed)}</span>`)}

      ${
        c.openWork === null
          ? `<div class="prep-block"><h3 class="prep-head">Open on the board</h3><p class="src">Jot could not be read.</p></div>`
          : section("Open on the board", c.openWork, (/** @type {any} */ w) =>
              `${esc(w.text)} <span class="src">${esc(w.category)} &middot; ${esc(w.status)}${w.found === "named" ? " &middot; matched on their name" : ""}</span>`
            )
      }

      ${
        c.lastWrote
          ? `<div class="prep-block"><h3 class="prep-head">You last wrote</h3>
               <p class="prep-note">${esc(c.lastWrote.title)}
               <span class="src">${esc(new Date(c.lastWrote.edited).toLocaleDateString("sv-SE"))}</span></p></div>`
          : ""
      }

      ${draft(c, model)}

      <div class="card-foot">
        <span class="src">Everything here is already in Tend, Jot or Nib.</span>
        <span class="foot-actions">
          ${modelButtons(c, model)}
          <button class="act" data-act="openPerson" data-person="${esc(c.person)}">Open ${esc(c.person)}</button>
        </span>
      </div>
    </div>`;
}

/**
 * What is worth raising with this person, and a way to say you did.
 *
 * Each topic carries its own reason. That is not padding: the whole set is
 * questions whose value is not obvious in the moment - "what are you hearing
 * about me that I am not" reads as paranoid until you have read why it is on
 * the list - and a question you do not believe in is one you skip.
 *
 * The button is the honest half. Without a way to mark one raised, the same
 * three questions sit on the card forever and the block becomes wallpaper
 * within a fortnight.
 *
 * @param {any} c
 */
function raising(c) {
  const topics = Array.isArray(c.worthRaising) ? c.worthRaising : [];
  if (topics.length === 0) {
    return "";
  }
  return `
    <div class="prep-block">
      <h3 class="prep-head">Worth raising</h3>
      <ul class="prep-list prep-topics">
        ${topics
          .map(
            (/** @type {any} */ t) => `
          <li class="prep-topic">
            <div class="topic-line">
              <span class="topic-text">${esc(t.text)}</span>
              <button class="act" data-act="markRaised" data-topic="${esc(t.id)}" data-person="${esc(c.person)}">Raised it</button>
            </div>
            <span class="src">${esc(t.why)}</span>
            <span class="src">Last raised ${esc(t.lastRaised)}.</span>
          </li>`
          )
          .join("")}
      </ul>
    </div>`;
}

/**
 * A labelled block, or nothing at all.
 *
 * Nothing, rather than a heading with "none" under it: a card that lists four
 * empty sections is a card nobody reads to the bottom of.
 *
 * @param {string} title
 * @param {any[]} items
 * @param {(item: any) => string} line
 */
function section(title, items, line) {
  if (!Array.isArray(items) || items.length === 0) {
    return "";
  }
  return `
    <div class="prep-block">
      <h3 class="prep-head">${esc(title)}</h3>
      <ul class="prep-list">${items.map((i) => `<li>${line(i)}</li>`).join("")}</ul>
    </div>`;
}

/**
 * The two model buttons, or a disabled pair that says why.
 *
 * A feature that is simply missing when Claude Code is not installed reads as a
 * broken build. One that says what would turn it on is a setup instruction in
 * the only place anybody would look for it.
 *
 * @param {any} c
 * @param {{ available: boolean, why: string | null }} model
 */
function modelButtons(c, model) {
  if (!model.available) {
    return `<span class="src" title="${esc(model.why ?? "")}">Drafting is off - no Claude Code on this machine.</span>`;
  }

  const briefKey = `brief:${c.person}`;
  const noteKey = c.lastWrote ? `note:${c.lastWrote.id}` : null;

  const brief = isRunning(briefKey)
    ? `<button class="act" disabled>Drafting…</button>`
    : `<button class="act" data-act="draftBrief" data-person="${esc(c.person)}">Draft a brief</button>`;

  // Only where there is a note to read. Nothing here invents a reason to spend
  // a model call.
  const note =
    noteKey === null
      ? ""
      : isRunning(noteKey)
        ? `<button class="act" disabled>Reading…</button>`
        : `<button class="act" data-act="readNote" data-note="${esc(c.lastWrote.id)}" data-person="${esc(c.person)}">Read that note</button>`;

  return `${note}${brief}`;
}

/**
 * Whatever a model produced for this card, if anything.
 *
 * @param {any} c
 * @param {{ available: boolean }} model
 */
function draft(c, model) {
  if (!model.available) {
    return "";
  }

  const briefKey = `brief:${c.person}`;
  const noteKey = c.lastWrote ? `note:${c.lastWrote.id}` : null;

  const brief = resultFor(briefKey);
  const candidates = noteKey === null ? null : resultFor(noteKey);

  return [
    brief === null ? "" : briefHtml(briefKey, brief),
    candidates === null || noteKey === null ? "" : candidatesHtml(noteKey, candidates, c.person)
  ].join("");
}

export const actions = {
  /** @param {Record<string, string>} d */
  openPerson: (d) => go("people", { person: d.person }),
  openSettings: () => go("settings"),

  /** @param {Record<string, string>} d */
  draftBrief: (d) => run(`brief:${d.person}`, "draftBrief", { person: d.person }),

  /** @param {Record<string, string>} d */
  readNote: (d) => run(`note:${d.note}`, "extractPromises", { noteId: d.note }),

  /** @param {Record<string, string>} d */
  markRaised: async (d) => {
    await tend.invoke("markRaised", { topic: d.topic, person: d.person });
    go("prep");
  },

  ...modelActions()
};
