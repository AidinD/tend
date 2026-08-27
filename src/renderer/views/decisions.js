/**
 * The decision log.
 *
 * Three things on one page, in the order they need you: proposals waiting to be
 * recorded, decisions asking to be looked at again, and then the log itself.
 *
 * The revisit date is the reason this is a view and not a document. A log you
 * have to remember to read is an archive; one that comes back to you is a tool.
 */

import { act, ask, esc, form, tend } from "../ui.js";
import { refresh } from "../app.js";

export async function render() {
  const [all, roster] = await Promise.all([tend.invoke("decisions"), tend.invoke("people")]);

  if (all?.error) {
    return `<div class="card sev-critical"><div class="card-top">
      <h2 class="card-title">Could not read the data</h2></div>
      <p class="card-why">${esc(all.error)}</p></div>`;
  }

  const list = Array.isArray(all) ? all : [];
  const proposed = list.filter((d) => d.status === "proposed");
  const due = list.filter((d) => d.revisitDue);
  const logged = list.filter((d) => d.status !== "proposed" && !d.revisitDue);

  const head = `
    <div class="view-head">
      <h1 class="view-title">Decisions</h1>
      <p class="view-sub">
        What was decided about the organisation, why, and what was rejected. Every
        one carries a date it comes back on, which is what makes it something you
        can decide quickly: a decision with a revisit date is not forever.
      </p>
      <div class="card-foot">
        <span class="src">Code has DECISIONS.md. This is the half that has no commit history.</span>
        <button class="act" data-act="add">Record a decision</button>
      </div>
    </div>`;

  if (list.length === 0) {
    return `${head}
      <div class="empty">
        Nothing logged yet. The ones worth recording are the ones that get
        renegotiated: who owns what, who is not being backfilled, what is waiting
        a cycle.
      </div>`;
  }

  return `${head}
    ${block("Suggested, not yet recorded", proposed, proposal, "An agent read these somewhere. Recording one is what starts its clock.")}
    ${block("Worth another look", due, revisit, "The date you set has passed. Saying it still holds takes one click.")}
    ${block("Logged", logged, entry)}`;
}

/**
 * @param {string} title
 * @param {any[]} items
 * @param {(d: any) => string} draw
 * @param {string} [note]
 */
function block(title, items, draw, note) {
  if (items.length === 0) {
    return "";
  }
  return `
    <div class="ledger-band">
      <h2 class="ledger-band-title">${esc(title)}</h2>
      ${note ? `<p class="ledger-band-note">${esc(note)}</p>` : ""}
    </div>
    ${items.map(draw).join("")}`;
}

/** @param {any} d */
function proposal(d) {
  return `
    <div class="card sev-nudge">
      <div class="card-top">
        <h2 class="card-title">${esc(d.what)}</h2>
        <span class="badge">proposed</span>
      </div>
      ${body(d)}
      <div class="card-foot">
        <span class="src">${d.source ? `Read in ${esc(d.source)}` : "No source given"}${d.proposedBy ? ` &middot; by ${esc(d.proposedBy)}` : ""}</span>
        <button class="act" data-act="record" data-id="${esc(d.id)}">Record it</button>
        <button class="act" data-act="edit" data-id="${esc(d.id)}">Edit first</button>
        <button class="act" data-act="drop" data-id="${esc(d.id)}">Not a decision</button>
      </div>
    </div>`;
}

/** @param {any} d */
function revisit(d) {
  return `
    <div class="card sev-critical">
      <div class="card-top">
        <h2 class="card-title">${esc(d.what)}</h2>
        <span class="badge">due ${esc(d.revisitOverdueBy ?? "now")}</span>
      </div>
      ${body(d)}
      <div class="card-foot">
        <span class="src">You set this date. Nothing has happened to the decision.</span>
        <button class="act" data-act="holds" data-id="${esc(d.id)}">It still holds</button>
        <button class="act" data-act="edit" data-id="${esc(d.id)}">Change it</button>
        <button class="act" data-act="reverse" data-id="${esc(d.id)}">Reverse it</button>
      </div>
    </div>`;
}

/** @param {any} d */
function entry(d) {
  return `
    <div class="card">
      <div class="card-top">
        <h2 class="card-title">${esc(d.what)}</h2>
        <span class="badge">${esc(d.status)}</span>
      </div>
      ${body(d)}
      <div class="card-foot">
        <span class="src">
          ${esc(new Date(d.decidedAt).toLocaleDateString("sv-SE"))}
          ${d.revisitAt ? `&middot; back on ${esc(new Date(d.revisitAt).toLocaleDateString("sv-SE"))}` : "&middot; no revisit date"}
        </span>
        <button class="act" data-act="edit" data-id="${esc(d.id)}">Edit</button>
      </div>
    </div>`;
}

/**
 * The fields, and what is missing.
 *
 * `missing` is said out loud on every card rather than only when recording,
 * because the field people skip is `because` and it is the only one that still
 * matters in a year. A record that cannot be read by somebody who was not there
 * is not worth keeping.
 *
 * @param {any} d
 */
function body(d) {
  return `
    ${d.because ? `<p class="card-why">${esc(d.because)}</p>` : ""}
    ${d.rejected ? `<p class="card-why dim">Rejected: ${esc(d.rejected)}</p>` : ""}
    ${d.consulted.length > 0 ? `<p class="card-why dim">Consulted: ${esc(d.consulted.join(", "))}</p>` : ""}
    ${d.missing.length > 0 ? `<p class="card-why warn-text">Missing ${esc(d.missing.join(" Missing "))}</p>` : ""}`;
}

/**
 * @param {any[]} roster
 * @returns {import("../ui.js").Field[]}
 */
const fields = (roster) => [
  { name: "what", label: "What was decided", type: "text", required: true },
  // The ledger has always modelled a proposal and the window never offered one,
  // so the only way to record something not yet agreed was to call it decided.
  {
    name: "status",
    label: "Is this decided, or are you proposing it?",
    type: "select",
    options: [
      { value: "recorded", label: "Decided - this is what we are doing" },
      { value: "proposed", label: "Proposed - waiting for somebody to agree" }
    ],
    value: "recorded",
    hint: "A proposal gets no revisit date. Nothing has been decided yet, so there is nothing to come back to."
  },
  { name: "because", label: "Why. In a year this is the only field that matters", type: "textarea" },
  { name: "rejected", label: "What was considered and not chosen", type: "textarea" },
  {
    name: "consulted",
    label: "Who was consulted",
    /*
     * Picked from the roster, not typed.
     *
     * It was a comma-separated text box with the valid names listed in the hint,
     * and it cost a whole filled-in decision: the service refuses a name it does
     * not know, and at the time the dialog closed on that refusal and took four
     * fields of prose with it. `attempt` fixed the second half of that failure -
     * the form stays open now - but the first half was always the field's fault.
     * A name that cannot be mistyped cannot be rejected.
     *
     * It also removes the hint that had to list the roster inside the label,
     * which was a derived list rendered as prose - the shape this project keeps
     * being bitten by.
     */
    type: "multiselect",
    options: (roster ?? []).map((/** @type {any} */ p) => ({
      value: String(p.name),
      label: String(p.name)
    })),
    value: [],
    // Only people Tend already knows, and the list is now the enforcement rather
    // than a warning. Adding somebody to the roster just to name them here would
    // be worse than leaving it empty: everyone on the roster is counted by the
    // attention signals, so a dozen colleagues you have no duties toward turns
    // "I have not spoken to 11 of 13 people this month" into noise.
    hint:
      (roster ?? []).length > 0
        ? "Anybody not on this list belongs in the reason instead - adding them to the roster to name them here would make every attention signal noisier."
        : "Nobody on the roster yet, so name whoever it was in the reason instead."
  },
  {
    name: "revisitDays",
    label: "Come back to it in how many days",
    type: "number",
    value: "90",
    showIf: { field: "status", equals: "recorded" },
    hint:
      "A date is a poor stand-in for a real trigger. When what should bring it back is an event - " +
      "the next project of a certain kind, a new hire - write the event into the reason and treat " +
      "this as the backstop that catches it if the event passes unnoticed."
  }
];

export const actions = {
  add: async () => {
    const roster = await tend.invoke("people");
    // Written through `attempt` so a rejection keeps the dialog open with the
    // reasoning still in it. This form has four fields of prose and one that can
    // be rejected by the service, which is the worst possible combination for
    // closing on failure.
    const values = await form({
      title: "Record a decision",
      intro:
        "The revisit date is the field that makes this a tool. A decision that comes back to you is one you can make today instead of gathering information you will not use.",
      fields: fields(roster),
      confirm: "Record it",
      attempt: async (v) => {
        const result = await tend.invoke("logDecision", {
          what: v.what,
          because: v.because,
          rejected: v.rejected,
          status: v.status || "recorded",
          consulted: Array.isArray(v.consulted) ? v.consulted : [],
          revisitDays: Number(v.revisitDays) || 90
        });
        return result?.error ? String(result.error) : null;
      }
    });
    if (values) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  record: async (d) => {
    await act("decideDecision", { id: d.id, fields: { status: "recorded" } });
    refresh();
  },

  /** @param {Record<string, string>} d */
  holds: async (d) => {
    await act("stillHolds", { id: d.id, days: 90 });
    refresh();
  },

  /** @param {Record<string, string>} d */
  reverse: async (d) => {
    const sure = await ask({
      title: "Reverse it?",
      body: "It stays in the log as reversed, and stops coming back. The reasoning is still readable, which is the point of keeping it.",
      confirm: "Reverse it"
    });
    if (!sure) {
      return;
    }
    await act("decideDecision", { id: d.id, fields: { status: "reversed" } });
    refresh();
  },

  /** @param {Record<string, string>} d */
  drop: async (d) => {
    const sure = await ask({
      title: "Not a decision?",
      body: "The proposal is removed and nothing else changes. Turning one down is information too - it says the reading was wrong.",
      confirm: "Remove it"
    });
    if (!sure) {
      return;
    }
    await act("removeRow", { collection: "decisions", id: d.id });
    refresh();
  },

  /** @param {Record<string, string>} d */
  edit: async (d) => {
    const [all, roster] = await Promise.all([tend.invoke("decisions"), tend.invoke("people")]);
    const current = (Array.isArray(all) ? all : []).find((x) => x.id === d.id);
    if (!current) {
      return;
    }
    const values = await form({
      title: "Edit",
      fields: fields(roster).map((f) => ({
        ...f,
        value:
          f.name === "consulted"
            ? // The array, so the ticks come back ticked. Joining it into a string
              // here silently emptied the field on every edit once the control
              // stopped being a text box.
              (current.consulted ?? [])
            : f.name === "revisitDays"
              ? "90"
              : String(current[f.name] ?? "")
      })),
      confirm: "Save"
    });
    if (!values) {
      return;
    }
    await act("decideDecision", {
      id: d.id,
      fields: {
        what: values.what,
        because: values.because,
        rejected: values.rejected,
        consulted: Array.isArray(values.consulted) ? values.consulted : [],
        revisitDays: Number(values.revisitDays) || 90
      }
    });
    refresh();
  }
};
