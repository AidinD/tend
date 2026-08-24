/**
 * Settings: where the data lives, and how Nib feeds it.
 *
 * The Nib section is the important half. Rather than making him follow a naming
 * convention while writing notes, he binds a Nib folder to a person here and
 * says what kind of contact notes there count as. Organise Nib however you
 * like; changing your mind edits a binding rather than rewriting notes.
 */

import { act, ask, CONTACT_KINDS, esc, form, tend, toast } from "../ui.js";
import { refresh } from "../app.js";
import { modelStatus } from "../model.js";

export async function render() {
  const [status, folders, bindings, roster, model] = await Promise.all([
    tend.invoke("status"),
    tend.invoke("nibFolders"),
    tend.invoke("sources"),
    tend.invoke("people"),
    modelStatus()
  ]);

  return `
    <div class="view-head">
      <h1 class="view-title">Settings</h1>
      <p class="view-sub">Where things are kept, and how notes reach the rest of the app.</p>
    </div>

    ${nibSection(folders, bindings, roster)}
    ${modelSection(model)}
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
          <span class="row-meta">→ ${esc(b.person ?? "unknown")} as ${esc(b.countsAs)}${
            Array.isArray(b.rules) && b.rules.length > 0
              ? `, ${b.rules.length} tag rule${b.rules.length === 1 ? "" : "s"}`
              : ""
          }</span>
          <button class="act tiny" data-act="rules" data-id="${esc(b.id)}" data-name="${esc(b.nibFolder)}">Tags</button>
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

/**
 * What the model layer is for and whether it can run.
 *
 * Says what it will never do as prominently as what it does. "An app that reads
 * my notes about colleagues" is a sentence worth being unambiguous about, and
 * the boundary is the reassuring half: the radar is arithmetic, the model only
 * ever drafts, and the drafts are not kept.
 *
 * @param {{ available: boolean, why: string | null, binary: string }} model
 */
function modelSection(model) {
  return `<div class="group">
    <div class="group-head"><span class="group-title">Drafting</span><span class="group-rule"></span></div>
    <article class="card${model.available ? "" : " sev-warn"}">
      <div class="card-top">
        <h2 class="card-title">${model.available ? "Available" : "Off"}</h2>
        <span class="pill plain">${model.available ? "signed in through Claude Code" : "not set up"}</span>
      </div>
      ${
        model.available
          ? `<p class="card-why">Three buttons use a model: a brief before a conversation, reading one of your notes for a commitment you wrote in passing, and naming what recurs across several notes about the same person. Each one is a button. Nothing runs on a timer and nothing runs when this window opens.</p>
             <p class="card-why dim">It borrows the sign-in Claude Code already has on this machine, so there is no key to store. A note only ever leaves this machine when you press one of those buttons.</p>`
          : `<p class="card-why">${esc(model.why ?? "")}</p>
             <p class="card-why dim">Everything else works exactly as it does with it on. Drift, cadences, promises and the focus budget are ordinary arithmetic - a model never decides what needs your attention.</p>`
      }
      <div class="card-foot">
        <span class="src">Drafts are shown and thrown away. The only thing a model may write is a theme, and only on a scheduled pass.</span>
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
  /**
   * Map Nib's tags onto contact kinds, for one binding.
   *
   * One row per tag Nib has, each choosing a kind or "ignore". Presented as the
   * whole list rather than as rows you add and remove, because the question is
   * "what does each of my tags mean here" and the honest answer for most of them
   * is nothing.
   *
   * @param {Record<string, string>} d
   */
  rules: async (d) => {
    const [catalog, bound] = await Promise.all([
      tend.invoke("nibTags"),
      tend.invoke("sources")
    ]);

    if (!catalog?.available) {
      toast(String(catalog?.why ?? "Nib's tags could not be read."), "bad");
      return;
    }
    if (catalog.tags.length === 0) {
      toast("Nib has no tags yet. Make one there first, then map it here.", "bad");
      return;
    }

    const binding = (Array.isArray(bound) ? bound : []).find((/** @type {any} */ b) => b.id === d.id);
    const current = new Map(
      (binding?.rules ?? []).map((/** @type {any} */ r) => [String(r.tagId), String(r.kind)])
    );

    const values = await form({
      title: `Tags in ${d.name}`,
      intro:
        "This folder counts as its own kind by default. A tag on a note overrides that, which is " +
        "what lets one folder hold every sort of note about one person without a second-hand note " +
        "resetting the clock on having spoken to them. Leave a tag on “ignore” and it means nothing here.",
      fields: catalog.tags.map((/** @type {any} */ tag) => ({
        name: `tag:${tag.id}`,
        label: tag.name,
        type: "select",
        hint: tag.description || undefined,
        value: current.get(tag.id) ?? "",
        options: [{ value: "", label: "Ignore - means nothing to Tend" }, ...CONTACT_KINDS]
      })),
      confirm: "Save"
    });
    if (!values) {
      return;
    }

    const rules = Object.entries(values)
      .filter(([name, kind]) => name.startsWith("tag:") && typeof kind === "string" && kind !== "")
      .map(([name, kind]) => ({ tagId: name.slice(4), kind: String(kind) }));

    if (await act("setSourceRules", { id: d.id, rules }, `${rules.length} tag rule${rules.length === 1 ? "" : "s"} saved.`)) {
      refresh();
    }
  },

  bind: async () => {
    const [folders, roster] = await Promise.all([tend.invoke("nibFolders"), tend.invoke("people")]);
    if (!folders?.available) {
      return;
    }

    const values = await form({
      title: "Bind a Nib folder",
      intro:
        "Notes in this folder count as contact with this person. The kind you pick here is " +
        "the DEFAULT - a tag on a note overrides it, which is what lets one folder hold every " +
        "sort of note about somebody without a second-hand note resetting the clock on having " +
        "spoken to them. Pick what most notes there are; the tags come next.",
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

    const bound = await act(
      "bindSource",
      { person: values.person, categoryId, subId: subId || undefined, kind: values.kind, label },
      "Bound."
    );
    if (!bound) {
      return;
    }
    refresh();

    // Straight on to the tags rather than leaving a button to be found later.
    // The moment somebody is deciding what a folder counts as is the moment the
    // exceptions are in their head; asking a screen later is asking too late.
    // Only when Nib actually has tags - otherwise this is a dialog about nothing.
    const catalog = await tend.invoke("nibTags");
    if (catalog?.available && catalog.tags.length > 0) {
      await actions.rules({ id: String(bound.id), name: String(label ?? "this folder") });
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
