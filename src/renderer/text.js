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
  work: {
    title: "Work",
    sub:
      "Projects to keep an eye on, and the pieces inside them you have handed over to some degree.",
    addProject: "Add project",
    addStake: "Add stakeholder",
    addStream: "Add workstream",
    readFailedProjects: "the projects",
    readFailedStreams: "the workstreams",

    /* A project row. */
    /** @param {string} when */
    lastLookedAt: (when) => `last looked at ${when}`,
    view: "View",
    logLook: "Log a look",
    archive: "Archive",
    remove: "Remove",

    /* A stakeholder row. The clock is per person AND project. */
    /** @param {string} note */
    lastTime: (note) => `last time: ${note}`,
    /** @param {string} every @param {string} last */
    stakeMeta: (every, last) => `every ${every} &middot; last ${last}`,
    logUpdate: "Log an update",
    edit: "Edit",

    /* A workstream card. Leaving the level unset is itself flagged, because
       unstated delegation is the failure rather than missing data. */
    noLevelSet: "no level set",
    nobodyNamed: "nobody named",
    /** @param {string} owner @param {string} project @param {string} reviewed */
    streamMeta: (owner, project, reviewed) => `${owner}${project} · reviewed ${reviewed}`,
    /** @param {string} project */
    streamProject: (project) => ` · ${project}`,
    setLevelButton: "Set the level",
    changeLevelButton: "Change level",
    logReview: "Log a review",

    noPeopleYet: "Add people first if you want to name an owner on a workstream.",

    /* The three groups, and the two versions of each empty state - "nothing
       yet" and "everything is archived" are different facts. */
    projectsGroup: "Projects",
    projectsAllArchived:
      "No projects active. Every project here is archived - open the group below to bring one back.",
    projectsNone:
      "No projects yet. Add the ones you are accountable for without being in the daily work.",

    stakesGroup: "Waiting to hear from you",
    stakesNone:
      "Nobody is down as waiting for a report. A stakeholder is someone who depends on what you " +
      "deliver without being your report or your peer - the one direction where silence stays " +
      "invisible until something slips.",
    stakesNote:
      "The clock is per person AND project. An update about one project does not answer for " +
      "another, which is the whole reason this is not a field on a person: a quarter of silence " +
      "about the thing somebody depends on should not sit behind a fortnight of talk about " +
      "something else.",

    streamsGroup: "Workstreams",
    streamsAllArchived:
      "No workstreams active. Every one here is archived - open the group below to bring one back.",
    streamsNone:
      "Nothing handed over yet. A workstream is a piece of work with an owner and a stated level " +
      "of hand-over.",

    archivedProjectsGroup: "Archived projects",
    archivedStreamsGroup: "Archived workstreams",
    /** @param {string} date */
    archivedOn: (date) => `archived ${date}`,
    unarchive: "Unarchive",

    /* The delegation level, shared with Now which offers it off an unset one. */
    /** @param {string} name */
    levelTitle: (name) => `How far have you stepped back on ${name}?`,
    levelTitleBare: "Set the delegation level",
    levelIntro:
      "How closely you follow up depends on how experienced this person is at this particular " +
      "task, not on how good they are in general. The level sets how often Tend expects a review " +
      "- and the absence of a review is what separates delegating from abdicating.",
    levelLabel: "Level",
    levelConfirm: "Set it",
    levelSetToast: "Level set.",

    /* One project's page. */
    backToWork: "← Work",
    readFailedProject: "that project",
    projectArchivedRole: "Archived. Its history is here; it is out of every forward-looking view.",
    projectRole: "What has been looked at, and what is inside it.",
    cadencesBlock: "Cadences",
    cadencesNone: "No cadence over this project, so nothing here can be late.",
    /** @param {string} duty @param {string} target @param {string} last */
    cadenceLine: (duty, target, last) => `<strong>${duty}</strong> - target ${target}, last ${last}`,
    checkInsBlock: "Check-ins",
    checkInsNone: "Nothing logged against it yet. A look recorded here is what stops the clock.",
    fromANote: "from a note",
    notRight: "Not right",
    streamsInBlock: "Workstreams inside it",
    streamsInNone: "None. A project with no workstreams has nothing handed over.",
    /** @param {string} owner */
    streamOwner: (owner) => ` - ${owner}`,
    streamNoOwner: " - nobody owns it",
    interestedBlock: "Waiting to hear about it",
    interestedNone: "Nobody is on the hook for an update about this.",
    /** @param {string} label */
    interestedLabel: (label) => ` - ${label}`,

    /* Taking back a check-in. Same guarantee as a mislogged contact. */
    unlogTitle: "Take this back?",
    /** @param {string} what */
    unlogBody: (what) =>
      `"${what}" stops counting, so the clock it moved goes back to where it was. The event stays ` +
      `in the log - nothing here is ever really deleted - it just stops being evidence.`,
    unlogConfirm: "Take it back",
    unlogToast: "Taken back.",

    /* Adding a stakeholder, in two steps rather than one long form. */
    noRosterTitle: "Nobody on the roster yet",
    noRosterBody:
      "A stakeholder is a person first. Add them under People, then come back - the relationship " +
      "type to give them is Stakeholder, which inherits none of the duties written for people you " +
      "lead.",
    noProjectsTitle: "No projects yet",
    noProjectsBody:
      "A stakeholder waits to hear about something specific, so the project has to exist first.",
    understood: "Right",
    stakeTitle: "Who is waiting to hear from you?",
    stakeIntro:
      "Somebody who depends on what you deliver without being your report or your peer. The " +
      "obligation is per person AND project: telling them about one thing does not answer for " +
      "another.",
    stakeWho: "Who",
    stakeAbout: "About what",
    stakeCadence: "How often, in days",
    stakeCadenceHint:
      "A month is one reporting cycle. Shorter for someone close to the work, longer for a " +
      "distant sponsor.",
    stakeWhat: "What they actually want to know, optional",
    stakeWhatPlaceholder: "Whether the migration lands before the quarter closes",
    stakeSince: "Waiting since",
    stakeSinceHint:
      "Backdate it if they have been in the dark for a while - otherwise the first month of the " +
      "record flatters you.",
    add: "Add",
    addedToast: "Added.",

    /** @param {string} name */
    editStakeTitle: (name) => `How often should ${name} hear from you?`,
    editStakeWhat: "What they want to know, optional",
    save: "Save",
    savedToast: "Saved.",

    /** @param {string} what */
    logUpdateTitle: (what) => `What did you tell them about ${what}?`,
    logUpdateFallback: "it",
    logUpdateIntro: "One line is enough. The point of the record is the date, not the report.",
    logUpdateNote: "What you said, optional",
    when: "When",
    logIt: "Log it",
    loggedToast: "Logged.",

    /** @param {string} name */
    removeStakeTitle: (name) => `Remove ${name}?`,
    removeStakeBody:
      "They stop appearing as waiting for a report about this project. The updates you already " +
      "logged stay on record, and being a stakeholder in anything else is untouched.",
    removedToast: "Removed.",

    addProjectTitle: "Add a project",
    projectName: "Name",
    projectSince: "Since when",
    projectSinceHint:
      "When you took it on. Backdate it and a project you have been ignoring shows as ignored " +
      "rather than as freshly checked.",
    /** @param {string} name */
    addedNamed: (name) => `${name} added.`,

    addStreamTitle: "Add a workstream",
    addStreamIntro:
      "A piece of work with an owner. Leaving the level unset is itself flagged, because unstated " +
      "delegation is the failure rather than missing data.",
    streamName: "What the work is",
    streamNamePlaceholder: "Renderer rewrite",
    streamOwnerLabel: "Who owns it",
    streamNobodyYet: "Nobody yet",
    streamProjectLabel: "Part of which project",
    streamNoProject: "None",
    streamLevelLabel: "How far you have stepped back",

    /** @param {string} name */
    reviewTitle: (name) => `Review of ${name}`,
    reviewIntro: "This is the monitoring half. Logging it resets the clock the level sets.",
    foundNote: "What you found, optional",

    /** @param {string} name */
    checkInTitle: (name) => `Check-in on ${name}`,

    /*
     * Archiving is reversible, unlike removing, so it gets its own gentler
     * dialog rather than reusing the danger-zone one.
     */
    /** @param {string} name */
    archiveProjectTitle: (name) => `Archive ${name}?`,
    archiveProjectBody:
      "It stops appearing in this list, in Now and in attention nudges. Every check-in, stake and " +
      "review already logged against it stays exactly as it is and can be looked at again. Fully " +
      "reversible from the archived list.",
    /** @param {string} name */
    archivedToast: (name) => `${name} archived.`,
    /** @param {string} name */
    unarchivedToast: (name) => `${name} unarchived.`,
    /** @param {string} name */
    removeProjectTitle: (name) => `Remove ${name}?`,
    removeBody: "It stops being tracked. The history stays in the log.",

    /** @param {string} name */
    archiveStreamTitle: (name) => `Archive ${name}?`,
    archiveStreamBody:
      "It stops appearing in this list, in Now and in attention nudges. Every review already " +
      "logged against it stays exactly as it is and can be looked at again. Fully reversible from " +
      "the archived list.",
    /** @param {string} name */
    removeStreamTitle: (name) => `Remove ${name}?`
  },

  journal: {
    readFailedTitle: "Could not read the journal",
    title: "The day",
    /*
     * The private half's version carries the rule, because the cheaper half of
     * enforcing it is upstream: the labels say it while the entry is being
     * written, which is worth more than reading it back afterwards.
     */
    subPrivate:
      "Four boxes, all optional, no reminder and no streak. One rule, and it is the whole reason " +
      "this is safe to write: record what happened and your own part in it, never the other " +
      "person's state. That is the half you can change, and it is the only version you could show " +
      "the person it is about.",
    subWork:
      "Four boxes, all optional, no reminder and no streak. Missing days is expected - the value " +
      "is in a month of them rather than in any one, so the only thing that matters is that " +
      "writing one is cheap.",
    logMomentButton: "Log something",
    writeButton: "Write today",
    tooThinNote:
      " Too few to call anything a pattern yet, which is worth knowing before any reading is read.",
    empty:
      "Nothing written yet. The questions are what took the day, what you avoided, and what you " +
      "would do differently - none of them things Tend can work out on its own, which is the only " +
      "reason it asks.",

    /* Moments, on this page because one involving three people has no single
       page it belongs to. */
    momentsGroup: "Moments",
    /** @param {number} n */
    momentsMore: (n) => `${n} more, on the pages of the people they involved.`,

    /* Reading across the moments. Every finding has the writer as its subject,
       which is what makes pattern-finding safe to have in this half at all. */
    patternsTitle: "What keeps happening",
    /** @param {number} moments @param {number} days */
    patternsTooThin: (moments, days) =>
      `${moments} ${moments === 1 ? "moment" : "moments"} across ${days} ${days === 1 ? "day" : "days"}. ` +
      `A reading needs at least four across at least three separate days, because several logged ` +
      `in one sitting describe one afternoon however many rows they make.`,
    patternsReady:
      "Reads what you wrote and names what recurs in what YOU did. Never what anybody else in " +
      "them is like - that half is not the app's to name, and it is why this is safe to run at all.",
    patternsNoModel: "No model is reachable, so these can only be read by you.",
    patternsNote: "Nothing is written, kept or sent anywhere",
    patternsReading: "Reading...",
    patternsRead: "Read across them",
    patternsFailedTitle: "Could not read across them",
    close: "Close",
    patternsNothing: "Nothing recurs across these yet, which is a real answer rather than a failure.",
    /** @param {string} days */
    patternsDays: (days) => `${days} days`,
    toPutToYourself: "To put to yourself",
    doneWithIt: "Done with it",

    /* The journal reading. Every state says what would change it, because a
       disabled button that says nothing reads as broken. */
    readingGroup: "The reading",
    readTitle: "Read the last 30 days",
    readTooThin:
      "A reading needs at least four entries across at least three separate days. Fewer than that " +
      "and a pattern is one evening restated with confidence - which then gets remembered next " +
      "month as a fact.",
    readReady:
      "Reads every entry in the window and names what recurs: where the days actually went, and " +
      "what kept being avoided. Nothing is written unless you keep it.",
    readNoModel: "No model is reachable, so the entries can only be read by you.",
    readWhatItLooksFor:
      "What it looks for is the pair of things that are invisible on the day and obvious across a " +
      "month. It asks questions rather than reaching verdicts, and the counts the app recorded " +
      "over the same days travel with it - a memory of a month is worse than a memory of a day, " +
      "and only one of the two is checkable.",
    reading: "Reading...",
    readThem: "Read them",

    /* Kept readings. The second one is where this earns anything: a pattern that
       survived three months is a different fact from one noticed tonight. */
    keptGroup: "Kept readings",
    /** @param {string} entries @param {string} spread */
    keptCoverage: (entries, spread) => `${entries} entries over ${spread} days`,
    keptAvoided: "Kept being avoided",
    keptWentInto: "Where the days went",
    keptSaidVsDid: "Against what you said you would do",
    keptQuestions: "Worth asking yourself",
    /** @param {string} days @param {string} by */
    keptFoot: (days, by) => `Covered the ${days} days to then${by}.`,
    /** @param {string} who */
    keptReadBy: (who) => `, read by ${who}`,
    remove: "Remove",

    /* One day. */
    entryFoot: "Written by you. Read by the pass above, when you ask for it.",
    readBackButton: "Read it back",
    edit: "Edit",
    readingBack: "Reading it back...",
    ownPartNoModel: "No model is reachable, so nothing can read this back.",

    /* Logging a moment. */
    momentNoRoster: "Add somebody first - a moment is about the people who were in it.",
    momentTitle: "What happened?",
    momentIntro:
      "An event rather than a day, so log as many as the day holds. Your own part in it is the " +
      "half worth keeping - it is the half you can change, and the only version you could show " +
      "the person it is about.",
    momentWhatLabel: "What happened",
    momentWhatHint: "Optional. Often obvious to you, and leaving it out costs nothing.",
    momentPartLabel: "My part in it",
    momentPartHint: "What you did, chose, felt or avoided. Not what they were like.",
    momentWhoLabel: "Who was in it",
    momentWhoHint: "Written once, and it appears on each of their pages.",
    momentWhenLabel: "When",
    momentConfirm: "Keep it",
    momentNobody: "Tick at least one person - a moment with nobody in it belongs in the day.",
    keptToast: "Kept.",
    removedToast: "Removed.",

    /*
     * Writing the day. No people on this form, deliberately - a whole-day
     * retrospective ticked against four names put one day's text onto four
     * people's pages. What belongs to a person is a moment.
     */
    /** @param {string} day */
    writeEditTitle: (day) => `Edit ${day}`,
    writeTitle: "How was the day?",
    writeIntro:
      "Leave any of them empty. One filled box is a real entry, and three required ones would " +
      "only produce something invented at eleven at night - which reads like a fact afterwards " +
      "and is worse than nothing.",
    writeWhichDay: "Which day",
    writeConfirm: "Keep it"
  },

  now: {
    readFailedTitle: "Could not read the data",

    /* The quiet day, which is the design rather than a gap. */
    quietTitle: "Nothing needs you",
    quietSub:
      "Every cadence is inside its interval, no promise is ageing, and no question is due. This " +
      "view is meant to be empty most days.",
    quietEmpty: "When something drifts, it appears here and nowhere else.",

    title: "Now",
    sub: "Only what deviates. Everything in step stays out of the way.",

    /* The focus strip. */
    focusEyebrow: "Current focus",
    /** @param {number} held */
    focusHeld: (held) => `${held} nudge(s) held back. Nothing critical is ever in there.`,
    focusSettings: "Focus settings",

    /* The groups. */
    needsYouGroup: "Needs you",
    revisitsGroup: "Decisions to look at again",
    questionsGroup: "Questions",
    nudgeGroup: "Nudge",
    /** @param {number} n */
    softerHeld: (n) => `${n} softer nudge(s) held back while the focus runs.`,

    /* A decision asking to be looked at again. */
    /** @param {string} by */
    decisionDue: (by) => `decision due ${by}`,
    dueNow: "now",
    decisionSrc: "You set this date when you decided it.",
    stillHolds: "It still holds",
    openLog: "Open the log",

    /*
     * Patterns in his own month, at the bottom rather than the top. They are not
     * deviations from a duty and nothing is late because of them, so they must
     * not compete with what is.
     */
    mineHead: "My month",
    mineSub: "About me, not about them. Nothing here is late.",

    /* Nobody active, but not nobody. A state that can be reversed rather than a
       setup step that was never done. */
    archivedSub:
      "Nobody is active right now - everybody is archived, and every 1-1, promise and decision " +
      "about them is exactly where it was. Bring anyone back from the archived group on People, " +
      "or start over by adding somebody new.",
    archivedEmpty:
      "Nothing has been deleted. When somebody is active again, what is behind on them appears here.",

    /* First run. */
    firstTitle: "Nothing to watch yet",
    firstSub:
      "Tend needs two things before it can tell you anything: the people you are responsible " +
      "for, and what the job asks of you.",
    firstPeopleTitle: "1. Add the people",
    firstPeopleWhy:
      "Everyone you lead or manage, and the other leads you work beside. Set the date each " +
      "relationship started, not today - otherwise someone you have not spoken to in months " +
      "looks perfectly in step.",
    firstPeopleNote: "Nothing leaves this machine",
    firstPeopleButton: "Add someone",
    firstRoleTitle: "2. Start the role map",
    firstRoleWhy:
      "Three duties you already practise, five proposed from the management reading, and three " +
      "monthly questions. The proposals do nothing until you accept them, and you can change any " +
      "of it afterwards.",
    firstRoleNote: "You can edit or delete every one of them",
    firstRoleButton: "Set up the role map",
    firstRoleLook: "Look first",

    /* One card. */
    softened: "Actually critical. The focus is only softening how it reads.",
    logProject: "Log a look",
    logWorkstream: "Log a review",
    logStake: "Log an update",
    logPerson: "Log contact",
    open: "Open",
    done: "Done",
    drop: "Drop",
    setLevelButton: "Set the level",
    fileButton: "Say whose these are",
    guarded: " · guarded",

    /* A monthly question. The answer is usually no, and saying so is the point. */
    neverAsked: "never asked",
    questionSrc: "Monthly check. The answer is usually no",
    answerNo: "No",
    answerYes: "Yes, and here is what I saw",

    /* Filing commitments out of one shared note. */
    fileTitle: "Whose are these?",
    /** @param {number} n @param {string} note */
    fileIntro: (n, note) =>
      `${n} thing${n === 1 ? "" : "s"} were flagged in "${note}". ` +
      "Several people were in it, so Tend cannot tell whose each one is - and filing one against " +
      "everybody would turn one obligation into several. Anything left as not-yet stays in the queue.",
    fileNotYet: "Not yet - leave it in the queue",
    /** @param {string} name */
    filePromiseTo: (name) => `A promise to ${name}`,
    fileNobody: "Nobody's promise - discard it",
    fileConfirm: "File them",
    /** @param {number} n */
    filedCount: (n) => `${n} filed`,
    /** @param {number} n */
    discardedCount: (n) => `${n} discarded`,

    /* Logging contact, where the subject decides the wording and the kinds. */
    logTitlePerson: "Log contact",
    logTitleOther: "Log what you looked at",
    logIntroPerson:
      "The kind decides which cadence this satisfies. Hearing about someone from their lead is " +
      "not the same as having spoken to them, and Tend keeps those apart on purpose.",
    logIntroOther:
      "Only the kinds that can be about this sort of subject are offered. The rest would record " +
      "something that satisfies no cadence.",
    logKindLabel: "What kind",
    logNoteLabel: "One line, optional",
    logNotePlaceholder: "What it was about",
    logConfirm: "Log it",
    loggedToast: "Logged.",

    closedToast: "Closed.",
    dropTitle: "Drop this promise?",
    dropBody:
      "It stops being tracked. Use this when you decided not to do it, rather than when you did it.",
    dropConfirm: "Drop it",
    droppedToast: "Dropped.",
    seededToast: "Role map set up.",

    answeredNoToast: "Noted. Back in a month.",
    yesTitle: "What did you see?",
    yesIntro:
      "A bare yes is no use in three months. One or two concrete sentences is enough, and this " +
      "question comes back in a week rather than a month.",
    yesLabel: "What you saw",
    yesConfirm: "Record it",
    recordedToast: "Recorded."
  },

  knowledge: {
    title: "What do I know about this?",
    /*
     * The example has to belong to the half. The placeholder is the only
     * instruction anybody reads here, and a work situation offered on a page
     * about family teaches the wrong use of the feature in the half where the
     * feature is newest.
     */
    /** @param {boolean} isPrivate */
    sub: (isPrivate) =>
      "Ask about the situation you are in, not the book you half remember. Your own notes " +
      `answer - what you read and wrote down, and ${isPrivate ? "the evenings you wrote up" : "the conversations you had"}.`,
    placeholderPrivate: "I keep getting short with somebody when I am tired",
    placeholderWork: "Someone on my team has stopped disagreeing with me",
    searchButton: "Search",
    /** @param {boolean} isPrivate */
    searchNote: (isPrivate) =>
      "Searching only titles and opening lines. Nothing is opened until you ask for it." +
      (isPrivate
        ? " What you have read reaches both halves; notes about people stay in the one they were written in."
        : ""),

    searchFailedTitle: "Could not search",
    /** @param {string} searched */
    nothingShares: (searched) =>
      `Nothing in ${searched} notes shares wording with that. This search matches words, so try ` +
      `the words you would have written at the time - or write the note, and it will be here next time.`,

    sharesGroup: "Shares wording",
    /** @param {number} n @param {string} searched */
    sharesMeta: (n, searched) => `${n} of ${searched}`,
    wordMatchNote: "A word match. It finds the obvious and misses the rest.",
    reading: "Reading…",
    readProperly: "Read them properly",
    readingOff: "Reading is off - no Claude Code on this machine.",
    untitled: "Untitled",

    /*
     * The general-knowledge offer, below the notes and never the primary action
     * while the notes had something to say. It says what it sends, because every
     * other model button here opens notes and a name typed into the box travels
     * with this one.
     */
    generalOffer:
      "Not from your notes: what is generally understood about this. Only the sentence you typed " +
      "is sent - no notes, and nobody from your roster.",
    generalLooking: "Looking it up…",
    generalAsk: "What is generally understood?",

    /* The general answer, framed as the weakest thing on the page. */
    generalTitle: "Generally understood - not from your notes",
    copy: "Copy",
    discard: "Discard",
    /** @param {string} who */
    onlyTheyCanAnswer: (who) => `Only they can answer: ${who}`,
    wherePeopleStart: "Where people start",
    /** @param {string} what */
    wouldAnswer: (what) => `What would actually answer it: ${what}`,
    generalWide:
      "General, and this varies widely between people - a starting point, and the people involved outrank it. ",
    generalNarrow: "General. ",
    /** @param {string} model @param {string} cost */
    generalFoot: (model, cost) =>
      `Written by ${model}${cost} from its own knowledge, not from anything you have read. ` +
      `Nothing was saved - copy it into Nib if it is worth keeping.`,
    someModel: "a model",

    /*
     * The copy, with its provenance line. A general summary pasted into Nib
     * without one is indistinguishable next year from a note about something he
     * actually read, which is the confusion this block is drawn to prevent.
     */
    /** @param {string} who */
    textOnlyThey: (who) => `\nOnly they can answer: ${who}`,
    textStarts: "\nWhere people start:",
    /** @param {string} what */
    textWouldAnswer: (what) => `\nWhat would actually answer it: ${what}`,
    /** @param {string} model @param {boolean} wide */
    textProvenance: (model, wide) =>
      `General knowledge, written by ${model}. Not from anything I have read.` +
      (wide ? " Varies widely between people; the people involved outrank it." : ""),
    copiedToast: "Copied, with the line saying it is general.",
    copyFailedToast: "Could not reach the clipboard. Select the text and copy it.",

    /*
     * `missing` is printed as prominently as the hits, deliberately. The useful
     * answer to "what do I know about this" is often "less than you think", and
     * a view that only ever lists matches implies the opposite.
     */
    /** @param {string} n */
    readTitle: (n) => `Read ${n} of them`,
    noneBear: "None of them actually bear on this.",
    /** @param {string} what */
    notAnswered: (what) => `Not answered by anything you have written: ${what}`,
    /** @param {string} by @param {string} cost */
    answerFoot: (by, cost) => `Read from your own notes${by}${cost}. Nothing was saved.`,
    /** @param {string} model */
    answerBy: (model) => ` by ${model}`
  },

  role: {
    title: "Role map",
    sub:
      "What the job asks of you, and how you are doing against it. Change any of it - a duty you " +
      "never act on is worse than no duty at all.",
    addButton: "Add a duty",

    /* Nothing here yet. The seeded set is proposals, never decisions. */
    seedTitle: "Nothing here yet",
    seedWhy:
      "Start from a set drawn from management reading: three duties most managers already " +
      "practise, five worth considering, three monthly questions, and a set of standing topics to " +
      "raise with your own manager and your peer leads. The proposals do nothing until you accept " +
      "them, and you can edit or delete every one.",
    seedOr: "Or write your own from scratch",
    seedButton: "Set up the role map",
    seedOwnButton: "Write my own",

    /* A proposed duty. */
    proposedPill: "proposed",
    /** @param {string} every @param {string} source */
    proposedMeta: (every, source) => `Suggested every ${every} · from ${source}`,
    acceptButton: "Add to my map",
    adjustButton: "Adjust first",
    declineButton: "Not for me",

    /* An accepted one. */
    /** @param {string} behind */
    behindPill: (behind) => `${behind} behind`,
    /**
     * @param {string} every
     * @param {string} appliesTo
     * @param {string} source
     * @param {boolean} guarded
     * @param {boolean} pausedForLeavers
     */
    activeMeta: (every, appliesTo, source, guarded, pausedForLeavers) =>
      `Every ${every} · ${appliesTo} · from ${source}` +
      (guarded ? " · guarded" : "") +
      (pausedForLeavers ? " · paused for leavers" : ""),
    editButton: "Edit",
    removeButton: "Remove",

    /* The groups. */
    proposedGroup: "Proposed, undecided",
    activeGroup: "Yours, active",
    activeEmpty: "Nothing active yet.",
    questionsGroup: "Monthly questions",
    questionsNote:
      "The one thing Tend cannot work out on its own, so it asks. They appear in Now when they " +
      "are due.",
    neverAsked: "never asked",
    /** @param {string} when */
    asked: (when) => `asked ${when}`,

    topicsGroup: "Topics to raise",
    topicsNote:
      "Not duties. A duty asks whether you spoke to someone at all and turns up in Now when you " +
      "have not; a topic is what to actually say, and it appears only on that person's card in " +
      "Prep. These are the two directions nothing else covers: upward, where the questions are " +
      "about what you want rather than what you owe, and sideways, where there is no formal " +
      "channel in either direction.",
    /** @param {number} days @param {string} scope */
    topicMeta: (days, scope) => `every ${days} days &middot; ${scope}`,
    topicOnePerson: "one person",
    topicNobody: "nobody yet",
    useItButton: "Use it",

    /* The duty form. */
    fName: "What it is",
    fNamePlaceholder: "1-1",
    fMeans: "What it means in practice",
    fMeansHint:
      "In your own words. This is what you will read in six months when you have forgotten why " +
      "you added it.",
    fAppliesTo: "Applies to",
    fCadence: "How often, in days",
    fGuarded: "Never dampen this, even under a focus",
    fGuardedHint:
      "For the things a busy month must not be allowed to bury. Note that a focus never " +
      "removes anything critical from Now whether this is set or not - it holds back the " +
      "softest tier, and guarding also protects the tier above it.",
    fLeavers: "Still applies to somebody working out their notice",
    fLeaversHint:
      "Leave it on for a 1-1: a notice period is when the handover gets arranged. Turn it " +
      "off for anything meant to develop somebody, like a peer review round - running one " +
      "for a person on their way out is work for everybody and changes nothing.",

    /* Relationships, asked separately because the answer only makes sense for a
       person-shaped duty. */
    relationsTitle: "Who does it apply to?",
    relationsIntro: "Leave them all off to mean everyone.",
    relationsConfirm: "Done",

    addTitle: "Add a duty",
    addIntro:
      "Something the job asks of you that can be neglected. Keep the map short - a long list is " +
      "one you stop reading.",
    addConfirm: "Next",
    addedToast: "Added.",
    /** @param {string} name */
    editTitle: (name) => `Edit ${name}`,
    editConfirm: "Save",
    savedToast: "Saved.",

    seededToast: "Role map set up.",
    acceptedToast: "Added to your map.",
    declinedToast: "Declined.",
    topicAcceptedToast: "It will show up when you next prepare for them.",

    removeTopicTitle: "Remove this topic?",
    /** @param {string} name */
    removeTopicBody: (name) =>
      `"${name}" stops appearing on anyone's card. The times you already marked it raised stay on record.`,
    removeConfirm: "Remove",
    removedToast: "Removed.",
    /** @param {string} name */
    removeDutyTitle: (name) => `Remove "${name}"?`,
    removeDutyBody:
      "It stops applying to anyone and stops appearing in Now. The contact you have already " +
      "logged stays."
  },

  prep: {
    readFailedTitle: "Could not read the data",
    title: "Before you talk to them",
    sub:
      "Who has drifted or is owed something, with what they own, what is open on the board, and " +
      "the last thing you wrote. Worst first, and only a few: this is meant to be read and " +
      "finished.",
    empty:
      "Nobody is behind and nothing is owed. This page is empty most days, which is the point of it.",
    /** @param {number} n */
    dropped: (n) => `${n} more further behind than nobody, held back so this page ends.`,

    /* What he is practising, once for the page rather than on every card. */
    practiceNoneTitle: "Nothing to practise",
    practiceTitle: "What you are working on",
    practiceWhy:
      "Flagged in Nib, read from there every time. Lower the flag when it starts coming naturally " +
      "and pick up the next one - the timing is yours, and Tend deliberately puts no date on it.",
    practiceTodoTitle: "And one thing you said you would do",
    /** @param {string} noteTitle */
    practiceWrote: (noteTitle) => `you wrote this on ${noteTitle}`,

    /*
     * Where the card could not reach, said out loud. A card with no open work
     * looks identical whether the board was empty or unreachable, and an
     * integration that fails quietly sits there for weeks looking like a calm
     * week.
     */
    sourceJot: "the Jot board",
    sourceNib: "Nib's notes",
    /** @param {string} which */
    sourcesMissing: (which) =>
      `Could not read ${which}, so those parts of every card are blank rather than empty. ` +
      `Check the data directories in `,
    sourcesSettings: "Settings",

    /* One person's card. */
    /** @param {string} why @param {string} lastSpoke */
    cardWhy: (why, lastSpoke) => `${why}. Last spoke ${lastSpoke}.`,
    promisedTitle: "You promised them",
    /** @param {string} openFor */
    promisedOpen: (openFor) => `open ${openFor}`,
    theyOwnTitle: "They own",
    /** @param {string} mandate @param {string} reviewed */
    theyOwnMeta: (mandate, reviewed) => `${mandate} &middot; reviewed ${reviewed}`,
    openWorkTitle: "Open on the board",
    jotUnreadable: "Jot could not be read.",
    /** @param {string} category @param {string} status @param {boolean} named */
    openWorkMeta: (category, status, named) =>
      `${category} &middot; ${status}${named ? " &middot; matched on their name" : ""}`,
    lastWroteTitle: "You last wrote",
    footNote: "Everything here is already in Tend, Jot or Nib.",
    /** @param {string} person */
    openPerson: (person) => `Open ${person}`,

    /*
     * Each topic carries its own reason, and that is not padding: the whole set
     * is questions whose value is not obvious in the moment, and a question you
     * do not believe in is one you skip.
     */
    raisingTitle: "Worth raising",
    raisedButton: "Raised it",
    /** @param {string} when */
    lastRaised: (when) => `Last raised ${when}.`,

    /* The model buttons, or a disabled pair that says why. */
    draftingOff: "Drafting is off - no Claude Code on this machine.",
    drafting: "Drafting…",
    draftButton: "Draft a brief",
    reading: "Reading…",
    readNoteButton: "Read that note"
  },

  reflection: {
    title: "Reflection",
    sub:
      "Occasional, never late, and two fixed questions rather than a blank box: what went well " +
      "over the last week or so, and what you would do differently. Nothing here is required, and " +
      "nothing here is read back to anyone.",
    addButton: "Add a reflection",
    empty:
      "Nothing written yet. The two questions are what went well and what you would do " +
      "differently - answer either one, or both.",
    writtenBy: "Written by you.",
    remove: "Remove",

    /* The aims block. */
    aimsTitle: "What I am working on in myself",
    aimsAtLimit: "Two is the limit. Reach or let one go first.",
    aimsSetButton: "Set an aim",
    aimsEmpty:
      "Nothing set. An aim says what you want to be able to do and where its verdict comes from - " +
      "the record counting it, somebody else saying so, or you logging the occasions. Without one " +
      "of those it can only ever be kept to next time.",

    /* One aim's card. The three headings are the fields doing one job each. */
    aimStillToAnswer: "Still to answer",
    aimHowIKnow: "How I will know",
    aimWhereItHappens: "Where it happens",
    aimAsking: "Asking",
    aimNothingLogged: "Nothing logged yet.",
    /**
     * The two counts side by side rather than as one number, because the pair IS
     * the evaluation: eight occasions logged and two of them taken says something
     * neither figure says alone.
     *
     * @param {number} seen
     * @param {number} missed
     * @param {string} last
     */
    aimCounts: (seen, missed, last) => `${seen} taken, ${missed} missed, last ${last}`,
    aimLogButton: "Log an occasion",
    aimCloseButton: "Close it",

    /* Setting one. The source is asked before the test, deliberately. */
    setTitle: "Set an aim",
    setIntro:
      "Something you want to be able to do, and where its verdict comes from. Without a " +
      "source it can only ever be kept to next time, which is what a development point with " +
      "no marker becomes.",
    setAimLabel: "What you want to be able to do",
    setSourceLabel: "How you will know",
    setSourceLogged: "You log the occasions, taken and missed",
    setSourceRecord: "The record can count it",
    setSourceAsked: "Somebody else says so",
    setMeasureLabel: "The actual test, in words",
    setAsksWhoLabel: "Who you are asking, if somebody else decides",
    setThroughLabel: "Which real work this happens in",
    setThroughPlaceholder: "The Tuesday meeting, every 1-1",
    setThroughHint: "Without this it waits for a free evening.",
    setWhyLabel: "Why it is worth the months",
    setConfirm: "Set it",
    setToast: "Set.",

    /* Logging an occasion. A miss is a choice on the form, not prose. */
    /** @param {string} aim */
    logTitle: (aim) => `One occasion: ${aim}`,
    logIntro:
      "Both kinds count. The gap between the occasions you took and the ones you missed is " +
      "what makes this measurable rather than a feeling about the quarter.",
    logNoteLabel: "What happened",
    logWhichLabel: "Which was it",
    logYes: "I did the thing",
    logNo: "The occasion came and I did not",
    logConfirm: "Log it",
    logToast: "Logged.",

    /* Closing one. */
    /** @param {string} aim */
    closeTitle: (aim) => `Close: ${aim}`,
    closeIntro:
      "Reached and let go are both endings and only one is a success. Saying which is the " +
      "point - an aim quietly abandoned is what this shape exists to prevent.",
    closeHowLabel: "How it ended",
    closeReached: "Reached - it comes naturally now",
    closeDropped: "Let go - not the thing after all",
    closeWhyLabel: "What decided it",
    closeConfirm: "Close it",
    closeToast: "Closed.",

    /* Writing a reflection. */
    writeTitle: "How did the week go?",
    writeIntro: "Answer at least one of the first two - notes alone is not a reflection.",
    writeConfirm: "Keep it",
    writeToast: "Kept.",
    removedToast: "Removed."
  },

  decisions: {
    readFailedTitle: "Could not read the data",
    title: "Decisions",
    sub:
      "What was decided about the organisation, why, and what was rejected. Every " +
      "one carries a date it comes back on, which is what makes it something you " +
      "can decide quickly: a decision with a revisit date is not forever.",
    codeNote: "Code has DECISIONS.md. This is the half that has no commit history.",
    addButton: "Record a decision",
    empty:
      "Nothing logged yet. The ones worth recording are the ones that get " +
      "renegotiated: who owns what, who is not being backfilled, what is waiting " +
      "a cycle.",

    /* The three bands, in the order they need you. */
    proposedBand: "Suggested, not yet recorded",
    proposedNote: "An agent read these somewhere. Recording one is what starts its clock.",
    revisitBand: "Worth another look",
    revisitNote: "The date you set has passed. Saying it still holds takes one click.",
    loggedBand: "Logged",

    /* A proposal. */
    proposedBadge: "proposed",
    /** @param {string} source */
    readIn: (source) => `Read in ${source}`,
    noSource: "No source given",
    /** @param {string} who */
    proposedBy: (who) => ` &middot; by ${who}`,
    recordIt: "Record it",
    editFirst: "Edit first",
    notADecision: "Not a decision",

    /* One asking to be looked at again. */
    /** @param {string} by */
    dueBadge: (by) => `due ${by}`,
    dueNow: "now",
    revisitSrc: "You set this date. Nothing has happened to the decision.",
    stillHolds: "It still holds",
    changeIt: "Change it",
    reverseIt: "Reverse it",

    /* One in the log. */
    noRevisit: "&middot; no revisit date",
    /** @param {string} date */
    backOn: (date) => `&middot; back on ${date}`,
    edit: "Edit",

    /* Fields, and what is missing. */
    rejectedLabel: "Rejected:",
    consultedLabel: "Consulted:",
    /** @param {string} what */
    missing: (what) => `Missing ${what}`,

    fWhat: "What was decided",
    fStatus: "Is this decided, or are you proposing it?",
    fStatusRecorded: "Decided - this is what we are doing",
    fStatusProposed: "Proposed - waiting for somebody to agree",
    fStatusHint:
      "A proposal gets no revisit date. Nothing has been decided yet, so there is nothing to come back to.",
    fBecause: "Why. In a year this is the only field that matters",
    fRejected: "What was considered and not chosen",
    fConsulted: "Who was consulted",
    /*
     * Only people Tend already knows, and the list is the enforcement rather
     * than a warning. Adding somebody to the roster just to name them here
     * would be worse than leaving it empty: everyone on the roster is counted
     * by the attention signals.
     */
    fConsultedHint:
      "Anybody not on this list belongs in the reason instead - adding them to the roster to name " +
      "them here would make every attention signal noisier.",
    fConsultedHintEmpty: "Nobody on the roster yet, so name whoever it was in the reason instead.",
    fRevisit: "Come back to it in how many days",
    fRevisitHint:
      "A date is a poor stand-in for a real trigger. When what should bring it back is an event - " +
      "the next project of a certain kind, a new hire - write the event into the reason and treat " +
      "this as the backstop that catches it if the event passes unnoticed.",

    /* Recording one. */
    addTitle: "Record a decision",
    addIntro:
      "The revisit date is the field that makes this a tool. A decision that comes back to you is " +
      "one you can make today instead of gathering information you will not use.",
    addConfirm: "Record it",

    /* Reversing, dropping, editing. */
    reverseTitle: "Reverse it?",
    reverseBody:
      "It stays in the log as reversed, and stops coming back. The reasoning is still readable, " +
      "which is the point of keeping it.",
    reverseConfirm: "Reverse it",
    dropTitle: "Not a decision?",
    dropBody:
      "The proposal is removed and nothing else changes. Turning one down is information too - it " +
      "says the reading was wrong.",
    dropConfirm: "Remove it",
    editTitle: "Edit",
    editConfirm: "Save"
  },

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
