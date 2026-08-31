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

import { attention, focus, noteReviewRun, people, promises } from "./api.js";
import { coverage, entriesSince, JOURNAL_FIELDS, REVIEW_WINDOW_DAYS } from "../domain/journal.js";
import { declared, ledger, ledgerLines, readiness } from "../domain/review.js";
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
  "for the work. Keep any Swedish text exactly as written, including \u00e5, \u00e4 " +
  "and \u00f6 - a stripped quote looks like somebody's words while not being them. " +
  // Added after a model answer came back full of them. The rule is the app's own
  // and was stated everywhere except in the one place that writes prose without
  // a human in the loop.
  "Use a plain hyphen rather than an em dash.";

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

/* --------------------------------------------------------------- journal -- */

const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    wentInto: {
      type: "array",
      description:
        "Two to four things the days actually went into, most of the time first. " +
        "Only what the entries say; never inferred from the counts.",
      items: {
        type: "object",
        properties: {
          what: { type: "string", description: "What it was, in a few words." },
          evenings: {
            type: "integer",
            description: "How many separate entries mention it. Must be at least two."
          },
          evidence: {
            type: "string",
            description: "A short phrase from one of the entries, in the words it was written in."
          }
        },
        required: ["what", "evenings", "evidence"]
      }
    },
    avoidance: {
      type: "array",
      description:
        "What was avoided more than once. Empty when nothing recurs - one avoided thing is a " +
        "Tuesday, not a pattern.",
      items: {
        type: "object",
        properties: {
          what: { type: "string", description: "What was avoided, in a few words." },
          evenings: { type: "integer", description: "How many separate entries mention it." },
          evidence: { type: "string", description: "A short phrase from one of the entries." }
        },
        required: ["what", "evenings", "evidence"]
      }
    },
    saidVsDid: {
      type: "string",
      description:
        "Two or three sentences setting the declared focus against what the entries describe. " +
        "An empty string when no focus was in force, or when the entries say nothing about it."
    },
    questions: {
      type: "array",
      description: "One to three questions to put to yourself. Questions, never verdicts.",
      items: { type: "string" }
    },
    nothingToSay: {
      type: "string",
      description:
        "When the entries do not support any pattern, say why in one sentence and leave the " +
        "other fields empty. Otherwise an empty string."
    }
  },
  required: ["wentInto", "avoidance", "saidVsDid", "questions", "nothingToSay"]
};

/**
 * Read a month of evenings and say what recurs.
 *
 * The entries were always the means and this is the product. What it looks for is
 * the pair of things that are invisible on the day and obvious across a month:
 * where the days actually went, and what kept being avoided - the second being
 * the field the form exists for, and the one no amount of arithmetic can find.
 *
 * Three things make it safe to read.
 *
 * It refuses below a floor rather than hedging. A pattern named from two evenings
 * is one evening restated with confidence, and it gets read next month as a fact
 * about how the work went.
 *
 * The counts travel with it. What the store recorded over the same window goes
 * into the prompt beside the prose, because an evening's writing is a memory of a
 * day and a memory of a month of days is worse. "It all went into meetings" reads
 * differently next to four recorded conversations, and only one of those two
 * numbers is checkable.
 *
 * It asks rather than concludes. The same rule as the growth threads: the app is
 * a mirror, and a verdict about how somebody spent their month is the one output
 * that cannot be argued with and therefore cannot be used.
 *
 * Writes nothing. What comes back is shown, and kept only if he keeps it - see
 * `keepReview` in the API layer.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {number} args.now
 * @param {number} [args.days]
 * @param {typeof ask} [args.askImpl] Test seam.
 * @returns {Promise<{ error: string } | {
 *   at: number, days: number, coverage: any, ledger: any, declared: any,
 *   wentInto: any[], avoidance: any[], saidVsDid: string, questions: string[],
 *   nothingToSay: string, model: string, costUsd: number | null
 * }>}
 */
export async function reviewJournal(store, { now, days = REVIEW_WINDOW_DAYS, askImpl = ask }) {
  const window = entriesSince(store.rows("entries"), now, days);
  const cover = coverage(window, days);

  const enough = readiness(cover);
  if (!enough.ready) {
    return { error: enough.why };
  }

  const status = modelStatus();
  if (!status.available) {
    return { error: String(status.why) };
  }

  const counts = ledger(
    {
      touches: store.rows("touches"),
      promises: store.rows("promises"),
      decisions: store.rows("decisions"),
      growthNotes: store.rows("growthNotes"),
      skips: store.rows("skips"),
      chases: store.rows("chases"),
      entries: store.rows("entries")
    },
    now,
    days
  );

  // The focus is the only place in the app where an intention about where
  // attention WOULD go is written down, which makes it the only thing "where it
  // actually went" can be set against. Its cost is measured elsewhere and is
  // read here rather than recomputed.
  const intent = declared(store.focus(), now, days, focusSummary(store, now));

  const answer = await askImpl({
    prompt: [
      `Here are ${cover.entries} end-of-day entries from the last ${days} days, newest first.`,
      "Every box in the form is optional, so a short entry is a normal entry rather than a bad one.",
      "",
      ...window.filter(hasEntryContent).map((entry) => entryLines(entry)),
      "",
      "What the app recorded over the same window, which is checkable where the entries are not:",
      ...ledgerLines(counts).map((line) => `- ${line}`),
      "",
      intent === null
        ? "No focus was in force over this window, so there is no declared intention to compare against. Leave saidVsDid empty."
        : `The declared focus over this window was "${intent.name}", in force for ${intent.overlapDays} of the ${days} days` +
          (intent.budgetOfWeek === null
            ? ". "
            : `, budgeted at ${Math.round(intent.budgetOfWeek * 100)}% of the week. `) +
          `Its measured cost: ${intent.cost}`,
      "",
      "Name what recurs. Two or more separate evenings, or leave it out."
    ]
      .filter((line) => line !== "")
      .join("\n"),
    // The writing tier. This runs a handful of times a month over material
    // nothing else in the app can read, and the cheap tier's failure mode here is
    // the expensive one: a fluent paragraph that reads the entries back instead
    // of finding what crosses them.
    model: TIERS.write,
    schema: REVIEW_SCHEMA,
    system:
      "You read somebody's end-of-day entries across several weeks and name what recurs across " +
      "them. You are looking for two things they cannot see for themselves: where the days " +
      "actually went, and what kept being avoided. " +
      "A pattern needs two or more separate evenings. Report nothing rather than stretching one " +
      "evening into a pattern, and use nothingToSay when the entries support nothing. " +
      "Quote their own words as evidence rather than paraphrasing them. " +
      "Never pass judgement on them and never conclude anything about what sort of person they " +
      "are; end with questions they could put to themselves. " +
      "The counts you are given are the record. Where the entries and the counts disagree, say so " +
      "plainly rather than picking one. " +
      HOUSE_RULES
  });

  if (!answer.ok) {
    return { error: answer.reason };
  }

  /*
   * The material has now been read, whether or not he keeps what came back.
   *
   * Recorded here rather than left to the caller, because the nudge that suggests
   * reading depends on it: a reading that ran, was read and was discarded has to
   * silence the nudge, or it comes back tomorrow to suggest reading what was just
   * read - and a nudge that does that gets ignored, along with the rest of them.
   *
   * Not a breach of what this file may write. The row is a timestamp and how much
   * was read; nothing the model said goes into it, and the reading itself is still
   * returned and kept only if he keeps it.
   */
  noteReviewRun(store, { at: now, days, entries: cover.entries, spread: cover.spread });

  const value = answer.value ?? {};
  return {
    at: now,
    days,
    coverage: cover,
    ledger: counts,
    declared: intent,
    // Two or more evenings, enforced here as well as asked for. The same rule as
    // themes: a floor stated in a prompt is a request, and a floor applied to the
    // result is a rule.
    wentInto: recurring(value.wentInto),
    avoidance: recurring(value.avoidance),
    saidVsDid: String(value.saidVsDid ?? "").trim(),
    questions: (Array.isArray(value.questions) ? value.questions : [])
      .map((/** @type {any} */ q) => String(q ?? "").trim())
      .filter((/** @type {string} */ q) => q !== ""),
    nothingToSay: String(value.nothingToSay ?? "").trim(),
    model: answer.model,
    costUsd: answer.costUsd
  };
}

/**
 * What the focus in force has cost, in words, or nothing when it cannot be said.
 *
 * Read from the same place the Focus view reads it, so the review and the view
 * cannot disagree about the price of the same decision.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {number} now
 * @returns {string | undefined}
 */
function focusSummary(store, now) {
  const live = focus(store, now);
  return live.active && typeof live.cost === "string" ? live.cost : undefined;
}

/**
 * Keep only the items that actually crossed more than one evening.
 *
 * @param {any} list
 * @returns {{ what: string, evenings: number, evidence: string }[]}
 */
function recurring(list) {
  return (Array.isArray(list) ? list : [])
    .filter(
      (/** @type {any} */ item) =>
        String(item?.what ?? "").trim() !== "" && Number(item?.evenings ?? 0) >= 2
    )
    .map((/** @type {any} */ item) => ({
      what: String(item.what).trim(),
      evenings: Number(item.evenings),
      evidence: String(item.evidence ?? "").trim()
    }));
}

/** @param {Record<string, any>} entry */
function hasEntryContent(entry) {
  return JOURNAL_FIELDS.some((f) => String(entry[f.name] ?? "").trim() !== "");
}

/**
 * One entry, as the labelled boxes it was written in.
 *
 * The labels travel with it rather than being flattened into prose, because the
 * fields are not interchangeable: "what took the day" and "what I avoided" are
 * different claims, and the entire value of the avoidance field is lost if a
 * reader cannot tell which box a sentence came out of.
 *
 * @param {Record<string, any>} entry
 * @returns {string}
 */
function entryLines(entry) {
  const day = new Date(Number(entry.at ?? 0)).toISOString().slice(0, 10);
  const boxes = JOURNAL_FIELDS.filter((f) => String(entry[f.name] ?? "").trim() !== "").map(
    (f) => `  ${f.label}: ${String(entry[f.name]).trim()}`
  );
  return [`--- ${day} ---`, ...boxes].join("\n");
}

/* ------------------------------------------------------------ own part -- */

const OWN_PART_SCHEMA = {
  type: "object",
  properties: {
    lines: {
      type: "array",
      description:
        "Each place the entry describes the other person rather than the writer's own part in " +
        "it. Empty when there is none, which is the common answer and the good one.",
      items: {
        type: "object",
        properties: {
          quote: {
            type: "string",
            description: "The phrase as it was written, not a paraphrase of it."
          },
          instead: {
            type: "string",
            description:
              "The same event said as the writer's own part - what they did, chose, felt or " +
              "avoided. A suggestion they are free to ignore, not a correction."
          }
        },
        required: ["quote", "instead"]
      }
    },
    ok: {
      type: "string",
      description:
        "One sentence when the entry already keeps to the writer's own part, naming what it does " +
        "well. An empty string when it does not."
    }
  },
  required: ["lines", "ok"]
};

/**
 * Read a private entry back, against the one rule that makes writing it safe.
 *
 * ## The rule
 *
 * An entry records the interaction and the writer's own part in it, never the
 * other person's state. "That went badly and I got impatient", not "she was
 * impossible."
 *
 * Three reasons, and the third is the one that matters. It is the half he can
 * change. It keeps the first-person constraint the signals already depend on,
 * where every signal has a subject who can act. And it is the only version of an
 * entry he could show the person it is about - which is the test a private
 * journal about people you live with has to pass, because one day somebody will
 * read it.
 *
 * ## Why a model and not a rule in code
 *
 * "She was impossible" and "I could not reach her" are the same sentence at the
 * level of grammar and opposite at the level of what they claim. No pattern over
 * pronouns separates them, and one that tried would flag every mention of another
 * person - which in a journal about a family is every sentence.
 *
 * ## What it may not do
 *
 * Rewrite the entry. It returns what it noticed and a suggestion beside it,
 * shown once and thrown away; the entry on disk is untouched whatever it says.
 * An automatic rewrite would replace his words with a model's in the one place
 * where the words being his is the entire value - and it would do it to the
 * record of a relationship.
 *
 * The cheap tier, deliberately. This is a check against one stated rule over a
 * few sentences, which is the shape that tier is for, and a check that costs
 * real money per evening is a check that gets turned off.
 *
 * @param {object} args
 * @param {string} args.text The entry, as written.
 * @param {typeof ask} [args.askImpl] Test seam.
 * @returns {Promise<{ error: string } | {
 *   lines: { quote: string, instead: string }[], ok: string,
 *   model: string, costUsd: number | null
 * }>}
 */
export async function checkOwnPart({ text, askImpl = ask }) {
  const written = String(text ?? "").trim();
  if (written === "") {
    return { error: "There is nothing written to read back." };
  }

  const status = modelStatus();
  if (!status.available) {
    return { error: String(status.why) };
  }

  const answer = await askImpl({
    prompt: [
      "Here is one end-of-day entry about time with somebody outside work.",
      "",
      written.slice(0, MAX_NOTE_CHARS),
      "",
      "Where does it describe them rather than the writer's own part in it?"
    ].join("\n"),
    model: TIERS.extract,
    schema: OWN_PART_SCHEMA,
    system:
      "You check one journal entry against a single rule the writer set for themselves: an entry " +
      "records the interaction and their own part in it, never the other person's state or " +
      "character. \"That went badly and I got impatient\" keeps the rule; \"she was impossible\" " +
      "breaks it. " +
      "Describing what somebody DID or SAID is fine and is often the whole point - what breaks " +
      "the rule is a claim about what they are, what they felt, or why they did it. " +
      "Report nothing rather than stretching for something; an entry that already keeps the rule " +
      "is the common case. " +
      "You are not editing anything. Every suggestion is one they may ignore, so phrase it as an " +
      "alternative rather than as a correction, and never moralise about the relationship. " +
      HOUSE_RULES
  });

  if (!answer.ok) {
    return { error: answer.reason };
  }

  const value = answer.value ?? {};
  return {
    lines: (Array.isArray(value.lines) ? value.lines : [])
      .filter((/** @type {any} */ l) => String(l?.quote ?? "").trim() !== "")
      .map((/** @type {any} */ l) => ({
        quote: String(l.quote).trim(),
        instead: String(l.instead ?? "").trim()
      })),
    ok: String(value.ok ?? "").trim(),
    model: answer.model,
    costUsd: answer.costUsd
  };
}

/* ------------------------------------------------------------ questions -- */

const ANSWER_SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "string", description: "The answer, in one or two sentences." },
    from: {
      type: "array",
      description: "The specific facts from the material that the answer rests on.",
      items: { type: "string" }
    }
  },
  required: ["answer", "from"]
};

/**
 * The palette's last resort.
 *
 * Every question the palette can answer from the data it answers itself, with
 * no call and no wait. This is only what fell through that list, and it is
 * offered rather than triggered - the palette shows a row that says it will
 * cost a few seconds, and nothing happens until it is chosen.
 *
 * The material is the same summary the Now view is built from, so the answer
 * can only ever be a rephrasing of what the app already knows. That is the
 * point: a question answered from somewhere else would be a second, unverified
 * source of truth about colleagues.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} args.question
 * @param {number} args.now
 * @param {typeof ask} [args.askImpl] Test seam.
 * @returns {Promise<{ error: string } | {
 *   answer: string, from: string[], model: string, costUsd: number | null
 * }>}
 */
export async function answerQuestion(store, { question, now, askImpl = ask }) {
  if (String(question ?? "").trim() === "") {
    return { error: "There was no question." };
  }

  const status = modelStatus();
  if (!status.available) {
    return { error: String(status.why) };
  }

  const material = {
    attention: attention(store, now),
    people: people(store, now),
    openPromises: promises(store, now),
    focus: focus(store, now)
  };

  const answer = await askImpl({
    prompt: [
      "Here is everything the tool currently knows.",
      "",
      JSON.stringify(material, null, 2),
      "",
      `Question: ${question}`
    ].join("\n"),
    model: TIERS.extract,
    schema: ANSWER_SCHEMA,
    system:
      "You answer a question about somebody's own leadership work using only the " +
      "material given. If the material does not contain the answer, say so plainly " +
      "rather than reasoning towards a likely one - a confident guess about a " +
      "colleague is worse than no answer. " +
      HOUSE_RULES
  });

  if (!answer.ok) {
    return { error: answer.reason };
  }

  return {
    answer: String(answer.value?.answer ?? "").trim(),
    from: (Array.isArray(answer.value?.from) ? answer.value.from : []).map((/** @type {any} */ f) => String(f)),
    model: answer.model,
    costUsd: answer.costUsd
  };
}
