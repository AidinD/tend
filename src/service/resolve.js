/**
 * Resolving a name the way a caller writes it.
 *
 * Extracted from api.js so other service modules can use it without importing
 * api.js and creating a cycle - api.js re-exports both, so nothing that already
 * called them had to change.
 */

/**
 * Find a person by id, exact name, or a distinctive part of their name.
 *
 * Callers write "Nadia", not a uuid, so this has to be forgiving. It refuses
 * an ambiguous match rather than picking one, because logging a promise against
 * the wrong person is worse than an error message.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} query
 * @returns {{ ok: true, person: any } | { ok: false, error: string }}
 */
export function resolvePerson(store, query) {
  const people = store.rows("people");
  const q = String(query ?? "").trim().toLowerCase();

  if (!q) {
    return { ok: false, error: "No person given." };
  }

  const byId = people.find((p) => p.id === query);
  if (byId) {
    return { ok: true, person: byId };
  }

  const exact = people.filter((p) => String(p.name ?? "").toLowerCase() === q);
  if (exact.length === 1) {
    return { ok: true, person: exact[0] };
  }

  const partial = people.filter((p) => String(p.name ?? "").toLowerCase().includes(q));
  if (partial.length === 1) {
    return { ok: true, person: partial[0] };
  }
  if (partial.length > 1) {
    return {
      ok: false,
      error: `"${query}" matches ${partial.length} people: ${partial.map((p) => p.name).join(", ")}. Be more specific.`
    };
  }

  const known = people.map((p) => p.name).join(", ") || "nobody yet";
  return { ok: false, error: `No person matching "${query}". Known: ${known}.` };
}

/**
 * Same, for projects.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} query
 * @returns {{ ok: true, project: any } | { ok: false, error: string }}
 */
export function resolveProject(store, query) {
  const projects = store.rows("projects");
  const q = String(query ?? "").trim().toLowerCase();
  const hit = projects.filter(
    (p) => p.id === query || String(p.name ?? "").toLowerCase().includes(q)
  );
  if (hit.length === 1) {
    return { ok: true, project: hit[0] };
  }
  if (hit.length > 1) {
    return { ok: false, error: `"${query}" matches ${hit.map((p) => p.name).join(", ")}.` };
  }
  const known = projects.map((p) => p.name).join(", ") || "none yet";
  return { ok: false, error: `No project matching "${query}". Known: ${known}.` };
}

/**
 * Same, for workstreams.
 *
 * Needed because a delegation review is contact with a piece of work rather
 * than with a person or a project, and without this the only way to record one
 * was an error message. The Work view had a button for it that answered
 * "No project matching <uuid>" - the duty that consumes those reviews could
 * never be satisfied by anything.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} query
 * @returns {{ ok: true, workstream: any } | { ok: false, error: string }}
 */
export function resolveWorkstream(store, query) {
  const workstreams = store.rows("workstreams");
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) {
    return { ok: false, error: "No piece of work given." };
  }

  const byId = workstreams.find((w) => w.id === query);
  if (byId) {
    return { ok: true, workstream: byId };
  }

  const hit = workstreams.filter((w) => String(w.name ?? "").toLowerCase().includes(q));
  if (hit.length === 1) {
    return { ok: true, workstream: hit[0] };
  }
  if (hit.length > 1) {
    return {
      ok: false,
      error: `"${query}" matches ${hit.length} pieces of work: ${hit.map((w) => w.name).join(", ")}. Be more specific.`
    };
  }
  const known = workstreams.map((w) => w.name).join(", ") || "none yet";
  return { ok: false, error: `No piece of work matching "${query}". Known: ${known}.` };
}

/**
 * Same, for a stake - one person's interest in one project.
 *
 * By id only. A stake has no name of its own; the label a card shows is built
 * from the person and the project every time it is read, so there is nothing
 * here for a fuzzy match to match against. Accepting "the COO" or "Sjöhästen"
 * would also be the wrong shape: either could name several stakes, and picking
 * one would silently record an update to the wrong stakeholder.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} query
 * @returns {{ ok: true, stake: any } | { ok: false, error: string }}
 */
export function resolveStake(store, query) {
  const q = String(query ?? "").trim();
  if (!q) {
    return { ok: false, error: "No stakeholder interest given." };
  }
  const hit = store.rows("stakes").find((s) => s.id === q);
  if (hit) {
    return { ok: true, stake: hit };
  }
  return {
    ok: false,
    error: `No stakeholder interest with id "${q}". An update is recorded against a specific person-and-project pair, not against either on its own.`
  };
}
