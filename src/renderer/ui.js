/**
 * Shared building blocks for the views.
 *
 * Two things matter here. Dialogs are built rather than borrowed from the
 * browser: `window.confirm` and `window.prompt` are disabled in Electron and
 * look like a different application even where they work. And a form is
 * declared as a list of fields rather than written as HTML, so adding a place
 * to enter something stays a five-line change and every form behaves the same.
 */

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
 * @property {"text" | "textarea" | "select" | "number" | "date" | "checkbox" | "note"} [type]
 *   `note` shows a value without offering to change it, and submits nothing. For
 *   a fact the form has to put in front of somebody: a record kept on purpose is
 *   not an input, and rendering it as one invites it to be overwritten by the
 *   answer that belonged in the field above.
 * @property {string} [hint] Shown under the field. Say why it matters, not what it is.
 * @property {string | number | boolean} [value]
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
 * @returns {Promise<Record<string, any> | null>}
 */
export function form({ title, intro, fields, confirm = "Save", tone = "normal" }) {
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
        <button type="button" class="act" data-cancel>Cancel</button>
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
        submit();
      }
    };

    const submit = () => {
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
          values[field.name] = field.type === "checkbox" ? false : "";
          continue;
        }
        if (field.type === "checkbox") {
          values[field.name] = /** @type {HTMLInputElement} */ (el).checked;
          continue;
        }
        const raw = el.value.trim();
        if (field.required && !raw) {
          showError(`${field.label} is needed.`);
          el.focus();
          return;
        }
        if (field.type === "number") {
          values[field.name] = raw === "" ? undefined : Number(raw);
          continue;
        }
        if (field.type === "date") {
          // Parsed at midday so a timezone shift cannot move it to the day before.
          values[field.name] = raw === "" ? undefined : new Date(`${raw}T12:00:00`).getTime();
          continue;
        }
        values[field.name] = raw === "" ? undefined : raw;
      }
      close(values);
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
    applyConditions();

    scrim.addEventListener("click", () => close(null));
    panel.querySelector("[data-cancel]")?.addEventListener("click", () => close(null));
    panel.querySelector("[data-confirm]")?.addEventListener("click", submit);
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
export async function ask({ title, body, confirm = "Yes", tone = "normal" }) {
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
 */
export { DEFAULT_CADENCE_DAYS, DRIVER_OPTIONS, STANCE_OPTIONS } from "../domain/growth.js";

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
