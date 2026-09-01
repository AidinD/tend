/**
 * Reference material: the one answer in this app that does not come from him.
 *
 * ## The gap this fills
 *
 * The knowledge search answers a situation out of what he has read and written
 * down, and it already reports the part it could not answer - `missing`, printed
 * as prominently as the hits, because "less than you think" is often the useful
 * answer. In the work half that gap closes over time: the notebook has a folder
 * of management reading in it. In the private half there is nothing written down
 * about how a four-year-old handles being interrupted mid-game, and there is not
 * going to be, so the gap is where the view stops being useful.
 *
 * This is the answer to that gap and nothing else. It runs on a subject, it says
 * what general knowledge says about it, and it is rendered as a second block
 * that never merges into the first.
 *
 * ## Why it is the only call allowed to answer out of its own knowledge
 *
 * Every other model call in this app reads his prose and writes a draft from it,
 * and `HOUSE_RULES` says so outright: never invent a fact that is not in the
 * material you were given. That rule exists because everything else those calls
 * touch is a record about a real person, where an invented fact is a
 * plausible-and-wrong claim about somebody he works with or lives with.
 *
 * A general summary of a subject is not a claim about anybody. So the rule that
 * protects the rest does not apply here, and what replaces it is provenance: the
 * block says it is general, says which model wrote it, and says that the people
 * involved outrank it. That marking is the whole safety property, which is why it
 * is structural in the view rather than a sentence the model is asked to include.
 *
 * ## Why nothing is stored
 *
 * A kept review is stored, and the test that decides it is whether the thing
 * underneath can change: a review reads specific days that are over, so it is as
 * true next year, and it cannot be reproduced from anything else. A general
 * summary is the opposite on both counts - it can be regenerated in ten seconds,
 * identically enough, and a copy of one sitting in a store six months later is
 * read as though it had been checked. So storing it would buy nothing but
 * staleness. If a card is worth keeping it belongs in the notebook that already
 * owns notes and already reaches both halves, put there by him.
 *
 * ## What leaves the machine
 *
 * The subject line, and nothing else. Not a note, not a name from the roster,
 * not the store - this function takes no store argument, so the boundary is a
 * property of the signature rather than of everybody remembering. What it cannot
 * protect him from is a name he typed into the sentence himself, which is why the
 * button says what it sends.
 */

import { ask } from "keel/claude";

import { HOUSE_STYLE, TIERS, modelStatus } from "./model.js";

/**
 * How much of a typed situation is sent.
 *
 * Short on purpose. This is a subject, not a document, and a box that quietly
 * accepts three paragraphs is a box that sends three paragraphs about somebody's
 * family to a model in order to be told what is generally true.
 */
const MAX_SUBJECT_CHARS = 600;

/**
 * How much a subject varies between individuals, when the answer is unusable.
 *
 * Wide, always. This value decides whether the card says out loud that the
 * people involved outrank it, and the two ways of being wrong are not
 * symmetrical: an unnecessary caution is read once and ignored, a missing one
 * leaves a general summary standing unqualified next to a real person.
 */
const SPREAD_WHEN_UNSURE = "wide";

const REFERENCE_SCHEMA = {
  type: "object",
  properties: {
    says: {
      type: "string",
      description:
        "What is generally understood about this subject. THREE SENTENCES AT MOST, and no " +
        "paragraph breaks. Say what the thing is and why it happens; do NOT list what helps, " +
        "because that is what `starts` is for and repeating it here is the same answer twice. " +
        "Plain and specific. Not advice about the person asking, and not a preamble about how " +
        "every situation is different."
    },
    starts: {
      type: "array",
      description:
        "Two to four places to start. Each has to be something that can actually be tried or " +
        "looked at, not a restatement of the summary.",
      items: {
        type: "object",
        properties: {
          point: { type: "string", description: "The thing to try or to look at." },
          because: {
            type: "string",
            description: "What it is understood to help with, in one line."
          }
        },
        required: ["point", "because"]
      }
    },
    spread: {
      type: "string",
      enum: ["wide", "narrow"],
      description:
        "How much this subject varies between individuals. \"wide\" when what is generally true " +
        "is a weak guide to any one person - most subjects involving temperament, development or " +
        "a relationship are wide. \"narrow\" only when the general answer holds for nearly " +
        "everybody. Answer \"wide\" if it is not clear."
    },
    needsThePeople: {
      type: "string",
      description:
        "The part of this that general knowledge cannot answer because it depends on the " +
        "particular people involved. One or two sentences. Never empty - there is always some."
    },
    wouldAnswer: {
      type: "string",
      description:
        "What kind of source would answer this properly: a field of reading, a kind of " +
        "professional, or the person themselves. Not a specific book title unless it is genuinely " +
        "the standard one on the subject."
    }
  },
  required: ["says", "starts", "spread", "needsThePeople", "wouldAnswer"]
};

/**
 * What general knowledge says about a subject.
 *
 * Takes no store and reads no notes. See the header for why that is the
 * signature and not a rule.
 *
 * The writing tier rather than the cheap one. This is prose about a subject
 * where being vaguely right reads exactly like being right, and the cheap tier's
 * failure mode on an open question is a confident paragraph of nothing - which
 * is the one output this block cannot afford, because it is the block with no
 * notes underneath it to check against.
 *
 * @param {object} args
 * @param {string} args.subject The situation, as typed.
 * @param {string} [args.half] Which half asked, so the framing matches.
 * @param {typeof ask} [args.askImpl] Test seam.
 * @returns {Promise<{ error: string } | {
 *   subject: string,
 *   says: string,
 *   starts: { point: string, because: string }[],
 *   spread: "wide" | "narrow",
 *   needsThePeople: string,
 *   wouldAnswer: string,
 *   model: string,
 *   costUsd: number | null
 * }>}
 */
export async function referenceOn({ subject, half = "work", askImpl = ask }) {
  const asked = String(subject ?? "").trim();
  if (asked === "") {
    return { error: "Say what the subject is, in a sentence." };
  }

  const status = modelStatus();
  if (!status.available) {
    return { error: String(status.why) };
  }

  const isPrivate = half === "private";

  const answer = await askImpl({
    prompt: [
      "The subject:",
      asked.slice(0, MAX_SUBJECT_CHARS),
      "",
      "What is generally understood about this, and where would somebody start?"
    ].join("\n"),
    model: TIERS.write,
    schema: REFERENCE_SCHEMA,
    system:
      "Somebody has asked what is generally understood about a subject. Their own notes did not " +
      "answer it, so you are answering from general knowledge and they know that - it is labelled " +
      "as such on the screen beside your answer. " +
      // The one place the app's usual rule is inverted, and it has to be said,
      // because the model is otherwise being asked to do the thing every other
      // prompt here forbids.
      "Answer from what is generally known rather than refusing for lack of material: that is " +
      "what this is for. But be exact about the standing of what you say - where something is " +
      "well established say so plainly, and where it is contested or thin, say that instead of " +
      "smoothing it into confident prose. " +
      "You have not been told anything about the people involved and must not guess at them. Do " +
      "not describe, diagnose or characterise anybody, and do not assume ages, roles, diagnoses " +
      "or histories that were not stated. " +
      (isPrivate
        ? "The subject concerns somebody they live with or are close to, so nothing here is " +
          "advice about that person - it is background they will weigh themselves. "
        : "The subject concerns their working life, and they lead a team, so keep it usable " +
          "rather than theoretical. ") +
      // Short is not a preference here, it is the difference between a block that
      // gets read and one that gets scrolled past - and the first real answer
      // came back as four paragraphs that duplicated the starting points below
      // it, at four times the cost of the version that says the same thing.
      "Be SHORT: the summary is three sentences at most and each starting point is one line. " +
      "Saying a thing twice in two fields is not two answers. " +
      // Style only: this pass answers from general knowledge, so the grounding
      // rule would make it refuse its own purpose. See GROUNDED in model.js.
      HOUSE_STYLE
  });

  if (!answer.ok) {
    return { error: answer.reason };
  }

  const value = answer.value ?? {};
  return {
    subject: asked,
    says: String(value.says ?? "").trim(),
    starts: (Array.isArray(value.starts) ? value.starts : [])
      .filter((/** @type {any} */ s) => String(s?.point ?? "").trim() !== "")
      .map((/** @type {any} */ s) => ({
        point: String(s.point).trim(),
        because: String(s.because ?? "").trim()
      })),
    spread: normaliseSpread(value.spread),
    needsThePeople: String(value.needsThePeople ?? "").trim(),
    wouldAnswer: String(value.wouldAnswer ?? "").trim(),
    model: answer.model,
    costUsd: answer.costUsd
  };
}

/**
 * The declared spread, or the cautious one.
 *
 * A schema enum is a request, not a guarantee - the value arrives over a model
 * call and this project has been bitten before by trusting a shape it did not
 * check. Anything that is not exactly "narrow" is treated as wide, so the only
 * way to lose the caution is to have earned it.
 *
 * @param {unknown} value
 * @returns {"wide" | "narrow"}
 */
function normaliseSpread(value) {
  return String(value ?? "").trim().toLowerCase() === "narrow" ? "narrow" : SPREAD_WHEN_UNSURE;
}
