/**
 * The model layer: the three jobs a model is actually better at than code.
 *
 * ## What is deliberately not here
 *
 * Not the radar. Drift, cadences, promises, the focus budget and every number
 * on the Now view are ordinary deterministic code and stay that way. A radar
 * that is *usually* right is worse than no radar, because it gets trusted. The
 * model reads prose and writes drafts; it never decides what needs attention.
 *
 * So the app is fully usable with this file unreachable. Claude Code not
 * installed, no network, signed out - every view still works, and the only
 * difference is that three buttons say why they are off.
 *
 * ## When it runs
 *
 * Never on app open. Every call here is either a button somebody pressed or a
 * scheduled job, and `test/model.test.mjs` reads `src/main/index.js` and fails
 * if a model call ever appears on the startup path. That rule is easy to state
 * and easy to break by accident - somebody warms a cache and suddenly opening
 * the window costs money and four seconds.
 *
 * ## Tiers
 *
 * Extraction and tagging are cheap, mechanical and high-volume; a brief is
 * writing. Naming the tiers by *job* rather than by model means the mapping is
 * one object to edit when a better model ships.
 *
 * ## What it may write
 *
 * Themes, and nothing else. Briefs are returned and thrown away on purpose -
 * a stored brief is a second copy of facts Tend already holds, going stale from
 * the moment it is written, which is exactly the trap `prep.js` avoids by
 * showing a note's title and not its prose. Extracted promises come back as
 * candidates for a person to keep or discard, so the model never puts a row in
 * the promise list on its own; when one is kept, the promise records that it
 * came from a model and which one.
 *
 * Structure - the role map, cadences, relationships, focus - is never written
 * here at any strength of confidence. That boundary is the whole reason the
 * app can be trusted to be a mirror rather than an opinion.
 */

import { ask, resolveClaudeBinary } from "keel/claude";

import { prep } from "./prep.js";
import { noteBody, notesIn, readNibIndex } from "./nib.js";
import { resolvePerson } from "./resolve.js";

/**
 * Which model does which job.
 *
 * Keel knows no model names on purpose - a model id is the fact in this area
 * that goes stale fastest, so it lives in one object in the app that cares.
 */
export const TIERS = {
  /** Extraction and tagging. Mechanical, high-volume, cheap. */
  extract: "claude-haiku-4-5-20251001",
  /** Briefs and anything else that is writing rather than parsing. */
  write: "claude-sonnet-5"
};

/**
 * How much of a note is sent.
 *
 * A cap rather than a summariser: a 1-1 note that runs past this is unusual,
 * and truncating loudly is better than quietly paying for a long tail. The
 * caller is told when it happened.
 */
const MAX_NOTE_CHARS = 12_000;

/** How many notes back a theme pass looks. */
const THEME_NOTES = 8;

/**
 * Text Tend generates gets pasted into real places, so the wording rules that
 * apply to the app apply to the model too - stated here rather than hoped for.
 */
const HOUSE_RULES =
  "Write in English. Be concrete and short; every line has to earn its place. " +
  "Never invent a fact that is not in the material you were given - if something " +
  "is not there, leave it out rather than guessing. Never write out a management " +
  "job title; describe the relationship as leading, coaching or being responsible " +
  "for the work. Keep any Swedish text exactly as written, including a, a and o " +
  "with their diacritics.";

/**
 * Whether a model call can be made at all, and why not when it cannot.
 *
 * Read by Settings and by every view with a model button, so a disabled button
 * can say what would fix it. A feature that is silently absent reads as broken.
 *
 * @returns {{ available: boolean, why: string | null, binary: string }}
 */
export function modelStatus() {
  const binary = resolveClaudeBinary();
  return {
    available: binary.reason === null,
    why: binary.reason,
    binary: binary.path
  };
}

/* ---------------------------------------------------------------- brief -- */

const BRIEF_SCHEMA = {
  type: "object",
  properties: {
    opening: { type: "string", description: "One sentence: what this conversation is for." },
    raise: {
      type: "array",
      description: "Two to four things to actually say, most important first.",
      items: {
        type: "object",
        properties: {
          point: { type: "string", description: "What to raise, in one line." },
          because: { type: "string", description: "The fact from the material that makes it worth raising." }
        },
        required: ["point", "because"]
      }
    },
    ask: {
      type: "array",
      description: "One to three questions worth asking them, phrased as you would say them.",
      items: { type: "string" }
    },
    watch: {
      type: "string",
      description: "One thing to be careful of in this conversation, or an empty string if nothing stands out."
    }
  },
  required: ["opening", "raise", "ask", "watch"]
};

/**
 * A draft of what to say before a conversation.
 *
 * Built from the prep card, which is already the join across Tend, Jot and Nib
 * - so this adds no new source, it just turns the four lists into something you
 * can read on the way to a room. Nothing is stored: the facts underneath change
 * daily and a saved brief would quietly stop matching them.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} args.person
 * @param {number} args.now
 * @param {string} [args.about] Something specific to steer it, if you have one.
 * @param {typeof ask} [args.askImpl] Test seam.
 * @returns {Promise<{ error: string } | {
 *   person: string, brief: any, model: string, costUsd: number | null, generatedAt: number
 * }>}
 */
export async function draftBrief(store, { person, now, about, askImpl = ask }) {
  const found = resolvePerson(store, person);
  if (!found.ok) {
    return { error: found.error };
  }

  const cards = prep(store, now).cards;
  const card = cards.find((/** @type {any} */ c) => c.person === found.person.name);
  if (!card) {
    return {
      error:
        `${found.person.name} is not behind on anything and owes you nothing, so there is ` +
        "nothing here to brief you on. That is a good state, not a missing feature."
    };
  }

  const status = modelStatus();
  if (!status.available) {
    return { error: String(status.why) };
  }

  const answer = await askImpl({
    prompt: [
      "Here is everything known about one person before a conversation with them.",
      "",
      JSON.stringify(card, null, 2),
      "",
      about ? `The conversation is specifically about: ${about}` : "",
      "",
      "Draft what to say. Work only from the material above."
    ]
      .filter((line) => line !== "")
      .join("\n"),
    // The writing tier, measured rather than assumed. On the same fixture the
    // cheap tier produced a usable brief for 7 cents and this one produced a
    // sharper one for 29 - four points instead of three, and each traced back
    // to the fact that justified it. A brief is read before a real conversation
    // and happens a handful of times a week, so it is the one call in this file
    // where the better answer is worth the difference.
    model: TIERS.write,
    schema: BRIEF_SCHEMA,
    system:
      "You prepare somebody for a one-to-one conversation with a colleague they are " +
      "responsible for. You are given a structured summary: how long since they last " +
      "spoke, what was promised, what that person owns and how it is delegated, what " +
      "is open on the board, and when something was last written about them. " +
      "Your draft is read once, on the way to the room. " +
      HOUSE_RULES
  });

  if (!answer.ok) {
    return { error: answer.reason };
  }

  return {
    person: found.person.name,
    brief: answer.value,
    model: answer.model,
    costUsd: answer.costUsd,
    generatedAt: now
  };
}

/* ------------------------------------------------------------ promises -- */

const PROMISES_SCHEMA = {
  type: "object",
  properties: {
    promises: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string", description: "The commitment, in the words it was made in where possible." },
          confidence: {
            type: "string",
            enum: ["clear", "possible"],
            description: "clear when it is stated outright, possible when it is implied."
          }
        },
        required: ["text", "confidence"]
      }
    }
  },
  required: ["promises"]
};

/**
 * Commitments *you* made, read out of a note you wrote.
 *
 * Returns candidates and writes nothing. Nib already models a flagged block as
 * an action point with a done state, and `indexNib` turns those into promises
 * with no model involved at all - so this is for the ones written as ordinary
 * prose and never flagged, which is the half that actually goes missing.
 *
 * The split matters: the reliable path stays deterministic, and the model is
 * only ever the second pass over what that path could not see.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} args.noteId A Nib note id.
 * @param {string} [args.nibDir]
 * @param {typeof ask} [args.askImpl] Test seam.
 * @returns {Promise<{ error: string } | {
 *   noteId: string, candidates: { text: string, confidence: string }[],
 *   truncated: boolean, model: string, costUsd: number | null
 * }>}
 */
export async function extractPromises(store, { noteId, nibDir, askImpl = ask }) {
  const body = noteBody(noteId, nibDir);
  if (!body.available) {
    return { error: body.why };
  }
  if (body.text.trim() === "") {
    return { error: "That note is empty, so there is nothing to read." };
  }

  const status = modelStatus();
  if (!status.available) {
    return { error: String(status.why) };
  }

  const truncated = body.text.length > MAX_NOTE_CHARS;
  const text = truncated ? body.text.slice(0, MAX_NOTE_CHARS) : body.text;

  const answer = await askImpl({
    prompt: [
      "Here is a note written after a conversation.",
      "",
      text,
      "",
      "List only what the note's author said they would do. Nothing else."
    ].join("\n"),
    model: TIERS.extract,
    effort: "low",
    schema: PROMISES_SCHEMA,
    system:
      "You extract commitments from a note somebody wrote after a conversation. " +
      "Only what the AUTHOR committed to - not what the other person promised, not " +
      "decisions, not observations, not things that merely need doing by somebody. " +
      "An empty list is the right answer more often than not, and is far better " +
      "than a plausible one. " +
      HOUSE_RULES
  });

  if (!answer.ok) {
    return { error: answer.reason };
  }

  const promises = Array.isArray(answer.value?.promises) ? answer.value.promises : [];
  return {
    noteId,
    candidates: promises
      .filter((/** @type {any} */ p) => String(p?.text ?? "").trim() !== "")
      .map((/** @type {any} */ p) => ({
        text: String(p.text).trim(),
        confidence: p.confidence === "clear" ? "clear" : "possible"
      })),
    truncated,
    model: answer.model,
    costUsd: answer.costUsd
  };
}

/* -------------------------------------------------------------- themes -- */

const THEMES_SCHEMA = {
  type: "object",
  properties: {
    themes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Two to four words. What keeps coming up." },
          evidence: { type: "string", description: "Which notes it showed up in and how." },
          times: { type: "integer", description: "How many separate notes it appears in." }
        },
        required: ["name", "evidence", "times"]
      }
    }
  },
  required: ["themes"]
};

/**
 * What keeps coming up about one person, across several notes.
 *
 * The one job here a person genuinely cannot do from the data themselves: a
 * pattern across eight notes written weeks apart is invisible when you read
 * them one at a time, which is exactly when you read them.
 *
 * Two or more notes only. A "theme" observed once is not a theme, it is a
 * sentence, and calling it a pattern is how a tool starts telling you things
 * about people that are not true.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} args.person
 * @param {number} args.now
 * @param {boolean} [args.apply] Write the themes. The scheduled path does; a button does not.
 * @param {string} [args.nibDir]
 * @param {typeof ask} [args.askImpl] Test seam.
 * @returns {Promise<{ error: string } | {
 *   person: string, themes: any[], notesRead: number, written: number,
 *   model: string, costUsd: number | null
 * }>}
 */
export async function detectThemes(store, { person, now, apply = false, nibDir, askImpl = ask }) {
  const found = resolvePerson(store, person);
  if (!found.ok) {
    return { error: found.error };
  }

  const index = readNibIndex(nibDir);
  if (!index.available) {
    return { error: index.why };
  }

  const bindings = store.rows("sources").filter((b) => String(b.person ?? "") === found.person.id);
  if (bindings.length === 0) {
    return {
      error:
        `No Nib folder is bound to ${found.person.name}, so there are no notes to read. ` +
        "Bind one in Settings."
    };
  }

  /** @type {{ title: string, edited: number, text: string }[]} */
  const notes = [];
  for (const binding of bindings) {
    for (const note of notesIn(index.categories, String(binding.categoryId), binding.subId ?? null)) {
      const body = noteBody(note.id, nibDir);
      if (body.available && body.text.trim() !== "") {
        notes.push({ title: note.title, edited: note.edited, text: body.text });
      }
    }
  }

  notes.sort((a, b) => b.edited - a.edited);
  const recent = notes.slice(0, THEME_NOTES);

  if (recent.length < 2) {
    return {
      error:
        `There ${recent.length === 1 ? "is one note" : "are no notes"} about ${found.person.name}. ` +
        "A pattern needs at least two, and one note called a pattern is how a tool starts " +
        "saying untrue things about people."
    };
  }

  const status = modelStatus();
  if (!status.available) {
    return { error: String(status.why) };
  }

  const answer = await askImpl({
    prompt: [
      `Here are ${recent.length} notes about the same person, most recent first.`,
      "",
      ...recent.map(
        (note, i) =>
          `--- note ${i + 1}: ${note.title} (${new Date(note.edited).toISOString().slice(0, 10)}) ---\n` +
          note.text.slice(0, MAX_NOTE_CHARS)
      ),
      "",
      "What keeps coming up across them?"
    ].join("\n"),
    model: TIERS.extract,
    schema: THEMES_SCHEMA,
    system:
      "You look across several notes about one person and name what recurs. " +
      "A theme must appear in at least two separate notes; report nothing rather " +
      "than stretching one note into a pattern. Describe what was observed, not " +
      "what it says about them as a person - this is read before a conversation " +
      "with them, and a character verdict is both wrong and unusable. " +
      HOUSE_RULES
  });

  if (!answer.ok) {
    return { error: answer.reason };
  }

  const themes = (Array.isArray(answer.value?.themes) ? answer.value.themes : [])
    .filter((/** @type {any} */ t) => Number(t?.times ?? 0) >= 2 && String(t?.name ?? "").trim() !== "")
    .map((/** @type {any} */ t) => ({
      name: String(t.name).trim(),
      evidence: String(t.evidence ?? "").trim(),
      times: Number(t.times)
    }));

  let written = 0;
  if (apply) {
    for (const theme of themes) {
      // Deterministic id, so a scheduled pass that runs weekly updates the same
      // row rather than stacking a new copy of the same theme every Monday.
      const id = `theme:${found.person.id}:${slug(theme.name)}`;
      store.create("themes", {
        id,
        person: found.person.id,
        name: theme.name,
        evidence: theme.evidence,
        times: theme.times,
        source: sourceLabel(answer.model),
        seenAt: now
      });
      store.update("themes", id, { evidence: theme.evidence, times: theme.times, seenAt: now });
      written += 1;
    }
  }

  return {
    person: found.person.name,
    themes,
    notesRead: recent.length,
    written,
    model: answer.model,
    costUsd: answer.costUsd
  };
}

/**
 * How anything a model produced is labelled once it is kept.
 *
 * The store already records *which writer* wrote a row (`_by`), and that is not
 * the same question: a promise the model suggested and a person accepted is
 * written by the app, by hand, and would look identical to one typed from
 * scratch. This field is the origin rather than the writer, and it names the
 * model so that "which one said that" is answerable a month later.
 *
 * @param {string} model
 */
export function sourceLabel(model) {
  return `model:${model}`;
}

/** @param {string} text */
function slug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}
