/**
 * The model layer, as far as the window is concerned.
 *
 * Shared by the views rather than repeated in each, for one reason that is not
 * about tidiness: what a model produced has to survive a redraw. The shell
 * redraws the current view every twenty seconds to pick up writes from the MCP
 * server, and nothing here is stored on disk - so a brief rendered straight
 * into a card would quietly disappear part-way through being read.
 *
 * So results live in this module, keyed by what they are about, and every view
 * renders whatever is in here. They are cleared by discarding them or by
 * closing the window, which is the right lifetime for a draft.
 *
 * Every call is a button somebody pressed. Nothing in this file runs on its
 * own, on a timer, or on a view being opened.
 */

import { esc, tend, toast } from "./ui.js";
import { refresh } from "./app.js";
import { sourceLabel } from "../domain/provenance.js";

/** @type {Map<string, any>} */
const results = new Map();
/** @type {Set<string>} */
const running = new Set();

/**
 * @typedef {{ available: boolean, why: string | null, binary: string }} ModelStatus
 */

/** @type {ModelStatus | null} */
let status = null;

/**
 * Whether a model call can be made, asked once per window.
 *
 * Cached because it shells out to find the Claude Code executable, and the
 * answer cannot change while the app is open without something being installed
 * underneath it.
 *
 * A failure to even ask resolves to "off", not to null. Every caller renders
 * from this, and one that has to handle a third state would grow a branch that
 * is never exercised and therefore never right.
 *
 * @returns {Promise<ModelStatus>}
 */
export async function modelStatus() {
  if (status === null) {
    const answer = await tend.invoke("modelStatus");
    status =
      answer && typeof answer.available === "boolean"
        ? { available: answer.available, why: answer.why ?? null, binary: String(answer.binary ?? "") }
        : { available: false, why: "Could not tell whether Claude Code is available.", binary: "" };
  }
  return status;
}

/** @param {string} key */
export function resultFor(key) {
  return results.get(key) ?? null;
}

/** @param {string} key */
export function isRunning(key) {
  return running.has(key);
}

/** @param {string} key */
export function discard(key) {
  results.delete(key);
  refresh();
}

/**
 * Run one model operation and keep what comes back.
 *
 * Redraws twice on purpose: once to show that something is happening, because
 * these calls take seconds and a button that does nothing visible for four of
 * them reads as broken, and once with the answer.
 *
 * @param {string} key
 * @param {string} op
 * @param {Record<string, any>} args
 */
export async function run(key, op, args) {
  if (running.has(key)) {
    return;
  }
  running.add(key);
  refresh();

  try {
    const result = await tend.invoke(op, args);
    if (result && typeof result === "object" && "error" in result) {
      toast(String(result.error), "bad");
      return;
    }
    results.set(key, result);
  } finally {
    running.delete(key);
    refresh();
  }
}

/**
 * The line under anything a model wrote.
 *
 * Always shown, never abbreviated away. Which model said it is the question
 * that gets asked a month later, and a draft that does not say it was drafted
 * becomes a fact by sitting on the screen long enough.
 *
 * @param {any} result
 */
export function stamp(result) {
  const cost = typeof result?.costUsd === "number" ? ` · ${(result.costUsd * 100).toFixed(1)}¢` : "";
  return `<span class="src">Drafted by ${esc(result?.model ?? "a model")}${cost}. Nothing here was saved.</span>`;
}

/**
 * A brief, as read on the way to a room.
 *
 * @param {string} key
 * @param {any} result
 */
export function briefHtml(key, result) {
  const brief = result?.brief ?? {};
  const raise = Array.isArray(brief.raise) ? brief.raise : [];
  const questions = Array.isArray(brief.ask) ? brief.ask : [];

  return `<div class="draft">
    <div class="draft-head">
      <span class="draft-title">Draft brief</span>
      <button class="act tiny" data-act="discardDraft" data-key="${esc(key)}">Discard</button>
    </div>
    ${brief.opening ? `<p class="draft-opening">${esc(brief.opening)}</p>` : ""}
    ${
      raise.length
        ? `<h4 class="draft-head-small">Raise</h4><ul class="draft-list">${raise
            .map(
              (/** @type {any} */ r) =>
                `<li>${esc(r.point)}<span class="src">${esc(r.because ?? "")}</span></li>`
            )
            .join("")}</ul>`
        : ""
    }
    ${
      questions.length
        ? `<h4 class="draft-head-small">Ask</h4><ul class="draft-list">${questions
            .map((/** @type {any} */ q) => `<li>${esc(q)}</li>`)
            .join("")}</ul>`
        : ""
    }
    ${brief.watch ? `<p class="draft-watch">Careful of: ${esc(brief.watch)}</p>` : ""}
    <div class="draft-foot">${stamp(result)}</div>
  </div>`;
}

/**
 * Promises read out of prose, each still a candidate.
 *
 * Keep and discard rather than a single accept-all. The whole reason this is a
 * second pass is that the reliable one - Nib's own flagged action points -
 * already caught everything that was written down as a commitment, so what is
 * left here is by definition the uncertain half.
 *
 * @param {string} key
 * @param {any} result
 * @param {string} person Who the promises would be logged against.
 */
export function candidatesHtml(key, result, person) {
  const candidates = Array.isArray(result?.candidates) ? result.candidates : [];

  if (candidates.length === 0) {
    return `<div class="draft">
      <div class="draft-head">
        <span class="draft-title">Nothing found</span>
        <button class="act tiny" data-act="discardDraft" data-key="${esc(key)}">Close</button>
      </div>
      <p class="src">
        No commitment in that note that Nib's own action points had not already caught.
        That is the common answer and it is a good one.
      </p>
      <div class="draft-foot">${stamp(result)}</div>
    </div>`;
  }

  return `<div class="draft">
    <div class="draft-head">
      <span class="draft-title">Found in what you wrote</span>
      <button class="act tiny" data-act="discardDraft" data-key="${esc(key)}">Discard all</button>
    </div>
    ${result.truncated ? `<p class="src">That note is long, so only its first part was read.</p>` : ""}
    <ul class="draft-list">
      ${candidates
        .map(
          (/** @type {any} */ c, /** @type {number} */ i) => `<li class="draft-candidate">
            <span>${esc(c.text)}<span class="src">${c.confidence === "clear" ? "stated outright" : "implied, so check it"}</span></span>
            <button class="act tiny" data-act="keepCandidate"
              data-key="${esc(key)}" data-index="${i}" data-person="${esc(person)}">Keep</button>
          </li>`
        )
        .join("")}
    </ul>
    <div class="draft-foot">${stamp(result)}</div>
  </div>`;
}

/**
 * What keeps coming up about somebody.
 *
 * @param {string} key
 * @param {any} result
 */
export function themesHtml(key, result) {
  const themes = Array.isArray(result?.themes) ? result.themes : [];

  return `<div class="draft">
    <div class="draft-head">
      <span class="draft-title">Across ${esc(result?.notesRead ?? 0)} notes</span>
      <button class="act tiny" data-act="discardDraft" data-key="${esc(key)}">Close</button>
    </div>
    ${
      themes.length === 0
        ? `<p class="src">Nothing recurs across those notes yet. A pattern needs to appear in at least two.</p>`
        : `<ul class="draft-list">${themes
            .map(
              (/** @type {any} */ t) =>
                `<li>${esc(t.name)} <span class="pill plain">${esc(t.times)}×</span><span class="src">${esc(t.evidence)}</span></li>`
            )
            .join("")}</ul>`
    }
    <div class="draft-foot">${stamp(result)}</div>
  </div>`;
}

/**
 * A reading of the journal, before it is kept or thrown away.
 *
 * Ordered so the uncomfortable half is not last. Where the days went reads as
 * information; what kept being avoided is the reason the form exists, and a
 * section a reader scrolls past is a section that may as well not have run.
 *
 * The coverage sits at the top rather than in a footnote. A reading built on six
 * evenings and one built on twenty-six are different claims, and putting the
 * number above the prose is what stops them being read in the same voice.
 *
 * @param {string} key
 * @param {any} result
 */
export function reviewHtml(key, result) {
  const wentInto = Array.isArray(result?.wentInto) ? result.wentInto : [];
  const avoidance = Array.isArray(result?.avoidance) ? result.avoidance : [];
  const questions = Array.isArray(result?.questions) ? result.questions : [];
  const cover = result?.coverage ?? {};
  const nothing = String(result?.nothingToSay ?? "").trim();
  const worthKeeping =
    wentInto.length > 0 ||
    avoidance.length > 0 ||
    questions.length > 0 ||
    String(result?.saidVsDid ?? "").trim() !== "";

  /** @param {any[]} items */
  const list = (items) =>
    `<ul class="draft-list">${items
      .map(
        (/** @type {any} */ i) =>
          `<li>${esc(i.what)} <span class="pill plain">${esc(String(i.evenings))} evenings</span>` +
          `${i.evidence ? `<span class="src">${esc(i.evidence)}</span>` : ""}</li>`
      )
      .join("")}</ul>`;

  return `<div class="draft">
    <div class="draft-head">
      <span class="draft-title">The last ${esc(String(result?.days ?? 30))} days</span>
      <span class="foot-actions">
        ${
          worthKeeping
            ? `<button class="act tiny primary" data-act="keepReview" data-key="${esc(key)}">Keep this reading</button>`
            : ""
        }
        <button class="act tiny" data-act="discardDraft" data-key="${esc(key)}">Discard</button>
      </span>
    </div>

    <p class="src">${esc(String(cover.summary ?? ""))}</p>

    ${
      nothing
        ? `<p class="draft-opening">${esc(nothing)}</p>`
        : ""
    }

    ${
      avoidance.length
        ? `<h4 class="draft-head-small">Kept being avoided</h4>${list(avoidance)}`
        : nothing
          ? ""
          : `<h4 class="draft-head-small">Kept being avoided</h4>
             <p class="src">Nothing recurs in that box across these evenings. Worth noticing rather than
             celebrating - it is also what an unanswered box looks like.</p>`
    }

    ${wentInto.length ? `<h4 class="draft-head-small">Where the days went</h4>${list(wentInto)}` : ""}

    ${
      String(result?.saidVsDid ?? "").trim()
        ? `<h4 class="draft-head-small">Against what you said you would do</h4>
           <p class="draft-note">${esc(result.saidVsDid)}</p>`
        : ""
    }

    ${
      questions.length
        ? `<h4 class="draft-head-small">Worth asking yourself</h4>
           <ul class="draft-list">${questions.map((/** @type {string} */ q) => `<li>${esc(q)}</li>`).join("")}</ul>`
        : ""
    }

    <!--
      The counts, last and always. They are what the prose above can be checked
      against - an evening's writing is a memory of a day, and a memory of a
      month of days is worse - and a reading with no numbers under it is one that
      has to be taken on trust.
    -->
    ${
      result?.ledger === null || result?.ledger === undefined
        ? ""
        : `<details class="draft-details">
             <summary>What the app recorded over the same days</summary>
             <ul class="draft-list">${ledgerListHtml(result.ledger)}</ul>
           </details>`
    }

    <div class="draft-foot">
      <span class="src">Read by ${esc(result?.model ?? "a model")}${
        typeof result?.costUsd === "number" ? ` · ${(result.costUsd * 100).toFixed(1)}¢` : ""
      }. Nothing is saved unless you keep it.</span>
    </div>
  </div>`;
}

/**
 * The recorded counts, as lines.
 *
 * Built here rather than taken from the service so the window does not depend on
 * a second shape travelling with every review; the numbers are the contract and
 * the wording is the view's business.
 *
 * @param {any} l
 * @returns {string}
 */
function ledgerListHtml(l) {
  const rows = [
    [`Days with an entry`, `${l.journalled ?? 0} of ${l.days ?? 0}`],
    [`Conversations recorded`, String(l.conversations ?? 0)],
    [`Promises made`, `${l.promisesMade ?? 0}, of which ${l.promisesKept ?? 0} closed`],
    [`Promises open right now`, String(l.promisesStillOpen ?? 0)],
    [`Decisions recorded`, String(l.decisions ?? 0)],
    [
      `Growth threads discussed`,
      `${l.growthNotes ?? 0}, marker seen ${l.growthObserved ?? 0}×`
    ],
    [`Meetings that did not happen`, String(l.skips ?? 0)],
    [`Times you chased somebody`, String(l.chases ?? 0)]
  ];
  return rows
    .map(([label, value]) => `<li>${esc(label)}<span class="src">${esc(value)}</span></li>`)
    .join("");
}

/**
 * One entry, read back against the rule that keeps it safe to write.
 *
 * Deliberately not framed as errors. What comes back is a phrase and an
 * alternative beside it, and the entry on disk is untouched whatever this says -
 * a check that rewrote his words would replace them with a model's in the one
 * place where the words being his is the entire value.
 *
 * The clean answer is shown rather than swallowed. "This keeps to your own part"
 * is the common result and the one worth seeing: a check that only ever speaks
 * up when something is wrong is a check that reads as an accusation waiting to
 * happen.
 *
 * @param {string} key
 * @param {any} result
 */
export function ownPartHtml(key, result) {
  const lines = Array.isArray(result?.lines) ? result.lines : [];

  if (lines.length === 0) {
    return `<div class="draft">
      <div class="draft-head">
        <span class="draft-title">Read back</span>
        <button class="act tiny" data-act="discardDraft" data-key="${esc(key)}">Close</button>
      </div>
      <p class="src">${esc(
        String(result?.ok ?? "").trim() ||
          "Nothing here describes them rather than your own part in it."
      )}</p>
      <div class="draft-foot">${ownPartStamp(result)}</div>
    </div>`;
  }

  return `<div class="draft">
    <div class="draft-head">
      <span class="draft-title">Read back</span>
      <button class="act tiny" data-act="discardDraft" data-key="${esc(key)}">Close</button>
    </div>
    <p class="src">
      ${lines.length === 1 ? "One phrase" : `${lines.length} phrases`} describing them rather than
      your own part. Nothing has been changed - the alternative is only an alternative.
    </p>
    <ul class="draft-list">
      ${lines
        .map(
          (/** @type {any} */ l) =>
            `<li>${esc(l.quote)}${l.instead ? `<span class="src">Could be: ${esc(l.instead)}</span>` : ""}</li>`
        )
        .join("")}
    </ul>
    <div class="draft-foot">${ownPartStamp(result)}</div>
  </div>`;
}

/**
 * Same rule as everything else a model wrote: which one said it, and that it was
 * not saved. Written out here rather than reusing `stamp` because that one says
 * "drafted", and this did not draft anything.
 *
 * @param {any} result
 */
function ownPartStamp(result) {
  const cost = typeof result?.costUsd === "number" ? ` · ${(result.costUsd * 100).toFixed(1)}¢` : "";
  return `<span class="src">Read by ${esc(result?.model ?? "a model")}${cost}. Your entry is untouched.</span>`;
}

/**
 * The actions every view with a model button needs, ready to be spread into
 * its own `actions` map.
 *
 * @param {() => void} [onKept] Called after a candidate is kept.
 */
export function modelActions(onKept) {
  return {
    /** @param {Record<string, string>} d */
    discardDraft: (/** @type {Record<string, string>} */ d) => discard(d.key),

    /** @param {Record<string, string>} d */
    keepCandidate: async (/** @type {Record<string, string>} */ d) => {
      const result = results.get(d.key);
      const candidate = result?.candidates?.[Number(d.index)];
      if (!candidate) {
        return;
      }

      const logged = await tend.invoke("logPromise", {
        person: d.person,
        text: candidate.text,
        // The origin, not the writer. This row is written by the app like any
        // other, and without this it would be indistinguishable from one typed
        // out by hand months later when it matters which it was.
        source: sourceLabel(result.model)
      });

      if (logged && typeof logged === "object" && "error" in logged) {
        toast(String(logged.error), "bad");
        return;
      }

      // Taken out of the list, so keeping four of five leaves the fifth visible
      // rather than leaving you to remember which ones you already took.
      result.candidates.splice(Number(d.index), 1);
      if (result.candidates.length === 0) {
        results.delete(d.key);
      }
      toast("Promise logged.");
      onKept?.();
      refresh();
    }
  };
}
