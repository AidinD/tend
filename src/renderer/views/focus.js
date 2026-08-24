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

export async function render() {
  const [current, map] = await Promise.all([tend.invoke("focus"), tend.invoke("roleMap")]);

  if (!current.active) {
    return `
      <div class="view-head">
        <h1 class="view-title">No focus running</h1>
        <p class="view-sub">A focus is for when one thing genuinely has to come first for a while. Tend will stretch the softer thresholds so they stop competing with it, and tell you afterwards what that cost.</p>
      </div>
      <article class="card">
        <div class="card-top"><h2 class="card-title">What a focus does, and does not</h2></div>
        <p class="card-why"><strong>Does:</strong> stretches the thresholds on soft nudges, stops surfacing proposed duties, and counts everything it holds back so you always know how much is being kept from you.</p>
        <p class="card-why"><strong>Never:</strong> hides anything critical, touches a guarded duty, or lets a promise age quietly. Everything it stretched reverts on the end date whether or not the work is done, so an unfinished focus becomes a decision to renew rather than a drift nobody noticed.</p>
        <div class="card-foot">
          <span class="src">You can end it early at any time</span>
          <button class="act primary" data-act="start">Start a focus</button>
        </div>
      </article>
      ${guardedList(map)}
    `;
  }

  const budget = current.budgetOfWeek
    ? `<div class="metric"><div class="metric-label">Budget</div><div class="metric-value">${Math.round(current.budgetOfWeek * 100)}%</div><div class="metric-note">of the week</div></div>`
    : "";

  return `
    <div class="view-head">
      <div class="head-row">
        <div>
          <h1 class="view-title">${esc(current.name)}</h1>
          <p class="view-sub">${esc(current.summary)}</p>
        </div>
        <div class="button-row">
          <button class="act" data-act="start">Replace</button>
          <button class="act danger" data-act="end">End it</button>
        </div>
      </div>
    </div>

    ${
      current.overrun
        ? `<article class="card sev-warn">
            <div class="card-top"><h2 class="card-title">Past its end date</h2></div>
            <p class="card-why">Every stretched threshold is already back to normal, so nothing is being dampened. Renew it with a new date, or close it out.</p>
          </article>`
        : ""
    }

    <div class="metrics">
      ${budget}
      <div class="metric">
        <div class="metric-label">Held back now</div>
        <div class="metric-value ${current.heldBackRightNow > 0 ? "warn" : "ok"}">${current.heldBackRightNow}</div>
        <div class="metric-note">soft nudges, nothing critical</div>
      </div>
      <div class="metric">
        <div class="metric-label">Thresholds</div>
        <div class="metric-value">${current.overrun ? "normal" : `×${current.stretchInForce}`}</div>
        <div class="metric-note">on unguarded duties only</div>
      </div>
    </div>

    <article class="card">
      <div class="card-top"><h2 class="card-title">What it has cost</h2></div>
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
      <div class="group-head"><span class="group-title">Guarded</span><span class="group-rule"></span></div>
      <div class="empty">Nothing is guarded. Mark a duty as guarded in the role map and a focus can never dampen it.</div>
    </div>`;
  }
  return `<div class="group">
    <div class="group-head"><span class="group-title">Guarded, never dampened</span><span class="group-rule"></span><span class="group-meta">${guarded.length}</span></div>
    <div class="rows">
      ${guarded
        .map(
          (/** @type {any} */ d) => `<div class="row static">
            <span class="row-name">${esc(d.name)}</span>
            <span class="row-right"><span class="row-meta">every ${esc(d.every)}</span><span class="pill ok">held</span></span>
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
      title: "Start a focus",
      intro: "Tend captures how far behind things are right now, so it can tell you later what this cost.",
      fields: [
        { name: "name", label: "What has to come first", required: true, placeholder: "Ship the new onboarding" },
        {
          name: "endsAt",
          label: "Until when",
          type: "date",
          value: asDateInput(inThreeWeeks),
          hint: "Everything reverts on this date whether or not the work is done. That is the point: an unfinished focus becomes a decision, not a drift."
        },
        {
          name: "budgetPercent",
          label: "Share of the week, percent",
          type: "number",
          min: 5,
          max: 100,
          step: 5,
          value: 50,
          hint: "Only used to show you the shape of the week. It does not enforce anything."
        }
      ],
      confirm: "Start"
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
      "Focus started."
    );
    if (ok) {
      refresh();
    }
  },

  end: async () => {
    const sure = await ask({
      title: "End the focus?",
      body: "Every stretched threshold goes back to normal immediately, so anything that has been drifting quietly will surface.",
      confirm: "End it"
    });
    if (sure && (await act("endFocus", {}, "Ended."))) {
      refresh();
    }
  }
};
