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
        source: `model:${result.model}`
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
