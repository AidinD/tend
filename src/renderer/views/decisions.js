/**
 * The decision log.
 *
 * Three things on one page, in the order they need you: proposals waiting to be
 * recorded, decisions asking to be looked at again, and then the log itself.
 *
 * The revisit date is the reason this is a view and not a document. A log you
 * have to remember to read is an archive; one that comes back to you is a tool.
 */

import { act, ask, esc, form, tend } from "../ui.js";
import { refresh } from "../app.js";
import { T } from "../text.js";

const t = T.decisions;

export async function render() {
  const [all, roster] = await Promise.all([tend.invoke("decisions"), tend.invoke("people")]);

  if (all?.error) {
    return `<div class="card sev-critical"><div class="card-top">
      <h2 class="card-title">${t.readFailedTitle}</h2></div>
      <p class="card-why">${esc(all.error)}</p></div>`;
  }

  const list = Array.isArray(all) ? all : [];
  const proposed = list.filter((d) => d.status === "proposed");
  const due = list.filter((d) => d.revisitDue);
  const logged = list.filter((d) => d.status !== "proposed" && !d.revisitDue);

  const head = `
    <div class="view-head">
      <h1 class="view-title">${t.title}</h1>
      <p class="view-sub">${t.sub}</p>
      <div class="card-foot">
        <span class="src">${t.codeNote}</span>
        <button class="act" data-act="add">${t.addButton}</button>
      </div>
    </div>`;

  if (list.length === 0) {
    return `${head}<div class="empty">${t.empty}</div>`;
  }

  return `${head}
    ${block(t.proposedBand, proposed, proposal, t.proposedNote)}
    ${block(t.revisitBand, due, revisit, t.revisitNote)}
    ${block(t.loggedBand, logged, entry)}`;
}

/**
 * @param {string} title
 * @param {any[]} items
 * @param {(d: any) => string} draw
 * @param {string} [note]
 */
function block(title, items, draw, note) {
  if (items.length === 0) {
    return "";
  }
  return `
    <div class="ledger-band">
      <h2 class="ledger-band-title">${esc(title)}</h2>
      ${note ? `<p class="ledger-band-note">${esc(note)}</p>` : ""}
    </div>
    ${items.map(draw).join("")}`;
}

/** @param {any} d */
function proposal(d) {
  return `
    <div class="card sev-nudge">
      <div class="card-top">
        <h2 class="card-title">${esc(d.what)}</h2>
        <span class="badge">${t.proposedBadge}</span>
      </div>
      ${body(d)}
      <div class="card-foot">
        <span class="src">${d.source ? t.readIn(esc(d.source)) : t.noSource}${d.proposedBy ? t.proposedBy(esc(d.proposedBy)) : ""}</span>
        <button class="act" data-act="record" data-id="${esc(d.id)}">${t.recordIt}</button>
        <button class="act" data-act="edit" data-id="${esc(d.id)}">${t.editFirst}</button>
        <button class="act" data-act="drop" data-id="${esc(d.id)}">${t.notADecision}</button>
      </div>
    </div>`;
}

/** @param {any} d */
function revisit(d) {
  return `
    <div class="card sev-critical">
      <div class="card-top">
        <h2 class="card-title">${esc(d.what)}</h2>
        <span class="badge">${t.dueBadge(esc(d.revisitOverdueBy ?? t.dueNow))}</span>
      </div>
      ${body(d)}
      <div class="card-foot">
        <span class="src">${t.revisitSrc}</span>
        <button class="act" data-act="holds" data-id="${esc(d.id)}">${t.stillHolds}</button>
        <button class="act" data-act="edit" data-id="${esc(d.id)}">${t.changeIt}</button>
        <button class="act" data-act="reverse" data-id="${esc(d.id)}">${t.reverseIt}</button>
      </div>
    </div>`;
}

/** @param {any} d */
function entry(d) {
  return `
    <div class="card">
      <div class="card-top">
        <h2 class="card-title">${esc(d.what)}</h2>
        <span class="badge">${esc(d.status)}</span>
      </div>
      ${body(d)}
      <div class="card-foot">
        <span class="src">
          ${esc(new Date(d.decidedAt).toLocaleDateString("sv-SE"))}
          ${d.revisitAt ? t.backOn(esc(new Date(d.revisitAt).toLocaleDateString("sv-SE"))) : t.noRevisit}
        </span>
        <button class="act" data-act="edit" data-id="${esc(d.id)}">${t.edit}</button>
      </div>
    </div>`;
}

/**
 * The fields, and what is missing.
 *
 * `missing` is said out loud on every card rather than only when recording,
 * because the field people skip is `because` and it is the only one that still
 * matters in a year. A record that cannot be read by somebody who was not there
 * is not worth keeping.
 *
 * @param {any} d
 */
function body(d) {
  return `
    ${d.because ? `<p class="card-why">${esc(d.because)}</p>` : ""}
    ${
      /*
       * The colon and the space are IN the text, not added by the stylesheet.
       *
       * These lines are selectable, and a label placed with `margin-right`
       * copies out as "ConsultedTestperson" - the styling would be doing work
       * the words then cannot do on their own. It is also what a check here
       * reads, and a check that has to learn about a span to find a name is
       * measuring the markup rather than the behaviour.
       */ ""
    }
    ${d.rejected ? `<p class="card-why dim"><span class="inline-label">${t.rejectedLabel}</span> ${esc(d.rejected)}</p>` : ""}
    ${d.consulted.length > 0 ? `<p class="card-why dim"><span class="inline-label">${t.consultedLabel}</span> ${esc(d.consulted.join(", "))}</p>` : ""}
    ${d.missing.length > 0 ? `<p class="card-why warn-text">${t.missing(esc(d.missing.join(" Missing ")))}</p>` : ""}`;
}

/**
 * @param {any[]} roster
 * @returns {import("../ui.js").Field[]}
 */
const fields = (roster) => [
  { name: "what", label: t.fWhat, type: "text", required: true },
  // The ledger has always modelled a proposal and the window never offered one,
  // so the only way to record something not yet agreed was to call it decided.
  {
    name: "status",
    label: t.fStatus,
    type: "select",
    options: [
      { value: "recorded", label: t.fStatusRecorded },
      { value: "proposed", label: t.fStatusProposed }
    ],
    value: "recorded",
    hint: t.fStatusHint
  },
  { name: "because", label: t.fBecause, type: "textarea" },
  { name: "rejected", label: t.fRejected, type: "textarea" },
  {
    name: "consulted",
    label: t.fConsulted,
    /*
     * Picked from the roster, not typed.
     *
     * It was a comma-separated text box with the valid names listed in the hint,
     * and it cost a whole filled-in decision: the service refuses a name it does
     * not know, and at the time the dialog closed on that refusal and took four
     * fields of prose with it. `attempt` fixed the second half of that failure -
     * the form stays open now - but the first half was always the field's fault.
     * A name that cannot be mistyped cannot be rejected.
     *
     * It also removes the hint that had to list the roster inside the label,
     * which was a derived list rendered as prose - the shape this project keeps
     * being bitten by.
     */
    type: "multiselect",
    options: (roster ?? []).map((/** @type {any} */ p) => ({
      value: String(p.name),
      label: String(p.name)
    })),
    value: [],
    // Only people Tend already knows, and the list is now the enforcement rather
    // than a warning. Adding somebody to the roster just to name them here would
    // be worse than leaving it empty: everyone on the roster is counted by the
    // attention signals, so a dozen colleagues you have no duties toward turns
    // "I have not spoken to 11 of 13 people this month" into noise.
    hint: (roster ?? []).length > 0 ? t.fConsultedHint : t.fConsultedHintEmpty
  },
  {
    name: "revisitDays",
    label: t.fRevisit,
    type: "number",
    value: "90",
    showIf: { field: "status", equals: "recorded" },
    hint: t.fRevisitHint
  }
];

export const actions = {
  add: async () => {
    const roster = await tend.invoke("people");
    // Written through `attempt` so a rejection keeps the dialog open with the
    // reasoning still in it. This form has four fields of prose and one that can
    // be rejected by the service, which is the worst possible combination for
    // closing on failure.
    const values = await form({
      title: t.addTitle,
      intro: t.addIntro,
      fields: fields(roster),
      confirm: t.addConfirm,
      attempt: async (v) => {
        const result = await tend.invoke("logDecision", {
          what: v.what,
          because: v.because,
          rejected: v.rejected,
          status: v.status || "recorded",
          consulted: Array.isArray(v.consulted) ? v.consulted : [],
          revisitDays: Number(v.revisitDays) || 90
        });
        return result?.error ? String(result.error) : null;
      }
    });
    if (values) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  record: async (d) => {
    await act("decideDecision", { id: d.id, fields: { status: "recorded" } });
    refresh();
  },

  /** @param {Record<string, string>} d */
  holds: async (d) => {
    await act("stillHolds", { id: d.id, days: 90 });
    refresh();
  },

  /** @param {Record<string, string>} d */
  reverse: async (d) => {
    const sure = await ask({
      title: t.reverseTitle,
      body: t.reverseBody,
      confirm: t.reverseConfirm
    });
    if (!sure) {
      return;
    }
    await act("decideDecision", { id: d.id, fields: { status: "reversed" } });
    refresh();
  },

  /** @param {Record<string, string>} d */
  drop: async (d) => {
    const sure = await ask({
      title: t.dropTitle,
      body: t.dropBody,
      confirm: t.dropConfirm
    });
    if (!sure) {
      return;
    }
    await act("removeRow", { collection: "decisions", id: d.id });
    refresh();
  },

  /** @param {Record<string, string>} d */
  edit: async (d) => {
    const [all, roster] = await Promise.all([tend.invoke("decisions"), tend.invoke("people")]);
    const current = (Array.isArray(all) ? all : []).find((x) => x.id === d.id);
    if (!current) {
      return;
    }
    const values = await form({
      title: t.editTitle,
      fields: fields(roster).map((f) => ({
        ...f,
        value:
          f.name === "consulted"
            ? // The array, so the ticks come back ticked. Joining it into a string
              // here silently emptied the field on every edit once the control
              // stopped being a text box.
              (current.consulted ?? [])
            : f.name === "revisitDays"
              ? "90"
              : String(current[f.name] ?? "")
      })),
      confirm: t.editConfirm
    });
    if (!values) {
      return;
    }
    await act("decideDecision", {
      id: d.id,
      fields: {
        what: values.what,
        because: values.because,
        rejected: values.rejected,
        consulted: Array.isArray(values.consulted) ? values.consulted : [],
        revisitDays: Number(values.revisitDays) || 90
      }
    });
    refresh();
  }
};
