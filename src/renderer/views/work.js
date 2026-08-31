/**
 * Work: projects, and the pieces of work inside them with a delegation level.
 *
 * The two are separate on purpose. A project is something to keep an eye on -
 * the useful question is which one has gone longest without a look. A
 * workstream is something with an owner and a stated level of hand-over, which
 * is the half the player-coach model leaves unsaid.
 */

import {
  act,
  ask,
  asDateInput,
  DEFAULT_STAKE_DAYS,
  esc,
  form,
  LEVEL_OPTIONS,
  pill,
  readFailed,
  readFailedHtml,
  tend
} from "../ui.js";
import { go, refresh } from "../app.js";

/** @param {Record<string, any>} [params] */
export async function render(params = {}) {
  if (params.project) {
    return projectPage(String(params.project));
  }
  return workLists();
}

async function workLists() {
  const [projects, streams, roster, stakes, archivedProjects, archivedStreams] = await Promise.all([
    tend.invoke("projects"),
    tend.invoke("workstreams"),
    tend.invoke("people"),
    tend.invoke("stakeholders"),
    tend.invoke("archivedProjects"),
    tend.invoke("archivedWorkstreams")
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
          <button class="act" data-act="addStake">Add stakeholder</button>
          <button class="act primary" data-act="addStream">Add workstream</button>
        </div>
      </div>
    </div>`;

  // `(projects ?? [])` does not survive a failed read: `{ error }` is truthy, so
  // the nullish default never applies and `.map` is undefined - the view threw
  // rather than saying anything. Checked before either list is touched.
  for (const [what, result] of [
    ["the projects", projects],
    ["the workstreams", streams]
  ]) {
    if (readFailed(result)) {
      return `${header}${readFailedHtml(String(what), result)}`;
    }
  }

  const projectRows = (projects ?? [])
    .map(
      (/** @type {any} */ p) => `<div class="row static">
        <span class="row-name">${esc(p.name)}</span>
        <span class="row-right">
          <span class="row-meta">last looked at ${esc(p.lastLookedAt)}</span>
          ${p.behindBy ? pill(p.urgency) : ""}
          <!--
            A View button rather than a clickable row. The roster makes a whole
            row a button where the row carries nothing else, and uses exactly
            this button where it does - and this row carries three controls, one
            of which removes the project. A click target wrapped around Remove is
            a mis-press waiting to happen.
          -->
          <button class="act tiny" data-act="openProject" data-id="${esc(p.id)}">View</button>
          <button class="act tiny" data-act="checkIn" data-id="${esc(p.id)}" data-name="${esc(p.name)}">Log a look</button>
          <button class="act tiny" data-act="archiveProject" data-id="${esc(p.id)}" data-name="${esc(p.name)}">Archive</button>
          <button class="act tiny danger" data-act="removeProject" data-id="${esc(p.id)}" data-name="${esc(p.name)}">Remove</button>
        </span>
      </div>`
    )
    .join("");

  const stakeRows = (Array.isArray(stakes) ? stakes : [])
    .map(
      (/** @type {any} */ k) => `<div class="row static">
        <span class="row-name">
          ${esc(k.label)}
          ${k.note ? `<span class="src">last time: ${esc(k.note)}</span>` : ""}
        </span>
        <span class="row-right">
          <span class="row-meta">every ${esc(k.every)} &middot; last ${esc(k.lastUpdated)}</span>
          <button class="act tiny" data-act="logUpdate" data-id="${esc(k.id)}" data-name="${esc(k.label)}">Log an update</button>
          <button class="act tiny" data-act="editStake" data-id="${esc(k.id)}" data-name="${esc(k.label)}">Edit</button>
          <button class="act tiny danger" data-act="removeStake" data-id="${esc(k.id)}" data-name="${esc(k.label)}">Remove</button>
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
          <button class="act" data-act="archiveStream" data-id="${esc(w.id)}" data-name="${esc(w.name)}">Archive</button>
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
      ${projectRows ? `<div class="rows">${projectRows}</div>` : `<div class="empty">${emptyOrArchived(archivedProjects, "No projects active. Every project here is archived - open the group below to bring one back.", "No projects yet. Add the ones you are accountable for without being in the daily work.")}</div>`}
    </div>
    <div class="group" data-group="stakeholders">
      <div class="group-head"><span class="group-title">Waiting to hear from you</span><span class="group-rule"></span><span class="group-meta">${(stakes ?? []).length}</span></div>
      ${stakeRows ? `<div class="rows">${stakeRows}</div>` : `<div class="empty">Nobody is down as waiting for a report. A stakeholder is someone who depends on what you deliver without being your report or your peer - the one direction where silence stays invisible until something slips.</div>`}
      <p class="group-note">
        The clock is per person AND project. An update about one project does not
        answer for another, which is the whole reason this is not a field on a
        person: a quarter of silence about the thing somebody depends on should
        not sit behind a fortnight of talk about something else.
      </p>
    </div>
    <div class="group">
      <div class="group-head"><span class="group-title">Workstreams</span><span class="group-rule"></span><span class="group-meta">${(streams ?? []).length}</span></div>
      ${noPeople}
      ${streamCards ? `<div class="stack">${streamCards}</div>` : `<div class="empty">${emptyOrArchived(archivedStreams, "No workstreams active. Every one here is archived - open the group below to bring one back.", "Nothing handed over yet. A workstream is a piece of work with an owner and a stated level of hand-over.")}</div>`}
    </div>
    ${archivedGroupHtml("Archived projects", archivedProjects, "unarchiveProject")}
    ${archivedGroupHtml("Archived workstreams", archivedStreams, "unarchiveStream")}
  `;
}

/**
 * "Nothing yet" and "everything is archived" are different facts, and after the
 * bulk archive the second is the common one. A first-run instruction shown to
 * somebody who has just archived a whole list reads as though the record is
 * gone.
 *
 * @param {any[] | {error: string}} archived
 * @param {string} whenArchived
 * @param {string} whenNew
 */
function emptyOrArchived(archived, whenArchived, whenNew) {
  return Array.isArray(archived) && archived.length > 0 ? whenArchived : whenNew;
}

/**
 * The "show archived" path for projects and workstreams: closed by default,
 * at the bottom of the view, well below the lists that answer "what is
 * active" - same reasoning as `archivedGroupHtml` in `people.js`, and kept
 * as its own copy rather than a shared import because the two files agree
 * on the shape (a name and a date) but not on the id field's meaning, and a
 * shared helper would have to take the unarchive action name as a parameter
 * either way.
 *
 * Neither projects nor workstreams have a detail page to click through to
 * (confirmed: this view only ever renders them as rows/cards), so there is
 * no "View" button here, unlike the archived-people group - Unarchive is
 * the only thing to do with a row here until it is active again.
 *
 * @param {string} title
 * @param {any[] | {error: string}} archived
 * @param {string} unarchiveAct
 */
function archivedGroupHtml(title, archived, unarchiveAct) {
  // Same reason as the archived-people group: a failed read must not report an
  // absence it never established.
  if (readFailed(archived)) {
    return readFailedHtml(title.toLowerCase(), archived);
  }
  const rows = Array.isArray(archived) ? archived : [];
  if (rows.length === 0) {
    return "";
  }
  const items = rows
    .map(
      (/** @type {any} */ r) => `<div class="row static">
        <span class="row-name">${esc(r.name)}</span>
        <span class="row-right">
          <span class="pill plain">archived ${esc(new Date(Number(r.archivedAt)).toISOString().slice(0, 10))}</span>
          <button class="act tiny" data-act="${esc(unarchiveAct)}" data-id="${esc(r.id)}" data-name="${esc(r.name)}">Unarchive</button>
        </span>
      </div>`
    )
    .join("");
  return `<details class="group archived-group">
    <summary class="group-head archived-summary">
      <span class="group-title">${esc(title)}</span><span class="group-rule"></span><span class="group-meta">${rows.length}</span>
    </summary>
    <div class="rows">${items}</div>
  </details>`;
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

/**
 * One project, and what has actually happened on it.
 *
 * ## Why the check-ins are the point
 *
 * The list above says how long since a project was last looked at, which answers
 * "which one is drifting" and nothing else. What was said at those looks was in
 * the log and reachable from nowhere: reading the three check-ins on one project
 * meant grepping the event files by its id.
 *
 * ## Built as a panel, like a person's page
 *
 * Not a drawer. A drawer would be a second disclosure pattern for the same job,
 * and somebody who has used the person page already knows how to read a panel
 * with a back link at the top. The blocks are in the same order for the same
 * reason: cadences, then the history, then what hangs off it.
 *
 * @param {string} id
 */
async function projectPage(id) {
  const p = await tend.invoke("project", { project: id });

  if (readFailed(p)) {
    return `<div class="view-head"><button class="act" data-act="backToWork">← Work</button></div>
      ${readFailedHtml("that project", p)}`;
  }

  const list = (/** @type {string} */ title, /** @type {string} */ body, /** @type {string} */ empty) =>
    `<div class="block"><div class="block-title">${esc(title)}</div>${
      body || `<div class="empty">${esc(empty)}</div>`
    }</div>`;

  const cadences = (p.cadences ?? [])
    .map(
      (/** @type {any} */ c) => `<div class="line">
        <span class="line-when">${esc(c.behindBy)}</span>
        <span class="line-text"><strong>${esc(c.duty)}</strong> - target ${esc(c.target)}, last ${esc(c.lastHappened)}</span>
        <span class="line-right">${pill(c.urgency)}</span>
      </div>`
    )
    .join("");

  /*
   * The same row as a person's contact history, including the undo and the
   * marker saying a row came from a note. Both belong here rather than only on
   * the person page: this is the page where somebody reads a project's history,
   * so it is where they notice a check-in logged against the wrong thing.
   */
  const history = (p.recentContact ?? [])
    .map(
      (/** @type {any} */ t) => `<div class="line">
        <span class="line-when">${esc(t.when)}</span>
        <span class="line-text"><strong>${esc(t.kind)}</strong>${t.note ? ` - ${esc(t.note)}` : ""}</span>
        <span class="line-right">
          ${t.from === "nib" ? `<span class="pill plain">from a note</span>` : ""}
          <button class="act tiny danger" data-act="unlogProjectContact" data-id="${esc(t.id)}"
            data-what="${esc(t.kind)}${t.note ? ` - ${esc(t.note)}` : ""}">Not right</button>
        </span>
      </div>`
    )
    .join("");

  const streams = (p.workstreams ?? [])
    .map(
      (/** @type {any} */ w) => `<div class="line">
        <span class="line-when">${esc(w.level ?? "-")}</span>
        <span class="line-text"><strong>${esc(w.name)}</strong>${
          w.owner ? ` - ${esc(w.owner)}` : " - nobody owns it"
        }</span>
        ${w.unspecified ? `<span class="line-right">${pill("watch")}</span>` : ""}
      </div>`
    )
    .join("");

  const interested = (p.stakeholders ?? [])
    .map(
      (/** @type {any} */ s) => `<div class="line">
        <span class="line-text"><strong>${esc(s.person)}</strong>${s.label ? ` - ${esc(s.label)}` : ""}</span>
      </div>`
    )
    .join("");

  return `
    <div class="view-head"><button class="act" data-act="backToWork">← Work</button></div>
    <div class="panel">
      <div class="panel-head">
        <div>
          <h2 class="panel-name">${esc(p.name)}</h2>
          <p class="panel-role">${
            p.archivedAt
              ? "Archived. Its history is here; it is out of every forward-looking view."
              : "What has been looked at, and what is inside it."
          }</p>
        </div>
        <div class="panel-actions">
          <button class="act primary" data-act="checkIn" data-id="${esc(p.id)}" data-name="${esc(p.name)}">Log a look</button>
        </div>
      </div>

      ${list("Cadences", cadences, "No cadence over this project, so nothing here can be late.")}
      ${list(
        "Check-ins",
        history,
        "Nothing logged against it yet. A look recorded here is what stops the clock."
      )}
      ${list("Workstreams inside it", streams, "None. A project with no workstreams has nothing handed over.")}
      ${list("Waiting to hear about it", interested, "Nobody is on the hook for an update about this.")}
    </div>`;
}

export const actions = {
  /** The retry offered when a read failed rather than came back empty. */
  reload: () => {
    refresh();
  },

  /** @param {Record<string, string>} d */
  openProject: (d) => go("work", { project: d.id }),
  backToWork: () => go("work"),

  /**
   * Take back a check-in from the project's own page.
   *
   * Same guarantee as a mislogged contact on a person: a check-in against the
   * wrong project moves that project's clock and then looks identical to a real
   * one. Confirmed first, because it is a delete and the note is the only copy
   * of what was said.
   *
   * @param {Record<string, string>} d
   */
  unlogProjectContact: async (d) => {
    const sure = await ask({
      title: "Take this back?",
      body: `"${d.what}" stops counting, so the clock it moved goes back to where it was. The event stays in the log - nothing here is ever really deleted - it just stops being evidence.`,
      confirm: "Take it back",
      tone: "danger"
    });
    // `act` rather than a bare invoke, so a rejected write cannot look like a
    // successful one. Every write in the app goes through it.
    if (sure && (await act("removeRow", { collection: "touches", id: d.id }, "Taken back."))) {
      refresh();
    }
  },

  /**
   * Add somebody as waiting to hear about a project.
   *
   * Two steps rather than one long form: who and what first, then how often.
   * The interval is the only field with a real default, and asking for it in
   * the same breath as the names invites accepting whatever is prefilled.
   */
  addStake: async () => {
    const [roster, projects] = await Promise.all([tend.invoke("people"), tend.invoke("projects")]);
    if (!Array.isArray(roster) || roster.length === 0) {
      await ask({
        title: "Nobody on the roster yet",
        body: "A stakeholder is a person first. Add them under People, then come back - the relationship type to give them is Stakeholder, which inherits none of the duties written for people you lead.",
        confirm: "Right"
      });
      return;
    }
    if (!Array.isArray(projects) || projects.length === 0) {
      await ask({
        title: "No projects yet",
        body: "A stakeholder waits to hear about something specific, so the project has to exist first.",
        confirm: "Right"
      });
      return;
    }

    const values = await form({
      title: "Who is waiting to hear from you?",
      intro:
        "Somebody who depends on what you deliver without being your report or your peer. The obligation is per person AND project: telling them about one thing does not answer for another.",
      fields: [
        {
          name: "person",
          label: "Who",
          type: "select",
          options: roster.map((/** @type {any} */ r) => ({ value: r.id, label: r.name }))
        },
        {
          name: "project",
          label: "About what",
          type: "select",
          options: projects.map((/** @type {any} */ r) => ({ value: r.id, label: r.name }))
        },
        {
          name: "cadenceDays",
          label: "How often, in days",
          type: "number",
          value: String(DEFAULT_STAKE_DAYS),
          hint: "A month is one reporting cycle. Shorter for someone close to the work, longer for a distant sponsor."
        },
        {
          name: "what",
          label: "What they actually want to know, optional",
          placeholder: "Whether the migration lands before the quarter closes"
        },
        {
          name: "since",
          label: "Waiting since",
          type: "date",
          value: asDateInput(Date.now()),
          hint: "Backdate it if they have been in the dark for a while - otherwise the first month of the record flatters you."
        }
      ],
      confirm: "Add"
    });
    if (!values) {
      return;
    }
    if (
      await act(
        "addStake",
        {
          person: values.person,
          project: values.project,
          cadenceDays: Number(values.cadenceDays),
          what: values.what,
          since: values.since
        },
        "Added."
      )
    ) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  editStake: async (d) => {
    const stakes = await tend.invoke("stakeholders");
    const current = (Array.isArray(stakes) ? stakes : []).find((/** @type {any} */ k) => k.id === d.id);
    const values = await form({
      title: `How often should ${d.name.split(",")[0]} hear from you?`,
      fields: [
        {
          name: "cadenceDays",
          label: "How often, in days",
          type: "number",
          value: String(parseInt(String(current?.every ?? DEFAULT_STAKE_DAYS), 10) || DEFAULT_STAKE_DAYS)
        },
        { name: "what", label: "What they want to know, optional", value: current?.note ?? "" }
      ],
      confirm: "Save"
    });
    if (!values) {
      return;
    }
    if (
      await act(
        "updateStake",
        { id: d.id, cadenceDays: Number(values.cadenceDays), what: values.what },
        "Saved."
      )
    ) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  logUpdate: async (d) => {
    const values = await form({
      title: `What did you tell them about ${d.name.split("about ")[1] ?? "it"}?`,
      intro: "One line is enough. The point of the record is the date, not the report.",
      fields: [
        { name: "note", label: "What you said, optional", type: "textarea" },
        { name: "at", label: "When", type: "date", value: asDateInput(Date.now()) }
      ],
      confirm: "Log it"
    });
    if (!values) {
      return;
    }
    if (await act("logTouch", { subject: d.id, kind: "update", ...values }, "Logged.")) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  removeStake: async (d) => {
    const sure = await ask({
      title: `Remove ${d.name}?`,
      body: "They stop appearing as waiting for a report about this project. The updates you already logged stay on record, and being a stakeholder in anything else is untouched.",
      confirm: "Remove",
      tone: "danger"
    });
    if (sure && (await act("removeRow", { collection: "stakes", id: d.id }, "Removed."))) {
      refresh();
    }
  },

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
        { name: "name", label: "What the work is", required: true, placeholder: "Renderer rewrite" },
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

  /**
   * Reversible, unlike `removeProject` below - so it gets its own, gentler
   * dialog rather than reusing the danger-zone one. There is no per-project
   * detail page to hold an "archived" banner or an Unarchive button, so
   * both live in the archived group at the bottom of this view once one
   * exists.
   *
   * @param {Record<string, string>} d
   */
  archiveProject: async (d) => {
    const sure = await ask({
      title: `Archive ${d.name}?`,
      body: "It stops appearing in this list, in Now and in attention nudges. Every check-in, stake and review already logged against it stays exactly as it is and can be looked at again. Fully reversible from the archived list.",
      confirm: "Archive",
      tone: "danger"
    });
    if (sure && (await act("archiveProject", { id: d.id }, `${d.name} archived.`))) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  unarchiveProject: async (d) => {
    if (await act("unarchiveProject", { id: d.id }, `${d.name} unarchived.`)) {
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

  /**
   * Reversible, unlike `removeStream` below - see `archiveProject`'s
   * comment above, same reasoning applies here.
   *
   * @param {Record<string, string>} d
   */
  archiveStream: async (d) => {
    const sure = await ask({
      title: `Archive ${d.name}?`,
      body: "It stops appearing in this list, in Now and in attention nudges. Every review already logged against it stays exactly as it is and can be looked at again. Fully reversible from the archived list.",
      confirm: "Archive",
      tone: "danger"
    });
    if (sure && (await act("archiveWorkstream", { id: d.id }, `${d.name} archived.`))) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  unarchiveStream: async (d) => {
    if (await act("unarchiveWorkstream", { id: d.id }, `${d.name} unarchived.`)) {
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
