/**
 * People, grouped by relationship rather than by org chart.
 *
 * The grouping is the point in the work half. What you owe someone you lead
 * daily is not what you owe someone you manage from two teams away, and a tool
 * that lists them together hides the one gap that matters most.
 *
 * ## Both halves, from one file
 *
 * The private half has people too, and this page draws them - with a different
 * vocabulary and a much shorter person page. What differs is asked rather than
 * branched on: `vocabulary` says which relationships exist here and `person`
 * says which blocks this page may show, both from `domain/halves.js`.
 *
 * The first version of the private half did none of this, and the symptom was
 * exact: "Add someone" asked whether this person was one you lead and manage,
 * manage remotely, or are a stakeholder to. Six management relationships offered
 * for somebody's family, because the list was a constant compiled into this
 * file.
 */

import {
  act,
  ask,
  asDateInput,
  kindsFor,
  esc,
  form,
  pill,
  readFailed,
  readFailedHtml,
  tend
} from "../ui.js";
import { go, refresh } from "../app.js";
import { isRunning, modelActions, modelStatus, resultFor, run, themesHtml } from "../model.js";
import { actions as growthActions, threadsBlock } from "./growth.js";
import { actions as journalActions } from "./journal.js";
import { actions as waitingActions, waitingBlock } from "./waiting.js";
import { T } from "../text.js";

const t = T.people;

/**
 * This half's vocabulary, asked once per draw.
 *
 * Derived rather than written out, because the hand-written version of the group
 * list was the fourth copy of the same thing and it hid people: it had no row for
 * one relationship type, so everybody with that type simply did not appear on the
 * roster. No error, no empty group, no trace - in the store and off the page.
 *
 * Asked per draw rather than cached, because it is a local call and a cache here
 * would be the thing that survives a switch of halves.
 */
async function vocabulary() {
  const v = await tend.invoke("vocabulary");
  return {
    half: String(v?.half ?? "work"),
    relations: Array.isArray(v?.relations) ? v.relations : [],
    defaultRelation: String(v?.defaultRelation ?? "lead-and-manage")
  };
}

/** @param {Record<string, any>} params */
export async function render(params) {
  if (params.person) {
    return personPage(params.person);
  }

  const [roster, vocab, archived] = await Promise.all([
    tend.invoke("people"),
    vocabulary(),
    tend.invoke("archivedPeople")
  ]);
  const isPrivate = vocab.half === "private";

  const header = `
    <div class="view-head">
      <div class="head-row">
        <div>
          <h1 class="view-title">${t.title}</h1>
          <p class="view-sub">${
            isPrivate
              ? t.subPrivate
              : t.subWork
          }</p>
        </div>
        <button class="act primary" data-act="addPerson">${t.addButton}</button>
      </div>
    </div>`;

  // Its own group rather than a filter on the roster above: an archived
  // person is not a kind of active person, and mixing the two into one
  // list is how "who is active" quietly stops being a question this page
  // answers. Rendered even when the active roster is empty - the whole
  // roster archived one afternoon should not read as "nobody here", it
  // should read as "everybody is one click away".
  const archivedGroup = archivedGroupHtml(archived);

  if (readFailed(roster)) {
    return `${header}${readFailedHtml("the roster", roster)}${archivedGroup}`;
  }

  if (!Array.isArray(roster) || roster.length === 0) {
    // "Nobody yet" and "everybody is archived" are different facts, and after
    // the bulk archive the second one is the common case. Telling somebody who
    // has just archived a whole roster to "add the people you lead" reads as
    // though the record is gone.
    const anyArchived = Array.isArray(archived) && archived.length > 0;
    return `${header}<div class="empty">
      ${
        anyArchived
          ? t.emptyArchived
          : isPrivate
            ? t.emptyPrivate
            : t.emptyWork
      }
    </div>${archivedGroup}`;
  }

  const body = vocab.relations.map((/** @type {any} */ { value: relation, label }) => {
    const members = roster.filter((/** @type {any} */ p) => p.relation === relation);
    if (members.length === 0) {
      return "";
    }
    const rows = members
      .map(
        /*
         * The row carries the drift's severity, not only a pill saying it.
         *
         * A person 26 weeks behind used to look exactly like a person who is
         * fine, give or take one small word on the far right - so a roster had
         * to be read rather than scanned, which on the page whose whole job is
         * "who needs me" is the wrong way round. Cards already speak this
         * language; the roster now speaks the same one.
         *
         * Not in the private half: there is no drift there, and marking family
         * by urgency is the thing the empty right-hand side above exists to
         * avoid.
         */
        (/** @type {any} */ p) => `<button class="row${!isPrivate && p.worstDrift ? ` sev-${esc(p.worstDrift.urgency)}` : ""}" data-act="open" data-person="${esc(p.id)}">
          <span class="row-name">${esc(p.name)}</span>
          <span class="row-right">
            ${p.availability && !isPrivate ? `<span class="pill plain">${esc(p.availability)}</span>` : ""}
            ${
              isPrivate
                ? // Nothing on the right at all. There is no drift here, and "no
                  // duty applies" written beside somebody's family is worse than
                  // an empty row - it answers a question nobody asked.
                  ""
                : p.worstDrift
                  ? `<span class="row-meta">${esc(p.worstDrift.duty)}</span>${pill(p.worstDrift.urgency)}<span class="pill plain">${esc(p.worstDrift.behindBy)}</span>`
                  : `<span class="row-meta">${p.availability === "away" ? t.awayNothing : p.availability === "left" ? t.leftNothing : t.noDuty}</span>`
            }
          </span>
        </button>`
      )
      .join("");
    return `<div class="group">
      <div class="group-head"><span class="group-title">${esc(label)}</span><span class="group-rule"></span><span class="group-meta">${members.length}</span></div>
      <div class="rows">${rows}</div>
    </div>`;
  }).join("");

  return header + body + archivedGroup;
}

/**
 * The "show archived" path: a closed-by-default group at the bottom of the
 * roster, not a fourth relationship group above - an archived person is not
 * currently anyone you lead, manage or live beside, and listing them
 * alongside people who are would make the roster answer "who is active"
 * wrong. `<details>` rather than a toggle button wired to `refresh()`: the
 * open/closed state is free, and it needs no action of its own - only
 * `actions.open` and `actions.unarchive`, both of which already exist.
 *
 * @param {any[] | {error: string}} archived
 */
function archivedGroupHtml(archived) {
  // A failed read said "nothing is archived", which on the one page where the
  // archived group may be the only content is the most misleading answer
  // available.
  if (readFailed(archived)) {
    return readFailedHtml("the archived people", archived);
  }
  const rows = Array.isArray(archived) ? archived : [];
  if (rows.length === 0) {
    return "";
  }
  const items = rows
    .map(
      (/** @type {any} */ p) => `<div class="row static">
        <span class="row-name">${esc(p.name)}</span>
        <span class="row-right">
          <span class="pill plain">${t.archivedOn(esc(new Date(Number(p.archivedAt)).toISOString().slice(0, 10)))}</span>
          <button class="act tiny" data-act="open" data-person="${esc(p.id)}">${t.view}</button>
          <button class="act tiny" data-act="unarchive" data-person="${esc(p.id)}" data-name="${esc(p.name)}">${t.unarchive}</button>
        </span>
      </div>`
    )
    .join("");
  return `<details class="group archived-group">
    <summary class="group-head archived-summary">
      <span class="group-title">${t.archivedGroup}</span><span class="group-rule"></span><span class="group-meta">${rows.length}</span>
    </summary>
    <div class="rows">${items}</div>
  </details>`;
}

/** @param {string} id */
async function personPage(id) {
  const p = await tend.invoke("person", { person: id });
  if (p.error) {
    return `<div class="card sev-critical"><div class="card-top">
      <h2 class="card-title">${t.notFoundTitle}</h2></div><p class="card-why">${esc(p.error)}</p>
      <div class="card-foot"><button class="act" data-act="back">${t.allPeople}</button></div></div>`;
  }

  const list = (/** @type {string} */ title, /** @type {string} */ body, /** @type {string} */ emptyText) =>
    `<div class="block"><div class="block-title">${esc(title)}</div>${body || `<div class="empty">${esc(emptyText)}</div>`}</div>`;

  /*
   * A block whose rows are shut, with a line saying what they amount to.
   *
   * `<details>` rather than a button wired to a refresh, the same choice the
   * archived roster group makes and for the same reason: the open state is free
   * and it needs no action of its own.
   *
   * The summary line is not a repeat of the title. The title says what the
   * block is; the line says what is in it, which is the part that decides
   * whether it is worth opening.
   */
  const folded = (
    /** @type {string} */ title,
    /** @type {string} */ summary,
    /** @type {string} */ body,
    /** @type {string} */ emptyText
  ) =>
    body === ""
      ? `<div class="block"><div class="block-title">${esc(title)}</div><div class="empty">${esc(emptyText)}</div></div>`
      : `<details class="block block-fold">
          <summary class="block-fold-head">
            <span class="block-title">${esc(title)}</span>
            <span class="block-fold-sum">${esc(summary)}</span>
          </summary>
          ${body}
        </details>`;

  const cadences = p.cadences
    .map(
      (/** @type {any} */ c) => `<div class="line">
        <span class="line-when">${esc(c.behindBy)}</span>
        <span class="line-text"><strong>${esc(c.duty)}</strong> - target ${esc(c.target)}, last ${esc(c.lastHappened)}</span>
        <span class="line-right">${pill(c.urgency)}</span>
      </div>`
    )
    .join("");

  const promises = p.openPromises
    .map(
      (/** @type {any} */ x) => `<div class="line">
        <span class="line-when">${esc(x.openFor)}</span>
        <span class="line-text">${esc(x.text)}</span>
        <span class="line-right">
          ${pill(x.urgency)}
          <button class="act tiny" data-act="resolvePromise" data-id="${esc(x.id)}">Done</button>
        </span>
      </div>`
    )
    .join("");

  /*
   * Each line can be taken back. A contact logged against the wrong person, or
   * as the wrong kind, is worse than no log at all: it moves a clock and then
   * looks identical to a real one. There was no way to undo it.
   *
   * The button goes inside `line-right` like every other control on a `line`,
   * and that wrapper is not decoration - it carries `flex: none`. Without it the
   * button is a shrinkable flex item beside a note that can be a paragraph, so a
   * long note squeezed "Not right" until the label wrapped onto two lines and the
   * row grew to fit it. Three rows had been written without it.
   */
  /** One history row, with its own take-it-back button. */
  const contactLine = (/** @type {any} */ row) => `<div class="line">
        <span class="line-when">${esc(row.when)}</span>
        <span class="line-text"><strong>${esc(row.kind)}</strong>${row.note ? ` - ${esc(row.note)}` : ""}</span>
        <span class="line-right">
          ${
            /*
             * Said only when it came from somewhere. A label on every row stops
             * being read, and "typed by hand" is the assumption anyway - what
             * needs marking is the row nobody typed, because that is the one
             * whose text and date came from a note rather than from a decision.
             */
            row.from === "nib" ? `<span class="pill plain">from a note</span>` : ""
          }
          <button class="act tiny danger" data-act="unlogContact" data-id="${esc(row.id)}"
            data-what="${esc(row.kind)}${row.note ? ` - ${esc(row.note)}` : ""}">${t.notRight}</button>
        </span>
      </div>`;

  /*
   * Runs of identical rows fold into one, and open again on a click.
   *
   * Fifteen consecutive rows reading "1-1 (backfilled from the calendar)" are
   * one fact - an import ran - written fifteen times. Folding them is not
   * hiding anything: each row keeps its own "Not right" button one click away,
   * which matters because a mislogged contact moves a clock and then looks
   * exactly like a real one.
   *
   * Consecutive only. Two identical rows either side of a real conversation are
   * not the same run, and merging across it would put the conversation inside a
   * fold that claims to be about the import.
   */
  /** @type {{ key: string, rows: any[] }[]} */
  const runs = [];
  for (const row of p.recentContact) {
    /*
     * `JSON.stringify` rather than the two joined by a separator character.
     *
     * A separator has to be a byte that cannot appear in either half, and the
     * obvious choices are exactly the bytes that get eaten in transit - a space
     * written here once arrived as a NUL, which left the file classified as
     * binary while behaving correctly. An encoded array has no separator to
     * lose, and `nib.js` reaches for it for the same reason.
     */
    const key = JSON.stringify([row.kind ?? null, row.note ?? null]);
    const last = runs[runs.length - 1];
    if (last !== undefined && last.key === key) {
      last.rows.push(row);
    } else {
      runs.push({ key, rows: [row] });
    }
  }

  const contact = runs
    .map((run) => {
      if (run.rows.length < 3) {
        return run.rows.map(contactLine).join("");
      }
      const first = run.rows[run.rows.length - 1];
      const latest = run.rows[0];
      const one = run.rows[0];
      return `<details class="line-fold">
        <summary class="line">
          <span class="line-when">${esc(first.when)} - ${esc(latest.when)}</span>
          <span class="line-text"><strong>${esc(one.kind)}</strong>${one.note ? ` - ${esc(one.note)}` : ""}</span>
          <span class="line-right"><span class="pill plain">${t.identical(run.rows.length)}</span></span>
        </summary>
        <div class="line-fold-rows">${run.rows.map(contactLine).join("")}</div>
      </details>`;
    })
    .join("");

  /*
   * What the rows amount to, said in one line so the rows themselves can stay
   * shut. Every number comes from the service, counted over the whole set
   * rather than the capped twenty rendered above - see domain/contact.js.
   */
  const cs = p.contactSummary ?? { total: 0 };
  const month = (/** @type {number} */ at) =>
    new Date(at).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  const contactSummaryLine =
    cs.total === 0
      ? t.noContactYet
      : [
          t.countOf(cs.total, cs.total === 1 ? t.conversationOne : t.conversationMany),
          cs.firstAt === null || cs.total < 2 ? null : t.since(month(cs.firstAt)),
          cs.everyDays === null
            ? null
            : t.roughlyEvery(cs.everyDays, cs.everyDays === 1 ? t.dayOne : t.dayMany),
          cs.lastWords === null || cs.lastWords === undefined ? null : t.lastAt(cs.lastWords)
        ]
          .filter((part) => part !== null)
          .join(" · ");

  // Kept as its own block. A cancellation is not a conversation, and the two
  // have to stay legible as different things - the whole value is in the
  // difference between "we never booked it" and "we booked it three times".
  const skipped = (p.skipped ?? [])
    .map(
      (/** @type {any} */ sk) => `<div class="line">
        <span class="line-when">${esc(sk.when)}</span>
        <span class="line-text">${t.didNotHappen(esc(sk.kind), sk.why ? t.skipWhy(esc(sk.why)) : "")}</span>
        <span class="line-right">
          <button class="act tiny danger" data-act="unlogSkip" data-id="${esc(sk.id)}"
            data-what="${t.skipWhat(esc(sk.kind))}">${t.notRight}</button>
        </span>
      </div>`
    )
    .join("");

  /*
   * What this page may show, decided by the half rather than by conditions
   * scattered down the middle of this function.
   *
   * The distinction is not cosmetic. A growth thread is a direction you have
   * decided somebody should develop in, with a marker you watch for - run that
   * on your own child and the tool has become something else. An observation is
   * a record of somebody else's state, which is precisely what the private
   * journal's one rule forbids. Contact and cancellations feed cadences, and
   * there are none here.
   */
  const blocks = p.blocks ?? {
    cadences: true,
    promises: true,
    waiting: true,
    growth: true,
    topics: true,
    skips: true,
    themes: true
  };

  const model = await modelStatus();
  const themesKey = `themes:${p.id}`;
  const growing = blocks.growth ? await threadsBlock(String(p.id)) : "";
  const waitingOn = blocks.waiting ? await waitingBlock(String(p.id)) : "";

  /*
   * Moments: one thing that happened, and his own part in it.
   *
   * The answer to "how has it been going", which promises and waiting cannot
   * give. His own part is shown first and in full, because it is the half of the
   * record that is his and the half worth re-reading; what happened sits under it
   * as context and is often absent, which is fine.
   */
  const moments = blocks.moments
    ? /** @type {any[]} */ (await tend.invoke("momentsFor", { person: String(p.id) }))
    : [];
  const momentLines = (Array.isArray(moments) ? moments : [])
    .map(
      (/** @type {any} */ m) => `<div class="line">
        <span class="line-when">${esc(m.when)}</span>
        <span class="line-text">${esc(m.part)}${
          m.what ? `<span class="src">${esc(m.what)}</span>` : ""
        }${
          (m.alsoThere ?? []).length > 0
            ? `<span class="src">${t.alsoThere(esc(m.alsoThere.join(", ")))}</span>`
            : ""
        }</span>
        <span class="line-right">
          <button class="act tiny danger" data-act="unlogMoment" data-id="${esc(m.id)}"
            data-what="${esc(m.part)}">${t.notRight}</button>
        </span>
      </div>`
    )
    .join("");


  const observations = p.observations
    .map(
      (/** @type {any} */ e) => `<div class="line">
        <span class="line-when">${esc(new Date(Number(e.at)).toISOString().slice(0, 10))}</span>
        <span class="line-text">${esc(e.text)}</span>
      </div>`
    )
    .join("");

  /*
   * Material that lives elsewhere.
   *
   * The age is on every row and it is not decoration. A reading prepared before
   * a conversation stops being current the moment that conversation happens, and
   * an undated link on somebody's page reads as advice months after it stopped
   * being any such thing. Nothing expires on its own - deciding a reading is
   * spent is a judgement, and quietly hiding it would be worse than showing it
   * plainly marked as six months old.
   *
   * A real anchor rather than a button: the main process already sends anything
   * outside the app to the real browser, so this needs no action of its own and
   * gets middle-click and copy-link for free.
   */
  const linked = (p.links ?? [])
    .map(
      (/** @type {any} */ l) => `<div class="line">
        <span class="line-when">${esc(l.added)}</span>
        <span class="line-text">
          <a href="${esc(l.url)}" target="_blank" rel="noreferrer noopener">${esc(l.title)}</a>
          ${l.note ? `<span class="src"> ${esc(l.note)}</span>` : ""}
        </span>
        <span class="line-right">
          <button class="act tiny danger" data-act="unlink" data-id="${esc(l.id)}" data-name="${esc(l.title)}">${t.remove}</button>
        </span>
      </div>`
    )
    .join("");

  return `
    <div class="view-head"><button class="act" data-act="back">${t.back}</button></div>
    <div class="panel">
      <div class="panel-head">
        <div>
          <h2 class="panel-name">${esc(p.name)}</h2>
          <p class="panel-role">${esc(p.relationMeans)}</p>
        </div>
        <div class="panel-actions">
          <span class="tag">${esc(p.relation)}</span>
          <button class="act" data-act="edit" data-person="${esc(p.id)}">${t.edit}</button>
        </div>
      </div>

      <div class="button-row">
        ${blocks.cadences ? `<button class="act primary" data-act="logContact" data-person="${esc(p.id)}">${t.logContactButton}</button>` : ""}
        ${blocks.skips ? `<button class="act" data-act="logSkip" data-person="${esc(p.id)}">${t.logSkipButton}</button>` : ""}
        <!--
          The one action that is in both halves, and the primary one where it is
          the only one. A promise is owed the same way to somebody you live with,
          and the person let down is let down in the same way.
        -->
        ${
          blocks.moments
            ? `<button class="act primary" data-act="logMoment" data-person="${esc(p.id)}">${t.logMomentButton}</button>`
            : ""
        }
        <button class="act" data-act="logPromise" data-person="${esc(p.id)}">I promised something</button>
        <button class="act" data-act="link" data-person="${esc(p.id)}">${t.linkButton}</button>
        ${blocks.observations ? `<button class="act" data-act="logEvidence" data-person="${esc(p.id)}">${t.observationButton}</button>` : ""}
        ${
          blocks.observations && model.available
            ? isRunning(themesKey)
              ? `<button class="act" disabled>${t.readingNotes}</button>`
              : `<button class="act" data-act="findThemes" data-person="${esc(p.id)}">${t.themesButton}</button>`
            : ""
        }
      </div>

      ${resultFor(themesKey) === null ? "" : themesHtml(themesKey, resultFor(themesKey))}

      ${blocks.cadences ? list(t.cadencesBlock, cadences, t.cadencesNone) : ""}
      ${list(t.promisesBlock, promises, t.promisesNone)}
      ${waitingOn}
      ${growing}
      ${blocks.skips && p.skipPattern ? `<p class="card-why dim">${esc(p.skipPattern)}</p>` : ""}
      ${
        /*
         * Observations first, history after, and the history shut.
         *
         * The order was the other way round, which put fifteen rows saying an
         * import ran above the material a review conversation is built from.
         * Contact history answers "are we in step", which the cadences block
         * above has already answered in one badge; the rows themselves are only
         * wanted when something looks wrong.
         */
        blocks.observations
          ? list(t.observationsBlock, observations, t.observationsNone)
          : ""
      }
      ${
        blocks.cadences
          ? folded(t.historyBlock, contactSummaryLine, contact, t.noContactYet)
          : ""
      }
      ${blocks.skips && skipped ? list(t.skippedBlock, skipped, "") : ""}
      ${list(t.linkedBlock, linked, t.linkedNone)}
      ${
        blocks.moments
          ? list(
              t.momentsBlock,
              momentLines,
              t.momentsNone
            )
          : ""
      }

      <!--
        Own block, not inside danger-zone: archiving is reversible and does
        not belong beside Remove, which is not. Confusing the two would put
        the one destructive action a click away from the one that is not.
      -->
      <div class="block">
        ${
          p.archivedAt
            ? `<p class="card-why dim">${t.archivedNote(esc(new Date(Number(p.archivedAt)).toISOString().slice(0, 10)))}</p>
               <button class="act" data-act="unarchive" data-person="${esc(p.id)}" data-name="${esc(p.name)}">${t.unarchiveNamed(esc(p.name))}</button>`
            : `<button class="act" data-act="archive" data-person="${esc(p.id)}" data-name="${esc(p.name)}">${t.archiveNamed(esc(p.name))}</button>`
        }
      </div>

      <div class="block danger-zone">
        <button class="act danger" data-act="remove" data-person="${esc(p.id)}" data-name="${esc(p.name)}">${t.removeNamed(esc(p.name))}</button>
      </div>
    </div>
  `;
}

/**
 * Shared with the Now view's first-run card.
 *
 * @returns {Promise<boolean>} Whether someone was added.
 */
export async function addPersonDialog() {
  const vocab = await vocabulary();
  const isPrivate = vocab.half === "private";

  const values = await form({
    title: t.addTitle,
    intro: isPrivate
      ? // No mention of duties, because there are none. The relationship here is a
        // label: it groups the list and it sits on their page, and nothing is
        // derived from it. Saying so is the difference between a field somebody
        // answers carefully and a field somebody answers wrong on purpose.
        t.addIntroPrivate
      : t.addIntroWork,
    fields: [
      { name: "name", label: t.nameLabel, required: true, placeholder: isPrivate ? t.namePlaceholderPrivate : t.namePlaceholderWork },
      {
        name: "relation",
        label: isPrivate ? t.relationPrivate : t.relationWork,
        type: "select",
        // Asked, not compiled in. This is the field that offered six management
        // relationships for somebody's family.
        options: vocab.relations.map((/** @type {any} */ r) => ({ value: r.value, label: r.choice })),
        value: vocab.defaultRelation
      },
      // The start date exists to give a cadence something to measure from before
      // there is contact to measure from instead. With no cadences it is a
      // question with no consequence, and asking "since when" about a parent is
      // its own small absurdity.
      ...(isPrivate
        ? []
        : [
            {
              name: "since",
              label: t.sinceLabel,
              type: /** @type {const} */ ("date"),
              value: asDateInput(Date.now()),
              hint: t.addSinceHint
            }
          ])
    ],
    confirm: t.add
  });
  if (!values) {
    return false;
  }
  return Boolean(await act("addPerson", values, t.addedNamed(values.name)));
}

export const actions = {
  // Growth's dialogs are shared with the prep card rather than written twice.
  // Both surfaces offer the same six things, and a second copy of any of them is
  // a copy that drifts.
  ...growthActions,
  ...waitingActions,

  /** The retry offered when a read failed rather than came back empty. */
  reload: () => {
    refresh();
  },

  /*
   * Logging a moment is the journal's dialog, opened with this person pre-ticked.
   *
   * Shared rather than written twice. It is the same act from two places, and two
   * copies of a form with a required field and a person picker is two copies that
   * drift - which this project has paid for four times over in derived lists.
   */
  logMoment: (/** @type {Record<string, string>} */ d) => journalActions.logMoment(d),

  /** @param {Record<string, string>} d */
  unlogMoment: async (d) => {
    const sure = await ask({
      title: t.unlogMomentTitle,
      body: t.unlogMomentBody(d.what),
      confirm: t.remove,
      tone: "danger"
    });
    if (sure && (await act("removeRow", { collection: "moments", id: d.id }, t.removedToast))) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  logSkip: async (d) => {
    const values = await form({
      title: t.skipTitle,
      intro: t.skipIntro,
      fields: [
        {
          name: "kind",
          label: t.skipKindLabel,
          type: "select",
          options: kindsFor("person").filter((k) => k.value !== "second-hand" && k.value !== "survey"),
          value: "one-to-one"
        },
        {
          name: "why",
          label: t.skipWhyLabel,
          placeholder: t.skipWhyPlaceholder,
          hint: t.skipWhyHint
        },
        { name: "at", label: t.skipWhenLabel, type: "date", value: asDateInput(Date.now()) }
      ],
      confirm: t.recordIt
    });
    if (!values) {
      return;
    }
    if (await act("logSkip", { person: d.person, ...values }, t.recordedToast)) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  unlogSkip: async (d) => {
    const sure = await ask({
      title: t.takeBackTitle,
      body: t.unlogSkipBody(d.what),
      confirm: t.takeItBack,
      tone: "danger"
    });
    if (sure && (await act("removeRow", { collection: "skips", id: d.id }, t.takenBackToast))) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  unlogContact: async (d) => {
    const sure = await ask({
      title: t.takeBackTitle,
      body: t.unlogContactBody(d.what),
      confirm: t.takeItBack,
      tone: "danger"
    });
    if (sure && (await act("removeRow", { collection: "touches", id: d.id }, t.takenBackToast))) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  open: (d) => go("people", { person: d.person }),
  back: () => go("people"),

  /**
   * Read across their notes and name what recurs.
   *
   * A draft, and only ever a draft. There used to be a second path that wrote
   * what it found into the record, guarded by an `apply` flag - and nothing
   * ever passed it, so the collection it wrote to could not contain a row while
   * Settings told the user a model might have put one there. The write is gone
   * rather than wired up: a stored claim about a colleague goes stale as the
   * notes under it change, which is the same reason a brief is never kept.
   *
   * @param {Record<string, string>} d
   */
  findThemes: (d) => run(`themes:${d.person}`, "detectThemes", { person: d.person }),

  ...modelActions(),

  addPerson: async () => {
    if (await addPersonDialog()) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  edit: async (d) => {
    const [p, editVocab] = await Promise.all([
      tend.invoke("person", { person: d.person }),
      vocabulary()
    ]);
    if (p.error) {
      return;
    }
    const values = await form({
      title: t.editTitle(p.name),
      intro: t.editIntro,
      fields: [
        { name: "name", label: t.nameLabel, value: p.name, required: true },
        {
          name: "relation",
          label: editVocab.half === "private" ? t.relationPrivate : t.relationWork,
          type: "select",
          // The half's own vocabulary. Offering the work list here would let a
          // private person be edited into a management relationship, and the
          // service would then refuse the save with a message about duties.
          options: editVocab.relations.map((/** @type {any} */ r) => ({ value: r.value, label: r.choice })),
          value: p.relation
        },
        {
          name: "since",
          label: t.sinceLabel,
          type: "date",
          value: p.since ? asDateInput(p.since) : "",
          hint: t.editSinceHint
        },
        {
          name: "awayUntil",
          label: t.awayLabel,
          type: "date",
          value: p.awayUntil ? asDateInput(p.awayUntil) : "",
          hint: t.awayHint
        },
        {
          name: "leftAt",
          label: t.leftLabel,
          type: "date",
          value: p.leftAt ? asDateInput(p.leftAt) : "",
          hint: t.leftHint
        }
      ],
      confirm: t.save
    });
    if (!values) {
      return;
    }
    // An empty date field arrives as undefined, which the service reads as
    // "leave it alone". For these two, empty has to mean "clear it" - somebody
    // coming back early, or a resignation withdrawn - so it is made explicit.
    const fields = {
      ...values,
      awayUntil: values.awayUntil ?? null,
      leftAt: values.leftAt ?? null
    };
    if (await act("updatePerson", { person: d.person, fields }, t.updatedToast)) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  logContact: async (d) => {
    const values = await form({
      title: t.logTitle,
      intro: t.logIntro,
      fields: [
        // A person can only be the subject of the person kinds. The project and
        // workstream ones were on this list too, and picking one recorded
        // something that satisfied nothing while the toast still said Logged.
        { name: "kind", label: t.logKindLabel, type: "select", options: kindsFor("person"), value: "one-to-one" },
        { name: "note", label: t.logNoteLabel, placeholder: t.logNotePlaceholder },
        { name: "at", label: t.when, type: "date", value: asDateInput(Date.now()), hint: t.logWhenHint }
      ],
      confirm: t.logIt
    });
    if (!values) {
      return;
    }
    if (await act("logTouch", { subject: d.person, ...values }, t.loggedToast)) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  logPromise: async (d) => {
    const values = await form({
      title: t.promiseTitle,
      intro: t.promiseIntro,
      fields: [
        { name: "text", label: t.promiseTextLabel, required: true, type: "textarea", placeholder: t.promiseTextPlaceholder },
        { name: "due", label: t.promiseDueLabel, type: "date" },
        { name: "madeAt", label: t.promiseMadeLabel, type: "date", value: asDateInput(Date.now()), hint: t.promiseMadeHint }
      ],
      confirm: t.logIt
    });
    if (!values) {
      return;
    }
    if (await act("logPromise", { person: d.person, ...values }, t.loggedToast)) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  /**
   * Point at material that lives outside Tend.
   *
   * @param {Record<string, string>} d
   */
  link: async (d) => {
    const values = await form({
      title: t.linkTitle,
      intro: t.linkIntro,
      fields: [
        { name: "url", label: t.linkUrlLabel, placeholder: t.linkUrlPlaceholder, required: true },
        { name: "title", label: t.linkTitleLabel, placeholder: t.linkTitlePlaceholder },
        { name: "note", label: t.linkNoteLabel, type: "textarea" }
      ],
      confirm: t.linkConfirm
    });
    if (!values) {
      return;
    }
    if (await act("linkTo", { person: d.person, ...values }, t.linkedToast)) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  unlink: async (d) => {
    const sure = await ask({
      title: t.unlinkTitle(d.name),
      body: t.unlinkBody,
      confirm: t.remove,
      tone: "danger"
    });
    if (sure && (await act("unlink", { id: d.id }, t.removedToast))) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  logEvidence: async (d) => {
    const values = await form({
      title: t.observationTitle,
      intro: t.observationIntro,
      fields: [
        { name: "text", label: t.observationTextLabel, type: "textarea", required: true },
        { name: "area", label: t.observationAreaLabel, placeholder: t.observationAreaPlaceholder }
      ],
      confirm: t.recordIt
    });
    if (!values) {
      return;
    }
    if (await act("logEvidence", { person: d.person, ...values }, t.recordedToast)) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  resolvePromise: async (d) => {
    if (await act("resolvePromise", { id: d.id, as: "resolved" }, t.closedToast)) {
      refresh();
    }
  },

  /**
   * Reversible, unlike `remove` below - so it gets its own, gentler dialog
   * rather than reusing the danger-zone one.
   *
   * @param {Record<string, string>} d
   */
  archive: async (d) => {
    const sure = await ask({
      title: t.archiveTitle(d.name),
      body: t.archiveBody,
      confirm: t.archive,
      tone: "danger"
    });
    if (!sure) {
      return;
    }
    if (await act("archivePerson", { id: d.person }, t.archivedToast(d.name))) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  unarchive: async (d) => {
    if (await act("unarchivePerson", { id: d.person }, t.unarchivedToast(d.name))) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  remove: async (d) => {
    const sure = await ask({
      title: t.removeTitle(d.name),
      body: t.removeBody,
      confirm: t.remove,
      tone: "danger"
    });
    if (!sure) {
      return;
    }
    if (await act("removeRow", { collection: "people", id: d.person }, t.removedNamed(d.name))) {
      go("people");
    }
  }
};
