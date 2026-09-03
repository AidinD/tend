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

const words = T.role;

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
          <h1 class="view-title">${words.title}</h1>
          <p class="view-sub">${words.sub}</p>
        </div>
        <button class="act primary" data-act="addDuty">${words.addButton}</button>
      </div>
    </div>`;

  if (map.active.length === 0 && map.proposed.length === 0) {
    return `${header}
      <article class="card sev-book">
        <div class="card-top"><h2 class="card-title">${words.seedTitle}</h2></div>
        <p class="card-why">${words.seedWhy}</p>
        <div class="card-foot">
          <span class="src">${words.seedOr}</span>
          <button class="act primary" data-act="seed">${words.seedButton}</button>
          <button class="act" data-act="addDuty">${words.seedOwnButton}</button>
        </div>
      </article>`;
  }

  const proposed = map.proposed
    .map(
      (/** @type {any} */ d) => `<article class="card sev-proposed">
        <div class="card-top">
          <h2 class="card-title">${esc(d.name)}</h2>
          <span class="pill book">${words.proposedPill}</span>
        </div>
        ${d.means ? `<p class="card-why">${esc(d.means)}</p>` : ""}
        <div class="card-foot">
          <span class="src">${words.proposedMeta(esc(d.every), esc(d.source))}</span>
          <button class="act primary" data-act="accept" data-id="${esc(d.id)}">${words.acceptButton}</button>
          <button class="act" data-act="editDuty" data-id="${esc(d.id)}">${words.adjustButton}</button>
          <button class="act" data-act="decline" data-id="${esc(d.id)}">${words.declineButton}</button>
        </div>
      </article>`
    )
    .join("");

  const active = map.active
    .map(
      (/** @type {any} */ d) => `<article class="card sev-ok">
        <div class="card-top">
          <h2 class="card-title">${esc(d.name)}</h2>
          <span class="pill plain">${words.behindPill(esc(d.subjectsBehind ?? ""))}</span>
        </div>
        ${d.means ? `<p class="card-why">${esc(d.means)}</p>` : ""}
        <div class="card-foot">
          <span class="src">${words.activeMeta(esc(d.every), esc(d.appliesTo), esc(d.source), Boolean(d.guarded), d.keepWhileLeaving === false)}</span>
          <button class="act" data-act="editDuty" data-id="${esc(d.id)}">${words.editButton}</button>
          <button class="act danger" data-act="removeDuty" data-id="${esc(d.id)}" data-name="${esc(d.name)}">${words.removeButton}</button>
        </div>
      </article>`
    )
    .join("");

  const questionRows = (questions ?? [])
    .map(
      (/** @type {any} */ q) => `<div class="row static">
        <span class="row-name">${esc(q.question)}</span>
        <span class="row-right">
          <span class="row-meta">${esc(q.lastAsked === "never" ? words.neverAsked : words.asked(q.lastAsked))}${q.lastAnswer ? ` · ${esc(q.lastAnswer)}` : ""}</span>
        </span>
      </div>`
    )
    .join("");

  const topicList = Array.isArray(topics) ? topics.filter((/** @type {any} */ x) => x.status !== "declined") : [];
  const topicRows = topicList
    .map((/** @type {any} */ topic) => {
      const scope = topic.person ? words.topicOnePerson : relationWords(topic.relations);
      const isProposed = topic.status === "proposed";
      return `<div class="row static">
        <span class="row-name">
          ${esc(topic.text)}
          <span class="src">${esc(topic.why)}</span>
        </span>
        <span class="row-right">
          <span class="row-meta">${words.topicMeta(topic.cadenceDays, esc(scope))}</span>
          ${
            isProposed
              ? `<span class="pill book">${words.proposedPill}</span>
                 <button class="act primary" data-act="acceptTopic" data-id="${esc(topic.id)}">${words.useItButton}</button>
                 <button class="act" data-act="declineTopic" data-id="${esc(topic.id)}">${words.declineButton}</button>`
              : `<button class="act danger" data-act="removeTopic" data-id="${esc(topic.id)}" data-name="${esc(topic.text)}">${words.removeButton}</button>`
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
            <div class="group-head"><span class="group-title">${words.proposedGroup}</span><span class="group-rule"></span><span class="group-meta">${map.proposed.length}</span></div>
            <div class="stack">${proposed}</div>
          </div>`
        : ""
    }
    <div class="group">
      <div class="group-head"><span class="group-title">${words.activeGroup}</span><span class="group-rule"></span><span class="group-meta">${map.active.length}</span></div>
      ${active ? `<div class="stack">${active}</div>` : `<div class="empty">${words.activeEmpty}</div>`}
    </div>
    ${
      questionRows
        ? `<div class="group" data-group="questions">
            <div class="group-head"><span class="group-title">${words.questionsGroup}</span><span class="group-rule"></span><span class="group-meta">${(questions ?? []).length}</span></div>
            <div class="rows">${questionRows}</div>
            <p class="group-note">${words.questionsNote}</p>
          </div>`
        : ""
    }
    ${
      topicRows
        ? `<div class="group" data-group="topics">
            <div class="group-head"><span class="group-title">${words.topicsGroup}</span><span class="group-rule"></span><span class="group-meta">${topicList.length}</span></div>
            <div class="rows">${topicRows}</div>
            <p class="group-note">${words.topicsNote}</p>
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
    return words.topicNobody;
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
    { name: "name", label: words.fName, required: true, value: duty?.name, placeholder: words.fNamePlaceholder },
    {
      name: "means",
      label: words.fMeans,
      type: "textarea",
      value: duty?.means,
      hint: words.fMeansHint
    },
    {
      // Derived. This list was hand-written and missing "stake", so editing a
      // stakeholder duty found no option matching the stored value, showed the
      // first one, and saved THAT - rewriting the duty to apply to every
      // colleague while consuming evidence that can never be about a person.
      name: "subjectKind",
      label: words.fAppliesTo,
      type: "select",
      value: duty?.appliesTo ?? "person",
      options: SUBJECT_KINDS
    },
    {
      name: "cadenceDays",
      label: words.fCadence,
      type: "number",
      min: 1,
      // The number, not digits scraped back out of "30 days".
      value: duty?.cadenceDays ?? 14
    },
    {
      name: "guarded",
      label: words.fGuarded,
      type: "checkbox",
      value: Boolean(duty?.guarded),
      hint: words.fGuardedHint
    },
    {
      name: "keepWhileLeaving",
      label: words.fLeavers,
      type: "checkbox",
      value: duty ? duty.keepWhileLeaving !== false : true,
      hint: words.fLeaversHint
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
    title: words.relationsTitle,
    intro: words.relationsIntro,
    fields: RELATION_OPTIONS.map((r) => ({
      name: r.value,
      label: r.label,
      type: /** @type {const} */ ("checkbox")
    })),
    confirm: words.relationsConfirm
  });
  if (!picked) {
    return null;
  }
  return RELATION_OPTIONS.map((r) => r.value).filter((v) => picked[v]);
}

export const actions = {
  seed: async () => {
    if (await act("seed", {}, words.seededToast)) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  accept: async (d) => {
    if (await act("decideDuty", { id: d.id, status: "active" }, words.acceptedToast)) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  decline: async (d) => {
    if (await act("decideDuty", { id: d.id, status: "declined" }, words.declinedToast)) {
      refresh();
    }
  },

  addDuty: async () => {
    const values = await form({
      title: words.addTitle,
      intro: words.addIntro,
      fields: dutyFields(undefined),
      confirm: words.addConfirm
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
      words.addedToast
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
      title: words.editTitle(duty.name),
      fields: dutyFields(duty),
      confirm: words.editConfirm
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
      words.savedToast
    );
    if (ok) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  acceptTopic: async (d) => {
    if (await act("decideTopic", { id: d.id, status: "active" }, words.topicAcceptedToast)) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  declineTopic: async (d) => {
    if (await act("decideTopic", { id: d.id, status: "declined" }, words.declinedToast)) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  removeTopic: async (d) => {
    const sure = await ask({
      title: words.removeTopicTitle,
      body: words.removeTopicBody(d.name),
      confirm: words.removeConfirm,
      tone: "danger"
    });
    if (sure && (await act("removeRow", { collection: "topics", id: d.id }, words.removedToast))) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  removeDuty: async (d) => {
    const sure = await ask({
      title: words.removeDutyTitle(d.name),
      body: words.removeDutyBody,
      confirm: words.removeConfirm,
      tone: "danger"
    });
    if (sure && (await act("removeRow", { collection: "duties", id: d.id }, words.removedToast))) {
      refresh();
    }
  }
};
