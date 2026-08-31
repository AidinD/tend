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
  STANCE_OPTIONS,
  tend
} from "../ui.js";
import { refresh } from "../app.js";

/**
 * The endings offered in the window.
 *
 * Not derived from `STATUSES`, and this is the one list here that is written out
 * on purpose: `open` is not an ending, and each of the three needs a sentence
 * saying what choosing it means. Every option carries its consequence, the way
 * the delegation levels do.
 */
const ENDINGS = [
  { value: "reached", label: "Reached - they can do it now" },
  { value: "dropped", label: "Let go - not the direction after all" },
  { value: "expectation", label: "Stated as an expectation - the job needs it whether they want it or not" }
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

  const head = `<div class="block-title">Growing</div>`;
  const open = `<button class="act" data-act="openThread" data-person="${esc(personId)}">Open a direction</button>`;

  if (threads.length === 0) {
    return `<div class="block">
      ${head}
      <div class="empty">
        Nothing yet. A direction goes here when there is one - not for everybody,
        and not because the calendar says it is that time of year.
      </div>
      <div class="button-row">${open}</div>
    </div>`;
  }

  // Said, not enforced. Attention is the scarce thing this whole tool exists to
  // be honest about, and a limit imposed on his judgement would be software
  // deciding how many people he is allowed to develop at once.
  const tooMany =
    result.live > result.comfortable
      ? `<p class="card-why dim">${result.live} live at once. Two is about what anybody can actually hold - the rest tend to become paperwork.</p>`
      : "";

  return `<div class="block">
    ${head}
    ${threads.map(thread).join("")}
    ${tooMany}
    <div class="button-row">${open}</div>
  </div>`;
}

/** @param {any} t */
function thread(t) {
  const live = t.status === "open" || t.status === "expectation";

  const counts = `discussed ${t.talks}×, seen ${t.observations}× &middot; last talked ${esc(t.lastTalkedWords)}`;

  const asks = t.asks
    ? `<p class="card-why warn-text">${esc(t.asks)}</p>`
    : "";

  // The guess is left out while it is still word for word the aim, which it is
  // from the moment a thread is opened until the direction gets reworded. Showing
  // it then would print the same sentence twice under two labels, which reads as
  // the tool having lost track of which is which.
  const guess = String(t.fields.hypothesis ?? "").trim() === String(t.aim ?? "").trim() ? "" : t.fields.hypothesis;

  const detail = [
    ["Their words", t.fields.theirWords],
    ["Through", t.fields.assignment],
    ["I will see", t.marker],
    ["I am putting in", t.fields.offering],
    ["My guess before asking", guess],
    ["If nothing changes", t.fields.ifNothingChanges],
    ["Told", (t.told ?? []).join(", ")],
    ["Ended because", t.fields.endedWhy]
  ]
    .filter(([, value]) => String(value ?? "").trim() !== "")
    .map(([label, value]) => `<li>${esc(label)}: ${esc(value)}</li>`)
    .join("");

  const still = [
    t.missing.prepare.length > 0 ? `Still to prepare: ${t.missing.prepare.join(" ")}` : "",
    t.missing.ask.length > 0 ? `Still to ask them: ${t.missing.ask.join(" ")}` : ""
  ]
    .filter((line) => line !== "")
    .map((line) => `<p class="card-why dim">${esc(line)}</p>`)
    .join("");

  // "It came up" only appears once their view is on record, because until then
  // the first conversation has somewhere better to go: the second sitting, which
  // logs the conversation itself as well as what came back.
  const asked = t.stance !== "unasked";

  const buttons = live
    ? `
      <button class="act${asked ? "" : " primary"}" data-act="threadAsked" data-id="${esc(t.id)}">After the conversation</button>
      ${asked ? `<button class="act" data-act="threadTalked" data-id="${esc(t.id)}">It came up</button>` : ""}
      ${t.marker ? `<button class="act" data-act="threadObserved" data-id="${esc(t.id)}">I saw it</button>` : ""}
      <button class="act" data-act="threadPrepare" data-id="${esc(t.id)}">Prepare</button>
      <button class="act" data-act="threadEnd" data-id="${esc(t.id)}">End it</button>`
    : t.fields.endingSaid
      ? `<button class="act tiny danger" data-act="threadRemove" data-id="${esc(t.id)}" data-aim="${esc(t.aim)}">Remove</button>`
      : `<button class="act" data-act="threadSaid" data-id="${esc(t.id)}">I have told them</button>`;

  return `<div class="thread">
    <div class="thread-top">
      <span class="thread-aim">${esc(t.aim)}</span>
      ${live ? `<button class="act tiny" data-act="threadReword" data-id="${esc(t.id)}">Reword</button>` : ""}
      <span class="line-right">
        <span class="pill plain">${esc(t.driverLabel)}</span>
        <span class="pill plain">${esc(t.stanceLabel)}</span>
        ${live ? "" : `<span class="pill plain">${esc(t.statusLabel)}</span>`}
      </span>
    </div>
    <p class="card-why dim">${counts}</p>
    ${asks}
    ${detail ? `<ul class="prep-list">${detail}</ul>` : ""}
    ${still}
    <div class="button-row">${buttons}</div>
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
      <h3 class="prep-head">Growing</h3>
      <ul class="prep-list prep-topics">
        ${threads
          .map(
            (/** @type {any} */ t) => `
          <li class="prep-topic">
            <div class="topic-line">
              <span class="topic-text">${esc(t.aim)}</span>
              ${
                String(t.stance ?? "unasked") === "unasked"
                  ? `<button class="act" data-act="threadAsked" data-id="${esc(t.id)}">After the conversation</button>`
                  : `<button class="act" data-act="threadTalked" data-id="${esc(t.id)}">It came up</button>`
              }
            </div>
            ${t.marker ? `<span class="src">You will see: ${esc(t.marker)}</span>` : ""}
            <span class="src">Discussed ${t.talks}×, seen ${t.observations}× &middot; last talked ${esc(t.lastTalked)}.</span>
            ${t.asks ? `<span class="src">${esc(t.asks)}</span>` : ""}
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
               t.stalled
                 ? String(t.offering ?? "").trim() === ""
                   ? `<span class="src warn-text">You never wrote down what you were putting in. That is one answer to the question above.</span>`
                   : `<span class="src">You said you would put in: ${esc(t.offering)}</span>`
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
      label: "What you think the direction is, in one sentence",
      required: true,
      type: "textarea",
      placeholder: "Runs the design review without me in the room",
      hint:
        "Yours, before you have asked. What they will be able to DO, not an area to improve in - " +
        "their own answer comes later and is kept beside this. Everything else about this thread " +
        "can wait until you use \"Prepare\" on the card."
    });
    return fields;
  }

  fields.push(
    {
      name: "driver",
      label: "Do they want this, or does the job need it?",
      type: "select",
      options: DRIVER_OPTIONS,
      value: values.driver || "unknown",
      hint:
        "Two different instruments. The development one used on a performance gap reads as a " +
        "disciplinary process with a smile. Not knowing yet is a real answer."
    },
    // Both of these belong to one answer above, so neither is on the screen
    // under any other. Switching back to "they want it" clears them, which is
    // the honest behaviour: a need typed under a different answer is not a
    // record of anything.
    {
      name: "need",
      label: "Whose need is it?",
      type: "textarea",
      value: values.need,
      placeholder: "The team stalls whenever I am away",
      showIf: { field: "driver", equals: "needs" },
      hint: "Concretely enough that you could say it out loud to them."
    },
    {
      name: "ifNothingChanges",
      label: "What happens if nothing changes?",
      type: "textarea",
      value: values.ifNothingChanges,
      showIf: { field: "driver", equals: "needs" },
      hint:
        "If the honest answer is nothing, this is a wish rather than a need. \"You stay where you " +
        "are\" is a legitimate answer."
    },
    // Past tense in the label, and about them. Phrased as a question it collected
    // a plan instead: "talk to their lead and find out" is a thing he will do,
    // and it landed here because an empty box invites being filled.
    {
      name: "alreadySeen",
      label: "What you have already seen them do",
      type: "textarea",
      value: values.alreadySeen,
      hint: "Only what has happened. Empty is itself the finding: no evidence under the direction."
    },
    {
      name: "offering",
      label: "What are you putting in?",
      type: "textarea",
      value: values.offering,
      placeholder: "The architecture review, and I stop writing the migration plan myself",
      hint:
        "Cover, a room to be let into, work you stop doing yourself. Write it as done or dated - " +
        "\"I could\" is not an offering."
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
      label: "What they said they want, in their words",
      type: "textarea",
      value: values.theirWords,
      hint: "Theirs, not a tidied version. A plan in your words is one they will read as yours."
    },
    {
      name: "stance",
      label: "How did that land against your guess?",
      type: "select",
      options: STANCE_OPTIONS,
      value: values.stance || "unasked"
    },
    {
      name: "assignment",
      label: "Which real work does this happen through?",
      type: "textarea",
      value: values.assignment,
      placeholder: "Owns the migration end to end",
      hint: "Name the assignment, not a skill area. Real stakes move people; courses feel like it."
    },
    {
      name: "marker",
      label: "What will you see in three months that you do not see now?",
      type: "textarea",
      value: values.marker,
      placeholder: "Chairs the review once with me absent",
      hint:
        "If you cannot finish that sentence the direction is too vague to follow. \"Better " +
        "communication\" is unobservable; \"runs it without me\" is not."
    },
    // Recording what somebody said IS proof you spoke to them, so this dialog
    // carries the date of the conversation and logs it. Without that, filling in
    // the second sitting left the thread believing it had never been discussed:
    // the clock kept running and the count stayed at zero, so the stall reading -
    // the whole point of the feature - could never fire for anybody who used the
    // form the obvious way.
    {
      name: "at",
      label: "When you talked",
      type: "date",
      value: asDateInput(Date.now()),
      hint: "Logged as a conversation too, unless you have already logged one."
    },
    {
      name: "cadenceDays",
      label: "How often should it come up?",
      type: "number",
      min: 1,
      value: values.cadenceDays || DEFAULT_CADENCE_DAYS,
      hint: "In the one-to-one, never as its own meeting. A separate meeting kills it."
    },
    {
      name: "horizon",
      label: "When should the direction itself be questioned?",
      type: "date",
      value: values.horizon ? asDateInput(values.horizon) : "",
      hint: "Not a deadline. When it passes the thread asks whether this is still the thing."
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
      title: "Open a direction",
      intro:
        "One sentence is enough to open it. The rest - whether they want this or the job needs " +
        "it, what you have already seen, what you are putting in - comes later, from \"Prepare\" " +
        "on the card, whenever you actually have an answer for it.",
      fields: prepareFields({}, true),
      confirm: "Open it"
    });
    if (!values) {
      return;
    }
    // The one sentence he wrote is both the thread's name and the record of what
    // he thought before asking. Stored twice on purpose: the aim can be reworded
    // to whatever they agree on, and the guess must survive that so the two can
    // be read side by side afterwards.
    if (await act("openThread", { person: d.person, ...values, hypothesis: values.aim }, "Opened.")) {
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
      title: "Reword the direction",
      intro: "The thread is named after this. Change it once you know what you actually agreed on.",
      fields: [
        {
          name: "aim",
          label: "The direction as it stands",
          required: true,
          type: "textarea",
          value: current.fields.aim,
          hint: "What they will be able to DO. If it describes what you do for them, the marker will measure the wrong person."
        },
        {
          name: "hypothesis",
          label: "What you thought before you asked",
          type: "note",
          value: current.fields.hypothesis,
          hint: "Kept as a record, so it can sit next to what they actually said."
        }
      ],
      confirm: "Save"
    });
    if (!values) {
      return;
    }
    if (await act("updateThread", { id: d.id, fields: { aim: values.aim } }, "Reworded.")) {
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
      title: "Prepare",
      intro: "Your side of it. Reopened where you left it rather than asking again.",
      fields,
      confirm: "Save"
    });
    if (!values) {
      return;
    }
    if (await act("updateThread", { id: d.id, fields: patchFrom(fields, values) }, "Saved.")) {
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
      title: "After the conversation",
      intro: "What came back. This overwrites nothing you guessed - the guess is kept beside it.",
      fields,
      confirm: "Save"
    });
    if (!values) {
      return;
    }
    // The date belongs to the conversation, not to the thread's own fields.
    const talkedAt = values.at;
    const patch = patchFrom(fields, values);
    delete patch.at;

    if (!(await act("updateThread", { id: d.id, fields: patch }, "Saved."))) {
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
      title: "They are not interested. Does the job require it anyway?",
      body:
        "If it does, this stops being development and becomes an expectation - which has to be " +
        "said once, plainly, including what follows if it is not met. \"You stay where you are\" " +
        "is a legitimate thing for that to be.\n\nIf it does not, the right move is to let it go " +
        "and tell them you have. Quietly keeping the hope alive is the one option that costs you " +
        "the relationship.",
      confirm: "The job requires it"
    });

    const ending = await form({
      title: required ? "State it as an expectation" : "Let it go",
      intro: required
        ? "Write the expectation as you will say it to them. Clarity about whether, encouragement about how."
        : "Write why you let it go. It stays readable, so this cannot become a quiet disappointment nobody named.",
      fields: [
        { name: "why", label: required ? "The expectation, in your words" : "Why you let it go", type: "textarea", required: true },
        {
          name: "said",
          label: "I have told them",
          type: "checkbox",
          hint: "Leave it unchecked if you have not yet. The thread will keep asking until you have."
        }
      ],
      confirm: "Save"
    });
    if (!ending) {
      refresh();
      return;
    }
    if (
      await act(
        "endThread",
        { id: d.id, status: required ? "expectation" : "dropped", why: ending.why, said: ending.said },
        "Recorded."
      )
    ) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  threadTalked: async (d) => {
    const values = await form({
      title: "It came up",
      intro:
        "This moves the conversation clock and nothing else. Whether they have actually done the " +
        "thing is a separate answer, because the gap between the two counts is the only useful " +
        "reading here.",
      fields: [
        { name: "note", label: "One line, optional", placeholder: "Where it stands" },
        { name: "at", label: "When", type: "date", value: asDateInput(Date.now()) }
      ],
      confirm: "Log it"
    });
    if (!values) {
      return;
    }
    if (await act("logGrowthNote", { growth: d.id, ...values, observed: false }, "Logged.")) {
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
      title: "I saw it",
      intro:
        "The marker, actually observed rather than discussed. The only evidence in here that any " +
        "of this is working.",
      fields: [
        { name: "note", label: "What you saw", type: "textarea", placeholder: "Chaired the review on the 14th, I said nothing" },
        { name: "at", label: "When", type: "date", value: asDateInput(Date.now()) },
        {
          name: "tell",
          label: "Who else needs to hear this?",
          type: "select",
          options: [{ value: "", label: "Nobody, it stays between us" }, ...others],
          hint:
            "Growth only you two saw converts into nothing. Picking somebody logs it as a promise, " +
            "so it cannot quietly not happen."
        }
      ],
      confirm: "Record it"
    });
    if (!values) {
      return;
    }
    if (!(await act("logGrowthNote", { growth: d.id, ...values, observed: true }, "Recorded."))) {
      return;
    }

    const tell = String(values.tell ?? "");
    if (tell !== "") {
      const said = String(values.note ?? "").trim() || String(current?.marker ?? "");
      const name = others.find((o) => o.value === tell)?.label ?? "them";
      // A promise rather than a note to self, deliberately: promises here escalate
      // past a week and no focus can dampen them, which is exactly the weight this
      // deserves. If it turns out not to be worth saying, closing it costs a click.
      await act("logPromise", { person: tell, text: `Tell ${name}: ${said}` }, `Promise to tell ${name} logged.`);
    }
    refresh();
  },

  /** @param {Record<string, string>} d */
  threadEnd: async (d) => {
    const values = await form({
      title: "End it",
      intro:
        "Every ending here is a legitimate one, including letting it go. Somebody who is content " +
        "where they are and doing solid work is not a problem to be fixed.",
      fields: [
        { name: "status", label: "How it ends", type: "select", options: ENDINGS, value: "reached" },
        {
          name: "why",
          label: "Why",
          type: "textarea",
          required: true,
          hint:
            "Kept and readable afterwards. A thread that ends with no reason turns into a mood in " +
            "the room six months later that neither of you can name."
        },
        {
          name: "said",
          label: "I have told them",
          type: "checkbox",
          hint:
            "Unchecked until you actually have. Letting a direction go silently is worse than " +
            "either pushing or accepting: they still feel the disappointment and never hear that " +
            "it is over."
        }
      ],
      confirm: "End it"
    });
    if (!values) {
      return;
    }
    if (await act("endThread", { id: d.id, ...values }, "Recorded.")) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  threadSaid: async (d) => {
    if (await act("updateThread", { id: d.id, fields: { endingSaid: true } }, "Noted.")) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  threadRemove: async (d) => {
    const sure = await ask({
      title: "Remove this thread?",
      body: `"${d.aim}" stops being shown, along with every conversation logged against it. The events stay in the log - nothing here is really deleted - but the decision and its reason stop being readable, which is usually the thing worth keeping.`,
      confirm: "Remove",
      tone: "danger"
    });
    if (sure && (await act("removeRow", { collection: "growth", id: d.id }, "Removed."))) {
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
