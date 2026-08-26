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
  kindsFor,
  esc,
  form,
  pill,
  RELATION_OPTIONS,
  RELATIONS,
  tend
} from "../ui.js";
import { go, refresh } from "../app.js";
import { isRunning, modelActions, modelStatus, resultFor, run, themesHtml } from "../model.js";
import { actions as growthActions, threadsBlock } from "./growth.js";

/**
 * The roster's groups, one per relationship type, in the order the domain
 * declares them.
 *
 * Derived, because the hand-written version of this list was the fourth copy of
 * the same thing and it hid people: it had no row for `stakeholder`, so somebody
 * added with that relationship simply did not appear on the roster at all. No
 * error, no empty group, no trace - the person was in the store and off the
 * page.
 */
const GROUPS = RELATION_OPTIONS.map((r) => [r.value, RELATIONS[r.value].label]);

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
            ${p.availability ? `<span class="pill plain">${esc(p.availability)}</span>` : ""}
            ${
              p.worstDrift
                ? `<span class="row-meta">${esc(p.worstDrift.duty)}</span>${pill(p.worstDrift.urgency)}<span class="pill plain">${esc(p.worstDrift.behindBy)}</span>`
                : `<span class="row-meta">${p.availability === "away" ? "nothing expected while they are away" : p.availability === "left" ? "history kept, nothing expected" : "no duty applies"}</span>`
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

  // Each line can be taken back. A contact logged against the wrong person, or
  // as the wrong kind, is worse than no log at all: it moves a clock and then
  // looks identical to a real one. There was no way to undo it.
  const contact = p.recentContact
    .map(
      (/** @type {any} */ t) => `<div class="line">
        <span class="line-when">${esc(t.when)}</span>
        <span class="line-text"><strong>${esc(t.kind)}</strong>${t.note ? ` - ${esc(t.note)}` : ""}</span>
        <button class="act tiny danger" data-act="unlogContact" data-id="${esc(t.id)}"
          data-what="${esc(t.kind)}${t.note ? ` - ${esc(t.note)}` : ""}">Not right</button>
      </div>`
    )
    .join("");

  // Kept as its own block. A cancellation is not a conversation, and the two
  // have to stay legible as different things - the whole value is in the
  // difference between "we never booked it" and "we booked it three times".
  const skipped = (p.skipped ?? [])
    .map(
      (/** @type {any} */ sk) => `<div class="line">
        <span class="line-when">${esc(sk.when)}</span>
        <span class="line-text"><strong>${esc(sk.kind)}</strong> did not happen${sk.why ? ` - ${esc(sk.why)}` : ""}</span>
        <button class="act tiny danger" data-act="unlogSkip" data-id="${esc(sk.id)}"
          data-what="${esc(sk.kind)} that did not happen">Not right</button>
      </div>`
    )
    .join("");

  const model = await modelStatus();
  const themesKey = `themes:${p.id}`;
  const growing = await threadsBlock(String(p.id));

  // Themes already written by a scheduled pass, listed as themes rather than as
  // observations: an observation is something the user saw, and a theme is
  // something a model claimed. Merging the two would let the second quietly
  // acquire the authority of the first.
  const themes = (p.themes ?? [])
    .map(
      (/** @type {any} */ t) => `<div class="line">
        <span class="line-when">${esc(t.times)}×</span>
        <span class="line-text">${esc(t.name)}${t.evidence ? ` — ${esc(t.evidence)}` : ""}</span>
        <span class="line-right"><span class="pill plain">${esc(t.source ?? "model")}</span></span>
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
        <button class="act" data-act="logSkip" data-person="${esc(p.id)}">It did not happen</button>
        <button class="act" data-act="logPromise" data-person="${esc(p.id)}">I promised something</button>
        <button class="act" data-act="logEvidence" data-person="${esc(p.id)}">Record an observation</button>
        ${
          model.available
            ? isRunning(themesKey)
              ? `<button class="act" disabled>Reading notes…</button>`
              : `<button class="act" data-act="findThemes" data-person="${esc(p.id)}">What keeps coming up</button>`
            : ""
        }
      </div>

      ${resultFor(themesKey) === null ? "" : themesHtml(themesKey, resultFor(themesKey))}

      ${themes ? list("Themes", themes, "") : ""}
      ${list("Cadences", cadences, "No duty in the role map applies to this relationship type.")}
      ${list("Open promises", promises, "Nothing outstanding.")}
      ${growing}
      ${p.skipPattern ? `<p class="card-why dim">${esc(p.skipPattern)}</p>` : ""}
      ${list("Recent contact", contact, "No contact recorded yet.")}
      ${skipped ? list("Booked and did not happen", skipped, "") : ""}
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
  // Growth's dialogs are shared with the prep card rather than written twice.
  // Both surfaces offer the same six things, and a second copy of any of them is
  // a copy that drifts.
  ...growthActions,

  /** @param {Record<string, string>} d */
  logSkip: async (d) => {
    const values = await form({
      title: "What did not happen?",
      intro:
        "Recorded, and it satisfies nothing - the conversation still has not taken place, so " +
        "the clock keeps running. The point is the difference between never having booked it " +
        "and having cancelled it three times, which contact alone cannot show.",
      fields: [
        {
          name: "kind",
          label: "What it would have been",
          type: "select",
          options: kindsFor("person").filter((k) => k.value !== "second-hand" && k.value !== "survey"),
          value: "one-to-one"
        },
        {
          name: "why",
          label: "Why, in a line",
          placeholder: "Release week, moved it myself for the third time",
          hint:
            "Your own words rather than a category. The difference between \"he was ill\" and " +
            "\"I moved it again\" is the whole reason to write it down."
        },
        { name: "at", label: "When it should have been", type: "date", value: asDateInput(Date.now()) }
      ],
      confirm: "Record it"
    });
    if (!values) {
      return;
    }
    if (await act("logSkip", { person: d.person, ...values }, "Recorded.")) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  unlogSkip: async (d) => {
    const sure = await ask({
      title: "Take this back?",
      body: `"${d.what}" stops being on record. Nothing else changes - a skip never satisfied anything.`,
      confirm: "Take it back",
      tone: "danger"
    });
    if (sure && (await act("removeRow", { collection: "skips", id: d.id }, "Taken back."))) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  unlogContact: async (d) => {
    const sure = await ask({
      title: "Take this back?",
      body: `"${d.what}" stops counting, so whatever cadence it satisfied goes back to where it was. The event stays in the log - nothing here is ever really deleted - it just stops being evidence.`,
      confirm: "Take it back",
      tone: "danger"
    });
    if (sure && (await act("removeRow", { collection: "touches", id: d.id }, "Taken back."))) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  open: (d) => go("people", { person: d.person }),
  back: () => go("people"),

  /**
   * Read across their notes and name what recurs.
   *
   * Deliberately not applied: this is the button, and a button produces a draft
   * to look at. Writing themes into the record is the scheduled path's job, and
   * a button that quietly persisted its own output would make every idle click
   * a permanent claim about a colleague.
   *
   * @param {Record<string, string>} d
   */
  findThemes: (d) => run(`themes:${d.person}`, "detectThemes", { person: d.person }),

  ...modelActions(),

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
      intro:
        "Their history comes with them whatever you change here - everything that points at " +
        "somebody holds their id, so the name is only what is shown and what Ctrl+K matches.",
      fields: [
        { name: "name", label: "Name", value: p.name, required: true },
        {
          name: "relation",
          label: "How you relate to them",
          type: "select",
          options: RELATION_OPTIONS,
          value: p.relation
        },
        {
          name: "since",
          label: "Since when",
          type: "date",
          value: p.since ? asDateInput(p.since) : "",
          hint:
            "When the relationship started. Every cadence measures from here until there is " +
            "contact to measure from instead, so a placeholder puts somebody months behind on " +
            "their first day - or perfectly in step with somebody you have never spoken to."
        },
        {
          name: "awayUntil",
          label: "Away until",
          type: "date",
          value: p.awayUntil ? asDateInput(p.awayUntil) : "",
          hint:
            "Parental leave, a sabbatical, a long illness. Nothing is expected of you while " +
            "they are away, and the clock restarts from the day they are back rather than from " +
            "the last time you spoke. Clear it if they return early."
        },
        {
          name: "leftAt",
          label: "Last day",
          type: "date",
          value: p.leftAt ? asDateInput(p.leftAt) : "",
          hint:
            "Set it as soon as you know it. Everything holds until that day - a promise to " +
            "somebody leaving next week is exactly the promise to keep - and after it their " +
            "cadences go quiet while the whole history stays. Better than removing them."
        }
      ],
      confirm: "Save"
    });
    if (!values) {
      return;
    }
    // An empty date field arrives as undefined, which the service reads as
    // "leave it alone". For these two, empty has to mean "clear it" - somebody
    // coming back early, or a resignation withdrawn - so it is made explicit.
    const fields = {
      ...values,
      awayUntil: values.awayUntil ?? null,
      leftAt: values.leftAt ?? null
    };
    if (await act("updatePerson", { person: d.person, fields }, "Updated.")) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  logContact: async (d) => {
    const values = await form({
      title: "Log contact",
      intro: "The kind decides which cadence this satisfies. A second-hand report does not count as having spoken to them.",
      fields: [
        // A person can only be the subject of the person kinds. The project and
        // workstream ones were on this list too, and picking one recorded
        // something that satisfied nothing while the toast still said Logged.
        { name: "kind", label: "What kind", type: "select", options: kindsFor("person"), value: "one-to-one" },
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
