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
 * ## Why the reading is a button and not a schedule
 *
 * The entries were always the means and the reading is the product, but a
 * reading that arrives unasked on the first of the month is a verdict delivered
 * to somebody who was not asking for one. The whole design of this page is that
 * nothing here nags, and the pass over it does not get an exception.
 */

import { act, asDateInput, esc, form, tend } from "../ui.js";
import { isRunning, modelActions, modelStatus, resultFor, reviewHtml, run } from "../model.js";
import { refresh } from "../app.js";

/** The key the current reading is held under. One at a time is enough. */
const REVIEW_KEY = "review:journal";

export async function render() {
  const [result, kept, model] = await Promise.all([
    tend.invoke("journal"),
    tend.invoke("reviews"),
    modelStatus()
  ]);

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
            Four boxes, all optional, no reminder and no streak. Missing days is
            expected - the value is in a month of them rather than in any one, so
            the only thing that matters is that writing one is cheap.
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
    ${readingSection(cover, model)}
    ${keptSection(Array.isArray(kept) ? kept : [])}
    ${entries.map((/** @type {any} */ e) => entry(e, fields)).join("")}`;
}

/**
 * The pass, offered - or the reason it is not.
 *
 * A disabled button that says nothing reads as broken, so every state here says
 * what would change it: too little written, no model reachable, or ready.
 *
 * @param {any} cover
 * @param {{ available: boolean, why: string | null }} model
 */
function readingSection(cover, model) {
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
 */
function entry(e, fields) {
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
    <div class="card-foot">
      <span class="src">Written by you. Read by the pass above, when you ask for it.</span>
      <span class="foot-actions">
        <button class="act" data-act="writeEntry" data-at="${esc(String(e.at))}">Edit</button>
        <button class="act danger" data-act="dropEntry" data-id="${esc(e.id)}" data-day="${esc(new Date(e.at).toLocaleDateString("sv-SE"))}">Remove</button>
      </span>
    </div>
  </article>`;
}

export const actions = {
  ...modelActions(),

  readJournal: () => run(REVIEW_KEY, "reviewJournal", {}),

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
    const result = await tend.invoke("journal");
    const at = d.at === undefined ? Date.now() : Number(d.at);
    const day = new Date(at).toISOString().slice(0, 10);
    const existing = (result?.entries ?? []).find(
      (/** @type {any} */ e) => new Date(e.at).toISOString().slice(0, 10) === day
    );
    const fields = Array.isArray(result?.fields) ? result.fields : [];

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
        { name: "at", label: "Which day", type: /** @type {const} */ ("date"), value: asDateInput(at) }
      ],
      confirm: "Keep it"
    });
    if (!values) {
      return;
    }
    if (await act("logEntry", values, "Kept.")) {
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
