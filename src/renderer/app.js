/**
 * The shell: navigation, the view contract, and one click handler.
 *
 * A view exports `render(params)` returning HTML, and an `actions` map from a
 * `data-act` value to a function. One delegated listener dispatches into the
 * current view's map, so no view attaches its own listeners and none can leak
 * them across a redraw.
 *
 * Everything the window can do goes through `tend.invoke`, which reaches the
 * same service layer an agent reaches over MCP. There is no second
 * implementation of anything here.
 */

import { esc, tend, toast } from "./ui.js";
import { installPalette } from "./palette.js";
import * as now from "./views/now.js";
import * as prep from "./views/prep.js";
import * as journal from "./views/journal.js";
import * as decisions from "./views/decisions.js";
import * as people from "./views/people.js";
import * as work from "./views/work.js";
import * as role from "./views/role.js";
import * as focus from "./views/focus.js";
import * as knowledge from "./views/knowledge.js";
import * as settings from "./views/settings.js";

/** @type {string[]} */
const errors = [];
/** @type {any} */ (window).__errors = errors;
window.addEventListener("error", (e) => errors.push(String(e.message)));
window.addEventListener("unhandledrejection", (e) => errors.push(String(e.reason)));

const VIEWS = { now, prep, journal, people, work, role, decisions, focus, knowledge, settings };

const main = /** @type {HTMLElement} */ (document.getElementById("main"));

/** @type {{ view: keyof typeof VIEWS, params: Record<string, any> }} */
const route = { view: "now", params: {} };

/**
 * What this half consists of, answered by the service.
 *
 * Not a constant in this file, and that is the point. The private half's first
 * version had a hand-written array of which views belonged in it, which is the
 * fifth copy of a derived list this project has grown - and the previous four
 * all ended the same way, with the renderer quietly disagreeing with the service
 * about what existed. `domain/halves.js` declares it once and this asks.
 *
 * Starts as the work half so the very first draw has something to work with, and
 * is replaced as soon as the answer arrives.
 */
let half = {
  half: "work",
  home: "now",
  /** @type {{ id: string, name: string, hint: string }[]} */
  views: [],
  /** @type {any[]} */
  relations: [],
  defaultRelation: "lead-and-manage",
  personBlocks: {}
};

/** What the rest of the window reads. */
export function currentHalf() {
  return half;
}

/**
 * Navigate. Views call this rather than touching the route directly.
 *
 * @param {string} view
 * @param {Record<string, any>} [params]
 */
export function go(view, params = {}) {
  // Two gates, not one. `view in VIEWS` only asks whether the module exists -
  // every view's module exists in both halves - so the old fallback to "now"
  // drew the work radar over private data whenever anything navigated somewhere
  // this half does not have. Which the palette did, on every keystroke.
  const known = view in VIEWS;
  const here = half.views.length === 0 || half.views.some((v) => v.id === view);
  route.view = /** @type {any} */ (known && here ? view : half.home);
  route.params = params;
  draw();
}

/** Redraw the current view in place, keeping its parameters. */
export function refresh() {
  draw();
}

async function draw() {
  document.querySelectorAll(".nav-btn").forEach((b) => {
    const target = /** @type {HTMLElement} */ (b).dataset.view;
    b.setAttribute("aria-current", String(target === route.view));
  });

  const view = VIEWS[route.view];
  try {
    main.innerHTML = await view.render(route.params);
  } catch (err) {
    main.innerHTML = `<div class="card sev-critical">
      <div class="card-top"><h2 class="card-title">This view could not be drawn</h2></div>
      <p class="card-why">${esc(err instanceof Error ? err.message : String(err))}</p>
    </div>`;
  }

  updateCounts();
}

/**
 * The rail counts. Deliberately quiet: a number that is always there stops
 * being read, so anything at zero shows nothing at all.
 */
async function updateCounts() {
  /*
   * Nothing to count in the private half, and nothing that should be computed
   * there either.
   *
   * Drift, cadences, prep and a focus budget are absent from that half rather
   * than turned down - see DECISIONS.md - and running them anyway to fill badges
   * on hidden buttons would make "absent" a statement about the rail instead of
   * about the app. It would also be six passes over the wrong kind of data on
   * every redraw, forever.
   */
  if (half.half === "private") {
    return;
  }

  const [attention, roster, map, current, cards, ledger] = await Promise.all([
    tend.invoke("attention"),
    tend.invoke("people"),
    tend.invoke("roleMap"),
    tend.invoke("focus"),
    tend.invoke("prep"),
    tend.invoke("decisions")
  ]);

  /** @param {string} id @param {string} text @param {string} [tone] */
  const set = (id, text, tone) => {
    const el = document.getElementById(id);
    if (!el) {
      return;
    }
    el.textContent = text;
    el.className = `nav-count${tone ? ` ${tone}` : ""}`;
  };

  const needs = attention?.needsYou?.length ?? 0;
  const nudges = attention?.nudges?.length ?? 0;
  set("count-now", needs > 0 ? String(needs) : nudges > 0 ? String(nudges) : "", needs > 0 ? "urgent" : "");
  set("count-people", Array.isArray(roster) && roster.length ? String(roster.length) : "");
  set("count-role", map?.proposed?.length ? `${map.proposed.length} new` : "", map?.proposed?.length ? "new" : "");
  set("count-focus", current?.active ? (current.overrun ? "over" : "on") : "", current?.overrun ? "urgent" : "");
  set("count-prep", cards?.cards?.length ? String(cards.cards.length) : "");

  // Proposals and overdue revisits, together. Both are "this needs a decision
  // from you"; a count that only showed one of them would be a count you learn
  // to distrust.
  const waiting = Array.isArray(ledger)
    ? ledger.filter((/** @type {any} */ d) => d.status === "proposed" || d.revisitDue).length
    : 0;
  set("count-decisions", waiting > 0 ? String(waiting) : "", waiting > 0 ? "new" : "");
}

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => go(String(/** @type {HTMLElement} */ (btn).dataset.view)));
});

// Ctrl+K. Bound on the window rather than owned by a view, because the point of
// it is that a promise can be logged from wherever you happen to be standing.
installPalette();

// The window is frameless, so these three are the title bar's job. They come
// from keel rather than through `tend.invoke`: window chrome is not an
// operation on Tend's data, and every app in the suite answers these same
// three messages.
const WINDOW_BUTTONS = {
  minimize: () => tend.minimizeWindow(),
  maximize: () => tend.toggleMaximizeWindow(),
  close: () => tend.closeWindow()
};

document.querySelectorAll("[data-window]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const which = String(/** @type {HTMLElement} */ (btn).dataset.window);
    /** @type {Record<string, () => void>} */ (WINDOW_BUTTONS)[which]?.();
  });
});

/**
 * Make the half impossible to miss, and take away what it does not have.
 *
 * Three signals rather than one, because the failure this guards against is
 * typing something about your family into the work store. The window title
 * carries it outside the app, the accent colour carries it at a glance, and the
 * rail carries it by being visibly shorter.
 *
 * Which views survive is asked, never listed here. See `currentHalf`.
 *
 * @param {any} answer What `vocabulary` returned.
 */
function applyHalf(answer) {
  half = {
    half: String(answer?.half ?? "work"),
    home: String(answer?.home ?? "now"),
    views: Array.isArray(answer?.views) ? answer.views : [],
    relations: Array.isArray(answer?.relations) ? answer.relations : [],
    defaultRelation: String(answer?.defaultRelation ?? "lead-and-manage"),
    personBlocks: answer?.personBlocks ?? {}
  };
  document.documentElement.dataset.mode = half.half;

  /*
   * Removed from the document, not hidden.
   *
   * The first version set `hidden`, and the buttons stayed on screen: `[hidden]`
   * is a user-agent rule at the lowest specificity, and `.nav-btn { display: flex }`
   * beats it. So the private half drew every work entry, clicking one bounced to
   * this half's home view, and the last one clicked kept its hover highlight -
   * looking selected while a different view was open.
   *
   * A button that is not in the document cannot be clicked, cannot be styled back
   * into view by a later rule, cannot be found by a selector, and cannot hold a
   * hover state. Nothing here is undone later either: the half is chosen at launch
   * and switching it restarts the app.
   */
  const ids = new Set(half.views.map((v) => v.id));
  if (ids.size > 0) {
    for (const button of [...document.querySelectorAll(".nav-btn")]) {
      if (!ids.has(String(/** @type {HTMLElement} */ (button).dataset.view))) {
        button.remove();
      }
    }
  }

  const badge = document.getElementById("mode-badge");
  if (badge) {
    badge.textContent = half.half === "private" ? "private" : "";
  }

  /*
   * The mark, per half.
   *
   * A fourth signal, and the one that reads fastest - a shape is recognised
   * before a word is. The window icon carries the same distinction outside the
   * app, which is the only place any of this is visible when it is not focused.
   *
   * Falls back to the work mark if the private file is missing rather than
   * showing a broken image: the artwork is optional, and a missing default must
   * degrade to "looks like the work half" rather than to "looks broken".
   */
  const mark = document.getElementById("brand-mark");
  if (mark instanceof HTMLImageElement && half.half === "private") {
    mark.onerror = () => {
      mark.onerror = null;
      mark.src = "assets/tend-logo.png";
    };
    mark.src = "assets/tend-logo-private.png";
  }

  // Standing on a view this half does not have would draw a work view over
  // private data, which is the one thing the whole arrangement exists to
  // prevent.
  if (ids.size > 0 && !ids.has(route.view)) {
    go(half.home);
  }
}

/*
 * The half, before the first draw finishes.
 *
 * Awaited rather than fired and forgotten: until it lands the window believes it
 * is the work half, and a draw in that gap would put the work radar on screen
 * over private data for as long as the round trip takes. It is a local call and
 * the gap is milliseconds, which is exactly the kind of window that works on this
 * machine and does not on a slower one.
 */
Promise.all([tend.invoke("status"), tend.invoke("vocabulary")]).then(([s, v]) => {
  const el = document.getElementById("version");
  if (el && s?.version) {
    el.textContent = s.version;
  }
  applyHalf(v);
});

document.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const trigger = target.closest("[data-act]");
  if (!(trigger instanceof HTMLElement)) {
    return;
  }

  const name = String(trigger.dataset.act);
  const handler = /** @type {Record<string, any>} */ (VIEWS[route.view].actions ?? {})[name];
  if (!handler) {
    return;
  }

  // Guard against a double click firing a write twice.
  if (trigger.hasAttribute("data-busy")) {
    return;
  }
  trigger.setAttribute("data-busy", "true");

  try {
    await handler({ ...trigger.dataset }, trigger);
  } catch (err) {
    toast(err instanceof Error ? err.message : String(err), "bad");
  } finally {
    trigger.removeAttribute("data-busy");
  }
});

/**
 * Writes from another process - the MCP server, or a scheduled job.
 *
 * Event-driven rather than polled. The poll this replaced ran every twenty
 * seconds and it worked, but it did the work whether or not anything had
 * changed: a full view render plus six calls into the service layer, which on
 * Prep means re-reading Nib's whole index and Jot's board off disk. Forever, on
 * an app meant to be left open all day. Now the main process watches the log
 * and says when there is something to redraw for, so the common case - nothing
 * happened - costs nothing and the uncommon case is immediate instead of up to
 * twenty seconds late.
 *
 * The slow timer stays as a backstop rather than being deleted. Directory
 * watching is the part most likely to fail quietly on somebody's machine, and
 * the data directory can be pointed at Dropbox, where it is least reliable. Two
 * minutes is slow enough to cost nothing and fast enough that a broken watcher
 * is an annoyance rather than a bug report.
 */
const BACKSTOP_MS = 120_000;

/**
 * Redrawing under an open dialog pulls the ground out from under whatever is
 * being typed into it. Skipped rather than queued: the actions that close a
 * dialog redraw anyway, and the backstop catches anything they miss.
 */
function busyWithSomething() {
  return document.querySelector(".dialog, .palette-scrim") !== null;
}

function refreshFromOutside() {
  if (document.visibilityState === "visible" && !busyWithSomething()) {
    draw();
  }
}

tend.onChanged(refreshFromOutside);
setInterval(refreshFromOutside, BACKSTOP_MS);

draw();
