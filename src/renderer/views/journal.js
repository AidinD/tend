/**
 * The day, in four boxes - and the pass that reads them.
 *
 * Its own place in the rail because it is its own act. Prep is what you read
 * before talking to somebody; this is what you write after a day, and folding it
 * into another view would make both of them worse.
 *
 * ## No prompt, and no count in the rail
 *
 * Every other view earns a number beside its name because something there is
 * waiting. Nothing here waits. Days get missed and that is the design, so a
 * badge would only ever be a reproach - and a tool that reproaches you every
 * evening is one you stop opening, which takes the data with it.
 *
 * ## The page says how thin it is
 *
 * Because a pass over five entries and a pass over twenty-five are different
 * claims. Saying so here, above any reading rather than inside it, means the
 * honesty is structural rather than something a model has to remember to
 * mention.
 *
 * ## In the private half, the rule is in the form
 *
 * An entry there records the interaction and his own part in it, never the other
 * person's state. The check that reads an entry back against that rule exists,
 * but the cheaper half of enforcing it is upstream: the labels and hints on the
 * form say the rule while it is being written, which is worth more than any
 * amount of reading it back afterwards.
 *
 * ## Why the reading is a button and not a schedule
 *
 * The entries were always the means and the reading is the product, but a
 * reading that arrives unasked on the first of the month is a verdict delivered
 * to somebody who was not asking for one. The whole design of this page is that
 * nothing here nags, and the pass over it does not get an exception.
 */

import { act, asDateInput, esc, form, tend } from "../ui.js";
import { isRunning, modelActions, modelStatus, ownPartHtml, resultFor, reviewHtml, run } from "../model.js";
import { refresh } from "../app.js";

/** The key the current reading is held under. One at a time is enough. */
const REVIEW_KEY = "review:journal";

export async function render() {
  const [result, kept, model, status, mine] = await Promise.all([
    tend.invoke("journal"),
    tend.invoke("reviews"),
    modelStatus(),
    tend.invoke("status"),
    tend.invoke("myAttention")
  ]);
  // The same signal the Now view shows, read here because this is the page you
  // are already on when you write an evening down - which is the moment a line
  // about unread material costs nothing and a badge in the rail would be a
  // reproach.
  const backlog = (Array.isArray(mine) ? mine : []).find(
    (/** @type {any} */ s) => s.key === "i-have-written-and-not-read"
  );
  const isPrivate = String(status?.mode ?? "work") === "private";

  if (result?.error) {
    return `<div class="card sev-critical"><div class="card-top">
      <h2 class="card-title">Could not read the journal</h2></div>
      <p class="card-why">${esc(result.error)}</p></div>`;
  }

  const entries = Array.isArray(result.entries) ? result.entries : [];
  const cover = result.coverage ?? { summary: "", thin: true, spread: 0 };

  const head = `
    <div class="view-head">
      <div class="head-row">
        <div>
          <h1 class="view-title">The day</h1>
          <p class="view-sub">
            ${
              isPrivate
                ? `Four boxes, all optional, no reminder and no streak. One rule, and it is the
                   whole reason this is safe to write: record what happened and your own part in
                   it, never the other person's state. That is the half you can change, and it is
                   the only version you could show the person it is about.`
                : `Four boxes, all optional, no reminder and no streak. Missing days is
                   expected - the value is in a month of them rather than in any one, so
                   the only thing that matters is that writing one is cheap.`
            }
          </p>
        </div>
        <button class="act primary" data-act="writeEntry">Write today</button>
      </div>
    </div>`;

  const coverage = `
    <p class="prep-dropped">
      ${esc(cover.summary)}${
        cover.spread > 0 && cover.thin
          ? " Too few to call anything a pattern yet, which is worth knowing before any reading is read."
          : ""
      }
    </p>`;

  if (entries.length === 0) {
    return `${head}
      <div class="empty">
        Nothing written yet. The questions are what took the day, what you
        avoided, and what you would do differently - none of them things Tend can
        work out on its own, which is the only reason it asks.
      </div>`;
  }

  const fields = Array.isArray(result.fields) ? result.fields : [];

  return `${head}
    ${coverage}
    ${readingSection(cover, model, backlog)}
    ${keptSection(Array.isArray(kept) ? kept : [])}
    ${entries.map((/** @type {any} */ e) => entry(e, fields, isPrivate, model)).join("")}`;
}

/**
 * The pass, offered - or the reason it is not.
 *
 * A disabled button that says nothing reads as broken, so every state here says
 * what would change it: too little written, no model reachable, or ready.
 *
 * @param {any} cover
 * @param {{ available: boolean, why: string | null }} model
 * @param {any} [backlog] The unread signal, when there is one.
 */
function readingSection(cover, model, backlog) {
  const current = resultFor(REVIEW_KEY);
  if (current !== null) {
    return `<div class="group">
      <div class="group-head"><span class="group-title">The reading</span><span class="group-rule"></span></div>
      ${reviewHtml(REVIEW_KEY, current)}
    </div>`;
  }

  const running = isRunning(REVIEW_KEY);
  // The same floor the service enforces, said before the button is pressed
  // rather than as an error afterwards. A refusal you could have seen coming is
  // a refusal that should have been a disabled button with a reason on it.
  const tooThin = Number(cover.entries ?? 0) < 4 || Number(cover.spread ?? 0) < 3;

  const why = tooThin
    ? "A reading needs at least four entries across at least three separate days. Fewer than that and a pattern is one evening restated with confidence - which then gets remembered next month as a fact."
    : model.available
      ? "Reads every entry in the window and names what recurs: where the days actually went, and what kept being avoided. Nothing is written unless you keep it."
      : String(model.why ?? "No model is reachable, so the entries can only be read by you.");

  return `<div class="group">
    <div class="group-head"><span class="group-title">The reading</span><span class="group-rule"></span></div>
    <article class="card">
      <div class="card-top"><h2 class="card-title">Read the last 30 days</h2></div>
      <p class="card-why">${esc(why)}</p>
      <p class="card-why dim">
        What it looks for is the pair of things that are invisible on the day and
        obvious across a month. It asks questions rather than reaching verdicts,
        and the counts the app recorded over the same days travel with it - a
        memory of a month is worse than a memory of a day, and only one of the two
        is checkable.
      </p>
      <!--
        What has gone unread, when anything has.
        A line on the page you are already standing on rather than a badge in the
        rail: the rail carries no count for this view on purpose, because nothing
        here is late and a number that is always there becomes a reproach. This
        appears only when there is actually a month of material nobody has looked
        at, and says nothing on a quiet month.
      -->
      ${
        backlog === undefined
          ? ""
          : `<div class="mine-row">
               <span class="mine-text">${esc(String(backlog.text))}</span>
               <span class="src">${esc(String(backlog.detail ?? ""))}</span>
             </div>`
      }
      <div class="card-foot">
        <span class="src">${esc(String(cover.summary ?? ""))}</span>
        <button class="act primary" data-act="readJournal" ${tooThin || !model.available || running ? "disabled" : ""}>
          ${running ? "Reading..." : "Read them"}
        </button>
      </div>
    </article>
  </div>`;
}

/**
 * The readings that were kept.
 *
 * Kept at all - where a brief deliberately is not - because the entries under a
 * reading are about days that are over, so it cannot go stale. And because the
 * second reading is where this feature starts earning anything: a pattern that
 * has survived three months is a different fact from one noticed tonight.
 *
 * @param {any[]} kept
 */
function keptSection(kept) {
  if (kept.length === 0) {
    return "";
  }

  return `<div class="group">
    <div class="group-head">
      <span class="group-title">Kept readings</span>
      <span class="group-rule"></span>
      <span class="group-meta">${kept.length}</span>
    </div>
    ${kept.map(keptCard).join("")}
  </div>`;
}

/** @param {any} r */
function keptCard(r) {
  const avoidance = Array.isArray(r.avoidance) ? r.avoidance : [];
  const wentInto = Array.isArray(r.wentInto) ? r.wentInto : [];
  const questions = Array.isArray(r.questions) ? r.questions : [];

  /** @param {string} label @param {any[]} items */
  const block = (label, items) =>
    items.length === 0
      ? ""
      : `<div class="prep-block">
          <h3 class="prep-head">${esc(label)}</h3>
          <ul class="draft-list">${items
            .map(
              (/** @type {any} */ i) =>
                `<li>${esc(i.what)} <span class="pill plain">${esc(String(i.evenings))}</span>${
                  i.evidence ? `<span class="src">${esc(i.evidence)}</span>` : ""
                }</li>`
            )
            .join("")}</ul>
        </div>`;

  return `<article class="card">
    <div class="card-top">
      <h2 class="card-title">${esc(new Date(r.at).toLocaleDateString("sv-SE"))}</h2>
      <!--
        The coverage is on the card rather than in a footnote, and it is the
        coverage as it WAS - recomputing it later would answer for a window that
        has since moved, which is how a reading built on six evenings ends up
        looking like one built on twenty-six.
      -->
      <span class="badge">${esc(String(r.entries))} entries over ${esc(String(r.spread))} days</span>
    </div>
    ${block("Kept being avoided", avoidance)}
    ${block("Where the days went", wentInto)}
    ${r.saidVsDid ? `<div class="prep-block">
      <h3 class="prep-head">Against what you said you would do</h3>
      <p class="prep-note">${esc(r.saidVsDid)}</p>
    </div>` : ""}
    ${questions.length ? `<div class="prep-block">
      <h3 class="prep-head">Worth asking yourself</h3>
      <ul class="draft-list">${questions.map((/** @type {string} */ q) => `<li>${esc(q)}</li>`).join("")}</ul>
    </div>` : ""}
    <div class="card-foot">
      <span class="src">Covered the ${esc(String(r.days))} days to then${
        r.source ? `, read by ${esc(String(r.source).replace(/^model:/, ""))}` : ""
      }.</span>
      <span class="foot-actions">
        <button class="act danger" data-act="dropReview" data-id="${esc(r.id)}"
          data-day="${esc(new Date(r.at).toLocaleDateString("sv-SE"))}">Remove</button>
      </span>
    </div>
  </article>`;
}

/**
 * One day.
 *
 * A box left empty is absent rather than shown with a dash. Four labels with
 * nothing under three of them reads as a form you failed to fill in, when in
 * fact one filled box is a complete entry.
 *
 * @param {any} e
 * @param {{ name: string, label: string }[]} fields
 * @param {boolean} isPrivate
 * @param {{ available: boolean, why: string | null }} model
 */
function entry(e, fields, isPrivate = false, model = { available: false, why: null }) {
  const lines = fields
    .filter((f) => String(e[f.name] ?? "") !== "")
    .map(
      (f) => `<div class="prep-block">
        <h3 class="prep-head">${esc(f.label)}</h3>
        <p class="prep-note">${esc(e[f.name])}</p>
      </div>`
    )
    .join("");

  /*
   * Marked as an entry rather than left as one card among several.
   *
   * The page grew a reading card above the entries, and two checks that had said
   * "the first card is an entry" started answering about the wrong element -
   * still passing on one of them, which is the worse half. A card that says what
   * it is costs nothing and removes a class of test that quietly measures the
   * layout instead of the thing.
   */
  return `<article class="card" data-entry="${esc(String(e.at))}">
    <div class="card-top">
      <h2 class="card-title">${esc(new Date(e.at).toLocaleDateString("sv-SE"))}</h2>
      <span class="badge">${esc(e.when)}</span>
    </div>
    ${lines}
    ${isPrivate ? ownPartBlock(e, model) : ""}
    <div class="card-foot">
      <span class="src">Written by you. Read by the pass above, when you ask for it.</span>
      <span class="foot-actions">
        ${
          isPrivate && model.available
            ? `<button class="act" data-act="readBack" data-at="${esc(String(e.at))}">Read it back</button>`
            : ""
        }
        <button class="act" data-act="writeEntry" data-at="${esc(String(e.at))}">Edit</button>
        <button class="act danger" data-act="dropEntry" data-id="${esc(e.id)}" data-day="${esc(new Date(e.at).toLocaleDateString("sv-SE"))}">Remove</button>
      </span>
    </div>
  </article>`;
}

/**
 * The own-part check for one day, once it has been asked for.
 *
 * Keyed per entry rather than one at a time, so reading two evenings back does
 * not throw the first away - and so the result sits under the entry it is about
 * instead of somewhere the reader has to match it up by hand.
 *
 * @param {any} e
 * @param {{ available: boolean, why: string | null }} model
 */
function ownPartBlock(e, model) {
  const key = ownPartKey(e.at);
  if (isRunning(key)) {
    return `<p class="src">Reading it back...</p>`;
  }
  const result = resultFor(key);
  if (result === null) {
    return model.available
      ? ""
      : `<p class="src">${esc(String(model.why ?? "No model is reachable, so nothing can read this back."))}</p>`;
  }
  return ownPartHtml(key, result);
}

/** @param {number | string} at */
function ownPartKey(at) {
  return `ownpart:${at}`;
}

export const actions = {
  ...modelActions(),

  readJournal: () => run(REVIEW_KEY, "reviewJournal", {}),

  /**
   * Read one entry back against the rule.
   *
   * The whole entry is sent, not one box, because the rule is about what the
   * writing claims rather than about any single field - and "what took the day"
   * is exactly where a sentence about somebody else's state ends up.
   *
   * @param {Record<string, string>} d
   */
  readBack: async (d) => {
    const journal = await tend.invoke("journal");
    const at = Number(d.at);
    const found = (journal?.entries ?? []).find((/** @type {any} */ e) => Number(e.at) === at);
    if (!found) {
      return;
    }
    const fields = Array.isArray(journal?.fields) ? journal.fields : [];
    const text = fields
      .map((/** @type {any} */ f) => (found[f.name] ? `${f.label}: ${found[f.name]}` : ""))
      .filter((/** @type {string} */ line) => line !== "")
      .join("\n");
    await run(ownPartKey(at), "checkOwnPart", { text });
  },

  /** @param {Record<string, string>} d */
  keepReview: async (d) => {
    const review = resultFor(d.key);
    if (review === null) {
      return;
    }
    if (await act("keepReview", { review }, "Kept.")) {
      // Cleared so the page does not show the same reading twice, once as a
      // draft and once as a kept card - which reads as two readings.
      modelActions().discardDraft({ key: d.key });
    }
  },

  /** @param {Record<string, string>} d */
  dropReview: async (d) => {
    if (await act("removeRow", { collection: "reviews", id: d.id }, "Removed.")) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  writeEntry: async (d) => {
    const [result, vocab, roster] = await Promise.all([
      tend.invoke("journal"),
      tend.invoke("vocabulary"),
      tend.invoke("people")
    ]);
    const at = d.at === undefined ? Date.now() : Number(d.at);
    const day = new Date(at).toISOString().slice(0, 10);
    const existing = (result?.entries ?? []).find(
      (/** @type {any} */ e) => new Date(e.at).toISOString().slice(0, 10) === day
    );
    const fields = Array.isArray(result?.fields) ? result.fields : [];

    /*
     * Who the evening was about, asked only where nothing else can answer it.
     *
     * In the work half the store already knows who he spoke to, so asking would
     * waste the one thing a form has. Here nothing derives it, and without it a
     * month of evenings is a month of undifferentiated days - and a person's page
     * can say what he owes them and nothing about how it has been going.
     *
     * One checkbox each rather than a list to pick from, because the roster in
     * this half is short and a tick is cheaper than opening a dropdown at eleven
     * at night. `data-` names carry the id, so a rename costs nothing.
     */
    const named = vocab?.personBlocks?.entries === true && Array.isArray(roster) ? roster : [];
    const already = new Set(existing?.people ?? []);

    const values = await form({
      title: existing ? `Edit ${new Date(at).toLocaleDateString("sv-SE")}` : "How was the day?",
      intro:
        "Leave any of them empty. One filled box is a real entry, and three required ones would " +
        "only produce something invented at eleven at night - which reads like a fact afterwards " +
        "and is worse than nothing.",
      fields: [
        ...fields.map((/** @type {any} */ f) => ({
          name: f.name,
          label: f.label,
          type: /** @type {const} */ ("textarea"),
          value: existing?.[f.name] ?? "",
          hint: f.hint
        })),
        ...(named.length === 0
          ? []
          : [
              {
                name: "whoNote",
                label: "Who it was about",
                type: /** @type {const} */ ("note"),
                value:
                  "Optional, and it changes nothing about what the entry says - it stays about " +
                  "your own part in it. It is what makes the evenings show up on their page."
              },
              ...named.map((/** @type {any} */ person) => ({
                name: `with:${person.id}`,
                label: String(person.name),
                type: /** @type {const} */ ("checkbox"),
                value: already.has(String(person.id))
              }))
            ]),
        { name: "at", label: "Which day", type: /** @type {const} */ ("date"), value: asDateInput(at) }
      ],
      confirm: "Keep it"
    });
    if (!values) {
      return;
    }

    /** @type {Record<string, any>} */
    const payload = { at: values.at };
    for (const f of fields) {
      payload[f.name] = values[f.name];
    }
    if (named.length > 0) {
      payload.people = named
        .map((/** @type {any} */ person) => String(person.id))
        .filter((/** @type {string} */ id) => values[`with:${id}`] === true);
    }

    if (await act("logEntry", payload, "Kept.")) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  dropEntry: async (d) => {
    if (await act("removeRow", { collection: "entries", id: d.id }, "Removed.")) {
      refresh();
    }
  }
};
