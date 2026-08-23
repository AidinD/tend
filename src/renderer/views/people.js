/**
 * People, grouped by relationship rather than by org chart.
 *
 * The grouping is the point. What you owe someone you lead daily is not what
 * you owe someone you manage from two teams away, and a tool that lists them
 * together hides the one gap that matters most here.
 */

import {
  act,
  ask,
  asDateInput,
  CONTACT_KINDS,
  esc,
  form,
  pill,
  RELATION_OPTIONS,
  tend
} from "../ui.js";
import { go, refresh } from "../app.js";

const GROUPS = [
  ["lead-and-manage", "Lead and manage"],
  ["lead-only", "Lead, don't manage"],
  ["manage-remotely", "Manage, don't see"],
  ["equal-lead", "Equal leads"],
  ["own-manager", "Your manager"]
];

/** @param {Record<string, any>} params */
export async function render(params) {
  if (params.person) {
    return personPage(params.person);
  }

  const roster = await tend.invoke("people");

  const header = `
    <div class="view-head">
      <div class="head-row">
        <div>
          <h1 class="view-title">People</h1>
          <p class="view-sub">Grouped by the relationship, not the org chart.</p>
        </div>
        <button class="act primary" data-act="addPerson">Add someone</button>
      </div>
    </div>`;

  if (!Array.isArray(roster) || roster.length === 0) {
    return `${header}<div class="empty">
      Nobody here yet. Add the people you lead or manage, and the leads you work beside.
    </div>`;
  }

  const body = GROUPS.map(([relation, label]) => {
    const members = roster.filter((/** @type {any} */ p) => p.relation === relation);
    if (members.length === 0) {
      return "";
    }
    const rows = members
      .map(
        (/** @type {any} */ p) => `<button class="row" data-act="open" data-person="${esc(p.id)}">
          <span class="row-name">${esc(p.name)}</span>
          <span class="row-right">
            ${
              p.worstDrift
                ? `<span class="row-meta">${esc(p.worstDrift.duty)}</span>${pill(p.worstDrift.urgency)}<span class="pill plain">${esc(p.worstDrift.behindBy)}</span>`
                : `<span class="row-meta">no duty applies</span>`
            }
          </span>
        </button>`
      )
      .join("");
    return `<div class="group">
      <div class="group-head"><span class="group-title">${esc(label)}</span><span class="group-rule"></span><span class="group-meta">${members.length}</span></div>
      <div class="rows">${rows}</div>
    </div>`;
  }).join("");

  return header + body;
}

/** @param {string} id */
async function personPage(id) {
  const p = await tend.invoke("person", { person: id });
  if (p.error) {
    return `<div class="card sev-critical"><div class="card-top">
      <h2 class="card-title">Not found</h2></div><p class="card-why">${esc(p.error)}</p>
      <div class="card-foot"><button class="act" data-act="back">All people</button></div></div>`;
  }

  const list = (/** @type {string} */ title, /** @type {string} */ body, /** @type {string} */ emptyText) =>
    `<div class="block"><div class="block-title">${esc(title)}</div>${body || `<div class="empty">${esc(emptyText)}</div>`}</div>`;

  const cadences = p.cadences
    .map(
      (/** @type {any} */ c) => `<div class="line">
        <span class="line-when">${esc(c.behindBy)}</span>
        <span class="line-text"><strong>${esc(c.duty)}</strong> — target ${esc(c.target)}, last ${esc(c.lastHappened)}</span>
        <span class="line-right">${pill(c.urgency)}</span>
      </div>`
    )
    .join("");

  const promises = p.openPromises
    .map(
      (/** @type {any} */ x) => `<div class="line">
        <span class="line-when">${esc(x.openFor)}</span>
        <span class="line-text">${esc(x.text)}</span>
        <span class="line-right">
          ${pill(x.urgency)}
          <button class="act tiny" data-act="resolvePromise" data-id="${esc(x.id)}">Done</button>
        </span>
      </div>`
    )
    .join("");

  const contact = p.recentContact
    .map(
      (/** @type {any} */ t) => `<div class="line">
        <span class="line-when">${esc(t.when)}</span>
        <span class="line-text"><strong>${esc(t.kind)}</strong>${t.note ? ` — ${esc(t.note)}` : ""}</span>
      </div>`
    )
    .join("");

  const observations = p.observations
    .map(
      (/** @type {any} */ e) => `<div class="line">
        <span class="line-when">${esc(new Date(Number(e.at)).toISOString().slice(0, 10))}</span>
        <span class="line-text">${esc(e.text)}</span>
      </div>`
    )
    .join("");

  return `
    <div class="view-head"><button class="act" data-act="back">← All people</button></div>
    <div class="panel">
      <div class="panel-head">
        <div>
          <h2 class="panel-name">${esc(p.name)}</h2>
          <p class="panel-role">${esc(p.relationMeans)}</p>
        </div>
        <div class="panel-actions">
          <span class="tag">${esc(p.relation)}</span>
          <button class="act" data-act="edit" data-person="${esc(p.id)}">Edit</button>
        </div>
      </div>

      <div class="button-row">
        <button class="act primary" data-act="logContact" data-person="${esc(p.id)}">Log contact</button>
        <button class="act" data-act="logPromise" data-person="${esc(p.id)}">I promised something</button>
        <button class="act" data-act="logEvidence" data-person="${esc(p.id)}">Record an observation</button>
      </div>

      ${list("Cadences", cadences, "No duty in the role map applies to this relationship type.")}
      ${list("Open promises", promises, "Nothing outstanding.")}
      ${list("Recent contact", contact, "No contact recorded yet.")}
      ${list("Observations", observations, "Nothing recorded. This is what a review conversation is built from.")}

      <div class="block danger-zone">
        <button class="act danger" data-act="remove" data-person="${esc(p.id)}" data-name="${esc(p.name)}">Remove ${esc(p.name)}</button>
      </div>
    </div>
  `;
}

/**
 * Shared with the Now view's first-run card.
 *
 * @returns {Promise<boolean>} Whether someone was added.
 */
export async function addPersonDialog() {
  const values = await form({
    title: "Add someone",
    intro: "The relationship type decides which duties apply to them.",
    fields: [
      { name: "name", label: "Name", required: true, placeholder: "Their full name" },
      { name: "relation", label: "How you relate to them", type: "select", options: RELATION_OPTIONS, value: "lead-and-manage" },
      {
        name: "since",
        label: "Since when",
        type: "date",
        value: asDateInput(Date.now()),
        hint: "When the relationship started, not today. Leave it as today for someone who just joined; set it back for someone you have had for months, or Tend will think you are perfectly in step with them."
      }
    ],
    confirm: "Add"
  });
  if (!values) {
    return false;
  }
  return Boolean(await act("addPerson", values, `${values.name} added.`));
}

export const actions = {
  /** @param {Record<string, string>} d */
  open: (d) => go("people", { person: d.person }),
  back: () => go("people"),

  addPerson: async () => {
    if (await addPersonDialog()) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  edit: async (d) => {
    const p = await tend.invoke("person", { person: d.person });
    if (p.error) {
      return;
    }
    const values = await form({
      title: `Edit ${p.name}`,
      intro: "Changing the relationship changes which duties apply. Their history comes with them.",
      fields: [
        { name: "relation", label: "How you relate to them", type: "select", options: RELATION_OPTIONS, value: p.relation }
      ],
      confirm: "Save"
    });
    if (!values) {
      return;
    }
    if (await act("setRelation", { person: d.person, relation: values.relation }, "Updated.")) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  logContact: async (d) => {
    const values = await form({
      title: "Log contact",
      intro: "The kind decides which cadence this satisfies. A second-hand report does not count as having spoken to them.",
      fields: [
        { name: "kind", label: "What kind", type: "select", options: CONTACT_KINDS, value: "one-to-one" },
        { name: "note", label: "One line, optional", placeholder: "What it was about" },
        { name: "at", label: "When", type: "date", value: asDateInput(Date.now()), hint: "Backdate it if you are catching up." }
      ],
      confirm: "Log it"
    });
    if (!values) {
      return;
    }
    if (await act("logTouch", { subject: d.person, ...values }, "Logged.")) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  logPromise: async (d) => {
    const values = await form({
      title: "Something you promised",
      intro: "When you are not sure it counts, log it. A false one costs a click; a missed one costs trust with a real person.",
      fields: [
        { name: "text", label: "What you said you would do", required: true, type: "textarea", placeholder: "Check with Nina about the conference" },
        { name: "due", label: "By when, optional", type: "date" },
        { name: "madeAt", label: "When you said it", type: "date", value: asDateInput(Date.now()), hint: "Backdate it and it ages correctly. Anything open past two weeks escalates whatever else is going on." }
      ],
      confirm: "Log it"
    });
    if (!values) {
      return;
    }
    if (await act("logPromise", { person: d.person, ...values }, "Logged.")) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  logEvidence: async (d) => {
    const values = await form({
      title: "Record an observation",
      intro: "What they delivered, how they handled something. Written down now so a review is built on notes rather than on memory of the last three weeks.",
      fields: [
        { name: "text", label: "What happened", type: "textarea", required: true },
        { name: "area", label: "Tag, optional", placeholder: "code, ownership, communication" }
      ],
      confirm: "Record it"
    });
    if (!values) {
      return;
    }
    if (await act("logEvidence", { person: d.person, ...values }, "Recorded.")) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  resolvePromise: async (d) => {
    if (await act("resolvePromise", { id: d.id, as: "resolved" }, "Closed.")) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  remove: async (d) => {
    const sure = await ask({
      title: `Remove ${d.name}?`,
      body: "They stop appearing and their cadences stop counting. Nothing is destroyed - the history stays in the log and can be recovered - but the app will act as though they were never your responsibility.",
      confirm: "Remove",
      tone: "danger"
    });
    if (!sure) {
      return;
    }
    if (await act("removeRow", { collection: "people", id: d.person }, `${d.name} removed.`)) {
      go("people");
    }
  }
};
