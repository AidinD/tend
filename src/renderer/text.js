/**
 * Every word the app says, in one place.
 *
 * ## Why this exists
 *
 * The wording is being rewritten, and it could not be: it was spread across
 * thirteen renderer files as literals inside HTML templates, so reading what the
 * app actually says meant reading the app's markup. The reported symptom was
 * "jag vet inte vad många ord betyder" - and a vocabulary nobody can see all of
 * at once is a vocabulary that drifts, which is how the same idea ended up with
 * two names on two screens.
 *
 * This module is the refactor that unblocks that pass. It moves the words and
 * changes none of them; rewording is the next change and a separate one, because
 * a diff that both relocates and rewrites four hundred strings is a diff nobody
 * can review.
 *
 * ## Namespaced by view, not flat
 *
 * A flat map of four hundred keys is a file you search rather than read. Grouped
 * by the screen the words appear on, somebody rewriting the wording can take one
 * screen at a time and see every sentence that screen says together - which is
 * the only way to notice that two of them contradict each other.
 *
 * ## Sentences, not fragments
 *
 * A key holds a whole sentence even when the markup splits it. `<strong>Does:</strong>`
 * stays inside the string it belongs to, because a translator handed "Does" and
 * "stretches the thresholds" as separate keys cannot tell they are one line, and
 * word order is the first thing that moves between languages.
 *
 * The exception is a value the app computes - a count, a name, a date. Those are
 * function keys taking the value, so the sentence stays whole and the number
 * stays out of the translation.
 *
 * ## What does NOT belong here
 *
 * Class names, `data-act` values, selectors, and anything the code matches on.
 * Those are identifiers that happen to be strings, and putting them here would
 * make renaming a CSS class a translation question.
 */

export const T = {
  waiting: {
    /* On the daily page. The note is the whole ethic of the block: not an alarm. */
    groupTitle: "Waiting on someone",
    groupNote:
      "Not late on you. Chase it, or decide without it - both are answers, and " +
      "leaving it open is the only one that is not.",

    /* On a person's page. */
    blockTitle: "Waiting on them",
    addButton: "I am waiting on something",
    none: "Nothing outstanding from them.",

    /*
     * The counts, always, even at zero. "Asked once, three weeks ago" and
     * "asked once and chased three times" are different facts about a working
     * relationship, and only one of them is about being patient.
     */
    /**
     * @param {string} waitingFor
     * @param {number} chases
     * @param {string} sinceNudge
     */
    counts: (waitingFor, chases, sinceNudge) =>
      `waiting ${waitingFor} &middot; chased ${chases}× &middot; last nudge ${sinceNudge}`,
    /** @param {string} why */
    blocking: (why) => `Blocking: ${why}`,
    chaseButton: "I chased it",
    stopButton: "Stop waiting",

    /* Logging one. */
    addTitle: "Something you are waiting for",
    addIntro:
      "So a question you sent does not quietly rot. Nothing here is ever treated as late on you - " +
      "the point is that you remember to chase it, or decide without it.",
    addWhatLabel: "What you asked for",
    addWhatPlaceholder: "Two questions about the feedback on the scheduling view",
    addWhyLabel: "What it is blocking, optional",
    addWhyHint: "The half that decides whether to chase or route around it.",
    addAskedLabel: "When you asked",
    addAskedHint:
      "Backdate it. This usually gets written down the day you notice you are stuck, not the day you asked.",
    addCadenceLabel: "How long to wait before it is worth a nudge",
    addCadenceHint: "A week by default. Shorter nags about an ordinary human week.",
    addConfirm: "Log it",
    addToast: "Logged.",

    /* Chasing. */
    chaseTitle: "I chased it",
    chaseIntro:
      "This resets the clock and adds to the count. The count is the useful part: three reminders " +
      "with nothing back is a fact about the relationship, and each one on its own felt reasonable.",
    chaseNoteLabel: "How, in a line, optional",
    chaseNotePlaceholder: "Reminded him in the Discord thread",
    chaseWhenLabel: "When",
    chaseConfirm: "Log it",
    chaseToast: "Logged.",

    /* Closing it, either way. */
    stopTitle: "Stop waiting",
    stopIntro:
      "Both endings are ordinary. Deciding without the answer is a legitimate outcome, not a failure.",
    stopAsLabel: "How it ended",
    stopWhyLabel: "What came back, or what you did instead",
    stopWhyHint:
      "Worth keeping for the dropped ones especially. It is what you will want when the answer " +
      "finally arrives and contradicts what you already shipped.",
    stopConfirm: "Close it",
    stopToast: "Closed.",

    /* Taking it back entirely. */
    unlogTitle: "Take this back?",
    /** @param {string} what */
    unlogBody: (what) => `"${what}" stops being tracked, along with every chase logged against it.`,
    unlogConfirm: "Take it back",
    unlogToast: "Taken back."
  },

  focus: {
    /* Nothing running. */
    noneTitle: "No focus running",
    noneSub:
      "A focus is for when one thing genuinely has to come first for a while. " +
      "Tend will stretch the softer thresholds so they stop competing with it, " +
      "and tell you afterwards what that cost.",
    contractTitle: "What a focus does, and does not",
    contractDoes:
      "<strong>Does:</strong> stretches the thresholds on soft nudges, stops " +
      "surfacing proposed duties, and counts everything it holds back so you " +
      "always know how much is being kept from you.",
    contractNever:
      "<strong>Never:</strong> hides anything critical, touches a guarded duty, " +
      "or lets a promise age quietly. Everything it stretched reverts on the end " +
      "date whether or not the work is done, so an unfinished focus becomes a " +
      "decision to renew rather than a drift nobody noticed.",
    endEarly: "You can end it early at any time",
    startButton: "Start a focus",

    /* One running. */
    replace: "Replace",
    endButton: "End it",
    overrunTitle: "Past its end date",
    overrunWhy:
      "Every stretched threshold is already back to normal, so nothing is being " +
      "dampened. Renew it with a new date, or close it out.",
    budgetLabel: "Budget",
    budgetNote: "of the week",
    heldBackLabel: "Held back now",
    heldBackNote: "soft nudges, nothing critical",
    thresholdsLabel: "Thresholds",
    thresholdsNormal: "normal",
    thresholdsNote: "on unguarded duties only",
    costTitle: "What it has cost",

    /* The guarded list, which is the promise the feature rests on. */
    guardedTitle: "Guarded",
    guardedNone:
      "Nothing is guarded. Mark a duty as guarded in the role map and a focus " +
      "can never dampen it.",
    guardedSomeTitle: "Guarded, never dampened",
    /** @param {string} every */
    guardedEvery: (every) => `every ${every}`,
    guardedPill: "held",

    /* Starting one. */
    startTitle: "Start a focus",
    startIntro:
      "Tend captures how far behind things are right now, so it can tell you " +
      "later what this cost.",
    startNameLabel: "What has to come first",
    startNamePlaceholder: "Ship the new onboarding",
    startEndsLabel: "Until when",
    startEndsHint:
      "Everything reverts on this date whether or not the work is done. That is " +
      "the point: an unfinished focus becomes a decision, not a drift.",
    startBudgetLabel: "Share of the week, percent",
    startBudgetHint: "Only used to show you the shape of the week. It does not enforce anything.",
    startConfirm: "Start",
    startedToast: "Focus started.",

    /* Ending one. */
    endTitle: "End the focus?",
    endBody:
      "Every stretched threshold goes back to normal immediately, so anything " +
      "that has been drifting quietly will surface.",
    endConfirm: "End it",
    endedToast: "Ended."
  }
};
