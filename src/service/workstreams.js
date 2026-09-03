/**
 * Pieces of work with a stated delegation level and an owner.
 *
 * The level is the point. A piece of work whose delegation level was never
 * stated is the middle ground where the responsibility has moved and the
 * information has not - so an unstated level is flagged as its own thing rather
 * than being left to look like tidy-up.
 *
 * Split out of api.js. Its one remaining tie was to the archive writes, which
 * is now an ordinary import from writing.js rather than two functions sharing
 * a file by accident.
 */

import { isArchived } from "../domain/archive.js";
import { agoWords, daysSince } from "../domain/time.js";
import { LEVELS, isLevel, isUnspecified, reviewInterval } from "../domain/workstreams.js";
import { badArchiveInstant } from "./guards.js";
import { resolvePerson, resolveProject, resolveWorkstream } from "./resolve.js";
import { archivePerson, archiveProject, unarchivePerson, unarchiveProject } from "./writing.js";

/**
 * @param {import("../storage/store.js").TendStore} store
 * @param {number} now
 */
export function workstreams(store, now) {
  const names = new Map(store.rows("people").map((p) => [String(p.id), String(p.name)]));
  const projects = new Map(store.rows("projects").map((p) => [String(p.id), String(p.name)]));
  const touches = store.rows("touches");

  // Archived workstreams stop appearing in the default listing, same as
  // archived people and projects - the delegation-review cadence they carry
  // is exactly the kind of nagging archiving exists to stop.
  return store.rows("workstreams").filter((w) => !isArchived(w)).map((w) => {
    const last = touches
      .filter((t) => t.subject === w.id && t.kind === "delegation-review")
      .sort((a, b) => Number(b.at ?? 0) - Number(a.at ?? 0))[0];
    const level = String(w.level ?? "");
    return {
      id: w.id,
      name: w.name,
      project: w.project ? (projects.get(String(w.project)) ?? null) : null,
      owner: w.owner ? (names.get(String(w.owner)) ?? null) : null,
      level: w.level ?? null,
      levelMeans: isLevel(level) ? LEVELS[level].means : "Not stated.",
      // Who decides, as opposed to how closely you follow. The sentence you
      // should be able to read to them.
      mandate: isLevel(level) ? LEVELS[level].authority : "Nobody has said who decides.",
      reviewEvery: `${reviewInterval(w.level)} days`,
      // `agoWords`, not `humanDays` plus " ago" - the helper exists because the
      // hand-rolled version says "today ago", and this card said it every day a
      // workstream had just been reviewed. Same fault the project list had.
      lastReviewed: last ? agoWords(daysSince(last.at, now) ?? 0) : "never",
      unspecified: isUnspecified(w)
    };
  });
}

/**
 * The workstreams `workstreams()` hides. See `archivedPeople` for why this is
 * a sibling function rather than a flag on `workstreams()`.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {number} now
 */
export function archivedWorkstreams(store, now) {
  return store
    .rows("workstreams")
    .filter((w) => isArchived(w))
    .map((w) => ({ id: w.id, name: w.name, archivedAt: w.archivedAt }))
    .sort((a, b) => b.archivedAt - a.archivedAt);
}

/**
 * Add a piece of work with a delegation level.
 *
 * The level sits here rather than on the project or the person, because how
 * closely you follow up depends on how experienced this person is at this
 * particular task. A project-wide level would be a guess and a person-wide one
 * would be a judgement about them rather than about the work.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} args.name
 * @param {string} [args.owner]
 * @param {string} [args.project]
 * @param {string} [args.level]
 * @param {number} args.now
 */
export function addWorkstream(store, { name, owner, project, level, now }) {
  if (!String(name ?? "").trim()) {
    return { error: "A workstream needs a name." };
  }
  if (level !== undefined && !isLevel(String(level))) {
    return { error: `Unknown level "${level}". Valid: ${Object.keys(LEVELS).join(", ")}.` };
  }

  let ownerId = null;
  if (owner) {
    const found = resolvePerson(store, owner);
    if (!found.ok) {
      return { error: found.error };
    }
    ownerId = found.person.id;
  }

  let projectId = null;
  if (project) {
    const found = resolveProject(store, project);
    if (!found.ok) {
      return { error: found.error };
    }
    projectId = found.project.id;
  }

  const id = store.create("workstreams", {
    name: String(name).trim(),
    owner: ownerId,
    project: projectId,
    level: level ?? null,
    since: now
  });
  return { id, added: name, level: level ?? "not set" };
}

/**
 * See `archivePerson` - same shape, same idempotency guarantee, for a
 * workstream.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} id
 * @param {object} args
 * @param {number} args.now
 */
export function archiveWorkstream(store, id, { now }) {
  const found = resolveWorkstream(store, id);
  if (!found.ok) {
    return { error: found.error };
  }
  if (isArchived(found.workstream)) {
    return {
      id: found.workstream.id,
      name: found.workstream.name,
      archivedAt: found.workstream.archivedAt,
      already: true
    };
  }
  const bad = badArchiveInstant(now);
  if (bad) {
    return bad;
  }
  store.update("workstreams", found.workstream.id, { archivedAt: now });
  return { id: found.workstream.id, name: found.workstream.name, archivedAt: now };
}

/**
 * See `unarchivePerson`.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} id
 */
export function unarchiveWorkstream(store, id) {
  const found = resolveWorkstream(store, id);
  if (!found.ok) {
    return { error: found.error };
  }
  if (!isArchived(found.workstream)) {
    return { id: found.workstream.id, name: found.workstream.name, already: true };
  }
  store.update("workstreams", found.workstream.id, { archivedAt: null });
  return { id: found.workstream.id, name: found.workstream.name };
}

/**
 * The "I left this job" moment: everything active, archived in one call.
 *
 * A thin wrapper over `archivePerson`/`archiveProject`/`archiveWorkstream` and
 * nothing more - a bulk action is not a separate code path with its own rules,
 * it is the same reversible per-item archive, applied to everyone and
 * everything that is not already archived. That is also what makes it safe to
 * press again by mistake: an already-archived row is skipped by the per-item
 * function's own idempotency guard, so a second run reports zero and changes
 * nothing.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {number} args.now
 */
export function archiveEverythingActive(store, { now }) {
  // Deliberately NOT validated up front. The instant is the same for every row,
  // so a bad one refuses every row identically and nothing is written - and
  // letting the refusals come back through the same path as any other means the
  // counter's honesty is reachable from the outside and can be tested, rather
  // than being an unreachable branch nobody can break.
  /** @type {string[]} */
  const people = [];
  /** @type {string[]} */
  const projects = [];
  /** @type {string[]} */
  const workstreams = [];
  /** @type {string[]} */
  const refused = [];

  /**
   * Counted only when the row actually came back carrying a fresh stamp.
   *
   * The first version counted anything that did not report `already`, which
   * counts a refusal as an archive: the report then says a row was archived
   * that the next read still finds active. The report and the effect have to
   * agree, so the count follows the written field and nothing else.
   *
   * @param {{ error: string } | { archivedAt: any, already?: boolean }} result
   * @returns {boolean}
   */
  const archivedNow = (result) => {
    if ("error" in result) {
      refused.push(result.error);
      return false;
    }
    return result.already !== true && typeof result.archivedAt === "number";
  };

  for (const p of store.rows("people")) {
    if (archivedNow(archivePerson(store, p.id, { now }))) {
      people.push(String(p.id));
    }
  }
  for (const p of store.rows("projects")) {
    if (archivedNow(archiveProject(store, p.id, { now }))) {
      projects.push(String(p.id));
    }
  }
  for (const w of store.rows("workstreams")) {
    if (archivedNow(archiveWorkstream(store, w.id, { now }))) {
      workstreams.push(String(w.id));
    }
  }

  // Recorded only when it changed something, so an accidental second press does
  // not leave an empty run standing in front of the one worth undoing.
  const changed = people.length + projects.length + workstreams.length;
  if (changed > 0) {
    store.create("bulkArchives", { at: now, people, projects, workstreams });
  }

  // Counts, not id lists, in the answer: the ids are for the undo and live in
  // the recorded run, and a window that got both would have two sources for the
  // same fact.
  const summary = {
    people: people.length,
    projects: projects.length,
    workstreams: workstreams.length
  };

  // Said out loud rather than swallowed: a partial archive is safe to re-run,
  // but only if the window knows it was partial.
  return refused.length > 0 ? { ...summary, refused } : summary;
}

/**
 * The most recent bulk archive that has not been undone, or null.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @returns {Record<string, any> | null}
 */
function latestBulkArchive(store) {
  const runs = store
    .rows("bulkArchives")
    .filter((/** @type {any} */ r) => r.undoneAt === undefined || r.undoneAt === null)
    .sort((/** @type {any} */ a, /** @type {any} */ b) => Number(b.at ?? 0) - Number(a.at ?? 0));
  return runs.length > 0 ? runs[0] : null;
}

/**
 * Is there a bulk archive to undo, and what would undoing it put back?
 *
 * Read by Settings so the button can say what it will do before it is pressed,
 * rather than offering an undo whose size is a surprise.
 *
 * @param {import("../storage/store.js").TendStore} store
 */
export function undoableBulkArchive(store) {
  const run = latestBulkArchive(store);
  if (run === null) {
    return null;
  }
  const still = (/** @type {"people" | "projects" | "workstreams"} */ collection) => {
    const ids = new Set((run[collection] ?? []).map((/** @type {any} */ id) => String(id)));
    // Counted as it stands NOW, not as it was recorded. Anything unarchived by
    // hand since is already back, and saying otherwise would promise to restore
    // something that needs no restoring.
    return store
      .rows(collection)
      .filter((/** @type {any} */ row) => ids.has(String(row.id)) && isArchived(row)).length;
  };
  return {
    id: run.id,
    at: run.at,
    people: still("people"),
    projects: still("projects"),
    workstreams: still("workstreams")
  };
}

/**
 * Put back exactly what the last bulk archive changed.
 *
 * Only that run's rows, and only the ones still archived - not "unarchive
 * everything", which would also drag back rows archived by hand months ago and
 * turn an undo into a decision nobody made. The run is marked undone rather
 * than removed, because the log does not delete and because a second press must
 * not silently reach further back to an older run.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} [args]
 * @param {number} [args.now]
 */
export function undoBulkArchive(store, { now } = {}) {
  const run = latestBulkArchive(store);
  if (run === null) {
    return { error: "There is no bulk archive left to undo." };
  }

  const undo = {
    people: /** @type {(store: any, id: string) => any} */ (unarchivePerson),
    projects: /** @type {(store: any, id: string) => any} */ (unarchiveProject),
    workstreams: /** @type {(store: any, id: string) => any} */ (unarchiveWorkstream)
  };

  const restored = { people: 0, projects: 0, workstreams: 0 };
  /** @type {string[]} */
  const refused = [];

  for (const collection of /** @type {const} */ (["people", "projects", "workstreams"])) {
    for (const id of run[collection] ?? []) {
      const row = store.rows(collection).find((/** @type {any} */ r) => String(r.id) === String(id));
      // Gone or already back: neither is a failure, and neither is a restore.
      if (row === undefined || !isArchived(row)) {
        continue;
      }
      const result = undo[collection](store, String(id));
      if (result && result.error) {
        refused.push(result.error);
        continue;
      }
      restored[collection] += 1;
    }
  }

  store.update("bulkArchives", run.id, { undoneAt: typeof now === "number" ? now : Date.now() });

  return refused.length > 0 ? { ...restored, refused } : restored;
}

/**
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} id
 * @param {string} level
 */
export function setDelegationLevel(store, id, level) {
  const row = store.rows("workstreams").find((w) => w.id === id);
  if (!row) {
    return { error: `No workstream with id "${id}".` };
  }
  if (!isLevel(String(level))) {
    return { error: `Unknown level "${level}". Valid: ${Object.keys(LEVELS).join(", ")}.` };
  }
  store.update("workstreams", id, { level });
  return { id, level, reviewEvery: `${reviewInterval(level)} days` };
}
