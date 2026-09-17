/**
 * Prep: read this before a conversation.
 *
 * One card per person, worst drift first, capped. Everything on a card is
 * already in Tend, Jot or Nib - the point is that it is currently in three
 * windows, which is why the preparation does not happen.
 *
 * Not a roster. `people` is the roster. A card here means something has moved
 * or is owed, and when nothing has, the page is empty on purpose.
 */

import { act, esc, form, tend } from "../ui.js";
import { go, refresh } from "../app.js";
import { T } from "../text.js";
import { actions as growthActions, growingBlock } from "./growth.js";
import {
  briefHtml,
  candidatesHtml,
  isRunning,
  modelActions,
  modelStatus,
  resultFor,
  run
} from "../model.js";

const words = T.prep;

export async function render() {
  const result = await tend.invoke("prep");
  const model = await modelStatus();

  if (result.error) {
    return `<div class="card sev-critical"><div class="card-top">
      <h2 class="card-title">${words.readFailedTitle}</h2></div>
      <p class="card-why">${esc(result.error)}</p></div>`;
  }

  const cards = Array.isArray(result.cards) ? result.cards : [];

  const head = `
    <div class="view-head">
      <h1 class="view-title">${words.title}</h1>
      <p class="view-sub">${words.sub}</p>
    </div>`;

  if (cards.length === 0) {
    return `${head}
      ${practices(result.practising)}
      <div class="empty">${words.empty}</div>
      ${sources(result)}`;
  }

  return `${head}
    ${practices(result.practising)}
    ${cards.map((/** @type {any} */ c) => card(c, model)).join("")}
    ${result.dropped > 0 ? `<p class="prep-dropped">${words.dropped(result.dropped)}</p>` : ""}
    ${sources(result)}`;
}

/**
 * What he is practising, once for the page.
 *
 * Above the cards rather than on them. A principle about how to talk to people
 * is about him, not about any one of them, and printing the same two lines
 * beside six names is how a card stops being read.
 *
 * The note title is the whole entry. The principle itself is in Nib and copying
 * its text here would be a second copy to go stale - the block's job is to put
 * it back in his head before a conversation, and the title does that.
 *
 * @param {any} practising
 */
function practices(practising) {
  if (practising === undefined || practising === null) {
    return "";
  }
  if (practising.available === false) {
    return `<div class="card prep-practice">
      <div class="card-top"><h2 class="card-title">${words.practiceNoneTitle}</h2></div>
      <p class="card-why">${esc(practising.why)}</p>
    </div>`;
  }

  const active = Array.isArray(practising.active) ? practising.active : [];
  const points = Array.isArray(practising.actionPoints) ? practising.actionPoints : [];
  if (active.length === 0 && points.length === 0) {
    return "";
  }

  const lines = active
    .map(
      (/** @type {any} */ a) => `<li>
        ${esc(a.title)}
        <span class="src">${esc(a.source)}</span>
      </li>`
    )
    .join("");

  const todo = points
    .map(
      (/** @type {any} */ a) => `<li>
        ${esc(a.text)}
        <span class="src">${words.practiceWrote(esc(a.noteTitle))}</span>
      </li>`
    )
    .join("");

  return `<article class="card prep-practice">
    <div class="card-top">
      <h2 class="card-title">${words.practiceTitle}</h2>
      <span class="badge">${active.length}</span>
    </div>
    <p class="card-why">${words.practiceWhy}</p>
    ${lines ? `<div class="prep-block"><ul class="prep-list">${lines}</ul></div>` : ""}
    ${
      todo
        ? `<div class="prep-block">
             <h3 class="prep-head">${words.practiceTodoTitle}</h3>
             <ul class="prep-list">${todo}</ul>
           </div>`
        : ""
    }
    ${practising.tooMany ? `<p class="card-why dim">${esc(practising.tooMany)}</p>` : ""}
  </article>`;
}

/**
 * Where the card could not reach.
 *
 * Said out loud, because a card with no open work looks identical whether the
 * board was empty or unreachable. A missing integration that fails quietly can
 * sit there for weeks looking like a calm week.
 *
 * @param {any} result
 */
function sources(result) {
  const missing = [];
  if (!result.jotFound) {
    missing.push(words.sourceJot);
  }
  if (!result.nibFound) {
    missing.push(words.sourceNib);
  }
  if (missing.length === 0) {
    return "";
  }
  return `<p class="prep-missing">${words.sourcesMissing(esc(missing.join(" or ")))}<button class="act" data-act="openSettings">${words.sourcesSettings}</button>.</p>`;
}

/**
 * @param {any} c
 * @param {{ available: boolean, why: string | null }} model
 */
function card(c, model) {
  return `
    <div class="card prep-card${c.urgency ? ` sev-${c.urgency}` : ""}">
      <div class="card-top">
        <h2 class="card-title">${esc(c.person)}</h2>
        ${
          // The number is what gets scanned, and `.badge` has no styling at all - so
          // "+62w" and "+3d" rendered as identical plain text on a page ordered
          // worst first. A pill carries the severity colour the stripe already
          // uses. Only when there IS a number: the fallback is a sentence, and a
          // sentence in a tabular-nums pill looks like a broken badge.
          c.behindBy
            ? `<span class="pill ${esc(c.urgency ?? "ok")}">${esc(c.behindBy)}</span>`
            : `<span class="badge">${esc(c.why)}</span>`
        }
      </div>
      <p class="card-why">
        ${words.cardWhy(esc(c.why), esc(c.lastSpoke))}
        ${c.relationMeans ? `<span class="src">${esc(c.relationMeans)}</span>` : ""}
      </p>

      ${
        /*
         * First, above what he promised. It is the only block here he cannot
         * reconstruct on the way to the room: a broken promise he remembers,
         * an unasked question is exactly the thing that gets lost.
         */
        findOut(c)
      }

      ${section(words.promisedTitle, c.youPromised, (/** @type {any} */ p) => `${esc(p.text)} <span class="src">${words.promisedOpen(esc(p.openFor))}</span>`)}

      ${growingBlock(c)}

      ${raising(c)}

      ${
        /*
         * What this person owes HIM, and the way to put something in it.
         *
         * The record is a `waiting` row and has been since long before this
         * block: `domain/waiting.js` opens by calling itself the mirror of a
         * promise, and its `answered` state means THEY answered rather than that
         * he stopped caring - which is exactly the lifecycle separation he said
         * `alerts` collapsed. What was missing was any surface at the moment he
         * needs it. He had 22 promises and zero waits.
         *
         * Nothing here is coloured, aged into a badge or counted. Two reasons
         * and they stack: `waiting.js` argues that escalating somebody else's
         * silence "would be measuring them and blaming you", and card f558b0df
         * is about everything this app counts being a deficit - a list of what a
         * colleague has not done yet being the most tempting counter of the lot.
         * The Waiting view keeps severity and the chase reading, which is where
         * he goes to decide whether to chase. This is what he reads on the way
         * into the room.
         */
        oweBlock(c)
      }

      ${section(words.theyOwnTitle, c.theyOwn, (/** @type {any} */ w) => `${esc(w.name)} <span class="src">${words.theyOwnMeta(esc(w.mandate), esc(w.lastReviewed))}</span>`)}

      ${
        c.openWork === null
          ? `<div class="prep-block"><h3 class="prep-head">${words.openWorkTitle}</h3><p class="src">${words.jotUnreadable}</p></div>`
          : section(words.openWorkTitle, c.openWork, (/** @type {any} */ w) =>
              `${esc(w.text)} <span class="src">${words.openWorkMeta(esc(w.category), esc(w.status), w.found === "named")}</span>`
            )
      }

      ${
        c.lastWrote
          ? `<div class="prep-block"><h3 class="prep-head">${words.lastWroteTitle}</h3>
               <p class="prep-note">${esc(c.lastWrote.title)}
               <span class="src">${esc(new Date(c.lastWrote.edited).toLocaleDateString("sv-SE"))}</span></p></div>`
          : ""
      }

      ${draft(c, model)}

      <div class="card-foot">
        <span class="src">${words.footNote}</span>
        <span class="foot-actions">
          ${modelButtons(c, model)}
          <button class="act" data-act="openPerson" data-person="${esc(c.person)}">${words.openPerson(esc(c.person))}</button>
        </span>
      </div>
    </div>`;
}

/**
 * The questions he did not ask last time.
 *
 * Nib's summaries end with a section titled "Frågor jag inte ställde" and
 * nothing read it until now. This is the best thing in the overhaul for a
 * reason worth stating: the preparation for the next conversation was already
 * written, at the end of the last one, in his own words.
 *
 * No button. Every other block here offers an action, and this one deliberately
 * does not - marking a question "asked" would need him to remember which of six
 * he got to, and the next note's own section is a better record of that than
 * anything he would tick in a hurry.
 *
 * @param {any} c
 */
function findOut(c) {
  const questions = Array.isArray(c.toFindOut) ? c.toFindOut : [];
  if (questions.length === 0) {
    return "";
  }
  const more = Number(c.toFindOutMore ?? 0);

  return `
    <div class="prep-block">
      <h3 class="prep-head">${words.findOutTitle}</h3>
      <ul class="prep-list">
        ${questions.map((/** @type {string} */ q) => `<li>${esc(q)}</li>`).join("")}
        ${more > 0 ? `<li class="src">${words.findOutMore(more)}</li>` : ""}
      </ul>
      ${
        /*
         * Says whose words these are. They came out of a note he wrote, not
         * from anything Tend derived, and a block that does not say so is one
         * he has to guess the provenance of.
         */
        c.lastWrote
          ? `<span class="src">${words.findOutFrom(esc(c.lastWrote.title))}</span>`
          : ""
      }
    </div>`;
}

/**
 * What is worth raising with this person, and a way to say you did.
 *
 * Each topic carries its own reason. That is not padding: the whole set is
 * questions whose value is not obvious in the moment - "what are you hearing
 * about me that I am not" reads as paranoid until you have read why it is on
 * the list - and a question you do not believe in is one you skip.
 *
 * The button is the honest half. Without a way to mark one raised, the same
 * three questions sit on the card forever and the block becomes wallpaper
 * within a fortnight.
 *
 * @param {any} c
 */
function raising(c) {
  const topics = Array.isArray(c.worthRaising) ? c.worthRaising : [];
  if (topics.length === 0) {
    return "";
  }
  return `
    <div class="prep-block">
      <h3 class="prep-head">${words.raisingTitle}</h3>
      <ul class="prep-list prep-topics">
        ${topics
          .map(
            (/** @type {any} */ topic) => `
          <li class="prep-topic">
            <div class="topic-line">
              <span class="topic-text">${esc(topic.text)}</span>
              <button class="act" data-act="markRaised" data-topic="${esc(topic.id)}" data-person="${esc(c.person)}">${words.raisedButton}</button>
            </div>
            <span class="src">${esc(topic.why)}</span>
            <span class="src">${words.lastRaised(esc(topic.lastRaised))}</span>
          </li>`
          )
          .join("")}
      </ul>
    </div>`;
}

/**
 * What to follow up with this person, and the points that could become one.
 *
 * Drawn only when there is something in it. An empty block on a card he opens
 * before every conversation is a row of furniture, and the prep card already
 * carries seven blocks - but the block is not merely absent either, because
 * "nothing to follow up" and "nothing was ever written down" are different and
 * the second one has a fix. When the rows are empty and the last note had
 * points, what shows is the way in.
 *
 * @param {any} c
 */
function oweBlock(c) {
  const rows = Array.isArray(c.theyOwe) ? c.theyOwe : [];
  const points = Array.isArray(c.pointsFromNote) ? c.pointsFromNote : [];
  if (rows.length === 0 && points.length === 0) {
    return "";
  }

  const owed = rows
    .map(
      (/** @type {any} */ w) =>
        `<li>${esc(w.what)}${w.why ? ` <span class="src">${esc(w.why)}</span>` : ""}
          <span class="src">${esc(words.theyOweSince(w.since))}</span></li>`
    )
    .join("");

  /*
   * A point the summariser inferred is marked, and the mark carries its reason
   * as a tooltip rather than another line of prose.
   *
   * A third of the action-point lines in the live notebook are the model's own
   * reading - one of them, in a real note, suggested he build a better system
   * for tracking action points, which nobody said. Promoting one of those
   * silently would put a thing nobody committed to in a list of what somebody
   * owes him. Every point needs the same single click; the marked ones just say
   * what they are before he makes it.
   */
  const offer = points
    .map(
      (/** @type {any} */ p, /** @type {number} */ i) =>
        `<li>
          <button class="act tiny" data-act="takePoint" data-person="${esc(c.person)}" data-i="${i}">${words.pointsTake}</button>
          <span class="point-text">${esc(p.text)}</span>
          ${p.inferred ? `<span class="pill plain" title="${esc(words.pointsInferredWhy)}">${words.pointsInferred}</span>` : ""}
        </li>`
    )
    .join("");

  return `
    <div class="prep-block" data-block="owe">
      ${rows.length > 0 ? `<h3 class="prep-head">${esc(words.theyOweTitle)}</h3><ul class="prep-list">${owed}</ul>` : ""}
      ${
        points.length > 0
          ? `<h3 class="prep-head">${esc(words.pointsTitle)}</h3>
             <ul class="prep-list point-list">${offer}</ul>
             <p class="group-note">${esc(words.pointsNote)}</p>`
          : ""
      }
    </div>`;
}

/**
 * A labelled block, or nothing at all.
 *
 * Nothing, rather than a heading with "none" under it: a card that lists four
 * empty sections is a card nobody reads to the bottom of.
 *
 * @param {string} title
 * @param {any[]} items
 * @param {(item: any) => string} line
 */
function section(title, items, line) {
  if (!Array.isArray(items) || items.length === 0) {
    return "";
  }
  return `
    <div class="prep-block">
      <h3 class="prep-head">${esc(title)}</h3>
      <ul class="prep-list">${items.map((i) => `<li>${line(i)}</li>`).join("")}</ul>
    </div>`;
}

/**
 * The two model buttons, or a disabled pair that says why.
 *
 * A feature that is simply missing when Claude Code is not installed reads as a
 * broken build. One that says what would turn it on is a setup instruction in
 * the only place anybody would look for it.
 *
 * @param {any} c
 * @param {{ available: boolean, why: string | null }} model
 */
function modelButtons(c, model) {
  if (!model.available) {
    return `<span class="src" title="${esc(model.why ?? "")}">${words.draftingOff}</span>`;
  }

  const briefKey = `brief:${c.person}`;
  const noteKey = c.lastWrote ? `note:${c.lastWrote.id}` : null;

  const brief = isRunning(briefKey)
    ? `<button class="act" disabled>${words.drafting}</button>`
    : `<button class="act" data-act="draftBrief" data-person="${esc(c.person)}">${words.draftButton}</button>`;

  // Only where there is a note to read. Nothing here invents a reason to spend
  // a model call.
  const note =
    noteKey === null
      ? ""
      : isRunning(noteKey)
        ? `<button class="act" disabled>${words.reading}</button>`
        : `<button class="act" data-act="readNote" data-note="${esc(c.lastWrote.id)}" data-person="${esc(c.person)}">${words.readNoteButton}</button>`;

  return `${note}${brief}`;
}

/**
 * Whatever a model produced for this card, if anything.
 *
 * @param {any} c
 * @param {{ available: boolean }} model
 */
function draft(c, model) {
  if (!model.available) {
    return "";
  }

  const briefKey = `brief:${c.person}`;
  const noteKey = c.lastWrote ? `note:${c.lastWrote.id}` : null;

  const brief = resultFor(briefKey);
  const candidates = noteKey === null ? null : resultFor(noteKey);

  return [
    brief === null ? "" : briefHtml(briefKey, brief),
    candidates === null || noteKey === null ? "" : candidatesHtml(noteKey, candidates, c.person)
  ].join("");
}

export const actions = {
  // The same dialogs the person's page uses. Logging that a direction came up is
  // most likely to happen right here, minutes after the conversation.
  ...growthActions,

  /**
   * Promote one of the last note's action points into something to follow up.
   *
   * A dialog rather than a silent write, and it is one click to open plus one to
   * confirm. That is not the friction it looks like: the text comes out of a
   * summary and lands in a row he will read months later with nothing around it,
   * some of those lines are the model's own reading, and the dialog is where he
   * says what it blocks - the field that turns "skicka underlaget" into
   * something he can act on.
   *
   * The text is read off the DOM rather than passed in a data attribute. An
   * action point is a sentence with quotes and apostrophes in it, and threading
   * that through an attribute is how a row silently loses half its text.
   *
   * @param {Record<string, string>} d
   */
  takePoint: async (d) => {
    const row = document.querySelector(
      `[data-act="takePoint"][data-person="${d.person}"][data-i="${d.i}"]`
    )?.closest("li");
    const text = row?.querySelector(".point-text")?.textContent?.trim() ?? "";
    if (text === "") {
      return;
    }
    const values = await form({
      title: words.pointTitle,
      intro: words.pointIntro,
      fields: [
        { name: "what", label: words.pointWhatLabel, type: "textarea", required: true, value: text },
        { name: "why", label: words.pointWhyLabel, type: "text" }
      ],
      confirm: words.pointConfirm
    });
    if (!values) {
      return;
    }
    if (await act("waitFor", { person: d.person, ...values }, words.pointAddedToast)) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  openPerson: (d) => go("people", { person: d.person }),
  openSettings: () => go("settings"),

  /** @param {Record<string, string>} d */
  draftBrief: (d) => run(`brief:${d.person}`, "draftBrief", { person: d.person }),

  /** @param {Record<string, string>} d */
  readNote: (d) => run(`note:${d.note}`, "extractPromises", { noteId: d.note }),

  /** @param {Record<string, string>} d */
  markRaised: async (d) => {
    await tend.invoke("markRaised", { topic: d.topic, person: d.person });
    go("prep");
  },

  ...modelActions()
};
