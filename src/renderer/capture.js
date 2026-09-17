/**
 * "Vad hände?" - one box, and a reading he can correct without leaving it.
 *
 * ## What this replaces
 *
 * Logging a conversation meant a dialog whose FIRST field was a list of eight
 * contact kinds. That list is correct - `domain/contact.js` argues at length for
 * why the kinds must stay apart, and it is right - but it is the store's
 * precision handed to the user as a choice, in the one moment he has the least
 * patience for it. His own words, 2026-09-17: "jag drar mig lite från att
 * använda det manuellt för att jag inte riktigt förstår och vet vad som ska in
 * vart och hur."
 *
 * So the kind, the day and the routing are derived from what he writes, and what
 * he sees back is a filled-in claim rather than an empty form.
 *
 * ## The first version of this file was dangerous, and this is the fix
 *
 * It rendered a "settled" reading as read-only facts: when the person and the
 * kind had both been derived there were no fields at all, and confirming was one
 * keystroke. The argument for it was that a confirmation beats an undo, because
 * an undo needs him to NOTICE a wrong kind and the whole premise is that he
 * cannot tell `casual` from `one-to-one`.
 *
 * That argument is still right. The design built on it was not, and an
 * adversarial pass over the derivation is what showed why: it broke the regexes
 * on ordinary Swedish in five different ways, and every break produced a
 * `settled` reading. So the flow taught Enter on the sentences it read well, and
 * then met the sentences it read badly with a screen holding nothing to click.
 * A confirmation you cannot correct is not a confirmation, it is a wall with a
 * button - and the only way out was to escape and reword a sentence to defeat a
 * regex he has never seen, which is a worse thing to ask than the dropdown was.
 *
 * What it does now:
 *
 * - **The person and the kind are selects, pre-set to what was read.** He reads
 *   a claim and ignores it, or changes it in one click. That is still not a
 *   question being asked - it is an answer being shown - so "at most one
 *   question back" survives, and a wrong reading is now visible AND adjacent to
 *   its correction.
 * - **A kind that was NOT derived starts blank and refuses to submit.** It
 *   previously showed option zero, which is `one-to-one`, and `required` cannot
 *   fire on a select that always has a value. So the one case where the app knew
 *   it had no idea was also the case where Enter silently recorded the most
 *   consequential kind in the list.
 * - **The evidence is shown for the person too.** It was computed and dropped,
 *   which is exactly why the two worst derivation breaks were invisible here:
 *   the screen said "Om vem: Viktor" rather than `Läst ur "vi"`.
 * - **The promise text is editable**, because it goes into an append-only log
 *   and is read back months later with no context around it.
 *
 * ## Where "at most one question" is not kept, said out loud
 *
 * A sentence naming nobody AND evidencing no kind - "pratade igår" - leaves two
 * blanks. That is honest rather than a miss: there is nothing in those words to
 * derive either half from, and filling one in would mean picking a colleague or
 * a cadence out of the air. The hint under each says what would have answered it
 * without being asked, which is how the vocabulary gets learned by using it
 * rather than by being handed a list of eight labels first.
 *
 * ## What it deliberately does not route
 *
 * An observation-for-assessment. That record needs an area to be worth anything
 * - it is what the axis groups on - and an area cannot be read out of a
 * sentence. Deriving it would file assessment evidence under a plausible
 * heading, which is worse than none. `observation` as a CONTACT kind is here;
 * the assessment one stays on the person page.
 */

import { act, form, kindsFor, tend, toast } from "./ui.js";
import { read } from "../domain/capture.js";
import { dayWords } from "../domain/time.js";
import { refresh } from "./app.js";
import { T } from "./text.js";

const words = T.capture;

/**
 * The kinds this flow offers, which is not quite `kindsFor("person")`.
 *
 * `survey` is out. A survey round is not something that happens in a sentence
 * beginning "vad hände" - it is run, not had - and leaving it on the list meant
 * "pratade med Nina om enkäten" could plausibly be answered with it, putting a
 * survey-round contact on one person. `NOTE_CONTACT_KINDS` drops it from the
 * Nib rules for the same reason; this is the second place that judgement was
 * needed, so it is written out rather than imported, because the two lists agree
 * today by coincidence and not by construction.
 */
const OFFERED = kindsFor("person").filter((k) => k.value !== "survey");

/**
 * Ask what happened, then show what was read.
 *
 * Loops rather than returning on a cancelled confirmation, so escaping out of
 * the second step lands back in the box WITH THE SENTENCE STILL IN IT.
 */
export async function captureDialog() {
  const roster = await tend.invoke("people");
  if (!Array.isArray(roster) || roster.length === 0) {
    toast(words.noRoster, "bad");
    return;
  }

  let said = "";
  for (;;) {
    const first = await form({
      title: words.title,
      intro: words.intro,
      fields: [
        {
          name: "said",
          label: words.saidLabel,
          type: "textarea",
          required: true,
          value: said,
          placeholder: words.saidPlaceholder,
          hint: words.saidHint
        }
      ],
      confirm: words.saidConfirm
    });
    if (!first) {
      return;
    }
    said = String(first.said ?? "").trim();

    const again = await confirmStep(read(said, roster, Date.now()), roster);
    if (again === "back") {
      continue;
    }
    return;
  }
}

/**
 * The second step: what Tend read, every bit of it changeable.
 *
 * @param {import("../domain/capture.js").Reading} reading
 * @param {any[]} roster
 * @returns {Promise<"done" | "back">}
 */
async function confirmStep(reading, roster) {
  const when = reading.day === null ? Date.now() : Number(reading.day.value);

  /*
   * A blank first option on anything that was NOT derived.
   *
   * Without it a select shows option zero and `required` can never fire, because
   * `ui.js` tests `el.value.trim()` and a select always has one. That turned "I
   * could not tell" into "1-1", silently, on the exact keystroke the settled
   * path trains.
   */
  const withBlank = (
    /** @type {{ value: string, label: string }[]} */ options,
    /** @type {boolean} */ derived
  ) =>
    derived ? options : [{ value: "", label: words.pick }, ...options];

  /** @type {any[]} */
  const fields = [
    {
      name: "saidNote",
      label: words.readLabel,
      type: "note",
      value: reading.note
    },
    {
      name: "subject",
      label: words.whoLabel,
      type: "select",
      required: true,
      options: withBlank(
        roster.map((p) => ({ value: String(p.id), label: String(p.name) })),
        reading.person !== null
      ),
      value: reading.person === null ? "" : String(reading.person.id),
      /*
       * The words that named them, and this hint is not decoration. Two of the
       * three worst breaks in the derivation were only ever visible here - a
       * roster holding a Viktor turned "vi hade vårt 1-1" into a 1-1 with
       * Viktor, and the screen said his name with nothing to say why.
       */
      hint: reading.personFrom === null ? words.whoHint : words.readFrom(reading.personFrom)
    },
    {
      name: "kind",
      label: words.kindLabel,
      type: "select",
      required: true,
      options: withBlank(OFFERED, reading.kind !== null),
      value: reading.kind === null ? "" : String(reading.kind.value),
      hint: reading.kind === null ? words.kindHint : words.readFrom(reading.kind.from)
    },
    {
      name: "dayNote",
      label: words.dayLabel,
      type: "note",
      value: dayWords(when),
      hint: reading.day === null ? words.dayAssumed : words.readFrom(reading.day.from)
    }
  ];

  if (reading.promise !== null) {
    /*
     * A second record out of one sentence, which answers one of his questions
     * verbatim: "ska den loggas någon mer stans?"
     *
     * Offered with a box rather than written in silence, because a promise is a
     * debt that ages, turns red and gets read back to him, so one he never meant
     * has a cost. Ticked by default because the cue is first person, explicit,
     * and refuses both a negation and a conditional.
     *
     * The TEXT is editable and was not. The clause extraction is a regex working
     * on punctuation, it had a bug that handed over the whole note as the
     * promise, and what it produces goes into an append-only log to be read
     * months later with nothing around it. Anything that lands there unreviewed
     * had better be right, and this is cheaper than being right.
     */
    fields.push(
      {
        name: "alsoPromise",
        label: words.promiseLabel,
        type: "checkbox",
        value: true
      },
      {
        name: "promiseText",
        label: words.promiseTextLabel,
        type: "text",
        value: reading.promise.value,
        hint: words.promiseTextHint
        /*
         * Not behind `showIf`. That helper compares the controlling element's
         * `value`, and a checkbox's `value` is the constant "on" whether it is
         * ticked or not - so the condition would have been decorative and the
         * field would have shown regardless. Two rows on the branch where a
         * promise was found is the honest version.
         */
      }
    );
  }

  const values = await form({
    title: words.confirmTitle,
    intro: reading.settled ? words.confirmIntroSettled : words.confirmIntroAsking,
    fields,
    confirm: words.confirmIt
  });
  if (!values) {
    return "back";
  }

  const subject = String(values.subject);
  const kind = String(values.kind);

  /*
   * The contact first, and the promise only once the contact has landed.
   *
   * `logTouch` can refuse - a day a note already covers, a date in the future -
   * and writing the promise first would leave a debt in the ledger hanging off a
   * conversation that was never recorded.
   */
  const sent = /** @type {any} */ (
    await tend.invoke("logTouch", { subject, kind, note: reading.note, at: when })
  );
  /*
   * `covered` BEFORE `error`, because the service returns both on that one
   * branch and checking `error` first made this whole case unreachable: he saw a
   * sentence telling him to "logga det med anyway", which is a flag this dialog
   * cannot send and offers no way to send, in a loop whose only exit was cancel.
   */
  if (sent?.covered) {
    toast(words.coveredToast, "bad");
    return "back";
  }
  if (sent?.error) {
    toast(String(sent.error), "bad");
    return "back";
  }

  const promised = String(values.promiseText ?? "").trim();
  if (values.alsoPromise === true && promised !== "") {
    await act("logPromise", { person: subject, text: promised, madeAt: when }, words.bothToast);
  } else {
    toast(words.loggedToast);
  }
  refresh();
  return "done";
}

/** Wired into the views that offer the button. */
export const actions = {
  capture: async () => {
    await captureDialog();
  }
};
