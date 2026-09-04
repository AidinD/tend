/**
 * The starting role map.
 *
 * Lives here rather than in a script so the app can offer it on an empty store:
 * a tool nobody can set up without a terminal is not finished.
 *
 * The three most managers already practise go in active. The five from the research go
 * in as proposals, because an agent may suggest what the job is and
 * only the user decides it.
 *
 * Reasoning and sources: docs/role-map-research.md.
 */

import { DEFAULT_SIGNALS, SIGNAL_CADENCE_DAYS } from "../domain/signals.js";
import { DEFAULT_STAKE_DAYS } from "../domain/stakes.js";
import { TOPIC_SEEDS } from "../domain/topics.js";

export const SEED_DUTIES = [
  {
    id: "duty-one-to-one",
    status: "active",
    name: "1-1",
    means:
      "Ett återkommande samtal med en struktur, som börjar med uppföljning av det ni kom " +
      "överens om förra gången. Nya åtgärdspunkter bara när det finns något konkret, " +
      "aldrig för att fylla luckan.",
    source: "yours",
    subjectKind: "person",
    cadenceDays: 14,
    evidenceKinds: ["one-to-one"],
    relations: ["lead-and-manage", "manage-remotely"],
    guarded: true
  },
  {
    id: "duty-feedback-rounds",
    status: "active",
    name: "Feedbackrunda från producenter och kollegor",
    means:
      "Två frågeuppsättningar på en 1-5-skala med beteendeankare, mappade mot de nivåaxlar " +
      "din organisation använder, så att svaren går in i nivåsättningen snarare än bara " +
      "i ditt eget intryck.",
    source: "yours",
    subjectKind: "person",
    cadenceDays: 90,
    evidenceKinds: ["survey"],
    relations: ["lead-and-manage", "lead-only", "manage-remotely"],
    guarded: true
  },
  {
    id: "duty-project-check",
    status: "active",
    name: "Projektavstämning",
    means:
      "Du äger kodsidan utan att vara i det dagliga arbetet. Frågan är inte om det går i " +
      "produktion, den är om du skulle höra om ett problem innan det blev ett " +
      "leveransproblem.",
    source: "yours",
    subjectKind: "project",
    cadenceDays: 14,
    evidenceKinds: ["check-in"],
    relations: [],
    guarded: false
  },

  {
    id: "duty-second-hand",
    status: "proposed",
    name: "Second hand-läsning på dem du inte ser",
    means:
      "Ett kort stående utbyte med de andra teamens ledare om var och en du ansvarar för " +
      "som sitter där. Du har mandatet och ingenting av observationen, och enkäter är en " +
      "kvartalsvis stillbild snarare än en kanal. Skyddad: ett fokus får aldrig vidga just " +
      "den här blinda fläcken.",
    source: "Resilient Management, The Manager's Path",
    subjectKind: "person",
    cadenceDays: 30,
    evidenceKinds: ["second-hand"],
    relations: ["manage-remotely"],
    guarded: true
  },
  {
    id: "duty-feedback-fresh",
    status: "proposed",
    name: "Feedback nära händelsen",
    means:
      "Beröm och rättelse inom dagar, inte sparat till ett utvecklingssamtal. Feedback som " +
      "hålls till utvecklingssamtalen kommer för sent för att göra något åt och landar som " +
      "en dom i stället för som hjälp.",
    source: "The Manager's Path, Resilient Management",
    subjectKind: "person",
    cadenceDays: 28,
    evidenceKinds: ["feedback"],
    relations: ["lead-and-manage", "lead-only", "manage-remotely"],
    guarded: false
  },
  {
    id: "duty-track-record",
    status: "proposed",
    name: "Löpande register över vad var och en levererat",
    means:
      "Skriv ner det när det händer. Annars blir utvecklingssamtalen en minnesövning som " +
      "väger de senaste veckorna tyngst, vilket är precis den skevhet feedbackrundorna " +
      "byggdes för att undvika. För dem i andra team kan det här vara det enda register " +
      "som finns.",
    source: "The Manager's Path, plus praktikerskriverier om recency bias",
    subjectKind: "person",
    cadenceDays: 42,
    evidenceKinds: ["observation"],
    relations: ["lead-and-manage", "lead-only", "manage-remotely"],
    guarded: false
  },
  {
    id: "duty-delegation-level",
    status: "proposed",
    name: "Uttalad delegeringsnivå per arbetsområde",
    means:
      "Groves task-relevant maturity: hur nära du följer upp beror på hur erfaren någon är " +
      "på just den här uppgiften, inte på hur bra de är i allmänhet. Sätt en nivå per " +
      "arbetsstycke - gör det själv, delegerad med nära uppföljning, eller helt deras. " +
      "Frånvaron av uppföljning är det som skiljer att delegera från att abdikera, och det " +
      "är den halvan som player-coach-modellen inte specificerar.",
    source: "High Output Management (task-relevant maturity)",
    // A workstream, not a project. It consumes `delegation-review`, which is
    // about a piece of work, so declared against a project it crossed with
    // every project and could never be satisfied by anything - it would have
    // sat in Now saying a project had never had its level set, forever.
    subjectKind: "workstream",
    cadenceDays: 30,
    evidenceKinds: ["delegation-review"],
    relations: [],
    guarded: false
  },
  {
    id: "duty-sideways",
    status: "proposed",
    name: "Sideways-kontakt med de andra ledarna",
    means:
      "Att samordna sidledes har ingen bestämmanderätt bakom sig, så det går helt på " +
      "tillit och visad pålitlighet. Sidoordnade relationer är den riktning ledare " +
      "försummar först, eftersom inget i en kalender tvingar fram dem.",
    source: "Praktikerskriverier om matris- och tvärfunktionellt ledarskap",
    subjectKind: "person",
    cadenceDays: 7,
    evidenceKinds: ["sideways"],
    relations: ["equal-lead"],
    guarded: false
  },
  {
    id: "duty-stakeholder-update",
    // Proposed, like every duty he did not write. A missing status reads as
    // active, which would have switched this on without him agreeing to it -
    // the one boundary the role map exists to hold.
    status: "proposed",
    name: "Håll dina stakeholders uppdaterade",
    means:
      "Någon som är beroende av det du levererar ska inte få veta hur det går genom " +
      "beskedet att det försenades. Intervallet ligger på varje stakeholder snarare än " +
      "här, eftersom en sponsor två nivåer upp som vill veta att det rör sig är en annan " +
      "skyldighet än någon som sitter intill arbetet.",
    source:
      "Glappet inget annat täckte: en stakeholder är varken någon du ansvarar för eller " +
      "en sidoordnad",
    subjectKind: "stake",
    cadenceDays: DEFAULT_STAKE_DAYS,
    evidenceKinds: ["update"],
    // Empty on purpose. A stake is its own subject and carries no relationship
    // type, so a duty that filtered on one would never apply to any of them.
    relations: [],
    guarded: false
  }
];

/**
 * The monthly questions. Seeded active rather than proposed: unlike a duty, a
 * question costs nothing until it is due, and answering "no" a few times is how
 * he finds out whether the set earns its place.
 */
export const SEED_SIGNALS = DEFAULT_SIGNALS.map((s) => ({
  ...s,
  status: "active",
  cadenceDays: SIGNAL_CADENCE_DAYS
}));

/**
 * Write anything missing. Fixed ids make it idempotent, so it is safe to offer
 * as a button that can be pressed twice.
 *
 * No people and no projects: those are real colleagues, and placeholder names
 * would put fiction into live data.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @returns {{ duties: number, questions: number, topics: number }}
 */
export function seedRoleMap(store) {
  const haveDuties = new Set(store.rows("duties").map((d) => d.id));
  const haveSignals = new Set(store.rows("signals").map((s) => s.id));
  const haveTopics = new Set(store.rows("topics").map((t) => t.id));

  let duties = 0;
  for (const duty of SEED_DUTIES) {
    if (!haveDuties.has(duty.id)) {
      store.create("duties", duty);
      duties += 1;
    }
  }

  let questions = 0;
  for (const signal of SEED_SIGNALS) {
    if (!haveSignals.has(signal.id)) {
      store.create("signals", signal);
      questions += 1;
    }
  }

  // Topics are seeded proposed like everything else. They cover the two
  // directions no duty does: upward, where the question is what he wants rather
  // than what he owes, and sideways, where there is no formal channel at all.
  let topics = 0;
  for (const topic of TOPIC_SEEDS) {
    if (!haveTopics.has(topic.id)) {
      store.create("topics", {
        ...topic,
        relations: [...topic.relations],
        person: null,
        source: "ledarskapsläsning",
        status: "proposed"
      });
      topics += 1;
    }
  }

  return { duties, questions, topics };
}
