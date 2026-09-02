/**
 * Knowledge: what you have read and what you have lived, searched by SITUATION.
 *
 * The last view from the original design, and the one that was deliberately
 * held back until there was something in the notebook to search. There is now.
 *
 * ## Why a situation and not a title
 *
 * A note titled "1.1 · Kritisera inte - fråga i stället" is findable by anyone
 * who already remembers it exists, which is exactly the case where you do not
 * need help. The question worth answering is the one you have at the time:
 * "somebody on my team has stopped disagreeing with me" - and nothing in that
 * sentence appears in the title of the note that would help.
 *
 * ## Two passes, and the first one is free
 *
 * A local pass narrows on titles, previews and folder trails, which the index
 * already carries. Only what survives it gets opened, and only then is a model
 * asked which of them actually bear on the situation and why. That ordering is
 * the privacy boundary as much as a cost one: "what have I read about this"
 * must not mean "read everything I have ever written about my colleagues".
 *
 * The local pass alone is a usable answer. It is a word match, so it finds the
 * obvious and misses the rest - which is why the model pass exists and why it
 * is a button rather than automatic.
 *
 * ## Books and people are not separated
 *
 * A principle from a book and a note about a conversation are both evidence
 * about the same situation, and which one helps is not knowable in advance. So
 * the search covers everything and the result says where each came from. The
 * folder trail does the sorting the app would otherwise have to guess at.
 *
 * ## What the two halves do to that
 *
 * Notes about PEOPLE belong to a half: a question asked at work must not be
 * answered out of notes about somebody's family, and the reverse is merely
 * wrong. Reference material belongs to neither - it is about him - so the
 * principle-tagged notes are read from every scope and merged in.
 *
 * Scoping the whole search was tried first and was wrong in a way that only
 * showed against the real notebook: every principle note there sits in a
 * privately-marked category, so the work half's search had nothing but colleague
 * notes to answer from. The tag crosses; untagged material stays where it was
 * written.
 */

import { ask } from "keel/claude";

import { HOUSE_RULES, runPass } from "./model.js";
import { allNibNotes, noteBody, referenceNotes } from "./nib.js";

/** The model tier used here, matching the rest of the model layer. */
const TIER = "claude-sonnet-5";

/** How many notes survive the local pass and get opened. */
const READ_AT_MOST = 8;

/** Words too common to narrow anything, in both languages he writes in. */
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "is", "it", "that", "this",
  "my", "me", "i", "has", "have", "not", "but", "as", "at", "by", "from", "was", "are", "be",
  "och", "att", "en", "ett", "som", "det", "den", "de", "är", "på", "för", "med", "av", "till",
  "inte", "har", "jag", "min", "mitt", "om", "vi", "man", "sig", "kan", "ska", "vad", "när", "hur",
  "about", "into", "över", "efter", "sedan", "bara", "hela", "något", "någon", "andra",
  // Question words narrow nothing and are how most situations open.
  "what", "which", "when", "how", "why", "who", "whom", "should", "would", "could",
  "vem", "vilka", "vilken", "vilket", "varför", "borde", "skulle"
]);

/**
 * Shortest prefix two words must share to count as the same word.
 *
 * Not stemming, and not trying to be. Swedish inflects heavily - lyssna,
 * lyssnar, lyssnade; konferens, konferensen - and an exact match misses every
 * one of those, which matters more here than it looks: this pass is the GATE to
 * the reading pass, so a note it fails to surface is a note the model never
 * sees at all. Four characters is short enough to catch the endings and long
 * enough that "leda" and "ledare" meet while "led" and "ledsen" do not.
 */
const STEM = 4;

/**
 * Whether two words are the same word for the purposes of this search.
 *
 * @param {string} a @param {string} b
 */
function alike(a, b) {
  if (a === b) {
    return true;
  }
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= STEM && long.startsWith(short);
}

/**
 * The words in a phrase worth matching on.
 *
 * @param {string} text
 * @returns {string[]}
 */
function words(text) {
  return String(text ?? "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

/**
 * Notes that share wording with the situation, best first.
 *
 * A word match with a shared-prefix rule, which is crude and honest about it:
 * it reaches "lyssna" from "lyssnar" and does not reach "återkoppling" from
 * "feedback". The reading pass covers that gap, and keeping this one dumb is
 * what keeps it instant and free.
 *
 * @param {string} situation
 * @param {string} [dir]
 * @returns {{ error: string } | { dir: string, matches: any[], searched: number }}
 */
export function search(situation, dir, half = "work") {
  const asked = words(situation);
  if (asked.length === 0) {
    return { error: "Say what the situation is, in a sentence." };
  }

  // This half's notes, plus the reference material from either. See the header.
  const all = allNibNotes(dir, half);
  if (!all.available) {
    return { error: all.why };
  }

  const seen = new Set(all.notes.map((note) => String(note.id)));
  const notes = [
    ...all.notes,
    ...referenceNotes(dir).filter((note) => !seen.has(String(note.id)))
  ];

  const matches = notes
    .map((note) => {
      const title = words(note.title);
      const body = words(`${note.preview} ${note.trail}`);
      let score = 0;
      for (const word of asked) {
        // Title counts double: titles here are written as statements, so a hit
        // in one is a hit on what the note is ABOUT, where a hit in the preview
        // may be a passing mention.
        if (title.some((candidate) => alike(candidate, word))) {
          score += 2;
        } else if (body.some((candidate) => alike(candidate, word))) {
          score += 1;
        }
      }
      return { note, score };
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((hit) => ({
      id: hit.note.id,
      title: hit.note.title,
      trail: hit.note.trail,
      preview: hit.note.preview,
      edited: hit.note.edited
    }));

  return { dir: all.dir, matches, searched: notes.length };
}

const ANSWER_SCHEMA = {
  type: "object",
  properties: {
    applies: {
      type: "array",
      description: "The notes that bear on the situation, most useful first. Leave out the rest.",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "The note's id, exactly as given." },
          says: { type: "string", description: "What the note actually says, in one line." },
          because: { type: "string", description: "Why it bears on this situation specifically." }
        },
        required: ["id", "says", "because"]
      }
    },
    missing: {
      type: "string",
      description:
        "What the material does not answer about this situation, or an empty string if it covers it."
    }
  },
  required: ["applies", "missing"]
};

/**
 * Ask which of the candidates actually bear on the situation.
 *
 * Only the notes handed in are read, and only their text - this never goes
 * looking. Nothing is stored: an answer is about a situation that will not
 * recur in the same shape, and a saved one would be a second copy of notes that
 * are still being edited in Nib.
 *
 * @param {object} args
 * @param {string} args.situation
 * @param {any[]} args.candidates From `search`, already narrowed.
 * @param {string} [args.dir]
 * @param {typeof ask} [args.askImpl] Test seam.
 */
export async function consider({ situation, candidates, dir, askImpl = ask }) {
  const shortlist = (Array.isArray(candidates) ? candidates : []).slice(0, READ_AT_MOST);
  if (shortlist.length === 0) {
    return { error: "Nothing to read. Narrow the situation, or write the note first." };
  }

  /** @type {any[]} */
  const read = [];
  for (const candidate of shortlist) {
    const body = noteBody(String(candidate.id), dir);
    if (body.available && body.text.trim() !== "") {
      read.push({ id: candidate.id, title: candidate.title, trail: candidate.trail, text: body.text });
    }
  }

  if (read.length === 0) {
    return { error: "Those notes have titles but no text yet." };
  }

  // Through runPass, which is where this pass gains the availability check it
  // never had. The other eight said "no Claude Code on this machine"; this one
  // went straight to the call and surfaced whatever that failed with. Nothing
  // reached it in practice, because the view hides the button - which is exactly
  // why it went unnoticed, and why the fix belongs in the shape rather than in
  // one more copy of the check.
  return runPass(
    askImpl,
    {
      prompt: [
        `The situation: ${situation}`,
        "",
        "Here is everything that might bear on it, from a personal notebook.",
        "",
        ...read.map((note) => `--- ${note.id} · ${note.title} (${note.trail}) ---\n${note.text.slice(0, 6000)}`),
        "",
        "Which of these actually help, and why this situation specifically?"
      ].join("\n"),
      model: TIER,
      schema: ANSWER_SCHEMA,
      system:
        "You are handed a situation somebody is facing while leading a team, and a set of notes " +
        "they wrote - principles from books they read, and records of their own conversations. " +
        "Say which notes bear on THIS situation and what each one says. Leave out anything that " +
        "merely shares a word with it: a shortlist of two that fit is worth more than six that " +
        "might. Never invent advice that is not in the notes; if the material does not answer the " +
        "situation, say so in `missing` rather than filling the gap yourself. " +
        HOUSE_RULES
    },
    (value) => {
      // A hit naming a note that was not sent is dropped rather than rendered
      // as a note nobody can open.
      const byId = new Map(read.map((note) => [String(note.id), note]));
      const applies = (Array.isArray(value.applies) ? value.applies : [])
        .map((/** @type {any} */ hit) => {
          const note = byId.get(String(hit.id));
          return note === undefined
            ? null
            : {
                id: note.id,
                title: note.title,
                trail: note.trail,
                says: String(hit.says ?? "").trim(),
                because: String(hit.because ?? "").trim()
              };
        })
        .filter(Boolean);

      return {
        situation,
        applies,
        missing: String(value.missing ?? "").trim(),
        read: read.length
      };
    }
  );
}
