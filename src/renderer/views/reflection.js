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

const t = T.reflection;

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
          <h1 class="view-title">${t.title}</h1>
          <p class="view-sub">${t.sub}</p>
        </div>
        <span class="foot-actions">
          <button class="act primary" data-act="addReflection">${t.addButton}</button>
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
    return `${head}${goals}${readFailedHtml("the reflections", rows)}`;
  }

  if (reflections.length === 0) {
    return `${head}${goals}
      <div class="empty">${t.empty}</div>`;
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
    return readFailedHtml("your aims", rows);
  }
  const all = Array.isArray(rows) ? rows : [];
  const live = all.filter((/** @type {any} */ a) => a.status === "open");

  const head = `<div class="group-head">
    <span class="group-title">${t.aimsTitle}</span>
    <span class="group-rule"></span>
    <span class="foot-actions">
      ${
        live.length >= 2
          ? `<span class="src">${t.aimsAtLimit}</span>`
          : `<button class="act" data-act="setAim">${t.aimsSetButton}</button>`
      }
    </span>
  </div>`;

  if (all.length === 0) {
    return `<div class="group">${head}
      <div class="empty">${t.aimsEmpty}</div>
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
           <h3 class="prep-head">${t.aimStillToAnswer}</h3>
           <ul class="prep-list">${a.missing.map((/** @type {string} */ m) => `<li>${esc(m)}</li>`).join("")}</ul>
         </div>`;

  const counts =
    a.logged === 0
      ? `<span class="src">${t.aimNothingLogged}</span>`
      : `<span class="src">${t.aimCounts(a.seen, a.missed, esc(String(a.lastLogged)))}</span>`;

  const live = a.status === "open";

  return `<article class="card${live && a.overdue ? " sev-watch" : ""}">
    <div class="card-top">
      <h2 class="card-title">${esc(String(a.aim))}</h2>
      ${live ? `<span class="pill plain">${esc(String(a.sourceLabel))}</span>` : `<span class="pill plain">${esc(String(a.statusLabel))}</span>`}
    </div>
    ${a.why ? `<p class="card-why">${esc(String(a.why))}</p>` : ""}
    ${
      a.measure
        ? `<div class="prep-block"><h3 class="prep-head">${t.aimHowIKnow}</h3><p class="prep-note">${esc(String(a.measure))}</p></div>`
        : ""
    }
    ${
      a.through
        ? `<div class="prep-block"><h3 class="prep-head">${t.aimWhereItHappens}</h3><p class="prep-note">${esc(String(a.through))}</p></div>`
        : ""
    }
    ${a.asksWho ? `<div class="prep-block"><h3 class="prep-head">${t.aimAsking}</h3><p class="prep-note">${esc(String(a.asksWho))}</p></div>` : ""}
    ${gaps}
    <div class="card-foot">
      ${counts}
      ${
        live
          ? `<span class="foot-actions">
               <button class="act" data-act="logAim" data-id="${esc(String(a.id))}" data-aim="${esc(String(a.aim))}">${t.aimLogButton}</button>
               <button class="act" data-act="endAim" data-id="${esc(String(a.id))}" data-aim="${esc(String(a.aim))}">${t.aimCloseButton}</button>
             </span>`
          : `<span class="src">${esc(String(a.endedWhy || a.statusLabel))}</span>`
      }
    </div>
  </article>`;
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
      <span class="src">${t.writtenBy}</span>
      <span class="foot-actions">
        <button class="act danger" data-act="removeReflection" data-id="${esc(String(r.id))}">${t.remove}</button>
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
      title: t.setTitle,
      intro: t.setIntro,
      fields: [
        { name: "aim", label: t.setAimLabel, type: "textarea", required: true },
        {
          name: "source",
          label: t.setSourceLabel,
          type: "select",
          value: "logged",
          options: [
            { value: "logged", label: t.setSourceLogged },
            { value: "record", label: t.setSourceRecord },
            { value: "asked", label: t.setSourceAsked }
          ]
        },
        { name: "measure", label: t.setMeasureLabel },
        { name: "asksWho", label: t.setAsksWhoLabel },
        {
          name: "through",
          label: t.setThroughLabel,
          placeholder: t.setThroughPlaceholder,
          hint: t.setThroughHint
        },
        { name: "why", label: t.setWhyLabel, type: "textarea" }
      ],
      confirm: t.setConfirm
    });
    if (!values) {
      return;
    }
    if (await act("setAim", values, t.setToast)) {
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
      title: t.logTitle(d.aim),
      intro: t.logIntro,
      fields: [
        { name: "note", label: t.logNoteLabel, type: "textarea", required: true },
        {
          name: "happened",
          label: t.logWhichLabel,
          type: "select",
          value: "yes",
          options: [
            { value: "yes", label: t.logYes },
            { value: "no", label: t.logNo }
          ]
        }
      ],
      confirm: t.logConfirm
    });
    if (!values) {
      return;
    }
    if (
      await act(
        "logAim",
        { aim: d.id, note: values.note, happened: values.happened === "yes" },
        t.logToast
      )
    ) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  endAim: async (d) => {
    const values = await form({
      title: t.closeTitle(d.aim),
      intro: t.closeIntro,
      fields: [
        {
          name: "status",
          label: t.closeHowLabel,
          type: "select",
          value: "reached",
          options: [
            { value: "reached", label: t.closeReached },
            { value: "dropped", label: t.closeDropped }
          ]
        },
        { name: "why", label: t.closeWhyLabel, type: "textarea" }
      ],
      confirm: t.closeConfirm
    });
    if (!values) {
      return;
    }
    if (await act("endAim", { id: d.id, ...values }, t.closeToast)) {
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
      title: t.writeTitle,
      intro: t.writeIntro,
      fields: REFLECTION_FIELDS.map((f) => ({
        name: f.name,
        label: f.label,
        type: /** @type {const} */ ("textarea"),
        hint: f.hint
      })),
      confirm: t.writeConfirm
    });
    if (!values) {
      return;
    }
    if (await act("logReflection", values, t.writeToast)) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  removeReflection: async (d) => {
    if (await act("removeRow", { collection: "reflections", id: d.id }, t.removedToast)) {
      refresh();
    }
  }
};
