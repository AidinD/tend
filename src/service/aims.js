/**
 * Setting and reading his own goals.
 *
 * Why this is its own thing rather than a practice or a growth thread, and why
 * an aim must name where its verdict comes from: see `domain/aims.js`.
 */

import {
  AT_ONCE,
  DEFAULT_CADENCE_DAYS,
  DEFAULT_HORIZON_DAYS,
  SOURCES,
  STATUSES,
  aimStanding,
  isLive,
  isSource
} from "../domain/aims.js";
import { DAY_MS, agoWords, daysSince } from "../domain/time.js";

/** @param {unknown} value */
const text = (value) => String(value ?? "").trim();

/**
 * Set an aim.
 *
 * The source is required and the measure is not, which looks backwards and is
 * not. Naming where the verdict comes from is the decision; wording the test is
 * work that reads better once the source is settled, and it comes back as a gap
 * on the card until it is done. What is refused is an aim that can never be
 * judged at all.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} args.aim
 * @param {string} args.source record | asked | logged
 * @param {string} [args.why]
 * @param {string} [args.measure]
 * @param {string} [args.asksWho]
 * @param {string} [args.through]
 * @param {number} [args.cadenceDays]
 * @param {number} [args.horizonDays]
 * @param {number} args.now
 */
export function setAim(store, { aim, source, why, measure, asksWho, through, cadenceDays, horizonDays, now }) {
  if (text(aim) === "") {
    return { error: "Ett mål behöver en mening som säger vad du vill kunna göra." };
  }
  if (!isSource(source)) {
    return {
      error:
        `Ett mål måste säga varifrån domen kommer. Giltiga: ${Object.keys(SOURCES).join(", ")}. ` +
        "Utan en kan det aldrig bedömas, och ett mål som ingenting kan uppfylla är en stående " +
        "förebråelse snarare än ett mål."
    };
  }

  /*
   * Two at a time, refused rather than warned about. Working on four aspects of
   * your own conduct at once is working on none, and unlike a roster there is no
   * way to split the attention between them.
   */
  const live = store.rows("aims").filter((a) => isLive(a));
  if (live.length >= AT_ONCE) {
    return {
      error:
        `${live.length} mål är redan öppna, vilket är gränsen. Nå eller släpp ett först - ` +
        `att jobba på fler än ${AT_ONCE} saker om sitt eget uppträdande samtidigt är att jobba på inget.`
    };
  }

  const days = Number(horizonDays) > 0 ? Number(horizonDays) : DEFAULT_HORIZON_DAYS;
  const id = store.create("aims", {
    aim: text(aim),
    why: text(why),
    source: String(source),
    measure: text(measure),
    asksWho: text(asksWho),
    through: text(through),
    cadenceDays: Number(cadenceDays) > 0 ? Number(cadenceDays) : DEFAULT_CADENCE_DAYS,
    horizon: now + days * DAY_MS,
    status: "open",
    startedAt: now
  });

  const row = /** @type {any} */ (store.rows("aims").find((a) => String(a.id) === String(id)));
  return { id, aim: text(aim), missing: aimStanding(row, [], now).missing };
}

/**
 * Fill in or correct an aim.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} id
 * @param {Record<string, any>} fields
 */
export function updateAim(store, id, fields) {
  const row = store.rows("aims").find((a) => String(a.id) === String(id));
  if (!row) {
    return { error: `No aim with id "${id}".` };
  }
  if (fields.source !== undefined && !isSource(fields.source)) {
    return { error: `Unknown source. Valid: ${Object.keys(SOURCES).join(", ")}.` };
  }

  /** @type {Record<string, any>} */
  const clean = {};
  for (const key of ["aim", "why", "measure", "asksWho", "through"]) {
    if (fields[key] !== undefined) {
      clean[key] = text(fields[key]);
    }
  }
  if (fields.source !== undefined) {
    clean.source = String(fields.source);
  }
  if (Number(fields.cadenceDays) > 0) {
    clean.cadenceDays = Number(fields.cadenceDays);
  }

  store.update("aims", String(row.id), clean);
  return { id: String(row.id), updated: Object.keys(clean) };
}

/**
 * Close an aim.
 *
 * `reached` and `dropped` are both endings and only one of them is a success,
 * which is why letting go is offered rather than only implied. An aim quietly
 * abandoned is the thing this whole shape exists to prevent.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} id
 * @param {object} args
 * @param {string} args.status reached | dropped
 * @param {string} [args.why] What decided it.
 */
export function endAim(store, id, { status, why }) {
  const row = store.rows("aims").find((a) => String(a.id) === String(id));
  if (!row) {
    return { error: `No aim with id "${id}".` };
  }
  if (status !== "reached" && status !== "dropped") {
    return { error: `An aim ends as reached or dropped. Got "${String(status)}".` };
  }
  store.update("aims", String(row.id), { status, endedWhy: text(why) });
  return { id: String(row.id), status };
}

/**
 * Record one occasion.
 *
 * `happened` is required and takes false, which is the field that makes this
 * worth anything. A log of only the times it went well is a scrapbook; the gap
 * between the occasions taken and the ones missed is the reading.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} args.aim
 * @param {string} args.note What happened, concretely.
 * @param {boolean} args.happened Did you do the thing, or is this a miss?
 * @param {number} [args.at]
 * @param {number} args.now
 */
export function logAim(store, { aim: aimId, note, happened, now, at }) {
  const row = store.rows("aims").find((a) => String(a.id) === String(aimId));
  if (!row) {
    return { error: `No aim with id "${aimId}".` };
  }
  if (typeof happened !== "boolean") {
    return {
      error:
        "Säg om det hände. En logg med bara gångerna det gick bra är ett klippalbum - glappet " +
        "mellan tillfällena du tog och de du missade är hela läsningen."
    };
  }
  if (text(note) === "") {
    return { error: "Säg vad som hände, konkret nog att känna igen om tre månader." };
  }

  const id = store.create("aimNotes", {
    aim: String(row.id),
    note: text(note),
    happened,
    at: typeof at === "number" ? at : now
  });
  return { id, aim: String(row.aim ?? ""), happened };
}

/**
 * The aims as they stand, live first.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {number} [now]
 */
export function aims(store, now = Date.now()) {
  const notes = store.rows("aimNotes");
  const rows = store.rows("aims").map((row) => {
    const standing = aimStanding(row, notes, now);
    return {
      ...standing,
      statusLabel: STATUSES[standing.status]?.label ?? standing.status,
      sourceLabel: SOURCES[standing.source]?.label ?? standing.source,
      lastLogged: standing.lastAt === null ? "aldrig" : agoWords(standing.daysSince),
      endedWhy: String(row.endedWhy ?? "")
    };
  });

  const order = { open: 0, reached: 1, dropped: 2 };
  return rows.sort(
    (a, b) =>
      (order[/** @type {"open"} */ (a.status)] ?? 3) - (order[/** @type {"open"} */ (b.status)] ?? 3) ||
      b.daysSince - a.daysSince
  );
}

/**
 * One aim, with its occasions.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} id
 * @param {number} [now]
 */
export function aim(store, id, now = Date.now()) {
  const row = store.rows("aims").find((a) => String(a.id) === String(id));
  if (!row) {
    return { error: `No aim with id "${id}".` };
  }
  const notes = store.rows("aimNotes");
  return {
    ...aimStanding(row, notes, now),
    occasions: notes
      .filter((n) => String(n.aim) === String(row.id))
      .sort((a, b) => Number(b.at ?? 0) - Number(a.at ?? 0))
      .map((n) => ({
        id: String(n.id),
        note: String(n.note ?? ""),
        happened: n.happened === true,
        at: Number(n.at ?? 0),
        when: agoWords((daysSince(n.at ?? 0, now) ?? 0))
      }))
  };
}
