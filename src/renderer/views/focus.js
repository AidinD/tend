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

const t = T.focus;

export async function render() {
  const [current, map] = await Promise.all([tend.invoke("focus"), tend.invoke("roleMap")]);

  if (!current.active) {
    return `
      <div class="view-head">
        <h1 class="view-title">${t.noneTitle}</h1>
        <p class="view-sub">${t.noneSub}</p>
      </div>
      <article class="card">
        <div class="card-top"><h2 class="card-title">${t.contractTitle}</h2></div>
        <p class="card-why">${t.contractDoes}</p>
        <p class="card-why">${t.contractNever}</p>
        <div class="card-foot">
          <span class="src">${t.endEarly}</span>
          <button class="act primary" data-act="start">${t.startButton}</button>
        </div>
      </article>
      ${guardedList(map)}
    `;
  }

  const budget = current.budgetOfWeek
    ? `<div class="metric"><div class="metric-label">${t.budgetLabel}</div><div class="metric-value">${Math.round(current.budgetOfWeek * 100)}%</div><div class="metric-note">${t.budgetNote}</div></div>`
    : "";

  return `
    <div class="view-head">
      <div class="head-row">
        <div>
          <h1 class="view-title">${esc(current.name)}</h1>
          <p class="view-sub">${esc(current.summary)}</p>
        </div>
        <div class="button-row">
          <button class="act" data-act="start">${t.replace}</button>
          <button class="act danger" data-act="end">${t.endButton}</button>
        </div>
      </div>
    </div>

    ${
      current.overrun
        ? `<article class="card sev-warn">
            <div class="card-top"><h2 class="card-title">${t.overrunTitle}</h2></div>
            <p class="card-why">${t.overrunWhy}</p>
          </article>`
        : ""
    }

    <div class="metrics">
      ${budget}
      <div class="metric">
        <div class="metric-label">${t.heldBackLabel}</div>
        <div class="metric-value ${current.heldBackRightNow > 0 ? "warn" : "ok"}">${current.heldBackRightNow}</div>
        <div class="metric-note">${t.heldBackNote}</div>
      </div>
      <div class="metric">
        <div class="metric-label">${t.thresholdsLabel}</div>
        <div class="metric-value">${current.overrun ? t.thresholdsNormal : `×${current.stretchInForce}`}</div>
        <div class="metric-note">${t.thresholdsNote}</div>
      </div>
    </div>

    <article class="card">
      <div class="card-top"><h2 class="card-title">${t.costTitle}</h2></div>
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
      <div class="group-head"><span class="group-title">${t.guardedTitle}</span><span class="group-rule"></span></div>
      <div class="empty">${t.guardedNone}</div>
    </div>`;
  }
  return `<div class="group">
    <div class="group-head"><span class="group-title">${t.guardedSomeTitle}</span><span class="group-rule"></span><span class="group-meta">${guarded.length}</span></div>
    <div class="rows">
      ${guarded
        .map(
          (/** @type {any} */ d) => `<div class="row static">
            <span class="row-name">${esc(d.name)}</span>
            <span class="row-right"><span class="row-meta">${t.guardedEvery(esc(d.every))}</span><span class="pill ok">${t.guardedPill}</span></span>
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
      title: t.startTitle,
      intro: t.startIntro,
      fields: [
        { name: "name", label: t.startNameLabel, required: true, placeholder: t.startNamePlaceholder },
        {
          name: "endsAt",
          label: t.startEndsLabel,
          type: "date",
          value: asDateInput(inThreeWeeks),
          hint: t.startEndsHint
        },
        {
          name: "budgetPercent",
          label: t.startBudgetLabel,
          type: "number",
          min: 5,
          max: 100,
          step: 5,
          value: 50,
          hint: t.startBudgetHint
        }
      ],
      confirm: t.startConfirm
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
      t.startedToast
    );
    if (ok) {
      refresh();
    }
  },

  end: async () => {
    const sure = await ask({
      title: t.endTitle,
      body: t.endBody,
      confirm: t.endConfirm
    });
    if (sure && (await act("endFocus", {}, t.endedToast))) {
      refresh();
    }
  }
};
