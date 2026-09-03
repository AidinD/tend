/**
 * The role map: what the job asks of you, in your words.
 *
 * This is data, not structure. Reorganise or change employer and you edit the
 * map; the people and their history stay. Everything on this page is editable
 * or removable, including the duties that came from a book - especially those.
 */

import { act, ask, esc, form, RELATION_OPTIONS, SUBJECT_KINDS, tend } from "../ui.js";
import { refresh } from "../app.js";
import { T } from "../text.js";

const t = T.role;

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
          <h1 class="view-title">${t.title}</h1>
          <p class="view-sub">${t.sub}</p>
        </div>
        <button class="act primary" data-act="addDuty">${t.addButton}</button>
      </div>
    </div>`;

  if (map.active.length === 0 && map.proposed.length === 0) {
    return `${header}
      <article class="card sev-book">
        <div class="card-top"><h2 class="card-title">${t.seedTitle}</h2></div>
        <p class="card-why">${t.seedWhy}</p>
        <div class="card-foot">
          <span class="src">${t.seedOr}</span>
          <button class="act primary" data-act="seed">${t.seedButton}</button>
          <button class="act" data-act="addDuty">${t.seedOwnButton}</button>
        </div>
      </article>`;
  }

  const proposed = map.proposed
    .map(
      (/** @type {any} */ d) => `<article class="card sev-proposed">
        <div class="card-top">
          <h2 class="card-title">${esc(d.name)}</h2>
          <span class="pill book">${t.proposedPill}</span>
        </div>
        ${d.means ? `<p class="card-why">${esc(d.means)}</p>` : ""}
        <div class="card-foot">
          <span class="src">${t.proposedMeta(esc(d.every), esc(d.source))}</span>
          <button class="act primary" data-act="accept" data-id="${esc(d.id)}">${t.acceptButton}</button>
          <button class="act" data-act="editDuty" data-id="${esc(d.id)}">${t.adjustButton}</button>
          <button class="act" data-act="decline" data-id="${esc(d.id)}">${t.declineButton}</button>
        </div>
      </article>`
    )
    .join("");

  const active = map.active
    .map(
      (/** @type {any} */ d) => `<article class="card sev-ok">
        <div class="card-top">
          <h2 class="card-title">${esc(d.name)}</h2>
          <span class="pill plain">${t.behindPill(esc(d.subjectsBehind ?? ""))}</span>
        </div>
        ${d.means ? `<p class="card-why">${esc(d.means)}</p>` : ""}
        <div class="card-foot">
          <span class="src">${t.activeMeta(esc(d.every), esc(d.appliesTo), esc(d.source), Boolean(d.guarded), d.keepWhileLeaving === false)}</span>
          <button class="act" data-act="editDuty" data-id="${esc(d.id)}">${t.editButton}</button>
          <button class="act danger" data-act="removeDuty" data-id="${esc(d.id)}" data-name="${esc(d.name)}">${t.removeButton}</button>
        </div>
      </article>`
    )
    .join("");

  const questionRows = (questions ?? [])
    .map(
      (/** @type {any} */ q) => `<div class="row static">
        <span class="row-name">${esc(q.question)}</span>
        <span class="row-right">
          <span class="row-meta">${esc(q.lastAsked === "never" ? t.neverAsked : t.asked(q.lastAsked))}${q.lastAnswer ? ` · ${esc(q.lastAnswer)}` : ""}</span>
        </span>
      </div>`
    )
    .join("");

  const topicList = Array.isArray(topics) ? topics.filter((/** @type {any} */ x) => x.status !== "declined") : [];
  const topicRows = topicList
    .map((/** @type {any} */ topic) => {
      const scope = topic.person ? t.topicOnePerson : relationWords(topic.relations);
      const isProposed = topic.status === "proposed";
      return `<div class="row static">
        <span class="row-name">
          ${esc(topic.text)}
          <span class="src">${esc(topic.why)}</span>
        </span>
        <span class="row-right">
          <span class="row-meta">${t.topicMeta(topic.cadenceDays, esc(scope))}</span>
          ${
            isProposed
              ? `<span class="pill book">${t.proposedPill}</span>
                 <button class="act primary" data-act="acceptTopic" data-id="${esc(topic.id)}">${t.useItButton}</button>
                 <button class="act" data-act="declineTopic" data-id="${esc(topic.id)}">${t.declineButton}</button>`
              : `<button class="act danger" data-act="removeTopic" data-id="${esc(topic.id)}" data-name="${esc(topic.text)}">${t.removeButton}</button>`
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
            <div class="group-head"><span class="group-title">${t.proposedGroup}</span><span class="group-rule"></span><span class="group-meta">${map.proposed.length}</span></div>
            <div class="stack">${proposed}</div>
          </div>`
        : ""
    }
    <div class="group">
      <div class="group-head"><span class="group-title">${t.activeGroup}</span><span class="group-rule"></span><span class="group-meta">${map.active.length}</span></div>
      ${active ? `<div class="stack">${active}</div>` : `<div class="empty">${t.activeEmpty}</div>`}
    </div>
    ${
      questionRows
        ? `<div class="group" data-group="questions">
            <div class="group-head"><span class="group-title">${t.questionsGroup}</span><span class="group-rule"></span><span class="group-meta">${(questions ?? []).length}</span></div>
            <div class="rows">${questionRows}</div>
            <p class="group-note">${t.questionsNote}</p>
          </div>`
        : ""
    }
    ${
      topicRows
        ? `<div class="group" data-group="topics">
            <div class="group-head"><span class="group-title">${t.topicsGroup}</span><span class="group-rule"></span><span class="group-meta">${topicList.length}</span></div>
            <div class="rows">${topicRows}</div>
            <p class="group-note">${t.topicsNote}</p>
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
    return t.topicNobody;
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
    { name: "name", label: t.fName, required: true, value: duty?.name, placeholder: t.fNamePlaceholder },
    {
      name: "means",
      label: t.fMeans,
      type: "textarea",
      value: duty?.means,
      hint: t.fMeansHint
    },
    {
      // Derived. This list was hand-written and missing "stake", so editing a
      // stakeholder duty found no option matching the stored value, showed the
      // first one, and saved THAT - rewriting the duty to apply to every
      // colleague while consuming evidence that can never be about a person.
      name: "subjectKind",
      label: t.fAppliesTo,
      type: "select",
      value: duty?.appliesTo ?? "person",
      options: SUBJECT_KINDS
    },
    {
      name: "cadenceDays",
      label: t.fCadence,
      type: "number",
      min: 1,
      // The number, not digits scraped back out of "30 days".
      value: duty?.cadenceDays ?? 14
    },
    {
      name: "guarded",
      label: t.fGuarded,
      type: "checkbox",
      value: Boolean(duty?.guarded),
      hint: t.fGuardedHint
    },
    {
      name: "keepWhileLeaving",
      label: t.fLeavers,
      type: "checkbox",
      value: duty ? duty.keepWhileLeaving !== false : true,
      hint: t.fLeaversHint
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
    title: t.relationsTitle,
    intro: t.relationsIntro,
    fields: RELATION_OPTIONS.map((r) => ({
      name: r.value,
      label: r.label,
      type: /** @type {const} */ ("checkbox")
    })),
    confirm: t.relationsConfirm
  });
  if (!picked) {
    return null;
  }
  return RELATION_OPTIONS.map((r) => r.value).filter((v) => picked[v]);
}

export const actions = {
  seed: async () => {
    if (await act("seed", {}, t.seededToast)) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  accept: async (d) => {
    if (await act("decideDuty", { id: d.id, status: "active" }, t.acceptedToast)) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  decline: async (d) => {
    if (await act("decideDuty", { id: d.id, status: "declined" }, t.declinedToast)) {
      refresh();
    }
  },

  addDuty: async () => {
    const values = await form({
      title: t.addTitle,
      intro: t.addIntro,
      fields: dutyFields(undefined),
      confirm: t.addConfirm
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
      t.addedToast
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
      title: t.editTitle(duty.name),
      fields: dutyFields(duty),
      confirm: t.editConfirm
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
      t.savedToast
    );
    if (ok) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  acceptTopic: async (d) => {
    if (await act("decideTopic", { id: d.id, status: "active" }, t.topicAcceptedToast)) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  declineTopic: async (d) => {
    if (await act("decideTopic", { id: d.id, status: "declined" }, t.declinedToast)) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  removeTopic: async (d) => {
    const sure = await ask({
      title: t.removeTopicTitle,
      body: t.removeTopicBody(d.name),
      confirm: t.removeConfirm,
      tone: "danger"
    });
    if (sure && (await act("removeRow", { collection: "topics", id: d.id }, t.removedToast))) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  removeDuty: async (d) => {
    const sure = await ask({
      title: t.removeDutyTitle(d.name),
      body: t.removeDutyBody,
      confirm: t.removeConfirm,
      tone: "danger"
    });
    if (sure && (await act("removeRow", { collection: "duties", id: d.id }, t.removedToast))) {
      refresh();
    }
  }
};
