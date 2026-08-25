/**
 * The day, in four boxes.
 *
 * Its own place in the rail because it is its own act. Prep is what you read
 * before talking to somebody; this is what you write after a day, and folding it
 * into another view would make both of them worse.
 *
 * ## No prompt, and no count in the rail
 *
 * Every other view earns a number beside its name because something there is
 * waiting. Nothing here waits. Days get missed and that is the design, so a
 * badge would only ever be a reproach - and a tool that reproaches you every
 * evening is one you stop opening, which takes the data with it.
 *
 * ## The page says how thin it is
 *
 * Because a pass over five entries and a pass over twenty-five are different
 * claims. Saying so here, before any summary exists, means the honesty is
 * structural rather than something a model has to remember to mention.
 */

import { act, asDateInput, esc, form, tend } from "../ui.js";
import { refresh } from "../app.js";

export async function render() {
  const result = await tend.invoke("journal");

  if (result?.error) {
    return `<div class="card sev-critical"><div class="card-top">
      <h2 class="card-title">Could not read the journal</h2></div>
      <p class="card-why">${esc(result.error)}</p></div>`;
  }

  const entries = Array.isArray(result.entries) ? result.entries : [];
  const cover = result.coverage ?? { summary: "", thin: true, spread: 0 };

  const head = `
    <div class="view-head">
      <div class="head-row">
        <div>
          <h1 class="view-title">The day</h1>
          <p class="view-sub">
            Four boxes, all optional, no reminder and no streak. Missing days is
            expected - the value is in a month of them rather than in any one, so
            the only thing that matters is that writing one is cheap.
          </p>
        </div>
        <button class="act primary" data-act="writeEntry">Write today</button>
      </div>
    </div>`;

  const coverage = `
    <p class="prep-dropped">
      ${esc(cover.summary)}${
        cover.spread > 0 && cover.thin
          ? " Too few to call anything a pattern yet, which is worth knowing before any summary is read."
          : ""
      }
    </p>`;

  if (entries.length === 0) {
    return `${head}
      <div class="empty">
        Nothing written yet. The questions are what took the day, what you
        avoided, and what you would do differently - none of them things Tend can
        work out on its own, which is the only reason it asks.
      </div>`;
  }

  const fields = Array.isArray(result.fields) ? result.fields : [];

  return `${head}
    ${coverage}
    ${entries.map((/** @type {any} */ e) => entry(e, fields)).join("")}`;
}

/**
 * One day.
 *
 * A box left empty is absent rather than shown with a dash. Four labels with
 * nothing under three of them reads as a form you failed to fill in, when in
 * fact one filled box is a complete entry.
 *
 * @param {any} e
 * @param {{ name: string, label: string }[]} fields
 */
function entry(e, fields) {
  const lines = fields
    .filter((f) => String(e[f.name] ?? "") !== "")
    .map(
      (f) => `<div class="prep-block">
        <h3 class="prep-head">${esc(f.label)}</h3>
        <p class="prep-note">${esc(e[f.name])}</p>
      </div>`
    )
    .join("");

  return `<article class="card">
    <div class="card-top">
      <h2 class="card-title">${esc(new Date(e.at).toLocaleDateString("sv-SE"))}</h2>
      <span class="badge">${esc(e.when)}</span>
    </div>
    ${lines}
    <div class="card-foot">
      <span class="src">Written by you, read by nothing yet.</span>
      <span class="foot-actions">
        <button class="act" data-act="writeEntry" data-at="${esc(String(e.at))}">Edit</button>
        <button class="act danger" data-act="dropEntry" data-id="${esc(e.id)}" data-day="${esc(new Date(e.at).toLocaleDateString("sv-SE"))}">Remove</button>
      </span>
    </div>
  </article>`;
}

export const actions = {
  /** @param {Record<string, string>} d */
  writeEntry: async (d) => {
    const result = await tend.invoke("journal");
    const at = d.at === undefined ? Date.now() : Number(d.at);
    const day = new Date(at).toISOString().slice(0, 10);
    const existing = (result?.entries ?? []).find(
      (/** @type {any} */ e) => new Date(e.at).toISOString().slice(0, 10) === day
    );
    const fields = Array.isArray(result?.fields) ? result.fields : [];

    const values = await form({
      title: existing ? `Edit ${new Date(at).toLocaleDateString("sv-SE")}` : "How was the day?",
      intro:
        "Leave any of them empty. One filled box is a real entry, and three required ones would " +
        "only produce something invented at eleven at night - which reads like a fact afterwards " +
        "and is worse than nothing.",
      fields: [
        ...fields.map((/** @type {any} */ f) => ({
          name: f.name,
          label: f.label,
          type: /** @type {const} */ ("textarea"),
          value: existing?.[f.name] ?? "",
          hint: f.hint
        })),
        { name: "at", label: "Which day", type: /** @type {const} */ ("date"), value: asDateInput(at) }
      ],
      confirm: "Keep it"
    });
    if (!values) {
      return;
    }
    if (await act("logEntry", values, "Kept.")) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  dropEntry: async (d) => {
    if (await act("removeRow", { collection: "entries", id: d.id }, "Removed.")) {
      refresh();
    }
  }
};
