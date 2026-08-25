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
 * @property {"text" | "textarea" | "select" | "number" | "date" | "checkbox"} [type]
 * @property {string} [hint] Shown under the field. Say why it matters, not what it is.
 * @property {string | number | boolean} [value]
 * @property {{ value: string, label: string }[]} [options]
 * @property {boolean} [required]
 * @property {string} [placeholder]
 * @property {number} [min]
 * @property {number} [max]
 * @property {number} [step]
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

  if (f.type === "checkbox") {
    return `<label class="field field-check">
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

  return `<div class="field">
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

/** Relationship types, with the wording used everywhere they are offered. */
export const RELATION_OPTIONS = [
  { value: "lead-and-manage", label: "Lead and manage - you see their work and are accountable" },
  { value: "lead-only", label: "Lead, don't manage - you see their work, no formal channel" },
  { value: "manage-remotely", label: "Manage, don't see - the mandate without the observation" },
  { value: "equal-lead", label: "Equal lead - no authority either way" },
  { value: "own-manager", label: "Your manager" }
];

/**
 * Contact kinds. These are not interchangeable; each satisfies its own cadence.
 *
 * `casual` is the one that satisfies NOTHING, and deliberately. A chat in the
 * kitchen is real contact - it means you have spoken to them, so the signal
 * about people you have only heard about second-hand correctly stays quiet -
 * but it is not the recurring conversation with a structure that the 1-1 duty
 * means, and letting it reset that clock would let a good week of corridor talk
 * hide a quarter without a real one.
 */
export const CONTACT_KINDS = [
  { value: "one-to-one", label: "1-1 - a conversation with them" },
  {
    value: "casual",
    label: "Casual - you spoke, but it was not a 1-1"
  },
  { value: "second-hand", label: "Second-hand - heard about them from someone else" },
  { value: "sideways", label: "Sideways - contact with a peer lead" },
  { value: "feedback", label: "Feedback - you told them something directly" },
  { value: "observation", label: "Observation - you saw their work" },
  { value: "survey", label: "Survey round" },
  { value: "check-in", label: "Check-in - you looked at a project" }
];

/**
 * The contact kinds a NOTE can be evidence of.
 *
 * A subset of CONTACT_KINDS, and the subset is the point: a survey round is a
 * form going out and a project check-in is about a project, so neither is ever
 * something a note about a person carries. Offering them in the mapping would
 * be asking a question with no answer, seven times.
 */
export const NOTE_CONTACT_KINDS = CONTACT_KINDS.filter((k) =>
  ["one-to-one", "casual", "second-hand", "sideways", "feedback", "observation"].includes(k.value)
);

export const LEVEL_OPTIONS = [
  { value: "doing", label: "Doing it myself - still mine, reviewed weekly" },
  { value: "close", label: "Delegated, close follow-up - theirs to drive, reviewed fortnightly" },
  { value: "theirs", label: "Fully theirs - they own the outcome, reviewed every two months" }
];

/** @param {number} ms */
export function asDateInput(ms) {
  const d = new Date(ms);
  const pad = (/** @type {number} */ n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
