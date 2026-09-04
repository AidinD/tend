/**
 * Ctrl+K: capture first, commands second, questions third.
 *
 * The order is the design, not a ranking of cleverness. The time a tool like
 * this actually saves is in the four seconds between someone saying "can you
 * look at the render pass" and the moment you have moved on - and every one of
 * those seconds spent navigating to a view is a promise that does not get
 * written down. So the first thing this does, and the thing it does with no
 * confirmation and no view change, is put a promise in the log.
 *
 * Commands come second because they are the same work the rail already does,
 * only faster. Questions come third because Tend answers most of them on a
 * screen already.
 *
 * ## Nothing here calls a model unless nothing else could answer
 *
 * Every capture and every command resolves locally, always. A question is
 * matched against a short list of the ones Tend can answer from its own data,
 * and only what falls through that list is offered to a model - as an offer,
 * with a button, never automatically. A palette that paused for two seconds and
 * a few cents on every keystroke would be abandoned in a week.
 */

import { CONTACT_KINDS, act, asDateInput, esc, form, tend, toast } from "./ui.js";
import { currentHalf, go, refresh } from "./app.js";
import { modelStatus } from "./model.js";
import { looksLikeQuestion, matchPerson, matchesWords, splitAddressed } from "../domain/parse.js";
import { T } from "./text.js";

const words = T.palette;

/** The views, as the palette offers them. */
/*
 * The views this palette may offer, and the actions.
 *
 * Asked, never listed. The hand-written list that used to be here offered "Go to
 * Prep" and "Go to Now" in a half that has neither, and navigating there drew the
 * work radar over private data - which made Ctrl+K the widest hole in the whole
 * arrangement, since it is bound on the window precisely so it works from
 * anywhere.
 *
 * See src/domain/halves.js. One declaration; the rail, this, and the service all
 * read it.
 */


/** @type {HTMLElement | null} */
let host = null;
/** @type {any[]} */
let roster = [];
/** @type {{ available: boolean } | null} */
let model = null;
/** @type {any[]} */
let items = [];
let selected = 0;
/** @type {string | null} */
let answer = null;

/**
 * Wire the shortcut. Called once, by the shell.
 *
 * Bound on the window rather than on a view, because the whole point is that it
 * works from wherever you are - including with a dialog open, where it stays
 * shut so that two overlays can never stack.
 */
export function installPalette() {
  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();

    if (key === "k" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (host) {
        close();
      } else if (!document.querySelector(".dialog")) {
        void open();
      }
      return;
    }

    if (host && event.key === "Escape") {
      event.preventDefault();
      close();
    }
  });
}

async function open() {
  // Both are cheap and local, and both are needed to rank the first keystroke -
  // asking for them lazily would make the first thing you type the slowest.
  [roster, model] = await Promise.all([tend.invoke("people"), modelStatus()]);
  if (!Array.isArray(roster)) {
    roster = [];
  }
  answer = null;
  selected = 0;

  host = document.createElement("div");
  host.className = "palette-scrim";
  host.innerHTML = `
    <div class="palette" role="dialog" aria-modal="true" aria-label="${words.label}">
      <input class="palette-input" type="text" autocomplete="off" spellcheck="false"
        placeholder="${words.placeholder}">
      <div class="palette-results"></div>
      <div class="palette-foot">
        <span><kbd>↑</kbd><kbd>↓</kbd> ${words.footMove}</span>
        <span><kbd>Enter</kbd> ${words.footDo}</span>
        <span><kbd>Esc</kbd> ${words.footClose}</span>
      </div>
    </div>`;

  host.addEventListener("click", (event) => {
    if (event.target === host) {
      close();
    }
  });

  const input = /** @type {HTMLInputElement} */ (host.querySelector(".palette-input"));
  input.addEventListener("input", () => draw(input.value));
  input.addEventListener("keydown", onKey);

  const results = /** @type {HTMLElement} */ (host.querySelector(".palette-results"));
  results.addEventListener("click", (event) => {
    const row = /** @type {HTMLElement | null} */ (
      event.target instanceof HTMLElement ? event.target.closest("[data-pal]") : null
    );
    if (row) {
      void choose(Number(row.dataset.pal));
    }
  });

  document.body.appendChild(host);
  input.focus();
  draw("");
}

function close() {
  host?.remove();
  host = null;
  answer = null;
}

/** @param {KeyboardEvent} event */
function onKey(event) {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (items.length === 0) {
      return;
    }
    selected = (selected + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length;
    paint();
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    void choose(selected);
  }
}

/** @param {string} text */
function draw(text) {
  items = build(text.trim());
  selected = 0;
  paint();
}

function paint() {
  const results = host?.querySelector(".palette-results");
  if (!(results instanceof HTMLElement)) {
    return;
  }

  if (answer !== null) {
    results.innerHTML = `<div class="palette-answer">${answer}</div>`;
    return;
  }

  if (items.length === 0) {
    results.innerHTML = `<div class="palette-empty">${words.empty}</div>`;
    return;
  }

  /** @type {string[]} */
  const html = [];
  /** @type {string | null} */
  let band = null;

  items.forEach((item, index) => {
    if (item.band !== band) {
      band = item.band;
      html.push(`<div class="palette-band">${esc(band ?? "")}</div>`);
    }
    html.push(`<button class="palette-row${index === selected ? " on" : ""}" data-pal="${index}">
      <span class="palette-label">${esc(item.label)}</span>
      ${item.hint ? `<span class="palette-hint">${esc(item.hint)}</span>` : ""}
    </button>`);
  });

  results.innerHTML = html.join("");
  results.querySelector(".palette-row.on")?.scrollIntoView({ block: "nearest" });
}

/** @param {number} index */
async function choose(index) {
  const item = items[index];
  if (!item) {
    return;
  }
  await item.run();
}

/* --------------------------------------------------------------- ranking -- */

/**
 * Everything on offer for what has been typed, in the order the palette
 * promises: capture, then commands, then questions.
 *
 * @param {string} text
 * @returns {any[]}
 */
function build(text) {
  if (text === "") {
    // The empty palette is the rail, so it has to be the rail of THIS half. It
    // listed every view in the app, which meant opening Ctrl+K and pressing
    // Enter in the private half went straight to the work radar.
    return currentHalf().views.map((view) =>
      command(words.goTo(view.name), view.hint, () => navigate(view.id))
    );
  }

  return [...captures(text), ...commands(text), ...questions(text)];
}

/**
 * Capture. Deliberately first and deliberately unguarded by a dialog where the
 * sentence is complete enough not to need one.
 *
 * @param {string} text
 */
function captures(text) {
  /** @type {any[]} */
  const out = [];

  const addressed = splitAddressed(roster, text);
  if (addressed) {
    const { person, rest } = addressed;
    out.push({
      band: words.bandCapture,
      label: words.promiseTo(person.name, rest),
      hint: words.loggedStraightAway,
      run: async () => {
        const done = await act("logPromise", { person: person.id, text: rest }, words.promiseLoggedToast(person.name));
        if (done) {
          close();
          refresh();
        }
      }
    });
    out.push({
      band: words.bandCapture,
      label: words.logContactWith(person.name),
      hint: rest,
      run: () => logContact(person, rest)
    });
    return out;
  }

  // A bare name is not a promise, and offering one as if it were would put an
  // empty row in the log the first time somebody typed a name to look it up.
  const named = matchPerson(roster, text);
  if (named) {
    out.push({
      band: words.bandCapture,
      label: words.logContactWith(named.name),
      hint: words.spokeToThem,
      run: () => logContact(named, "")
    });
    return out;
  }

  // No person in it, so who it is for still has to be asked. The text carries
  // over, which is the whole point - it is already typed.
  out.push({
    band: words.bandCapture,
    label: words.logPromiseOf(text),
    hint: words.asksWhoTo,
    run: () => promiseDialog(text)
  });

  return out;
}

/**
 * Commands: the rail, and the handful of things that would otherwise mean
 * finding the right view first.
 *
 * @param {string} text
 */
function commands(text) {
  /** @type {any[]} */
  const all = [];
  const here = currentHalf();
  /** @param {string} view */
  const inHalf = (view) => here.views.length === 0 || here.views.some((v) => v.id === view);

  for (const view of here.views) {
    all.push(command(words.goTo(view.name), view.hint, () => navigate(view.id)));
  }

  all.push(command(words.addSomeone, words.addSomeoneHint, async () => {
    close();
    const { addPersonDialog } = await import("./views/people.js");
    if (await addPersonDialog()) {
      go("people");
    }
  }));

  if (inHalf("focus")) {
    all.push(command(words.setFocus, words.setFocusHint, () => navigate("focus")));
  }
  if (inHalf("decisions")) {
    all.push(command(words.recordDecision, words.recordDecisionHint, () => navigate("decisions")));
  }

  all.push(command(words.importNib, words.importNibHint, async () => {
    close();
    const result = await act("indexNib", {});
    if (result) {
      toast(words.importedToast(result.contacts, result.promises, result.resolved));
      refresh();
    }
  }));
  all.push(command(words.openDataDir, words.openDataDirHint, async () => {
    close();
    await act("openDataDir", {});
  }));
  all.push(command(words.checkUpdates, words.checkUpdatesHint, async () => {
    close();
    await act("checkForUpdates", {}, words.checkingToast);
  }));

  return all.filter((item) => matchesWords(text, item.label + " " + (item.hint ?? ""))).slice(0, 6);
}

/**
 * Questions Tend can answer from its own data, and - only when none of them
 * fit - the offer to ask a model instead.
 *
 * @param {string} text
 */
function questions(text) {
  const q = text.toLowerCase();
  /** @type {any[]} */
  const out = [];

  const asks = q.includes("?") || /^(who|what|when|how|why|which)\b/.test(q);

  if (/needs? me|should i|what.*(now|today)|forgotten/.test(q)) {
    out.push(question(words.whatNeedsYou, words.whatNeedsYouHint, async () => {
      const a = await tend.invoke("attention");
      show(
        a.allInStep
          ? words.allInStep
          : words.behindCount(a.needsYou.length, a.nudges.length) +
              list(
                a.needsYou
                  .concat(a.nudges)
                  .map((/** @type {any} */ i) => words.behindLine(i.what, i.why))
              )
      );
    }));
  }

  if (/not spoken|haven.t spoken|neglect|quiet|second.hand|only heard/.test(q)) {
    out.push(question(words.notSpokenTo, words.notSpokenToHint, async () => {
      const signals = await tend.invoke("myAttention");
      show(
        !Array.isArray(signals) || signals.length === 0
          ? words.nothingStandsOut
          : list(signals.map((/** @type {any} */ s) => s.text ?? String(s)))
      );
    }));
  }

  const about = matchPerson(roster, text);
  if (about && /promis|owe|said i/.test(q)) {
    out.push(question(words.whatYouOwe(about.name), words.whatYouOweHint, async () => {
      const p = await tend.invoke("person", { person: about.id });
      show(
        p.openPromises.length === 0
          ? words.oweNothing(about.name)
          : list(p.openPromises.map((/** @type {any} */ x) => words.oweLine(x.text, x.openFor)))
      );
    }));
  }

  if (about && /last|when did|how long/.test(q)) {
    out.push(question(words.whenYouLastSpoke(about.name), words.whenYouLastSpokeHint, async () => {
      const p = await tend.invoke("person", { person: about.id });
      const last = p.recentContact[0];
      show(last ? words.lastSpokeLine(last.kind, last.when) : words.neverSpoke(about.name));
    }));
  }

  // The fallthrough, and only the fallthrough. An offer with a button rather
  // than something that happens on its own: this is the one thing in the
  // palette that costs money and takes seconds.
  if (out.length === 0 && asks && model?.available) {
    out.push(question(words.askModel, words.askModelHint, async () => {
      show(words.thinking);
      const result = await tend.invoke("answerQuestion", { question: text });
      show(result?.error ? esc(result.error) : `${esc(result.answer)}${list(result.from ?? [])}`);
    }));
  }

  return out;
}

/* ----------------------------------------------------------------- parts -- */

/** @param {string} label @param {string} hint @param {() => any} run */
function command(label, hint, run) {
  return { band: words.bandGo, label, hint, run };
}

/** @param {string} label @param {string} hint @param {() => any} run */
function question(label, hint, run) {
  return { band: words.bandAsk, label, hint, run };
}

/** @param {string} view */
function navigate(view) {
  close();
  go(view);
}

/** @param {any} person @param {string} note */
async function logContact(person, note) {
  close();
  const values = await form({
    title: words.contactTitle(person.name),
    intro: words.contactIntro,
    fields: [
      { name: "kind", label: words.contactKindLabel, type: "select", options: CONTACT_KINDS, value: "one-to-one" },
      { name: "note", label: words.contactNoteLabel, type: "textarea", value: note },
      { name: "at", label: words.when, type: "date", value: asDateInput(Date.now()) }
    ],
    confirm: words.logIt
  });
  if (values && (await act("logTouch", { subject: person.id, ...values }, words.contactLoggedToast))) {
    refresh();
  }
}

/** @param {string} text */
async function promiseDialog(text) {
  close();
  const values = await form({
    title: words.promiseTitle,
    intro: words.promiseIntro,
    fields: [
      {
        name: "person",
        label: words.promiseWhoLabel,
        type: "select",
        options: roster.map((p) => ({ value: String(p.id), label: String(p.name) }))
      },
      { name: "text", label: words.promiseTextLabel, value: text, required: true },
      { name: "due", label: words.promiseDueLabel, type: "date", hint: words.promiseDueHint }
    ],
    confirm: words.logIt
  });
  if (values && (await act("logPromise", values, words.promiseLoggedPlain))) {
    refresh();
  }
}

/** @param {string} html Already escaped by the caller. */
function show(html) {
  answer = html;
  paint();
}

/** @param {string[]} lines */
function list(lines) {
  if (!Array.isArray(lines) || lines.length === 0) {
    return "";
  }
  return `<ul class="palette-list">${lines.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>`;
}
