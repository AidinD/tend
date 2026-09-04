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
  now: {
    readFailedTitle: "Kunde inte läsa datan",

    /* The quiet day, which is the design rather than a gap. */
    quietTitle: "Inget behöver dig",
    quietSub:
      "Varje takt ligger inom sitt intervall, inget löfte åldras och ingen fråga är aktuell. " +
      "Den här sidan är tänkt att vara tom de flesta dagarna.",
    quietEmpty: "När något släpar efter dyker det upp här och ingen annanstans.",

    /*
     * The name it waited for. It has been "Now" and then "Where things stand",
     * which were both stand-ins - the screen has been called Läget since the
     * brief was written.
     */
    title: "Läget",
    sub: "Bara det som avviker. Allt som ligger i fas håller sig ur vägen.",

    /*
     * The roster as tiles, in two sections rather than one, because they
     * answer different questions. The grid is the people he is accountable for
     * and it owns the vertical space; the strips are everybody else, and they
     * exist so the page can say "and nothing here needs you" in one line.
     *
     * Which relationship types are in which cluster is declared in
     * `cadence.js`, because that is a fact about the domain. These are only
     * the names - and each strip carries a line saying what the cluster IS,
     * since "Sidoordnade" alone does not say why those four share one line
     * while two people have a grid to themselves.
     */
    teamHead: "Mitt team",
    teamSub: "De du ansvarar för. Var var och en står, inte vad som är sent.",
    aroundHead: "Runt omkring",
    aroundSub: "Alla andra, en rad per sorts relation.",

    groupMandate: "Mitt team",
    groupNoChannel: "Leder utan kanal",
    groupNoChannelNote: "Du ser vad de gör och har ingen formell väg att agera på det.",
    groupPeers: "Sidoordnade",
    groupPeersNote: "Ingen bestämmanderätt någon väg, så inflytandet vilar helt på goodwill.",
    groupOutward: "Uppåt och utåt",
    groupOutwardNote: "Inte dina att leda. Du är skyldig dem en bild, inte ett samtal.",

    /*
     * A tile's one line, per kind from `tiles.js`. Every kind in every set is
     * reachable and a test walks all of them from real rows, because an
     * unhandled kind renders as a blank tile about a named colleague.
     *
     * Mitt team first. That set is about where somebody's development stands,
     * because the cadences have their own section as cards above - saying both
     * on the same tile is what made the first version of this page repeat
     * itself.
     */
    tileAway: "Borta. Inget förväntas.",
    tileLeaving: "Slutar. Allt gäller fram till sista dagen.",
    /** @param {string} duty */
    tileNeedsYou: (duty) => `${duty} behöver dig nu.`,
    tileNoDirection: "Ingen riktning öppen.",
    tileDirectionUntested: "En riktning, inte prövad på dem än.",
    tileDirectionShowing: "En riktning, och den syns.",
    tilePlanNotStarted: "En plan, inte klar att starta.",
    tilePlanRunning: "En plan, pågår.",

    /* Leder utan kanal. Whether feedback is actually reaching them. */
    /** @param {string} duty */
    tileNeverSpoken: (duty) => `${duty} har aldrig blivit av.`,
    /** @param {string} duty */
    tileFeedbackOverdue: (duty) => `${duty} är försenad.`,
    tileInStep: "I fas.",

    /*
     * Peers. The only set that says a number, because "over" without a count
     * says nothing about a relationship with no duty behind it.
     */
    /** @param {number} days */
    tileDaysOver: (days) => `${days} dagar över.`,

    /* Uppåt och utåt. Entirely about what he owes them. */
    /** @param {number} n */
    tilePromisesOwed: (n) =>
      n === 1 ? "Du är skyldig dem en sak." : `Du är skyldig dem ${n} saker.`,
    tileQuestionToAsk: "En fråga att ställa.",
    tileUpdateOverdue: "En uppdatering är försenad.",
    tileUpdatedRecently: "Uppdaterad nyligen.",

    /*
     * The cluster and the vocabulary disagreed. Not a phrase about the person -
     * naming the fault is the only honest thing a tile can say when the rule
     * could not decide what it was looking at.
     */
    /** @param {string} cluster */
    tileUnknownCluster: (cluster) => `Ingen vokabulär för "${cluster}".`,

    /* The strip's clusters collapse to a count when nobody in them needs you. */
    /** @param {number} n */
    groupAllInStep: (n) => `${n} i fas`,
    rosterEmpty: "Ingen i den här gruppen.",

    /*
     * Duties the role map has proposed and nobody has answered.
     *
     * On this page as decisions rather than as a notification, because a
     * proposal does nothing until it is accepted - and four of them sitting
     * unanswered is the app asking a question it has already asked.
     */
    proposedHead: "Väntar på ditt svar",
    proposedSub:
      "Föreslagna plikter gör ingenting förrän du accepterar dem. Fram till dess bevakar appen " +
      "inte det de beskriver.",
    /** @param {string} every */
    proposedEvery: (every) => `var ${every}`,
    proposedAccept: "Acceptera",
    proposedDecline: "Inte mitt jobb",
    proposedOpen: "Öppna rollkartan",
    proposedAcceptedToast: "Accepterad.",
    proposedDeclinedToast: "Avvisad.",

    /*
     * His own aims, on this page because they are the only thing here that is
     * about him. Ships empty on purpose - the goals pass happens after this
     * screen exists - so the empty state has to be a real sentence rather than
     * a dash.
     */
    aimsHead: "Vad jag jobbar med hos mig själv",
    aimsEmpty:
      "Inget satt. Ett mål säger vad du vill kunna göra och hur du kommer att veta - och två är " +
      "gränsen, för att jobba på fyra sidor av sitt eget uppträdande samtidigt är att jobba på " +
      "ingen.",
    aimsSet: "Sätt ett mål",
    aimsOpen: "Öppna reflektionen",
    /** @param {string} source */
    aimSource: (source) => `hur du vet: ${source}`,

    /*
     * His own action points.
     *
     * The block the Mine option feeds. Empty until he files something that
     * way, and the empty state has to say what would put something here -
     * otherwise it reads as a feature that does not work.
     */
    myActionsHead: "Mina action points",
    myActionsEmpty:
      "Inget arkiverat som ditt eget än. När en delad mötesanteckning ger något som är ditt " +
      "arbete snarare än ett löfte till någon, lägg det som ditt och det landar här.",
    /** @param {string} note */
    myActionFrom: (note) => `från "${note}"`,
    myActionDone: "Klar",
    myActionDoneToast: "Klar.",

    /* What he owes people, which is the other half of what needs him. */
    owedHead: "Vad du sa att du skulle göra",
    /** @param {string} name @param {string} open */
    owedLine: (name, open) => `till ${name}, öppet ${open}`,

    /*
     * No focus running. One line rather than a card: it is an offer, not a
     * deviation, and it must not look like something is wrong.
     *
     * It exists because Focus left the rail. Before that, "no focus" needed no
     * affordance here - you went to the Focus page. Now this is the only way in
     * apart from Ctrl+K, and a feature reachable only from a command palette
     * is a feature he will forget he has.
     */
    noFocus: "Inget fokus pågår.",
    noFocusStart: "Starta ett",

    /* The focus strip. */
    focusEyebrow: "Nuvarande fokus",
    /*
     * The count comes out as parts so the plural works. English got away with
     * "nudge(s)"; Swedish has no equivalent shortcut and the parenthesis reads
     * as a bug.
     */
    /** @param {number} held */
    focusHeld: (held) =>
      `${held} ${held === 1 ? "påminnelse" : "påminnelser"} hålls tillbaka. Inget kritiskt ` +
      `ligger någonsin där.`,
    focusSettings: "Fokusinställningar",

    /* The groups. */
    needsYouGroup: "Kräver dig",
    revisitsGroup: "Beslut att se på igen",
    questionsGroup: "Frågor",
    nudgeGroup: "Värt en påminnelse",
    /** @param {number} n */
    softerHeld: (n) =>
      `${n} mjukare ${n === 1 ? "påminnelse" : "påminnelser"} hålls tillbaka medan fokuset ` +
      `pågår.`,

    /* A decision asking to be looked at again. */
    /** @param {string} by */
    decisionDue: (by) => `beslut aktuellt ${by}`,
    dueNow: "nu",
    decisionSrc: "Du satte det här datumet när du bestämde.",
    stillHolds: "Det gäller fortfarande",
    openLog: "Öppna loggen",

    /*
     * Patterns in his own month, at the bottom rather than the top. They are not
     * deviations from a duty and nothing is late because of them, so they must
     * not compete with what is.
     */
    mineHead: "Min månad",
    mineSub: "Om mig, inte om dem. Inget här är sent.",

    /* Nobody active, but not nobody. A state that can be reversed rather than a
       setup step that was never done. */
    archivedSub:
      "Ingen är aktiv just nu - alla är arkiverade, och varje 1-1, löfte och beslut om dem " +
      "ligger exakt där det låg. Ta tillbaka vem som helst från den arkiverade gruppen under " +
      "Personer, eller börja om genom att lägga till någon ny.",
    archivedEmpty:
      "Inget har tagits bort. När någon är aktiv igen dyker det som släpar efter på dem upp här.",

    /* First run. */
    firstTitle: "Inget att bevaka än",
    firstSub:
      "Tend behöver två saker innan den kan säga dig något: personerna du ansvarar för, och " +
      "vad jobbet kräver av dig.",
    firstPeopleTitle: "1. Lägg till personerna",
    firstPeopleWhy:
      "Alla du leder eller ansvarar för, och de andra ledarna du jobbar vid sidan av. Sätt " +
      "datumet då varje relation började, inte idag - annars ser någon du inte pratat med på " +
      "flera månader ut att ligga perfekt i fas.",
    firstPeopleNote: "Inget lämnar den här maskinen",
    firstPeopleButton: "Lägg till någon",
    firstRoleTitle: "2. Börja med rollkartan",
    firstRoleWhy:
      "Tre plikter du redan utövar, fem föreslagna ur ledarskapsläsningen, och tre månadsfrågor. " +
      "Förslagen gör ingenting förrän du accepterar dem, och du kan ändra allt efteråt.",
    firstRoleNote: "Du kan ändra eller ta bort varenda en av dem",
    firstRoleButton: "Sätt upp rollkartan",
    firstRoleLook: "Titta först",

    /* One card. */
    softened: "Faktiskt kritiskt. Fokuset dämpar bara hur det läses.",
    logProject: "Logga en titt",
    logWorkstream: "Logga en genomgång",
    logStake: "Logga en uppdatering",
    logPerson: "Logga kontakt",
    open: "Öppna",
    done: "Klar",
    drop: "Släpp",
    setLevelButton: "Sätt nivån",
    fileButton: "Säg vems de är",
    guarded: " · skyddad",

    /* A monthly question. The answer is usually no, and saying so is the point. */
    neverAsked: "aldrig frågad",
    questionSrc: "Månadskoll. Svaret är oftast nej",
    answerNo: "Nej",
    answerYes: "Ja, och så här såg jag det",

    /* Filing commitments out of one shared note. */
    fileTitle: "Vems är de här?",
    /** @param {number} n @param {string} note */
    fileIntro: (n, note) =>
      `${n} ${n === 1 ? "sak" : "saker"} flaggades i "${note}". ` +
      "Flera personer var med, så Tend kan inte veta vems var och en är - och att lägga en på " +
      "allihop skulle göra en skyldighet till flera. Allt som lämnas som inte-än stannar i kön.",
    fileNotYet: "Inte än - lämna den i kön",
    /** @param {string} name */
    filePromiseTo: (name) => `Ett löfte till ${name}`,
    /*
     * The third answer, and the one whose absence cost him eleven tracked
     * action points from one meeting: a shared note can only offer the other
     * attendees, because he is not a person in his own roster.
     *
     * Worded as "mine" rather than as a name, because naming himself in the
     * list would make him a person in it - and then every cadence, every duty
     * and every attention signal would have to decide what it means to be
     * behind on yourself.
     */
    fileMine: "Min - mitt eget arbete, inget löfte",

    fileNobody: "Ingens löfte - släng den",
    fileConfirm: "Lägg dem",
    /** @param {number} n */
    filedCount: (n) => `${n} lagda`,
    /** @param {number} n */
    discardedCount: (n) => `${n} slängda`,

    /* Logging contact, where the subject decides the wording and the kinds. */
    logTitlePerson: "Logga kontakt",
    logTitleOther: "Logga vad du tittade på",
    logIntroPerson:
      "Sorten avgör vilken takt det här uppfyller. Att höra om någon från deras ledare är inte " +
      "samma sak som att ha pratat med dem, och Tend håller dem åtskilda med flit.",
    logIntroOther:
      "Bara de sorter som kan handla om den här typen av ämne erbjuds. Resten skulle registrera " +
      "något som inte uppfyller någon takt.",
    logKindLabel: "Vilken sort",
    logNoteLabel: "En rad, frivilligt",
    logNotePlaceholder: "Vad det handlade om",
    logConfirm: "Logga",
    loggedToast: "Loggat.",

    closedToast: "Stängt.",
    dropTitle: "Släppa det här löftet?",
    dropBody:
      "Det slutar bevakas. Använd det när du bestämt dig för att inte göra det, inte när du " +
      "har gjort det.",
    dropConfirm: "Släpp det",
    droppedToast: "Släppt.",
    seededToast: "Rollkartan uppsatt.",

    answeredNoToast: "Noterat. Tillbaka om en månad.",
    yesTitle: "Vad såg du?",
    yesIntro:
      "Ett bart ja är till ingen nytta om tre månader. En eller två konkreta meningar räcker, " +
      "och den här frågan kommer tillbaka om en vecka i stället för om en månad.",
    yesLabel: "Vad du såg",
    yesConfirm: "Registrera",
    recordedToast: "Registrerat."
  },

  focus: {
    /* Nothing running. */
    noneTitle: "Inget fokus pågår",
    noneSub:
      "Ett fokus är för när en sak verkligen måste komma först en tid. Tend " +
      "tänjer de mjukare trösklarna så att de slutar konkurrera med den, och " +
      "säger efteråt vad det kostade.",
    contractTitle: "Vad ett fokus gör, och inte gör",
    contractDoes:
      "<strong>Gör:</strong> tänjer trösklarna på mjuka påminnelser, slutar " +
      "visa föreslagna plikter, och räknar allt det håller tillbaka så att du " +
      "alltid vet hur mycket som undanhålls dig.",
    contractNever:
      "<strong>Aldrig:</strong> döljer något kritiskt, rör en skyddad plikt, " +
      "eller låter ett löfte åldras i tysthet. Allt det tänjt går tillbaka på " +
      "slutdatumet oavsett om arbetet är klart, så ett oavslutat fokus blir ett " +
      "beslut att förnya i stället för en eftersläpning ingen märkte.",
    endEarly: "Du kan avsluta det tidigt när du vill",
    startButton: "Starta ett fokus",

    /* One running. */
    replace: "Byt ut",
    endButton: "Avsluta",
    overrunTitle: "Förbi sitt slutdatum",
    overrunWhy:
      "Varje tänjd tröskel är redan tillbaka på normalt, så inget dämpas. " +
      "Förnya det med ett nytt datum, eller stäng det.",
    budgetLabel: "Budget",
    budgetNote: "av veckan",
    heldBackLabel: "Hålls tillbaka nu",
    heldBackNote: "mjuka påminnelser, inget kritiskt",
    thresholdsLabel: "Trösklar",
    thresholdsNormal: "normala",
    thresholdsNote: "bara på oskyddade plikter",
    costTitle: "Vad det har kostat",

    /* The guarded list, which is the promise the feature rests on. */
    guardedTitle: "Skyddade",
    guardedNone:
      "Inget är skyddat. Markera en plikt som skyddad i rollkartan och ett " +
      "fokus kan aldrig dämpa den.",
    guardedSomeTitle: "Skyddade, aldrig dämpade",
    /** @param {string} every */
    guardedEvery: (every) => `var ${every}`,
    guardedPill: "hålls",

    /* Starting one. */
    startTitle: "Starta ett fokus",
    startIntro:
      "Tend fångar hur långt efter saker ligger just nu, så att den kan säga " +
      "dig senare vad det här kostade.",
    startNameLabel: "Vad som måste komma först",
    startNamePlaceholder: "Få ut den nya onboardingen",
    startEndsLabel: "Till när",
    startEndsHint:
      "Allt går tillbaka på det här datumet oavsett om arbetet är klart. Det är " +
      "hela poängen: ett oavslutat fokus blir ett beslut, inte en eftersläpning.",
    startBudgetLabel: "Andel av veckan, procent",
    startBudgetHint: "Används bara för att visa dig veckans form. Den tvingar ingenting.",
    startConfirm: "Starta",
    startedToast: "Fokus startat.",

    /* Ending one. */
    endTitle: "Avsluta fokuset?",
    endBody:
      "Varje tänjd tröskel går tillbaka på normalt omedelbart, så allt som " +
      "släpat efter i tysthet kommer fram.",
    endConfirm: "Avsluta",
    endedToast: "Avslutat."
  },

  prep: {
    /*
     * The questions he did not ask last time, read out of the end of the last
     * note. First on the card, above what he promised, because it is the only
     * block here he cannot reconstruct from memory on the way to the room -
     * a broken promise he remembers, an unasked question is exactly the thing
     * that gets lost.
     *
     * The provenance line is not decoration. These are his own words from a
     * note, not something Tend worked out, and the card has to say which - the
     * same rule as labelling anything a model produced.
     */
    findOutTitle: "Att ta reda på",
    /** @param {string} note */
    findOutFrom: (note) => `Dina egna frågor i slutet av "${note}".`,
    /** @param {number} n */
    findOutMore: (n) => `och ${n} fler i anteckningen`,
    readFailedTitle: "Kunde inte läsa datan",
    /*
     * The name it waited for, like Läget. It was "Prep" through the whole
     * build.
     */
    title: "Inför",
    sub:
      "Vem som släpar efter eller är skyldig något, med vad de äger, vad som är öppet på tavlan, " +
      "och det senaste du skrev. Värst först, och bara några få: det här är tänkt att läsas och " +
      "bli klart.",
    empty:
      "Ingen ligger efter och inget är skyldigt. Den här sidan är tom de flesta dagarna, vilket " +
      "är hela poängen med den.",
    /** @param {number} n */
    dropped: (n) => `${n} fler ligger efter men inte värst, hållna tillbaka så att sidan tar slut.`,

    /* What he is practising, once for the page rather than on every card. */
    practiceNoneTitle: "Inget att öva på",
    practiceTitle: "Vad du jobbar på",
    practiceWhy:
      "Flaggat i Nib, läst därifrån varje gång. Sänk flaggan när det börjar komma naturligt och " +
      "ta upp nästa - tidpunkten är din, och Tend sätter med flit inget datum på det.",
    practiceTodoTitle: "Och en sak du sa att du skulle göra",
    /** @param {string} noteTitle */
    practiceWrote: (noteTitle) => `du skrev det här ${noteTitle}`,

    /*
     * Where the card could not reach, said out loud. A card with no open work
     * looks identical whether the board was empty or unreachable, and an
     * integration that fails quietly sits there for weeks looking like a calm
     * week.
     */
    sourceJot: "Jot-tavlan",
    sourceNib: "Nibs anteckningar",
    /** @param {string} which */
    sourcesMissing: (which) =>
      `Kunde inte läsa ${which}, så de delarna av varje kort är blanka snarare än tomma. ` +
      `Kolla datamapparna under `,
    sourcesSettings: "Inställningar",

    /* One person's card. */
    /** @param {string} why @param {string} lastSpoke */
    cardWhy: (why, lastSpoke) => `${why}. Pratade senast ${lastSpoke}.`,
    promisedTitle: "Du lovade dem",
    /** @param {string} openFor */
    promisedOpen: (openFor) => `öppet ${openFor}`,
    theyOwnTitle: "De äger",
    /** @param {string} mandate @param {string} reviewed */
    theyOwnMeta: (mandate, reviewed) => `${mandate} &middot; genomgånget ${reviewed}`,
    openWorkTitle: "Öppet på tavlan",
    jotUnreadable: "Jot kunde inte läsas.",
    /** @param {string} category @param {string} status @param {boolean} named */
    openWorkMeta: (category, status, named) =>
      `${category} &middot; ${status}${named ? " &middot; matchat på deras namn" : ""}`,
    lastWroteTitle: "Du skrev senast",
    footNote: "Allt här finns redan i Tend, Jot eller Nib.",
    /** @param {string} person */
    openPerson: (person) => `Öppna ${person}`,

    /*
     * Each topic carries its own reason, and that is not padding: the whole set
     * is questions whose value is not obvious in the moment, and a question you
     * do not believe in is one you skip.
     */
    raisingTitle: "Värt att ta upp",
    raisedButton: "Tog upp det",
    /** @param {string} when */
    lastRaised: (when) => `Togs upp senast ${when}.`,

    /* The model buttons, or a disabled pair that says why. */
    draftingOff: "Utkast är av - ingen Claude Code på den här maskinen.",
    drafting: "Skriver utkast…",
    draftButton: "Skriv ett utkast",
    reading: "Läser…",
    readNoteButton: "Läs den anteckningen"
  },

  people: {
    title: "People",
    subPrivate: "Who they are, and what you have said you would do. Nothing here is on a schedule.",
    subWork: "Grouped by the relationship, not the org chart.",
    addButton: "Add someone",

    /* "Nobody yet" and "everybody is archived" are different facts, and after a
       bulk archive the second is the common one. */
    emptyArchived:
      "Nobody active. Everybody here is archived - open the group below to bring anyone back, or " +
      "add somebody new.",
    emptyPrivate:
      "Nobody here yet. Adding somebody gives you a place to put what you promised them - and " +
      "nothing else, because nothing outside work runs on a cadence.",
    emptyWork: "Nobody here yet. Add the people you lead or manage, and the leads you work beside.",

    /* A roster row's right-hand side. */
    awayNothing: "nothing expected while they are away",
    leftNothing: "history kept, nothing expected",
    noDuty: "no duty applies",

    archivedGroup: "Archived",
    /** @param {string} date */
    archivedOn: (date) => `archived ${date}`,
    view: "View",
    unarchive: "Unarchive",

    notFoundTitle: "Not found",
    allPeople: "All people",
    back: "← All people",
    edit: "Edit",
    notRight: "Not right",
    remove: "Remove",

    /* A folded run of identical history rows. */
    /** @param {number} n */
    identical: (n) => `${n} identical`,

    /*
     * What the rows amount to, counted in the service over the whole set rather
     * than the capped twenty rendered above.
     */
    noContactYet: "No contact recorded yet",
    conversationOne: "conversation",
    conversationMany: "conversations",
    /** @param {number} n @param {string} word */
    countOf: (n, word) => `${n} ${word}`,
    /** @param {string} month */
    since: (month) => `since ${month}`,
    /** @param {number} days @param {string} word */
    roughlyEvery: (days, word) => `roughly every ${days} ${word}`,
    dayOne: "day",
    dayMany: "days",
    /** @param {string} words */
    lastAt: (words) => `last ${words}`,

    /* A cancellation, kept legible as a different thing from a conversation. */
    /** @param {string} kind @param {string} why */
    didNotHappen: (kind, why) => `<strong>${kind}</strong> did not happen${why}`,
    /** @param {string} why */
    skipWhy: (why) => ` - ${why}`,
    /** @param {string} kind */
    skipWhat: (kind) => `${kind} that did not happen`,

    /* Moments, and the people also in them. */
    /** @param {string} who */
    alsoThere: (who) => `with ${who}`,

    /* The action row on a person's page. */
    logContactButton: "Log contact",
    logSkipButton: "It did not happen",
    logMomentButton: "Something happened",
    linkButton: "Link something",
    observationButton: "Record an observation",
    readingNotes: "Reading notes…",
    themesButton: "What keeps coming up",

    /* The blocks, in the order they answer a question about somebody. */
    cadencesBlock: "Cadences",
    cadencesNone: "No duty in the role map applies to this relationship type.",
    promisesBlock: "Open promises",
    promisesNone: "Nothing outstanding.",
    observationsBlock: "Observations",
    observationsNone: "Nothing recorded. This is what a review conversation is built from.",
    historyBlock: "Contact history",
    skippedBlock: "Booked and did not happen",
    linkedBlock: "Linked",
    linkedNone:
      "Nothing linked. Prepared notes and anything else that lives outside Tend can be pointed " +
      "at from here.",
    momentsBlock: "Moments",
    momentsNone:
      "Nothing yet. One thing that happened and your own part in it - which is the half you can " +
      "change, and the only half worth keeping.",

    /* Archiving, in its own block because it is reversible and Remove is not. */
    /** @param {string} date */
    archivedNote: (date) =>
      `Archived on ${date}. They stop appearing in Now, prep, attention nudges and duty ` +
      `cadences - everything already on this page stays exactly as it is.`,
    /** @param {string} name */
    unarchiveNamed: (name) => `Unarchive ${name}`,
    /** @param {string} name */
    archiveNamed: (name) => `Archive ${name}`,
    /** @param {string} name */
    removeNamed: (name) => `Remove ${name}`,

    /* Adding somebody. */
    addTitle: "Add someone",
    /*
     * No mention of duties in the private half, because there are none. The
     * relationship there is a label: it groups the list and sits on their page,
     * and nothing is derived from it. Saying so is the difference between a
     * field somebody answers carefully and one they answer wrong on purpose.
     */
    addIntroPrivate: "Who they are, for your own reference. Nothing is scheduled from it.",
    addIntroWork: "The relationship type decides which duties apply to them.",
    nameLabel: "Name",
    namePlaceholderPrivate: "What you call them",
    namePlaceholderWork: "Their full name",
    relationPrivate: "Who they are",
    relationWork: "How you relate to them",
    sinceLabel: "Since when",
    addSinceHint:
      "When the relationship started, not today. Leave it as today for someone who just joined; " +
      "set it back for someone you have had for months, or Tend will think you are perfectly in " +
      "step with them.",
    add: "Add",
    /** @param {string} name */
    addedNamed: (name) => `${name} added.`,

    /* Taking a moment back. */
    unlogMomentTitle: "Take it back?",
    /** @param {string} what */
    unlogMomentBody: (what) => `"${what}" is removed. The log keeps the history; the page stops showing it.`,
    removedToast: "Removed.",

    /* A cancellation, recorded - and it satisfies nothing. */
    skipTitle: "What did not happen?",
    skipIntro:
      "Recorded, and it satisfies nothing - the conversation still has not taken place, so " +
      "the clock keeps running. The point is the difference between never having booked it " +
      "and having cancelled it three times, which contact alone cannot show.",
    skipKindLabel: "What it would have been",
    skipWhyLabel: "Why, in a line",
    skipWhyPlaceholder: "Release week, moved it myself for the third time",
    skipWhyHint:
      'Your own words rather than a category. The difference between "he was ill" and ' +
      '"I moved it again" is the whole reason to write it down.',
    skipWhenLabel: "When it should have been",
    recordIt: "Record it",
    recordedToast: "Recorded.",

    takeBackTitle: "Take this back?",
    /** @param {string} what */
    unlogSkipBody: (what) =>
      `"${what}" stops being on record. Nothing else changes - a skip never satisfied anything.`,
    /** @param {string} what */
    unlogContactBody: (what) =>
      `"${what}" stops counting, so whatever cadence it satisfied goes back to where it was. The ` +
      `event stays in the log - nothing here is ever really deleted - it just stops being evidence.`,
    takeItBack: "Take it back",
    takenBackToast: "Taken back.",

    /* Editing. */
    /** @param {string} name */
    editTitle: (name) => `Edit ${name}`,
    editIntro:
      "Their history comes with them whatever you change here - everything that points at " +
      "somebody holds their id, so the name is only what is shown and what Ctrl+K matches.",
    editSinceHint:
      "When the relationship started. Every cadence measures from here until there is " +
      "contact to measure from instead, so a placeholder puts somebody months behind on " +
      "their first day - or perfectly in step with somebody you have never spoken to.",
    awayLabel: "Away until",
    awayHint:
      "Parental leave, a sabbatical, a long illness. Nothing is expected of you while " +
      "they are away, and the clock restarts from the day they are back rather than from " +
      "the last time you spoke. Clear it if they return early.",
    leftLabel: "Last day",
    leftHint:
      "Set it as soon as you know it. Everything holds until that day - a promise to " +
      "somebody leaving next week is exactly the promise to keep - and after it their " +
      "cadences go quiet while the whole history stays. Better than removing them.",
    save: "Save",
    updatedToast: "Updated.",

    /* Logging contact. A second-hand report is not having spoken to them. */
    logTitle: "Log contact",
    logIntro:
      "The kind decides which cadence this satisfies. A second-hand report does not count as " +
      "having spoken to them.",
    logKindLabel: "What kind",
    logNoteLabel: "One line, optional",
    logNotePlaceholder: "What it was about",
    when: "When",
    logWhenHint: "Backdate it if you are catching up.",
    logIt: "Log it",
    loggedToast: "Logged.",

    /* A promise. When unsure, log it. */
    promiseTitle: "Something you promised",
    promiseIntro:
      "When you are not sure it counts, log it. A false one costs a click; a missed one costs " +
      "trust with a real person.",
    promiseTextLabel: "What you said you would do",
    promiseTextPlaceholder: "Check with Nina about the conference",
    promiseDueLabel: "By when, optional",
    promiseMadeLabel: "When you said it",
    promiseMadeHint:
      "Backdate it and it ages correctly. Anything open past two weeks escalates whatever else " +
      "is going on.",

    /* A link: the address, never a copy. */
    linkTitle: "Link something",
    linkIntro:
      "The address is stored, never a copy - the same arrangement as the Nib pointer. Every " +
      "row shows how old it is, because prepared notes stop being current once the " +
      "conversation happens and nothing here expires on its own.",
    linkUrlLabel: "Address",
    linkUrlPlaceholder: "https://",
    linkTitleLabel: "What it is",
    linkTitlePlaceholder: "Prep for the next 1-1",
    linkNoteLabel: "Why, if it is not obvious",
    linkConfirm: "Link it",
    linkedToast: "Linked.",
    /** @param {string} name */
    unlinkTitle: (name) => `Remove the link to ${name}?`,
    unlinkBody: "Only the pointer goes. Whatever it pointed at is untouched.",

    /* An observation, so a review is built on notes rather than on memory. */
    observationTitle: "Record an observation",
    observationIntro:
      "What they delivered, how they handled something. Written down now so a review is built " +
      "on notes rather than on memory of the last three weeks.",
    observationTextLabel: "What happened",
    observationAreaLabel: "Tag, optional",
    observationAreaPlaceholder: "code, ownership, communication",

    closedToast: "Closed.",

    /* Archiving is reversible, so it gets its own gentler dialog. */
    /** @param {string} name */
    archiveTitle: (name) => `Archive ${name}?`,
    archiveBody:
      "They stop appearing in Now, prep, attention nudges and duty cadences. Every 1-1, promise, " +
      "decision and growth direction about them stays exactly as it is and can be looked at " +
      "again. " +
      "Fully reversible - unarchive them any time from their page.",
    archive: "Archive",
    /** @param {string} name */
    archivedToast: (name) => `${name} archived.`,
    /** @param {string} name */
    unarchivedToast: (name) => `${name} unarchived.`,
    /** @param {string} name */
    removeTitle: (name) => `Remove ${name}?`,
    removeBody:
      "They stop appearing and their cadences stop counting. Nothing is destroyed - the history " +
      "stays in the log and can be recovered - but the app will act as though they were never " +
      "your responsibility.",
    /** @param {string} name */
    removedNamed: (name) => `${name} removed.`
  },

  growth: {
    /*
     * The endings, written out rather than derived: `open` is not an ending, and
     * each of the three needs a sentence saying what choosing it means. Every
     * option carries its consequence, the way the delegation levels do.
     */
    endingReached: "Reached - they can do it now",
    endingDropped: "Let go - not the direction after all",
    endingExpectation:
      "Stated as an expectation - the job needs it whether they want it or not",

    /* The block on a person's page. */
    blockTitle: "Growing",
    openButton: "Open a direction",
    empty:
      "Nothing yet. A direction goes here when there is one - not for everybody, and not because " +
      "the calendar says it is that time of year.",
    /*
     * Said, not enforced. Attention is the scarce thing this tool exists to be
     * honest about, and a limit imposed on his judgement would be software
     * deciding how many people he is allowed to develop at once.
     */
    /** @param {number} live */
    tooMany: (live) =>
      `${live} live at once. Two is about what anybody can actually hold - the rest tend to ` +
      `become paperwork.`,

    /* One thread. */
    /** @param {number} talks @param {number} observations @param {string} last */
    counts: (talks, observations, last) =>
      `discussed ${talks}×, seen ${observations}× &middot; last talked ${last}`,
    theirWords: "Their words",
    through: "Through",
    iWillSee: "I will see",
    imPuttingIn: "I am putting in",
    myGuess: "My guess before asking",
    ifNothingChanges: "If nothing changes",
    told: "Told",
    endedBecause: "Ended because",
    /** @param {string} label @param {string} value */
    detailLine: (label, value) => `${label}: ${value}`,
    /** @param {string} what */
    stillToPrepare: (what) => `Still to prepare: ${what}`,
    /** @param {string} what */
    stillToAsk: (what) => `Still to ask them: ${what}`,

    /*
     * Removal belongs to the thread that should never have existed, so it is
     * offered while nothing has happened and withdrawn the moment something has.
     */
    openedByMistake: "Opened by mistake",
    afterConversation: "After the conversation",
    itCameUp: "It came up",
    iSawIt: "I saw it",
    prepare: "Prepare",
    endIt: "End it",
    iHaveToldThem: "I have told them",
    reword: "Reword",

    /* The compact version on a prep card, read minutes before a conversation. */
    /** @param {string} marker */
    youWillSee: (marker) => `You will see: ${marker}`,
    /** @param {number} talks @param {number} observations @param {string} last */
    cardCounts: (talks, observations, last) =>
      `Discussed ${talks}×, seen ${observations}× &middot; last talked ${last}.`,
    /*
     * Shown only on a stalled thread. The stall question asks whether the aim is
     * wrong or the support is missing; the second half is something he already
     * wrote down, and the card was posing the question without the answer next
     * to it. An empty offering is not a gap - it IS the answer.
     */
    stalledNoOffering:
      "You never wrote down what you were putting in. That is one answer to the question above.",
    /** @param {string} offering */
    stalledOffering: (offering) => `You said you would put in: ${offering}`,

    /* Stage A: what he can work out alone, and what he is prepared to put in. */
    fAim: "What you think the direction is, in one sentence",
    fAimPlaceholder: "Runs the design review without me in the room",
    fAimHint:
      "Yours, before you have asked. What they will be able to DO, not an area to improve in - " +
      'their own answer comes later and is kept beside this. Everything else about this ' +
      'direction can wait until you use "Prepare" on the card.',
    fDriver: "Do they want this, or does the job need it?",
    fDriverHint:
      "Two different instruments. The development one used on a performance gap reads as a " +
      "disciplinary process with a smile. Not knowing yet is a real answer.",
    fNeed: "Whose need is it?",
    fNeedPlaceholder: "The team stalls whenever I am away",
    fNeedHint: "Concretely enough that you could say it out loud to them.",
    fIfNothing: "What happens if nothing changes?",
    fIfNothingHint:
      'If the honest answer is nothing, this is a wish rather than a need. "You stay where you ' +
      'are" is a legitimate answer.',
    fAlreadySeen: "What you have already seen them do",
    fAlreadySeenHint:
      "Only what has happened. Empty is itself the finding: no evidence under the direction.",
    fOffering: "What are you putting in?",
    fOfferingPlaceholder: "The architecture review, and I stop writing the migration plan myself",
    fOfferingHint:
      'Cover, a room to be let into, work you stop doing yourself. Write it as done or dated - ' +
      '"I could" is not an offering.',

    /* Stage B: what the conversation returned. */
    fTheirWords: "What they said they want, in their words",
    fTheirWordsHint:
      "Theirs, not a tidied version. A plan in your words is one they will read as yours.",
    fStance: "How did that land against your guess?",
    fAssignment: "Which real work does this happen through?",
    fAssignmentPlaceholder: "Owns the migration end to end",
    fAssignmentHint:
      "Name the assignment, not a skill area. Real stakes move people; courses feel like it.",
    fMarker: "What will you see in three months that you do not see now?",
    fMarkerPlaceholder: "Chairs the review once with me absent",
    fMarkerHint:
      'If you cannot finish that sentence the direction is too vague to follow. "Better ' +
      'communication" is unobservable; "runs it without me" is not.',
    fWhenTalked: "When you talked",
    fWhenTalkedHint: "Logged as a conversation too, unless you have already logged one.",
    fCadence: "How often should it come up?",
    fCadenceHint: "In the one-to-one, never as its own meeting. A separate meeting kills it.",
    fHorizon: "When should the direction itself be questioned?",
    fHorizonHint:
      "Not a deadline. When it passes Tend asks whether this is still the thing.",

    /* Opening one. */
    openTitle: "Open a direction",
    openIntro:
      "One sentence is enough to open it. The rest - whether they want this or the job needs it, " +
      'what you have already seen, what you are putting in - comes later, from "Prepare" on the ' +
      "card, whenever you actually have an answer for it.",
    openConfirm: "Open it",
    openedToast: "Opened.",

    /* Rewording, which is its own concept because the thread is named after it. */
    rewordTitle: "Reword the direction",
    rewordIntro:
      "The card is named after this. Change it once you know what you actually agreed on.",
    rewordAimLabel: "The direction as it stands",
    rewordAimHint:
      "What they will be able to DO. If it describes what you do for them, you will be " +
      "measuring the wrong person.",
    rewordGuessLabel: "What you thought before you asked",
    rewordGuessHint: "Kept as a record, so it can sit next to what they actually said.",
    save: "Save",
    rewordedToast: "Reworded.",

    prepareTitle: "Prepare",
    prepareIntro: "Your side of it. Reopened where you left it rather than asking again.",
    savedToast: "Saved.",

    askedTitle: "After the conversation",
    askedIntro: "What came back. This overwrites nothing you guessed - the guess is kept beside it.",

    /*
     * A declined direction is one of the three normal outcomes, so it is asked
     * about immediately rather than left as a status he has to remember to
     * change. The follow-up is the only question that matters.
     */
    declinedTitle: "They are not interested. Does the job require it anyway?",
    declinedBody:
      "If it does, this stops being development and becomes an expectation - which has to be " +
      'said once, plainly, including what follows if it is not met. "You stay where you are" ' +
      "is a legitimate thing for that to be.\n\nIf it does not, the right move is to let it go " +
      "and tell them you have. Quietly keeping the hope alive is the one option that costs you " +
      "the relationship.",
    declinedConfirm: "The job requires it",
    expectationTitle: "State it as an expectation",
    letGoTitle: "Let it go",
    expectationIntro:
      "Write the expectation as you will say it to them. Clarity about whether, encouragement " +
      "about how.",
    letGoIntro:
      "Write why you let it go. It stays readable, so this cannot become a quiet disappointment " +
      "nobody named.",
    expectationWhy: "The expectation, in your words",
    letGoWhy: "Why you let it go",
    saidLabel: "I have told them",
    saidHint: "Leave it unchecked if you have not yet. Tend will keep asking until you have.",
    recordedToast: "Recorded.",

    talkedTitle: "It came up",
    talkedIntro:
      "This moves the conversation clock and nothing else. Whether they have actually done the " +
      "thing is a separate answer, because the gap between the two counts is the only useful " +
      "reading here.",
    talkedNoteLabel: "One line, optional",
    talkedNotePlaceholder: "Where it stands",
    when: "When",
    logIt: "Log it",
    loggedToast: "Logged.",

    /*
     * The marker seen, and the only right moment to ask who else needs to hear
     * it. Development nobody outside the one-to-one ever sees converts into
     * nothing: no level, no salary, no next assignment.
     */
    observedTitle: "I saw it",
    observedIntro:
      "What you said you would see, actually observed rather than discussed. The only " +
      "evidence in here that any of this is working.",
    observedNoteLabel: "What you saw",
    observedNotePlaceholder: "Chaired the review on the 14th, I said nothing",
    tellLabel: "Who else needs to hear this?",
    tellNobody: "Nobody, it stays between us",
    tellHint:
      "Growth only you two saw converts into nothing. Picking somebody logs it as a promise, so " +
      "it cannot quietly not happen.",
    recordIt: "Record it",
    /** @param {string} name @param {string} said */
    tellPromise: (name, said) => `Tell ${name}: ${said}`,
    /** @param {string} name */
    tellPromiseToast: (name) => `Promise to tell ${name} logged.`,
    them: "them",

    endTitle: "End it",
    endIntro:
      "Every ending here is a legitimate one, including letting it go. Somebody who is content " +
      "where they are and doing solid work is not a problem to be fixed.",
    endHowLabel: "How it ends",
    endWhyLabel: "Why",
    endWhyHint:
      "Kept and readable afterwards. A direction that ends with no reason turns into a mood in " +
      "the " +
      "room six months later that neither of you can name.",
    endSaidHint:
      "Unchecked until you actually have. Letting a direction go silently is worse than either " +
      "pushing or accepting: they still feel the disappointment and never hear that it is over.",
    notedToast: "Noted.",

    /*
     * The removal wording says which fact it asserts rather than which mechanism
     * it runs, and the loss comes first. The old version opened with the
     * reassuring half - the events stay in the log - and put the loss in a
     * subordinate clause, so the sentence a reader took away said nothing was
     * lost.
     */
    removeTitle: "Was this direction never real?",
    /** @param {string} aim */
    removeBody: (aim) =>
      `"${aim}" goes, and stops being readable anywhere - the person's page, a prep card, ` +
      `anything an agent reads. Right for a direction opened against the wrong person or ` +
      `twice ` +
      `by accident.\n\nIf it was real and it is over, close it with "End it" instead. That ` +
      `keeps the direction and the reason it ended, which is what answers "why do we not talk ` +
      `about this any more" next spring.`,
    removeConfirm: "It was never real",
    removedToast: "Removed."
  },

  /*
   * A plan: the second shape beside a direction, and the opposite of one in
   * every way that matters. The wording has to carry that difference, because
   * a direction that quietly reads as a performance plan is the worst version
   * of this conversation - the person believes they are being developed while
   * a decision is being made about them.
   *
   * So: no softening. "Below the bar", "a date with a consequence", "they
   * cannot decline". If the words are gentler than the thing, the app is
   * helping him avoid the conversation.
   */
  plan: {
    blockTitle: "Plan",
    openButton: "Open a plan",
    empty:
      "No plan. A plan is for somebody below the bar - it has a date with a consequence and " +
      "they cannot decline it, which is what makes it a different thing from a direction.",

    /*
     * What state it is in. A draft is not a lesser plan: it is where most
     * plans live for a week or two while he works out what he thinks, so the
     * word has to say "not started" rather than "unfinished".
     */
    draftPill: "not started",
    runningPill: "running",
    /** @param {number} n */
    stillNeeds: (n) => `${n} still to answer before it can start`,

    /*
     * The finding the whole shape was built for. On the real case the answer
     * is no: the person says he has no technical challenge while the plan's
     * premise is a toolchain gap - so the opening sentence assumes something
     * that is not shared.
     */
    premiseWarning:
      "They do not know yet. The plan's opening assumes a shared understanding that does not " +
      "exist, so saying it is the next step rather than starting.",

    /* The fields, as they read on the card. */
    fGap: "What is below the bar",
    fGapHint: "One thing. Three things is a conversation nobody can act on.",
    fTheyKnow: "Do they know?",
    fTheyKnowHint:
      "The second question on purpose, before the goal and before the measure. Everything after " +
      "it is worthless if the answer is no and nothing has been said.",
    fTheyKnowYes: "Yes, I have said it to them",
    fTheyKnowNo: "No, not yet",
    fSaidOutLoud: "What you actually said, in your words",
    fSaidOutLoudHint: "Not a summary. What you said, so you can tell later whether it landed.",
    fGoal: "What you are trying to achieve by running it",
    fGoalHint: "Yours alone. This never appears in what they are given.",
    fDelivery: "The real work it happens through",
    fDeliveryHint: "Real stakes move people; an exercise does not.",
    fMeasure: "What will be true at the end",
    fBaseline: "And what is true now",
    fBaselineHint:
      "Without this the measure means nothing, and the plan ends in an argument about whether " +
      "anything changed.",
    fDue: "The date",
    fDueHint: "A date with a consequence, not a horizon. That is what separates this from a direction.",
    fIfNotMet: "What happens if it is not met",
    fIfNotMetHint:
      "Said in the same conversation, not saved for the end. A consequence nobody stated is one " +
      "that gets sprung on somebody.",
    fHr: "Is HR involved?",
    fHrHint: "Answered before the first conversation. Never after it.",
    fGrowth: "A direction this shares its work with, optional",
    fGrowthHint: "Link rather than duplicate. The same work can serve both.",

    openTitle: "Open a plan",
    openIntro:
      "Fill in what you know. What is missing is what it still needs before it can start - not " +
      "an error, just a plan that is not ready.",
    openConfirm: "Save it",
    openedToast: "Saved.",
    editTitle: "The plan",
    editConfirm: "Save",
    editedToast: "Saved.",

    /* The copy the person is given. */
    copyTitle: "What they are given",
    copyIntro:
      "Five lines, and nothing else. The goal you chose, the HR answer and what you said " +
      "privately all stay yours.",
    copyGap: "What needs to change",
    copyDelivery: "Where it happens",
    copyMeasure: "How we will both know",
    copyDue: "By when",
    copyIfNotMet: "If it is not met",
    copyButton: "Their copy",
    copyClose: "Close",

    /* Ending it. */
    endButton: "End it",
    endTitle: "How did it end?",
    endMet: "Met - they are over the bar",
    endNotMet: "Not met",
    endDropped: "Dropped - not the right instrument after all",
    endHowLabel: "How it ended",
    endWhyLabel: "What decided it",
    endWhyHint:
      "Required for anything but met. A plan that ends with no reason turns into a mood in the " +
      "room six months later that neither of you can name - and this one had a consequence on it.",
    endConfirm: "Record it",
    endedToast: "Recorded."
  },

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
      "It stops appearing in this list, in Now and in attention nudges. Every check-in, " +
      "stakeholder and review already logged against it stays exactly as it is and can be " +
      "looked at again. Fully " +
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
      "Nothing set. An aim says what you want to be able to do and how you will know - the " +
      "record counting it, somebody else saying so, or you logging the occasions. Without one " +
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
      "Something you want to be able to do, and how you will know. Without that it can only " +
      "ever be kept to next time, which is what a development point with nothing to see " +
      "becomes.",
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

  settings: {
    title: "Settings",
    sub: "Where things are kept, and how notes reach the rest of the app.",

    /*
     * How the data directory was decided. Spelled out for all three because
     * "default" is the one that quietly means nobody configured this and the app
     * picked - and the per-user default is the location a helper process can be
     * silently redirected away from, leaving two halves of the same tool on two
     * stores.
     */
    whereFromEnv:
      "Set by the TEND_DATA_DIR environment variable, inherited when this app started.",
    whereFromUserEnv:
      "Set by TEND_DATA_DIR, read from your Windows user environment rather than inherited.",
    whereFromDefault:
      "The default per-user location, because nothing set TEND_DATA_DIR. Set it to keep the data " +
      "somewhere synced, and somewhere a helper process can reach.",

    /* Which half. Two stores rather than one with a filter, because a filter is
       a rule and a rule can be got wrong once. */
    halfGroup: "Which side",
    halfPrivate: "private",
    halfWork: "work",
    privateTitle: "The private side",
    workTitle: "The work side",
    privateWhy:
      "Its own store, read by nothing on the work side and never merged with it. What is " +
      "behind, cadences, duties, prep and a focus budget are not here - contact with somebody " +
      "you live with is " +
      "continuous, so a cadence over it would read as permanently fine and mean nothing.",
    workWhy:
      "Everything the app has always been. People you are responsible for, what you owe them, and " +
      "what has fallen behind.",
    privateNote:
      "What an entry here records is the interaction and your own part in it - not the other " +
      "person's state. That is the half you can change, and it is the only version you could show " +
      "the person it is about.",
    workNote:
      "The private side keeps family and everything outside work in a separate store. Switching " +
      "restarts the app, so it cannot happen while you are half-way through a sentence.",
    backToWork: "Back to work",
    switchToPrivate: "Switch to private",

    /*
     * What one import pass did. Every count is printed, including the ones it
     * used to keep to itself: an importer that withdraws a row and says only how
     * many it added is one whose numbers cannot be reconciled with the page, and
     * the natural reading of an unexplained disappearance is that the tool lost
     * something.
     */
    contactRecordOne: "contact record",
    contactRecordMany: "contact records",
    /** @param {string} counted */
    importAdded: (counted) => `${counted} added`,
    promiseOne: "promise",
    promiseMany: "promises",
    commitmentIsOne: "commitment is",
    commitmentAreMany: "commitments are",
    /** @param {string} counted */
    importWaiting: (counted) =>
      `${counted} waiting for you to say whose they are - they came out of notes several people ` +
      `were in, so copying them onto everybody would turn one obligation into several. They are on Now.`,
    /** @param {string} counted */
    importResolved: (counted) => `${counted} closed, ticked off in Nib.`,
    unassignedCommitmentOne: "unassigned commitment",
    unassignedCommitmentMany: "unassigned commitments",
    /** @param {string} counted */
    importDropped: (counted) => `${counted} dropped, settled in Nib before anybody filed them.`,
    /** @param {string} counted */
    importRetracted: (counted) =>
      `${counted} withdrawn, because the note no longer carries the tag it was counted under.`,
    commitmentOne: "commitment",
    commitmentMany: "commitments",
    /** @param {string} counted */
    importWithdrawn: (counted) =>
      `${counted} withdrawn, because the note no longer flags them. Marked as retracted rather ` +
      `than done, and still on the person's page if you need to look.`,

    /* Nib. The important half: bind a folder to a person, then say which tag
       supplies each kind of contact. */
    nibGroup: "Notes from Nib",
    nibUnreadableTitle: "Nib is not readable",
    nibUnknownReason: "Unknown reason.",
    nibReadOnly: "Tend only ever reads Nib. It never writes to it.",
    /** @param {number} n */
    nibBound: (n) => `${n} bound`,
    /** @param {string} dir */
    nibReading: (dir) => `Reading ${dir}`,
    nibUnknownFolder: "an unknown folder",
    nibHowTitle: "How this works",
    nibHowWhy:
      "Point a Nib folder at a person, then say which of your Nib tags supplies each kind of " +
      "contact Tend tracks. Writing a tagged note is then the evidence that the contact happened, " +
      "with nothing to confirm afterwards - and an untagged note counts as nothing, so a folder " +
      "can hold every sort of note about somebody.",
    nibHowNote:
      "Flagged action points inside those notes become promises here, and ticking one off in Nib " +
      "closes it here too. Tend only reads Nib.",
    nibWatching: "Notes import themselves, within a second of being tagged.",
    nibTimerOnly:
      "Notes import on a timer only - this window is not watching the notebook.",
    /** @param {number} n */
    nibFolderCount: (n) => `${n} folder(s) found in Nib`,
    bindButton: "Bind a folder",
    previewButton: "Preview import",
    importButton: "Import now",
    nibNoPeople: "Add people first - a binding points a folder at somebody.",
    nibNothingBound: "Nothing bound yet.",
    /** @param {string} person @param {string} as */
    bindingMeta: (person, as) => `→ ${person}${as}`,
    unknownPerson: "unknown",
    /** @param {string} kind */
    bindingCountsAs: (kind) => ` as ${kind}`,
    bindingNoTags: " - no tags mapped, so nothing counts yet",
    tagsButton: "Tags",
    unbindButton: "Unbind",

    /* The data directory. */
    dataGroup: "Your data",
    dataTitle: "Where it is kept",
    dataAppendOnly:
      "Written as an append-only log, one file per writer, so this app and anything else reaching " +
      "the same folder can write at once without losing each other's changes. Nothing is ever " +
      "overwritten, which is also why nothing is ever truly lost.",
    dataNote: "This folder holds notes about named colleagues. It stays on your machine.",
    openFolder: "Open the folder",

    /*
     * The bulk leaving-a-job action, and the single-press way back. The two
     * directions used to be badly matched - one button to archive a roster,
     * thirty decisions to restore it - while the card offered "reversible" as
     * reassurance.
     */
    leavingGroup: "Leaving a job",
    archiveAllTitle: "Archive everyone and everything active",
    archiveAllWhy:
      "For the moment a job ends. Archives every person, project and workstream that is currently " +
      "active - all at once, instead of one at a time.",
    archiveAllNote:
      "Nothing is deleted. Every 1-1, promise, decision and growth direction stays exactly as " +
      "it is. " +
      "Each one can be brought back on its own, whenever it is relevant again, from its archived list.",
    archiveAllSafe: "Safe to run again - anything already archived is left untouched.",
    archiveAllButton: "Archive everything active",
    /** @param {string} when */
    undoTitle: (when) => `Undo the archive from ${when}`,
    undoEarlierRun: "an earlier run",
    /** @param {string} parts */
    undoWhy: (parts) =>
      `Puts back ${parts} - only what that press archived, and only the ones still archived now. ` +
      `Anything you have already brought back by hand stays as it is, and nothing archived on its ` +
      `own before or after is touched.`,
    undoOffered: "Offered until you use it, or archive everything again.",
    undoButton: "Undo that archive",
    personOne: "person",
    personMany: "people",
    projectOne: "project",
    projectMany: "projects",
    workstreamOne: "workstream",
    workstreamMany: "workstreams",

    /* Drafting. Says what it will never do as prominently as what it does. */
    draftingGroup: "Drafting",
    draftingAvailable: "Available",
    draftingOff: "Off",
    draftingSignedIn: "signed in through Claude Code",
    draftingNotSetUp: "not set up",
    draftingWhat:
      "Three buttons use a model: a brief before a conversation, reading one of your notes for a " +
      "commitment you wrote in passing, and naming what recurs across several notes about the " +
      "same person. Each one is a button. Nothing runs on a timer and nothing runs when this " +
      "window opens.",
    draftingSignIn:
      "It borrows the sign-in Claude Code already has on this machine, so there is no key to " +
      "store. A note only ever leaves this machine when you press one of those buttons.",
    draftingWithout:
      "Everything else works exactly as it does with it on. What is behind, cadences, promises " +
      "and the focus budget are ordinary arithmetic - a model never decides what needs your " +
      "attention.",
    draftingNever:
      "A model writes nothing here. Everything it produces is a draft, shown and thrown away " +
      "unless you keep it yourself.",

    /* About. */
    aboutGroup: "About",
    /** @param {string} version */
    aboutTitle: (version) => `Tend ${version}`,
    installed: "installed",
    development: "development",
    updatesOn: "Checks for a newer version once at startup and installs it when you quit.",
    updatesOff:
      "Running from source. Update checks are off, since there is no installed copy to replace.",
    noUpdateCheck: "No update check has run yet.",
    checkNow: "Check now",

    /*
     * One row per kind of contact Tend tracks, answered with a Nib tag. This way
     * round on purpose: listing Nib's tags and asking what each MEANT put the
     * other app's vocabulary in charge of the question.
     */
    tagNone: "No tag - Tend never sees this from here",
    /** @param {string} dir */
    tagsReadFrom: (dir) => `Tags read from ${dir}.`,
    /** @param {string} folder */
    tagsTitle: (folder) => `Tags in ${folder}`,
    tagsIntro:
      "Tend asks; your notebook answers. For each kind of contact Tend tracks, pick the Nib tag " +
      "that means it. Leave one blank and Tend simply never sees that kind from this folder - " +
      "most people will use two or three.",
    save: "Save",
    /** @param {number} n */
    tagRulesSaved: (n) => `${n} tag rule${n === 1 ? "" : "s"} saved.`,
    tagsUnreadable: "Nib's tags could not be read.",
    /** @param {string} dir */
    noTagsIn: (dir) => `No tags in the notebook at ${dir}. Make one in Nib first.`,

    /* Binding a folder. */
    bindTitle: "Bind a Nib folder",
    bindIntro:
      "Notes in this folder become contact with this person. What each note counts AS comes from " +
      "its tag in Nib - so a folder can hold every sort of note about somebody without one you " +
      "merely heard resetting the clock on having spoken to them. An untagged note counts as nothing.",
    bindFolderLabel: "Folder in Nib",
    /** @param {string} label @param {number} notes */
    bindFolderOption: (label, notes) => `${label} (${notes} note${notes === 1 ? "" : "s"})`,
    bindPeopleLabel: "Whose notes these are",
    bindNameLabel: "What to call it (optional)",
    bindSharedNote:
      "Naming more than one person makes this a meeting rather than a person's folder. Each note " +
      "there becomes contact with every one of them, so all their clocks move. Flagged action " +
      "points do NOT get copied onto everybody - there is no way to tell whose each is, so they " +
      "wait on Now until you say.",
    bindConfirm: "Bind",
    bindNobody: "Pick at least one person - a folder bound to nobody imports nothing.",
    boundToast: "Bound.",
    /** @param {string} dir */
    boundNoTags: (dir) => `No tags in the notebook at ${dir}, so no note there counts as anything yet.`,
    /** @param {string} why */
    boundTagsUnreadable: (why) => `Could not read Nib's tags: ${why}`,
    unknownReason: "unknown reason",

    /** @param {string} name */
    unbindTitle: (name) => `Unbind ${name}?`,
    unbindBody: "Notes there stop counting as contact. What has already been imported stays.",
    unboundToast: "Unbound.",

    previewTitle: "What importing would bring in",
    /** @param {string} summary @param {number} bindings @param {string} skipped */
    previewBody: (summary, bindings, skipped) =>
      `${summary} From ${bindings} binding(s).${skipped} Nothing has been written.`,
    /** @param {string} which */
    previewSkipped: (which) => ` Skipped: ${which}.`,
    close: "Close",
    importedTitle: "Imported",
    /** @param {string} summary */
    importedBody: (summary) => `${summary} Safe to run again whenever - nothing is ever duplicated.`,
    good: "Good",

    switchPrivateTitle: "Switch to the private side?",
    switchWorkTitle: "Back to the work side?",
    switchPrivateBody:
      "The app restarts and opens a different store. Nothing from the work side is visible there, " +
      "and nothing written there is ever read here.",
    switchWorkBody:
      "The app restarts and opens the work store again. Nothing written in the private side comes " +
      "with it.",
    switchConfirm: "Switch",
    switchBackConfirm: "Switch back",

    archiveAllAskTitle: "Archive everyone and everything active?",
    archiveAllAskBody:
      "Archives every person, project and workstream that is currently active, in one go. " +
      "Nothing is deleted - every 1-1, promise, decision and growth direction stays exactly as " +
      "it is, and each one can be brought back individually, whenever it is relevant again, " +
      "from its archived list.\n\n" +
      "Afterwards this page offers a single Undo that puts back exactly what this press " +
      "archived, so you do not have to reverse it one row at a time.",
    archiveAllConfirm: "Archive everything",
    /** @param {number} people @param {number} projects @param {number} workstreams */
    archivedToast: (people, projects, workstreams) =>
      `${people} people, ${projects} projects, ${workstreams} workstreams archived.`,

    undoAskTitle: "Undo that archive?",
    undoAskBody:
      "Puts back everything that press archived and is still archived now. Rows you have already " +
      "brought back stay as they are, and anything archived on its own - before or after that " +
      "press - is left alone.",
    undoConfirm: "Put them back",
    /** @param {number} people @param {number} projects @param {number} workstreams */
    undoneToast: (people, projects, workstreams) =>
      `${people} people, ${projects} projects, ${workstreams} workstreams back.`,

    checkingToast: "Checking."
  },

  /*
   * Ctrl+K. Every row here is a whole sentence somebody reads at speed, and
   * three of them are the only place in the app where a band name ("Capture",
   * "Go", "Ask") tells the reader what sort of thing they are about to do.
   */
  palette: {
    label: "Command palette",
    placeholder: "Say what happened, or where you want to go",
    footMove: "move",
    footDo: "do it",
    footClose: "close",

    /* Nothing typed yet, so this is the only instruction the palette gives. */
    empty:
      "Type what just happened - <em>Nina: look at the render pass</em> - and it is logged " +
      "without leaving this page. Or type a view, or ask a question.",

    /* The three bands, in the order they are offered. */
    bandCapture: "Capture",
    bandGo: "Go",
    bandAsk: "Ask",

    /* Capture: what typing a name and a sentence offers to do with it. */
    /** @param {string} name @param {string} rest */
    promiseTo: (name, rest) => `Promise to ${name}: ${rest}`,
    loggedStraightAway: "logged straight away",
    /** @param {string} name */
    promiseLoggedToast: (name) => `Promise to ${name} logged.`,
    /** @param {string} name */
    logContactWith: (name) => `Log contact with ${name}`,
    spokeToThem: "you spoke to them",
    /** @param {string} text */
    logPromiseOf: (text) => `Log a promise: ${text}`,
    asksWhoTo: "asks who it was made to",

    /* Go: the rail, then the things that would mean finding a view first. */
    /** @param {string} name */
    goTo: (name) => `Go to ${name}`,
    addSomeone: "Add someone",
    addSomeoneHint: "a new person here",
    setFocus: "Set a focus",
    setFocusHint: "a time-boxed priority",
    recordDecision: "Record a decision",
    recordDecisionHint: "with a date it comes back",
    importNib: "Import notes from Nib",
    importNibHint: "contact and flagged action points",
    /** @param {number} contacts @param {number} promises @param {number} resolved */
    importedToast: (contacts, promises, resolved) =>
      `${contacts} contact records, ${promises} promises, ${resolved} closed.`,
    openDataDir: "Open the data folder",
    openDataDirHint: "where the log lives",
    checkUpdates: "Check for updates",
    checkUpdatesHint: "against the published releases",
    checkingToast: "Checking.",

    /* Ask: what Tend can answer from its own data. */
    whatNeedsYou: "What needs you",
    whatNeedsYouHint: "from what is behind",
    allInStep: "Nothing is behind. That is the whole answer.",
    /** @param {number} needs @param {number} nudges */
    behindCount: (needs, nudges) => `${needs} need you, ${nudges} worth a nudge.`,
    /** @param {string} what @param {string} why */
    behindLine: (what, why) => `${what} - ${why}`,

    notSpokenTo: "Who you have not really spoken to",
    notSpokenToHint: "this month",
    nothingStandsOut: "Nothing stands out in how this month went.",

    /** @param {string} name */
    whatYouOwe: (name) => `What you owe ${name}`,
    whatYouOweHint: "open promises",
    /** @param {string} name */
    oweNothing: (name) => `Nothing outstanding to ${name}.`,
    /** @param {string} text @param {string} openFor */
    oweLine: (text, openFor) => `${text} - open ${openFor}`,

    /** @param {string} name */
    whenYouLastSpoke: (name) => `When you last spoke to ${name}`,
    whenYouLastSpokeHint: "from the contact log",
    /** @param {string} kind @param {string} when */
    lastSpokeLine: (kind, when) => `${kind}, ${when}.`,
    /** @param {string} name */
    neverSpoke: (name) => `No contact with ${name} recorded at all.`,

    /*
     * The fallthrough, and only the fallthrough. The hint says what it costs,
     * because this is the one row in the palette that spends money.
     */
    askModel: "Ask a model instead",
    askModelHint: "nothing here matched, so this costs a few seconds",
    thinking: "Thinking…",

    /* Logging contact from here, which asks less than the person page does. */
    /** @param {string} name */
    contactTitle: (name) => `Contact with ${name}`,
    contactIntro: "The kind matters: a 1-1 satisfies the 1-1 cadence and nothing else does.",
    contactKindLabel: "What kind",
    contactNoteLabel: "A line about it",
    when: "When",
    logIt: "Log it",
    contactLoggedToast: "Contact logged.",

    /* And a promise, when the text carried no name to attach it to. */
    promiseTitle: "Log a promise",
    promiseIntro: "Who did you say this to?",
    promiseWhoLabel: "To whom",
    promiseTextLabel: "What you said you would do",
    promiseDueLabel: "By when",
    promiseDueHint: "Optional. How long it has been open is measured either way.",
    promiseLoggedPlain: "Promise logged."
  },

  /*
   * Everything a model produced, and the words that say so. The provenance
   * lines are the load-bearing ones: a draft that does not say it was drafted
   * becomes a fact by sitting on the screen long enough, so "Nothing here was
   * saved" is not a nicety and must not be shortened away in the wording pass.
   */
  model: {
    unknownAvailability: "Could not tell whether Claude Code is available.",

    /* The stamp under anything drafted. */
    aModel: "a model",
    /** @param {string} model @param {string} cost */
    draftedBy: (model, cost) => `Drafted by ${model}${cost}. Nothing here was saved.`,
    /** @param {string} cents */
    cost: (cents) => ` · ${cents}¢`,

    discard: "Discard",
    discardAll: "Discard all",
    close: "Close",

    /* A brief, as read on the way to a room. */
    briefTitle: "Draft brief",
    raiseHead: "Raise",
    askHead: "Ask",
    /** @param {string} watch */
    watchOut: (watch) => `Careful of: ${watch}`,

    /* Promises read out of prose, each still a candidate. */
    nothingFoundTitle: "Nothing found",
    nothingFoundWhy:
      "No commitment in that note that Nib's own action points had not already caught. " +
      "That is the common answer and it is a good one.",
    candidatesTitle: "Found in what you wrote",
    truncated: "That note is long, so only its first part was read.",
    statedOutright: "stated outright",
    implied: "implied, so check it",
    keep: "Keep",
    promiseLoggedToast: "Promise logged.",

    /* What keeps coming up about somebody. */
    /** @param {string | number} notes */
    themesTitle: (notes) => `Across ${notes} notes`,
    themesNone: "Nothing recurs across those notes yet. A pattern needs to appear in at least two.",
    /** @param {string | number} times */
    themeTimes: (times) => `${times}×`,

    /* A reading of the journal, before it is kept or thrown away. */
    /** @param {string} days */
    reviewTitle: (days) => `The last ${days} days`,
    keepReading: "Keep this reading",
    avoidedHead: "Kept being avoided",
    avoidedNone:
      "Nothing recurs in that box across these evenings. Worth noticing rather than " +
      "celebrating - it is also what an unanswered box looks like.",
    wentIntoHead: "Where the days went",
    saidVsDidHead: "Against what you said you would do",
    questionsHead: "Worth asking yourself",
    /** @param {string} evenings */
    eveningsCount: (evenings) => `${evenings} evenings`,
    ledgerSummary: "What the app recorded over the same days",
    /** @param {string} model @param {string} cost */
    readByKeep: (model, cost) => `Read by ${model}${cost}. Nothing is saved unless you keep it.`,

    /*
     * The recorded counts, as lines. The wording is the window's business and
     * the numbers are the contract, which is why these live here and not in
     * the shape the service sends.
     */
    ledgerDays: "Days with an entry",
    /** @param {string | number} journalled @param {string | number} days */
    ledgerDaysValue: (journalled, days) => `${journalled} of ${days}`,
    ledgerConversations: "Conversations recorded",
    ledgerPromisesMade: "Promises made",
    /** @param {string | number} made @param {string | number} kept */
    ledgerPromisesMadeValue: (made, kept) => `${made}, of which ${kept} closed`,
    ledgerPromisesOpen: "Promises open right now",
    ledgerDecisions: "Decisions recorded",
    ledgerGrowth: "Directions discussed",
    /** @param {string | number} notes @param {string | number} observed */
    ledgerGrowthValue: (notes, observed) => `${notes}, seen happening ${observed}×`,
    ledgerSkips: "Meetings that did not happen",
    ledgerChases: "Times you chased somebody",

    /*
     * One entry, read back against the rule that keeps it safe to write. The
     * clean answer is shown rather than swallowed: a check that only ever
     * speaks up when something is wrong reads as an accusation waiting to
     * happen.
     */
    readBackTitle: "Read back",
    readBackClean: "Nothing here describes them rather than your own part in it.",
    onePhrase: "One phrase",
    /** @param {number} n */
    somePhrases: (n) => `${n} phrases`,
    /** @param {string} count */
    readBackSome: (count) =>
      `${count} describing them rather than your own part. Nothing has been changed - the ` +
      `alternative is only an alternative.`,
    /** @param {string} instead */
    couldBe: (instead) => `Could be: ${instead}`,
    /** @param {string} model @param {string} cost */
    readByUntouched: (model, cost) => `Read by ${model}${cost}. Your entry is untouched.`
  },

  /*
   * The shell rather than a view: dialog buttons, the validation line, the
   * failed-read card. These say the same thing on every screen and are the
   * only words here nobody would find by opening one view, which is exactly
   * why they need naming - "Save" and "Yes" are defaults, so a form that
   * never mentions a confirm button still says one of them.
   */
  ui: {
    /* A read that failed, which is not a record that is empty. */
    /** @param {string} what */
    readFailedTitle: (what) => `Could not read ${what}`,
    readFailedWhy:
      "Nothing has been lost - this is a failed read, not an empty record. The store may be " +
      "mid-sync.",
    retry: "Try again",

    /* Every dialog's two buttons, and the two defaults. */
    cancel: "Cancel",
    save: "Save",
    yes: "Yes",

    /*
     * The one thing a form says on its own behalf. It names the field, so it
     * has to be built from the label rather than written out.
     */
    /** @param {string} label */
    needed: (label) => `${label} is needed.`,

    /* A collapsed multiselect with nothing ticked. */
    noneChosen: "Nobody chosen yet"
  },

  /*
   * The shell: the rail's badges, the half marker, and the card that appears
   * when a view throws.
   *
   * Short by design. A rail count that is always there stops being read, so
   * everything at zero shows nothing at all - which means these five words are
   * the whole vocabulary of the rail, and each has to be legible on its own at
   * eleven pixels beside a button.
   *
   * The tone names next to them in app.js - "urgent", "new" - are CSS classes
   * and stay out of here, even though two of them read like words.
   */
  shell: {
    /* A view that threw. Shown in place of the view, so it says what failed. */
    renderFailed: "This view could not be drawn",

    /** @param {number} n Proposed duties waiting to be accepted. */
    proposedCount: (n) => `${n} new`,

    /*
     * The half, spelled out in the title bar. Only the private half is
     * marked: the work half is the default and naming it would put a label on
     * the state nobody needs telling about.
     */
    privateBadge: "private"
  }
};
