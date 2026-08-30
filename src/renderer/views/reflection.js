/**
 * A weekly-ish look back, in its own place in the rail.
 *
 * Its own slot rather than folded into "The day" or "Now": the day is a
 * nightly retrospective that never prompts and is about everywhere a single
 * day went, and Now is deviations only. This is looser and slower - about a
 * week or so - and asks a narrower question of its own. See the header of
 * `src/domain/reflection.js` for the full reasoning; this file only renders
 * it.
 *
 * No count in the rail, same reasoning as "The day": nothing here is late,
 * so a badge would only ever be a reproach.
 */

import { REFLECTION_FIELDS } from "../../domain/reflection.js";
import { act, esc, form, tend } from "../ui.js";
import { refresh } from "../app.js";

export async function render() {
  const [rows, mine] = await Promise.all([tend.invoke("reflections"), tend.invoke("myAttention")]);

  const nudge = (Array.isArray(mine) ? mine : []).find(
    (/** @type {any} */ s) => s.key === "i-have-not-reflected"
  );

  const reflections = Array.isArray(rows) ? rows : [];

  const head = `
    <div class="view-head">
      <div class="head-row">
        <div>
          <h1 class="view-title">Reflection</h1>
          <p class="view-sub">
            Occasional, never late, and two fixed questions rather than a blank
            box: what went well over the last week or so, and what you would do
            differently. Nothing here is required, and nothing here is read back
            to anyone.
          </p>
        </div>
        <span class="foot-actions">
          <button class="act primary" data-act="addReflection">Add a reflection</button>
        </span>
      </div>
      ${
        nudge === undefined
          ? ""
          : `<div class="mine-row">
               <span class="mine-text">${esc(String(nudge.text))}</span>
               <span class="src">${esc(String(nudge.detail ?? ""))}</span>
             </div>`
      }
    </div>`;

  if (reflections.length === 0) {
    return `${head}
      <div class="empty">
        Nothing written yet. The two questions are what went well and what you
        would do differently - answer either one, or both.
      </div>`;
  }

  return `${head}${reflections.map(reflectionCard).join("")}`;
}

/** @param {any} r */
function reflectionCard(r) {
  const blocks = REFLECTION_FIELDS.filter((f) => r[f.name] !== null && r[f.name] !== undefined && r[f.name] !== "")
    .map(
      (f) => `<div class="prep-block">
        <h3 class="prep-head">${esc(f.label)}</h3>
        <p class="prep-note">${esc(String(r[f.name]))}</p>
      </div>`
    )
    .join("");

  return `<article class="card" data-reflection="${esc(String(r.id))}">
    <div class="card-top">
      <h2 class="card-title">${esc(new Date(r.at).toLocaleDateString("sv-SE"))}</h2>
      <span class="badge">${esc(String(r.when))}</span>
    </div>
    ${blocks}
    <div class="card-foot">
      <span class="src">Written by you.</span>
      <span class="foot-actions">
        <button class="act danger" data-act="removeReflection" data-id="${esc(String(r.id))}">Remove</button>
      </span>
    </div>
  </article>`;
}

export const actions = {
  /**
   * A short look back. All fields optional at the form level - the service
   * enforces the real rule (at least one of the two primary questions) and
   * returns an error, which `act()` already surfaces as a toast.
   */
  addReflection: async () => {
    const values = await form({
      title: "How did the week go?",
      intro: "Answer at least one of the first two - notes alone is not a reflection.",
      fields: REFLECTION_FIELDS.map((f) => ({
        name: f.name,
        label: f.label,
        type: /** @type {const} */ ("textarea"),
        hint: f.hint
      })),
      confirm: "Keep it"
    });
    if (!values) {
      return;
    }
    if (await act("logReflection", values, "Kept.")) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  removeReflection: async (d) => {
    if (await act("removeRow", { collection: "reflections", id: d.id }, "Removed.")) {
      refresh();
    }
  }
};
