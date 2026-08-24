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

export async function render() {
  const result = await tend.invoke("prep");

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
      <div class="empty">
        Nobody is behind and nothing is owed. This page is empty most days, which
        is the point of it.
      </div>
      ${sources(result)}`;
  }

  return `${head}
    ${cards.map(card).join("")}
    ${result.dropped > 0 ? `<p class="prep-dropped">${result.dropped} more further behind than nobody, held back so this page ends.</p>` : ""}
    ${sources(result)}`;
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

/** @param {any} c */
function card(c) {
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

      <div class="card-foot">
        <span class="src">Everything here is already in Tend, Jot or Nib.</span>
        <button class="act" data-act="openPerson" data-person="${esc(c.person)}">Open ${esc(c.person)}</button>
      </div>
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

export const actions = {
  /** @param {Record<string, string>} d */
  openPerson: (d) => go("people", { person: d.person }),
  openSettings: () => go("settings")
};
