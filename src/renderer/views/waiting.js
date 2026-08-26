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
      <span class="group-title">Waiting on someone</span>
      <span class="group-rule"></span>
      <span class="group-meta">${due.length}</span>
    </div>
    <p class="group-note">
      Not late on you. Chase it, or decide without it - both are answers, and
      leaving it open is the only one that is not.
    </p>
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

  const head = `<div class="block-title">Waiting on them</div>`;
  const add = `<button class="act" data-act="addWait" data-person="${esc(personId)}">I am waiting on something</button>`;

  if (rows.length === 0) {
    return `<div class="block">
      ${head}
      <div class="empty">Nothing outstanding from them.</div>
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
  // The chase count, always, even at zero. "Asked once, three weeks ago" and
  // "asked once and chased three times" are entirely different facts about a
  // working relationship, and only one of them is about being patient.
  const counts = `waiting ${esc(w.waitingFor)} &middot; chased ${w.chases}× &middot; last nudge ${esc(w.sinceNudge)}`;

  return `<div class="thread">
    <div class="thread-top">
      <span class="thread-aim">${esc(w.what)}${w.name ? ` <span class="src">${esc(w.name)}</span>` : ""}</span>
      <span class="line-right">${pill(w.severity)}</span>
    </div>
    <p class="card-why dim">${counts}</p>
    ${w.why ? `<p class="card-why dim">Blocking: ${esc(w.why)}</p>` : ""}
    ${w.asks ? `<p class="card-why warn-text">${esc(w.asks)}</p>` : ""}
    <div class="button-row">
      <button class="act" data-act="chase" data-id="${esc(w.id)}">I chased it</button>
      <button class="act" data-act="stopWaiting" data-id="${esc(w.id)}" data-what="${esc(w.what)}">Stop waiting</button>
    </div>
  </div>`;
}

export const actions = {
  /** @param {Record<string, string>} d */
  addWait: async (d) => {
    const values = await form({
      title: "Something you are waiting for",
      intro:
        "So a question you sent does not quietly rot. Nothing here is ever treated as late on you - " +
        "the point is that you remember to chase it, or decide without it.",
      fields: [
        {
          name: "what",
          label: "What you asked for",
          required: true,
          type: "textarea",
          placeholder: "Two questions about the feedback on the scheduling view"
        },
        {
          name: "why",
          label: "What it is blocking, optional",
          hint: "The half that decides whether to chase or route around it."
        },
        {
          name: "askedAt",
          label: "When you asked",
          type: "date",
          value: asDateInput(Date.now()),
          hint: "Backdate it. This usually gets written down the day you notice you are stuck, not the day you asked."
        },
        {
          name: "cadenceDays",
          label: "How long to wait before it is worth a nudge",
          type: "number",
          min: 1,
          value: 7,
          hint: "A week by default. Shorter nags about an ordinary human week."
        }
      ],
      confirm: "Log it"
    });
    if (!values) {
      return;
    }
    if (await act("waitFor", { person: d.person, ...values }, "Logged.")) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  chase: async (d) => {
    const values = await form({
      title: "I chased it",
      intro:
        "This resets the clock and adds to the count. The count is the useful part: three reminders " +
        "with nothing back is a fact about the relationship, and each one on its own felt reasonable.",
      fields: [
        { name: "note", label: "How, in a line, optional", placeholder: "Reminded him in the Discord thread" },
        { name: "at", label: "When", type: "date", value: asDateInput(Date.now()) }
      ],
      confirm: "Log it"
    });
    if (!values) {
      return;
    }
    if (await act("chase", { waiting: d.id, ...values }, "Logged.")) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  stopWaiting: async (d) => {
    const values = await form({
      title: "Stop waiting",
      intro: "Both endings are ordinary. Deciding without the answer is a legitimate outcome, not a failure.",
      fields: [
        { name: "as", label: "How it ended", type: "select", options: WAIT_ENDING_OPTIONS, value: "answered" },
        {
          name: "why",
          label: "What came back, or what you did instead",
          type: "textarea",
          hint:
            "Worth keeping for the dropped ones especially. It is what you will want when the answer " +
            "finally arrives and contradicts what you already shipped."
        }
      ],
      confirm: "Close it"
    });
    if (!values) {
      return;
    }
    if (await act("stopWaiting", { id: d.id, ...values }, "Closed.")) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  unlogWait: async (d) => {
    const sure = await ask({
      title: "Take this back?",
      body: `"${d.what}" stops being tracked, along with every chase logged against it.`,
      confirm: "Take it back",
      tone: "danger"
    });
    if (sure && (await act("removeRow", { collection: "waiting", id: d.id }, "Taken back."))) {
      refresh();
    }
  }
};
