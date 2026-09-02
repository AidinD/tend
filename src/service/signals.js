/**
 * The questions Tend asks rather than derives, and their answers.
 *
 * The one thing here that no amount of arithmetic over the record can produce:
 * a question only he can answer. Everything else in the app is measured; these
 * are asked, monthly, and the expected answer is usually no.
 *
 * Split out of api.js: measured as needing nothing from any other section.
 */

import { signalsDue } from "../domain/signals.js";

/**
 * The monthly questions, and which are due.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {number} now
 */
export function signals(store, now) {
  return signalsDue(store.rows("signals"), store.rows("signalAnswers"), now).map((s) => ({
    id: s.id,
    question: s.text,
    why: s.why,
    due: s.severity !== "ok",
    lastAsked: s.everAnswered ? `${s.daysSince} days ago` : "never",
    lastAnswer: s.lastAnswer
  }));
}

/**
 * Answer one. A "yes" comes back round in a week rather than a month, because
 * a problem you flagged should not wait for the next cycle.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} args.signal
 * @param {"yes" | "no"} args.answer
 * @param {string} [args.note]
 * @param {number} args.now
 */
export function answerSignal(store, { signal, answer, note, now }) {
  const row = store.rows("signals").find((s) => s.id === signal);
  if (!row) {
    return { error: `No signal question with id "${signal}".` };
  }
  if (answer !== "yes" && answer !== "no") {
    return { error: `Answer must be "yes" or "no".` };
  }
  if (answer === "yes" && !String(note ?? "").trim()) {
    return { error: "A yes needs a note saying what you saw. A bare yes is not actionable later." };
  }
  store.create("signalAnswers", { signal, answer, note: note ?? null, at: now });
  return { signal, answer, nextAskedIn: answer === "yes" ? "7 days" : "30 days" };
}
