/**
 * Now: the only view opened daily.
 *
 * Deviations only. When everything is in step this is nearly empty, which is
 * the design rather than a gap - a view that shows the whole list every morning
 * becomes background noise inside a month.
 *
 * Every card carries the action that would resolve it, so nothing here is a
 * report you then have to go and act on somewhere else.
 */

import { act, ask, esc, form, kindsFor, tend } from "../ui.js";
import { go, refresh } from "../app.js";
import { actions as waitingActions, waitingGroup } from "./waiting.js";

export async function render() {
  const [attention, questions, roster, ledger, mine, waits] = await Promise.all([
    tend.invoke("attention"),
    tend.invoke("signals"),
    tend.invoke("people"),
    tend.invoke("decisions"),
    tend.invoke("myAttention"),
    tend.invoke("waitsOnNow")
  ]);
  const waitingOn = Array.isArray(waits) ? waits : [];

  if (attention.error) {
    return `<div class="card sev-critical"><div class="card-top">
      <h2 class="card-title">Could not read the data</h2></div>
      <p class="card-why">${esc(attention.error)}</p></div>`;
  }

  // An empty store is a setup problem, not a quiet day. Say so plainly and
  // offer the way out rather than showing a serene screen that means nothing.
  if (!Array.isArray(roster) || roster.length === 0) {
    return firstRun();
  }

  const focus = attention.focus
    ? `<div class="focus-bar${attention.focus.overrun ? " overrun" : ""}">
        <div class="focus-eyebrow">Current focus</div>
        <h2 class="focus-name">${esc(attention.focus.summary)}</h2>
        <p class="focus-cost">${esc(attention.focus.cost)}</p>
        <div class="card-foot">
          <span class="src">${attention.heldBackByFocus} nudge(s) held back. Nothing critical is ever in there.</span>
          <button class="act" data-act="openFocus">Focus settings</button>
        </div>
      </div>`
    : "";

  const due = (questions ?? []).filter((/** @type {any} */ q) => q.due);

  /*
   * Decisions asking to be looked at again.
   *
   * They belong on this page and not only on their own, because "nothing needs
   * you" has to be true. A revisit date you set months ago and a cadence that
   * has drifted are the same kind of thing: something you decided to be
   * reminded of, arriving.
   */
  const revisits = (Array.isArray(ledger) ? ledger : []).filter((/** @type {any} */ d) => d.revisitDue);

  const revisitCards = revisits
    .map(
      (/** @type {any} */ d) => `
        <div class="card sev-critical">
          <div class="card-top">
            <h2 class="card-title">${esc(d.what)}</h2>
            <span class="badge">decision due ${esc(d.revisitOverdueBy ?? "now")}</span>
          </div>
          ${d.because ? `<p class="card-why">${esc(d.because)}</p>` : ""}
          <div class="card-foot">
            <span class="src">You set this date when you decided it.</span>
            <button class="act" data-act="holds" data-id="${esc(d.id)}">It still holds</button>
            <button class="act" data-act="openDecisions">Open the log</button>
          </div>
        </div>`
    )
    .join("");

  /*
   * Patterns in my own month, at the bottom rather than the top.
   *
   * They are not deviations from a duty and nothing is late because of them, so
   * they must not compete with what is. But they are the things that are
   * invisible while they happen and obvious afterwards, which is worth one
   * paragraph on the page you open daily.
   */
  const signals = Array.isArray(mine) ? mine : [];
  const signalRows = signals
    .map(
      (/** @type {any} */ s) => `
        <div class="mine-row">
          <span class="mine-text">${esc(s.text)}</span>
          ${s.detail ? `<span class="src">${esc(s.detail)}</span>` : ""}
        </div>`
    )
    .join("");

  if (
    attention.allInStep &&
    due.length === 0 &&
    revisits.length === 0 &&
    signals.length === 0 &&
    waitingOn.length === 0
  ) {
    return `
      <div class="view-head">
        <h1 class="view-title">Nothing needs you</h1>
        <p class="view-sub">Every cadence is inside its interval, no promise is ageing, and no question is due. This view is meant to be empty most days.</p>
      </div>
      ${focus}
      <div class="empty">When something drifts, it appears here and nowhere else.</div>
    `;
  }

  return `
    <div class="view-head">
      <h1 class="view-title">Now</h1>
      <p class="view-sub">Only what deviates. Everything in step stays out of the way.</p>
    </div>
    ${focus}
    ${group("Needs you", attention.needsYou.map(card).join(""), attention.needsYou.length)}
    ${group("Decisions to look at again", revisitCards, revisits.length)}
    ${group("Questions", due.map(question).join(""), due.length)}
    ${group(
      "Nudge",
      attention.nudges.map(card).join("") +
        (attention.heldBackByFocus > 0 && !attention.focus
          ? ""
          : attention.heldBackByFocus > 0
            ? `<div class="muted-row">${attention.heldBackByFocus} softer nudge(s) held back while the focus runs.</div>`
            : ""),
      attention.nudges.length
    )}
    ${waitingGroup(waitingOn)}
    ${
      signals.length === 0
        ? ""
        : `<div class="mine">
             <h2 class="mine-head">My month</h2>
             <p class="mine-sub">About me, not about them. Nothing here is late.</p>
             ${signalRows}
           </div>`
    }
  `;
}

function firstRun() {
  return `
    <div class="view-head">
      <h1 class="view-title">Nothing to watch yet</h1>
      <p class="view-sub">Tend needs two things before it can tell you anything: the people you are responsible for, and what the job asks of you.</p>
    </div>
    <div class="stack">
      <article class="card sev-warn">
        <div class="card-top"><h2 class="card-title">1. Add the people</h2></div>
        <p class="card-why">Everyone you lead or manage, and the other leads you work beside. Set the date each relationship started, not today - otherwise someone you have not spoken to in months looks perfectly in step.</p>
        <div class="card-foot">
          <span class="src">Nothing leaves this machine</span>
          <button class="act primary" data-act="addPerson">Add someone</button>
        </div>
      </article>
      <article class="card sev-book">
        <div class="card-top"><h2 class="card-title">2. Start the role map</h2></div>
        <p class="card-why">Three duties you already practise, five proposed from the management reading, and three monthly questions. The proposals do nothing until you accept them, and you can change any of it afterwards.</p>
        <div class="card-foot">
          <span class="src">You can edit or delete every one of them</span>
          <button class="act primary" data-act="seed">Set up the role map</button>
          <button class="act" data-act="openRole">Look first</button>
        </div>
      </article>
    </div>
  `;
}

/** @param {string} title @param {string} body @param {number} count */
function group(title, body, count) {
  if (!body.trim()) {
    return "";
  }
  return `<div class="group">
    <div class="group-head">
      <span class="group-title">${esc(title)}</span>
      <span class="group-rule"></span>
      <span class="group-meta">${count}</span>
    </div>
    <div class="stack">${body}</div>
  </div>`;
}

/** @param {any} item */
function card(item) {
  const softened =
    item.actualUrgency === "critical" && item.urgency !== "critical"
      ? `<p class="card-why dim">Actually critical. The focus is only softening how it reads.</p>`
      : "";

  const actions = [];
  if (item.person) {
    // The subject decides both the wording and the kinds the form will offer.
    // A project cadence is answered by looking at the project, not by having a
    // conversation with it, and the old card offered every kind for either -
    // which records something that satisfies nothing and still says "Logged".
    /** @type {Record<string, string>} */
    const LABELS = { project: "Log a look", workstream: "Log a review", stake: "Log an update" };
    const kind = String(item.subjectKind ?? "person");
    const label = LABELS[kind] ?? "Log contact";
    const isPerson = kind === "person";
    actions.push(
      `<button class="act" data-act="logContact" data-person="${esc(item.person)}" data-subject-kind="${esc(item.subjectKind ?? "person")}">${label}</button>`
    );
    // Only people have a page. Sending a project id to the roster showed an
    // empty person rather than saying it had nowhere to go.
    if (isPerson) {
      actions.push(`<button class="act" data-act="openPerson" data-person="${esc(item.person)}">Open</button>`);
    }
  }
  if (item.key.startsWith("promise:")) {
    actions.push(
      `<button class="act primary" data-act="resolvePromise" data-id="${esc(item.key.slice(8))}">Done</button>`,
      `<button class="act" data-act="dropPromise" data-id="${esc(item.key.slice(8))}">Drop</button>`
    );
  }
  if (item.key.startsWith("unspecified:")) {
    actions.push(
      `<button class="act primary" data-act="setLevel" data-id="${esc(item.key.slice(12))}">Set the level</button>`
    );
  }

  return `<article class="card sev-${esc(item.urgency)}">
    <div class="card-top">
      <h2 class="card-title">${esc(item.what)}</h2>
      <span class="pill ${esc(item.urgency)}">${esc(item.behindBy)}</span>
    </div>
    <p class="card-why">${esc(item.why)}</p>
    ${softened}
    <div class="card-foot">
      <span class="src">${esc(item.from)}${item.guarded ? " · guarded" : ""}</span>
      ${actions.join("")}
    </div>
  </article>`;
}

/** @param {any} q */
function question(q) {
  return `<article class="card sev-book">
    <div class="card-top">
      <h2 class="card-title">${esc(q.question)}</h2>
      <span class="pill book">${esc(q.lastAsked === "never" ? "never asked" : q.lastAsked)}</span>
    </div>
    <p class="card-why">${esc(q.why)}</p>
    <div class="card-foot">
      <span class="src">Monthly check. The answer is usually no</span>
      <button class="act primary" data-act="answerNo" data-id="${esc(q.id)}">No</button>
      <button class="act" data-act="answerYes" data-id="${esc(q.id)}">Yes, and here is what I saw</button>
    </div>
  </article>`;
}

export const actions = {
  // Chasing and closing are the same everywhere they appear.
  ...waitingActions,

  /** @param {Record<string, string>} d */
  openPerson: (d) => go("people", { person: d.person }),
  openFocus: () => go("focus"),
  openRole: () => go("role"),
  openDecisions: () => go("decisions"),

  /**
   * "It still holds" from here, so the common answer never needs a second view.
   *
   * @param {Record<string, string>} d
   */
  holds: async (d) => {
    await act("stillHolds", { id: d.id, days: 90 });
    refresh();
  },

  addPerson: async () => {
    const { addPersonDialog } = await import("./people.js");
    if (await addPersonDialog()) {
      refresh();
    }
  },

  seed: async () => {
    const result = await act("seed", {}, "Role map set up.");
    if (result) {
      go("role");
    }
  },

  /** @param {Record<string, string>} d */
  logContact: async (d) => {
    const subjectKind = /** @type {any} */ (d.subjectKind ?? "person");
    const options = kindsFor(subjectKind);
    const values = await form({
      title: subjectKind === "person" ? "Log contact" : "Log what you looked at",
      intro:
        subjectKind === "person"
          ? "The kind decides which cadence this satisfies. Hearing about someone from their lead is not the same as having spoken to them, and Tend keeps those apart on purpose."
          : "Only the kinds that can be about this sort of subject are offered. The rest would record something that satisfies no cadence.",
      fields: [
        { name: "kind", label: "What kind", type: "select", options, value: options[0]?.value },
        { name: "note", label: "One line, optional", placeholder: "What it was about" }
      ],
      confirm: "Log it"
    });
    if (!values) {
      return;
    }
    if (await act("logTouch", { subject: d.person, ...values }, "Logged.")) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  resolvePromise: async (d) => {
    if (await act("resolvePromise", { id: d.id, as: "resolved" }, "Closed.")) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  dropPromise: async (d) => {
    const sure = await ask({
      title: "Drop this promise?",
      body: "It stops being tracked. Use this when you decided not to do it, rather than when you did it.",
      confirm: "Drop it"
    });
    if (sure && (await act("resolvePromise", { id: d.id, as: "dropped" }, "Dropped."))) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  setLevel: async (d) => {
    const { setLevelDialog } = await import("./work.js");
    if (await setLevelDialog(d.id)) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  answerNo: async (d) => {
    if (await act("answerSignal", { signal: d.id, answer: "no" }, "Noted. Back in a month.")) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  answerYes: async (d) => {
    const values = await form({
      title: "What did you see?",
      intro: "A bare yes is no use in three months. One or two concrete sentences is enough, and this question comes back in a week rather than a month.",
      fields: [{ name: "note", label: "What you saw", type: "textarea", required: true }],
      confirm: "Record it"
    });
    if (!values) {
      return;
    }
    if (await act("answerSignal", { signal: d.id, answer: "yes", note: values.note }, "Recorded.")) {
      refresh();
    }
  }
};
