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

    /*
     * The focus as one line: name, then the facts, middot-separated. Short
     * forms on purpose - four facts on a line is the point of the line, and
     * the long versions are still in the payload and still the tooltip.
     */
    focusLabel: "fokus",
    /** @param {number} n */
    focusDaysLeft: (n) => `${n} ${n === 1 ? "dag" : "dagar"} kvar`,
    focusNoEnd: "inget slutdatum",
    costNothingBehind: "inget har halkat efter",
    costUnknown: "ingen utgångspunkt registrerad",
    /** @param {string} days */
    costBehind: (days) => `${days} dagars eftersläpning sedan starten`,
    /** @param {number} n */
    focusHeldShort: (n) => `${n} ${n === 1 ? "undanhållen" : "undanhållna"}`,

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
    title: "Personer",
    subPrivate: "Vilka de är, och vad du sagt att du ska göra. Inget här går på ett schema.",
    subWork: "Grupperat efter relationen, inte organisationsschemat.",
    addButton: "Lägg till någon",

    /* "Nobody yet" and "everybody is archived" are different facts, and after a
       bulk archive the second is the common one. */
    emptyArchived:
      "Ingen aktiv. Alla här är arkiverade - öppna gruppen nedan för att ta tillbaka någon, " +
      "eller lägg till någon ny.",
    emptyPrivate:
      "Ingen här än. Att lägga till någon ger dig en plats för vad du lovat dem - och inget " +
      "annat, eftersom inget utanför jobbet går på en takt.",
    emptyWork:
      "Ingen här än. Lägg till dem du leder eller ansvarar för, och ledarna du jobbar vid sidan av.",

    /* A roster row's right-hand side. */
    awayNothing: "inget förväntas medan de är borta",
    leftNothing: "historiken behålls, inget förväntas",
    noDuty: "ingen plikt gäller",

    archivedGroup: "Arkiverade",
    /* Handed to `readFailedHtml`, which says "Kunde inte läsa ..." around it. */
    readFailedRoster: "rostern",
    readFailedArchived: "de arkiverade personerna",
    /** @param {string} date */
    archivedOn: (date) => `arkiverad ${date}`,
    view: "Visa",
    unarchive: "Ta tillbaka",

    notFoundTitle: "Hittades inte",
    allPeople: "Alla personer",
    back: "← Alla personer",
    edit: "Ändra",
    notRight: "Blev fel",
    remove: "Ta bort",

    /* A folded run of identical history rows. */
    /** @param {number} n */
    identical: (n) => `${n} identiska`,

    /*
     * What the rows amount to, counted in the service over the whole set rather
     * than the capped twenty rendered above.
     */
    noContactYet: "Ingen kontakt registrerad än",
    conversationOne: "samtal",
    conversationMany: "samtal",
    /** @param {number} n @param {string} word */
    countOf: (n, word) => `${n} ${word}`,
    /** @param {string} month */
    since: (month) => `sedan ${month}`,
    /** @param {number} days @param {string} word */
    roughlyEvery: (days, word) => `ungefär var ${days} ${word}`,
    dayOne: "dag",
    dayMany: "dagar",
    /** @param {string} words */
    lastAt: (words) => `senast ${words}`,

    /* A cancellation, kept legible as a different thing from a conversation. */
    /** @param {string} kind @param {string} why */
    didNotHappen: (kind, why) => `<strong>${kind}</strong> blev inte av${why}`,
    /** @param {string} why */
    skipWhy: (why) => ` - ${why}`,
    /** @param {string} kind */
    skipWhat: (kind) => `${kind} som inte blev av`,

    /* Moments, and the people also in them. */
    /** @param {string} who */
    alsoThere: (who) => `med ${who}`,

    /* The action row on a person's page. */
    logContactButton: "Logga kontakt",
    logSkipButton: "Det blev inte av",
    logMomentButton: "Något hände",
    logPromiseButton: "Något jag lovade",
    linkButton: "Länka något",
    observationButton: "Registrera en observation",
    readingNotes: "Läser anteckningar…",
    /* Said only on a row nobody typed. Same pill as the work view's. */
    fromANote: "från en anteckning",
    themesButton: "Vad som återkommer",

    /* The blocks, in the order they answer a question about somebody. */
    cadencesBlock: "Takter",
    cadencesNone: "Ingen plikt i rollkartan gäller den här relationstypen.",
    promisesBlock: "Öppna löften",
    promisesNone: "Inget utestående.",
    observationsBlock: "Observationer",
    observationsNone:
      "Inget registrerat. Det är det här ett utvecklingssamtal byggs av.",
    historyBlock: "Kontakthistorik",
    skippedBlock: "Bokat och blev inte av",
    linkedBlock: "Länkat",
    linkedNone:
      "Inget länkat. Förberedda anteckningar och allt annat som lever utanför Tend kan pekas " +
      "på härifrån.",
    momentsBlock: "Ögonblick",
    momentsNone:
      "Inget än. En sak som hände och din egen del i den - vilket är den halva du kan ändra, " +
      "och den enda halvan värd att behålla.",

    /* Archiving, in its own block because it is reversible and Remove is not. */
    /** @param {string} date */
    archivedNote: (date) =>
      `Arkiverad ${date}. De slutar dyka upp i Läget, Inför, uppmärksamhetspåminnelser och ` +
      `plikttakter - allt som redan finns på den här sidan står kvar precis som det är.`,
    /** @param {string} name */
    unarchiveNamed: (name) => `Ta tillbaka ${name}`,
    /** @param {string} name */
    archiveNamed: (name) => `Arkivera ${name}`,
    /** @param {string} name */
    removeNamed: (name) => `Ta bort ${name}`,

    /* Adding somebody. */
    addTitle: "Lägg till någon",
    /*
     * No mention of duties in the private half, because there are none. The
     * relationship there is a label: it groups the list and sits on their page,
     * and nothing is derived from it. Saying so is the difference between a
     * field somebody answers carefully and one they answer wrong on purpose.
     */
    addIntroPrivate: "Vilka de är, för din egen skull. Inget schemaläggs utifrån det.",
    addIntroWork: "Relationstypen avgör vilka plikter som gäller dem.",
    nameLabel: "Namn",
    namePlaceholderPrivate: "Vad du kallar dem",
    namePlaceholderWork: "Deras fullständiga namn",
    relationPrivate: "Vilka de är",
    relationWork: "Hur du förhåller dig till dem",
    sinceLabel: "Sedan när",
    addSinceHint:
      "När relationen började, inte idag. Låt det stå som idag för någon som just börjat; sätt " +
      "det bakåt för någon du haft i månader, annars tror Tend att du ligger perfekt i fas med " +
      "dem.",
    add: "Lägg till",
    /** @param {string} name */
    addedNamed: (name) => `${name} tillagd.`,

    /* Taking a moment back. */
    unlogMomentTitle: "Ta tillbaka?",
    /** @param {string} what */
    unlogMomentBody: (what) =>
      `"${what}" tas bort. Loggen behåller historiken; sidan slutar visa den.`,
    removedToast: "Borttaget.",

    /* A cancellation, recorded - and it satisfies nothing. */
    skipTitle: "Vad blev inte av?",
    skipIntro:
      "Registrerat, och det uppfyller ingenting - samtalet har fortfarande inte ägt rum, så " +
      "klockan går vidare. Poängen är skillnaden mellan att aldrig ha bokat det och att ha " +
      "ställt in det tre gånger, vilket kontakt i sig inte kan visa.",
    skipKindLabel: "Vad det skulle ha varit",
    skipWhyLabel: "Varför, på en rad",
    skipWhyPlaceholder: "Releasevecka, flyttade det själv för tredje gången",
    skipWhyHint:
      'Dina egna ord snarare än en kategori. Skillnaden mellan "han var sjuk" och "jag ' +
      'flyttade det igen" är hela skälet att skriva ner det.',
    skipWhenLabel: "När det skulle ha varit",
    recordIt: "Registrera",
    recordedToast: "Registrerat.",

    takeBackTitle: "Ta tillbaka det här?",
    /** @param {string} what */
    unlogSkipBody: (what) =>
      `"${what}" slutar finnas på pränt. Inget annat ändras - att något inte blev av uppfyllde ` +
      `aldrig något.`,
    /** @param {string} what */
    unlogContactBody: (what) =>
      `"${what}" slutar räknas, så den takt det uppfyllde går tillbaka dit den var. Händelsen ` +
      `stannar i loggen - inget här tas någonsin riktigt bort - den slutar bara vara underlag.`,
    takeItBack: "Ta tillbaka",
    takenBackToast: "Tillbakataget.",

    /* Editing. */
    /** @param {string} name */
    editTitle: (name) => `Ändra ${name}`,
    editIntro:
      "Historiken följer med vad du än ändrar här - allt som pekar på någon håller deras id, " +
      "så namnet är bara vad som visas och vad Ctrl+K matchar på.",
    editSinceHint:
      "När relationen började. Varje takt mäter härifrån till det finns kontakt att mäta " +
      "från i stället, så ett platshållardatum sätter någon månader efter på sin första dag - " +
      "eller perfekt i fas med någon du aldrig pratat med.",
    awayLabel: "Borta till",
    awayHint:
      "Föräldraledighet, en sabbatical, en lång sjukdom. Inget förväntas av dig medan de är " +
      "borta, och klockan startar om från dagen de är tillbaka i stället för från senaste " +
      "gången ni pratade. Rensa det om de kommer tillbaka tidigare.",
    leftLabel: "Sista dagen",
    leftHint:
      "Sätt det så snart du vet. Allt gäller fram till den dagen - ett löfte till någon som " +
      "slutar nästa vecka är precis det löfte man ska hålla - och efter den tystnar deras " +
      "takter medan hela historiken står kvar. Bättre än att ta bort dem.",
    save: "Spara",
    updatedToast: "Uppdaterat.",

    /* Logging contact. A second hand report is not having spoken to them. */
    logTitle: "Logga kontakt",
    logIntro:
      "Sorten avgör vilken takt det här uppfyller. En second hand-rapport räknas inte som att " +
      "ha pratat med dem.",
    logKindLabel: "Vilken sort",
    logNoteLabel: "En rad, frivilligt",
    logNotePlaceholder: "Vad det handlade om",
    when: "När",
    logWhenHint: "Bakdatera det om du tar igen.",
    logIt: "Logga",
    loggedToast: "Loggat.",

    /* A promise. When unsure, log it. */
    promiseTitle: "Något du lovade",
    promiseIntro:
      "När du inte är säker på att det räknas, logga det. Ett felaktigt kostar ett klick; ett " +
      "missat kostar tillit hos en verklig människa.",
    promiseTextLabel: "Vad du sa att du skulle göra",
    promiseTextPlaceholder: "Kolla med Nina om konferensen",
    promiseDueLabel: "Senast när, frivilligt",
    promiseMadeLabel: "När du sa det",
    promiseMadeHint:
      "Bakdatera det och det åldras rätt. Allt som är öppet längre än två veckor eskalerar " +
      "oavsett vad annat som pågår.",

    /* A link: the address, never a copy. */
    linkTitle: "Länka något",
    linkIntro:
      "Adressen sparas, aldrig en kopia - samma upplägg som Nib-pekaren. Varje rad visar hur " +
      "gammal den är, eftersom förberedda anteckningar slutar vara aktuella så snart samtalet " +
      "ägt rum och inget här går ut av sig självt.",
    linkUrlLabel: "Adress",
    linkUrlPlaceholder: "https://",
    linkTitleLabel: "Vad det är",
    linkTitlePlaceholder: "Inför nästa 1-1",
    linkNoteLabel: "Varför, om det inte är uppenbart",
    linkConfirm: "Länka",
    linkedToast: "Länkat.",
    /** @param {string} name */
    unlinkTitle: (name) => `Ta bort länken till ${name}?`,
    unlinkBody: "Bara pekaren försvinner. Det den pekade på är orört.",

    /* An observation, so a review is built on notes rather than on memory. */
    observationTitle: "Registrera en observation",
    observationIntro:
      "Vad de levererade, hur de hanterade något. Nedskrivet nu så att ett utvecklingssamtal " +
      "byggs på anteckningar snarare än på minnet av de senaste tre veckorna.",
    observationTextLabel: "Vad som hände",
    observationAreaLabel: "Tagg, frivilligt",
    observationAreaPlaceholder: "kod, ägarskap, kommunikation",

    closedToast: "Stängt.",

    /* Archiving is reversible, so it gets its own gentler dialog. */
    /** @param {string} name */
    archiveTitle: (name) => `Arkivera ${name}?`,
    archiveBody:
      "De slutar dyka upp i Läget, Inför, uppmärksamhetspåminnelser och plikttakter. Varje 1-1, " +
      "löfte, beslut och riktning om dem står kvar precis som det är och kan tittas på igen. " +
      "Helt återställbart - ta tillbaka dem när du vill från deras sida.",
    archive: "Arkivera",
    /** @param {string} name */
    archivedToast: (name) => `${name} arkiverad.`,
    /** @param {string} name */
    unarchivedToast: (name) => `${name} tillbaka.`,
    /** @param {string} name */
    removeTitle: (name) => `Ta bort ${name}?`,
    removeBody:
      "De slutar dyka upp och deras takter slutar räknas. Inget förstörs - historiken stannar " +
      "i loggen och kan återskapas - men appen kommer att bete sig som om de aldrig varit ditt " +
      "ansvar.",
    /** @param {string} name */
    removedNamed: (name) => `${name} borttagen.`
  },

  growth: {
    /*
     * The endings, written out rather than derived: `open` is not an ending, and
     * each of the three needs a sentence saying what choosing it means. Every
     * option carries its consequence, the way the delegation levels do.
     */
    endingReached: "Nådd - de kan det nu",
    endingDropped: "Släppt - inte riktningen trots allt",
    endingExpectation:
      "Uttalad som ett krav - jobbet behöver det oavsett om de vill eller inte",

    /* The block on a person's page. */
    blockTitle: "Utveckling",
    openButton: "Öppna en riktning",
    empty:
      "Inget än. En riktning hamnar här när det finns en - inte för alla, och inte för att " +
      "kalendern säger att det är den tiden på året.",
    /*
     * Said, not enforced. Attention is the scarce thing this tool exists to be
     * honest about, and a limit imposed on his judgement would be software
     * deciding how many people he is allowed to develop at once.
     */
    /** @param {number} live */
    tooMany: (live) =>
      `${live} igång samtidigt. Två är ungefär vad någon faktiskt kan hålla - resten brukar ` +
      `bli pappersarbete.`,

    /* One direction. */
    /** @param {number} talks @param {number} observations @param {string} last */
    counts: (talks, observations, last) =>
      `diskuterad ${talks}×, sedd ${observations}× &middot; pratade senast ${last}`,
    theirWords: "Deras ord",
    through: "Genom",
    iWillSee: "Jag kommer att se",
    imPuttingIn: "Jag lägger in",
    myGuess: "Min gissning innan jag frågade",
    ifNothingChanges: "Om inget ändras",
    told: "Berättat för",
    endedBecause: "Avslutad för att",
    /** @param {string} label @param {string} value */
    detailLine: (label, value) => `${label}: ${value}`,
    /** @param {string} what */
    stillToPrepare: (what) => `Kvar att förbereda: ${what}`,
    /** @param {string} what */
    stillToAsk: (what) => `Kvar att fråga dem: ${what}`,

    /*
     * Removal belongs to the thread that should never have existed, so it is
     * offered while nothing has happened and withdrawn the moment something has.
     */
    openedByMistake: "Öppnad av misstag",
    afterConversation: "Efter samtalet",
    itCameUp: "Det kom upp",
    iSawIt: "Jag såg det",
    prepare: "Förbered",
    endIt: "Avsluta",
    iHaveToldThem: "Jag har berättat för dem",
    reword: "Formulera om",

    /* The compact version on a prep card, read minutes before a conversation. */
    /** @param {string} marker */
    youWillSee: (marker) => `Du kommer att se: ${marker}`,
    /** @param {number} talks @param {number} observations @param {string} last */
    cardCounts: (talks, observations, last) =>
      `Diskuterad ${talks}×, sedd ${observations}× &middot; pratade senast ${last}.`,
    /*
     * Shown only on a stalled thread. The stall question asks whether the aim is
     * wrong or the support is missing; the second half is something he already
     * wrote down, and the card was posing the question without the answer next
     * to it. An empty offering is not a gap - it IS the answer.
     */
    stalledNoOffering:
      "Du skrev aldrig ner vad du själv lade in. Det är ett svar på frågan ovan.",
    /** @param {string} offering */
    stalledOffering: (offering) => `Du sa att du skulle lägga in: ${offering}`,

    /* Stage A: what he can work out alone, and what he is prepared to put in. */
    fAim: "Vad du tror riktningen är, i en mening",
    fAimPlaceholder: "Håller designgenomgången utan mig i rummet",
    fAimHint:
      "Din, innan du frågat. Vad de kommer att kunna GÖRA, inte ett område att bli bättre på - " +
      'deras eget svar kommer senare och sparas vid sidan av det här. Allt annat om den här ' +
      'riktningen kan vänta till du använder "Förbered" på kortet.',
    fDriver: "Vill de det här, eller behöver jobbet det?",
    fDriverHint:
      "Två olika instrument. Utvecklingsinstrumentet använt på en prestationsbrist läses som " +
      "en disciplinär process med ett leende. Att inte veta än är ett riktigt svar.",
    fNeed: "Vems behov är det?",
    fNeedPlaceholder: "Teamet stannar av varje gång jag är borta",
    fNeedHint: "Konkret nog att du skulle kunna säga det rakt ut till dem.",
    fIfNothing: "Vad händer om inget ändras?",
    fIfNothingHint:
      'Om det ärliga svaret är ingenting är det här en önskan snarare än ett behov. "Du står ' +
      'kvar där du är" är ett fullgott svar.',
    fAlreadySeen: "Vad du redan sett dem göra",
    fAlreadySeenHint:
      "Bara det som hänt. Tomt är i sig fyndet: inget underlag under riktningen.",
    fOffering: "Vad lägger du in?",
    fOfferingPlaceholder: "Arkitekturgenomgången, och jag slutar skriva migreringsplanen själv",
    fOfferingHint:
      'Skydd, ett rum att bli insläppt i, arbete du slutar göra själv. Skriv det som gjort ' +
      'eller daterat - "jag skulle kunna" är inget du lägger in.',

    /* Stage B: what the conversation returned. */
    fTheirWords: "Vad de sa att de vill, i deras ord",
    fTheirWordsHint:
      "Deras, inte en städad version. En plan i dina ord är en de läser som din.",
    fStance: "Hur landade det mot din gissning?",
    fAssignment: "Vilket verkligt arbete sker det här genom?",
    fAssignmentPlaceholder: "Äger migreringen från början till slut",
    fAssignmentHint:
      "Namnge uppdraget, inte ett kompetensområde. Verkliga insatser rör människor; kurser " +
      "känns som det.",
    fMarker: "Vad kommer du att se om tre månader som du inte ser nu?",
    fMarkerPlaceholder: "Håller genomgången en gång utan mig",
    fMarkerHint:
      'Om du inte kan avsluta den meningen är riktningen för vag att följa. "Bättre ' +
      'kommunikation" går inte att se; "kör det utan mig" gör det.',
    fWhenTalked: "När ni pratade",
    fWhenTalkedHint: "Loggas som ett samtal också, om du inte redan loggat ett.",
    fCadence: "Hur ofta ska det komma upp?",
    fCadenceHint: "I 1-1:an, aldrig som ett eget möte. Ett separat möte dödar det.",
    fHorizon: "När ska riktningen själv ifrågasättas?",
    fHorizonHint:
      "Inte en deadline. När det passerar frågar Tend om det här fortfarande är rätt sak.",

    /* Opening one. */
    openTitle: "Öppna en riktning",
    openIntro:
      "En mening räcker för att öppna den. Resten - om de vill det här eller om jobbet behöver " +
      'det, vad du redan sett, vad du lägger in - kommer senare, från "Förbered" på kortet, när ' +
      "du faktiskt har ett svar på det.",
    openConfirm: "Öppna",
    openedToast: "Öppnad.",

    /* Rewording, which is its own concept because the card is named after it. */
    rewordTitle: "Formulera om riktningen",
    rewordIntro:
      "Kortet är namngivet efter den här. Ändra den när du vet vad ni faktiskt kom överens om.",
    rewordAimLabel: "Riktningen som den står",
    rewordAimHint:
      "Vad de kommer att kunna GÖRA. Om den beskriver vad du gör för dem kommer du att mäta " +
      "fel person.",
    rewordGuessLabel: "Vad du trodde innan du frågade",
    rewordGuessHint: "Behålls som en anteckning, så den kan stå vid det de faktiskt sa.",
    save: "Spara",
    rewordedToast: "Omformulerad.",

    prepareTitle: "Förbered",
    prepareIntro: "Din sida av det. Öppnad där du lämnade den i stället för att fråga igen.",
    savedToast: "Sparat.",

    askedTitle: "Efter samtalet",
    askedIntro:
      "Vad som kom tillbaka. Det här skriver inte över något du gissade - gissningen sparas " +
      "vid sidan av.",

    /*
     * A declined direction is one of the three normal outcomes, so it is asked
     * about immediately rather than left as a status he has to remember to
     * change. The follow-up is the only question that matters.
     */
    declinedTitle: "De är inte intresserade. Kräver jobbet det ändå?",
    declinedBody:
      "Om det gör det slutar det här vara utveckling och blir ett krav - som måste sägas en " +
      'gång, rakt ut, inklusive vad som följer om det inte uppfylls. "Du står kvar där du är" ' +
      "är en fullgod sådan sak.\n\nOm det inte gör det är rätt drag att släppa det och säga " +
      "till dem att du gjort det. Att i tysthet hålla hoppet vid liv är det enda alternativ " +
      "som kostar dig relationen.",
    declinedConfirm: "Jobbet kräver det",
    expectationTitle: "Uttala det som ett krav",
    letGoTitle: "Släpp det",
    expectationIntro:
      "Skriv kravet som du kommer att säga det till dem. Tydlighet om huruvida, uppmuntran om hur.",
    letGoIntro:
      "Skriv varför du släppte det. Det stannar läsbart, så det här kan inte bli en tyst " +
      "besvikelse som ingen satte ord på.",
    expectationWhy: "Kravet, i dina ord",
    letGoWhy: "Varför du släppte det",
    saidLabel: "Jag har berättat för dem",
    saidHint: "Lämna den obockad om du inte gjort det än. Tend fortsätter fråga tills du har.",
    recordedToast: "Registrerat.",

    talkedTitle: "Det kom upp",
    talkedIntro:
      "Det här flyttar samtalsklockan och inget annat. Om de faktiskt gjort saken är ett eget " +
      "svar, för glappet mellan de två räkningarna är den enda användbara läsningen här.",
    talkedNoteLabel: "En rad, frivilligt",
    talkedNotePlaceholder: "Var det står",
    when: "När",
    logIt: "Logga",
    loggedToast: "Loggat.",

    /*
     * The marker seen, and the only right moment to ask who else needs to hear
     * it. Development nobody outside the one-to-one ever sees converts into
     * nothing: no level, no salary, no next assignment.
     */
    observedTitle: "Jag såg det",
    observedIntro:
      "Det du sa att du skulle se, faktiskt observerat snarare än diskuterat. Det enda " +
      "underlaget här inne på att något av det här fungerar.",
    observedNoteLabel: "Vad du såg",
    observedNotePlaceholder: "Höll genomgången den 14:e, jag sa inget",
    tellLabel: "Vem mer behöver höra det här?",
    tellNobody: "Ingen, det stannar mellan oss",
    tellHint:
      "Utveckling som bara ni två sett omvandlas till ingenting. Att välja någon loggar det " +
      "som ett löfte, så att det inte kan bli av i tysthet.",
    recordIt: "Registrera",
    /** @param {string} name @param {string} said */
    tellPromise: (name, said) => `Berätta för ${name}: ${said}`,
    /** @param {string} name */
    tellPromiseToast: (name) => `Löfte att berätta för ${name} loggat.`,
    them: "dem",

    endTitle: "Avsluta",
    endIntro:
      "Varje avslut här är ett fullgott avslut, inklusive att släppa det. Någon som är nöjd " +
      "där de är och gör ett stabilt arbete är inget problem att lösa.",
    endHowLabel: "Hur den avslutas",
    endWhyLabel: "Varför",
    endWhyHint:
      "Behålls och är läsbart efteråt. En riktning som avslutas utan skäl blir en stämning i " +
      "rummet ett halvår senare som ingen av er kan sätta ord på.",
    endSaidHint:
      "Obockad tills du faktiskt gjort det. Att släppa en riktning i tysthet är sämre än både " +
      "att driva den och att acceptera: de känner besvikelsen ändå och får aldrig höra att det " +
      "är över.",
    notedToast: "Noterat.",

    /*
     * The removal wording says which fact it asserts rather than which mechanism
     * it runs, and the loss comes first. The old version opened with the
     * reassuring half - the events stay in the log - and put the loss in a
     * subordinate clause, so the sentence a reader took away said nothing was
     * lost.
     */
    removeTitle: "Var den här riktningen aldrig verklig?",
    /** @param {string} aim */
    removeBody: (aim) =>
      `"${aim}" försvinner, och slutar vara läsbar någonstans - personens sida, ett kort i ` +
      `Inför, allt en agent läser. Rätt för en riktning som öppnats på fel person eller två ` +
      `gånger av misstag.\n\nOm den var verklig och är över, stäng den med "Avsluta" i ` +
      `stället. Det behåller riktningen och skälet den avslutades, vilket är det som svarar ` +
      `på "varför pratar vi inte om det här längre" nästa vår.`,
    removeConfirm: "Den var aldrig verklig",
    removedToast: "Borttagen."
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
    openButton: "Öppna en plan",
    empty:
      "Ingen plan. En plan är för någon under ribban - den har ett datum med en konsekvens och " +
      "de kan inte tacka nej till den, vilket är det som gör den till något annat än en riktning.",

    /*
     * What state it is in. A draft is not a lesser plan: it is where most
     * plans live for a week or two while he works out what he thinks, so the
     * word has to say "not started" rather than "unfinished".
     */
    draftPill: "inte startad",
    runningPill: "pågår",
    /** @param {number} n */
    stillNeeds: (n) => `${n} kvar att svara på innan den kan starta`,

    /*
     * The finding the whole shape was built for. On the real case the answer
     * is no: the person says he has no technical challenge while the plan's
     * premise is a toolchain gap - so the opening sentence assumes something
     * that is not shared.
     */
    premiseWarning:
      "De vet inte än. Planens ingång förutsätter en gemensam förståelse som inte finns, så att " +
      "säga det är nästa steg snarare än att starta.",

    /* The fields, as they read on the card. */
    fGap: "Vad som ligger under ribban",
    fGapHint: "En sak. Tre saker är ett samtal ingen kan agera på.",
    fTheyKnow: "Vet de om det?",
    fTheyKnowHint:
      "Andra frågan med flit, före målet och före måttet. Allt efter den är värdelöst om svaret " +
      "är nej och inget har sagts.",
    fTheyKnowYes: "Ja, jag har sagt det till dem",
    fTheyKnowNo: "Nej, inte än",
    fSaidOutLoud: "Vad du faktiskt sa, i dina ord",
    fSaidOutLoudHint:
      "Inte en sammanfattning. Vad du sa, så att du senare kan avgöra om det landade.",
    fGoal: "Vad du försöker uppnå med att köra den",
    fGoalHint: "Bara din. Det här syns aldrig i det de får.",
    fDelivery: "Det verkliga arbetet det sker genom",
    fDeliveryHint: "Verkliga insatser rör människor; en övning gör det inte.",
    fMeasure: "Vad som ska vara sant i slutet",
    fBaseline: "Och vad som är sant nu",
    fBaselineHint:
      "Utan det här betyder måttet ingenting, och planen slutar i ett gräl om huruvida något " +
      "ändrades.",
    fDue: "Datumet",
    fDueHint:
      "Ett datum med en konsekvens, inte en horisont. Det är det som skiljer det här från en " +
      "riktning.",
    fIfNotMet: "Vad som händer om den inte uppfylls",
    fIfNotMetHint:
      "Sagt i samma samtal, inte sparat till slutet. En konsekvens ingen uttalat är en som " +
      "överraskar någon.",
    fHr: "Är HR inblandad?",
    fHrHint: "Besvarad före första samtalet. Aldrig efter det.",
    fGrowth: "En riktning som delar arbete med den här, frivilligt",
    fGrowthHint: "Länka i stället för att dubblera. Samma arbete kan tjäna båda.",

    openTitle: "Öppna en plan",
    openIntro:
      "Fyll i det du vet. Det som saknas är det den fortfarande behöver innan den kan starta - " +
      "inget fel, bara en plan som inte är klar.",
    openConfirm: "Spara",
    openedToast: "Sparat.",
    editTitle: "Planen",
    editConfirm: "Spara",
    editedToast: "Sparat.",

    /* The copy the person is given. */
    copyTitle: "Vad de får",
    copyIntro:
      "Fem rader, och inget annat. Målet du valde, HR-svaret och vad du sa privat stannar hos dig.",
    copyGap: "Vad som behöver ändras",
    copyDelivery: "Var det sker",
    copyMeasure: "Hur vi båda kommer att veta",
    copyDue: "Senast när",
    copyIfNotMet: "Om det inte uppfylls",
    copyButton: "Deras kopia",
    copyClose: "Stäng",

    /* Ending it. */
    endButton: "Avsluta",
    endTitle: "Hur slutade den?",
    endMet: "Uppfylld - de är över ribban",
    endNotMet: "Inte uppfylld",
    endDropped: "Släppt - inte rätt instrument trots allt",
    endHowLabel: "Hur den slutade",
    endWhyLabel: "Vad som avgjorde det",
    endWhyHint:
      "Krävs för allt utom uppfylld. En plan som avslutas utan skäl blir en stämning i rummet " +
      "ett halvår senare som ingen av er kan sätta ord på - och den här hade en konsekvens på sig.",
    endConfirm: "Registrera",
    endedToast: "Registrerat."
  },

  work: {
    title: "Arbete",
    sub:
      "Projekt att hålla ett öga på, och delarna inuti dem som du lämnat över i någon grad.",
    addProject: "Lägg till projekt",
    addStake: "Lägg till stakeholder",
    addStream: "Lägg till arbetsområde",
    readFailedProjects: "projekten",
    readFailedStreams: "arbetsområdena",

    /* A project row. */
    /** @param {string} when */
    lastLookedAt: (when) => `senast tittat på ${when}`,
    view: "Visa",
    logLook: "Logga en titt",
    archive: "Arkivera",
    remove: "Ta bort",

    /* A stakeholder row. The clock is per person AND project. */
    /** @param {string} note */
    lastTime: (note) => `senast: ${note}`,
    /** @param {string} every @param {string} last */
    stakeMeta: (every, last) => `var ${every} &middot; senast ${last}`,
    logUpdate: "Logga en uppdatering",
    edit: "Ändra",

    /* A workstream card. Leaving the level unset is itself flagged, because
       unstated delegation is the failure rather than missing data. */
    noLevelSet: "ingen nivå satt",
    nobodyNamed: "ingen utpekad",
    /** @param {string} owner @param {string} project @param {string} reviewed */
    streamMeta: (owner, project, reviewed) => `${owner}${project} · genomgånget ${reviewed}`,
    /** @param {string} project */
    streamProject: (project) => ` · ${project}`,
    setLevelButton: "Sätt nivån",
    changeLevelButton: "Ändra nivå",
    logReview: "Logga en genomgång",

    noPeopleYet: "Lägg till personer först om du vill peka ut en ägare på ett arbetsområde.",

    /* The three groups, and the two versions of each empty state - "nothing
       yet" and "everything is archived" are different facts. */
    projectsGroup: "Projekt",
    projectsAllArchived:
      "Inga projekt aktiva. Varje projekt här är arkiverat - öppna gruppen nedan för att ta " +
      "tillbaka ett.",
    projectsNone:
      "Inga projekt än. Lägg till dem du ansvarar för utan att vara med i det daliga arbetet.",

    stakesGroup: "Väntar på dig",
    stakesNone:
      "Ingen står som väntande på en rapport. En stakeholder är någon som beror på vad du " +
      "levererar utan att vara din medarbetare eller din jämlike - den enda riktningen där " +
      "tystnad förblir osynlig till något glider.",
    stakesNote:
      "Klockan går per person OCH projekt. En uppdatering om ett projekt svarar inte för ett " +
      "annat, vilket är hela skälet att det här inte är ett fält på en person: ett kvartals " +
      "tystnad om det någon beror på ska inte gömmas bakom två veckors prat om något annat.",

    streamsGroup: "Arbetsområden",
    streamsAllArchived:
      "Inga arbetsområden aktiva. Varje ett här är arkiverat - öppna gruppen nedan för att ta " +
      "tillbaka ett.",
    streamsNone:
      "Inget överlämnat än. Ett arbetsområde är en bit arbete med en ägare och en uttalad " +
      "nivå av överlämning.",

    archivedProjectsGroup: "Arkiverade projekt",
    archivedStreamsGroup: "Arkiverade arbetsområden",
    /** @param {string} date */
    archivedOn: (date) => `arkiverat ${date}`,
    unarchive: "Ta tillbaka",

    /* The delegation level, shared with Läget which offers it off an unset one. */
    /** @param {string} name */
    levelTitle: (name) => `Hur långt har du klivit tillbaka på ${name}?`,
    levelTitleBare: "Sätt delegeringsnivån",
    levelIntro:
      "Hur nära du följer upp beror på hur erfaren den här personen är på just den här " +
      "uppgiften, inte på hur bra de är i allmänhet. Nivån avgör hur ofta Tend förväntar sig " +
      "en genomgång - och frånvaron av en genomgång är det som skiljer att delegera från att " +
      "abdikera.",
    levelLabel: "Nivå",
    levelConfirm: "Sätt den",
    levelSetToast: "Nivå satt.",

    /* One project's page. */
    backToWork: "← Arbete",
    readFailedProject: "det projektet",
    projectArchivedRole:
      "Arkiverat. Historiken finns här; det är ute ur varje framåtblickande vy.",
    projectRole: "Vad som tittats på, och vad som finns inuti det.",
    cadencesBlock: "Takter",
    cadencesNone: "Ingen takt över det här projektet, så inget här kan bli sent.",
    /** @param {string} duty @param {string} target @param {string} last */
    cadenceLine: (duty, target, last) =>
      `<strong>${duty}</strong> - mål ${target}, senast ${last}`,
    checkInsBlock: "Avstämningar",
    checkInsNone:
      "Inget loggat på det än. En titt registrerad här är det som stoppar klockan.",
    fromANote: "från en anteckning",
    notRight: "Blev fel",
    streamsInBlock: "Arbetsområden inuti det",
    streamsInNone: "Inga. Ett projekt utan arbetsområden har inget överlämnat.",
    /** @param {string} owner */
    streamOwner: (owner) => ` - ${owner}`,
    streamNoOwner: " - ingen äger det",
    interestedBlock: "Väntar på att höra om det",
    interestedNone: "Ingen står och väntar på en uppdatering om det här.",
    /** @param {string} label */
    interestedLabel: (label) => ` - ${label}`,

    /* Taking back a check-in. Same guarantee as a mislogged contact. */
    unlogTitle: "Ta tillbaka det här?",
    /** @param {string} what */
    unlogBody: (what) =>
      `"${what}" slutar räknas, så klockan det flyttade går tillbaka dit den var. Händelsen ` +
      `stannar i loggen - inget här tas någonsin riktigt bort - den slutar bara vara underlag.`,
    unlogConfirm: "Ta tillbaka",
    unlogToast: "Tillbakataget.",

    /* Adding a stakeholder, in two steps rather than one long form. */
    noRosterTitle: "Ingen på rostern än",
    noRosterBody:
      "En stakeholder är en person först. Lägg till dem under Personer, kom sedan tillbaka - " +
      "relationstypen att ge dem är Stakeholder, som ärver ingen av plikterna som är skrivna " +
      "för dem du leder.",
    noProjectsTitle: "Inga projekt än",
    noProjectsBody:
      "En stakeholder väntar på att höra om något specifikt, så projektet måste finnas först.",
    understood: "Just det",
    stakeTitle: "Vem väntar på dig?",
    stakeIntro:
      "Någon som beror på vad du levererar utan att vara din medarbetare eller din jämlike. " +
      "Skyldigheten går per person OCH projekt: att berätta för dem om en sak svarar inte för " +
      "en annan.",
    stakeWho: "Vem",
    stakeAbout: "Om vad",
    stakeCadence: "Hur ofta, i dagar",
    stakeCadenceHint:
      "En månad är en rapporteringscykel. Kortare för någon nära arbetet, längre för en " +
      "avlägsen sponsor.",
    stakeWhat: "Vad de faktiskt vill veta, frivilligt",
    stakeWhatPlaceholder: "Om migreringen landar innan kvartalet stänger",
    stakeSince: "Väntar sedan",
    stakeSinceHint:
      "Bakdatera det om de varit i ovisshet en tid - annars smickrar den första månaden av " +
      "registret dig.",
    add: "Lägg till",
    addedToast: "Tillagt.",

    /** @param {string} name */
    editStakeTitle: (name) => `Hur ofta ska ${name} höra från dig?`,
    editStakeWhat: "Vad de vill veta, frivilligt",
    save: "Spara",
    savedToast: "Sparat.",

    /** @param {string} what */
    logUpdateTitle: (what) => `Vad berättade du för dem om ${what}?`,
    logUpdateFallback: "det",
    logUpdateIntro: "En rad räcker. Poängen med anteckningen är datumet, inte rapporten.",
    logUpdateNote: "Vad du sa, frivilligt",
    when: "När",
    logIt: "Logga",
    loggedToast: "Loggat.",

    /** @param {string} name */
    removeStakeTitle: (name) => `Ta bort ${name}?`,
    removeStakeBody:
      "De slutar dyka upp som väntande på en rapport om det här projektet. Uppdateringarna du " +
      "redan loggat står kvar, och att vara stakeholder i något annat är orört.",
    removedToast: "Borttaget.",

    addProjectTitle: "Lägg till ett projekt",
    projectName: "Namn",
    projectSince: "Sedan när",
    projectSinceHint:
      "När du tog det på dig. Bakdatera det och ett projekt du ignorerat visas som ignorerat " +
      "i stället för som nyss kontrollerat.",
    /** @param {string} name */
    addedNamed: (name) => `${name} tillagt.`,

    addStreamTitle: "Lägg till ett arbetsområde",
    addStreamIntro:
      "En bit arbete med en ägare. Att lämna nivån osatt flaggas i sig, eftersom outtalad " +
      "delegering är felet snarare än saknad data.",
    streamName: "Vad arbetet är",
    streamNamePlaceholder: "Omskrivning av renderaren",
    streamOwnerLabel: "Vem äger det",
    streamNobodyYet: "Ingen än",
    streamProjectLabel: "Del av vilket projekt",
    streamNoProject: "Inget",
    streamLevelLabel: "Hur långt du klivit tillbaka",

    /** @param {string} name */
    reviewTitle: (name) => `Genomgång av ${name}`,
    reviewIntro:
      "Det här är den övervakande halvan. Att logga den nollställer klockan nivån sätter.",
    foundNote: "Vad du fann, frivilligt",

    /** @param {string} name */
    checkInTitle: (name) => `Avstämning om ${name}`,

    /*
     * Archiving is reversible, unlike removing, so it gets its own gentler
     * dialog rather than reusing the danger-zone one.
     */
    /** @param {string} name */
    archiveProjectTitle: (name) => `Arkivera ${name}?`,
    archiveProjectBody:
      "Det slutar dyka upp i den här listan, i Läget och i uppmärksamhetspåminnelser. Varje " +
      "avstämning, stakeholder och genomgång som redan loggats på det står kvar precis som det " +
      "är och kan tittas på igen. Helt återställbart från den arkiverade listan.",
    /** @param {string} name */
    archivedToast: (name) => `${name} arkiverat.`,
    /** @param {string} name */
    unarchivedToast: (name) => `${name} tillbaka.`,
    /** @param {string} name */
    removeProjectTitle: (name) => `Ta bort ${name}?`,
    removeBody: "Det slutar bevakas. Historiken stannar i loggen.",

    /** @param {string} name */
    archiveStreamTitle: (name) => `Arkivera ${name}?`,
    archiveStreamBody:
      "Det slutar dyka upp i den här listan, i Läget och i uppmärksamhetspåminnelser. Varje " +
      "genomgång som redan loggats på det står kvar precis som det är och kan tittas på igen. " +
      "Helt återställbart från den arkiverade listan.",
    /** @param {string} name */
    removeStreamTitle: (name) => `Ta bort ${name}?`
  },

  waiting: {
    /*
     * On the daily page. The note is the whole ethic of the block: not an
     * alarm.
     *
     * "Väntar på svar" here and "Väntar på dig" for a stakeholder in the work
     * section. English said "waiting" for both directions and was ambiguous
     * about which - one of the three findings in the vocabulary survey - and
     * Swedish separates them at no cost.
     */
    groupTitle: "Väntar på svar",
    groupNote:
      "Inte sena på dig. Påminn, eller besluta utan det - båda är svar, och att " +
      "lämna det öppet är det enda som inte är det.",

    /* On a person's page. */
    blockTitle: "Väntar på dem",
    addButton: "Jag väntar på något",
    none: "Inget utestående från dem.",

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
      `väntat ${waitingFor} &middot; påmint ${chases}× &middot; senaste påminnelsen ${sinceNudge}`,
    /** @param {string} why */
    blocking: (why) => `Blockerar: ${why}`,
    chaseButton: "Jag påminde",
    stopButton: "Sluta vänta",

    /* Logging one. */
    addTitle: "Något du väntar på",
    addIntro:
      "Så att en fråga du skickat inte ruttnar i tysthet. Inget här behandlas någonsin som " +
      "sent på dig - poängen är att du kommer ihåg att påminna, eller att besluta utan det.",
    addWhatLabel: "Vad du bad om",
    addWhatPlaceholder: "Två frågor om feedbacken på schemavyn",
    addWhyLabel: "Vad det blockerar, frivilligt",
    addWhyHint: "Den halvan som avgör om du ska påminna eller gå runt det.",
    addAskedLabel: "När du frågade",
    addAskedHint:
      "Bakdatera det. Det här skrivs oftast ner dagen du märker att du sitter fast, inte dagen " +
      "du frågade.",
    addCadenceLabel: "Hur länge att vänta innan det är värt en påminnelse",
    addCadenceHint: "En vecka som standard. Kortare tjatar om en helt vanlig människovecka.",
    addConfirm: "Logga",
    addToast: "Loggat.",

    /* Chasing. */
    chaseTitle: "Jag påminde",
    chaseIntro:
      "Det här nollställer klockan och räknas upp. Räkningen är den användbara delen: tre " +
      "påminnelser utan svar är ett faktum om relationen, och var och en för sig kändes rimlig.",
    chaseNoteLabel: "Hur, på en rad, frivilligt",
    chaseNotePlaceholder: "Påminde honom i Discord-tråden",
    chaseWhenLabel: "När",
    chaseConfirm: "Logga",
    chaseToast: "Loggat.",

    /* Closing it, either way. */
    stopTitle: "Sluta vänta",
    stopIntro:
      "Båda avsluten är helt vanliga. Att besluta utan svaret är ett fullgott utfall, inget " +
      "misslyckande.",
    stopAsLabel: "Hur det slutade",
    stopWhyLabel: "Vad som kom tillbaka, eller vad du gjorde i stället",
    stopWhyHint:
      "Värt att behålla särskilt för de släppta. Det är det du kommer att vilja ha när svaret " +
      "till slut kommer och motsäger det du redan skickat.",
    stopConfirm: "Stäng det",
    stopToast: "Stängt.",

    /* Taking it back entirely. */
    unlogTitle: "Ta tillbaka det här?",
    /** @param {string} what */
    unlogBody: (what) =>
      `"${what}" slutar bevakas, tillsammans med varje påminnelse loggad på det.`,
    unlogConfirm: "Ta tillbaka",
    unlogToast: "Tillbakataget."
  },

  journal: {
    readFailedTitle: "Kunde inte läsa dagboken",
    title: "Dagen",
    /*
     * The private half's version carries the rule, because the cheaper half of
     * enforcing it is upstream: the labels say it while the entry is being
     * written, which is worth more than reading it back afterwards.
     */
    subPrivate:
      "Fyra rutor, alla frivilliga, ingen påminnelse och ingen streak. En regel, och den är hela " +
      "skälet att det här är tryggt att skriva: registrera vad som hände och din egen del i det, " +
      "aldrig den andra personens tillstånd. Det är den halvan du kan ändra, och den enda " +
      "versionen du skulle kunna visa personen det handlar om.",
    subWork:
      "Fyra rutor, alla frivilliga, ingen påminnelse och ingen streak. Att missa dagar är " +
      "väntat - värdet ligger i en månad av dem snarare än i någon enskild, så det enda som " +
      "spelar roll är att det är billigt att skriva en.",
    logMomentButton: "Logga något",
    writeButton: "Skriv idag",
    tooThinNote:
      " För få för att kalla något ett mönster än, vilket är värt att veta innan någon läsning " +
      "läses.",
    empty:
      "Inget skrivet än. Frågorna är vad dagen gick till, vad du undvek, och vad du skulle göra " +
      "annorlunda - inget av det något Tend kan räkna ut själv, vilket är det enda skälet att " +
      "den frågar.",

    /* Moments, on this page because one involving three people has no single
       page it belongs to. */
    momentsGroup: "Ögonblick",
    /** @param {number} n */
    momentsMore: (n) => `${n} fler, på sidorna för personerna de rörde.`,

    /* Reading across the moments. Every finding has the writer as its subject,
       which is what makes pattern-finding safe to have in this half at all. */
    patternsTitle: "Vad som återkommer",
    /** @param {number} moments @param {number} days */
    patternsTooThin: (moments, days) =>
      `${moments} ${moments === 1 ? "ögonblick" : "ögonblick"} över ${days} ` +
      `${days === 1 ? "dag" : "dagar"}. En läsning behöver minst fyra över minst tre skilda ` +
      `dagar, eftersom flera loggade i ett svep beskriver en eftermiddag hur många rader de än ` +
      `blir.`,
    patternsReady:
      "Läser vad du skrev och namnger vad som återkommer i vad DU gjorde. Aldrig hur någon " +
      "annan i dem är - den halvan är inte appens att sätta ord på, och det är därför det här " +
      "är tryggt att köra alls.",
    patternsNoModel: "Ingen modell går att nå, så de här kan bara läsas av dig.",
    patternsNote: "Inget skrivs, sparas eller skickas någonstans",
    patternsReading: "Läser...",
    patternsRead: "Läs tvärs över dem",
    patternsFailedTitle: "Kunde inte läsa tvärs över dem",
    close: "Stäng",
    patternsNothing:
      "Inget återkommer över de här än, vilket är ett riktigt svar snarare än ett misslyckande.",
    /** @param {string} days */
    patternsDays: (days) => `${days} dagar`,
    toPutToYourself: "Att ställa till dig själv",
    doneWithIt: "Klar med det",

    /* The journal reading. Every state says what would change it, because a
       disabled button that says nothing reads as broken. */
    readingGroup: "Läsningen",
    readTitle: "Läs de senaste 30 dagarna",
    readTooThin:
      "En läsning behöver minst fyra poster över minst tre skilda dagar. Färre än så och ett " +
      "mönster är en kväll upprepad med självförtroende - som sedan minns nästa månad som ett " +
      "faktum.",
    readReady:
      "Läser varje post i fönstret och namnger vad som återkommer: vart dagarna faktiskt gick, " +
      "och vad som gång på gång undveks. Inget skrivs om du inte behåller det.",
    readNoModel: "Ingen modell går att nå, så posterna kan bara läsas av dig.",
    readWhatItLooksFor:
      "Vad den letar efter är de två sakerna som är osynliga på dagen och uppenbara över en " +
      "månad. Den ställer frågor snarare än att döma, och räkningarna appen registrerade över " +
      "samma dagar följer med - ett minne av en månad är sämre än ett minne av en dag, och bara " +
      "en av de två går att kontrollera.",
    reading: "Läser...",
    readThem: "Läs dem",

    /* Kept readings. The second one is where this earns anything: a pattern that
       survived three months is a different fact from one noticed tonight. */
    keptGroup: "Sparade läsningar",
    /*
     * Both halves inflect, and both are strings here because the service sends
     * them worded. Compared as numbers so "1 post över 1 dag" reads right - the
     * first version said "1 poster över 1 dagar", which a walkthrough check
     * caught by asserting the sentence rather than its shape.
     */
    /** @param {string} entries @param {string} spread */
    keptCoverage: (entries, spread) =>
      `${entries} ${Number(entries) === 1 ? "post" : "poster"} över ${spread} ` +
      `${Number(spread) === 1 ? "dag" : "dagar"}`,
    keptAvoided: "Undveks gång på gång",
    keptWentInto: "Vart dagarna gick",
    keptSaidVsDid: "Mot vad du sa att du skulle göra",
    keptQuestions: "Värt att ställa till dig själv",
    /** @param {string} days @param {string} by */
    keptFoot: (days, by) => `Täckte de ${days} dagarna fram till då${by}.`,
    /** @param {string} who */
    keptReadBy: (who) => `, läst av ${who}`,
    remove: "Ta bort",

    /* One day. */
    entryFoot: "Skrivet av dig. Läst av passet ovan, när du ber om det.",
    readBackButton: "Läs tillbaka",
    edit: "Ändra",
    readingBack: "Läser tillbaka...",
    ownPartNoModel: "Ingen modell går att nå, så inget kan läsa tillbaka det här.",

    /* Logging a moment. */
    momentNoRoster: "Lägg till någon först - ett ögonblick handlar om personerna som var i det.",
    momentTitle: "Vad hände?",
    momentIntro:
      "En händelse snarare än en dag, så logga så många som dagen rymmer. Din egen del i det är " +
      "den halva som är värd att behålla - det är den halvan du kan ändra, och den enda " +
      "versionen du skulle kunna visa personen det handlar om.",
    momentWhatLabel: "Vad som hände",
    momentWhatHint: "Frivilligt. Ofta uppenbart för dig, och att hoppa över det kostar inget.",
    momentPartLabel: "Min del i det",
    momentPartHint: "Vad du gjorde, valde, kände eller undvek. Inte hur de var.",
    momentWhoLabel: "Vilka som var med",
    momentWhoHint: "Skrivet en gång, och det dyker upp på var och ens sida.",
    momentWhenLabel: "När",
    momentConfirm: "Behåll det",
    momentNobody:
      "Bocka minst en person - ett ögonblick med ingen i hör hemma i dagen.",
    keptToast: "Behållet.",
    removedToast: "Borttaget.",

    /*
     * Writing the day. No people on this form, deliberately - a whole-day
     * retrospective ticked against four names put one day's text onto four
     * people's pages. What belongs to a person is a moment.
     */
    /** @param {string} day */
    writeEditTitle: (day) => `Ändra ${day}`,
    writeTitle: "Hur var dagen?",
    writeIntro:
      "Lämna vilken som helst av dem tom. En ifylld ruta är en riktig post, och tre obligatoriska " +
      "skulle bara producera något påhittat vid elva på kvällen - som läses som ett faktum " +
      "efteråt och är sämre än ingenting.",
    writeWhichDay: "Vilken dag",
    writeConfirm: "Behåll det"
  },

  reflection: {
    title: "Reflektion",
    sub:
      "Sporadisk, aldrig sen, och två fasta frågor i stället för en tom ruta: vad som gick bra " +
      "den senaste veckan eller så, och vad du skulle göra annorlunda. Inget här är " +
      "obligatoriskt, och inget här läses tillbaka för någon.",
    addButton: "Lägg till en reflektion",
    empty:
      "Inget skrivet än. De två frågorna är vad som gick bra och vad du skulle göra " +
      "annorlunda - svara på en av dem, eller båda.",
    writtenBy: "Skrivet av dig.",
    remove: "Ta bort",
    /* Both handed to `readFailedHtml`, which wraps them in a sentence. */
    readFailedReflections: "reflektionerna",
    readFailedAims: "dina mål",

    /* The aims block. */
    aimsTitle: "Vad jag jobbar med hos mig själv",
    aimsAtLimit: "Två är gränsen. Nå eller släpp ett först.",
    aimsSetButton: "Sätt ett mål",
    aimsEmpty:
      "Inget satt. Ett mål säger vad du vill kunna göra och hur du kommer att veta - registret " +
      "som räknar det, någon annan som säger det, eller att du loggar tillfällena. Utan något " +
      "av det kan det bara skjutas till nästa gång.",

    /* One aim's card. The three headings are the fields doing one job each. */
    aimStillToAnswer: "Kvar att svara på",
    aimHowIKnow: "Hur jag kommer att veta",
    aimWhereItHappens: "Var det sker",
    aimAsking: "Frågar",
    aimNothingLogged: "Inget loggat än.",
    /**
     * The two counts side by side rather than as one number, because the pair IS
     * the evaluation: eight occasions logged and two of them taken says something
     * neither figure says alone.
     *
     * @param {number} seen
     * @param {number} missed
     * @param {string} last
     */
    aimCounts: (seen, missed, last) => `${seen} tagna, ${missed} missade, senast ${last}`,
    aimLogButton: "Logga ett tillfälle",
    aimCloseButton: "Stäng det",

    /* Setting one. The source is asked before the test, deliberately. */
    setTitle: "Sätt ett mål",
    setIntro:
      "Något du vill kunna göra, och hur du kommer att veta. Utan det kan det bara skjutas " +
      "till nästa gång, vilket är vad en utvecklingspunkt utan något att se blir.",
    setAimLabel: "Vad du vill kunna göra",
    setSourceLabel: "Hur du kommer att veta",
    setSourceLogged: "Du loggar tillfällena, tagna och missade",
    setSourceRecord: "Registret kan räkna det",
    setSourceAsked: "Någon annan säger det",
    setMeasureLabel: "Det faktiska testet, i ord",
    setAsksWhoLabel: "Vem du frågar, om någon annan avgör",
    setThroughLabel: "Vilket verkligt arbete det här sker i",
    setThroughPlaceholder: "Tisdagsmötet, varje 1-1",
    setThroughHint: "Utan det här väntar det på en ledig kväll.",
    setWhyLabel: "Varför det är värt månaderna",
    setConfirm: "Sätt det",
    setToast: "Satt.",

    /* Logging an occasion. A miss is a choice on the form, not prose. */
    /** @param {string} aim */
    logTitle: (aim) => `Ett tillfälle: ${aim}`,
    logIntro:
      "Båda sorterna räknas. Glappet mellan tillfällena du tog och de du missade är det som " +
      "gör det här mätbart snarare än en känsla om kvartalet.",
    logNoteLabel: "Vad som hände",
    logWhichLabel: "Vilket var det",
    logYes: "Jag gjorde saken",
    logNo: "Tillfället kom och jag gjorde det inte",
    logConfirm: "Logga",
    logToast: "Loggat.",

    /* Closing one. */
    /** @param {string} aim */
    closeTitle: (aim) => `Stäng: ${aim}`,
    closeIntro:
      "Nått och släppt är båda avslut och bara ett är en framgång. Att säga vilket är hela " +
      "poängen - ett mål som tyst överges är vad den här formen finns för att förhindra.",
    closeHowLabel: "Hur det slutade",
    closeReached: "Nått - det kommer naturligt nu",
    closeDropped: "Släppt - inte rätt sak trots allt",
    closeWhyLabel: "Vad som avgjorde det",
    closeConfirm: "Stäng det",
    closeToast: "Stängt.",

    /* Writing a reflection. */
    writeTitle: "Hur gick veckan?",
    writeIntro: "Svara på minst en av de två första - bara anteckningar är ingen reflektion.",
    writeConfirm: "Behåll det",
    writeToast: "Behållet.",
    removedToast: "Borttaget."
  },

  role: {
    title: "Rollkarta",
    sub:
      "Vad jobbet kräver av dig, och hur du ligger till mot det. Ändra vad som helst av det - " +
      "en plikt du aldrig agerar på är sämre än ingen plikt alls.",
    addButton: "Lägg till en plikt",

    /* Nothing here yet. The seeded set is proposals, never decisions. */
    seedTitle: "Inget här än",
    seedWhy:
      "Börja från en uppsättning hämtad ur ledarskapsläsning: tre plikter de flesta redan " +
      "utövar, fem värda att överväga, tre månadsfrågor, och en uppsättning stående ämnen att ta " +
      "upp med din egen chef och dina sidoordnade. Förslagen gör ingenting förrän du accepterar " +
      "dem, och du kan ändra eller ta bort varenda en.",
    seedOr: "Eller skriv dina egna från början",
    seedButton: "Sätt upp rollkartan",
    seedOwnButton: "Skriv mina egna",

    /* A proposed duty. */
    proposedPill: "föreslagen",
    /** @param {string} every @param {string} source */
    proposedMeta: (every, source) => `Föreslagen var ${every} · från ${source}`,
    acceptButton: "Lägg till i min karta",
    adjustButton: "Justera först",
    declineButton: "Inte för mig",

    /* An accepted one. */
    /** @param {string} behind */
    behindPill: (behind) => `efter med ${behind}`,
    /**
     * @param {string} every
     * @param {string} appliesTo
     * @param {string} source
     * @param {boolean} guarded
     * @param {boolean} pausedForLeavers
     */
    activeMeta: (every, appliesTo, source, guarded, pausedForLeavers) =>
      `Var ${every} · ${appliesTo} · från ${source}` +
      (guarded ? " · skyddad" : "") +
      (pausedForLeavers ? " · pausad för dem som slutar" : ""),
    editButton: "Ändra",
    removeButton: "Ta bort",

    /* The groups. */
    proposedGroup: "Föreslagna, obeslutade",
    activeGroup: "Dina, aktiva",
    activeEmpty: "Inget aktivt än.",
    questionsGroup: "Månadsfrågor",
    questionsNote:
      "Det enda Tend inte kan räkna ut själv, så den frågar. De dyker upp i Läget när de är " +
      "aktuella.",
    neverAsked: "aldrig frågad",
    /** @param {string} when */
    asked: (when) => `frågad ${when}`,

    topicsGroup: "Ämnen att ta upp",
    topicsNote:
      "Inte plikter. En plikt frågar om du pratat med någon alls och dyker upp i Läget när du " +
      "inte har; ett ämne är vad du faktiskt ska säga, och det syns bara på den personens kort " +
      "i Inför. Det här är de två riktningarna inget annat täcker: uppåt, där frågorna handlar " +
      "om vad du vill snarare än vad du är skyldig, och sideways, där det inte finns någon " +
      "formell kanal i någon riktning.",
    /** @param {number} days @param {string} scope */
    topicMeta: (days, scope) => `var ${days} dagar &middot; ${scope}`,
    topicOnePerson: "en person",
    topicNobody: "ingen än",
    useItButton: "Använd det",

    /* The duty form. */
    fName: "Vad det är",
    fNamePlaceholder: "1-1",
    fMeans: "Vad det betyder i praktiken",
    fMeansHint:
      "Med dina egna ord. Det här är vad du läser om ett halvår när du glömt varför du lade " +
      "till den.",
    fAppliesTo: "Gäller",
    fCadence: "Hur ofta, i dagar",
    fGuarded: "Dämpa aldrig den här, inte ens under ett fokus",
    fGuardedHint:
      "För de saker en tung månad inte får begrava. Observera att ett fokus aldrig tar bort " +
      "något kritiskt från Läget vare sig det här är satt eller inte - det håller tillbaka det " +
      "mjukaste skiktet, och att skydda skyddar även skiktet ovanför.",
    fLeavers: "Gäller fortfarande någon som jobbar ut sin uppsägningstid",
    fLeaversHint:
      "Låt den vara på för en 1-1: uppsägningstiden är när överlämningen ordnas. Slå av den " +
      "för allt som är tänkt att utveckla någon, som en feedback-runda - att köra en för någon " +
      "på väg ut är arbete för alla och ändrar ingenting.",

    /* Relationships, asked separately because the answer only makes sense for a
       person-shaped duty. */
    relationsTitle: "Vem gäller den?",
    relationsIntro: "Lämna alla av för att mena alla.",
    relationsConfirm: "Klar",

    addTitle: "Lägg till en plikt",
    addIntro:
      "Något jobbet kräver av dig som kan försummas. Håll kartan kort - en lång lista är en " +
      "du slutar läsa.",
    addConfirm: "Nästa",
    addedToast: "Tillagd.",
    /** @param {string} name */
    editTitle: (name) => `Ändra ${name}`,
    editConfirm: "Spara",
    savedToast: "Sparat.",

    seededToast: "Rollkartan uppsatt.",
    acceptedToast: "Tillagd i din karta.",
    declinedToast: "Avvisad.",
    topicAcceptedToast: "Det dyker upp nästa gång du förbereder dig för dem.",

    removeTopicTitle: "Ta bort det här ämnet?",
    /** @param {string} name */
    removeTopicBody: (name) =>
      `"${name}" slutar dyka upp på någons kort. De gånger du redan markerat det som taget ` +
      `står kvar.`,
    removeConfirm: "Ta bort",
    removedToast: "Borttaget.",
    /** @param {string} name */
    removeDutyTitle: (name) => `Ta bort "${name}"?`,
    removeDutyBody:
      "Den slutar gälla någon och slutar dyka upp i Läget. Kontakten du redan loggat står kvar."
  },

  decisions: {
    readFailedTitle: "Kunde inte läsa datan",
    title: "Beslut",
    sub:
      "Vad som beslutades om organisationen, varför, och vad som förkastades. Varje " +
      "ett bär ett datum det kommer tillbaka på, vilket är det som gör det till något " +
      "du kan besluta snabbt: ett beslut med ett återkomstdatum är inte för alltid.",
    codeNote: "Koden har DECISIONS.md. Det här är den halvan som inte har någon commit-historik.",
    addButton: "Registrera ett beslut",
    empty:
      "Inget loggat än. De som är värda att registrera är de som omförhandlas: vem " +
      "som äger vad, vem som inte ersätts, vad som får vänta en cykel.",

    /* The three bands, in the order they need you. */
    proposedBand: "Föreslagna, inte registrerade än",
    proposedNote:
      "En agent läste de här någonstans. Att registrera ett är det som startar dess klocka.",
    revisitBand: "Värt en titt igen",
    revisitNote: "Datumet du satte har passerat. Att säga att det gäller tar ett klick.",
    loggedBand: "Loggade",

    /* A proposal. */
    proposedBadge: "föreslaget",
    /** @param {string} source */
    readIn: (source) => `Läst i ${source}`,
    noSource: "Ingen källa angiven",
    /** @param {string} who */
    proposedBy: (who) => ` &middot; av ${who}`,
    recordIt: "Registrera det",
    editFirst: "Ändra först",
    notADecision: "Inget beslut",

    /* One asking to be looked at again. */
    /** @param {string} by */
    dueBadge: (by) => `aktuellt ${by}`,
    dueNow: "nu",
    revisitSrc: "Du satte det här datumet. Inget har hänt med beslutet.",
    stillHolds: "Det gäller fortfarande",
    changeIt: "Ändra det",
    reverseIt: "Riv upp det",

    /* One in the log. */
    noRevisit: "&middot; inget återkomstdatum",
    /** @param {string} date */
    backOn: (date) => `&middot; tillbaka ${date}`,
    edit: "Ändra",

    /* Fields, and what is missing. */
    rejectedLabel: "Förkastat:",
    consultedLabel: "Rådfrågade:",
    /** @param {string} what */
    missing: (what) => `Saknar ${what}`,

    fWhat: "Vad som beslutades",
    fStatus: "Är det här beslutat, eller föreslår du det?",
    fStatusRecorded: "Beslutat - det här är vad vi gör",
    fStatusProposed: "Föreslaget - väntar på att någon ska hålla med",
    fStatusHint:
      "Ett förslag får inget återkomstdatum. Inget är beslutat än, så det finns inget att " +
      "komma tillbaka till.",
    fBecause: "Varför. Om ett år är det här det enda fältet som betyder något",
    fRejected: "Vad som övervägdes och inte valdes",
    fConsulted: "Vilka som rådfrågades",
    /*
     * Only people Tend already knows, and the list is the enforcement rather
     * than a warning. Adding somebody to the roster just to name them here
     * would be worse than leaving it empty: everyone on the roster is counted
     * by the attention signals.
     */
    fConsultedHint:
      "Alla som inte står på den här listan hör hemma i skälet i stället - att lägga dem på " +
      "rostern bara för att kunna namnge dem här skulle göra varje uppmärksamhetssignal " +
      "brusigare.",
    fConsultedHintEmpty:
      "Ingen på rostern än, så namnge vem det var i skälet i stället.",
    fRevisit: "Kom tillbaka till det om hur många dagar",
    fRevisitHint:
      "Ett datum är en dålig ersättning för en riktig utlösare. När det som borde ta upp det " +
      "igen är en händelse - nästa projekt av ett visst slag, en nyanställning - skriv " +
      "händelsen i skälet och betrakta det här som skyddsnätet som fångar det om händelsen " +
      "passerar obemärkt.",

    /* Recording one. */
    addTitle: "Registrera ett beslut",
    addIntro:
      "Återkomstdatumet är det fält som gör det här till ett verktyg. Ett beslut som kommer " +
      "tillbaka till dig är ett du kan fatta idag i stället för att samla information du inte " +
      "kommer att använda.",
    addConfirm: "Registrera det",

    /* Reversing, dropping, editing. */
    reverseTitle: "Riva upp det?",
    reverseBody:
      "Det stannar i loggen som upprivet, och slutar komma tillbaka. Resonemanget är " +
      "fortfarande läsbart, vilket är hela poängen med att behålla det.",
    reverseConfirm: "Riv upp det",
    dropTitle: "Inget beslut?",
    dropBody:
      "Förslaget tas bort och inget annat ändras. Att avvisa ett är också information - det " +
      "säger att läsningen var fel.",
    dropConfirm: "Ta bort det",
    editTitle: "Ändra",
    editConfirm: "Spara"
  },

  knowledge: {
    title: "Vad vet jag om det här?",
    /*
     * The example has to belong to the half. The placeholder is the only
     * instruction anybody reads here, and a work situation offered on a page
     * about family teaches the wrong use of the feature in the half where the
     * feature is newest.
     */
    /** @param {boolean} isPrivate */
    sub: (isPrivate) =>
      "Fråga om situationen du är i, inte om boken du halvt minns. Dina egna anteckningar " +
      `svarar - vad du läst och skrivit ner, och ${isPrivate ? "kvällarna du skrev upp" : "samtalen du haft"}.`,
    placeholderPrivate: "Jag blir kort mot någon när jag är trött",
    placeholderWork: "Någon i mitt team har slutat säga emot mig",
    searchButton: "Sök",
    /** @param {boolean} isPrivate */
    searchNote: (isPrivate) =>
      "Söker bara i rubriker och inledande rader. Inget öppnas förrän du ber om det." +
      (isPrivate
        ? " Det du läst når båda sidorna; anteckningar om personer stannar på den sida de skrevs på."
        : ""),

    searchFailedTitle: "Kunde inte söka",
    /** @param {string} searched */
    nothingShares: (searched) =>
      `Inget i ${searched} anteckningar delar ordval med det. Den här sökningen matchar ord, så ` +
      `prova orden du skulle ha skrivit då - eller skriv anteckningen, och den finns här nästa gång.`,

    sharesGroup: "Delar ordval",
    /** @param {number} n @param {string} searched */
    sharesMeta: (n, searched) => `${n} av ${searched}`,
    wordMatchNote: "En ordmatchning. Den hittar det uppenbara och missar resten.",
    reading: "Läser…",
    readProperly: "Läs dem ordentligt",
    readingOff: "Läsning är av - ingen Claude Code på den här maskinen.",
    untitled: "Utan titel",

    /*
     * The general-knowledge offer, below the notes and never the primary action
     * while the notes had something to say. It says what it sends, because every
     * other model button here opens notes and a name typed into the box travels
     * with this one.
     */
    generalOffer:
      "Inte ur dina anteckningar: vad som allmänt är känt om det här. Bara meningen du skrev " +
      "skickas - inga anteckningar, och ingen från din roster.",
    generalLooking: "Söker upp det…",
    generalAsk: "Vad är allmänt känt?",

    /* The general answer, framed as the weakest thing on the page. */
    generalTitle: "Allmänt känt - inte ur dina anteckningar",
    copy: "Kopiera",
    discard: "Släng",
    /** @param {string} who */
    onlyTheyCanAnswer: (who) => `Bara de kan svara: ${who}`,
    wherePeopleStart: "Var folk börjar",
    /** @param {string} what */
    wouldAnswer: (what) => `Vad som faktiskt skulle svara på det: ${what}`,
    generalWide:
      "Allmänt, och det här varierar kraftigt mellan människor - en utgångspunkt, och de " +
      "inblandade väger tyngre. ",
    generalNarrow: "Allmänt. ",
    /** @param {string} model @param {string} cost */
    generalFoot: (model, cost) =>
      `Skrivet av ${model}${cost} ur sin egen kunskap, inte ur något du läst. ` +
      `Inget sparades - kopiera det till Nib om det är värt att behålla.`,
    someModel: "en modell",

    /*
     * The copy, with its provenance line. A general summary pasted into Nib
     * without one is indistinguishable next year from a note about something he
     * actually read, which is the confusion this block is drawn to prevent.
     */
    /** @param {string} who */
    textOnlyThey: (who) => `\nBara de kan svara: ${who}`,
    textStarts: "\nVar folk börjar:",
    /** @param {string} what */
    textWouldAnswer: (what) => `\nVad som faktiskt skulle svara på det: ${what}`,
    /** @param {string} model @param {boolean} wide */
    textProvenance: (model, wide) =>
      `Allmän kunskap, skriven av ${model}. Inte ur något jag läst.` +
      (wide ? " Varierar kraftigt mellan människor; de inblandade väger tyngre." : ""),
    copiedToast: "Kopierat, med raden som säger att det är allmänt.",
    copyFailedToast: "Kunde inte nå urklippet. Markera texten och kopiera den.",

    /*
     * `missing` is printed as prominently as the hits, deliberately. The useful
     * answer to "what do I know about this" is often "less than you think", and
     * a view that only ever lists matches implies the opposite.
     */
    /** @param {string} n */
    readTitle: (n) => `Läste ${n} av dem`,
    noneBear: "Ingen av dem har egentligen med det här att göra.",
    /** @param {string} what */
    notAnswered: (what) => `Inte besvarat av något du skrivit: ${what}`,
    /** @param {string} by @param {string} cost */
    answerFoot: (by, cost) => `Läst ur dina egna anteckningar${by}${cost}. Inget sparades.`,
    /** @param {string} model */
    answerBy: (model) => ` av ${model}`
  },

  settings: {
    title: "Inställningar",
    sub: "Var saker sparas, och hur anteckningar når resten av appen.",

    /*
     * How the data directory was decided. Spelled out for all three because
     * "default" is the one that quietly means nobody configured this and the app
     * picked - and the per-user default is the location a helper process can be
     * silently redirected away from, leaving two halves of the same tool on two
     * stores.
     */
    whereFromEnv:
      "Satt av miljövariabeln TEND_DATA_DIR, ärvd när den här appen startade.",
    whereFromUserEnv:
      "Satt av TEND_DATA_DIR, läst från din Windows-användarmiljö snarare än ärvd.",
    whereFromDefault:
      "Standardplatsen per användare, eftersom inget satte TEND_DATA_DIR. Sätt den för att " +
      "hålla datan någonstans som synkas, och någonstans en hjälpprocess kan nå.",

    /* Which half. Two stores rather than one with a filter, because a filter is
       a rule and a rule can be got wrong once. */
    halfGroup: "Vilken sida",
    halfPrivate: "privat",
    halfWork: "arbete",
    privateTitle: "Privata sidan",
    workTitle: "Arbetssidan",
    privateWhy:
      "Sitt eget lager, läst av inget på arbetssidan och aldrig sammanslaget med det. Vad som " +
      "släpar efter, takter, plikter, Inför och en fokusbudget finns inte här - kontakt med " +
      "någon du bor med är kontinuerlig, så en takt över den skulle läsas som permanent bra och " +
      "betyda ingenting.",
    workWhy:
      "Allt appen alltid varit. Personer du ansvarar för, vad du är skyldig dem, och vad som " +
      "släpat efter.",
    privateNote:
      "Vad en post här registrerar är samspelet och din egen del i det - inte den andra " +
      "personens tillstånd. Det är den halvan du kan ändra, och den enda versionen du skulle " +
      "kunna visa personen det handlar om.",
    workNote:
      "Privata sidan håller familj och allt utanför jobbet i ett separat lager. Att byta " +
      "startar om appen, så det kan inte hända medan du är halvvägs in i en mening.",
    backToWork: "Tillbaka till arbetet",
    switchToPrivate: "Byt till privat",

    /*
     * What one import pass did. Every count is printed, including the ones it
     * used to keep to itself: an importer that withdraws a row and says only how
     * many it added is one whose numbers cannot be reconciled with the page, and
     * the natural reading of an unexplained disappearance is that the tool lost
     * something.
     */
    contactRecordOne: "kontaktpost",
    contactRecordMany: "kontaktposter",
    /** @param {string} counted */
    importAdded: (counted) => `${counted} tillagda`,
    promiseOne: "löfte",
    promiseMany: "löften",
    commitmentIsOne: "åtagande",
    commitmentAreMany: "åtaganden",
    /** @param {string} counted */
    importWaiting: (counted) =>
      `${counted} väntar på att du säger vems de är - de kom ur anteckningar flera personer var ` +
      `med i, så att kopiera dem på allihop skulle göra en skyldighet till flera. De ligger i Läget.`,
    /** @param {string} counted */
    importResolved: (counted) => `${counted} stängda, avbockade i Nib.`,
    unassignedCommitmentOne: "otilldelat åtagande",
    unassignedCommitmentMany: "otilldelade åtaganden",
    /** @param {string} counted */
    importDropped: (counted) =>
      `${counted} släppta, klara i Nib innan någon la dem någonstans.`,
    /** @param {string} counted */
    importRetracted: (counted) =>
      `${counted} tillbakadragna, eftersom anteckningen inte längre bär taggen de räknades under.`,
    commitmentOne: "åtagande",
    commitmentMany: "åtaganden",
    /** @param {string} counted */
    importWithdrawn: (counted) =>
      `${counted} tillbakadragna, eftersom anteckningen inte längre flaggar dem. Markerade som ` +
      `återtagna snarare än klara, och kvar på personens sida om du vill titta.`,

    /* Nib. The important half: bind a folder to a person, then say which tag
       supplies each kind of contact. */
    nibGroup: "Anteckningar från Nib",
    nibUnreadableTitle: "Nib går inte att läsa",
    nibUnknownReason: "Okänt skäl.",
    nibReadOnly: "Tend läser bara Nib. Den skriver aldrig till den.",
    /** @param {number} n */
    nibBound: (n) => `${n} bundna`,
    /** @param {string} dir */
    nibReading: (dir) => `Läser ${dir}`,
    nibUnknownFolder: "en okänd mapp",
    nibHowTitle: "Så fungerar det",
    nibHowWhy:
      "Peka en Nib-mapp mot en person, säg sedan vilken av dina Nib-taggar som ger varje sorts " +
      "kontakt Tend bevakar. Att skriva en taggad anteckning är då underlaget för att kontakten " +
      "ägde rum, med inget att bekräfta efteråt - och en otaggad anteckning räknas som " +
      "ingenting, så en mapp kan rymma varje sorts anteckning om någon.",
    nibHowNote:
      "Flaggade action points inne i de anteckningarna blir löften här, och att bocka av en i " +
      "Nib stänger den här också. Tend läser bara Nib.",
    nibWatching: "Anteckningar importerar sig själva, inom en sekund efter att de taggats.",
    nibTimerOnly:
      "Anteckningar importeras bara på en timer - det här fönstret bevakar inte anteckningsboken.",
    /** @param {number} n */
    nibFolderCount: (n) => `${n} ${n === 1 ? "mapp" : "mappar"} hittade i Nib`,
    bindButton: "Bind en mapp",
    previewButton: "Förhandsgranska import",
    importButton: "Importera nu",
    nibNoPeople: "Lägg till personer först - en bindning pekar en mapp mot någon.",
    nibNothingBound: "Inget bundet än.",
    /** @param {string} person @param {string} as */
    bindingMeta: (person, as) => `→ ${person}${as}`,
    unknownPerson: "okänd",
    /** @param {string} kind */
    bindingCountsAs: (kind) => ` som ${kind}`,
    bindingNoTags: " - inga taggar mappade, så inget räknas än",
    tagsButton: "Taggar",
    unbindButton: "Ta bort bindning",

    /* The data directory. */
    dataGroup: "Din data",
    dataTitle: "Var den sparas",
    dataAppendOnly:
      "Skriven som en logg som bara läggs till, en fil per skrivare, så att den här appen och " +
      "allt annat som når samma mapp kan skriva samtidigt utan att tappa varandras ändringar. " +
      "Inget skrivs någonsin över, vilket också är därför inget någonsin verkligen förloras.",
    dataNote:
      "Den här mappen innehåller anteckningar om namngivna kollegor. Den stannar på din maskin.",
    openFolder: "Öppna mappen",

    /*
     * The bulk leaving-a-job action, and the single-press way back. The two
     * directions used to be badly matched - one button to archive a roster,
     * thirty decisions to restore it - while the card offered "reversible" as
     * reassurance.
     */
    leavingGroup: "När ett jobb slutar",
    archiveAllTitle: "Arkivera alla och allt aktivt",
    archiveAllWhy:
      "För det ögonblick ett jobb tar slut. Arkiverar varje person, projekt och arbetsområde som " +
      "just nu är aktivt - allt på en gång, i stället för ett i taget.",
    archiveAllNote:
      "Inget tas bort. Varje 1-1, löfte, beslut och riktning står kvar precis som det är. Var " +
      "och en kan tas tillbaka för sig, när den är relevant igen, från sin arkiverade lista.",
    archiveAllSafe: "Tryggt att köra igen - allt som redan är arkiverat lämnas orört.",
    archiveAllButton: "Arkivera allt aktivt",
    /** @param {string} when */
    undoTitle: (when) => `Ångra arkiveringen från ${when}`,
    undoEarlierRun: "en tidigare körning",
    /** @param {string} parts */
    undoWhy: (parts) =>
      `Tar tillbaka ${parts} - bara det den tryckningen arkiverade, och bara de som fortfarande ` +
      `är arkiverade nu. Allt du redan tagit tillbaka för hand står kvar som det är, och inget ` +
      `som arkiverats för sig före eller efter rörs.`,
    undoOffered: "Erbjuds tills du använder den, eller arkiverar allt igen.",
    undoButton: "Ångra den arkiveringen",
    personOne: "person",
    personMany: "personer",
    projectOne: "projekt",
    projectMany: "projekt",
    workstreamOne: "arbetsområde",
    workstreamMany: "arbetsområden",

    /* Drafting. Says what it will never do as prominently as what it does. */
    draftingGroup: "Utkast",
    draftingAvailable: "Tillgängligt",
    draftingOff: "Av",
    draftingSignedIn: "inloggad via Claude Code",
    draftingNotSetUp: "inte uppsatt",
    draftingWhat:
      "Tre knappar använder en modell: ett utkast före ett samtal, läsning av en av dina " +
      "anteckningar efter ett åtagande du skrev i förbigående, och att namnge vad som " +
      "återkommer över flera anteckningar om samma person. Var och en är en knapp. Inget körs " +
      "på en timer och inget körs när det här fönstret öppnas.",
    draftingSignIn:
      "Den lånar inloggningen Claude Code redan har på den här maskinen, så det finns ingen " +
      "nyckel att lagra. En anteckning lämnar bara den här maskinen när du trycker på en av de " +
      "knapparna.",
    draftingWithout:
      "Allt annat fungerar precis som det gör med den på. Vad som släpar efter, takter, löften " +
      "och fokusbudgeten är vanlig aritmetik - en modell avgör aldrig vad som behöver din " +
      "uppmärksamhet.",
    draftingNever:
      "En modell skriver ingenting här. Allt den producerar är ett utkast, visat och slängt om " +
      "du inte behåller det själv.",

    /* About. */
    aboutGroup: "Om",
    /** @param {string} version */
    aboutTitle: (version) => `Tend ${version}`,
    installed: "installerad",
    development: "utveckling",
    updatesOn: "Söker efter en nyare version en gång vid start och installerar den när du stänger.",
    updatesOff:
      "Kör från källkod. Uppdateringskontroller är av, eftersom det inte finns någon " +
      "installerad kopia att ersätta.",
    noUpdateCheck: "Ingen uppdateringskontroll har körts än.",
    checkNow: "Sök nu",

    /*
     * One row per kind of contact Tend tracks, answered with a Nib tag. This way
     * round on purpose: listing Nib's tags and asking what each MEANT put the
     * other app's vocabulary in charge of the question.
     */
    tagNone: "Ingen tagg - Tend ser aldrig det här härifrån",
    /** @param {string} dir */
    tagsReadFrom: (dir) => `Taggar lästa från ${dir}.`,
    /** @param {string} folder */
    tagsTitle: (folder) => `Taggar i ${folder}`,
    tagsIntro:
      "Tend frågar; din anteckningsbok svarar. För varje sorts kontakt Tend bevakar, välj den " +
      "Nib-tagg som betyder den. Lämna en tom och Tend ser helt enkelt aldrig den sorten från " +
      "den här mappen - de flesta använder två eller tre.",
    save: "Spara",
    /** @param {number} n */
    tagRulesSaved: (n) => `${n} ${n === 1 ? "taggregel" : "taggregler"} sparade.`,
    tagsUnreadable: "Nibs taggar kunde inte läsas.",
    /** @param {string} dir */
    noTagsIn: (dir) => `Inga taggar i anteckningsboken på ${dir}. Skapa en i Nib först.`,

    /* Binding a folder. */
    bindTitle: "Bind en Nib-mapp",
    bindIntro:
      "Anteckningar i den här mappen blir kontakt med den här personen. Vad varje anteckning " +
      "räknas SOM kommer från dess tagg i Nib - så en mapp kan rymma varje sorts anteckning om " +
      "någon utan att en du bara hört om nollställer klockan på att ha pratat med dem. En " +
      "otaggad anteckning räknas som ingenting.",
    bindFolderLabel: "Mapp i Nib",
    /** @param {string} label @param {number} notes */
    bindFolderOption: (label, notes) =>
      `${label} (${notes} ${notes === 1 ? "anteckning" : "anteckningar"})`,
    bindPeopleLabel: "Vems anteckningar det är",
    bindNameLabel: "Vad den ska kallas (frivilligt)",
    bindSharedNote:
      "Att namnge mer än en person gör det här till ett möte snarare än en persons mapp. Varje " +
      "anteckning där blir kontakt med var och en av dem, så allas klockor flyttas. Flaggade " +
      "action points kopieras INTE på allihop - det går inte att avgöra vems var och en är, så " +
      "de väntar i Läget till du säger.",
    bindConfirm: "Bind",
    bindNobody: "Välj minst en person - en mapp bunden till ingen importerar ingenting.",
    boundToast: "Bunden.",
    /** @param {string} dir */
    boundNoTags: (dir) =>
      `Inga taggar i anteckningsboken på ${dir}, så ingen anteckning där räknas som något än.`,
    /** @param {string} why */
    boundTagsUnreadable: (why) => `Kunde inte läsa Nibs taggar: ${why}`,
    unknownReason: "okänt skäl",

    /** @param {string} name */
    unbindTitle: (name) => `Ta bort bindningen ${name}?`,
    unbindBody:
      "Anteckningar där slutar räknas som kontakt. Det som redan importerats står kvar.",
    unboundToast: "Bindningen borttagen.",

    previewTitle: "Vad en import skulle ta in",
    /** @param {string} summary @param {number} bindings @param {string} skipped */
    previewBody: (summary, bindings, skipped) =>
      `${summary} Från ${bindings} ${bindings === 1 ? "bindning" : "bindningar"}.${skipped} ` +
      `Inget har skrivits.`,
    /** @param {string} which */
    previewSkipped: (which) => ` Hoppade över: ${which}.`,
    close: "Stäng",
    importedTitle: "Importerat",
    /** @param {string} summary */
    importedBody: (summary) =>
      `${summary} Tryggt att köra igen när som helst - inget dubbleras någonsin.`,
    good: "Bra",

    switchPrivateTitle: "Byta till privata sidan?",
    switchWorkTitle: "Tillbaka till arbetssidan?",
    switchPrivateBody:
      "Appen startar om och öppnar ett annat lager. Inget från arbetssidan är synligt där, och " +
      "inget som skrivs där läses någonsin här.",
    switchWorkBody:
      "Appen startar om och öppnar arbetslagret igen. Inget som skrivits på privata sidan " +
      "följer med.",
    switchConfirm: "Byt",
    switchBackConfirm: "Byt tillbaka",

    archiveAllAskTitle: "Arkivera alla och allt aktivt?",
    archiveAllAskBody:
      "Arkiverar varje person, projekt och arbetsområde som just nu är aktivt, i ett svep. " +
      "Inget tas bort - varje 1-1, löfte, beslut och riktning står kvar precis som det är, och " +
      "var och en kan tas tillbaka individuellt, när den är relevant igen, från sin arkiverade " +
      "lista.\n\n" +
      "Efteråt erbjuder den här sidan en enda Ångra som tar tillbaka exakt det den här " +
      "tryckningen arkiverade, så att du inte behöver backa det en rad i taget.",
    archiveAllConfirm: "Arkivera allt",
    /** @param {number} people @param {number} projects @param {number} workstreams */
    archivedToast: (people, projects, workstreams) =>
      `${people} personer, ${projects} projekt, ${workstreams} arbetsområden arkiverade.`,

    undoAskTitle: "Ångra den arkiveringen?",
    undoAskBody:
      "Tar tillbaka allt den tryckningen arkiverade och som fortfarande är arkiverat nu. Rader " +
      "du redan tagit tillbaka står kvar som de är, och allt som arkiverats för sig - före " +
      "eller efter den tryckningen - lämnas ifred.",
    undoConfirm: "Ta tillbaka dem",
    /** @param {number} people @param {number} projects @param {number} workstreams */
    undoneToast: (people, projects, workstreams) =>
      `${people} personer, ${projects} projekt, ${workstreams} arbetsområden tillbaka.`,

    checkingToast: "Checking."
  },

  /*
   * Ctrl+K. Every row here is a whole sentence somebody reads at speed, and
   * three of them are the only place in the app where a band name ("Capture",
   * "Go", "Ask") tells the reader what sort of thing they are about to do.
   */
  palette: {
    label: "Kommandopalett",
    placeholder: "Säg vad som hände, eller vart du vill",
    footMove: "flytta",
    footDo: "gör det",
    footClose: "stäng",

    /* Nothing typed yet, so this is the only instruction the palette gives. */
    empty:
      "Skriv vad som just hände - <em>Nina: titta på render-passet</em> - och det loggas utan " +
      "att du lämnar sidan. Eller skriv en vy, eller ställ en fråga.",

    /* The three bands, in the order they are offered. */
    bandCapture: "Fånga",
    bandGo: "Gå",
    bandAsk: "Fråga",

    /* Capture: what typing a name and a sentence offers to do with it. */
    /** @param {string} name @param {string} rest */
    promiseTo: (name, rest) => `Löfte till ${name}: ${rest}`,
    loggedStraightAway: "loggas direkt",
    /** @param {string} name */
    promiseLoggedToast: (name) => `Löfte till ${name} loggat.`,
    /** @param {string} name */
    logContactWith: (name) => `Logga kontakt med ${name}`,
    spokeToThem: "du pratade med dem",
    /** @param {string} text */
    logPromiseOf: (text) => `Logga ett löfte: ${text}`,
    asksWhoTo: "frågar vem det gavs till",

    /* Go: the rail, then the things that would mean finding a view first. */
    /** @param {string} name */
    goTo: (name) => `Gå till ${name}`,
    addSomeone: "Lägg till någon",
    addSomeoneHint: "en ny person här",
    setFocus: "Sätt ett fokus",
    setFocusHint: "en tidsbegränsad prioritet",
    recordDecision: "Registrera ett beslut",
    recordDecisionHint: "med ett datum det kommer tillbaka",
    importNib: "Importera anteckningar från Nib",
    importNibHint: "kontakt och flaggade action points",
    /** @param {number} contacts @param {number} promises @param {number} resolved */
    importedToast: (contacts, promises, resolved) =>
      `${contacts} kontaktposter, ${promises} löften, ${resolved} stängda.`,
    openDataDir: "Öppna datamappen",
    openDataDirHint: "där loggen finns",
    checkUpdates: "Sök efter uppdateringar",
    checkUpdatesHint: "mot de publicerade släppen",
    checkingToast: "Söker.",

    /* Ask: what Tend can answer from its own data. */
    whatNeedsYou: "Vad som behöver dig",
    whatNeedsYouHint: "ur det som släpar efter",
    allInStep: "Inget släpar efter. Det är hela svaret.",
    /** @param {number} needs @param {number} nudges */
    behindCount: (needs, nudges) =>
      `${needs} behöver dig, ${nudges} ${nudges === 1 ? "värd" : "värda"} en påminnelse.`,
    /** @param {string} what @param {string} why */
    behindLine: (what, why) => `${what} - ${why}`,

    notSpokenTo: "Vem du inte pratat med på riktigt",
    notSpokenToHint: "den här månaden",
    nothingStandsOut: "Inget sticker ut i hur den här månaden gick.",

    /** @param {string} name */
    whatYouOwe: (name) => `Vad du är skyldig ${name}`,
    whatYouOweHint: "öppna löften",
    /** @param {string} name */
    oweNothing: (name) => `Inget utestående till ${name}.`,
    /** @param {string} text @param {string} openFor */
    oweLine: (text, openFor) => `${text} - öppet ${openFor}`,

    /** @param {string} name */
    whenYouLastSpoke: (name) => `När du senast pratade med ${name}`,
    whenYouLastSpokeHint: "ur kontaktloggen",
    /** @param {string} kind @param {string} when */
    lastSpokeLine: (kind, when) => `${kind}, ${when}.`,
    /** @param {string} name */
    neverSpoke: (name) => `Ingen kontakt med ${name} registrerad alls.`,

    /*
     * The fallthrough, and only the fallthrough. The hint says what it costs,
     * because this is the one row in the palette that spends money.
     */
    askModel: "Fråga en modell i stället",
    askModelHint: "inget här matchade, så det här kostar några sekunder",
    thinking: "Tänker…",

    /* Logging contact from here, which asks less than the person page does. */
    /** @param {string} name */
    contactTitle: (name) => `Kontakt med ${name}`,
    contactIntro: "Sorten spelar roll: en 1-1 uppfyller 1-1-takten och inget annat gör det.",
    contactKindLabel: "Vilken sort",
    contactNoteLabel: "En rad om det",
    when: "När",
    logIt: "Logga",
    contactLoggedToast: "Kontakt loggad.",

    /* And a promise, when the text carried no name to attach it to. */
    promiseTitle: "Logga ett löfte",
    promiseIntro: "Vem sa du det här till?",
    promiseWhoLabel: "Till vem",
    promiseTextLabel: "Vad du sa att du skulle göra",
    promiseDueLabel: "Senast när",
    promiseDueHint: "Frivilligt. Hur länge det varit öppet mäts ändå.",
    promiseLoggedPlain: "Löfte loggat."
  },

  /*
   * Everything a model produced, and the words that say so. The provenance
   * lines are the load-bearing ones: a draft that does not say it was drafted
   * becomes a fact by sitting on the screen long enough, so "Nothing here was
   * saved" is not a nicety and must not be shortened away in the wording pass.
   */
  model: {
    unknownAvailability: "Kunde inte avgöra om Claude Code är tillgänglig.",

    /* The stamp under anything drafted. */
    aModel: "en modell",
    /** @param {string} model @param {string} cost */
    draftedBy: (model, cost) => `Utkast av ${model}${cost}. Inget här sparades.`,
    /** @param {string} cents */
    cost: (cents) => ` · ${cents}¢`,

    discard: "Släng",
    discardAll: "Släng alla",
    close: "Stäng",

    /* A brief, as read on the way to a room. */
    briefTitle: "Utkast till underlag",
    raiseHead: "Ta upp",
    askHead: "Fråga",
    /** @param {string} watch */
    watchOut: (watch) => `Se upp för: ${watch}`,

    /* Promises read out of prose, each still a candidate. */
    nothingFoundTitle: "Inget hittat",
    nothingFoundWhy:
      "Inget åtagande i den anteckningen som Nibs egna action points inte redan fångat. Det " +
      "är det vanliga svaret och det är ett bra svar.",
    candidatesTitle: "Hittat i det du skrev",
    truncated: "Den anteckningen är lång, så bara dess första del lästes.",
    statedOutright: "sagt rakt ut",
    implied: "antytt, så kolla det",
    keep: "Behåll",
    promiseLoggedToast: "Löfte loggat.",

    /* What keeps coming up about somebody. */
    /** @param {string | number} notes */
    themesTitle: (notes) => `Över ${notes} anteckningar`,
    themesNone:
      "Inget återkommer över de anteckningarna än. Ett mönster måste dyka upp i minst två.",
    /** @param {string | number} times */
    themeTimes: (times) => `${times}×`,

    /* A reading of the journal, before it is kept or thrown away. */
    /** @param {string} days */
    reviewTitle: (days) => `De senaste ${days} dagarna`,
    keepReading: "Behåll den här läsningen",
    avoidedHead: "Undveks gång på gång",
    avoidedNone:
      "Inget återkommer i den rutan över de här kvällarna. Värt att notera snarare än att " +
      "fira - det är också hur en obesvarad ruta ser ut.",
    wentIntoHead: "Vart dagarna gick",
    saidVsDidHead: "Mot vad du sa att du skulle göra",
    questionsHead: "Värt att ställa till dig själv",
    /** @param {string} evenings */
    eveningsCount: (evenings) => `${evenings} kvällar`,
    ledgerSummary: "Vad appen registrerade över samma dagar",
    /** @param {string} model @param {string} cost */
    readByKeep: (model, cost) =>
      `Läst av ${model}${cost}. Inget sparas om du inte behåller det.`,

    /*
     * The recorded counts, as lines. The wording is the window's business and
     * the numbers are the contract, which is why these live here and not in
     * the shape the service sends.
     */
    ledgerDays: "Dagar med en post",
    /** @param {string | number} journalled @param {string | number} days */
    ledgerDaysValue: (journalled, days) => `${journalled} av ${days}`,
    ledgerConversations: "Registrerade samtal",
    ledgerPromisesMade: "Givna löften",
    /** @param {string | number} made @param {string | number} kept */
    ledgerPromisesMadeValue: (made, kept) => `${made}, varav ${kept} stängda`,
    ledgerPromisesOpen: "Löften öppna just nu",
    ledgerDecisions: "Registrerade beslut",
    ledgerGrowth: "Diskuterade riktningar",
    /** @param {string | number} notes @param {string | number} observed */
    ledgerGrowthValue: (notes, observed) => `${notes}, sett hända ${observed}×`,
    ledgerSkips: "Möten som inte blev av",
    ledgerChases: "Gånger du påmint någon",

    /*
     * One entry, read back against the rule that keeps it safe to write. The
     * clean answer is shown rather than swallowed: a check that only ever
     * speaks up when something is wrong reads as an accusation waiting to
     * happen.
     */
    readBackTitle: "Läst tillbaka",
    readBackClean: "Inget här beskriver dem snarare än din egen del i det.",
    onePhrase: "En formulering",
    /** @param {number} n */
    somePhrases: (n) => `${n} formuleringar`,
    /** @param {string} count */
    readBackSome: (count) =>
      `${count} beskriver dem snarare än din egen del. Inget har ändrats - alternativet är ` +
      `bara ett alternativ.`,
    /** @param {string} instead */
    couldBe: (instead) => `Skulle kunna vara: ${instead}`,
    /** @param {string} model @param {string} cost */
    readByUntouched: (model, cost) => `Läst av ${model}${cost}. Din post är orörd.`
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
    readFailedTitle: (what) => `Kunde inte läsa ${what}`,
    readFailedWhy:
      "Inget har förlorats - det här är en misslyckad läsning, inte en tom post. Lagret kan " +
      "vara mitt i en synk.",
    retry: "Försök igen",

    /* Every dialog's two buttons, and the two defaults. */
    cancel: "Avbryt",
    save: "Spara",
    yes: "Ja",

    /*
     * The one thing a form says on its own behalf. It names the field, so it
     * has to be built from the label rather than written out.
     */
    /** @param {string} label */
    needed: (label) => `${label} behövs.`,

    /* A collapsed multiselect with nothing ticked. */
    noneChosen: "Ingen vald än"
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
    renderFailed: "Den här vyn kunde inte ritas",

    /** @param {number} n Proposed duties waiting to be accepted. */
    proposedCount: (n) => `${n} nya`,

    /*
     * The half, spelled out in the title bar. Only the private half is
     * marked: the work half is the default and naming it would put a label on
     * the state nobody needs telling about.
     */
    privateBadge: "privat"
  }
};
