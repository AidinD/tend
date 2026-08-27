/**
 * People, grouped by relationship rather than by org chart.
 *
 * The grouping is the point in the work half. What you owe someone you lead
 * daily is not what you owe someone you manage from two teams away, and a tool
 * that lists them together hides the one gap that matters most.
 *
 * ## Both halves, from one file
 *
 * The private half has people too, and this page draws them - with a different
 * vocabulary and a much shorter person page. What differs is asked rather than
 * branched on: `vocabulary` says which relationships exist here and `person`
 * says which blocks this page may show, both from `domain/halves.js`.
 *
 * The first version of the private half did none of this, and the symptom was
 * exact: "Add someone" asked whether this person was one you lead and manage,
 * manage remotely, or are a stakeholder to. Six management relationships offered
 * for somebody's family, because the list was a constant compiled into this
 * file.
 */

import { act, ask, asDateInput, kindsFor, esc, form, pill, tend } from "../ui.js";
import { go, refresh } from "../app.js";
import { isRunning, modelActions, modelStatus, resultFor, run, themesHtml } from "../model.js";
import { actions as growthActions, threadsBlock } from "./growth.js";
import { actions as waitingActions, waitingBlock } from "./waiting.js";

/**
 * This half's vocabulary, asked once per draw.
 *
 * Derived rather than written out, because the hand-written version of the group
 * list was the fourth copy of the same thing and it hid people: it had no row for
 * one relationship type, so everybody with that type simply did not appear on the
 * roster. No error, no empty group, no trace - in the store and off the page.
 *
 * Asked per draw rather than cached, because it is a local call and a cache here
 * would be the thing that survives a switch of halves.
 */
async function vocabulary() {
  const v = await tend.invoke("vocabulary");
  return {
    half: String(v?.half ?? "work"),
    relations: Array.isArray(v?.relations) ? v.relations : [],
    defaultRelation: String(v?.defaultRelation ?? "lead-and-manage")
  };
}

/** @param {Record<string, any>} params */
export async function render(params) {
  if (params.person) {
    return personPage(params.person);
  }

  const [roster, vocab] = await Promise.all([tend.invoke("people"), vocabulary()]);
  const isPrivate = vocab.half === "private";

  const header = `
    <div class="view-head">
      <div class="head-row">
        <div>
          <h1 class="view-title">People</h1>
          <p class="view-sub">${
            isPrivate
              ? "Who they are, and what you have said you would do. Nothing here is on a schedule."
              : "Grouped by the relationship, not the org chart."
          }</p>
        </div>
        <button class="act primary" data-act="addPerson">Add someone</button>
      </div>
    </div>`;

  if (!Array.isArray(roster) || roster.length === 0) {
    return `${header}<div class="empty">
      ${
        isPrivate
          ? "Nobody here yet. Adding somebody gives you a place to put what you promised them - and nothing else, because nothing outside work runs on a cadence."
          : "Nobody here yet. Add the people you lead or manage, and the leads you work beside."
      }
    </div>`;
  }

  const body = vocab.relations.map((/** @type {any} */ { value: relation, label }) => {
    const members = roster.filter((/** @type {any} */ p) => p.relation === relation);
    if (members.length === 0) {
      return "";
    }
    const rows = members
      .map(
        (/** @type {any} */ p) => `<button class="row" data-act="open" data-person="${esc(p.id)}">
          <span class="row-name">${esc(p.name)}</span>
          <span class="row-right">
            ${p.availability && !isPrivate ? `<span class="pill plain">${esc(p.availability)}</span>` : ""}
            ${
              isPrivate
                ? // Nothing on the right at all. There is no drift here, and "no
                  // duty applies" written beside somebody's family is worse than
                  // an empty row - it answers a question nobody asked.
                  ""
                : p.worstDrift
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

  /*
   * What this page may show, decided by the half rather than by conditions
   * scattered down the middle of this function.
   *
   * The distinction is not cosmetic. A growth thread is a direction you have
   * decided somebody should develop in, with a marker you watch for - run that
   * on your own child and the tool has become something else. An observation is
   * a record of somebody else's state, which is precisely what the private
   * journal's one rule forbids. Contact and cancellations feed cadences, and
   * there are none here.
   */
  const blocks = p.blocks ?? {
    cadences: true,
    promises: true,
    waiting: true,
    growth: true,
    topics: true,
    skips: true,
    themes: true
  };

  const model = await modelStatus();
  const themesKey = `themes:${p.id}`;
  const growing = blocks.growth ? await threadsBlock(String(p.id)) : "";
  const waitingOn = blocks.waiting ? await waitingBlock(String(p.id)) : "";

  /*
   * The evenings that named them.
   *
   * The answer to "how has it been going", which promises and waiting cannot
   * give. Each one is his own writing about his own part - naming who was there
   * is what makes it findable here, and says nothing about them.
   */
  const evenings = blocks.entries
    ? /** @type {any[]} */ (await tend.invoke("entriesFor", { person: String(p.id) }))
    : [];
  const eveningLines = (Array.isArray(evenings) ? evenings : [])
    .map(
      (/** @type {any} */ e) => `<div class="line">
        <span class="line-when">${esc(e.when)}</span>
        <span class="line-text">${(e.lines ?? [])
          .map((/** @type {any} */ l) => `<strong>${esc(l.label)}:</strong> ${esc(l.text)}`)
          .join("<br>")}</span>
      </div>`
    )
    .join("");

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
        ${blocks.cadences ? `<button class="act primary" data-act="logContact" data-person="${esc(p.id)}">Log contact</button>` : ""}
        ${blocks.skips ? `<button class="act" data-act="logSkip" data-person="${esc(p.id)}">It did not happen</button>` : ""}
        <!--
          The one action that is in both halves, and the primary one where it is
          the only one. A promise is owed the same way to somebody you live with,
          and the person let down is let down in the same way.
        -->
        <button class="act ${blocks.cadences ? "" : "primary"}" data-act="logPromise" data-person="${esc(p.id)}">I promised something</button>
        ${blocks.themes ? `<button class="act" data-act="logEvidence" data-person="${esc(p.id)}">Record an observation</button>` : ""}
        ${
          blocks.themes && model.available
            ? isRunning(themesKey)
              ? `<button class="act" disabled>Reading notes…</button>`
              : `<button class="act" data-act="findThemes" data-person="${esc(p.id)}">What keeps coming up</button>`
            : ""
        }
      </div>

      ${resultFor(themesKey) === null ? "" : themesHtml(themesKey, resultFor(themesKey))}

      ${blocks.themes && themes ? list("Themes", themes, "") : ""}
      ${blocks.cadences ? list("Cadences", cadences, "No duty in the role map applies to this relationship type.") : ""}
      ${list("Open promises", promises, "Nothing outstanding.")}
      ${waitingOn}
      ${growing}
      ${blocks.skips && p.skipPattern ? `<p class="card-why dim">${esc(p.skipPattern)}</p>` : ""}
      ${blocks.cadences ? list("Recent contact", contact, "No contact recorded yet.") : ""}
      ${blocks.skips && skipped ? list("Booked and did not happen", skipped, "") : ""}
      ${
        blocks.themes
          ? list("Observations", observations, "Nothing recorded. This is what a review conversation is built from.")
          : ""
      }
      ${
        blocks.entries
          ? list(
              "Evenings that named them",
              eveningLines,
              "None yet. Write the day on The day and tick their name - that is what puts it here."
            )
          : ""
      }

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
  const vocab = await vocabulary();
  const isPrivate = vocab.half === "private";

  const values = await form({
    title: "Add someone",
    intro: isPrivate
      ? // No mention of duties, because there are none. The relationship here is a
        // label: it groups the list and it sits on their page, and nothing is
        // derived from it. Saying so is the difference between a field somebody
        // answers carefully and a field somebody answers wrong on purpose.
        "Who they are, for your own reference. Nothing is scheduled from it."
      : "The relationship type decides which duties apply to them.",
    fields: [
      { name: "name", label: "Name", required: true, placeholder: isPrivate ? "What you call them" : "Their full name" },
      {
        name: "relation",
        label: isPrivate ? "Who they are" : "How you relate to them",
        type: "select",
        // Asked, not compiled in. This is the field that offered six management
        // relationships for somebody's family.
        options: vocab.relations.map((/** @type {any} */ r) => ({ value: r.value, label: r.choice })),
        value: vocab.defaultRelation
      },
      // The start date exists to give a cadence something to measure from before
      // there is contact to measure from instead. With no cadences it is a
      // question with no consequence, and asking "since when" about a parent is
      // its own small absurdity.
      ...(isPrivate
        ? []
        : [
            {
              name: "since",
              label: "Since when",
              type: /** @type {const} */ ("date"),
              value: asDateInput(Date.now()),
              hint: "When the relationship started, not today. Leave it as today for someone who just joined; set it back for someone you have had for months, or Tend will think you are perfectly in step with them."
            }
          ])
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
  ...waitingActions,

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
    const [p, editVocab] = await Promise.all([
      tend.invoke("person", { person: d.person }),
      vocabulary()
    ]);
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
          label: editVocab.half === "private" ? "Who they are" : "How you relate to them",
          type: "select",
          // The half's own vocabulary. Offering the work list here would let a
          // private person be edited into a management relationship, and the
          // service would then refuse the save with a message about duties.
          options: editVocab.relations.map((/** @type {any} */ r) => ({ value: r.value, label: r.choice })),
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
