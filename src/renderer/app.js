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
import * as now from "./views/now.js";
import * as people from "./views/people.js";
import * as work from "./views/work.js";
import * as role from "./views/role.js";
import * as focus from "./views/focus.js";
import * as settings from "./views/settings.js";

/** @type {string[]} */
const errors = [];
/** @type {any} */ (window).__errors = errors;
window.addEventListener("error", (e) => errors.push(String(e.message)));
window.addEventListener("unhandledrejection", (e) => errors.push(String(e.reason)));

const VIEWS = { now, people, work, role, focus, settings };

const main = /** @type {HTMLElement} */ (document.getElementById("main"));

/** @type {{ view: keyof typeof VIEWS, params: Record<string, any> }} */
const route = { view: "now", params: {} };

/**
 * Navigate. Views call this rather than touching the route directly.
 *
 * @param {string} view
 * @param {Record<string, any>} [params]
 */
export function go(view, params = {}) {
  route.view = /** @type {any} */ (view in VIEWS ? view : "now");
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
  const [attention, roster, map, current] = await Promise.all([
    tend.invoke("attention"),
    tend.invoke("people"),
    tend.invoke("roleMap"),
    tend.invoke("focus")
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
}

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => go(String(/** @type {HTMLElement} */ (btn).dataset.view)));
});

// The window is frameless, so these three are the title bar's job.
document.querySelectorAll("[data-window]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const which = String(/** @type {HTMLElement} */ (btn).dataset.window);
    tend.invoke(which === "minimize" ? "minimizeWindow" : which === "maximize" ? "toggleMaximizeWindow" : "closeWindow");
  });
});

tend.invoke("status").then((s) => {
  const el = document.getElementById("version");
  if (el && s?.version) {
    el.textContent = s.version;
  }
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
 * Pick up writes from another process - the MCP server, or a scheduled job.
 * Only while the window is actually being looked at.
 */
setInterval(() => {
  if (document.visibilityState === "visible") {
    draw();
  }
}, 20_000);

draw();
