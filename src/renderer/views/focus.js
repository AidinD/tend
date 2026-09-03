/**
 * Focus: a deliberate imbalance with an end date.
 *
 * The contract, stated on the page because it is the only thing that stops the
 * feature from being harmful: a focus dampens the noise and never mutes an
 * alarm. It also says what it has cost, in the only currency that matters -
 * how much further behind everything else has fallen since it started.
 */

import { act, ask, asDateInput, esc, form, tend } from "../ui.js";
import { refresh } from "../app.js";
import { T } from "../text.js";

const words = T.focus;

export async function render() {
  const [current, map] = await Promise.all([tend.invoke("focus"), tend.invoke("roleMap")]);

  if (!current.active) {
    return `
      <div class="view-head">
        <h1 class="view-title">${words.noneTitle}</h1>
        <p class="view-sub">${words.noneSub}</p>
      </div>
      <article class="card">
        <div class="card-top"><h2 class="card-title">${words.contractTitle}</h2></div>
        <p class="card-why">${words.contractDoes}</p>
        <p class="card-why">${words.contractNever}</p>
        <div class="card-foot">
          <span class="src">${words.endEarly}</span>
          <button class="act primary" data-act="start">${words.startButton}</button>
        </div>
      </article>
      ${guardedList(map)}
    `;
  }

  const budget = current.budgetOfWeek
    ? `<div class="metric"><div class="metric-label">${words.budgetLabel}</div><div class="metric-value">${Math.round(current.budgetOfWeek * 100)}%</div><div class="metric-note">${words.budgetNote}</div></div>`
    : "";

  return `
    <div class="view-head">
      <div class="head-row">
        <div>
          <h1 class="view-title">${esc(current.name)}</h1>
          <p class="view-sub">${esc(current.summary)}</p>
        </div>
        <div class="button-row">
          <button class="act" data-act="start">${words.replace}</button>
          <button class="act danger" data-act="end">${words.endButton}</button>
        </div>
      </div>
    </div>

    ${
      current.overrun
        ? `<article class="card sev-warn">
            <div class="card-top"><h2 class="card-title">${words.overrunTitle}</h2></div>
            <p class="card-why">${words.overrunWhy}</p>
          </article>`
        : ""
    }

    <div class="metrics">
      ${budget}
      <div class="metric">
        <div class="metric-label">${words.heldBackLabel}</div>
        <div class="metric-value ${current.heldBackRightNow > 0 ? "warn" : "ok"}">${current.heldBackRightNow}</div>
        <div class="metric-note">${words.heldBackNote}</div>
      </div>
      <div class="metric">
        <div class="metric-label">${words.thresholdsLabel}</div>
        <div class="metric-value">${current.overrun ? words.thresholdsNormal : `×${current.stretchInForce}`}</div>
        <div class="metric-note">${words.thresholdsNote}</div>
      </div>
    </div>

    <article class="card">
      <div class="card-top"><h2 class="card-title">${words.costTitle}</h2></div>
      <p class="card-why">${esc(current.cost)}</p>
    </article>

    ${guardedList(map)}
  `;
}

/** @param {any} map */
function guardedList(map) {
  const guarded = (map?.active ?? []).filter((/** @type {any} */ d) => d.guarded);
  if (guarded.length === 0) {
    return `<div class="group">
      <div class="group-head"><span class="group-title">${words.guardedTitle}</span><span class="group-rule"></span></div>
      <div class="empty">${words.guardedNone}</div>
    </div>`;
  }
  return `<div class="group">
    <div class="group-head"><span class="group-title">${words.guardedSomeTitle}</span><span class="group-rule"></span><span class="group-meta">${guarded.length}</span></div>
    <div class="rows">
      ${guarded
        .map(
          (/** @type {any} */ d) => `<div class="row static">
            <span class="row-name">${esc(d.name)}</span>
            <span class="row-right"><span class="row-meta">${words.guardedEvery(esc(d.every))}</span><span class="pill ok">${words.guardedPill}</span></span>
          </div>`
        )
        .join("")}
    </div>
  </div>`;
}

export const actions = {
  start: async () => {
    const inThreeWeeks = Date.now() + 21 * 86_400_000;
    const values = await form({
      title: words.startTitle,
      intro: words.startIntro,
      fields: [
        { name: "name", label: words.startNameLabel, required: true, placeholder: words.startNamePlaceholder },
        {
          name: "endsAt",
          label: words.startEndsLabel,
          type: "date",
          value: asDateInput(inThreeWeeks),
          hint: words.startEndsHint
        },
        {
          name: "budgetPercent",
          label: words.startBudgetLabel,
          type: "number",
          min: 5,
          max: 100,
          step: 5,
          value: 50,
          hint: words.startBudgetHint
        }
      ],
      confirm: words.startConfirm
    });
    if (!values) {
      return;
    }
    const ok = await act(
      "setFocus",
      {
        name: values.name,
        endsAt: values.endsAt,
        budget: values.budgetPercent ? Number(values.budgetPercent) / 100 : undefined
      },
      words.startedToast
    );
    if (ok) {
      refresh();
    }
  },

  end: async () => {
    const sure = await ask({
      title: words.endTitle,
      body: words.endBody,
      confirm: words.endConfirm
    });
    if (sure && (await act("endFocus", {}, words.endedToast))) {
      refresh();
    }
  }
};
