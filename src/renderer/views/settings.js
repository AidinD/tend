/**
 * Settings: where the data lives, and how Nib feeds it.
 *
 * The Nib section is the important half. Rather than making him follow a naming
 * convention while writing notes, he binds a Nib folder to a PERSON here, and
 * then answers Tend's own question - for each kind of contact it tracks, which
 * Nib tag supplies it. Organise Nib however you like; changing your mind edits
 * a binding rather than rewriting notes.
 */

import { act, ask, esc, form, NOTE_CONTACT_KINDS, tend, toast } from "../ui.js";
import { refresh } from "../app.js";
import { modelStatus } from "../model.js";

/**
 * How the data directory was decided, in words.
 *
 * Spelled out for all three because "default" is the one that quietly means
 * nobody configured this and the app picked - and the per-user default is the
 * location a helper process can be silently redirected away from, leaving two
 * halves of the same tool on two stores. Naming which of the three applies is
 * what makes that visible from the window instead of by comparing timestamps.
 */
/** @type {Record<string, string>} */
const WHERE_FROM = {
  env: "Set by the TEND_DATA_DIR environment variable, inherited when this app started.",
  "user-env": "Set by TEND_DATA_DIR, read from your Windows user environment rather than inherited.",
  default:
    "The default per-user location, because nothing set TEND_DATA_DIR. Set it to keep the data somewhere synced, and somewhere a helper process can reach."
};

export async function render() {
  const [status, folders, bindings, roster, model, undoable] = await Promise.all([
    tend.invoke("status"),
    tend.invoke("nibFolders"),
    tend.invoke("sources"),
    tend.invoke("people"),
    modelStatus(),
    tend.invoke("undoableBulkArchive")
  ]);

  return `
    <div class="view-head">
      <h1 class="view-title">Settings</h1>
      <p class="view-sub">Where things are kept, and how notes reach the rest of the app.</p>
    </div>

    ${modeSection(status)}
    ${nibSection(folders, bindings, roster, status)}
    ${modelSection(model)}
    ${dataSection(status)}
    ${archiveSection(undoable)}
    ${aboutSection(status)}
  `;
}

/**
 * Which half of life this window is looking at.
 *
 * ## Why two stores rather than one with a filter
 *
 * A filter is a rule, and a rule is a thing that can be got wrong once. Two
 * directories that are never read across cannot leak into each other by anybody
 * forgetting a `where` clause, and the boundary is then a property of the
 * filesystem instead of a property of the code being careful.
 *
 * ## Why switching restarts the app
 *
 * Everything under the window - the store, the change watcher, the Nib import -
 * was opened for the mode the app started in. Swapping them underneath a drawing
 * view is a sequence with a wrong order, and the cost of the wrong order is
 * private words written into the work store. A restart has no wrong order.
 *
 * It also makes the switch impossible to do by accident, which is the right
 * amount of friction for this particular button.
 *
 * @param {any} status
 */
function modeSection(status) {
  const mode = String(status?.mode ?? "work");
  const isPrivate = mode === "private";

  return `<div class="group">
    <div class="group-head">
      <span class="group-title">Which half</span>
      <span class="group-rule"></span>
      <span class="group-meta">${isPrivate ? "private" : "work"}</span>
    </div>
    <article class="card">
      <div class="card-top">
        <h2 class="card-title">${isPrivate ? "The private half" : "The work half"}</h2>
      </div>
      <p class="card-why">
        ${
          isPrivate
            ? "Its own store, read by nothing on the work side and never merged with it. Drift, cadences, duties, prep and a focus budget are not here - contact with somebody you live with is continuous, so a cadence over it would read as permanently fine and mean nothing."
            : "Everything the app has always been. People you are responsible for, what you owe them, and what has fallen behind."
        }
      </p>
      <p class="card-why dim">
        ${
          isPrivate
            ? "What an entry here records is the interaction and your own part in it - not the other person's state. That is the half you can change, and it is the only version you could show the person it is about."
            : "The private half keeps family and everything outside work in a separate store. Switching restarts the app, so it cannot happen while you are half-way through a sentence."
        }
      </p>
      <div class="card-foot">
        <span class="src mono-text">${esc(String(status?.dataDir ?? ""))}</span>
        <button class="act" data-act="switchMode" data-to="${isPrivate ? "work" : "private"}">
          ${isPrivate ? "Back to work" : "Switch to private"}
        </button>
      </div>
    </article>
  </div>`;
}

/**
 * What one import pass did, in sentences.
 *
 * Every count the pass returns is printed, including the ones it used to keep
 * to itself. An importer that withdraws a row or drops a queued commitment and
 * says only how many it added is one whose numbers cannot be reconciled with
 * the page afterwards, and the natural reading of an unexplained disappearance
 * is that the tool lost something.
 *
 * @param {any} r
 * @returns {string}
 */
function importSummary(r) {
  /** @param {number} n @param {string} one @param {string} many */
  const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  const parts = [`${count(Number(r.contacts ?? 0), "contact record", "contact records")} added`];
  if (r.promises) {
    parts.push(count(Number(r.promises), "promise", "promises"));
  }
  const lines = [`${parts.join(" and ")}.`];

  if (r.waiting) {
    lines.push(
      `${count(Number(r.waiting), "commitment is", "commitments are")} waiting for you to say ` +
        "whose they are - they came out of notes several people were in, so copying them onto " +
        "everybody would turn one obligation into several. They are on Now."
    );
  }
  if (r.resolved) {
    lines.push(`${count(Number(r.resolved), "promise", "promises")} closed, ticked off in Nib.`);
  }
  if (r.dropped) {
    lines.push(
      `${count(Number(r.dropped), "waiting commitment", "waiting commitments")} dropped, ` +
        "settled in Nib before anybody filed them."
    );
  }
  if (r.retracted) {
    lines.push(
      `${count(Number(r.retracted), "contact record", "contact records")} withdrawn, because ` +
        "the note no longer carries the tag it was counted under."
    );
  }
  if (r.withdrawn) {
    lines.push(
      `${count(Number(r.withdrawn), "commitment", "commitments")} withdrawn, because the note ` +
        "no longer flags them. Marked as retracted rather than done, and still on the person's " +
        "page if you need to look."
    );
  }
  return lines.join(" ");
}

/** @param {any} folders @param {any} bindings @param {any} roster @param {any} status */
function nibSection(folders, bindings, roster, status) {
  const bound = Array.isArray(bindings) ? bindings : [];

  const rows = bound
    .map(
      (/** @type {any} */ b) => `<div class="row static">
        <span class="row-name">${esc(b.name || b.nibFolder)}${
          b.name && b.name !== b.nibFolder ? `<span class="src"> ${esc(b.nibFolder)}</span>` : ""
        }</span>
        <span class="row-right">
          <span class="row-meta">→ ${esc(b.person ?? "unknown")}${
            b.countsAs ? ` as ${esc(b.countsAs)}` : " - no tags mapped, so nothing counts yet"
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

    <!--
      Which notebook, said out loud whether or not anything is wrong.
      There is more than one on a machine that has ever moved its data, and the
      old one still parses and still lists folders - so reading the wrong one
      looks exactly like reading the right one.
    -->
    <p class="card-why dim mono-text">Reading ${esc(folders.dir ?? "an unknown folder")}</p>

    <article class="card">
      <div class="card-top"><h2 class="card-title">How this works</h2></div>
      <p class="card-why">Point a Nib folder at a person, then say which of your Nib tags supplies each kind of contact Tend tracks. Writing a tagged note is then the evidence that the contact happened, with nothing to confirm afterwards - and an untagged note counts as nothing, so a folder can hold every sort of note about somebody.</p>
      <p class="card-why dim">Flagged action points inside those notes become promises here, and ticking one off in Nib closes it here too. Tend only reads Nib.</p>
      <!--
        The state of the automatic import, because a background job nobody can
        see is a background job nobody believes. Without this line the honest
        move would be to press the button beside it every time, which is the
        habit the automatic import exists to remove.
      -->
      <p class="card-why ${status?.nibWatching ? "dim" : ""}">
        ${status?.nibWatching ? "Notes import themselves, within a second of being tagged." : "Notes import on a timer only - this window is not watching the notebook."}
        ${esc(String(status?.nibSync ?? ""))}
      </p>
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
      <p class="card-why dim">${esc(WHERE_FROM[String(status.dataDirFrom)] ?? WHERE_FROM.default)}</p>
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
 * The bulk "I left this job" action.
 *
 * One button, for the moment none of the per-item Archive buttons are the
 * right shape for: every person, project and workstream that is currently
 * active, archived in a single call. It is not a separate rule from those
 * per-item buttons - it calls the exact same reversible archive underneath,
 * one row at a time - so the card says plainly what that means: nothing is
 * deleted, and every one of them can be brought back individually from its
 * own archived list.
 */
/** @param {any} undoable */
function archiveSection(undoable) {
  return `<div class="group">
    <div class="group-head"><span class="group-title">Leaving a job</span><span class="group-rule"></span></div>
    <article class="card">
      <div class="card-top"><h2 class="card-title">Archive everyone and everything active</h2></div>
      <p class="card-why">For the moment a job ends. Archives every person, project and workstream that is currently active - all at once, instead of one at a time.</p>
      <p class="card-why dim">Nothing is deleted. Every 1-1, promise, decision and growth thread stays exactly as it is. Each one can be brought back on its own, whenever it is relevant again, from its archived list.</p>
      <div class="card-foot">
        <span class="src">Safe to run again - anything already archived is left untouched.</span>
        <button class="act danger" data-act="archiveEverything">Archive everything active</button>
      </div>
    </article>
    ${undoCard(undoable)}
  </div>`;
}

/**
 * The way back from one press, as one press.
 *
 * The per-item unarchive was the only route back, which made the two directions
 * badly matched: archiving a whole roster is one button, and putting it back was
 * thirty separate decisions with the app saying nothing in between. Worse, the
 * card above offered "reversible" as reassurance while that asymmetry was the
 * actual shape of it.
 *
 * Only shown while there is a run to undo, and it says how many rows are still
 * archived from that run rather than how many it changed at the time - anything
 * brought back by hand since is already back, and counting it again would
 * promise a restore that does not happen.
 *
 * @param {any} undoable
 */
function undoCard(undoable) {
  if (!undoable || typeof undoable !== "object" || undoable.error !== undefined) {
    return "";
  }
  const left = Number(undoable.people ?? 0) + Number(undoable.projects ?? 0) + Number(undoable.workstreams ?? 0);
  if (left === 0) {
    return "";
  }
  const when = Number.isFinite(Number(undoable.at))
    ? new Date(Number(undoable.at)).toLocaleDateString("sv-SE")
    : "an earlier run";
  const parts = [
    [undoable.people, "person", "people"],
    [undoable.projects, "project", "projects"],
    [undoable.workstreams, "workstream", "workstreams"]
  ]
    .filter(([n]) => Number(n) > 0)
    .map(([n, one, many]) => `${n} ${Number(n) === 1 ? one : many}`)
    .join(", ");

  return `<article class="card sev-ok">
    <div class="card-top"><h2 class="card-title">Undo the archive from ${esc(when)}</h2></div>
    <p class="card-why">Puts back ${esc(parts)} - only what that press archived, and only the ones still archived now. Anything you have already brought back by hand stays as it is, and nothing archived on its own before or after is touched.</p>
    <div class="card-foot">
      <span class="src">Offered until you use it, or archive everything again.</span>
      <button class="act primary" data-act="undoBulkArchive">Undo that archive</button>
    </div>
  </article>`;
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
        <span class="src">A model writes nothing here. Everything it produces is a draft, shown and thrown away unless you keep it yourself.</span>
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

/**
 * One row per kind of contact Tend tracks, answered with a Nib tag.
 *
 * This way round on purpose. Listing Nib's tags and asking what each MEANT put
 * the other app's vocabulary in charge of the question, so a folder of
 * conversations with a colleague was asked about `Principle` - a book tag, with
 * no sensible answer, in a list of five. Tend knows exactly which kinds of
 * contact it has cadences for; the notebook only has to say which tag supplies
 * each one.
 *
 * @param {any} catalog
 * @param {Map<string, string>} [chosen] Existing rules, keyed by kind.
 */
function tagFields(catalog, chosen = new Map()) {
  if (!catalog?.available || catalog.tags.length === 0) {
    return [];
  }
  const options = [
    { value: "", label: "No tag - Tend never sees this from here" },
    ...catalog.tags.map((/** @type {any} */ t) => ({ value: String(t.id), label: String(t.name) }))
  ];
  return NOTE_CONTACT_KINDS.map((kind, i) => ({
    name: `kind:${kind.value}`,
    label: kind.label,
    type: /** @type {const} */ ("select"),
    hint: i === 0 ? `Tags read from ${catalog.dir}.` : undefined,
    value: chosen.get(kind.value) ?? "",
    options
  }));
}

/**
 * The chosen rows, as rules.
 *
 * A tag can only supply one kind: two kinds pointing at the same tag would make
 * one note satisfy two cadences from a single piece of evidence, which is the
 * dishonest direction.
 *
 * @param {Record<string, any>} values
 */
function rulesFrom(values) {
  /** @type {{ tagId: string, kind: string }[]} */
  const rules = [];
  for (const [name, tagId] of Object.entries(values)) {
    if (!name.startsWith("kind:") || typeof tagId !== "string" || tagId === "") {
      continue;
    }
    if (!rules.some((rule) => rule.tagId === tagId)) {
      rules.push({ tagId, kind: name.slice(5) });
    }
  }
  return rules;
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
    const [catalog, bound] = await Promise.all([tend.invoke("nibTags"), tend.invoke("sources")]);

    if (!catalog?.available) {
      toast(String(catalog?.why ?? "Nib's tags could not be read."), "bad");
      return;
    }
    if (catalog.tags.length === 0) {
      toast(`No tags in the notebook at ${catalog.dir}. Make one in Nib first.`, "bad");
      return;
    }

    const binding = (Array.isArray(bound) ? bound : []).find((/** @type {any} */ b) => b.id === d.id);
    const chosen = new Map(
      (binding?.rules ?? []).map((/** @type {any} */ r) => [String(r.kind), String(r.tagId)])
    );

    const values = await form({
      title: `Tags in ${d.name}`,
      intro:
        "Tend asks; your notebook answers. For each kind of contact Tend tracks, pick the Nib " +
        "tag that means it. Leave one blank and Tend simply never sees that kind from this " +
        "folder - most people will use two or three.",
      fields: tagFields(catalog, chosen),
      confirm: "Save"
    });
    if (!values) {
      return;
    }

    const rules = rulesFrom(values);
    if (await act("setSourceRules", { id: d.id, rules }, `${rules.length} tag rule${rules.length === 1 ? "" : "s"} saved.`)) {
      refresh();
    }
  },

  bind: async () => {
    const [folders, roster, catalog] = await Promise.all([
      tend.invoke("nibFolders"),
      tend.invoke("people"),
      tend.invoke("nibTags")
    ]);
    if (!folders?.available) {
      return;
    }

    const values = await form({
      title: "Bind a Nib folder",
      intro:
        "Notes in this folder become contact with this person. What each note counts AS comes " +
        "from its tag in Nib - so a folder can hold every sort of note about somebody without " +
        "one you merely heard resetting the clock on having spoken to them. An untagged note " +
        "counts as nothing.",
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
          name: "people",
          label: "Whose notes these are",
          type: "multiselect",
          options: roster.map((/** @type {any} */ p) => ({ value: p.id, label: p.name }))
        },
        {
          name: "name",
          label: "What to call it (optional)",
          type: "text",
          value: ""
        },
        {
          name: "sharedNote",
          type: "note",
          label:
            "Naming more than one person makes this a meeting rather than a person's folder. " +
            "Each note there becomes contact with every one of them, so all their clocks move. " +
            "Flagged action points do NOT get copied onto everybody - there is no way to tell " +
            "whose each is, so they wait on Now until you say."
        },
        ...tagFields(catalog)
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

    const chosen = Array.isArray(values.people) ? values.people : [];
    if (chosen.length === 0) {
      toast("Pick at least one person - a folder bound to nobody imports nothing.", "bad");
      return;
    }

    const bound = await act(
      "bindSource",
      {
        people: chosen,
        name: String(values.name ?? "").trim(),
        categoryId,
        subId: subId || undefined,
        label
      },
      "Bound."
    );
    if (!bound) {
      return;
    }

    const rules = rulesFrom(values);
    if (rules.length > 0) {
      await act("setSourceRules", { id: String(bound.id), rules });
    }
    refresh();

    if (!catalog?.available || catalog.tags.length === 0) {
      // Said out loud rather than skipped: nothing happening with no reason
      // given was the original bug, and its cause was Tend having found a
      // DIFFERENT notebook with no tags in it.
      toast(
        catalog?.available
          ? `No tags in the notebook at ${catalog.dir}, so no note there counts as anything yet.`
          : `Could not read Nib's tags: ${catalog?.why ?? "unknown reason"}`,
        "bad"
      );
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
        `${importSummary(result)} From ${result.bindings} binding(s).` +
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
      body: `${importSummary(result)} Safe to run again whenever - nothing is ever duplicated.`,
      confirm: "Good"
    });
    refresh();
  },

  /** @param {Record<string, string>} d */
  switchMode: async (d) => {
    const toPrivate = d.to === "private";
    const sure = await ask({
      title: toPrivate ? "Switch to the private half?" : "Back to the work half?",
      body: toPrivate
        ? "The app restarts and opens a different store. Nothing from the work half is visible there, and nothing written there is ever read here."
        : "The app restarts and opens the work store again. Nothing written in the private half comes with it.",
      confirm: toPrivate ? "Switch" : "Switch back"
    });
    if (!sure) {
      return;
    }
    // No toast and no refresh: the app is on its way down. A success message
    // rendered into a window that is about to be replaced is a message nobody
    // reads, and a failure comes back as an error instead.
    const result = await tend.invoke("setMode", { mode: d.to });
    if (result?.error) {
      toast(String(result.error), "bad");
    }
  },

  openData: async () => {
    await act("openDataDir", {});
  },

  archiveEverything: async () => {
    const sure = await ask({
      title: "Archive everyone and everything active?",
      body:
        "Archives every person, project and workstream that is currently active, in one go. " +
        "Nothing is deleted - every 1-1, promise, decision and growth thread stays exactly as " +
        "it is, and each one can be brought back individually, whenever it is relevant again, " +
        "from its archived list.\n\n" +
        "Afterwards this page offers a single Undo that puts back exactly what this press " +
        "archived, so you do not have to reverse it one row at a time.",
      confirm: "Archive everything",
      tone: "danger"
    });
    if (!sure) {
      return;
    }
    const result = await act("archiveEverythingActive", {});
    if (!result) {
      return;
    }
    toast(`${result.people} people, ${result.projects} projects, ${result.workstreams} workstreams archived.`);
    refresh();
  },

  undoBulkArchive: async () => {
    const sure = await ask({
      title: "Undo that archive?",
      body:
        "Puts back everything that press archived and is still archived now. Rows you have " +
        "already brought back stay as they are, and anything archived on its own - before or " +
        "after that press - is left alone.",
      confirm: "Put them back"
    });
    if (!sure) {
      return;
    }
    const result = await act("undoBulkArchive", {});
    if (!result) {
      return;
    }
    toast(`${result.people} people, ${result.projects} projects, ${result.workstreams} workstreams back.`);
    refresh();
  },

  checkUpdate: async () => {
    await act("checkForUpdates", {}, "Checking.");
    setTimeout(refresh, 2500);
  }
};
