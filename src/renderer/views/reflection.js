/**
 * A weekly-ish look back, in its own place in the rail.
 *
 * Its own slot rather than folded into "The day" or "Now": the day is a
 * nightly retrospective that never prompts and is about everywhere a single
 * day went, and Now is deviations only. This is looser and slower - about a
 * week or so - and asks a narrower question of its own. See the header of
 * `src/domain/reflection.js` for the full reasoning; this file only renders
 * it.
 *
 * No count in the rail, same reasoning as "The day": nothing here is late,
 * so a badge would only ever be a reproach.
 */

import { REFLECTION_FIELDS } from "../../domain/reflection.js";
import { act, esc, form, readFailed, readFailedHtml, tend } from "../ui.js";
import { refresh } from "../app.js";
import { T } from "../text.js";

const words = T.reflection;

export async function render() {
  const [rows, mine, aimRows] = await Promise.all([
    tend.invoke("reflections"),
    tend.invoke("myAttention"),
    tend.invoke("aims")
  ]);

  const nudge = (Array.isArray(mine) ? mine : []).find(
    (/** @type {any} */ s) => s.key === "i-have-not-reflected"
  );

  const reflections = Array.isArray(rows) ? rows : [];

  const head = `
    <div class="view-head">
      <div class="head-row">
        <div>
          <h1 class="view-title">${words.title}</h1>
          <p class="view-sub">${words.sub}</p>
        </div>
        <span class="foot-actions">
          <button class="act primary" data-act="addReflection">${words.addButton}</button>
        </span>
      </div>
      ${
        nudge === undefined
          ? ""
          : `<div class="mine-row">
               <span class="mine-text">${esc(String(nudge.text))}</span>
               <span class="src">${esc(String(nudge.detail ?? ""))}</span>
             </div>`
      }
    </div>`;

  // A failed read used to fall through to "Nothing written yet", which on a log
  // of your own writing is the one wrong answer that would make somebody stop
  // trusting the page.
  const goals = aimsBlock(aimRows);

  if (readFailed(rows)) {
    return `${head}${goals}${readFailedHtml(words.readFailedReflections, rows)}`;
  }

  if (reflections.length === 0) {
    return `${head}${goals}
      <div class="empty">${words.empty}</div>`;
  }

  return `${head}${goals}${reflections.map(reflectionCard).join("")}`;
}

/**
 * The aims, and what each is still missing.
 *
 * The two counts are shown side by side rather than as one number, because the
 * pair IS the evaluation: eight occasions logged and two of them taken says
 * something neither figure says alone. The same reasoning as a growth thread's
 * talked-versus-observed.
 *
 * @param {any} rows
 */
function aimsBlock(rows) {
  if (readFailed(rows)) {
    return readFailedHtml(words.readFailedAims, rows);
  }
  const all = Array.isArray(rows) ? rows : [];
  const live = all.filter((/** @type {any} */ a) => a.status === "open");

  const head = `<div class="group-head">
    <span class="group-title">${words.aimsTitle}</span>
    <span class="group-rule"></span>
    <span class="foot-actions">
      ${
        live.length >= 2
          ? `<span class="src">${words.aimsAtLimit}</span>`
          : `<button class="act" data-act="setAim">${words.aimsSetButton}</button>`
      }
    </span>
  </div>`;

  if (all.length === 0) {
    return `<div class="group">${head}
      <div class="empty">${words.aimsEmpty}</div>
    </div>`;
  }

  return `<div class="group">${head}${all.map(aimCard).join("")}</div>`;
}

/** @param {any} a */
function aimCard(a) {
  const gaps =
    a.missing.length === 0
      ? ""
      : `<div class="prep-block">
           <h3 class="prep-head">${words.aimStillToAnswer}</h3>
           <ul class="prep-list">${a.missing.map((/** @type {string} */ m) => `<li>${esc(m)}</li>`).join("")}</ul>
         </div>`;

  /*
   * The two counts, opening onto the occasions they are counting.
   *
   * The numbers used to sit in the foot with nothing behind them, which is the
   * state an aim is meant to replace: he could see four taken and three missed
   * and had no way to tell a real gap from a fortnight where the occasions did
   * not come up. So the counts moved out of the foot and became the summary of
   * a fold - the row carrying the numbers is the row you click, rather than a
   * separate "show occasions" button beside them.
   *
   * `<details>` and not a scripted toggle, the same choice as the archived
   * groups and the proposed duties: opening it is not a change to his data, so
   * it must not cost a `refresh()` that loses his place on the page.
   */
  const occasions = Array.isArray(a.occasions) ? a.occasions : [];

  const log =
    occasions.length === 0
      ? ""
      : `<details class="fold aim-log">
           <summary class="fold-head">
             <span class="fold-title">${words.aimCounts(a.seen, a.missed, esc(String(a.lastLogged)))}</span>
             <span class="fold-meta">${words.aimOccasionsOpen}</span>
           </summary>
           <div class="fold-body">${occasions.map(occasionLine).join("")}</div>
         </details>`;

  const live = a.status === "open";

  return `<article class="card${live && a.overdue ? " sev-watch" : ""}">
    <div class="card-top">
      <h2 class="card-title">${esc(String(a.aim))}</h2>
      ${live ? `<span class="pill plain">${esc(String(a.sourceLabel))}</span>` : `<span class="pill plain">${esc(String(a.statusLabel))}</span>`}
    </div>
    ${a.why ? `<p class="card-why">${esc(String(a.why))}</p>` : ""}
    ${
      a.measure
        ? `<div class="prep-block"><h3 class="prep-head">${words.aimHowIKnow}</h3><p class="prep-note">${esc(String(a.measure))}</p></div>`
        : ""
    }
    ${
      a.through
        ? `<div class="prep-block"><h3 class="prep-head">${words.aimWhereItHappens}</h3><p class="prep-note">${esc(String(a.through))}</p></div>`
        : ""
    }
    ${a.asksWho ? `<div class="prep-block"><h3 class="prep-head">${words.aimAsking}</h3><p class="prep-note">${esc(String(a.asksWho))}</p></div>` : ""}
    ${gaps}
    ${log}
    <div class="card-foot">
      ${a.logged === 0 ? `<span class="src">${words.aimNothingLogged}</span>` : ""}
      ${
        live
          ? `<span class="foot-actions">
               <button class="act" data-act="logAim" data-id="${esc(String(a.id))}" data-aim="${esc(String(a.aim))}">${words.aimLogButton}</button>
               <button class="act" data-act="endAim" data-id="${esc(String(a.id))}" data-aim="${esc(String(a.aim))}">${words.aimCloseButton}</button>
             </span>`
          : `<span class="src">${esc(String(a.endedWhy || a.statusLabel))}</span>`
      }
    </div>
  </article>`;
}

/**
 * One logged occasion.
 *
 * Both kinds are marked, and the first version of this marked only the taken
 * ones - on the reasoning that the gap between the two IS the reading rather
 * than a failure, so a red row would read as a telling-off. That was the wrong
 * conclusion from the right premise. A pattern you cannot scan is not a
 * pattern, and with the only marker a pill at the far right of a wide window,
 * eight rows of identical grey were unreadable in exactly the way that makes
 * the pair of counts worthless.
 *
 * So the marks are their own pair - `occ-taken` and `occ-missed`, not the drift
 * severities - and weighted asymmetrically: taken carries an edge, missed
 * carries an edge and a faint tint. Nothing here can be sorted or escalated as
 * though it were late, which is what the original reasoning was protecting.
 *
 * @param {any} o
 */
function occasionLine(o) {
  return `<div class="line ${o.happened ? "occ-taken" : "occ-missed"}">
    <span class="line-when">${esc(String(o.when))}</span>
    <span class="line-text">${esc(String(o.note))}</span>
    <span class="line-right">
      <span class="pill ${o.happened ? "ok" : "miss"}">${o.happened ? words.aimTaken : words.aimMissed}</span>
    </span>
  </div>`;
}

/** @param {any} r */
function reflectionCard(r) {
  const blocks = REFLECTION_FIELDS.filter((f) => r[f.name] !== null && r[f.name] !== undefined && r[f.name] !== "")
    .map(
      (f) => `<div class="prep-block">
        <h3 class="prep-head">${esc(f.label)}</h3>
        <p class="prep-note">${esc(String(r[f.name]))}</p>
      </div>`
    )
    .join("");

  return `<article class="card" data-reflection="${esc(String(r.id))}">
    <div class="card-top">
      <h2 class="card-title">${esc(new Date(r.at).toLocaleDateString("sv-SE"))}</h2>
      <span class="badge">${esc(String(r.when))}</span>
    </div>
    ${blocks}
    <div class="card-foot">
      <span class="src">${words.writtenBy}</span>
      <span class="foot-actions">
        <button class="act danger" data-act="removeReflection" data-id="${esc(String(r.id))}">${words.remove}</button>
      </span>
    </div>
  </article>`;
}

export const actions = {
  /**
   * Set an aim.
   *
   * The source is asked before the test, and that order is the design: naming
   * where the verdict comes from is the decision, and the wording of the test
   * reads better once it is settled. What cannot be skipped is the source.
   */
  setAim: async () => {
    const values = await form({
      title: words.setTitle,
      intro: words.setIntro,
      fields: [
        { name: "aim", label: words.setAimLabel, type: "textarea", required: true },
        {
          name: "source",
          label: words.setSourceLabel,
          type: "select",
          value: "logged",
          options: [
            { value: "logged", label: words.setSourceLogged },
            { value: "record", label: words.setSourceRecord },
            { value: "asked", label: words.setSourceAsked }
          ]
        },
        { name: "measure", label: words.setMeasureLabel },
        { name: "asksWho", label: words.setAsksWhoLabel },
        {
          name: "through",
          label: words.setThroughLabel,
          placeholder: words.setThroughPlaceholder,
          hint: words.setThroughHint
        },
        { name: "why", label: words.setWhyLabel, type: "textarea" }
      ],
      confirm: words.setConfirm
    });
    if (!values) {
      return;
    }
    if (await act("setAim", values, words.setToast)) {
      refresh();
    }
  },

  /**
   * Record one occasion.
   *
   * A miss is a choice on the form rather than something you can only record by
   * writing prose about it. A log of the good days only is a scrapbook.
   *
   * @param {Record<string, string>} d
   */
  logAim: async (d) => {
    const values = await form({
      title: words.logTitle(d.aim),
      intro: words.logIntro,
      fields: [
        { name: "note", label: words.logNoteLabel, type: "textarea", required: true },
        {
          name: "happened",
          label: words.logWhichLabel,
          type: "select",
          value: "yes",
          options: [
            { value: "yes", label: words.logYes },
            { value: "no", label: words.logNo }
          ]
        }
      ],
      confirm: words.logConfirm
    });
    if (!values) {
      return;
    }
    if (
      await act(
        "logAim",
        { aim: d.id, note: values.note, happened: values.happened === "yes" },
        words.logToast
      )
    ) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  endAim: async (d) => {
    const values = await form({
      title: words.closeTitle(d.aim),
      intro: words.closeIntro,
      fields: [
        {
          name: "status",
          label: words.closeHowLabel,
          type: "select",
          value: "reached",
          options: [
            { value: "reached", label: words.closeReached },
            { value: "dropped", label: words.closeDropped }
          ]
        },
        { name: "why", label: words.closeWhyLabel, type: "textarea" }
      ],
      confirm: words.closeConfirm
    });
    if (!values) {
      return;
    }
    if (await act("endAim", { id: d.id, ...values }, words.closeToast)) {
      refresh();
    }
  },

  /** The retry offered when a read failed rather than came back empty. */
  reload: () => {
    refresh();
  },

  /**
   * A short look back. All fields optional at the form level - the service
   * enforces the real rule (at least one of the two primary questions) and
   * returns an error, which `act()` already surfaces as a toast.
   */
  addReflection: async () => {
    const values = await form({
      title: words.writeTitle,
      intro: words.writeIntro,
      fields: REFLECTION_FIELDS.map((f) => ({
        name: f.name,
        label: f.label,
        type: /** @type {const} */ ("textarea"),
        hint: f.hint
      })),
      confirm: words.writeConfirm
    });
    if (!values) {
      return;
    }
    if (await act("logReflection", values, words.writeToast)) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  removeReflection: async (d) => {
    if (await act("removeRow", { collection: "reflections", id: d.id }, words.removedToast)) {
      refresh();
    }
  }
};
