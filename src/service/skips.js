/**
 * Meetings that were booked and did not happen.
 *
 * Stored beside contact and read nowhere contact is read. "We never booked it"
 * and "we booked it and cancelled it three times" are different facts about a
 * relationship, and a tool that only counts contact sees both as silence.
 *
 * Split out of api.js: measured as needing nothing from any other section.
 */

import { kindsFor, subjectOf } from "../domain/contact.js";
import { recentSkips, skipPattern, skipsFor } from "../domain/skips.js";
import { agoWords, daysSince, isLaterDay } from "../domain/time.js";
import { resolvePerson } from "./resolve.js";

/**
 * Record that something booked did not happen.
 *
 * Never satisfies a cadence, and is deliberately stored in its own collection so
 * that it cannot start doing so by accident. See src/domain/skips.js: the value
 * is entirely in the difference between "we never booked it" and "we booked it
 * and cancelled it three times", which a tool that only counts contact cannot
 * see at all.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} args.person Name or id.
 * @param {string} args.kind What it would have been, e.g. one-to-one.
 * @param {string} [args.why] In his own words. One line.
 * @param {number} [args.at] When it should have happened. Defaults to today.
 * @param {number} args.now
 */
export function logSkip(store, { person: who, kind, why, at, now }) {
  const found = resolvePerson(store, who);
  if (!found.ok) {
    return { error: found.error };
  }

  const asked = String(kind ?? "").trim();
  if (!asked) {
    return { error: "Ett inställt möte behöver säga vad det skulle ha varit." };
  }
  if (subjectOf(asked) !== "person") {
    const offer = kindsFor("person")
      .map((k) => k.value)
      .join(", ");
    return { error: `"${asked}" is not something you can have with a person. Try one of: ${offer}.` };
  }

  const when = typeof at === "number" ? at : now;
  if (isLaterDay(when, now)) {
    return {
      error:
        "Den dagen har inte kommit än. Ett möte kan bara registreras som att det inte blev av " +
        "när dagen har passerat."
    };
  }

  const id = store.create("skips", {
    person: String(found.person.id),
    kind: asked,
    why: String(why ?? "").trim() || null,
    at: when
  });
  return { id, skipped: `${asked} with ${found.person.name}` };
}

/**
 * Skipped meetings with one person, and whether they add up to a pattern.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} who
 * @param {number} now
 */
export function skips(store, who, now) {
  const found = resolvePerson(store, who);
  if (!found.ok) {
    return { error: found.error };
  }
  const rows = store.rows("skips");
  const id = String(found.person.id);
  return {
    person: found.person.name,
    recent: recentSkips(rows, id).map((s) => ({
      id: String(s.id),
      kind: String(s.kind ?? ""),
      why: s.why ?? null,
      when: agoWords((daysSince(s.at, now) ?? 0))
    })),
    pattern: skipPattern(skipsFor(rows, id, now, "one-to-one"), "1-1")
  };
}
