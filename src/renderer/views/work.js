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
import { T } from "../text.js";

const words = T.work;

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
          <h1 class="view-title">${words.title}</h1>
          <p class="view-sub">${words.sub}</p>
        </div>
        <div class="button-row">
          <button class="act" data-act="addProject">${words.addProject}</button>
          <button class="act" data-act="addStake">${words.addStake}</button>
          <button class="act primary" data-act="addStream">${words.addStream}</button>
        </div>
      </div>
    </div>`;

  // `(projects ?? [])` does not survive a failed read: `{ error }` is truthy, so
  // the nullish default never applies and `.map` is undefined - the view threw
  // rather than saying anything. Checked before either list is touched.
  for (const [what, result] of [
    [words.readFailedProjects, projects],
    [words.readFailedStreams, streams]
  ]) {
    if (readFailed(result)) {
      return `${header}${readFailedHtml(String(what), result)}`;
    }
  }

  const projectRows = (projects ?? [])
    .map(
      /*
         A project that has fallen behind carries it on the row, the same way
         the roster does. The pill on the right already said so; a page is
         scanned before it is read, and the two views may not disagree about
         what "behind" looks like.
      */
      (/** @type {any} */ p) => `<div class="row static${p.behindBy ? ` sev-${esc(p.urgency)}` : ""}">
        <span class="row-name">${esc(p.name)}</span>
        <span class="row-right">
          <span class="row-meta">${words.lastLookedAt(esc(p.lastLookedAt))}</span>
          ${p.behindBy ? pill(p.urgency) : ""}
          <!--
            A View button rather than a clickable row. The roster makes a whole
            row a button where the row carries nothing else, and uses exactly
            this button where it does - and this row carries three controls, one
            of which removes the project. A click target wrapped around Remove is
            a mis-press waiting to happen.
          -->
          <button class="act tiny" data-act="openProject" data-id="${esc(p.id)}">${words.view}</button>
          <button class="act tiny" data-act="checkIn" data-id="${esc(p.id)}" data-name="${esc(p.name)}">${words.logLook}</button>
          <button class="act tiny" data-act="archiveProject" data-id="${esc(p.id)}" data-name="${esc(p.name)}">${words.archive}</button>
          <button class="act tiny danger" data-act="removeProject" data-id="${esc(p.id)}" data-name="${esc(p.name)}">${words.remove}</button>
        </span>
      </div>`
    )
    .join("");

  const stakeRows = (Array.isArray(stakes) ? stakes : [])
    .map(
      (/** @type {any} */ k) => `<div class="row static">
        <span class="row-name">
          ${esc(k.label)}
          ${k.note ? `<span class="src">${words.lastTime(esc(k.note))}</span>` : ""}
        </span>
        <span class="row-right">
          <span class="row-meta">${words.stakeMeta(esc(k.every), esc(k.lastUpdated))}</span>
          <button class="act tiny" data-act="logUpdate" data-id="${esc(k.id)}" data-name="${esc(k.label)}">${words.logUpdate}</button>
          <button class="act tiny" data-act="editStake" data-id="${esc(k.id)}" data-name="${esc(k.label)}">${words.edit}</button>
          <button class="act tiny danger" data-act="removeStake" data-id="${esc(k.id)}" data-name="${esc(k.label)}">${words.remove}</button>
        </span>
      </div>`
    )
    .join("");

  const streamCards = (streams ?? [])
    .map(
      (/** @type {any} */ w) => `<article class="card ${w.unspecified ? "sev-warn" : "sev-ok"}">
        <div class="card-top">
          <h2 class="card-title">${esc(w.name)}</h2>
          <span class="pill ${w.unspecified ? "warn" : "plain"}">${esc(w.unspecified ? words.noLevelSet : w.reviewEvery)}</span>
        </div>
        <p class="card-why">${esc(w.levelMeans)}</p>
        <div class="card-foot">
          <span class="src">${words.streamMeta(esc(w.owner ?? words.nobodyNamed), w.project ? words.streamProject(esc(w.project)) : "", esc(w.lastReviewed))}</span>
          <button class="act primary" data-act="setLevel" data-id="${esc(w.id)}">${w.unspecified ? words.setLevelButton : words.changeLevelButton}</button>
          <button class="act" data-act="review" data-id="${esc(w.id)}" data-name="${esc(w.name)}">${words.logReview}</button>
          <button class="act" data-act="archiveStream" data-id="${esc(w.id)}" data-name="${esc(w.name)}">${words.archive}</button>
          <button class="act danger" data-act="removeStream" data-id="${esc(w.id)}" data-name="${esc(w.name)}">${words.remove}</button>
        </div>
      </article>`
    )
    .join("");

  const noPeople =
    Array.isArray(roster) && roster.length === 0
      ? `<div class="muted-row">${words.noPeopleYet}</div>`
      : "";

  return `
    ${header}
    <div class="group">
      <div class="group-head"><span class="group-title">${words.projectsGroup}</span><span class="group-rule"></span><span class="group-meta">${(projects ?? []).length}</span></div>
      ${projectRows ? `<div class="rows">${projectRows}</div>` : `<div class="empty">${emptyOrArchived(archivedProjects, words.projectsAllArchived, words.projectsNone)}</div>`}
    </div>
    <div class="group" data-group="stakeholders">
      <div class="group-head"><span class="group-title">${words.stakesGroup}</span><span class="group-rule"></span><span class="group-meta">${(stakes ?? []).length}</span></div>
      ${stakeRows ? `<div class="rows">${stakeRows}</div>` : `<div class="empty">${words.stakesNone}</div>`}
      <p class="group-note">${words.stakesNote}</p>
    </div>
    <div class="group">
      <div class="group-head"><span class="group-title">${words.streamsGroup}</span><span class="group-rule"></span><span class="group-meta">${(streams ?? []).length}</span></div>
      ${noPeople}
      ${streamCards ? `<div class="stack">${streamCards}</div>` : `<div class="empty">${emptyOrArchived(archivedStreams, words.streamsAllArchived, words.streamsNone)}</div>`}
    </div>
    ${archivedGroupHtml(words.archivedProjectsGroup, archivedProjects, "unarchiveProject")}
    ${archivedGroupHtml(words.archivedStreamsGroup, archivedStreams, "unarchiveStream")}
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
          <span class="pill plain">${words.archivedOn(esc(new Date(Number(r.archivedAt)).toISOString().slice(0, 10)))}</span>
          <button class="act tiny" data-act="${esc(unarchiveAct)}" data-id="${esc(r.id)}" data-name="${esc(r.name)}">${words.unarchive}</button>
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
    title: current ? words.levelTitle(current.name) : words.levelTitleBare,
    intro: words.levelIntro,
    fields: [
      { name: "level", label: words.levelLabel, type: "select", options: LEVEL_OPTIONS, value: current?.level ?? "close" }
    ],
    confirm: words.levelConfirm
  });
  if (!values) {
    return false;
  }
  return Boolean(await act("setDelegationLevel", { id, level: values.level }, words.levelSetToast));
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
    return `<div class="view-head"><button class="act" data-act="backToWork">${words.backToWork}</button></div>
      ${readFailedHtml(words.readFailedProject, p)}`;
  }

  const list = (/** @type {string} */ title, /** @type {string} */ body, /** @type {string} */ empty) =>
    `<div class="block"><div class="block-title">${esc(title)}</div>${
      body || `<div class="empty">${esc(empty)}</div>`
    }</div>`;

  const cadences = (p.cadences ?? [])
    .map(
      (/** @type {any} */ c) => `<div class="line">
        <span class="line-when">${esc(c.behindBy)}</span>
        <span class="line-text">${words.cadenceLine(esc(c.duty), esc(c.target), esc(c.lastHappened))}</span>
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
      (/** @type {any} */ row) => `<div class="line">
        <span class="line-when">${esc(row.when)}</span>
        <span class="line-text"><strong>${esc(row.kind)}</strong>${row.note ? ` - ${esc(row.note)}` : ""}</span>
        <span class="line-right">
          ${row.from === "nib" ? `<span class="pill plain">${words.fromANote}</span>` : ""}
          <button class="act tiny danger" data-act="unlogProjectContact" data-id="${esc(row.id)}"
            data-what="${esc(row.kind)}${row.note ? ` - ${esc(row.note)}` : ""}">${words.notRight}</button>
        </span>
      </div>`
    )
    .join("");

  const streams = (p.workstreams ?? [])
    .map(
      (/** @type {any} */ w) => `<div class="line">
        <span class="line-when">${esc(w.level ?? "-")}</span>
        <span class="line-text"><strong>${esc(w.name)}</strong>${
          w.owner ? words.streamOwner(esc(w.owner)) : words.streamNoOwner
        }</span>
        ${w.unspecified ? `<span class="line-right">${pill("watch")}</span>` : ""}
      </div>`
    )
    .join("");

  const interested = (p.stakeholders ?? [])
    .map(
      (/** @type {any} */ s) => `<div class="line">
        <span class="line-text"><strong>${esc(s.person)}</strong>${s.label ? words.interestedLabel(esc(s.label)) : ""}</span>
      </div>`
    )
    .join("");

  return `
    <div class="view-head"><button class="act" data-act="backToWork">${words.backToWork}</button></div>
    <div class="panel">
      <div class="panel-head">
        <div>
          <h2 class="panel-name">${esc(p.name)}</h2>
          <p class="panel-role">${p.archivedAt ? words.projectArchivedRole : words.projectRole}</p>
        </div>
        <div class="panel-actions">
          <button class="act primary" data-act="checkIn" data-id="${esc(p.id)}" data-name="${esc(p.name)}">${words.logLook}</button>
        </div>
      </div>

      ${list(words.cadencesBlock, cadences, words.cadencesNone)}
      ${list(words.checkInsBlock, history, words.checkInsNone)}
      ${list(words.streamsInBlock, streams, words.streamsInNone)}
      ${list(words.interestedBlock, interested, words.interestedNone)}
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
      title: words.unlogTitle,
      body: words.unlogBody(d.what),
      confirm: words.unlogConfirm,
      tone: "danger"
    });
    // `act` rather than a bare invoke, so a rejected write cannot look like a
    // successful one. Every write in the app goes through it.
    if (sure && (await act("removeRow", { collection: "touches", id: d.id }, words.unlogToast))) {
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
        title: words.noRosterTitle,
        body: words.noRosterBody,
        confirm: words.understood
      });
      return;
    }
    if (!Array.isArray(projects) || projects.length === 0) {
      await ask({
        title: words.noProjectsTitle,
        body: words.noProjectsBody,
        confirm: words.understood
      });
      return;
    }

    const values = await form({
      title: words.stakeTitle,
      intro: words.stakeIntro,
      fields: [
        {
          name: "person",
          label: words.stakeWho,
          type: "select",
          options: roster.map((/** @type {any} */ r) => ({ value: r.id, label: r.name }))
        },
        {
          name: "project",
          label: words.stakeAbout,
          type: "select",
          options: projects.map((/** @type {any} */ r) => ({ value: r.id, label: r.name }))
        },
        {
          name: "cadenceDays",
          label: words.stakeCadence,
          type: "number",
          value: String(DEFAULT_STAKE_DAYS),
          hint: words.stakeCadenceHint
        },
        {
          name: "what",
          label: words.stakeWhat,
          placeholder: words.stakeWhatPlaceholder
        },
        {
          name: "since",
          label: words.stakeSince,
          type: "date",
          value: asDateInput(Date.now()),
          hint: words.stakeSinceHint
        }
      ],
      confirm: words.add
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
        words.addedToast
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
      title: words.editStakeTitle(d.name.split(",")[0]),
      fields: [
        {
          name: "cadenceDays",
          label: words.stakeCadence,
          type: "number",
          value: String(parseInt(String(current?.every ?? DEFAULT_STAKE_DAYS), 10) || DEFAULT_STAKE_DAYS)
        },
        { name: "what", label: words.editStakeWhat, value: current?.note ?? "" }
      ],
      confirm: words.save
    });
    if (!values) {
      return;
    }
    if (
      await act(
        "updateStake",
        { id: d.id, cadenceDays: Number(values.cadenceDays), what: values.what },
        words.savedToast
      )
    ) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  logUpdate: async (d) => {
    const values = await form({
      title: words.logUpdateTitle(d.name.split("about ")[1] ?? words.logUpdateFallback),
      intro: words.logUpdateIntro,
      fields: [
        { name: "note", label: words.logUpdateNote, type: "textarea" },
        { name: "at", label: words.when, type: "date", value: asDateInput(Date.now()) }
      ],
      confirm: words.logIt
    });
    if (!values) {
      return;
    }
    if (await act("logTouch", { subject: d.id, kind: "update", ...values }, words.loggedToast)) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  removeStake: async (d) => {
    const sure = await ask({
      title: words.removeStakeTitle(d.name),
      body: words.removeStakeBody,
      confirm: "Remove",
      tone: "danger"
    });
    if (sure && (await act("removeRow", { collection: "stakes", id: d.id }, words.removedToast))) {
      refresh();
    }
  },

  addProject: async () => {
    const values = await form({
      title: words.addProjectTitle,
      fields: [
        { name: "name", label: words.projectName, required: true },
        {
          name: "since",
          label: words.projectSince,
          type: "date",
          value: asDateInput(Date.now()),
          hint: words.projectSinceHint
        }
      ],
      confirm: "Add"
    });
    if (values && (await act("addProject", values, words.addedNamed(values.name)))) {
      refresh();
    }
  },

  addStream: async () => {
    const [roster, projects] = await Promise.all([tend.invoke("people"), tend.invoke("projects")]);
    const values = await form({
      title: words.addStreamTitle,
      intro: words.addStreamIntro,
      fields: [
        { name: "name", label: words.streamName, required: true, placeholder: words.streamNamePlaceholder },
        {
          name: "owner",
          label: words.streamOwnerLabel,
          type: "select",
          options: [{ value: "", label: words.streamNobodyYet }].concat(
            (roster ?? []).map((/** @type {any} */ p) => ({ value: p.id, label: p.name }))
          )
        },
        {
          name: "project",
          label: words.streamProjectLabel,
          type: "select",
          options: [{ value: "", label: words.streamNoProject }].concat(
            (projects ?? []).map((/** @type {any} */ p) => ({ value: p.id, label: p.name }))
          )
        },
        { name: "level", label: words.streamLevelLabel, type: "select", options: LEVEL_OPTIONS, value: "close" }
      ],
      confirm: "Add"
    });
    if (values && (await act("addWorkstream", values, words.addedNamed(values.name)))) {
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
      title: words.reviewTitle(d.name),
      intro: words.reviewIntro,
      fields: [
        { name: "note", label: words.foundNote, type: "textarea" },
        { name: "at", label: words.when, type: "date", value: asDateInput(Date.now()) }
      ],
      confirm: words.logIt
    });
    if (!values) {
      return;
    }
    if (await act("logTouch", { subject: d.id, kind: "delegation-review", ...values }, words.loggedToast)) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  checkIn: async (d) => {
    const values = await form({
      title: words.checkInTitle(d.name),
      fields: [
        { name: "note", label: words.foundNote, type: "textarea" },
        { name: "at", label: words.when, type: "date", value: asDateInput(Date.now()) }
      ],
      confirm: words.logIt
    });
    if (!values) {
      return;
    }
    if (await act("logTouch", { subject: d.id, kind: "check-in", ...values }, words.loggedToast)) {
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
      title: words.archiveProjectTitle(d.name),
      body: words.archiveProjectBody,
      confirm: words.archive,
      tone: "danger"
    });
    if (sure && (await act("archiveProject", { id: d.id }, words.archivedToast(d.name)))) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  unarchiveProject: async (d) => {
    if (await act("unarchiveProject", { id: d.id }, words.unarchivedToast(d.name))) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  removeProject: async (d) => {
    const sure = await ask({
      title: words.removeProjectTitle(d.name),
      body: words.removeBody,
      confirm: words.remove,
      tone: "danger"
    });
    if (sure && (await act("removeRow", { collection: "projects", id: d.id }, words.removedToast))) {
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
      title: words.archiveStreamTitle(d.name),
      body: words.archiveStreamBody,
      confirm: words.archive,
      tone: "danger"
    });
    if (sure && (await act("archiveWorkstream", { id: d.id }, words.archivedToast(d.name)))) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  unarchiveStream: async (d) => {
    if (await act("unarchiveWorkstream", { id: d.id }, words.unarchivedToast(d.name))) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  removeStream: async (d) => {
    const sure = await ask({
      title: words.removeStreamTitle(d.name),
      body: words.removeBody,
      confirm: words.remove,
      tone: "danger"
    });
    if (sure && (await act("removeRow", { collection: "workstreams", id: d.id }, words.removedToast))) {
      refresh();
    }
  }
};
