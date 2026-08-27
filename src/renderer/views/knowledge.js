/**
 * Knowledge: ask about a situation, not about a book.
 *
 * The one view you arrive at with a question rather than to see what changed,
 * which is why it has no count in the rail and why it opens empty with the box
 * focused. Everything else in this app tells you something; this one waits.
 *
 * Two passes, and the first is free. Typing narrows on titles and previews the
 * index already carries - instant, and a word match, so it finds the obvious
 * and misses the rest. Reading the notes properly is a button, because it opens
 * what you wrote about people and that should never happen because a view was
 * rendered.
 *
 * ## The example has to belong to the half
 *
 * The placeholder is the only instruction anybody reads here, and it was a work
 * situation in both halves - "someone on my team has stopped disagreeing with
 * me", offered on a page about family. An example from the wrong half does more
 * than look careless: it tells you what sort of question the box wants, so it
 * teaches the wrong use of the feature in the half where the feature is newest.
 */

import { esc, tend } from "../ui.js";
import { isRunning, modelStatus, resultFor, run } from "../model.js";

/** Kept here rather than in the module state, because it is a query, not data. */
let situation = "";
/** The local pass, recomputed on every search. */
let found = /** @type {any} */ (null);

const KEY = "knowledge";

export async function render() {
  const [model, vocab] = await Promise.all([modelStatus(), tend.invoke("vocabulary")]);
  const answer = resultFor(KEY);
  const isPrivate = String(vocab?.half ?? "work") === "private";

  const head = `
    <div class="view-head">
      <h1 class="view-title">What do I know about this?</h1>
      <p class="view-sub">
        Ask about the situation you are in, not the book you half remember. Your
        own notes answer - what you read and wrote down, and ${
          isPrivate ? "the evenings you wrote up" : "the conversations you had"
        }.
      </p>
    </div>

    <div class="card">
      <div class="ask-row">
        <input class="ask-field" id="situation" type="text" value="${esc(situation)}"
          placeholder="${
            isPrivate
              ? "I keep getting short with somebody when I am tired"
              : "Someone on my team has stopped disagreeing with me"
          }">
        <button class="act primary" data-act="search">Search</button>
      </div>
      <p class="card-why dim">
        Searching only titles and opening lines. Nothing is opened until you ask for it.
        ${
          isPrivate
            ? "What you have read reaches both halves; notes about people stay in the one they were written in."
            : ""
        }
      </p>
    </div>`;

  if (found === null) {
    return head;
  }

  if (found.error) {
    return `${head}<div class="card sev-warn"><div class="card-top">
      <h2 class="card-title">Could not search</h2></div>
      <p class="card-why">${esc(found.error)}</p></div>`;
  }

  const matches = Array.isArray(found.matches) ? found.matches : [];

  if (matches.length === 0) {
    return `${head}
      <div class="empty">
        Nothing in ${esc(String(found.searched))} notes shares wording with that.
        This search matches words, so try the words you would have written at the
        time - or write the note, and it will be here next time.
      </div>`;
  }

  return `${head}

    <div class="group">
      <div class="group-head">
        <span class="group-title">Shares wording</span>
        <span class="group-rule"></span>
        <span class="group-meta">${matches.length} of ${esc(String(found.searched))}</span>
      </div>
      ${matches.map(hit).join("")}
      <div class="card-foot ask-foot">
        <span class="src">A word match. It finds the obvious and misses the rest.</span>
        ${
          model.available
            ? isRunning(KEY)
              ? `<button class="act" disabled>Reading…</button>`
              : `<button class="act primary" data-act="consider">Read them properly</button>`
            : `<span class="src">Reading is off - no Claude Code on this machine.</span>`
        }
      </div>
    </div>

    ${answer === null ? "" : answerHtml(answer)}`;
}

/** @param {any} h */
function hit(h) {
  return `<div class="row static">
    <span class="row-name">${esc(h.title || "Untitled")}</span>
    <span class="row-right"><span class="row-meta">${esc(h.trail)}</span></span>
  </div>`;
}

/**
 * What the model made of them.
 *
 * `missing` is printed as prominently as the hits, and deliberately. The
 * useful answer to "what do I know about this" is often "less than you think",
 * and a view that only ever lists matches quietly implies the opposite.
 *
 * @param {any} answer
 */
function answerHtml(answer) {
  const applies = Array.isArray(answer.applies) ? answer.applies : [];

  return `<div class="draft">
    <div class="draft-head">
      <span class="draft-title">Read ${esc(String(answer.read ?? 0))} of them</span>
      <button class="act tiny" data-act="discardDraft" data-key="${KEY}">Discard</button>
    </div>

    ${
      applies.length === 0
        ? `<p class="draft-opening">None of them actually bear on this.</p>`
        : `<ul class="draft-list">${applies
            .map(
              (/** @type {any} */ a) => `<li>
                <strong>${esc(a.says)}</strong>
                <span class="src">${esc(a.because)}</span>
                <span class="src">${esc(a.title)} &middot; ${esc(a.trail)}</span>
              </li>`
            )
            .join("")}</ul>`
    }

    ${answer.missing ? `<p class="draft-watch">Not answered by anything you have written: ${esc(answer.missing)}</p>` : ""}

    <div class="draft-foot">
      <span class="src">
        Read from your own notes${answer.model ? ` by ${esc(answer.model)}` : ""}${
          typeof answer.costUsd === "number" ? ` · ${(answer.costUsd * 100).toFixed(1)}¢` : ""
        }. Nothing was saved.
      </span>
    </div>
  </div>`;
}

export const actions = {
  search: async () => {
    const field = document.getElementById("situation");
    situation = field instanceof HTMLInputElement ? field.value : "";
    found = await tend.invoke("searchKnowledge", { situation });
    // A new question, so the old answer is not an answer to it.
    const { discard } = await import("../model.js");
    discard(KEY);
  },

  consider: () =>
    run(KEY, "considerKnowledge", { situation, candidates: found?.matches ?? [] }),

  /** @param {Record<string, string>} d */
  discardDraft: async (d) => {
    const { discard } = await import("../model.js");
    discard(d.key);
  }
};
