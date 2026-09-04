/**
 * Standing subjects worth raising with somebody, and a row per time one was.
 *
 * Kept apart from duties and from contact on purpose, and the reason is in
 * storage/reduce.js: a duty is contact you owe and drifts into Now, where a
 * topic is content that belongs to one conversation and is never critical. A
 * shared "raised something" kind would let the easy question silence the hard
 * one.
 *
 * Split out of api.js. Nothing here calls into another section.
 */

import { isArchived } from "../domain/archive.js";
import { RELATIONS, isRelation } from "../domain/cadence.js";
import { TOPICS_PER_CARD, appliesTo, lastRaised, topicsFor } from "../domain/topics.js";
import { agoWords, daysBetween, isLaterDay } from "../domain/time.js";
import { resolvePerson } from "./resolve.js";

/**
 * The topics standing against one person, due or not.
 *
 * The app needs both: the prep card shows only what is due, but the person's
 * page has to show the whole set, because "asked six weeks ago" is the answer
 * to "should I bring this up again" just as much as "never asked" is.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} who Name or id.
 * @param {number} now
 */
export function topics(store, who, now) {
  const found = resolvePerson(store, who);
  if (!found.ok) {
    return { error: found.error };
  }
  const person = found.person;
  const raised = store.rows("raised");

  const all = store
    .rows("topics")
    .filter((t) => appliesTo(t, /** @type {any} */ (person)))
    .map((t) => {
      const last = lastRaised(raised, String(t.id), String(person.id));
      return {
        id: String(t.id),
        text: String(t.text ?? ""),
        why: String(t.why ?? ""),
        every: `${Number(t.cadenceDays)} dagar`,
        lastRaised: last === null ? "aldrig" : agoWords(Math.max(0, daysBetween(last, now))),
        pinned: typeof t.person === "string" && t.person !== "",
        status: String(t.status ?? "active")
      };
    });

  const due = topicsFor({
    topics: store.rows("topics"),
    raised,
    person: /** @type {any} */ (person),
    now,
    limit: TOPICS_PER_CARD
  });

  return { person: person.name, topics: all, due };
}

/**
 * Every topic, including the proposed ones waiting on him.
 *
 * @param {import("../storage/store.js").TendStore} store
 */
export function allTopics(store) {
  return store.rows("topics").map((t) => ({
    id: String(t.id),
    text: String(t.text ?? ""),
    why: String(t.why ?? ""),
    cadenceDays: Number(t.cadenceDays ?? 0),
    relations: Array.isArray(t.relations) ? t.relations : [],
    person: typeof t.person === "string" ? t.person : null,
    status: String(t.status ?? "active"),
    source: String(t.source ?? "")
  }));
}

/**
 * Propose a topic. Proposed only - it appears nowhere until he accepts it.
 *
 * Same boundary as duties, and it matters more here rather than less: a tool
 * that installs its own list of career questions has decided what his career is
 * about, which is not a thing software gets to decide.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} args.text
 * @param {string} args.why
 * @param {number} args.cadenceDays
 * @param {string[]} [args.relations]
 * @param {string} [args.person] Name or id, to pin it to one person.
 * @param {string} [args.source]
 * @param {string} [args.id] A stable id, so a seed can be re-run without duplicating.
 * @param {"proposed" | "active"} [args.status]
 */
export function proposeTopic(store, { text, why, cadenceDays, relations, person: who, source, id, status }) {
  if (!String(text ?? "").trim() || !String(why ?? "").trim()) {
    return { error: "A topic needs the thing to raise and why it is worth the minutes." };
  }
  if (!(Number(cadenceDays) > 0)) {
    return { error: "A topic needs a positive interval in days." };
  }
  if (relations && relations.some((r) => !isRelation(r))) {
    return { error: `Unknown relationship type. Valid: ${Object.keys(RELATIONS).join(", ")}.` };
  }

  let pinned;
  if (who !== undefined && String(who).trim() !== "") {
    const found = resolvePerson(store, who);
    if (!found.ok) {
      return { error: found.error };
    }
    pinned = String(found.person.id);
  }

  if (pinned === undefined && (relations ?? []).length === 0) {
    return { error: "A topic applies to a relationship type or to one person. It needs one of them." };
  }

  const fields = {
    text: String(text).trim(),
    why: String(why).trim(),
    cadenceDays: Number(cadenceDays),
    relations: relations ?? [],
    person: pinned ?? null,
    source: source ?? "proposed",
    status: status === "active" ? "active" : "proposed"
  };

  // A stable id makes the seed re-runnable: running it twice updates the same
  // row rather than laying a second copy of every question on top of the first.
  if (typeof id === "string" && id !== "") {
    const existing = store.rows("topics").find((t) => t.id === id);
    if (existing) {
      store.update("topics", id, fields);
      return { id, updated: true };
    }
    store.create("topics", { ...fields, id });
    return { id, proposed: fields.text };
  }

  const made = store.create("topics", fields);
  return { id: made, proposed: fields.text };
}

/**
 * Accept or decline a proposed topic.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} id
 * @param {"active" | "declined"} status
 * @param {object} [overrides]
 */
export function decideTopic(store, id, status, overrides = {}) {
  const row = store.rows("topics").find((t) => t.id === id);
  if (!row) {
    return { error: `No topic with id "${id}".` };
  }
  store.update("topics", id, { ...overrides, status });
  return { id, status };
}

/**
 * Record that a topic was raised with someone.
 *
 * Per person, not per topic: the same standing question put to one peer lead
 * has not been put to the others.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} args.topic Topic id.
 * @param {string} args.person Name or id.
 * @param {string} [args.note] What came back, in a line.
 * @param {number} [args.at]
 * @param {number} args.now
 */
export function markRaised(store, { topic, person: who, note, at, now }) {
  const row = store.rows("topics").find((t) => t.id === topic);
  if (!row) {
    return { error: `No topic with id "${topic}".` };
  }
  const found = resolvePerson(store, who);
  if (!found.ok) {
    return { error: found.error };
  }
  const when = typeof at === "number" ? at : now;
  if (isLaterDay(when, now)) {
    return { error: "That day has not arrived yet. A topic is marked raised after the conversation, not before." };
  }

  const id = store.create("raised", {
    topic: String(topic),
    person: String(found.person.id),
    note: String(note ?? ""),
    at: when
  });
  return { id, topic: String(row.text ?? ""), person: found.person.name };
}


