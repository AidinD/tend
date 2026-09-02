/**
 * How anything a model produced is labelled once a person decides to keep it.
 *
 * ## Why this is not the writer id the store already records
 *
 * Every row carries `_by`: which PROCESS wrote it, so an event log can be read
 * back and a machine's writes told apart. That answers a different question.
 * `_by` on a promise the app wrote says "the app wrote this", which is true of
 * every row the app has ever written and therefore says nothing.
 *
 * What matters on the screen is where the WORDING came from. A promise a model
 * drafted and a person accepted is a promise somebody read and agreed to, and it
 * should not be indistinguishable from one they typed out themselves - not
 * because it is worth less, but because six months later "did I write that
 * sentence or did I approve it" is a real question with a real answer.
 *
 * ## Why it lives in domain rather than in the service layer
 *
 * It was in the service layer, and the renderer needed the same string, so the
 * renderer built it by hand: `model:${result.model}`. Two spellings of one
 * format, in two files, agreeing until one changed. Here, both import it.
 */

/**
 * The source label for something a model produced.
 *
 * @param {string} model The model id that produced it.
 * @returns {string}
 */
export function sourceLabel(model) {
  return `model:${String(model ?? "unknown").trim() || "unknown"}`;
}

/**
 * Was this wording a model's, whoever kept it?
 *
 * @param {string | null | undefined} source
 * @returns {boolean}
 */
export function fromModel(source) {
  return String(source ?? "").startsWith("model:");
}
