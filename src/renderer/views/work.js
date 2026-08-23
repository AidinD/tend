/**
 * Work: projects, and the pieces of work inside them with a delegation level.
 *
 * The two are separate on purpose. A project is something to keep an eye on -
 * the useful question is which one has gone longest without a look. A
 * workstream is something with an owner and a stated level of hand-over, which
 * is the half the player-coach model leaves unsaid.
 */

import { act, ask, asDateInput, esc, form, LEVEL_OPTIONS, pill, tend } from "../ui.js";
import { refresh } from "../app.js";

export async function render() {
  const [projects, streams, roster] = await Promise.all([
    tend.invoke("projects"),
    tend.invoke("workstreams"),
    tend.invoke("people")
  ]);

  const header = `
    <div class="view-head">
      <div class="head-row">
        <div>
          <h1 class="view-title">Work</h1>
          <p class="view-sub">Projects to keep an eye on, and the pieces inside them you have handed over to some degree.</p>
        </div>
        <div class="button-row">
          <button class="act" data-act="addProject">Add project</button>
          <button class="act primary" data-act="addStream">Add workstream</button>
        </div>
      </div>
    </div>`;

  const projectRows = (projects ?? [])
    .map(
      (/** @type {any} */ p) => `<div class="row static">
        <span class="row-name">${esc(p.name)}</span>
        <span class="row-right">
          <span class="row-meta">last looked at ${esc(p.lastLookedAt)}</span>
          ${p.behindBy ? pill(p.urgency) : ""}
          <button class="act tiny" data-act="checkIn" data-id="${esc(p.id)}" data-name="${esc(p.name)}">Log a look</button>
          <button class="act tiny danger" data-act="removeProject" data-id="${esc(p.id)}" data-name="${esc(p.name)}">Remove</button>
        </span>
      </div>`
    )
    .join("");

  const streamCards = (streams ?? [])
    .map(
      (/** @type {any} */ w) => `<article class="card ${w.unspecified ? "sev-warn" : "sev-ok"}">
        <div class="card-top">
          <h2 class="card-title">${esc(w.name)}</h2>
          <span class="pill ${w.unspecified ? "warn" : "plain"}">${esc(w.unspecified ? "no level set" : w.reviewEvery)}</span>
        </div>
        <p class="card-why">${esc(w.levelMeans)}</p>
        <div class="card-foot">
          <span class="src">${esc(w.owner ?? "nobody named")}${w.project ? ` · ${esc(w.project)}` : ""} · reviewed ${esc(w.lastReviewed)}</span>
          <button class="act primary" data-act="setLevel" data-id="${esc(w.id)}">${w.unspecified ? "Set the level" : "Change level"}</button>
          <button class="act" data-act="review" data-id="${esc(w.id)}" data-name="${esc(w.name)}">Log a review</button>
          <button class="act danger" data-act="removeStream" data-id="${esc(w.id)}" data-name="${esc(w.name)}">Remove</button>
        </div>
      </article>`
    )
    .join("");

  const noPeople =
    Array.isArray(roster) && roster.length === 0
      ? `<div class="muted-row">Add people first if you want to name an owner on a workstream.</div>`
      : "";

  return `
    ${header}
    <div class="group">
      <div class="group-head"><span class="group-title">Projects</span><span class="group-rule"></span><span class="group-meta">${(projects ?? []).length}</span></div>
      ${projectRows ? `<div class="rows">${projectRows}</div>` : `<div class="empty">No projects yet. Add the ones you are accountable for without being in the daily work.</div>`}
    </div>
    <div class="group">
      <div class="group-head"><span class="group-title">Workstreams</span><span class="group-rule"></span><span class="group-meta">${(streams ?? []).length}</span></div>
      ${noPeople}
      ${streamCards ? `<div class="stack">${streamCards}</div>` : `<div class="empty">Nothing handed over yet. A workstream is a piece of work with an owner and a stated level of hand-over.</div>`}
    </div>
  `;
}

/**
 * Shared with the Now view, which offers this straight off an unset workstream.
 *
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function setLevelDialog(id) {
  const streams = await tend.invoke("workstreams");
  const current = (streams ?? []).find((/** @type {any} */ w) => w.id === id);

  const values = await form({
    title: current ? `How far have you stepped back on ${current.name}?` : "Set the delegation level",
    intro:
      "How closely you follow up depends on how experienced this person is at this particular task, not on how good they are in general. The level sets how often Tend expects a review - and the absence of a review is what separates delegating from abdicating.",
    fields: [
      { name: "level", label: "Level", type: "select", options: LEVEL_OPTIONS, value: current?.level ?? "close" }
    ],
    confirm: "Set it"
  });
  if (!values) {
    return false;
  }
  return Boolean(await act("setDelegationLevel", { id, level: values.level }, "Level set."));
}

export const actions = {
  addProject: async () => {
    const values = await form({
      title: "Add a project",
      fields: [
        { name: "name", label: "Name", required: true },
        {
          name: "since",
          label: "Since when",
          type: "date",
          value: asDateInput(Date.now()),
          hint: "When you took it on. Backdate it and a project you have been ignoring shows as ignored rather than as freshly checked."
        }
      ],
      confirm: "Add"
    });
    if (values && (await act("addProject", values, `${values.name} added.`))) {
      refresh();
    }
  },

  addStream: async () => {
    const [roster, projects] = await Promise.all([tend.invoke("people"), tend.invoke("projects")]);
    const values = await form({
      title: "Add a workstream",
      intro: "A piece of work with an owner. Leaving the level unset is itself flagged, because unstated delegation is the failure rather than missing data.",
      fields: [
        { name: "name", label: "What the work is", required: true, placeholder: "Tidepool rendering" },
        {
          name: "owner",
          label: "Who owns it",
          type: "select",
          options: [{ value: "", label: "Nobody yet" }].concat(
            (roster ?? []).map((/** @type {any} */ p) => ({ value: p.id, label: p.name }))
          )
        },
        {
          name: "project",
          label: "Part of which project",
          type: "select",
          options: [{ value: "", label: "None" }].concat(
            (projects ?? []).map((/** @type {any} */ p) => ({ value: p.id, label: p.name }))
          )
        },
        { name: "level", label: "How far you have stepped back", type: "select", options: LEVEL_OPTIONS, value: "close" }
      ],
      confirm: "Add"
    });
    if (values && (await act("addWorkstream", values, `${values.name} added.`))) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  setLevel: async (d) => {
    if (await setLevelDialog(d.id)) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  review: async (d) => {
    const values = await form({
      title: `Review of ${d.name}`,
      intro: "This is the monitoring half. Logging it resets the clock the level sets.",
      fields: [
        { name: "note", label: "What you found, optional", type: "textarea" },
        { name: "at", label: "When", type: "date", value: asDateInput(Date.now()) }
      ],
      confirm: "Log it"
    });
    if (!values) {
      return;
    }
    if (await act("logTouch", { subject: d.id, kind: "delegation-review", ...values }, "Logged.")) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  checkIn: async (d) => {
    const values = await form({
      title: `Check-in on ${d.name}`,
      fields: [
        { name: "note", label: "What you found, optional", type: "textarea" },
        { name: "at", label: "When", type: "date", value: asDateInput(Date.now()) }
      ],
      confirm: "Log it"
    });
    if (!values) {
      return;
    }
    if (await act("logTouch", { subject: d.id, kind: "check-in", ...values }, "Logged.")) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  removeProject: async (d) => {
    const sure = await ask({
      title: `Remove ${d.name}?`,
      body: "It stops being tracked. The history stays in the log.",
      confirm: "Remove",
      tone: "danger"
    });
    if (sure && (await act("removeRow", { collection: "projects", id: d.id }, "Removed."))) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  removeStream: async (d) => {
    const sure = await ask({
      title: `Remove ${d.name}?`,
      body: "It stops being tracked. The history stays in the log.",
      confirm: "Remove",
      tone: "danger"
    });
    if (sure && (await act("removeRow", { collection: "workstreams", id: d.id }, "Removed."))) {
      refresh();
    }
  }
};
