/**
 * What you are waiting for from somebody else, in the window.
 *
 * On the daily page and on the person, and the placement is the argument. This
 * is the one thing in the tool that belongs on Now without being about a duty:
 * it is actionable this afternoon (send the nudge, or decide without the answer)
 * and it is short-lived, which is exactly what that page is for.
 *
 * What it must never do is look like an alarm. The delay is not his, and a page
 * that shouted about somebody else's inbox would teach him to skim the one page
 * that has to stay trustworthy. So it renders below what needs him, in its own
 * group, and the severity never reaches critical.
 */

import { act, ask, asDateInput, esc, form, pill, tend, WAIT_ENDING_OPTIONS } from "../ui.js";
import { refresh } from "../app.js";
import { T } from "../text.js";

const t = T.waiting;

/**
 * The group for the daily page, or nothing at all.
 *
 * @param {any[]} due
 * @returns {string}
 */
export function waitingGroup(due) {
  if (!Array.isArray(due) || due.length === 0) {
    return "";
  }
  return `<div class="group">
    <div class="group-head">
      <span class="group-title">${t.groupTitle}</span>
      <span class="group-rule"></span>
      <span class="group-meta">${due.length}</span>
    </div>
    <p class="group-note">${t.groupNote}</p>
    ${due.map(row).join("")}
  </div>`;
}

/**
 * The block for one person's page.
 *
 * @param {string} personId
 * @returns {Promise<string>}
 */
export async function waitingBlock(personId) {
  const open = await tend.invoke("waits", { person: personId });
  const rows = Array.isArray(open) ? open : [];

  const head = `<div class="block-title">${t.blockTitle}</div>`;
  const add = `<button class="act" data-act="addWait" data-person="${esc(personId)}">${t.addButton}</button>`;

  if (rows.length === 0) {
    return `<div class="block">
      ${head}
      <div class="empty">${t.none}</div>
      <div class="button-row">${add}</div>
    </div>`;
  }

  return `<div class="block">
    ${head}
    ${rows.map(row).join("")}
    <div class="button-row">${add}</div>
  </div>`;
}

/** @param {any} w */
function row(w) {
  const counts = t.counts(esc(w.waitingFor), w.chases, esc(w.sinceNudge));

  return `<div class="thread">
    <div class="thread-top">
      <span class="thread-aim">${esc(w.what)}${w.name ? ` <span class="src">${esc(w.name)}</span>` : ""}</span>
      <span class="line-right">${pill(w.severity)}</span>
    </div>
    <p class="card-why dim">${counts}</p>
    ${w.why ? `<p class="card-why dim">${t.blocking(esc(w.why))}</p>` : ""}
    ${w.asks ? `<p class="card-why warn-text">${esc(w.asks)}</p>` : ""}
    <div class="button-row">
      <button class="act" data-act="chase" data-id="${esc(w.id)}">${t.chaseButton}</button>
      <button class="act" data-act="stopWaiting" data-id="${esc(w.id)}" data-what="${esc(w.what)}">${t.stopButton}</button>
    </div>
  </div>`;
}

export const actions = {
  /** @param {Record<string, string>} d */
  addWait: async (d) => {
    const values = await form({
      title: t.addTitle,
      intro: t.addIntro,
      fields: [
        {
          name: "what",
          label: t.addWhatLabel,
          required: true,
          type: "textarea",
          placeholder: t.addWhatPlaceholder
        },
        {
          name: "why",
          label: t.addWhyLabel,
          hint: t.addWhyHint
        },
        {
          name: "askedAt",
          label: t.addAskedLabel,
          type: "date",
          value: asDateInput(Date.now()),
          hint: t.addAskedHint
        },
        {
          name: "cadenceDays",
          label: t.addCadenceLabel,
          type: "number",
          min: 1,
          value: 7,
          hint: t.addCadenceHint
        }
      ],
      confirm: t.addConfirm
    });
    if (!values) {
      return;
    }
    if (await act("waitFor", { person: d.person, ...values }, t.addToast)) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  chase: async (d) => {
    const values = await form({
      title: t.chaseTitle,
      intro: t.chaseIntro,
      fields: [
        { name: "note", label: t.chaseNoteLabel, placeholder: t.chaseNotePlaceholder },
        { name: "at", label: t.chaseWhenLabel, type: "date", value: asDateInput(Date.now()) }
      ],
      confirm: t.chaseConfirm
    });
    if (!values) {
      return;
    }
    if (await act("chase", { waiting: d.id, ...values }, t.chaseToast)) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  stopWaiting: async (d) => {
    const values = await form({
      title: t.stopTitle,
      intro: t.stopIntro,
      fields: [
        { name: "as", label: t.stopAsLabel, type: "select", options: WAIT_ENDING_OPTIONS, value: "answered" },
        {
          name: "why",
          label: t.stopWhyLabel,
          type: "textarea",
          hint: t.stopWhyHint
        }
      ],
      confirm: t.stopConfirm
    });
    if (!values) {
      return;
    }
    if (await act("stopWaiting", { id: d.id, ...values }, t.stopToast)) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  unlogWait: async (d) => {
    const sure = await ask({
      title: t.unlogTitle,
      body: t.unlogBody(d.what),
      confirm: t.unlogConfirm,
      tone: "danger"
    });
    if (sure && (await act("removeRow", { collection: "waiting", id: d.id }, t.unlogToast))) {
      refresh();
    }
  }
};
