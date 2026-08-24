/**
 * Reading what somebody typed into the palette.
 *
 * Pure, and separate from the palette for one reason: this is where a bug
 * attaches a promise to the wrong colleague. Everything else in that overlay is
 * arrangement, and this is the part with a consequence, so it lives where it
 * can be tested without a window.
 *
 * The rule running through all of it: **refuse rather than guess.** Every
 * function here returns nothing when it is not sure, and the palette then asks.
 * One extra click is a worse outcome than nothing; a promise silently logged
 * against the wrong person is a worse outcome than either.
 */

/**
 * @typedef {{ id: string, name: string }} Named
 */

/**
 * The one person a fragment names, or null.
 *
 * Null on two matches, deliberately. "Nina" with two Ninas on the roster has to
 * be a miss rather than a coin toss - and the roster of somebody who leads a
 * team is exactly where two people share a first name.
 *
 * @template {Named} T
 * @param {T[]} roster
 * @param {string} text
 * @returns {T | null}
 */
export function matchPerson(roster, text) {
  const needle = String(text ?? "").trim().toLowerCase();
  if (needle.length < 2) {
    return null;
  }

  // A full name typed out wins outright, even where a shorter name is a prefix
  // of it. Without this, a roster holding both "Nina" and "Nina Berg" makes the
  // longer one unreachable.
  const exact = roster.filter((p) => String(p.name).toLowerCase() === needle);
  if (exact.length === 1) {
    return exact[0];
  }
  if (exact.length > 1) {
    return null;
  }

  const starts = roster.filter((p) =>
    String(p.name)
      .toLowerCase()
      .split(/\s+/)
      .some((part) => part.startsWith(needle))
  );
  return starts.length === 1 ? starts[0] : null;
}

/**
 * "Nina: look at the render pass" - a name, a colon, and the thing.
 *
 * Only an explicit colon counts. Taking the first word of any sentence that
 * happens to begin with a name would turn "Nina said the build is slow" into a
 * promise to Nina, which is a note about her and not a commitment at all - and
 * that mistake is invisible until the day it is read back to her.
 *
 * @template {Named} T
 * @param {T[]} roster
 * @param {string} text
 * @returns {{ person: T, rest: string } | null}
 */
export function splitAddressed(roster, text) {
  const match = /^([^:]{1,40}):\s*(.+)$/.exec(String(text ?? "").trim());
  if (!match) {
    return null;
  }
  const person = matchPerson(roster, match[1].trim());
  const rest = match[2].trim();
  return person && rest !== "" ? { person, rest } : null;
}

/**
 * Whether every word typed appears somewhere in a candidate.
 *
 * Not fuzzy matching, on purpose. A palette that finds "settings" from "sett"
 * is helpful; one that finds half the list on every keystroke makes the arrow
 * keys the only way to use it, which is slower than the rail it replaced.
 *
 * @param {string} text
 * @param {string} candidate
 */
export function matchesWords(text, candidate) {
  const haystack = String(candidate ?? "").toLowerCase();
  return String(text ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

/**
 * Whether a line reads as a question.
 *
 * A question mark, or one of the words that open one. Used to decide whether to
 * offer a model at all, so it errs towards no: a sentence that is not clearly a
 * question is treated as something to record, and recording is free.
 *
 * @param {string} text
 */
export function looksLikeQuestion(text) {
  const line = String(text ?? "").trim().toLowerCase();
  return line.includes("?") || /^(who|what|when|how|why|which)\b/.test(line);
}
