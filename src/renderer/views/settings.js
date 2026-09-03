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
import { T } from "../text.js";

const t = T.settings;

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
  env: t.whereFromEnv,
  "user-env": t.whereFromUserEnv,
  default: t.whereFromDefault
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
      <h1 class="view-title">${t.title}</h1>
      <p class="view-sub">${t.sub}</p>
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
      <span class="group-title">${t.halfGroup}</span>
      <span class="group-rule"></span>
      <span class="group-meta">${isPrivate ? t.halfPrivate : t.halfWork}</span>
    </div>
    <article class="card">
      <div class="card-top">
        <h2 class="card-title">${isPrivate ? t.privateTitle : t.workTitle}</h2>
      </div>
      <p class="card-why">
        ${isPrivate ? t.privateWhy : t.workWhy}
      </p>
      <p class="card-why dim">
        ${isPrivate ? t.privateNote : t.workNote}
      </p>
      <div class="card-foot">
        <span class="src mono-text">${esc(String(status?.dataDir ?? ""))}</span>
        <button class="act" data-act="switchMode" data-to="${isPrivate ? "work" : "private"}">
          ${isPrivate ? t.backToWork : t.switchToPrivate}
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

  const parts = [t.importAdded(count(Number(r.contacts ?? 0), t.contactRecordOne, t.contactRecordMany))];
  if (r.promises) {
    parts.push(count(Number(r.promises), t.promiseOne, t.promiseMany));
  }
  const lines = [`${parts.join(" and ")}.`];

  if (r.waiting) {
    lines.push(t.importWaiting(count(Number(r.waiting), t.commitmentIsOne, t.commitmentAreMany)));
  }
  if (r.resolved) {
    lines.push(t.importResolved(count(Number(r.resolved), t.promiseOne, t.promiseMany)));
  }
  if (r.dropped) {
    lines.push(t.importDropped(count(Number(r.dropped), t.waitingCommitmentOne, t.waitingCommitmentMany)));
  }
  if (r.retracted) {
    lines.push(t.importRetracted(count(Number(r.retracted), t.contactRecordOne, t.contactRecordMany)));
  }
  if (r.withdrawn) {
    lines.push(t.importWithdrawn(count(Number(r.withdrawn), t.commitmentOne, t.commitmentMany)));
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
          <span class="row-meta">${t.bindingMeta(
            esc(b.person ?? t.unknownPerson),
            b.countsAs ? t.bindingCountsAs(esc(b.countsAs)) : t.bindingNoTags
          )}</span>
          <button class="act tiny" data-act="rules" data-id="${esc(b.id)}" data-name="${esc(b.nibFolder)}">${t.tagsButton}</button>
          <button class="act tiny danger" data-act="unbind" data-id="${esc(b.id)}" data-name="${esc(b.nibFolder)}">${t.unbindButton}</button>
        </span>
      </div>`
    )
    .join("");

  if (!folders?.available) {
    return `<div class="group">
      <div class="group-head"><span class="group-title">${t.nibGroup}</span><span class="group-rule"></span></div>
      <article class="card sev-warn">
        <div class="card-top"><h2 class="card-title">${t.nibUnreadableTitle}</h2></div>
        <p class="card-why">${esc(folders?.why ?? t.nibUnknownReason)}</p>
        <p class="card-why dim">${t.nibReadOnly}</p>
      </article>
    </div>`;
  }

  const noPeople = !Array.isArray(roster) || roster.length === 0;

  return `<div class="group">
    <div class="group-head">
      <span class="group-title">${t.nibGroup}</span>
      <span class="group-rule"></span>
      <span class="group-meta">${t.nibBound(bound.length)}</span>
    </div>

    <!--
      Which notebook, said out loud whether or not anything is wrong.
      There is more than one on a machine that has ever moved its data, and the
      old one still parses and still lists folders - so reading the wrong one
      looks exactly like reading the right one.
    -->
    <p class="card-why dim mono-text">${t.nibReading(esc(folders.dir ?? t.nibUnknownFolder))}</p>

    <article class="card">
      <div class="card-top"><h2 class="card-title">${t.nibHowTitle}</h2></div>
      <p class="card-why">${t.nibHowWhy}</p>
      <p class="card-why dim">${t.nibHowNote}</p>
      <!--
        The state of the automatic import, because a background job nobody can
        see is a background job nobody believes. Without this line the honest
        move would be to press the button beside it every time, which is the
        habit the automatic import exists to remove.
      -->
      <p class="card-why ${status?.nibWatching ? "dim" : ""}">
        ${status?.nibWatching ? t.nibWatching : t.nibTimerOnly}
        ${esc(String(status?.nibSync ?? ""))}
      </p>
      <div class="card-foot">
        <span class="src">${t.nibFolderCount(folders.folders.length)}</span>
        <button class="act primary" data-act="bind" ${noPeople ? "disabled" : ""}>${t.bindButton}</button>
        <button class="act" data-act="indexDry" ${bound.length === 0 ? "disabled" : ""}>${t.previewButton}</button>
        <button class="act" data-act="index" ${bound.length === 0 ? "disabled" : ""}>${t.importButton}</button>
      </div>
    </article>

    ${noPeople ? `<div class="muted-row">${t.nibNoPeople}</div>` : ""}
    ${rows ? `<div class="rows">${rows}</div>` : `<div class="empty">${t.nibNothingBound}</div>`}
  </div>`;
}

/** @param {any} status */
function dataSection(status) {
  const warning = (status.warnings ?? []).length
    ? `<p class="card-why warn-text">${esc(status.warnings[status.warnings.length - 1])}</p>`
    : "";

  return `<div class="group">
    <div class="group-head"><span class="group-title">${t.dataGroup}</span><span class="group-rule"></span></div>
    <article class="card">
      <div class="card-top"><h2 class="card-title">${t.dataTitle}</h2></div>

      <p class="card-why mono-text">${esc(status.dataDir)}</p>
      <p class="card-why dim">${esc(WHERE_FROM[String(status.dataDirFrom)] ?? WHERE_FROM.default)}</p>
      <p class="card-why dim">${t.dataAppendOnly}</p>
      ${warning}
      <div class="card-foot">
        <span class="src">${t.dataNote}</span>
        <button class="act" data-act="openData">${t.openFolder}</button>
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
    <div class="group-head"><span class="group-title">${t.leavingGroup}</span><span class="group-rule"></span></div>
    <article class="card">
      <div class="card-top"><h2 class="card-title">${t.archiveAllTitle}</h2></div>
      <p class="card-why">${t.archiveAllWhy}</p>
      <p class="card-why dim">${t.archiveAllNote}</p>
      <div class="card-foot">
        <span class="src">${t.archiveAllSafe}</span>
        <button class="act danger" data-act="archiveEverything">${t.archiveAllButton}</button>
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
    : t.undoEarlierRun;
  const parts = [
    [undoable.people, t.personOne, t.personMany],
    [undoable.projects, t.projectOne, t.projectMany],
    [undoable.workstreams, t.workstreamOne, t.workstreamMany]
  ]
    .filter(([n]) => Number(n) > 0)
    .map(([n, one, many]) => `${n} ${Number(n) === 1 ? one : many}`)
    .join(", ");

  return `<article class="card sev-ok">
    <div class="card-top"><h2 class="card-title">${t.undoTitle(esc(when))}</h2></div>
    <p class="card-why">${t.undoWhy(esc(parts))}</p>
    <div class="card-foot">
      <span class="src">${t.undoOffered}</span>
      <button class="act primary" data-act="undoBulkArchive">${t.undoButton}</button>
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
    <div class="group-head"><span class="group-title">${t.draftingGroup}</span><span class="group-rule"></span></div>
    <article class="card${model.available ? "" : " sev-warn"}">
      <div class="card-top">
        <h2 class="card-title">${model.available ? t.draftingAvailable : t.draftingOff}</h2>
        <span class="pill plain">${model.available ? t.draftingSignedIn : t.draftingNotSetUp}</span>
      </div>
      ${
        model.available
          ? `<p class="card-why">${t.draftingWhat}</p>
             <p class="card-why dim">${t.draftingSignIn}</p>`
          : `<p class="card-why">${esc(model.why ?? "")}</p>
             <p class="card-why dim">${t.draftingWithout}</p>`
      }
      <div class="card-foot">
        <span class="src">${t.draftingNever}</span>
      </div>
    </article>
  </div>`;
}

/** @param {any} status */
function aboutSection(status) {
  return `<div class="group">
    <div class="group-head"><span class="group-title">${t.aboutGroup}</span><span class="group-rule"></span></div>
    <article class="card">
      <div class="card-top">
        <h2 class="card-title">${t.aboutTitle(esc(status.version ?? ""))}</h2>
        <span class="pill plain">${esc(status.packaged ? t.installed : t.development)}</span>
      </div>
      <p class="card-why">${status.packaged ? t.updatesOn : t.updatesOff}</p>
      <div class="card-foot">
        <span class="src">${esc(status.updateStatus ?? t.noUpdateCheck)}</span>
        ${status.packaged ? `<button class="act" data-act="checkUpdate">${t.checkNow}</button>` : ""}
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
    { value: "", label: t.tagNone },
    ...catalog.tags.map((/** @type {any} */ tag) => ({ value: String(tag.id), label: String(tag.name) }))
  ];
  return NOTE_CONTACT_KINDS.map((kind, i) => ({
    name: `kind:${kind.value}`,
    label: kind.label,
    type: /** @type {const} */ ("select"),
    hint: i === 0 ? t.tagsReadFrom(catalog.dir) : undefined,
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
      toast(String(catalog?.why ?? t.tagsUnreadable), "bad");
      return;
    }
    if (catalog.tags.length === 0) {
      toast(t.noTagsIn(catalog.dir), "bad");
      return;
    }

    const binding = (Array.isArray(bound) ? bound : []).find((/** @type {any} */ b) => b.id === d.id);
    const chosen = new Map(
      (binding?.rules ?? []).map((/** @type {any} */ r) => [String(r.kind), String(r.tagId)])
    );

    const values = await form({
      title: t.tagsTitle(d.name),
      intro: t.tagsIntro,
      fields: tagFields(catalog, chosen),
      confirm: t.save
    });
    if (!values) {
      return;
    }

    const rules = rulesFrom(values);
    if (await act("setSourceRules", { id: d.id, rules }, t.tagRulesSaved(rules.length))) {
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
      title: t.bindTitle,
      intro: t.bindIntro,
      fields: [
        {
          name: "folder",
          label: t.bindFolderLabel,
          type: "select",
          options: folders.folders.map((/** @type {any} */ f) => ({
            value: `${f.categoryId}|${f.subId ?? ""}`,
            label: t.bindFolderOption(f.label, f.notes)
          }))
        },
        {
          name: "people",
          label: t.bindPeopleLabel,
          type: "multiselect",
          options: roster.map((/** @type {any} */ p) => ({ value: p.id, label: p.name }))
        },
        {
          name: "name",
          label: t.bindNameLabel,
          type: "text",
          value: ""
        },
        {
          name: "sharedNote",
          type: "note",
          label: t.bindSharedNote
        },
        ...tagFields(catalog)
      ],
      confirm: t.bindConfirm
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
      toast(t.bindNobody, "bad");
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
      t.boundToast
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
          ? t.boundNoTags(catalog.dir)
          : t.boundTagsUnreadable(catalog?.why ?? t.unknownReason),
        "bad"
      );
    }
  },

  /** @param {Record<string, string>} d */
  unbind: async (d) => {
    const sure = await ask({
      title: t.unbindTitle(d.name),
      body: t.unbindBody,
      confirm: t.unbindButton,
      tone: "danger"
    });
    if (sure && (await act("unbindSource", { id: d.id }, t.unboundToast))) {
      refresh();
    }
  },

  indexDry: async () => {
    const result = await act("indexNib", { dry: true });
    if (!result) {
      return;
    }
    await ask({
      title: t.previewTitle,
      body: t.previewBody(
        importSummary(result),
        result.bindings,
        result.skipped?.length ? t.previewSkipped(result.skipped.join("; ")) : ""
      ),
      confirm: t.close
    });
  },

  index: async () => {
    const result = await act("indexNib", {});
    if (!result) {
      return;
    }
    await ask({
      title: t.importedTitle,
      body: t.importedBody(importSummary(result)),
      confirm: t.good
    });
    refresh();
  },

  /** @param {Record<string, string>} d */
  switchMode: async (d) => {
    const toPrivate = d.to === "private";
    const sure = await ask({
      title: toPrivate ? t.switchPrivateTitle : t.switchWorkTitle,
      body: toPrivate ? t.switchPrivateBody : t.switchWorkBody,
      confirm: toPrivate ? t.switchConfirm : t.switchBackConfirm
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
      title: t.archiveAllAskTitle,
      body: t.archiveAllAskBody,
      confirm: t.archiveAllConfirm,
      tone: "danger"
    });
    if (!sure) {
      return;
    }
    const result = await act("archiveEverythingActive", {});
    if (!result) {
      return;
    }
    toast(t.archivedToast(result.people, result.projects, result.workstreams));
    refresh();
  },

  undoBulkArchive: async () => {
    const sure = await ask({
      title: t.undoAskTitle,
      body: t.undoAskBody,
      confirm: t.undoConfirm
    });
    if (!sure) {
      return;
    }
    const result = await act("undoBulkArchive", {});
    if (!result) {
      return;
    }
    toast(t.undoneToast(result.people, result.projects, result.workstreams));
    refresh();
  },

  checkUpdate: async () => {
    await act("checkForUpdates", {}, t.checkingToast);
    setTimeout(refresh, 2500);
  }
};
