/**
 * Question sets: what one kind of assessor is asked about.
 *
 * ## Why this is its own module
 *
 * Two views need it. The role map is where sets are defined, edited and retired,
 * because a set is a claim about how the job is evaluated - the same class of
 * thing as a duty, and his. The person page needs to define one too, from the
 * picker that appears when an answer is being recorded, because that is the
 * moment somebody discovers a set is missing.
 *
 * Same shape as `growth.js` and `plan.js`, which export a block builder and an
 * actions object for other views to compose.
 *
 * ## Editing a set never reaches a round already run
 *
 * An assessment copies its axis labels onto itself, so rewording an axis here
 * changes what the NEXT round is asked and leaves every round already run saying
 * what it said. That is the whole design rather than a limitation - see
 * `domain/questionsets.js` for the reference implementation's fourth defect,
 * where answers point at ids inside an editable set.
 *
 * The dialogs say so, because somebody editing a set a year in is entitled to
 * know whether they are about to rewrite history.
 */

import { act, ask, esc, form, tend, toast } from "../ui.js";
import { refresh } from "../app.js";
import { T } from "../text.js";

const words = T.role;

/**
 * One axis per line, with anything after a colon kept as the question or the
 * anchors behind it.
 *
 * Split on the FIRST colon rather than the last: an axis label is short and the
 * prose after it is where a colon is likely to turn up again - which is the
 * opposite of the score parser on the answer form, where the label is the long
 * half and the number is after the last colon.
 *
 * Shared by defining and editing, because two copies would drift and the drift
 * would show up as an axis that quietly stopped matching the one before it.
 *
 * @param {string} text
 * @returns {{ axis: string, asked: string }[]}
 */
export function axesFromLines(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => {
      const at = line.indexOf(":");
      return at < 0
        ? { axis: line, asked: "" }
        : { axis: line.slice(0, at).trim(), asked: line.slice(at + 1).trim() };
    });
}

/**
 * Define a question set.
 *
 * Reached from two places, which is why it lives here rather than in either.
 *
 * From the picker when recording an answer, because the moment somebody needs a
 * set is the moment they are holding an answer with nowhere to put it - a flow
 * that sends them elsewhere to define structure first loses the answer they came
 * to enter.
 *
 * And from the role map, because until 2026-09-10 the picker was the ONLY way
 * in: "Nytt frågeset..." lives inside it, and the picker only appears once a set
 * exists. From a clean store there was no way to define the first one from the
 * window at all. The role map is where it belongs - a set decides what somebody
 * is asked about a colleague, which is a claim about how the job is evaluated,
 * the same class of thing as a duty.
 *
 * Returns the set as the picker would have handed it over, so the caller does not
 * care which of the two paths produced it. Null when the dialog was dismissed or
 * the service refused.
 *
 * @returns {Promise<{ id: string, name: string, axes: { axis: string, asked: string }[] } | null>}
 */
export async function defineQuestionSet() {
  const values = await form({
    title: words.setDefineTitle,
    intro: words.setDefineIntro,
    fields: [
      { name: "name", label: words.setNameLabel, placeholder: words.setNamePlaceholder, required: true },
      {
        name: "discipline",
        label: words.setDisciplineLabel,
        placeholder: words.setDisciplinePlaceholder
      },
      {
        name: "axes",
        label: words.setAxesLabel,
        type: "textarea",
        hint: words.setAxesHint,
        required: true
      }
    ],
    confirm: words.setDefineConfirm
  });
  if (!values) {
    return null;
  }

  const axes = axesFromLines(String(values.axes ?? ""));

  const made = /** @type {any} */ (
    await tend.invoke("addQuestionSet", {
      name: values.name,
      discipline: values.discipline,
      axes
    })
  );
  if (made?.error) {
    toast(String(made.error), "bad");
    return null;
  }
  toast(words.setDefinedToast);
  return { id: String(made.id), name: String(values.name).trim(), axes };
}

/**
 * The sets, live and retired, as a group on the role map.
 *
 * Retired ones are listed apart rather than dropped: an answer names its set,
 * and a round from two years ago should still say which questions it was. They
 * can come back, because a discipline returning is likelier than a set having
 * been a mistake.
 *
 * @param {any} sets
 */
export function setsBlock(sets) {
  const live = Array.isArray(sets?.live) ? sets.live : [];
  const retired = Array.isArray(sets?.retired) ? sets.retired : [];

  /** @param {any} q @param {boolean} isRetired */
  const row = (q, isRetired) => `<div class="row${isRetired ? " dim" : ""}">
      <span class="row-name">${esc(q.name)}
        <span class="src">${
          q.discipline ? esc(words.setFor(q.discipline)) : words.setForNobody
        } &middot; ${esc(words.setAxes(q.axes.length))}</span>
        <span class="src">${esc(q.axes.map((/** @type {any} */ a) => a.axis).join(", "))}</span>
      </span>
      <span class="row-right">
        ${
          isRetired
            ? `<button class="act" data-act="unretireSet" data-id="${esc(q.id)}">${words.setUnretire}</button>`
            : `<button class="act" data-act="editSet" data-id="${esc(q.id)}"
                 data-name="${esc(q.name)}" data-discipline="${esc(q.discipline ?? "")}"
                 data-axes="${esc(
                   q.axes
                     .map((/** @type {any} */ a) => (a.asked ? `${a.axis}: ${a.asked}` : a.axis))
                     .join("\n")
                 )}">${words.setEdit}</button>
               <button class="act" data-act="retireSet" data-id="${esc(q.id)}"
                 data-name="${esc(q.name)}">${words.setRetire}</button>`
        }
      </span>
    </div>`;

  return `<div class="group" data-group="sets">
    <div class="group-head">
      <span class="group-title">${words.setsGroup}</span>
      <span class="group-rule"></span>
      <span class="group-meta">${live.length}</span>
    </div>
    <p class="group-note">${words.setsNote}</p>
    ${
      live.length === 0 && retired.length === 0
        ? `<div class="empty">${words.setsEmpty}</div>`
        : `<div class="rows">${live.map((/** @type {any} */ q) => row(q, false)).join("")}${retired
            .map((/** @type {any} */ q) => row(q, true))
            .join("")}</div>`
    }
    <div class="act-row">
      <button class="act primary" data-act="addSet">${words.setsAdd}</button>
    </div>
  </div>`;
}

export const actions = {
  addSet: async () => {
    if (await defineQuestionSet()) {
      refresh();
    }
  },

  /**
   * Change a set's name, discipline or axes.
   *
   * Pre-filled with what it says now, because an edit is almost always a
   * rewording of one line rather than a fresh set - and retyping the other two
   * axes to change the third is how a label drifts, which is the thing sets
   * exist to stop.
   *
   * @param {Record<string, string>} d
   */
  editSet: async (d) => {
    const values = await form({
      title: words.setEditTitle,
      intro: words.setEditIntro,
      fields: [
        { name: "name", label: words.setNameLabel, value: d.name ?? "", required: true },
        { name: "discipline", label: words.setDisciplineLabel, value: d.discipline ?? "" },
        {
          name: "axes",
          label: words.setAxesLabel,
          type: "textarea",
          hint: words.setAxesHint,
          value: d.axes ?? "",
          required: true
        }
      ],
      confirm: words.setEditConfirm,
      attempt: async (v) => {
        const out = /** @type {any} */ (
          await tend.invoke("updateQuestionSet", {
            id: d.id,
            fields: { name: v.name, discipline: v.discipline, axes: axesFromLines(v.axes) }
          })
        );
        return out?.error ? String(out.error) : null;
      }
    });
    if (values) {
      toast(words.setEditedToast);
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  retireSet: async (d) => {
    const sure = await ask({
      title: words.setRetireTitle(d.name),
      body: words.setRetireBody,
      confirm: words.setRetire
    });
    if (sure && (await act("retireQuestionSet", { id: d.id, retired: true }, words.setRetiredToast))) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  unretireSet: async (d) => {
    if (await act("retireQuestionSet", { id: d.id, retired: false }, words.setUnretiredToast)) {
      refresh();
    }
  }
};
