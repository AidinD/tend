/**
 * Settings: where the data lives, and how Nib feeds it.
 *
 * The Nib section is the important half. Rather than making him follow a naming
 * convention while writing notes, he binds a Nib folder to a person here and
 * says what kind of contact notes there count as. Organise Nib however you
 * like; changing your mind edits a binding rather than rewriting notes.
 */

import { act, ask, CONTACT_KINDS, esc, form, tend } from "../ui.js";
import { refresh } from "../app.js";

export async function render() {
  const [status, folders, bindings, roster] = await Promise.all([
    tend.invoke("status"),
    tend.invoke("nibFolders"),
    tend.invoke("sources"),
    tend.invoke("people")
  ]);

  return `
    <div class="view-head">
      <h1 class="view-title">Settings</h1>
      <p class="view-sub">Where things are kept, and how notes reach the rest of the app.</p>
    </div>

    ${nibSection(folders, bindings, roster)}
    ${dataSection(status)}
    ${aboutSection(status)}
  `;
}

/** @param {any} folders @param {any} bindings @param {any} roster */
function nibSection(folders, bindings, roster) {
  const bound = Array.isArray(bindings) ? bindings : [];

  const rows = bound
    .map(
      (/** @type {any} */ b) => `<div class="row static">
        <span class="row-name">${esc(b.nibFolder)}</span>
        <span class="row-right">
          <span class="row-meta">→ ${esc(b.person ?? "unknown")} as ${esc(b.countsAs)}</span>
          <button class="act tiny danger" data-act="unbind" data-id="${esc(b.id)}" data-name="${esc(b.nibFolder)}">Unbind</button>
        </span>
      </div>`
    )
    .join("");

  if (!folders?.available) {
    return `<div class="group">
      <div class="group-head"><span class="group-title">Notes from Nib</span><span class="group-rule"></span></div>
      <article class="card sev-warn">
        <div class="card-top"><h2 class="card-title">Nib is not readable</h2></div>
        <p class="card-why">${esc(folders?.why ?? "Unknown reason.")}</p>
        <p class="card-why dim">Tend only ever reads Nib. It never writes to it.</p>
      </article>
    </div>`;
  }

  const noPeople = !Array.isArray(roster) || roster.length === 0;

  return `<div class="group">
    <div class="group-head">
      <span class="group-title">Notes from Nib</span>
      <span class="group-rule"></span>
      <span class="group-meta">${bound.length} bound</span>
    </div>

    <article class="card">
      <div class="card-top"><h2 class="card-title">How this works</h2></div>
      <p class="card-why">Point a Nib folder at a person and say what kind of contact notes there count as. Writing a note then becomes the evidence that the conversation happened, with nothing to confirm afterwards.</p>
      <p class="card-why dim">Flagged action points inside those notes become promises here, and ticking one off in Nib closes it here too. Tend only reads Nib.</p>
      <div class="card-foot">
        <span class="src">${folders.folders.length} folder(s) found in Nib</span>
        <button class="act primary" data-act="bind" ${noPeople ? "disabled" : ""}>Bind a folder</button>
        <button class="act" data-act="indexDry" ${bound.length === 0 ? "disabled" : ""}>Preview import</button>
        <button class="act" data-act="index" ${bound.length === 0 ? "disabled" : ""}>Import now</button>
      </div>
    </article>

    ${noPeople ? `<div class="muted-row">Add people first - a binding points a folder at somebody.</div>` : ""}
    ${rows ? `<div class="rows">${rows}</div>` : `<div class="empty">Nothing bound yet.</div>`}
  </div>`;
}

/** @param {any} status */
function dataSection(status) {
  const warning = (status.warnings ?? []).length
    ? `<p class="card-why warn-text">${esc(status.warnings[status.warnings.length - 1])}</p>`
    : "";

  return `<div class="group">
    <div class="group-head"><span class="group-title">Your data</span><span class="group-rule"></span></div>
    <article class="card">
      <div class="card-top"><h2 class="card-title">Where it is kept</h2></div>
      <p class="card-why mono-text">${esc(status.dataDir)}</p>
      <p class="card-why dim">${
        status.dataDirFrom === "env"
          ? "Set by the TEND_DATA_DIR environment variable."
          : "The default per-user location. Set TEND_DATA_DIR to keep it somewhere synced instead."
      }</p>
      <p class="card-why dim">Written as an append-only log, one file per writer, so this app and anything else reaching the same folder can write at once without losing each other's changes. Nothing is ever overwritten, which is also why nothing is ever truly lost.</p>
      ${warning}
      <div class="card-foot">
        <span class="src">This folder holds notes about named colleagues. It stays on your machine.</span>
        <button class="act" data-act="openData">Open the folder</button>
      </div>
    </article>
  </div>`;
}

/** @param {any} status */
function aboutSection(status) {
  return `<div class="group">
    <div class="group-head"><span class="group-title">About</span><span class="group-rule"></span></div>
    <article class="card">
      <div class="card-top">
        <h2 class="card-title">Tend ${esc(status.version ?? "")}</h2>
        <span class="pill plain">${esc(status.packaged ? "installed" : "development")}</span>
      </div>
      <p class="card-why">${
        status.packaged
          ? "Checks for a newer version once at startup and installs it when you quit."
          : "Running from source. Update checks are off, since there is no installed copy to replace."
      }</p>
      <div class="card-foot">
        <span class="src">${esc(status.updateStatus ?? "No update check has run yet.")}</span>
        ${status.packaged ? `<button class="act" data-act="checkUpdate">Check now</button>` : ""}
      </div>
    </article>
  </div>`;
}

export const actions = {
  bind: async () => {
    const [folders, roster] = await Promise.all([tend.invoke("nibFolders"), tend.invoke("people")]);
    if (!folders?.available) {
      return;
    }

    const values = await form({
      title: "Bind a Nib folder",
      intro: "Notes in this folder will count as contact with this person, of the kind you choose. The kind matters: a folder bound as second-hand satisfies only the cadence for hearing about someone, not the one for having spoken to them.",
      fields: [
        {
          name: "folder",
          label: "Folder in Nib",
          type: "select",
          options: folders.folders.map((/** @type {any} */ f) => ({
            value: `${f.categoryId}|${f.subId ?? ""}`,
            label: `${f.label} (${f.notes} note${f.notes === 1 ? "" : "s"})`
          }))
        },
        {
          name: "person",
          label: "Whose notes these are",
          type: "select",
          options: roster.map((/** @type {any} */ p) => ({ value: p.id, label: p.name }))
        },
        { name: "kind", label: "They count as", type: "select", options: CONTACT_KINDS, value: "one-to-one" }
      ],
      confirm: "Bind"
    });
    if (!values) {
      return;
    }

    const [categoryId, subId] = String(values.folder).split("|");
    const label = folders.folders.find(
      (/** @type {any} */ f) => f.categoryId === categoryId && (f.subId ?? "") === subId
    )?.label;

    const ok = await act(
      "bindSource",
      { person: values.person, categoryId, subId: subId || undefined, kind: values.kind, label },
      "Bound."
    );
    if (ok) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  unbind: async (d) => {
    const sure = await ask({
      title: `Unbind ${d.name}?`,
      body: "Notes there stop counting as contact. What has already been imported stays.",
      confirm: "Unbind",
      tone: "danger"
    });
    if (sure && (await act("unbindSource", { id: d.id }, "Unbound."))) {
      refresh();
    }
  },

  indexDry: async () => {
    const result = await act("indexNib", { dry: true });
    if (!result) {
      return;
    }
    await ask({
      title: "What importing would bring in",
      body:
        `${result.contacts} new contact record(s) and ${result.promises} new promise(s) from ` +
        `${result.bindings} binding(s).` +
        (result.skipped?.length ? ` Skipped: ${result.skipped.join("; ")}.` : "") +
        " Nothing has been written.",
      confirm: "Close"
    });
  },

  index: async () => {
    const result = await act("indexNib", {});
    if (!result) {
      return;
    }
    await ask({
      title: "Imported",
      body:
        `${result.contacts} contact record(s) and ${result.promises} promise(s) added` +
        (result.resolved ? `, and ${result.resolved} promise(s) closed because you ticked them off in Nib` : "") +
        ". Safe to run again whenever - nothing is ever duplicated.",
      confirm: "Good"
    });
    refresh();
  },

  openData: async () => {
    await act("openDataDir", {});
  },

  checkUpdate: async () => {
    await act("checkForUpdates", {}, "Checking.");
    setTimeout(refresh, 2500);
  }
};
