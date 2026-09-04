/**
 * Topics: the things worth raising, rather than the things you owe.
 *
 * ## Why this is not a duty
 *
 * Duties model contact. They ask whether a conversation happened at all, and
 * when one has not happened for long enough they surface in Now, where the
 * whole point is that everything on the page is a deviation you should act on
 * today.
 *
 * What goes on upward and sideways is a different question. "Have I asked my
 * manager what the next level actually requires?" is not neglect and never
 * becomes critical - nobody is let down by it going unasked - but it is exactly
 * the sort of thing that goes unasked for two years and then turns out to have
 * been the whole ballgame. Putting it in Now would either shout about something
 * that is not urgent, or teach him to skim a page that must never be skimmed.
 *
 * So topics live on the prep card for the person they concern, and nowhere
 * else. You see them when you are about to talk to that person, which is the
 * only moment the answer is actionable.
 *
 * ## Why each topic has its own clock
 *
 * The obvious cheap version reuses `touches` with a "topic raised" kind. That
 * fails the same way the tool's central rule says contact fails: one touch of
 * that kind would satisfy every topic for that person at once, so raising the
 * easy question would silence the hard one. Each topic is therefore its own
 * subject with its own last-raised date.
 *
 * ## Two flavours, one shape
 *
 * A topic either belongs to a relation (every peer lead gets the same standing
 * subjects) or is pinned to one person (something only your manager can answer).
 * Relation-bound topics are what make this survive a reorg, the same way duties
 * do: a new peer lead inherits the set without anybody copying rows.
 *
 * Nothing here touches the store.
 */

import { daysBetween } from "./time.js";

/**
 * How stale a topic has to get before it is worth showing at all.
 *
 * Zero. A topic is due the day its interval passes and not before, because
 * unlike drift there is no "slightly behind" worth surfacing - either the
 * question is ripe or it is noise on a card you want to stay short.
 */
const DUE_AT = 0;

/**
 * The most topics shown on one card.
 *
 * Three, matching the signal set and for the same reason: a card that suggests
 * eight things to raise in a half-hour conversation is a card that gets read as
 * decoration. The rest wait, and they wait in the right order because the
 * longest-unasked sorts first.
 */
export const TOPICS_PER_CARD = 3;

/**
 * @typedef {object} DueTopic
 * @property {string} id
 * @property {string} text What to raise, phrased as he would say it.
 * @property {string} why Why it is worth the minutes. Every list here says why.
 * @property {number} intervalDays
 * @property {number} daysSince Days since it was last raised.
 * @property {boolean} everRaised
 * @property {number} overdueDays How far past its interval.
 */

/**
 * Does this topic apply to this person?
 *
 * A topic pinned to a person ignores relations entirely - it was written about
 * them, not about their place in the org.
 *
 * @param {Record<string, any>} topic
 * @param {{ id: string, relation?: string }} person
 * @returns {boolean}
 */
export function appliesTo(topic, person) {
  if (topic._deleted || (topic.status ?? "active") !== "active") {
    return false;
  }
  if (typeof topic.person === "string" && topic.person !== "") {
    return topic.person === person.id;
  }
  const relations = Array.isArray(topic.relations) ? topic.relations : [];
  if (relations.length === 0) {
    return false;
  }
  return person.relation !== undefined && relations.includes(person.relation);
}

/**
 * Topics worth raising with one person, longest-unasked first.
 *
 * A topic never raised counts from the start of the RELATIONSHIP, not from when
 * the row was written. Counting from the row would mean a set seeded today sits
 * silent for three months and shows up empty on the one day he goes looking for
 * it - and it would be a lie besides: a question never put to someone you have
 * worked with for two years is two years unasked, whenever you got round to
 * writing it down. A genuinely new colleague still gets a grace period, because
 * their `since` is recent.
 *
 * @param {object} args
 * @param {Record<string, any>[]} args.topics
 * @param {{ topic?: string, person?: string, at?: number, _deleted?: boolean }[]} args.raised
 * @param {{ id: string, relation?: string, since?: number }} args.person
 * @param {number} args.now
 * @param {number} [args.limit]
 * @returns {DueTopic[]}
 */
export function topicsFor({ topics, raised, person, now, limit = TOPICS_PER_CARD }) {
  /** @type {DueTopic[]} */
  const due = [];

  for (const topic of topics) {
    if (!appliesTo(topic, person)) {
      continue;
    }
    const interval = Number(topic.cadenceDays);
    if (!(interval > 0)) {
      continue;
    }

    // Raised with THIS person. A question put to one peer lead has not been put
    // to the others, even though they share the topic row.
    const last = lastRaised(raised, String(topic.id), person.id);
    const everRaised = last !== null;
    const from = everRaised ? last : startOf(topic, person, now);
    const daysSince = Math.max(0, daysBetween(from, now));
    const overdueDays = daysSince - interval;

    if (overdueDays < DUE_AT) {
      continue;
    }

    due.push({
      id: String(topic.id),
      text: String(topic.text ?? ""),
      why: String(topic.why ?? ""),
      intervalDays: interval,
      daysSince,
      everRaised,
      overdueDays
    });
  }

  // Longest overdue first, and a topic never raised beats an equally overdue one
  // that has been - the first time is the one that is hard to start.
  due.sort((a, b) => {
    if (b.overdueDays !== a.overdueDays) {
      return b.overdueDays - a.overdueDays;
    }
    return Number(a.everRaised) - Number(b.everRaised);
  });

  return due.slice(0, Math.max(0, limit));
}

/**
 * What a never-raised topic counts from.
 *
 * An explicit `since` on the topic wins - that is somebody saying "this only
 * started mattering in March". Otherwise the relationship's own start, and only
 * failing that the row's creation.
 *
 * @param {Record<string, any>} topic
 * @param {{ since?: number }} person
 * @param {number} now
 * @returns {number}
 */
function startOf(topic, person, now) {
  if (typeof topic.since === "number") {
    return topic.since;
  }
  if (typeof person.since === "number") {
    return person.since;
  }
  if (typeof topic._at === "number") {
    return topic._at;
  }
  return now;
}

/**
 * When this topic was last raised with this person, or null.
 *
 * @param {{ topic?: string, person?: string, at?: number, _deleted?: boolean }[]} raised
 * @param {string} topicId
 * @param {string} personId
 * @returns {number | null}
 */
export function lastRaised(raised, topicId, personId) {
  let latest = null;
  for (const r of raised) {
    if (r._deleted || r.topic !== topicId || r.person !== personId) {
      continue;
    }
    if (typeof r.at !== "number") {
      continue;
    }
    if (latest === null || r.at > latest) {
      latest = r.at;
    }
  }
  return latest;
}

/**
 * The starting set, offered as proposals rather than written in.
 *
 * Same boundary as duties: the app may suggest what the job asks of him, only
 * he decides it. A tool that quietly installs a list of career questions has
 * decided what his career is about.
 *
 * The upward set is deliberately split between two things he asked for and that
 * are easy to collapse into one. Some of these are about what he is owed -
 * drawn from his own reading note, which puts it as a minimum his manager
 * should meet - and some are about what he wants next, which nobody will raise
 * for him.
 */
export const TOPIC_SEEDS = /** @type {const} */ ([
  /* --------------------------------------------------- upward: what I want -- */
  {
    id: "topic-next-level",
    text: "Vad kräver nästa nivå faktiskt av mig?",
    why:
      "Kriterierna står sällan skrivna någonstans du kan läsa dem, så glappet mellan vad du " +
      "antar bedöms och vad som bedöms förblir osynligt fram till en omgång du redan " +
      "förlorat. Att fråga kostar en fråga och daterar svaret.",
    relations: ["own-manager"],
    cadenceDays: 90
  },
  {
    id: "topic-say-what-i-want",
    text: "Säg rakt ut vad jag vill härnäst, utan att linda in det som ett hypotetiskt fall.",
    why:
      "Ingen driver en ambition de inte fått höra om, och en önskan formulerad som 'om något " +
      "sådant nu skulle dyka upp' är inget någon kan agera på. Det här är den på listan som " +
      "bara du kan göra.",
    relations: ["own-manager"],
    cadenceDays: 180
  },
  {
    id: "topic-what-are-you-hearing",
    text: "Vad hör du om mig som jag inte hör?",
    why:
      "Ditt rykte byggs i rum du inte är i, och den som mest sannolikt är i dem är din chef. " +
      "Second hand-intryck stelnar till en gemensam bild långt innan någon kommer på att " +
      "berätta om dem.",
    relations: ["own-manager"],
    cadenceDays: 90
  },
  {
    id: "topic-am-i-on-the-right-things",
    text: "Är det jag lägger mina veckor på det som betyder något för dig nu?",
    why:
      "Prioriteringar ändras över dig innan de meddelas. Att fråga är billigare än att få " +
      "veta i ett utvecklingssamtal att arbetet du var stoltast över slutade spela roll i " +
      "mars.",
    relations: ["own-manager"],
    cadenceDays: 60
  },

  /* ------------------------------------------- upward: what I am owed -- */
  {
    id: "topic-feedback-near-the-event",
    text: "Be om feedback nära händelsen i stället för sparad till utvecklingssamtalet.",
    why:
      "Din egen anteckning om det här sätter det som ett minimum: feedback nära händelsen, " +
      "inte samlad ihop till ett utvecklingssamtal. Samma sak du tycker är rimligt att " +
      "förvänta dig uppåt är checklistan för vad du levererar nedåt.",
    relations: ["own-manager"],
    cadenceDays: 60
  },
  {
    id: "topic-bad-news-first",
    text: "Får jag dåliga nyheter innan resten av organisationen får dem?",
    why:
      "Också från din egen anteckning. Att få veta samtidigt som alla andra är inget " +
      "personligt - det är en signal om var du sitter, och mönstret är värt att lägga märke " +
      "till snarare än varje enskilt fall.",
    relations: ["own-manager"],
    cadenceDays: 90
  },

  /* ----------------------------------------------------------- sideways -- */
  {
    id: "topic-friction-from-my-team",
    text: "Vad landar dåligt från mitt team hos ert?",
    why:
      "Friktion mellan två team når den andra ledaren månader innan den når dig, och då " +
      "kommer den som ett klagomål snarare än som en detalj som går att laga. Att fråga " +
      "direkt är den enda kanalen som inte kräver att någon är tillräckligt irriterad för " +
      "att eskalera.",
    relations: ["equal-lead"],
    cadenceDays: 60
  },
  {
    id: "topic-solving-twice",
    text: "Var löser vi samma problem två gånger?",
    why:
      "Två team utan bestämmanderätt över varandra dubblerar tyst och ingen av dem gör något " +
      "fel. Det här är frågan som hittar det, och den ställs bara med avsikt.",
    relations: ["equal-lead"],
    cadenceDays: 90
  },
  {
    id: "topic-cross-feedback",
    text: "Vem på er sida borde höra något från mig, och åt andra hållet?",
    why:
      "Du leder personer du inte ansvarar för och leds av personer som inte ansvarar för dig. " +
      "Feedback över den linjen har ingen formell kanal, så den blir inte av om inte någon " +
      "öppnar en.",
    relations: ["equal-lead"],
    cadenceDays: 90
  }
]);
