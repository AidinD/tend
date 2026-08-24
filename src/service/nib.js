/**
 * Reading Nib.
 *
 * Nib owns the notes; Tend reads them and never writes a byte back. Indexing
 * reads only `index.json`, which carries every note's metadata without any note
 * bodies - so the routine path costs one small file read and never opens a note
 * about a colleague.
 *
 * `noteBody` at the bottom is the single exception and the only function here
 * that reads what you actually wrote. Nothing automatic calls it: it exists for
 * a model call the user asked for by name, and the boundary is worth keeping
 * that sharp, because "Tend read my 1-1 notes" should never be a surprise.
 *
 * Which notes belong to whom is not guessed from names or enforced by a naming
 * convention. A Nib category or sub-category is bound to a person here in Tend,
 * and the binding says what kind of contact notes there count as. Nib gets
 * organised however suits; changing your mind edits one binding instead of
 * rewriting notes.
 *
 * A useful accident of Nib's design: it already models flagged blocks as action
 * points with a done state. Those are promises, already structured by hand,
 * which means the highest-value thing Tend tracks needs no model at all.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/**
 * Where Nib keeps its data. Mirrors Nib's own resolution: `NIB_DATA_DIR`,
 * otherwise Electron's userData for an app named "nib".
 *
 * @param {object} [opts]
 * @param {Record<string, string | undefined>} [opts.env]
 * @param {NodeJS.Platform} [opts.platform]
 * @param {string} [opts.home]
 * @returns {string}
 */
export function nibDataDir({ env = process.env, platform = process.platform, home = homedir() } = {}) {
  const override = env.NIB_DATA_DIR?.trim();
  if (override) {
    return override;
  }
  if (platform === "win32") {
    return join(env.APPDATA ?? join(home, "AppData", "Roaming"), "nib");
  }
  if (platform === "darwin") {
    return join(home, "Library", "Application Support", "nib");
  }
  return join(env.XDG_CONFIG_HOME ?? join(home, ".config"), "nib");
}

/**
 * @typedef {object} NibNote
 * @property {string} id
 * @property {string} categoryId
 * @property {string | null} subId
 * @property {string} title
 * @property {number} created
 * @property {number} edited
 * @property {{ id: string, text: string, done: boolean }[]} alerts
 * @property {string} flag
 */

/**
 * @typedef {object} NibFolder
 * @property {string} categoryId
 * @property {string | null} subId
 * @property {string} label Category name, or "Category / Sub".
 * @property {number} notes
 */

/**
 * Read Nib's index.
 *
 * Returns `available: false` rather than throwing when Nib is not installed or
 * has never been opened - a perfectly normal state that should not stop Tend
 * from working.
 *
 * @param {string} [dir]
 * @returns {{ available: true, categories: any[] } | { available: false, why: string }}
 */
export function readNibIndex(dir = nibDataDir()) {
  const path = join(dir, "index.json");
  /** @type {string} */
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    const code = /** @type {NodeJS.ErrnoException} */ (err).code;
    if (code === "ENOENT") {
      return { available: false, why: `No Nib data at ${path}. Open Nib once, or set NIB_DATA_DIR.` };
    }
    return { available: false, why: `Could not read ${path}: ${String(err)}` };
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.categories)) {
      return { available: false, why: `${path} does not look like a Nib index.` };
    }
    return { available: true, categories: parsed.categories };
  } catch {
    // Nib writes atomically, so a torn read here is unlikely rather than
    // routine. Still worth not crashing over.
    return { available: false, why: `${path} could not be parsed. It may be mid-write; try again.` };
  }
}

/**
 * Every folder in Nib that could be bound to a person, with how many notes it
 * holds. This is what the binding UI offers.
 *
 * @param {string} [dir]
 * @returns {{ available: false, why: string } | { available: true, folders: NibFolder[] }}
 */
export function listNibFolders(dir) {
  const index = readNibIndex(dir);
  if (!index.available) {
    return index;
  }

  /** @type {NibFolder[]} */
  const folders = [];

  for (const category of index.categories) {
    const notes = Array.isArray(category.notes) ? category.notes : [];
    folders.push({
      categoryId: String(category.id),
      subId: null,
      label: String(category.name),
      notes: notes.filter((/** @type {any} */ n) => n.subId === null || n.subId === undefined).length
    });
    for (const sub of category.subs ?? []) {
      folders.push({
        categoryId: String(category.id),
        subId: String(sub.id),
        label: `${category.name} / ${sub.name}`,
        notes: notes.filter((/** @type {any} */ n) => n.subId === sub.id).length
      });
    }
  }

  return { available: true, folders };
}

/**
 * Notes inside one bound folder.
 *
 * A binding on a whole category deliberately covers only the notes sitting
 * directly in it, not the ones inside its sub-categories. Otherwise binding a
 * category and one of its subs to different people would double-count, and the
 * quieter of the two mistakes is the one that under-reports.
 *
 * @param {any[]} categories
 * @param {string} categoryId
 * @param {string | null} subId
 * @returns {NibNote[]}
 */
export function notesIn(categories, categoryId, subId) {
  const category = categories.find((c) => String(c.id) === categoryId);
  if (!category) {
    return [];
  }
  const notes = Array.isArray(category.notes) ? category.notes : [];
  return notes
    .filter((/** @type {any} */ n) => (subId === null ? !n.subId : n.subId === subId))
    .map((/** @type {any} */ n) => ({
      id: String(n.id),
      categoryId: String(n.categoryId ?? category.id),
      subId: n.subId ?? null,
      title: String(n.title ?? ""),
      created: Number(n.created ?? 0),
      edited: Number(n.edited ?? n.created ?? 0),
      alerts: Array.isArray(n.alerts)
        ? n.alerts.map((/** @type {any} */ a) => ({
            id: String(a.id),
            text: String(a.text ?? ""),
            done: Boolean(a.done)
          }))
        : [],
      flag: String(n.flag ?? "")
    }));
}

/**
 * Index Nib into Tend: one contact per note, one promise per open action point.
 *
 * Idempotent by construction. Every row it writes carries a deterministic id
 * derived from the Nib id, and the reducer leaves an existing row alone on a
 * repeated create - so this can run on a timer, on app start, and by hand,
 * without duplicating anything.
 *
 * It also closes the loop the other way: an action point ticked off in Nib
 * resolves its promise here, so nothing has to be said twice.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} [opts]
 * @param {string} [opts.dir] Nib data directory.
 * @param {boolean} [opts.dry] Report what would change without writing.
 * @returns {{ error: string } | {
 *   contacts: number, promises: number, resolved: number,
 *   bindings: number, skipped: string[]
 * }}
 */
export function indexNib(store, { dir, dry = false } = {}) {
  const index = readNibIndex(dir);
  if (!index.available) {
    return { error: index.why };
  }

  const bindings = store.rows("sources");
  if (bindings.length === 0) {
    return {
      error:
        "No Nib folders are bound to anyone yet, so there is nothing to index. " +
        "Bind a category or sub-category to a person first."
    };
  }

  const existingTouches = new Set(store.rows("touches").map((t) => String(t.id)));
  const promiseRows = new Map(store.rows("promises").map((p) => [String(p.id), p]));

  let contacts = 0;
  let promises = 0;
  let resolved = 0;
  /** @type {string[]} */
  const skipped = [];

  for (const binding of bindings) {
    const notes = notesIn(index.categories, String(binding.categoryId), binding.subId ?? null);
    if (notes.length === 0) {
      skipped.push(`${binding.label ?? binding.categoryId}: no notes`);
      continue;
    }

    for (const note of notes) {
      // A note is evidence that contact happened, dated when it was written
      // rather than when it was indexed.
      const touchId = `nib:${note.id}`;
      if (!existingTouches.has(touchId)) {
        contacts += 1;
        if (!dry) {
          store.create("touches", {
            id: touchId,
            subject: binding.person,
            kind: binding.kind,
            note: note.title || null,
            at: note.created || Date.now(),
            from: "nib"
          });
        }
      }

      // A flagged block is an action point the user marked by hand. No model
      // needed, and no guessing about what counts as a commitment.
      for (const alert of note.alerts) {
        const promiseId = `nib:${note.id}:${alert.id}`;
        const existing = promiseRows.get(promiseId);

        if (!existing && !alert.done) {
          promises += 1;
          if (!dry) {
            store.create("promises", {
              id: promiseId,
              person: binding.person,
              text: alert.text,
              madeAt: note.created || Date.now(),
              due: null,
              state: "open",
              from: "nib"
            });
          }
          continue;
        }

        // Ticked off in Nib closes it here too.
        if (existing && alert.done && (existing.state ?? "open") === "open") {
          resolved += 1;
          if (!dry) {
            store.update("promises", promiseId, { state: "resolved" });
          }
        }
      }
    }
  }

  return { contacts, promises, resolved, bindings: bindings.length, skipped };
}

/* ------------------------------------------------------- reading a body -- */

/**
 * The text of one note.
 *
 * This is the one thing in this file that opens a note about a colleague, and
 * it is deliberately not on any automatic path: indexing never calls it, the
 * app never calls it while drawing a view, and nothing calls it on a timer. It
 * exists so that a model call the user asked for by name has something to read.
 *
 * Nib stores a body as sanitised HTML in `notes/<id>.json`. What comes back
 * here is plain text, because a model needs the words and not the markup, and
 * because the fewer characters that leave this machine the better.
 *
 * @param {string} noteId
 * @param {string} [dir] Nib data directory.
 * @returns {{ available: true, text: string } | { available: false, why: string }}
 */
export function noteBody(noteId, dir = nibDataDir()) {
  const path = join(dir, "notes", `${noteId}.json`);
  /** @type {string} */
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    const code = /** @type {NodeJS.ErrnoException} */ (err).code;
    return {
      available: false,
      why: code === "ENOENT" ? `Nib has no note file for ${noteId}.` : `Could not read ${path}: ${String(err)}`
    };
  }

  try {
    const parsed = JSON.parse(raw);
    return { available: true, text: htmlToText(String(parsed?.html ?? "")) };
  } catch {
    return { available: false, why: `The note file for ${noteId} could not be parsed.` };
  }
}

/**
 * Sanitised HTML to something a model can read.
 *
 * Not a parser and not trying to be. Nib writes a small, known set of tags, and
 * the only jobs here are keeping the line breaks that carry meaning - a list is
 * a list because of them - and not leaving `&amp;` in the middle of a sentence.
 *
 * @param {string} html
 * @returns {string}
 */
export function htmlToText(html) {
  return html
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Last, so an escaped ampersand in the source cannot become the start of
    // another entity once the ones above have been replaced.
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}
