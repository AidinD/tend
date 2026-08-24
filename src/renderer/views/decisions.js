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
  { name: "because", label: "Why. In a year this is the only field that matters", type: "textarea" },
  { name: "rejected", label: "What was considered and not chosen", type: "textarea" },
  {
    name: "consulted",
    label: "Who was consulted (comma separated)",
    type: "text",
    hint: (roster ?? []).map((/** @type {any} */ p) => p.name).join(", ") || "nobody on the roster yet"
  },
  { name: "revisitDays", label: "Come back to it in how many days", type: "number", value: "90" }
];

export const actions = {
  add: async () => {
    const roster = await tend.invoke("people");
    const values = await form({
      title: "Record a decision",
      intro:
        "The revisit date is the field that makes this a tool. A decision that comes back to you is one you can make today instead of gathering information you will not use.",
      fields: fields(roster),
      confirm: "Record it"
    });
    if (!values) {
      return;
    }
    await act("logDecision", {
      what: values.what,
      because: values.because,
      rejected: values.rejected,
      consulted: String(values.consulted ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s !== ""),
      revisitDays: Number(values.revisitDays) || 90
    });
    refresh();
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
            ? current.consulted.join(", ")
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
        consulted: String(values.consulted ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s !== ""),
        revisitDays: Number(values.revisitDays) || 90
      }
    });
    refresh();
  }
};
