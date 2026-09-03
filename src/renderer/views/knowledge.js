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
 *
 * ## The third answer, and why it is drawn as far from the first as possible
 *
 * Your own notes are the first two passes. The third is reference material: what
 * is generally understood about the subject, which is the only thing on this page
 * that did not come from you. It exists because the honest answer here is often
 * "nothing you have written covers this", and in the private half that is not a
 * gap that closes - nobody keeps notes on how a four-year-old handles being
 * interrupted.
 *
 * So it is a separate block, below the notes answer, in its own frame, saying on
 * every render that it is general and which model wrote it. Merging it into the
 * notes answer - one list, some items from books he read and some from a model -
 * would be the single worst thing this view could do, because the whole value of
 * the first answer is that he wrote it.
 */

import { esc, tend, toast } from "../ui.js";
import { isRunning, modelStatus, resultFor, run } from "../model.js";
import { T } from "../text.js";

const t = T.knowledge;

/** Kept here rather than in the module state, because it is a query, not data. */
let situation = "";
/** The local pass, recomputed on every search. */
let found = /** @type {any} */ (null);

const KEY = "knowledge";
/** The general-knowledge pass, kept apart from the notes answer under its own key. */
const KEY_REF = "knowledge:general";

export async function render() {
  const [model, vocab] = await Promise.all([modelStatus(), tend.invoke("vocabulary")]);
  const answer = resultFor(KEY);
  const general = resultFor(KEY_REF);
  const isPrivate = String(vocab?.half ?? "work") === "private";

  const head = `
    <div class="view-head">
      <h1 class="view-title">${t.title}</h1>
      <p class="view-sub">${t.sub(isPrivate)}</p>
    </div>

    <div class="card">
      <div class="ask-row">
        <input class="ask-field" id="situation" type="text" value="${esc(situation)}"
          placeholder="${isPrivate ? t.placeholderPrivate : t.placeholderWork}">
        <button class="act primary" data-act="search">${t.searchButton}</button>
      </div>
      <p class="card-why dim">${t.searchNote(isPrivate)}</p>
    </div>`;

  if (found === null) {
    return head;
  }

  if (found.error) {
    return `${head}<div class="card sev-warn"><div class="card-top">
      <h2 class="card-title">${t.searchFailedTitle}</h2></div>
      <p class="card-why">${esc(found.error)}</p></div>`;
  }

  const matches = Array.isArray(found.matches) ? found.matches : [];

  if (matches.length === 0) {
    return `${head}
      <div class="empty">${t.nothingShares(esc(String(found.searched)))}</div>
      ${askGeneral(model, true)}
      ${general === null ? "" : generalHtml(general)}`;
  }

  return `${head}

    <div class="group">
      <div class="group-head">
        <span class="group-title">${t.sharesGroup}</span>
        <span class="group-rule"></span>
        <span class="group-meta">${t.sharesMeta(matches.length, esc(String(found.searched)))}</span>
      </div>
      ${matches.map(hit).join("")}
      <div class="card-foot ask-foot">
        <span class="src">${t.wordMatchNote}</span>
        ${
          model.available
            ? isRunning(KEY)
              ? `<button class="act" disabled>${t.reading}</button>`
              : `<button class="act primary" data-act="consider">${t.readProperly}</button>`
            : `<span class="src">${t.readingOff}</span>`
        }
      </div>
    </div>

    ${answer === null ? "" : answerHtml(answer)}
    ${askGeneral(model, false)}
    ${general === null ? "" : generalHtml(general)}`;
}

/**
 * The offer to answer from general knowledge instead.
 *
 * Below the notes, always, and never the primary action when the notes had
 * something to say - the ranking is the point, and a page where the model's
 * answer is the brightest button on it teaches the opposite of what this view is
 * for. When the notebook came back with nothing it becomes the primary action,
 * because at that moment it is the only thing left on the page that can help.
 *
 * It says what it sends. Every other model button here opens notes, and somebody
 * who has learned to expect that from this page needs telling that this one does
 * not - and the sentence is also the reminder that a name typed into the box
 * travels with it.
 *
 * @param {{ available: boolean }} model
 * @param {boolean} onlyThingLeft Whether the notes answered nothing at all.
 */
function askGeneral(model, onlyThingLeft) {
  if (!model.available) {
    return "";
  }

  return `<div class="card">
    <div class="card-foot ask-foot">
      <span class="src">${t.generalOffer}</span>
      ${
        isRunning(KEY_REF)
          ? `<button class="act" disabled>${t.generalLooking}</button>`
          : `<button class="act ${onlyThingLeft ? "primary" : ""}" data-act="general">${t.generalAsk}</button>`
      }
    </div>
  </div>`;
}

/**
 * What general knowledge says, framed as the weakest thing on the page.
 *
 * Four things carry that framing and none of them is optional. The title says
 * general. The part only the people involved can answer comes BEFORE the starting
 * points rather than after them, because a caution under a list is read after the
 * list has already been believed. A widely-varying subject says so outright. And
 * the foot names the model, because a paragraph with no author becomes a fact by
 * sitting on a screen long enough.
 *
 * @param {any} result
 */
function generalHtml(result) {
  const starts = Array.isArray(result?.starts) ? result.starts : [];
  const wide = result?.spread === "wide";

  return `<div class="draft general">
    <div class="draft-head">
      <span class="draft-title">${t.generalTitle}</span>
      <span class="foot-actions">
        <button class="act tiny" data-act="copyGeneral">${t.copy}</button>
        <button class="act tiny" data-act="discardDraft" data-key="${KEY_REF}">${t.discard}</button>
      </span>
    </div>

    ${paragraphs(result?.says)}

    ${
      result?.needsThePeople
        ? `<p class="draft-watch">${t.onlyTheyCanAnswer(esc(result.needsThePeople))}</p>`
        : ""
    }

    ${
      starts.length
        ? `<h4 class="draft-head-small">${t.wherePeopleStart}</h4>
           <ul class="draft-list">${starts
             .map(
               (/** @type {any} */ s) =>
                 `<li>${esc(s.point)}${s.because ? `<span class="src">${esc(s.because)}</span>` : ""}</li>`
             )
             .join("")}</ul>`
        : ""
    }

    ${
      result?.wouldAnswer
        ? `<p class="draft-note">${t.wouldAnswer(esc(result.wouldAnswer))}</p>`
        : ""
    }

    <div class="draft-foot">
      <span class="src">${wide ? t.generalWide : t.generalNarrow}${t.generalFoot(
        esc(result?.model ?? t.someModel),
        typeof result?.costUsd === "number" ? ` · ${(result.costUsd * 100).toFixed(1)}¢` : ""
      )}</span>
    </div>
  </div>`;
}

/**
 * Prose that arrived with its own paragraph breaks, drawn as paragraphs.
 *
 * The prompt asks for three sentences and the schema says so twice, but a length
 * is a request and this is the one block on the page with no notes underneath it
 * to bound what comes back. Escaped into a single `<p>`, a four-paragraph answer
 * loses every break and becomes a wall of text - which is how the first real
 * answer rendered. Short by instruction, readable regardless.
 *
 * @param {unknown} text
 */
function paragraphs(text) {
  return String(text ?? "")
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .map((part) => `<p class="draft-opening">${esc(part)}</p>`)
    .join("");
}

/**
 * The block as plain text, for the notebook it belongs in if it is kept.
 *
 * The provenance line goes with it. A general summary pasted into Nib without one
 * is indistinguishable next year from a note about something he actually read,
 * which is the confusion this whole block is drawn to prevent.
 *
 * @param {any} result
 */
function generalText(result) {
  const starts = Array.isArray(result?.starts) ? result.starts : [];
  return [
    `${result?.subject ?? ""}`,
    "",
    result?.says ?? "",
    result?.needsThePeople ? t.textOnlyThey(result.needsThePeople) : "",
    starts.length
      ? `${t.textStarts}\n${starts
          .map((/** @type {any} */ s) => `- ${s.point}${s.because ? ` (${s.because})` : ""}`)
          .join("\n")}`
      : "",
    result?.wouldAnswer ? t.textWouldAnswer(result.wouldAnswer) : "",
    `\n---`,
    t.textProvenance(result?.model ?? t.someModel, result?.spread === "wide")
  ]
    .filter((part) => part !== "")
    .join("\n");
}

/** @param {any} h */
function hit(h) {
  return `<div class="row static">
    <span class="row-name">${esc(h.title || t.untitled)}</span>
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
      <span class="draft-title">${t.readTitle(esc(String(answer.read ?? 0)))}</span>
      <button class="act tiny" data-act="discardDraft" data-key="${KEY}">${t.discard}</button>
    </div>

    ${
      applies.length === 0
        ? `<p class="draft-opening">${t.noneBear}</p>`
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

    ${answer.missing ? `<p class="draft-watch">${t.notAnswered(esc(answer.missing))}</p>` : ""}

    <div class="draft-foot">
      <span class="src">${t.answerFoot(
        answer.model ? t.answerBy(esc(answer.model)) : "",
        typeof answer.costUsd === "number" ? ` · ${(answer.costUsd * 100).toFixed(1)}¢` : ""
      )}</span>
    </div>
  </div>`;
}

export const actions = {
  search: async () => {
    const field = document.getElementById("situation");
    situation = field instanceof HTMLInputElement ? field.value : "";
    found = await tend.invoke("searchKnowledge", { situation });
    // A new question, so neither old answer is an answer to it.
    const { discard } = await import("../model.js");
    discard(KEY);
    discard(KEY_REF);
  },

  consider: () =>
    run(KEY, "considerKnowledge", { situation, candidates: found?.matches ?? [] }),

  general: () => run(KEY_REF, "referenceOn", { subject: situation }),

  /**
   * Copy the general block, because nothing here is stored and the notebook is
   * where it goes if it is worth keeping.
   *
   * Failure is reported rather than swallowed. A copy button that silently does
   * nothing is worse than no copy button: the next action is pasting, and the
   * paste puts whatever was on the clipboard before into a note.
   */
  copyGeneral: async () => {
    const result = resultFor(KEY_REF);
    if (result === null) {
      return;
    }
    try {
      await navigator.clipboard.writeText(generalText(result));
      toast(t.copiedToast);
    } catch {
      toast(t.copyFailedToast, "bad");
    }
  },

  /** @param {Record<string, string>} d */
  discardDraft: async (d) => {
    const { discard } = await import("../model.js");
    discard(d.key);
  }
};
