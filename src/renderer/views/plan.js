/**
 * A plan on somebody's page.
 *
 * The second shape beside a direction, and the wording does not soften it. A
 * direction that quietly reads as a performance plan is the worst version of
 * this conversation - the person believes they are being developed while a
 * decision is being made about them - so this block says "below the bar", "a
 * date with a consequence" and shows the copy they will be handed.
 *
 * Two things it does that no other block here does.
 *
 * It shows what is still missing as a state rather than as errors. A plan with
 * unanswered fields is not an invalid form, it is a plan that is not ready to
 * start, and most plans live there for a week or two while he works out what he
 * thinks. Calling that a validation failure would make the app refuse the
 * thinking.
 *
 * And it can show the person's copy, which is a named five-line subset. That
 * split is the whole point: a goal like "document that we tried" is a
 * legitimate reason to run a plan and must never appear in what is handed over.
 */

import { act, ask, esc, form, tend } from "../ui.js";
import { refresh } from "../app.js";
import { T } from "../text.js";

const words = T.plan;

/**
 * @param {string} personId
 */
export async function planBlock(personId) {
  const plan = await tend.invoke("planFor", { person: personId });

  const head = `<div class="block-title">${words.blockTitle}</div>`;

  if (plan === null || plan === undefined || plan.error) {
    return `<div class="block">
      ${head}
      <p class="card-why dim">${words.empty}</p>
      <button class="act" data-act="openPlan" data-person="${esc(personId)}">${words.openButton}</button>
    </div>`;
  }

  const missing = Array.isArray(plan.missing) ? plan.missing : [];
  const pill =
    plan.status === "running"
      ? `<span class="pill plain">${words.runningPill}</span>`
      : `<span class="pill warn">${words.draftPill}</span>`;

  /*
   * The premise warning above the fields, not under them. If they do not know,
   * the next step is saying it rather than reading the rest of the plan - and a
   * warning below nine fields is a warning after the decision.
   */
  const premise =
    plan.premiseUntested === true
      ? `<p class="card-why sev-warn-text">${words.premiseWarning}</p>`
      : "";

  const lines = [
    [words.fGap, plan.gap],
    [words.fSaidOutLoud, plan.saidOutLoud],
    [words.fDelivery, plan.delivery],
    [words.fMeasure, plan.measure],
    [words.fBaseline, plan.baseline],
    [words.fDue, plan.dueAt ? new Date(plan.dueAt).toLocaleDateString("sv-SE") : ""],
    [words.fIfNotMet, plan.ifNotMet],
    [words.fHr, plan.hr]
  ]
    .filter(([, value]) => String(value ?? "") !== "")
    .map(
      ([label, value]) => `<div class="line">
        <span class="line-when">${esc(label)}</span>
        <span class="line-text">${esc(value)}</span>
      </div>`
    )
    .join("");

  return `<div class="block">
    ${head}
    <div class="card-top">
      ${pill}
      ${missing.length > 0 ? `<span class="src">${words.stillNeeds(missing.length)}</span>` : ""}
    </div>
    ${premise}
    ${lines}
    <div class="card-foot">
      <button class="act" data-act="editPlan" data-id="${esc(plan.id)}" data-person="${esc(personId)}">${words.editTitle}</button>
      <button class="act" data-act="theirCopy" data-id="${esc(plan.id)}" data-person="${esc(personId)}">${words.copyButton}</button>
      <button class="act" data-act="endPlan" data-id="${esc(plan.id)}">${words.endButton}</button>
    </div>
  </div>`;
}

/**
 * Every field, as a form.
 *
 * One dialog rather than a wizard. He is thinking about one person and one
 * problem, and a nine-step flow would make him re-enter that context nine
 * times - the same reasoning as filing a whole meeting's commitments at once.
 *
 * @param {any} plan Existing values, or null for a new one.
 * @param {{ value: string, label: string }[]} directions Their live directions.
 */
function fields(plan, directions) {
  const value = (/** @type {string} */ key) => String(plan?.[key] ?? "");
  return [
    { name: "gap", label: words.fGap, hint: words.fGapHint, type: /** @type {const} */ ("textarea"), value: value("gap") },
    {
      name: "theyKnow",
      label: words.fTheyKnow,
      hint: words.fTheyKnowHint,
      type: /** @type {const} */ ("select"),
      value: plan?.theyKnow === true ? "yes" : plan?.theyKnow === false ? "no" : "",
      options: [
        { value: "", label: "" },
        { value: "yes", label: words.fTheyKnowYes },
        { value: "no", label: words.fTheyKnowNo }
      ]
    },
    {
      name: "saidOutLoud",
      label: words.fSaidOutLoud,
      hint: words.fSaidOutLoudHint,
      type: /** @type {const} */ ("textarea"),
      value: value("saidOutLoud")
    },
    { name: "goal", label: words.fGoal, hint: words.fGoalHint, value: value("goal") },
    { name: "delivery", label: words.fDelivery, hint: words.fDeliveryHint, value: value("delivery") },
    { name: "measure", label: words.fMeasure, value: value("measure") },
    { name: "baseline", label: words.fBaseline, hint: words.fBaselineHint, value: value("baseline") },
    {
      name: "dueAt",
      label: words.fDue,
      hint: words.fDueHint,
      type: /** @type {const} */ ("date"),
      value: plan?.dueAt ? new Date(plan.dueAt).toISOString().slice(0, 10) : ""
    },
    {
      name: "ifNotMet",
      label: words.fIfNotMet,
      hint: words.fIfNotMetHint,
      type: /** @type {const} */ ("textarea"),
      value: value("ifNotMet")
    },
    { name: "hr", label: words.fHr, hint: words.fHrHint, value: value("hr") },
    /*
     * Last, and only when there is something to link to. Offering an empty
     * dropdown would be a question about a thing that does not exist, and the
     * form already asks nine.
     */
    ...(directions.length === 0
      ? []
      : [
          {
            name: "growth",
            label: words.fGrowth,
            hint: words.fGrowthHint,
            type: /** @type {const} */ ("select"),
            value: String(plan?.growth ?? ""),
            options: [{ value: "", label: "" }, ...directions]
          }
        ])
  ];
}

/**
 * The answers, in the shape the service takes.
 *
 * `theyKnow` comes back as a string from a select and has to become a boolean
 * or nothing at all - "no" is an answer and an important one, so it must not
 * collapse into the same value as an unanswered field.
 *
 * @param {Record<string, any>} values
 */
function answers(values) {
  /** @type {Record<string, any>} */
  const out = { ...values };
  delete out.theyKnow;
  if (values.theyKnow === "yes") {
    out.theyKnow = true;
  }
  if (values.theyKnow === "no") {
    out.theyKnow = false;
  }
  return out;
}

/**
 * Their live directions, as options.
 *
 * Empty on a failed read as well as on a person with none. Both mean "nothing
 * to link to" and neither has an action attached, so a third state would be a
 * branch nothing exercises.
 *
 * @param {string} personId
 */
async function directionsFor(personId) {
  const result = await tend.invoke("growth", { person: personId });
  if (result?.error || !Array.isArray(result?.threads)) {
    return [];
  }
  return result.threads
    .filter((/** @type {any} */ th) => th.live !== false)
    .map((/** @type {any} */ th) => ({ value: String(th.id), label: String(th.aim ?? th.id) }));
}

export const actions = {
  /** @param {Record<string, string>} d */
  openPlan: async (/** @type {Record<string, string>} */ d) => {
    const values = await form({
      title: words.openTitle,
      intro: words.openIntro,
      fields: fields(null, await directionsFor(d.person)),
      confirm: words.openConfirm
    });
    if (!values) {
      return;
    }
    if (await act("setPlan", { person: d.person, ...answers(values) }, words.openedToast)) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  editPlan: async (/** @type {Record<string, string>} */ d) => {
    const plan = await tend.invoke("planFor", { person: d.person });
    if (plan === null || plan?.error) {
      refresh();
      return;
    }
    const values = await form({
      title: words.editTitle,
      intro: words.openIntro,
      fields: fields(plan, await directionsFor(d.person)),
      confirm: words.editConfirm
    });
    if (!values) {
      return;
    }
    if (await act("updatePlan", { id: d.id, ...answers(values) }, words.editedToast)) {
      refresh();
    }
  },

  /**
   * Show what the person is given, and nothing else.
   *
   * A dialog rather than a block on the page, because it is a thing he reads
   * once before a conversation - and because putting it beside the private
   * fields is how the two get confused.
   *
   * @param {Record<string, string>} d
   */
  theirCopy: async (/** @type {Record<string, string>} */ d) => {
    const plan = await tend.invoke("planFor", { person: d.person });
    if (plan === null || plan?.error) {
      refresh();
      return;
    }

    /** @type {Record<string, string>} */
    const labels = {
      gap: words.copyGap,
      delivery: words.copyDelivery,
      measure: words.copyMeasure,
      dueAt: words.copyDue,
      ifNotMet: words.copyIfNotMet
    };

    await form({
      title: words.copyTitle,
      intro: words.copyIntro,
      fields: (plan.theirCopy ?? []).map((/** @type {any} */ line) => ({
        name: line.field,
        label: labels[line.field] ?? line.field,
        /*
         * `note`, so it is shown and not asked for. A record kept on purpose
         * is not an input, and rendering it as one invites it to be
         * overwritten by the answer that belonged in the field above.
         */
        type: /** @type {const} */ ("note"),
        value:
          line.field === "dueAt"
            ? new Date(Number(line.value)).toLocaleDateString("sv-SE")
            : String(line.value)
      })),
      confirm: words.copyClose
    });
  },

  /** @param {Record<string, string>} d */
  endPlan: async (/** @type {Record<string, string>} */ d) => {
    const values = await form({
      title: words.endTitle,
      fields: [
        {
          name: "as",
          label: words.endHowLabel,
          type: "select",
          value: "met",
          options: [
            { value: "met", label: words.endMet },
            { value: "notMet", label: words.endNotMet },
            { value: "dropped", label: words.endDropped }
          ]
        },
        { name: "why", label: words.endWhyLabel, hint: words.endWhyHint, type: "textarea" }
      ],
      confirm: words.endConfirm,
      /*
       * Held open on a rejection, because the service refuses an ending with
       * no reason for anything but `met` - and closing the dialog would throw
       * away what he typed while telling him it was not enough.
       */
      attempt: async (v) => {
        const result = await tend.invoke("endPlan", { id: d.id, as: v.as, why: v.why });
        return result?.error ?? null;
      }
    });
    if (values) {
      refresh();
    }
  }
};

/* Kept so the person page can offer the block and its actions together. */
export { ask };
