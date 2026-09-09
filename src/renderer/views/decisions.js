/**
 * The decision log.
 *
 * Three things on one page, in the order they need you: proposals waiting to be
 * recorded, decisions asking to be looked at again, and then the log itself.
 *
 * The revisit date is the reason this is a view and not a document. A log you
 * have to remember to read is an archive; one that comes back to you is a tool.
 */

import { act, ask, asDateInput, esc, form, tend, toast } from "../ui.js";
import { refresh } from "../app.js";
import { T } from "../text.js";

const words = T.decisions;

export async function render() {
  const [all, roster] = await Promise.all([tend.invoke("decisions"), tend.invoke("people")]);

  if (all?.error) {
    return `<div class="card sev-critical"><div class="card-top">
      <h2 class="card-title">${words.readFailedTitle}</h2></div>
      <p class="card-why">${esc(all.error)}</p></div>`;
  }

  const list = Array.isArray(all) ? all : [];
  const proposed = list.filter((d) => d.status === "proposed");
  const due = list.filter((d) => d.revisitDue);
  const logged = list.filter((d) => d.status !== "proposed" && !d.revisitDue);

  const head = `
    <div class="view-head">
      <h1 class="view-title">${words.title}</h1>
      <p class="view-sub">${words.sub}</p>
      <div class="card-foot">
        <span class="src">${words.codeNote}</span>
        <button class="act" data-act="add">${words.addButton}</button>
      </div>
    </div>`;

  if (list.length === 0) {
    return `${head}<div class="empty">${words.empty}</div>`;
  }

  return `${head}
    ${block(words.proposedBand, proposed, proposal, words.proposedNote)}
    ${block(words.revisitBand, due, revisit, words.revisitNote)}
    ${block(words.loggedBand, logged, entry)}`;
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
        <span class="badge">${words.proposedBadge}</span>
      </div>
      ${body(d)}
      <div class="card-foot">
        <span class="src">${d.source ? words.readIn(esc(d.source)) : words.noSource}${d.proposedBy ? words.proposedBy(esc(d.proposedBy)) : ""}</span>
        <button class="act" data-act="record" data-id="${esc(d.id)}">${words.recordIt}</button>
        <button class="act" data-act="edit" data-id="${esc(d.id)}">${words.editFirst}</button>
        <button class="act" data-act="drop" data-id="${esc(d.id)}">${words.notADecision}</button>
      </div>
    </div>`;
}

/** @param {any} d */
function revisit(d) {
  return `
    <div class="card sev-critical">
      <div class="card-top">
        <h2 class="card-title">${esc(d.what)}</h2>
        <span class="badge">${words.dueBadge(esc(d.revisitOverdueBy ?? words.dueNow))}</span>
      </div>
      ${body(d)}
      ${standing(d)}
      <div class="card-foot">
        <span class="src">${words.revisitSrc}</span>
        <button class="act" data-act="holds" data-id="${esc(d.id)}">${words.stillHolds}</button>
        <button class="act" data-act="mark" data-id="${esc(d.id)}">${words.markKept}</button>
        <button class="act" data-act="markBroken" data-id="${esc(d.id)}">${words.markBroken}</button>
        <button class="act" data-act="edit" data-id="${esc(d.id)}">${words.changeIt}</button>
        <button class="act" data-act="reverse" data-id="${esc(d.id)}">${words.reverseIt}</button>
      </div>
    </div>`;
}

/** @param {any} d */
function entry(d) {
  /*
   * Whether it was followed is offered on any decision that is standing, not
   * only on one whose revisit has come due.
   *
   * The occasion to note comes when it happens, which is months before the
   * revisit - that is the whole point of collecting dated marks rather than
   * remembering in December. Putting the buttons only on the overdue card would
   * mean the record could only be written at the one moment it is already too
   * late to be useful.
   *
   * Not offered on a reversed decision: it is history and has stopped asking
   * anything, so an occasion of following it is not a fact about anything.
   */
  const standing_ = d.status === "recorded" || d.status === "revisited";

  return `
    <div class="card">
      <div class="card-top">
        <h2 class="card-title">${esc(d.what)}</h2>
        <span class="badge">${esc(d.status)}</span>
      </div>
      ${body(d)}
      ${standing(d)}
      <div class="card-foot">
        <span class="src">
          ${esc(new Date(d.decidedAt).toLocaleDateString("sv-SE"))}
          ${d.revisitAt ? words.backOn(esc(new Date(d.revisitAt).toLocaleDateString("sv-SE"))) : words.noRevisit}
        </span>
        ${
          standing_
            ? `<button class="act" data-act="mark" data-id="${esc(d.id)}">${words.markKept}</button>
               <button class="act" data-act="markBroken" data-id="${esc(d.id)}">${words.markBroken}</button>`
            : ""
        }
        <button class="act" data-act="edit" data-id="${esc(d.id)}">${words.edit}</button>
      </div>
    </div>`;
}

/**
 * How the decision has actually gone, and the question that follows from it.
 *
 * Two counts, printed as two counts. A decision kept nine times and broken once
 * is a different object from one broken two out of two, and adding them would
 * lose exactly the difference worth having - the same reason a growth thread
 * keeps "discussed" and "actually seen" apart.
 *
 * The prompt underneath comes from the shape of those counts rather than from a
 * date. "Does this still hold?" in December is a memory exercise; "it has never
 * been followed since it was made" is a question somebody can answer.
 *
 * Silent when nothing has been noted, rather than printing a pair of zeroes on
 * every card. A decision nobody has had occasion to follow yet is the ordinary
 * case, and a counter of nothing reads as a failure to record rather than as an
 * absence of occasions.
 *
 * @param {any} d
 */
function standing(d) {
  const marks = Array.isArray(d.marks) ? d.marks : [];
  if (marks.length === 0) {
    return "";
  }

  const ask = {
    "never-followed": words.markAskNeverFollowed,
    "mostly-broken": words.markAskMostlyBroken,
    "slipped-once": words.markAskSlippedOnce,
    holding: words.markAskHolding
  }[String(d.shape)];

  return `<div class="marks">
    <p class="card-why">${words.markCounts(Number(d.standing.kept), Number(d.standing.broken))}</p>
    ${ask ? `<p class="card-why ${d.standing.everBroken ? "warn-text" : "dim"}">${ask}</p>` : ""}
    ${marks
      .map(
        (/** @type {any} */ m) => `<div class="line ${m.held ? "sev-ok" : "sev-warn"}">
          <span class="line-when">${esc(
            new Date(Number(m.at)).toISOString().slice(0, 10)
          )}</span>
          <span class="line-text">${esc(m.held ? words.markHeldYes : words.markHeldNo)}${
            m.why ? `<span class="src">${esc(m.why)}</span>` : ""
          }${
            /*
             * The observation it points at, read from the row that owns it. Not
             * a copy: that sentence is a statement about a person and lives on
             * their page, and restating it here is the duplication the
             * replace-an-observation work exists to remove.
             */
            m.observation
              ? `<span class="src">${words.markPointsAt} ${esc(
                  m.observation.person ? `${m.observation.person}: ` : ""
                )}${esc(words.whyHandle(m.observation.text))}</span>`
              : ""
          }</span>
          <span class="line-right">
            <button class="act tiny danger" data-act="unmark" data-id="${esc(m.id)}">${
              words.markRemove
            }</button>
          </span>
        </div>`
      )
      .join("")}
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
 * ## The reasoning sits behind the line that names it
 *
 * Every card used to open with all of it: eight or ten lines of prose, again
 * with the rejected alternative under it, on every card on the page. The
 * decision itself - the one thing somebody scanning is looking for - was then
 * the smallest thing on screen, and the page read as a wall of grey.
 *
 * Nothing is summarised and nothing is dropped. The first line of the reasoning
 * stands as the handle and the rest is one click away, which is the shape the
 * observations arrived at for exactly this problem on a person's page.
 *
 * `missing` stays outside the fold. It is the one line that asks for something,
 * and a warning behind a click is a warning nobody reads.
 *
 * The colon and the space in the labels below are IN the text, not added by the
 * stylesheet. These lines are selectable, and a label placed with `margin-right`
 * copies out as "ConsultedTestperson" - the styling would be doing work the
 * words then cannot do on their own. It is also what a check here reads, and a
 * check that has to learn about a span to find a name is measuring the markup
 * rather than the behaviour.
 *
 * @param {any} d
 */
function body(d) {
  const reasoning = [
    d.because ? `<p class="card-why">${esc(d.because)}</p>` : "",
    d.rejected
      ? `<p class="card-why dim"><span class="inline-label">${words.rejectedLabel}</span> ${esc(d.rejected)}</p>`
      : "",
    d.consulted.length > 0
      ? `<p class="card-why dim"><span class="inline-label">${words.consultedLabel}</span> ${esc(d.consulted.join(", "))}</p>`
      : ""
  ]
    .filter((part) => part !== "")
    .join("");

  const missing =
    d.missing.length > 0
      ? `<p class="card-why warn-text">${words.missing(esc(d.missing.join(words.missingJoin)))}</p>`
      : "";

  if (reasoning === "") {
    return missing;
  }

  return `
    <details class="why-fold">
      <summary class="why-summary">
        ${
          /*
           * Two labels, one for each state. Closed, the handle IS the first line
           * of the paragraph underneath, which is what makes the fold worth
           * opening. Open, that line would be read twice in a row - so it gives
           * way to the plain word for what is now on screen, and the row stays a
           * control with something in it rather than a bare triangle.
           */ ""
        }
        <span class="why-handle">${esc(
          words.whyHandle(String(d.because ?? "").trim() === "" ? words.whyFold : d.because)
        )}</span>
        <span class="why-label">${esc(words.whyFold)}</span>
      </summary>
      <div class="why-body">${reasoning}</div>
    </details>
    ${missing}`;
}

/**
 * @param {any[]} roster
 * @returns {import("../ui.js").Field[]}
 */
const fields = (roster) => [
  { name: "what", label: words.fWhat, type: "text", required: true },
  // The ledger has always modelled a proposal and the window never offered one,
  // so the only way to record something not yet agreed was to call it decided.
  {
    name: "status",
    label: words.fStatus,
    type: "select",
    options: [
      { value: "recorded", label: words.fStatusRecorded },
      { value: "proposed", label: words.fStatusProposed }
    ],
    value: "recorded",
    hint: words.fStatusHint
  },
  { name: "because", label: words.fBecause, type: "textarea" },
  { name: "rejected", label: words.fRejected, type: "textarea" },
  {
    name: "consulted",
    label: words.fConsulted,
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
    hint: (roster ?? []).length > 0 ? words.fConsultedHint : words.fConsultedHintEmpty
  },
  {
    name: "revisitDays",
    label: words.fRevisit,
    type: "number",
    value: "90",
    showIf: { field: "status", equals: "recorded" },
    hint: words.fRevisitHint
  }
];

/**
 * Ask for the one occasion, and record it.
 *
 * The observation picker is the point of the SPÄRR on this card: "somebody broke
 * this" is already a row on that person's page, and the mark points at it rather
 * than restating it. Offering the existing rows is what makes pointing the easy
 * path and writing it twice the awkward one - a free text field alone would have
 * had the sentence copied in within a week.
 *
 * Only recent observations are offered. The list is every observation in the
 * store, and a select of four hundred is a select nobody uses.
 *
 * @param {string} decision
 * @param {boolean} held
 */
async function markOccasion(decision, held) {
  const seen = /** @type {any} */ (await tend.invoke("observations", {}));
  const recent = (Array.isArray(seen?.areas) ? seen.areas : [])
    .flatMap((/** @type {any} */ a) => a.items)
    .sort((/** @type {any} */ a, /** @type {any} */ b) => Number(b.at) - Number(a.at))
    .slice(0, 20);

  const values = await form({
    title: words.markTitle,
    intro: words.markIntro,
    fields: [
      {
        name: "held",
        label: words.markHeldLabel,
        type: "select",
        value: held ? "yes" : "no",
        options: [
          { value: "yes", label: words.markHeldYes },
          { value: "no", label: words.markHeldNo }
        ]
      },
      { name: "at", label: words.markWhenLabel, type: "date", value: asDateInput(Date.now()) },
      { name: "why", label: words.markWhyLabel, hint: words.markWhyHint },
      {
        name: "observation",
        label: words.markObservationLabel,
        type: "select",
        value: "",
        options: [
          { value: "", label: words.markObservationNone },
          ...recent.map((/** @type {any} */ o) => ({
            value: String(o.id),
            label: `${o.person ? `${o.person}: ` : ""}${words.whyHandle(String(o.text))}`
          }))
        ]
      }
    ],
    confirm: words.markConfirm,
    attempt: async (v) => {
      const out = /** @type {any} */ (
        await tend.invoke("markDecision", {
          decision,
          held: v.held === "yes",
          why: v.why,
          observation: v.observation,
          at: v.at
        })
      );
      return out?.error ? String(out.error) : null;
    }
  });

  if (values) {
    toast(words.markToast);
    refresh();
  }
}

export const actions = {
  add: async () => {
    const roster = await tend.invoke("people");
    // Written through `attempt` so a rejection keeps the dialog open with the
    // reasoning still in it. This form has four fields of prose and one that can
    // be rejected by the service, which is the worst possible combination for
    // closing on failure.
    const values = await form({
      title: words.addTitle,
      intro: words.addIntro,
      fields: fields(roster),
      confirm: words.addConfirm,
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

  /**
   * Note one occasion on which the decision was followed.
   *
   * The two kinds go through one dialog with the kind preset, rather than two
   * dialogs, because they are one act with a flag - and the form is where the
   * date and the pointer are asked for either way.
   *
   * @param {Record<string, string>} d
   */
  mark: async (d) => markOccasion(d.id, true),

  /** @param {Record<string, string>} d */
  markBroken: async (d) => markOccasion(d.id, false),

  /** @param {Record<string, string>} d */
  unmark: async (d) => {
    if (await act("unmarkDecision", { id: d.id }, words.markRemovedToast)) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  reverse: async (d) => {
    const sure = await ask({
      title: words.reverseTitle,
      body: words.reverseBody,
      confirm: words.reverseConfirm
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
      title: words.dropTitle,
      body: words.dropBody,
      confirm: words.dropConfirm
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
      title: words.editTitle,
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
      confirm: words.editConfirm
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
