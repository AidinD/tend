/**
 * Growth threads in the window: one block on a person, one block on their card.
 *
 * Not a view of its own, and that is the placement argument. A page listing
 * everybody's development plans is a page you visit when you feel virtuous,
 * which is never. These blocks sit where the conversation is about to happen -
 * on the person, and on the card you read before talking to them.
 *
 * The actions are exported as one map and spread into both views, because both
 * surfaces offer the same six things and a second copy of any of them would
 * drift. The dialogs are the interesting part: the form is two sittings, and the
 * split is enforced here rather than suggested.
 */

import {
  act,
  ask,
  asDateInput,
  DEFAULT_CADENCE_DAYS,
  DRIVER_OPTIONS,
  esc,
  form,
  isLiveStatus,
  STANCE_OPTIONS,
  tend
} from "../ui.js";
import { refresh } from "../app.js";
import { T } from "../text.js";

const t = T.growth;

/**
 * The endings offered in the window.
 *
 * Not derived from `STATUSES`, and this is the one list here that is written out
 * on purpose: `open` is not an ending, and each of the three needs a sentence
 * saying what choosing it means. Every option carries its consequence, the way
 * the delegation levels do.
 */
const ENDINGS = [
  { value: "reached", label: t.endingReached },
  { value: "dropped", label: t.endingDropped },
  { value: "expectation", label: t.endingExpectation }
];

/**
 * The whole growth block for a person's page.
 *
 * @param {string} personId
 * @returns {Promise<string>}
 */
export async function threadsBlock(personId) {
  const result = await tend.invoke("growth", { person: personId });
  if (result?.error) {
    return "";
  }

  const threads = Array.isArray(result.threads) ? result.threads : [];

  const head = `<div class="block-title">${t.blockTitle}</div>`;
  const open = `<button class="act" data-act="openThread" data-person="${esc(personId)}">${t.openButton}</button>`;

  if (threads.length === 0) {
    return `<div class="block">
      ${head}
      <div class="empty">${t.empty}</div>
      <div class="button-row">${open}</div>
    </div>`;
  }

  // Said, not enforced. Attention is the scarce thing this whole tool exists to
  // be honest about, and a limit imposed on his judgement would be software
  // deciding how many people he is allowed to develop at once.
  const tooMany =
    result.live > result.comfortable
      ? `<p class="card-why dim">${t.tooMany(result.live)}</p>`
      : "";

  return `<div class="block">
    ${head}
    ${threads.map(thread).join("")}
    ${tooMany}
    <div class="button-row">${open}</div>
  </div>`;
}

/** @param {any} row */
function thread(row) {
  const live = isLiveStatus(row.status);

  const counts = t.counts(row.talks, row.observations, esc(row.lastTalkedWords));

  const asks = row.asks
    ? `<p class="card-why warn-text">${esc(row.asks)}</p>`
    : "";

  // The guess is left out while it is still word for word the aim, which it is
  // from the moment a thread is opened until the direction gets reworded. Showing
  // it then would print the same sentence twice under two labels, which reads as
  // the tool having lost track of which is which.
  const guess = String(row.fields.hypothesis ?? "").trim() === String(row.aim ?? "").trim() ? "" : row.fields.hypothesis;

  const detail = [
    [t.theirWords, row.fields.theirWords],
    [t.through, row.fields.assignment],
    [t.iWillSee, row.marker],
    [t.imPuttingIn, row.fields.offering],
    [t.myGuess, guess],
    [t.ifNothingChanges, row.fields.ifNothingChanges],
    [t.told, (row.told ?? []).join(", ")],
    [t.endedBecause, row.fields.endedWhy]
  ]
    .filter(([, value]) => String(value ?? "").trim() !== "")
    .map(([label, value]) => `<li>${t.detailLine(esc(label), esc(value))}</li>`)
    .join("");

  const still = [
    row.missing.prepare.length > 0 ? t.stillToPrepare(row.missing.prepare.join(" ")) : "",
    row.missing.ask.length > 0 ? t.stillToAsk(row.missing.ask.join(" ")) : ""
  ]
    .filter((line) => line !== "")
    .map((line) => `<p class="card-why dim">${esc(line)}</p>`)
    .join("");

  // "It came up" only appears once their view is on record, because until then
  // the first conversation has somewhere better to go: the second sitting, which
  // logs the conversation itself as well as what came back.
  const asked = row.stance !== "unasked";

  // Removal belongs to the thread that should never have existed, so it is
  // offered while nothing has happened yet and withdrawn the moment something
  // has. It used to sit on the other branch entirely - on an ENDED thread whose
  // ending had been said - which put a delete button at the end of the
  // responsible path: write the reason, confirm you told them, remove. It read
  // as the last step of that path rather than as the erasure of it, and what it
  // erased was the reason the previous two steps had just asked for.
  const mistake =
    live && Number(row.talks ?? 0) === 0
      ? `<button class="act tiny danger" data-act="threadRemove" data-id="${esc(row.id)}" data-aim="${esc(row.aim)}">${t.openedByMistake}</button>`
      : "";

  const buttons = live
    ? `
      <button class="act${asked ? "" : " primary"}" data-act="threadAsked" data-id="${esc(row.id)}">${t.afterConversation}</button>
      ${asked ? `<button class="act" data-act="threadTalked" data-id="${esc(row.id)}">${t.itCameUp}</button>` : ""}
      ${row.marker ? `<button class="act" data-act="threadObserved" data-id="${esc(row.id)}">${t.iSawIt}</button>` : ""}
      <button class="act" data-act="threadPrepare" data-id="${esc(row.id)}">${t.prepare}</button>
      <button class="act" data-act="threadEnd" data-id="${esc(row.id)}">${t.endIt}</button>
      ${mistake}`
    : row.fields.endingSaid
      ? ""
      : `<button class="act" data-act="threadSaid" data-id="${esc(row.id)}">${t.iHaveToldThem}</button>`;

  return `<div class="thread">
    <div class="thread-top">
      <span class="thread-aim">${esc(row.aim)}</span>
      ${live ? `<button class="act tiny" data-act="threadReword" data-id="${esc(row.id)}">${t.reword}</button>` : ""}
      <span class="line-right">
        <span class="pill plain">${esc(row.driverLabel)}</span>
        <span class="pill plain">${esc(row.stanceLabel)}</span>
        ${live ? "" : `<span class="pill plain">${esc(row.statusLabel)}</span>`}
      </span>
    </div>
    <p class="card-why dim">${counts}</p>
    ${asks}
    ${detail ? `<ul class="prep-list">${detail}</ul>` : ""}
    ${still}
    ${buttons.trim() === "" ? "" : `<div class="button-row">${buttons}</div>`}
  </div>`;
}

/**
 * The compact version for a prep card.
 *
 * Read minutes before a conversation, so it carries only the two things that
 * change what he says: the direction, and whether it is moving. The buttons are
 * on the person's page - a card is for reading.
 *
 * @param {any} c A prep card.
 * @returns {string}
 */
export function growingBlock(c) {
  const threads = Array.isArray(c.growing) ? c.growing : [];
  if (threads.length === 0) {
    return "";
  }
  return `
    <div class="prep-block">
      <h3 class="prep-head">${t.blockTitle}</h3>
      <ul class="prep-list prep-topics">
        ${threads
          .map(
            (/** @type {any} */ row) => `
          <li class="prep-topic">
            <div class="topic-line">
              <span class="topic-text">${esc(row.aim)}</span>
              ${
                String(row.stance ?? "unasked") === "unasked"
                  ? `<button class="act" data-act="threadAsked" data-id="${esc(row.id)}">${t.afterConversation}</button>`
                  : `<button class="act" data-act="threadTalked" data-id="${esc(row.id)}">${t.itCameUp}</button>`
              }
            </div>
            ${row.marker ? `<span class="src">${t.youWillSee(esc(row.marker))}</span>` : ""}
            <span class="src">${t.cardCounts(row.talks, row.observations, esc(row.lastTalked))}</span>
            ${row.asks ? `<span class="src">${esc(row.asks)}</span>` : ""}
            ${
              /*
               * Shown only on a stalled thread, and only there.
               *
               * The stall question asks whether the aim is wrong or the support
               * is missing. The first half is a judgement nobody can make for
               * him; the second is something he already wrote down when he
               * prepared the thread, and the card was posing the question
               * without putting the answer next to it. An empty offering is not
               * a gap in the card - it IS the answer, and worth saying in as
               * many words.
               */
               row.stalled
                 ? String(row.offering ?? "").trim() === ""
                   ? `<span class="src warn-text">${t.stalledNoOffering}</span>`
                   : `<span class="src">${t.stalledOffering(esc(row.offering))}</span>`
                 : ""
            }
          </li>`
          )
          .join("")}
      </ul>
    </div>`;
}

/**
 * Stage A: what he can work out alone, and what he is prepared to put in.
 *
 * Every field here is his own guess or his own commitment. Nothing on this
 * screen asks him what the other person wants, which is the whole reason the
 * form has two of them - a single screen at his own desk is how a manager ends
 * up writing somebody else's ambitions for them.
 *
 * @param {Record<string, any>} [values]
 * @param {boolean} [opening]
 */
function prepareFields(values = {}, opening = false) {
  /** @type {import("../ui.js").Field[]} */
  const fields = [];

  // Opening asks for the direction ONCE, and the label has to say whose sentence
  // it is. The first version asked for "the direction" here and "what do you
  // think the direction is" four fields further down, which is the same question
  // twice: before the conversation the direction IS his guess, and the two only
  // become different things afterwards, when the aim may be rewritten to what
  // they agreed while the guess stays as what he thought first. Asking both made
  // the whole form unreadable - it left the reader unable to tell whether it
  // wanted his description or the other person's answer, which is precisely the
  // distinction the two sittings exist to keep clear.
  if (opening) {
    fields.push({
      name: "aim",
      label: t.fAim,
      required: true,
      type: "textarea",
      placeholder: t.fAimPlaceholder,
      hint: t.fAimHint
    });
    return fields;
  }

  fields.push(
    {
      name: "driver",
      label: t.fDriver,
      type: "select",
      options: DRIVER_OPTIONS,
      value: values.driver || "unknown",
      hint: t.fDriverHint
    },
    // Both of these belong to one answer above, so neither is on the screen
    // under any other. Switching back to "they want it" clears them, which is
    // the honest behaviour: a need typed under a different answer is not a
    // record of anything.
    {
      name: "need",
      label: t.fNeed,
      type: "textarea",
      value: values.need,
      placeholder: t.fNeedPlaceholder,
      showIf: { field: "driver", equals: "needs" },
      hint: t.fNeedHint
    },
    {
      name: "ifNothingChanges",
      label: t.fIfNothing,
      type: "textarea",
      value: values.ifNothingChanges,
      showIf: { field: "driver", equals: "needs" },
      hint: t.fIfNothingHint
    },
    // Past tense in the label, and about them. Phrased as a question it collected
    // a plan instead: "talk to their lead and find out" is a thing he will do,
    // and it landed here because an empty box invites being filled.
    {
      name: "alreadySeen",
      label: t.fAlreadySeen,
      type: "textarea",
      value: values.alreadySeen,
      hint: t.fAlreadySeenHint
    },
    {
      name: "offering",
      label: t.fOffering,
      type: "textarea",
      value: values.offering,
      placeholder: t.fOfferingPlaceholder,
      hint: t.fOfferingHint
    }
  );

  return fields;
}

/**
 * Stage B: what the conversation returned.
 *
 * @param {Record<string, any>} values
 */
function askedFields(values) {
  return /** @type {import("../ui.js").Field[]} */ ([
    {
      name: "theirWords",
      label: t.fTheirWords,
      type: "textarea",
      value: values.theirWords,
      hint: t.fTheirWordsHint
    },
    {
      name: "stance",
      label: t.fStance,
      type: "select",
      options: STANCE_OPTIONS,
      value: values.stance || "unasked"
    },
    {
      name: "assignment",
      label: t.fAssignment,
      type: "textarea",
      value: values.assignment,
      placeholder: t.fAssignmentPlaceholder,
      hint: t.fAssignmentHint
    },
    {
      name: "marker",
      label: t.fMarker,
      type: "textarea",
      value: values.marker,
      placeholder: t.fMarkerPlaceholder,
      hint: t.fMarkerHint
    },
    // Recording what somebody said IS proof you spoke to them, so this dialog
    // carries the date of the conversation and logs it. Without that, filling in
    // the second sitting left the thread believing it had never been discussed:
    // the clock kept running and the count stayed at zero, so the stall reading -
    // the whole point of the feature - could never fire for anybody who used the
    // form the obvious way.
    {
      name: "at",
      label: t.fWhenTalked,
      type: "date",
      value: asDateInput(Date.now()),
      hint: t.fWhenTalkedHint
    },
    {
      name: "cadenceDays",
      label: t.fCadence,
      type: "number",
      min: 1,
      value: values.cadenceDays || DEFAULT_CADENCE_DAYS,
      hint: t.fCadenceHint
    },
    {
      name: "horizon",
      label: t.fHorizon,
      type: "date",
      value: values.horizon ? asDateInput(values.horizon) : "",
      hint: t.fHorizonHint
    }
  ]);
}

/**
 * What a dialog returned, as a patch the service can apply.
 *
 * `form` reports an empty box as `undefined`, and the service reads an absent
 * field as "leave what was there". Together those two reasonable rules mean a
 * field cannot be emptied: clearing a box and saving puts the old text back
 * without a word, which is how one real thread ended up with nearly the same
 * sentence in two fields after its owner moved the text from one to the other.
 *
 * So every text field the dialog actually showed is sent, as a string. That also
 * removes an asymmetry that made the whole form feel unreliable - a field hidden
 * by `showIf` was already being blanked, while a visible one could not be.
 *
 * The two that keep the older rule do so for a reason. A cadence of nothing is
 * not a cadence, so an empty box leaves the interval alone. An empty horizon IS
 * meaningful - it says stop asking whether this is still the thing - so it clears.
 *
 * @param {import("../ui.js").Field[]} fields
 * @param {Record<string, any>} values
 * @returns {Record<string, any>}
 */
function patchFrom(fields, values) {
  /** @type {Record<string, any>} */
  const patch = {};
  for (const field of fields) {
    if (field.type === "note") {
      continue;
    }
    const value = values[field.name];
    if (field.name === "cadenceDays") {
      if (value !== undefined) {
        patch[field.name] = value;
      }
      continue;
    }
    if (field.name === "horizon") {
      patch[field.name] = value === undefined ? null : value;
      continue;
    }
    patch[field.name] = field.type === "checkbox" ? value === true : String(value ?? "");
  }
  return patch;
}

export const actions = {
  /** @param {Record<string, string>} d */
  openThread: async (d) => {
    const values = await form({
      title: t.openTitle,
      intro: t.openIntro,
      fields: prepareFields({}, true),
      confirm: t.openConfirm
    });
    if (!values) {
      return;
    }
    // The one sentence he wrote is both the thread's name and the record of what
    // he thought before asking. Stored twice on purpose: the aim can be reworded
    // to whatever they agree on, and the guess must survive that so the two can
    // be read side by side afterwards.
    if (await act("openThread", { person: d.person, ...values, hypothesis: values.aim }, t.openedToast)) {
      refresh();
    }
  },

  /**
   * Change the direction, and only the direction.
   *
   * Its own action because it is its own concept: the thread is named after it,
   * and it is the one thing likely to change after the person has been asked.
   * It used to be the first field inside "Prepare", which is named after
   * something else - so there was no obvious place to reword it, and the field
   * that looked obvious was the record sitting beside it.
   *
   * The original guess is shown here rather than in Prepare, because this is the
   * moment it is worth reading: you are about to replace what you thought with
   * what you agreed, and seeing the two together is the whole reason the guess
   * is kept.
   *
   * @param {Record<string, string>} d
   */
  threadReword: async (d) => {
    const current = await currentThread(d.id);
    if (!current) {
      return;
    }
    const values = await form({
      title: t.rewordTitle,
      intro: t.rewordIntro,
      fields: [
        {
          name: "aim",
          label: t.rewordAimLabel,
          required: true,
          type: "textarea",
          value: current.fields.aim,
          hint: t.rewordAimHint
        },
        {
          name: "hypothesis",
          label: t.rewordGuessLabel,
          type: "note",
          value: current.fields.hypothesis,
          hint: t.rewordGuessHint
        }
      ],
      confirm: t.save
    });
    if (!values) {
      return;
    }
    if (await act("updateThread", { id: d.id, fields: { aim: values.aim } }, t.rewordedToast)) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  threadPrepare: async (d) => {
    const current = await currentThread(d.id);
    if (!current) {
      return;
    }
    const fields = prepareFields(current.fields);
    const values = await form({
      title: t.prepareTitle,
      intro: t.prepareIntro,
      fields,
      confirm: t.save
    });
    if (!values) {
      return;
    }
    if (await act("updateThread", { id: d.id, fields: patchFrom(fields, values) }, t.savedToast)) {
      refresh();
    }
  },

  /**
   * Stage B, and the branch that answers "what if they do not want it".
   *
   * A declined direction is not an edge case, it is one of the three normal
   * outcomes, so it gets asked about immediately rather than left as a status he
   * has to remember to change. The follow-up is the only question that matters:
   * does the job require it anyway.
   *
   * @param {Record<string, string>} d
   */
  threadAsked: async (d) => {
    const current = await currentThread(d.id);
    if (!current) {
      return;
    }
    const fields = askedFields(current.fields);
    const values = await form({
      title: t.askedTitle,
      intro: t.askedIntro,
      fields,
      confirm: t.save
    });
    if (!values) {
      return;
    }
    // The date belongs to the conversation, not to the thread's own fields.
    const talkedAt = values.at;
    const patch = patchFrom(fields, values);
    delete patch.at;

    if (!(await act("updateThread", { id: d.id, fields: patch }, t.savedToast))) {
      return;
    }

    if (String(values.stance ?? "unasked") !== "unasked" && Number(current.talks ?? 0) === 0) {
      await act("logGrowthNote", { growth: d.id, at: talkedAt, observed: false, note: "" });
    }

    if (values.stance !== "declined") {
      refresh();
      return;
    }

    const required = await ask({
      title: t.declinedTitle,
      body: t.declinedBody,
      confirm: t.declinedConfirm
    });

    const ending = await form({
      title: required ? t.expectationTitle : t.letGoTitle,
      intro: required ? t.expectationIntro : t.letGoIntro,
      fields: [
        { name: "why", label: required ? t.expectationWhy : t.letGoWhy, type: "textarea", required: true },
        {
          name: "said",
          label: t.saidLabel,
          type: "checkbox",
          hint: t.saidHint
        }
      ],
      confirm: t.save
    });
    if (!ending) {
      refresh();
      return;
    }
    if (
      await act(
        "endThread",
        { id: d.id, status: required ? "expectation" : "dropped", why: ending.why, said: ending.said },
        t.recordedToast
      )
    ) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  threadTalked: async (d) => {
    const values = await form({
      title: t.talkedTitle,
      intro: t.talkedIntro,
      fields: [
        { name: "note", label: t.talkedNoteLabel, placeholder: t.talkedNotePlaceholder },
        { name: "at", label: t.when, type: "date", value: asDateInput(Date.now()) }
      ],
      confirm: t.logIt
    });
    if (!values) {
      return;
    }
    if (await act("logGrowthNote", { growth: d.id, ...values, observed: false }, t.loggedToast)) {
      refresh();
    }
  },

  /**
   * The marker, actually seen. Also the only right moment to ask who else needs
   * to hear it.
   *
   * That question was missing entirely, and it is the one part of this whose
   * absence is expensive. Development nobody outside the one-to-one ever sees
   * converts into nothing: no level, no salary, no next assignment. The manager
   * arguing for somebody in rooms they are not in is the piece of the job only a
   * manager can do, and the tool was silent about it.
   *
   * It belongs here rather than as another field on the form. The day something
   * actually happened is the day to tell somebody, and this dialog only opens on
   * a day when something did.
   *
   * @param {Record<string, string>} d
   */
  threadObserved: async (d) => {
    const [current, roster] = await Promise.all([currentThread(d.id), tend.invoke("people")]);
    const others = (Array.isArray(roster) ? roster : [])
      .filter((/** @type {any} */ p) => p.id !== current?.person)
      .map((/** @type {any} */ p) => ({ value: String(p.id), label: String(p.name) }));

    const values = await form({
      title: t.observedTitle,
      intro: t.observedIntro,
      fields: [
        { name: "note", label: t.observedNoteLabel, type: "textarea", placeholder: t.observedNotePlaceholder },
        { name: "at", label: t.when, type: "date", value: asDateInput(Date.now()) },
        {
          name: "tell",
          label: t.tellLabel,
          type: "select",
          options: [{ value: "", label: t.tellNobody }, ...others],
          hint: t.tellHint
        }
      ],
      confirm: t.recordIt
    });
    if (!values) {
      return;
    }
    if (!(await act("logGrowthNote", { growth: d.id, ...values, observed: true }, t.recordedToast))) {
      return;
    }

    const tell = String(values.tell ?? "");
    if (tell !== "") {
      const said = String(values.note ?? "").trim() || String(current?.marker ?? "");
      const name = others.find((o) => o.value === tell)?.label ?? t.them;
      // A promise rather than a note to self, deliberately: promises here escalate
      // past a week and no focus can dampen them, which is exactly the weight this
      // deserves. If it turns out not to be worth saying, closing it costs a click.
      await act("logPromise", { person: tell, text: t.tellPromise(name, said) }, t.tellPromiseToast(name));
    }
    refresh();
  },

  /** @param {Record<string, string>} d */
  threadEnd: async (d) => {
    const values = await form({
      title: t.endTitle,
      intro: t.endIntro,
      fields: [
        { name: "status", label: t.endHowLabel, type: "select", options: ENDINGS, value: "reached" },
        {
          name: "why",
          label: t.endWhyLabel,
          type: "textarea",
          required: true,
          hint: t.endWhyHint
        },
        {
          name: "said",
          label: t.saidLabel,
          type: "checkbox",
          hint: t.endSaidHint
        }
      ],
      confirm: t.endIt
    });
    if (!values) {
      return;
    }
    if (await act("endThread", { id: d.id, ...values }, t.recordedToast)) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  threadSaid: async (d) => {
    if (await act("updateThread", { id: d.id, fields: { endingSaid: true } }, t.notedToast)) {
      refresh();
    }
  },

  /**
   * The thread that should never have been opened - the wrong person, a
   * duplicate, a sentence typed into the wrong page.
   *
   * The only removal offered here, and the wording says which fact it asserts
   * rather than which mechanism it runs. "Remove" was the old label, on the old
   * branch, and its confirmation opened with the reassuring half - "the events
   * stay in the log, nothing here is really deleted" - and put the loss in a
   * subordinate clause after it. Both halves were true and the order was
   * backwards: the log keeps the bytes, and every read path in the app filters
   * them, so the sentence a reader took away was the one that said nothing was
   * lost.
   *
   * @param {Record<string, string>} d
   */
  threadRemove: async (d) => {
    const sure = await ask({
      title: t.removeTitle,
      body: t.removeBody(d.aim),
      confirm: t.removeConfirm,
      tone: "danger"
    });
    if (sure && (await act("removeRow", { collection: "growth", id: d.id }, t.removedToast))) {
      refresh();
    }
  }
};

/**
 * The thread as it stands, so a dialog reopens rather than asking again.
 *
 * @param {string} id
 * @returns {Promise<any | null>}
 */
async function currentThread(id) {
  const found = await tend.invoke("thread", { id });
  return found?.error ? null : found;
}
