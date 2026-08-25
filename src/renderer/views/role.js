/**
 * The role map: what the job asks of you, in your words.
 *
 * This is data, not structure. Reorganise or change employer and you edit the
 * map; the people and their history stay. Everything on this page is editable
 * or removable, including the duties that came from a book - especially those.
 */

import { act, ask, esc, form, RELATION_OPTIONS, SUBJECT_KINDS, tend } from "../ui.js";
import { refresh } from "../app.js";

export async function render() {
  const [map, questions, topics] = await Promise.all([
    tend.invoke("roleMap"),
    tend.invoke("signals"),
    tend.invoke("allTopics")
  ]);

  const header = `
    <div class="view-head">
      <div class="head-row">
        <div>
          <h1 class="view-title">Role map</h1>
          <p class="view-sub">What the job asks of you, and how you are doing against it. Change any of it - a duty you never act on is worse than no duty at all.</p>
        </div>
        <button class="act primary" data-act="addDuty">Add a duty</button>
      </div>
    </div>`;

  if (map.active.length === 0 && map.proposed.length === 0) {
    return `${header}
      <article class="card sev-book">
        <div class="card-top"><h2 class="card-title">Nothing here yet</h2></div>
        <p class="card-why">Start from a set drawn from management reading: three duties most managers already practise, five worth considering, three monthly questions, and a set of standing topics to raise with your own manager and your peer leads. The proposals do nothing until you accept them, and you can edit or delete every one.</p>
        <div class="card-foot">
          <span class="src">Or write your own from scratch</span>
          <button class="act primary" data-act="seed">Set up the role map</button>
          <button class="act" data-act="addDuty">Write my own</button>
        </div>
      </article>`;
  }

  const proposed = map.proposed
    .map(
      (/** @type {any} */ d) => `<article class="card sev-proposed">
        <div class="card-top">
          <h2 class="card-title">${esc(d.name)}</h2>
          <span class="pill book">proposed</span>
        </div>
        ${d.means ? `<p class="card-why">${esc(d.means)}</p>` : ""}
        <div class="card-foot">
          <span class="src">Suggested every ${esc(d.every)} · from ${esc(d.source)}</span>
          <button class="act primary" data-act="accept" data-id="${esc(d.id)}">Add to my map</button>
          <button class="act" data-act="editDuty" data-id="${esc(d.id)}">Adjust first</button>
          <button class="act" data-act="decline" data-id="${esc(d.id)}">Not for me</button>
        </div>
      </article>`
    )
    .join("");

  const active = map.active
    .map(
      (/** @type {any} */ d) => `<article class="card sev-ok">
        <div class="card-top">
          <h2 class="card-title">${esc(d.name)}</h2>
          <span class="pill plain">${esc(d.subjectsBehind ?? "")} behind</span>
        </div>
        ${d.means ? `<p class="card-why">${esc(d.means)}</p>` : ""}
        <div class="card-foot">
          <span class="src">Every ${esc(d.every)} · ${esc(d.appliesTo)} · from ${esc(d.source)}${d.guarded ? " · guarded" : ""}${d.keepWhileLeaving === false ? " · paused for leavers" : ""}</span>
          <button class="act" data-act="editDuty" data-id="${esc(d.id)}">Edit</button>
          <button class="act danger" data-act="removeDuty" data-id="${esc(d.id)}" data-name="${esc(d.name)}">Remove</button>
        </div>
      </article>`
    )
    .join("");

  const questionRows = (questions ?? [])
    .map(
      (/** @type {any} */ q) => `<div class="row static">
        <span class="row-name">${esc(q.question)}</span>
        <span class="row-right">
          <span class="row-meta">${esc(q.lastAsked === "never" ? "never asked" : `asked ${q.lastAsked}`)}${q.lastAnswer ? ` · ${esc(q.lastAnswer)}` : ""}</span>
        </span>
      </div>`
    )
    .join("");

  const topicList = Array.isArray(topics) ? topics.filter((/** @type {any} */ t) => t.status !== "declined") : [];
  const topicRows = topicList
    .map((/** @type {any} */ t) => {
      const scope = t.person ? "one person" : relationWords(t.relations);
      const isProposed = t.status === "proposed";
      return `<div class="row static">
        <span class="row-name">
          ${esc(t.text)}
          <span class="src">${esc(t.why)}</span>
        </span>
        <span class="row-right">
          <span class="row-meta">every ${t.cadenceDays} days &middot; ${esc(scope)}</span>
          ${
            isProposed
              ? `<span class="pill book">proposed</span>
                 <button class="act primary" data-act="acceptTopic" data-id="${esc(t.id)}">Use it</button>
                 <button class="act" data-act="declineTopic" data-id="${esc(t.id)}">Not for me</button>`
              : `<button class="act danger" data-act="removeTopic" data-id="${esc(t.id)}" data-name="${esc(t.text)}">Remove</button>`
          }
        </span>
      </div>`;
    })
    .join("");

  return `
    ${header}
    ${
      proposed
        ? `<div class="group">
            <div class="group-head"><span class="group-title">Proposed, undecided</span><span class="group-rule"></span><span class="group-meta">${map.proposed.length}</span></div>
            <div class="stack">${proposed}</div>
          </div>`
        : ""
    }
    <div class="group">
      <div class="group-head"><span class="group-title">Yours, active</span><span class="group-rule"></span><span class="group-meta">${map.active.length}</span></div>
      ${active ? `<div class="stack">${active}</div>` : `<div class="empty">Nothing active yet.</div>`}
    </div>
    ${
      questionRows
        ? `<div class="group" data-group="questions">
            <div class="group-head"><span class="group-title">Monthly questions</span><span class="group-rule"></span><span class="group-meta">${(questions ?? []).length}</span></div>
            <div class="rows">${questionRows}</div>
            <p class="group-note">The one thing Tend cannot work out on its own, so it asks. They appear in Now when they are due.</p>
          </div>`
        : ""
    }
    ${
      topicRows
        ? `<div class="group" data-group="topics">
            <div class="group-head"><span class="group-title">Topics to raise</span><span class="group-rule"></span><span class="group-meta">${topicList.length}</span></div>
            <div class="rows">${topicRows}</div>
            <p class="group-note">
              Not duties. A duty asks whether you spoke to someone at all and turns
              up in Now when you have not; a topic is what to actually say, and it
              appears only on that person's card in Prep. These are the two
              directions nothing else covers: upward, where the questions are about
              what you want rather than what you owe, and sideways, where there is
              no formal channel in either direction.
            </p>
          </div>`
        : ""
    }
  `;
}

/**
 * Which relationships a topic applies to, in words rather than internal names.
 *
 * @param {string[]} relations
 * @returns {string}
 */
function relationWords(relations) {
  if (!Array.isArray(relations) || relations.length === 0) {
    return "nobody yet";
  }
  const labels = relations.map((r) => {
    const found = RELATION_OPTIONS.find((o) => o.value === r);
    return found ? found.label.toLowerCase() : r;
  });
  return labels.join(", ");
}

/**
 * @param {any} [duty] Existing duty when editing.
 * @returns {import("../ui.js").Field[]}
 */
function dutyFields(duty) {
  return [
    { name: "name", label: "What it is", required: true, value: duty?.name, placeholder: "1-1" },
    {
      name: "means",
      label: "What it means in practice",
      type: "textarea",
      value: duty?.means,
      hint: "In your own words. This is what you will read in six months when you have forgotten why you added it."
    },
    {
      // Derived. This list was hand-written and missing "stake", so editing a
      // stakeholder duty found no option matching the stored value, showed the
      // first one, and saved THAT - rewriting the duty to apply to every
      // colleague while consuming evidence that can never be about a person.
      name: "subjectKind",
      label: "Applies to",
      type: "select",
      value: duty?.appliesTo ?? "person",
      options: SUBJECT_KINDS
    },
    {
      name: "cadenceDays",
      label: "How often, in days",
      type: "number",
      min: 1,
      // The number, not digits scraped back out of "30 days".
      value: duty?.cadenceDays ?? 14
    },
    {
      name: "guarded",
      label: "Never dampen this, even under a focus",
      type: "checkbox",
      value: Boolean(duty?.guarded),
      hint:
        "For the things a busy month must not be allowed to bury. Note that a focus never " +
        "removes anything critical from Now whether this is set or not - it holds back the " +
        "softest tier, and guarding also protects the tier above it."
    },
    {
      name: "keepWhileLeaving",
      label: "Still applies to somebody working out their notice",
      type: "checkbox",
      value: duty ? duty.keepWhileLeaving !== false : true,
      hint:
        "Leave it on for a 1-1: a notice period is when the handover gets arranged. Turn it " +
        "off for anything meant to develop somebody, like a peer review round - running one " +
        "for a person on their way out is work for everybody and changes nothing."
    }
  ];
}

/**
 * Relationship types are asked for separately, because the answer only makes
 * sense for a person-shaped duty and offering it otherwise invites nonsense.
 *
 * @param {Record<string, any>} values
 */
async function askRelations(values) {
  if (values.subjectKind !== "person") {
    return [];
  }
  const picked = await form({
    title: "Who does it apply to?",
    intro: "Leave them all off to mean everyone.",
    fields: RELATION_OPTIONS.map((r) => ({
      name: r.value,
      label: r.label,
      type: /** @type {const} */ ("checkbox")
    })),
    confirm: "Done"
  });
  if (!picked) {
    return null;
  }
  return RELATION_OPTIONS.map((r) => r.value).filter((v) => picked[v]);
}

export const actions = {
  seed: async () => {
    if (await act("seed", {}, "Role map set up.")) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  accept: async (d) => {
    if (await act("decideDuty", { id: d.id, status: "active" }, "Added to your map.")) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  decline: async (d) => {
    if (await act("decideDuty", { id: d.id, status: "declined" }, "Declined.")) {
      refresh();
    }
  },

  addDuty: async () => {
    const values = await form({
      title: "Add a duty",
      intro: "Something the job asks of you that can be neglected. Keep the map short - a long list is one you stop reading.",
      fields: dutyFields(undefined),
      confirm: "Next"
    });
    if (!values) {
      return;
    }
    const relations = await askRelations(values);
    if (relations === null) {
      return;
    }
    const created = await act(
      "proposeDuty",
      {
        name: values.name,
        means: values.means ?? "-",
        source: "yours",
        subjectKind: values.subjectKind,
        cadenceDays: values.cadenceDays,
        relations,
        evidenceKinds: []
      },
      undefined
    );
    if (!created) {
      return;
    }
    // Written by him, so it goes straight to active rather than sitting as a
    // proposal from himself to himself.
    await act(
      "decideDuty",
      {
        id: created.id,
        status: "active",
        overrides: { guarded: values.guarded, keepWhileLeaving: values.keepWhileLeaving }
      },
      "Added."
    );
    refresh();
  },

  /** @param {Record<string, string>} d */
  editDuty: async (d) => {
    const map = await tend.invoke("roleMap");
    const duty = [...map.active, ...map.proposed].find((/** @type {any} */ x) => x.id === d.id);
    if (!duty) {
      return;
    }
    const values = await form({
      title: `Edit ${duty.name}`,
      fields: dutyFields(duty),
      confirm: "Save"
    });
    if (!values) {
      return;
    }
    const ok = await act(
      "updateDuty",
      {
        id: d.id,
        fields: {
          name: values.name,
          means: values.means,
          subjectKind: values.subjectKind,
          cadenceDays: values.cadenceDays,
          guarded: values.guarded,
          keepWhileLeaving: values.keepWhileLeaving
        }
      },
      "Saved."
    );
    if (ok) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  acceptTopic: async (d) => {
    if (await act("decideTopic", { id: d.id, status: "active" }, "It will show up when you next prepare for them.")) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  declineTopic: async (d) => {
    if (await act("decideTopic", { id: d.id, status: "declined" }, "Declined.")) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  removeTopic: async (d) => {
    const sure = await ask({
      title: "Remove this topic?",
      body: `"${d.name}" stops appearing on anyone's card. The times you already marked it raised stay on record.`,
      confirm: "Remove",
      tone: "danger"
    });
    if (sure && (await act("removeRow", { collection: "topics", id: d.id }, "Removed."))) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  removeDuty: async (d) => {
    const sure = await ask({
      title: `Remove "${d.name}"?`,
      body: "It stops applying to anyone and stops appearing in Now. The contact you have already logged stays.",
      confirm: "Remove",
      tone: "danger"
    });
    if (sure && (await act("removeRow", { collection: "duties", id: d.id }, "Removed."))) {
      refresh();
    }
  }
};
