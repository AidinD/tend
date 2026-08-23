/**
 * The role map: what the job asks of you, in your words.
 *
 * This is data, not structure. Reorganise or change employer and you edit the
 * map; the people and their history stay. Everything on this page is editable
 * or removable, including the duties that came from a book - especially those.
 */

import { act, ask, esc, form, RELATION_OPTIONS, tend } from "../ui.js";
import { refresh } from "../app.js";

export async function render() {
  const [map, questions] = await Promise.all([tend.invoke("roleMap"), tend.invoke("signals")]);

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
        <p class="card-why">Start from a set drawn from management reading: three duties most managers already practise, five worth considering, and three monthly questions. The proposals do nothing until you accept them, and you can edit or delete every one.</p>
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
          <span class="src">Every ${esc(d.every)} · ${esc(d.appliesTo)} · from ${esc(d.source)}${d.guarded ? " · guarded" : ""}</span>
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
        ? `<div class="group">
            <div class="group-head"><span class="group-title">Monthly questions</span><span class="group-rule"></span><span class="group-meta">${(questions ?? []).length}</span></div>
            <div class="rows">${questionRows}</div>
            <p class="group-note">The one thing Tend cannot work out on its own, so it asks. They appear in Now when they are due.</p>
          </div>`
        : ""
    }
  `;
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
      name: "subjectKind",
      label: "Applies to",
      type: "select",
      value: duty?.appliesTo ?? "person",
      options: [
        { value: "person", label: "Each person" },
        { value: "project", label: "Each project" },
        { value: "workstream", label: "Each workstream" }
      ]
    },
    {
      name: "cadenceDays",
      label: "How often, in days",
      type: "number",
      min: 1,
      value: duty ? Number(String(duty.every).replace(/\D/g, "")) : 14
    },
    {
      name: "guarded",
      label: "Never dampen this, even under a focus",
      type: "checkbox",
      value: Boolean(duty?.guarded),
      hint: "For the things a busy month must not be allowed to bury."
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
    await act("decideDuty", { id: created.id, status: "active", overrides: { guarded: values.guarded } }, "Added.");
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
          guarded: values.guarded
        }
      },
      "Saved."
    );
    if (ok) {
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
