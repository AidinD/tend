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

  const buttons = live
    ? `
      <button class="act" data-act="threadTalked" data-id="${esc(t.id)}">It came up</button>
      ${t.marker ? `<button class="act" data-act="threadObserved" data-id="${esc(t.id)}">I saw it</button>` : ""}
      <button class="act" data-act="threadPrepare" data-id="${esc(t.id)}">Prepare</button>
      <button class="act" data-act="threadAsked" data-id="${esc(t.id)}">After the conversation</button>
      <button class="act" data-act="threadEnd" data-id="${esc(t.id)}">End it</button>`
    : t.fields.endingSaid
      ? `<button class="act tiny danger" data-act="threadRemove" data-id="${esc(t.id)}" data-aim="${esc(t.aim)}">Remove</button>`
      : `<button class="act" data-act="threadSaid" data-id="${esc(t.id)}">I have told them</button>`;

  return `<div class="thread">
    <div class="thread-top">
      <span class="thread-aim">${esc(t.aim)}</span>
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
              <button class="act" data-act="threadTalked" data-id="${esc(t.id)}">It came up</button>
            </div>
            ${t.marker ? `<span class="src">You will see: ${esc(t.marker)}</span>` : ""}
            <span class="src">Discussed ${t.talks}×, seen ${t.observations}× &middot; last talked ${esc(t.lastTalked)}.</span>
            ${t.asks ? `<span class="src">${esc(t.asks)}</span>` : ""}
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
        "their own answer comes later and is kept beside this."
    });
  } else {
    fields.push(
      {
        name: "aim",
        label: "The direction as it stands",
        required: true,
        type: "textarea",
        value: values.aim,
        hint: "Reword it once you have talked to them, so it names what you agreed."
      },
      {
        name: "hypothesis",
        label: "What you thought before you asked",
        type: "textarea",
        value: values.hypothesis,
        hint: "Kept on purpose. Next to what they actually said, it shows you an assumption."
      }
    );
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
    {
      name: "alreadySeen",
      label: "What have you already seen that supports it?",
      type: "textarea",
      value: values.alreadySeen,
      hint: "Empty is itself the finding: you would be proposing a direction on no evidence."
    },
    {
      name: "offering",
      label: "What are you putting in?",
      type: "textarea",
      value: values.offering,
      placeholder: "The architecture review, and I stop writing the migration plan myself",
      hint:
        "Cover, a room to be let into, work you stop doing yourself. Development stalls on the " +
        "manager more often than on the person."
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

export const actions = {
  /** @param {Record<string, string>} d */
  openThread: async (d) => {
    const values = await form({
      title: "Open a direction",
      intro:
        "Your own preparation, in four questions. What THEY want comes in a second form after you " +
        "have asked them - a plan filled in alone at your desk is a plan you wrote for them.",
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

  /** @param {Record<string, string>} d */
  threadPrepare: async (d) => {
    const current = await currentThread(d.id);
    if (!current) {
      return;
    }
    const values = await form({
      title: "Prepare",
      intro: "Your side of it. Reopened where you left it rather than asking again.",
      fields: prepareFields(current.fields),
      confirm: "Save"
    });
    if (!values) {
      return;
    }
    if (await act("updateThread", { id: d.id, fields: values }, "Saved.")) {
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
    const values = await form({
      title: "After the conversation",
      intro: "What came back. This overwrites nothing you guessed - the guess is kept beside it.",
      fields: askedFields(current.fields),
      confirm: "Save"
    });
    if (!values) {
      return;
    }
    if (!(await act("updateThread", { id: d.id, fields: values }, "Saved."))) {
      return;
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

  /** @param {Record<string, string>} d */
  threadObserved: async (d) => {
    const values = await form({
      title: "I saw it",
      intro:
        "The marker, actually observed rather than discussed. This is the only evidence in the " +
        "tool that any of this is working.",
      fields: [
        { name: "note", label: "What you saw", type: "textarea", placeholder: "Chaired the review on the 14th, I said nothing" },
        { name: "at", label: "When", type: "date", value: asDateInput(Date.now()) }
      ],
      confirm: "Record it"
    });
    if (!values) {
      return;
    }
    if (await act("logGrowthNote", { growth: d.id, ...values, observed: true }, "Recorded.")) {
      refresh();
    }
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
