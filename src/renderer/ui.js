/**
 * Shared building blocks for the views.
 *
 * Two things matter here. Dialogs are built rather than borrowed from the
 * browser: `window.confirm` and `window.prompt` are disabled in Electron and
 * look like a different application even where they work. And a form is
 * declared as a list of fields rather than written as HTML, so adding a place
 * to enter something stays a five-line change and every form behaves the same.
 */

import { middayOn } from "../domain/time.js";
import { T } from "./text.js";

const words = T.ui;

/**
 * The preload bridge.
 *
 * The window-control half is not spelled out here - it is read back off keel's
 * own declaration, so this cannot drift from what the preload actually exposes.
 * Writing that shape out a second time is how you get a compiler that lies.
 *
 * @type {{
 *   invoke: (name: string, args?: Record<string, any>) => Promise<any>,
 *   onChanged: (handler: () => void) => void
 * } & ReturnType<typeof import("keel/window").windowControlsBridge>}
 */
export const tend = /** @type {any} */ (window).tend;

/**
 * @param {unknown} value
 * @returns {string}
 */
export function esc(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      /** @type {Record<string, string>} */ ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[c]
  );
}

/** @param {string} severity */
export function pill(severity) {
  return `<span class="pill ${esc(severity)}">${esc(severity)}</span>`;
}

/**
 * Did a read fail, as opposed to come back holding nothing?
 *
 * Every operation that throws in the main process comes back as `{ error }`, and
 * the views were collapsing that into an empty array - `Array.isArray(x) ? x :
 * []` - after which an empty list renders as "there is nothing here". The two
 * are different facts, and on this data the wrong one is alarming: a page that
 * says "nobody here yet" because a read failed is telling somebody their whole
 * record is gone. `prep.js` already draws this line for the Jot board and says
 * why; this is the same line for the window.
 *
 * @param {unknown} result
 * @returns {result is { error: string }}
 */
export function readFailed(result) {
  return (
    !Array.isArray(result) &&
    typeof result === "object" &&
    result !== null &&
    typeof (/** @type {any} */ (result).error) === "string"
  );
}

/**
 * What to show instead of a list, when the list could not be read.
 *
 * Says what could not be read and offers a retry, rather than reporting an
 * absence that was never established.
 *
 * @param {string} what
 * @param {{ error: string }} result
 */
export function readFailedHtml(what, result) {
  return `<article class="card sev-warn">
    <div class="card-top"><h2 class="card-title">${esc(words.readFailedTitle(what))}</h2></div>
    <p class="card-why">${words.readFailedWhy}</p>
    <p class="card-why mono-text">${esc(result.error)}</p>
    <div class="card-foot">
      <button class="act" data-act="reload">${words.retry}</button>
    </div>
  </article>`;
}

/**
 * A short message that fades. For confirming something happened, where a dialog
 * would be in the way.
 *
 * @param {string} message
 * @param {"ok" | "bad"} [tone]
 */
export function toast(message, tone = "ok") {
  let host = document.getElementById("toasts");
  if (!host) {
    host = document.createElement("div");
    host.id = "toasts";
    document.body.appendChild(host);
  }
  const el = document.createElement("div");
  el.className = `toast ${tone}`;
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => {
    el.classList.add("going");
    setTimeout(() => el.remove(), 400);
  }, tone === "bad" ? 5200 : 2600);
}

/**
 * @typedef {object} Field
 * @property {string} name
 * @property {string} label
 * @property {"text" | "textarea" | "select" | "multiselect" | "number" | "date" | "checkbox" | "note"} [type]
 *   `note` shows a value without offering to change it, and submits nothing. For
 *   a fact the form has to put in front of somebody: a record kept on purpose is
 *   not an input, and rendering it as one invites it to be overwritten by the
 *   answer that belonged in the field above.
 *
 *   `multiselect` takes several of `options` and answers with an array of their
 *   values. Collapsed to one line once anything is chosen, because the flat
 *   checkbox list it replaced grew a row per person and pushed the fields that
 *   mattered off the bottom of the dialog.
 * @property {string} [hint] Shown under the field. Say why it matters, not what it is.
 * @property {string | number | boolean | string[]} [value]
 * @property {{ value: string, label: string }[]} [options]
 * @property {boolean} [required]
 * @property {string} [placeholder]
 * @property {number} [min]
 * @property {number} [max]
 * @property {number} [step]
 * @property {{ field: string, equals: string }} [showIf] Only ask this while
 *   another field in the same form has that value. A question that does not
 *   apply must not be on the screen: the first form built this way put "whose
 *   need is it?" under an answer of "I do not know yet", and the reader
 *   reasonably read the whole form as asking something else than it was.
 */

/**
 * Open a modal form and resolve with its values, or null if dismissed.
 *
 * @param {object} spec
 * @param {string} spec.title
 * @param {string} [spec.intro]
 * @param {Field[]} spec.fields
 * @param {string} [spec.confirm]
 * @param {"normal" | "danger"} [spec.tone]
 * @param {(values: Record<string, any>) => Promise<string | null>} [spec.attempt]
 *   Runs the write while the dialog is still open. Return an error message to
 *   keep it open with everything still typed in it, or null once it worked.
 *
 *   Without this, a write rejected by the service closes the dialog and throws
 *   away what was typed - the toast explains why, over an empty screen. That
 *   happened for real on a recorded decision with four fields of reasoning in it,
 *   rejected because one name in "who was consulted" was not on the roster.
 *   The field-level `required` check already keeps the dialog open; a rejection
 *   from one layer down had no reason to behave differently.
 * @returns {Promise<Record<string, any> | null>}
 */
export function form({ title, intro, fields, confirm = words.save, tone = "normal", attempt }) {
  return new Promise((resolve) => {
    const scrim = document.createElement("div");
    scrim.className = "scrim";

    const panel = document.createElement("div");
    panel.className = "dialog";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", title);

    panel.innerHTML = `
      <div class="dialog-head">
        <h2 class="dialog-title">${esc(title)}</h2>
        ${intro ? `<p class="dialog-intro">${esc(intro)}</p>` : ""}
      </div>
      <form class="dialog-body">
        ${fields.map(fieldHtml).join("")}
        <p class="dialog-error" hidden></p>
      </form>
      <div class="dialog-foot">
        <button type="button" class="act" data-cancel>${words.cancel}</button>
        <button type="button" class="act ${tone === "danger" ? "danger" : "primary"}" data-confirm>${esc(confirm)}</button>
      </div>
    `;

    const close = (/** @type {Record<string, any> | null} */ value) => {
      document.removeEventListener("keydown", onKey);
      scrim.remove();
      panel.remove();
      resolve(value);
    };

    /** @param {KeyboardEvent} e */
    const onKey = (e) => {
      if (e.key === "Escape") {
        close(null);
      }
      if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        void submit();
      }
    };

    const submit = async () => {
      /** @type {Record<string, any>} */
      const values = {};
      for (const field of fields) {
        const el = /** @type {HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null} */ (
          panel.querySelector(`[name="${field.name}"]`)
        );
        if (!el) {
          continue;
        }
        // A question that is not being asked is answered as empty rather than
        // skipped. Skipping would mean "leave what was there", so switching an
        // answer from "the job needs it" back to "they want it" would silently
        // keep the need he had typed under the old answer.
        if (hidden(field)) {
          values[field.name] =
            field.type === "checkbox" ? false : field.type === "multiselect" ? [] : "";
          continue;
        }
        if (field.type === "checkbox") {
          values[field.name] = /** @type {HTMLInputElement} */ (el).checked;
          continue;
        }
        if (field.type === "multiselect") {
          // Every box shares the field's name, so this is the whole answer -
          // read from the panel rather than from the one element `querySelector`
          // happened to find first.
          values[field.name] = [
            ...panel.querySelectorAll(`input[type="checkbox"][name="${field.name}"]`)
          ]
            .filter((box) => /** @type {HTMLInputElement} */ (box).checked)
            .map((box) => /** @type {HTMLInputElement} */ (box).value);
          if (field.required && values[field.name].length === 0) {
            showError(words.needed(field.label));
            return;
          }
          continue;
        }
        const raw = el.value.trim();
        if (field.required && !raw) {
          showError(words.needed(field.label));
          el.focus();
          return;
        }
        if (field.type === "number") {
          values[field.name] = raw === "" ? undefined : Number(raw);
          continue;
        }
        if (field.type === "date") {
          // Parsed at midday so a timezone shift cannot move it to the day
          // before. The convention lives in the domain because the Nib import
          // needs the same one, and two copies of it would agree until one was
          // edited. A value the picker cannot produce resolves to undefined,
          // which is the same as leaving the field blank.
          values[field.name] = raw === "" ? undefined : (middayOn(raw) ?? undefined);
          continue;
        }
        values[field.name] = raw === "" ? undefined : raw;
      }

      if (attempt === undefined) {
        close(values);
        return;
      }

      // Held open until the write succeeds. Disabled while it runs, so a second
      // click cannot send it twice.
      const button = panel.querySelector("[data-confirm]");
      if (button instanceof HTMLButtonElement) {
        button.disabled = true;
      }
      let failure = null;
      try {
        failure = await attempt(values);
      } catch (err) {
        failure = err instanceof Error ? err.message : String(err);
      }
      if (button instanceof HTMLButtonElement) {
        button.disabled = false;
      }
      if (failure === null) {
        close(values);
        return;
      }
      showError(failure);
    };

    /** @param {string} message */
    const showError = (message) => {
      const box = panel.querySelector(".dialog-error");
      if (box instanceof HTMLElement) {
        box.textContent = message;
        box.hidden = false;
      }
    };

    /**
     * Whether a conditional field is currently not being asked.
     *
     * Read off the live control rather than off a stored flag, so it is the same
     * answer the person is looking at.
     *
     * @param {Field} field
     */
    const hidden = (field) => {
      if (field.showIf === undefined) {
        return false;
      }
      const control = /** @type {HTMLInputElement | HTMLSelectElement | null} */ (
        panel.querySelector(`[name="${field.showIf.field}"]`)
      );
      return control === null || control.value !== field.showIf.equals;
    };

    /** Show or hide every conditional field for what is currently selected. */
    const applyConditions = () => {
      for (const field of fields) {
        if (field.showIf === undefined) {
          continue;
        }
        const wrapper = panel.querySelector(`[data-field="${field.name}"]`);
        if (wrapper instanceof HTMLElement) {
          wrapper.hidden = hidden(field);
        }
      }
    };

    for (const name of new Set(fields.map((f) => f.showIf?.field).filter(Boolean))) {
      panel.querySelector(`[name="${name}"]`)?.addEventListener("change", applyConditions);
    }

    /*
     * The collapsed list's summary, kept true as boxes are ticked.
     *
     * Without this it says what was chosen when the dialog opened, which is
     * exactly wrong for a control whose whole purpose is to be closed most of the
     * time: a line that reads "Nobody chosen yet" over three ticked boxes is a
     * worse state than having no summary at all.
     */
    for (const field of fields.filter((f) => f.type === "multiselect")) {
      const wrapper = panel.querySelector(`[data-multi="${field.name}"]`);
      const label = wrapper?.querySelector("[data-multi-summary]");
      if (wrapper === null || label === null || label === undefined) {
        continue;
      }
      const update = () => {
        const chosen = [...wrapper.querySelectorAll('input[type="checkbox"]')]
          .filter((box) => /** @type {HTMLInputElement} */ (box).checked)
          .map((box) => box.parentElement?.textContent?.trim() ?? "");
        label.textContent = chosen.length === 0 ? words.noneChosen : chosen.join(", ");
      };
      wrapper.addEventListener("change", update);
      update();
    }
    applyConditions();

    scrim.addEventListener("click", () => close(null));
    panel.querySelector("[data-cancel]")?.addEventListener("click", () => close(null));
    panel.querySelector("[data-confirm]")?.addEventListener("click", () => void submit());
    document.addEventListener("keydown", onKey);

    document.body.append(scrim, panel);
    const first = panel.querySelector("input, select, textarea");
    if (first instanceof HTMLElement) {
      first.focus();
    }
  });
}

/** @param {Field} f */
function fieldHtml(f) {
  const id = `f-${f.name}`;
  const hint = f.hint ? `<span class="field-hint">${esc(f.hint)}</span>` : "";

  // No control at all, so `submit` never finds an element for it and the value
  // travels nowhere. That is the point: it is shown, not asked for.
  if (f.type === "note") {
    return `<div class="field" data-field="${esc(f.name)}">
      <span class="field-label">${esc(f.label)}</span>
      <p class="field-note">${esc(f.value ?? "")}</p>
      ${hint}
    </div>`;
  }

  if (f.type === "checkbox") {
    return `<label class="field field-check" data-field="${esc(f.name)}">
      <input type="checkbox" id="${id}" name="${esc(f.name)}" ${f.value ? "checked" : ""}>
      <span><span class="field-label">${esc(f.label)}</span>${hint}</span>
    </label>`;
  }

  /*
   * Several answers from one list, collapsed until it is opened.
   *
   * The first version of this was one checkbox per option, laid out flat. With
   * seven people that is seven rows in a dialog that also holds two text boxes
   * and a date - the picker became the tallest thing in it, and the two fields
   * that matter got pushed off the bottom.
   *
   * A native `<select multiple>` would be smaller and is the obvious reading of
   * "a dropdown with multiselect", but it costs ctrl-click: every option after
   * the first needs a modifier, and clicking one plainly silently clears the
   * rest. In a form that is filled in a hurry that is a way to lose an answer
   * without noticing.
   *
   * So: a disclosure with checkboxes inside it. One click per person, one line
   * when closed, and the summary says who is chosen so it does not have to be
   * opened to be read. `<details>` rather than a scripted popover - it is
   * keyboard-accessible for free and cannot fight the dialog for clicks.
   */
  if (f.type === "multiselect") {
    const options = f.options ?? [];
    const chosen = new Set((Array.isArray(f.value) ? f.value : []).map((v) => String(v)));
    const summary =
      chosen.size === 0
        ? words.noneChosen
        : options
            .filter((o) => chosen.has(o.value))
            .map((o) => o.label)
            .join(", ");

    return `<div class="field" data-field="${esc(f.name)}">
      <span class="field-label">${esc(f.label)}</span>
      <!--
        Closed, always. It was opened when nothing was chosen yet, on the
        reasoning that a required field should show its options - and that put the
        full list back on screen in exactly the case the collapse was for, since
        nothing is chosen when the form opens. The summary line is the affordance,
        and the field being required means an empty answer is refused out loud.
      -->
      <details class="multi" data-multi="${esc(f.name)}">
        <summary class="multi-summary">
          <span data-multi-summary>${esc(summary)}</span>
        </summary>
        <div class="multi-options">
          ${options
            .map(
              (o) => `<label class="multi-option">
                <input type="checkbox" name="${esc(f.name)}" value="${esc(o.value)}"
                  ${chosen.has(o.value) ? "checked" : ""}>
                <span>${esc(o.label)}</span>
              </label>`
            )
            .join("")}
        </div>
      </details>
      ${hint}
    </div>`;
  }

  const control =
    f.type === "textarea"
      ? `<textarea id="${id}" name="${esc(f.name)}" rows="3" placeholder="${esc(f.placeholder ?? "")}">${esc(f.value ?? "")}</textarea>`
      : f.type === "select"
        ? `<select id="${id}" name="${esc(f.name)}">${(f.options ?? [])
            .map(
              (o) =>
                `<option value="${esc(o.value)}" ${String(f.value) === o.value ? "selected" : ""}>${esc(o.label)}</option>`
            )
            .join("")}</select>`
        : `<input id="${id}" name="${esc(f.name)}" type="${f.type ?? "text"}"
             value="${esc(f.value ?? "")}" placeholder="${esc(f.placeholder ?? "")}"
             ${f.min !== undefined ? `min="${f.min}"` : ""}
             ${f.max !== undefined ? `max="${f.max}"` : ""}
             ${f.step !== undefined ? `step="${f.step}"` : ""}>`;

  return `<div class="field" data-field="${esc(f.name)}">
    <label class="field-label" for="${id}">${esc(f.label)}</label>
    ${control}
    ${hint}
  </div>`;
}

/**
 * Ask before doing something that cannot be taken back.
 *
 * @param {object} spec
 * @param {string} spec.title
 * @param {string} spec.body
 * @param {string} [spec.confirm]
 * @param {"normal" | "danger"} [spec.tone]
 * @returns {Promise<boolean>}
 */
export async function ask({ title, body, confirm = words.yes, tone = "normal" }) {
  const answer = await form({
    title,
    intro: body,
    fields: [],
    confirm,
    tone
  });
  return answer !== null;
}

/**
 * Call the main process and surface a failure rather than swallowing it.
 *
 * Every write in the app goes through here, so a rejected write can never look
 * like a successful one - which for a tool whose whole job is not losing track
 * of things would be the worst possible failure mode.
 *
 * @param {string} op
 * @param {Record<string, any>} [args]
 * @param {string} [success] Shown as a toast when it worked.
 * @returns {Promise<any | null>} null when it failed.
 */
export async function act(op, args, success) {
  const result = await tend.invoke(op, args);
  if (result && typeof result === "object" && "error" in result) {
    toast(String(result.error), "bad");
    return null;
  }
  if (success) {
    toast(success);
  }
  return result;
}

/*
 * Relationship types come from the domain, like contact kinds. This list used to
 * be hand-copied here, and a type added to the domain was then unpickable in the
 * window with nothing failing anywhere.
 */
export { RELATIONS, RELATION_OPTIONS } from "../domain/cadence.js";

/*
 * Contact kinds come from the domain, not from a second list here. The rule
 * about which kinds can be about which sort of subject has to hold for an agent
 * over MCP as well as for this window, so it lives in one place and both read
 * it. A copy in the renderer is a copy that drifts, and the way it drifts is by
 * offering a kind that records something satisfying nothing.
 */
export { CONTACT_KINDS, NOTE_CONTACT_KINDS, SUBJECT_KINDS, kindsFor } from "../domain/contact.js";
export { DEFAULT_STAKE_DAYS } from "../domain/stakes.js";

/*
 * Growth's own vocabulary, for the same reason. The three lists a growth form
 * offers - what drives the direction, how the person took it, how it ended - are
 * each a set with a meaning attached to every entry, and a copy of any of them
 * in the window would eventually offer a choice the service refuses to store.
 *
 * `isLiveStatus` is here for the same reason and it is not a list: the window
 * decides what a card offers from whether the thread is still running, and its
 * own copy of that test is how the card came to print homework under an ending.
 */
export { DEFAULT_CADENCE_DAYS, DRIVER_OPTIONS, STANCE_OPTIONS, isLiveStatus } from "../domain/growth.js";

/* Both endings of a wait, from the definition that also holds what each means. */
export { DEFAULT_WAIT_DAYS, WAIT_ENDING_OPTIONS } from "../domain/waiting.js";

/*
 * Delegation levels, from the definition that also decides how often Tend asks
 * for a review. This was the fifth hand-copied list here, and the one with the
 * worst failure mode: it spelled the review intervals out as words, so moving
 * `review` in the domain left the window promising the old interval to the
 * person reading the dropdown, with every test still green.
 */
export { LEVEL_OPTIONS } from "../domain/workstreams.js";

/** @param {number} ms */
export function asDateInput(ms) {
  const d = new Date(ms);
  const pad = (/** @type {number} */ n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
