/**
 * Linking outside material to somebody.
 *
 * Why a pointer rather than a stored copy, and why the date is load-bearing:
 * see `domain/links.js`. This layer resolves who it is about, refuses an
 * address that is not a web address, and reads them back newest first.
 */

import { hostOf, webAddress } from "../domain/links.js";
import { agoWords, daysSince } from "../domain/time.js";
import { resolvePerson } from "./resolve.js";

/**
 * Point at something that lives elsewhere.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} args.person Name or id.
 * @param {string} args.url
 * @param {string} [args.title] What it is. Defaults to the host.
 * @param {string} [args.note] Why it is worth opening, if that is not obvious.
 * @param {number} args.now
 */
export function linkTo(store, { person: who, url, title, note, now }) {
  const found = resolvePerson(store, who);
  if (!found.ok) {
    return { error: found.error };
  }

  const address = webAddress(url);
  if (!address.ok) {
    return { error: address.why };
  }

  /*
   * The same address twice on one person is almost always a second press rather
   * than a second thing, and two identical rows on a page is the kind of small
   * mess nobody cleans up. Refused with the date of the one already there, so
   * the answer is checkable rather than just a no.
   */
  const already = store
    .rows("links")
    .find((l) => String(l.subject) === found.person.id && String(l.url) === address.url);
  if (already) {
    return {
      error:
        `Den länken finns redan på ${found.person.name}, tillagd ` +
        `${agoWords((daysSince(already.at ?? 0, now) ?? 0))}.`
    };
  }

  const id = store.create("links", {
    subject: found.person.id,
    subjectKind: "person",
    url: address.url,
    title: String(title ?? "").trim() || hostOf(address.url),
    note: String(note ?? "").trim(),
    at: now
  });

  return { id, linked: `${title || hostOf(address.url)} → ${found.person.name}` };
}

/**
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} id
 */
export function unlink(store, id) {
  const row = store.rows("links").find((l) => String(l.id) === String(id));
  if (!row) {
    return { error: `No link with id "${id}".` };
  }
  store.remove("links", String(row.id));
  return { id: String(row.id), unlinked: true };
}

/**
 * What is linked to somebody, newest first.
 *
 * The age comes back rendered as well as raw, because the age is the point: a
 * reading prepared before a conversation last spring is not advice any more,
 * and the only thing standing between it and being read as advice is the line
 * saying how old it is.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} [args]
 * @param {string} [args.person] Name or id. Omitted returns everybody's.
 * @param {number} [args.now]
 */
export function links(store, { person: who, now = Date.now() } = {}) {
  let subject = null;
  if (who) {
    const found = resolvePerson(store, who);
    if (!found.ok) {
      return { error: found.error };
    }
    subject = found.person.id;
  }

  return linksFor(store, subject, now);
}

/**
 * The same read without the name resolution.
 *
 * Split out because `person()` embeds this in its result and already holds a
 * resolved id - going through the resolving wrapper there put a value that can
 * be an error inside a field that never can be, which the type checker caught
 * and was right about.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string | null} subject A person id, or null for everybody.
 * @param {number} now
 */
export function linksFor(store, subject, now) {
  const names = new Map(store.rows("people").map((p) => [String(p.id), String(p.name)]));

  return store
    .rows("links")
    .filter((l) => (subject === null ? true : String(l.subject) === subject))
    .sort((a, b) => Number(b.at ?? 0) - Number(a.at ?? 0))
    .map((l) => ({
      id: String(l.id),
      person: names.get(String(l.subject)) ?? "unknown",
      url: String(l.url ?? ""),
      title: String(l.title ?? ""),
      note: String(l.note ?? ""),
      at: Number(l.at ?? 0),
      added: agoWords((daysSince(l.at ?? 0, now) ?? 0))
    }));
}
