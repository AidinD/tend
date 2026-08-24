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

import { execFileSync } from "node:child_process";
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
  const stored = userEnvironment("NIB_DATA_DIR", platform);
  if (stored !== null) {
    return stored;
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
 * A user environment variable, read from where Windows actually keeps it.
 *
 * `process.env` only carries what the process INHERITED, and a variable set
 * after a parent started is not in it. Nib itself always resolves correctly,
 * because it is launched fresh from the shell; Tend reaching for the same
 * variable can come up empty and quietly fall back to the per-user default -
 * which on this machine is a leftover notebook that still parses, still has
 * categories, and is three years of notes out of date.
 *
 * That failure is invisible: Tend finds A notebook, lists folders, binds them,
 * and reports nothing wrong. It cost a whole evening once. So the registry is
 * consulted rather than trusted to have been inherited.
 *
 * Windows only, and best-effort: anything unexpected means "not set", never a
 * throw. On other platforms the environment is the whole answer.
 *
 * @param {string} name
 * @param {NodeJS.Platform} platform
 * @returns {string | null}
 */
function userEnvironment(name, platform) {
  if (platform !== "win32") {
    return null;
  }
  try {
    const out = execFileSync("reg", ["query", "HKCU\\Environment", "/v", name], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    // REG_SZ and REG_EXPAND_SZ both land as `<name>    <TYPE>    <value>`.
    const match = /\s{2,}REG_(?:EXPAND_)?SZ\s{2,}(.+)/.exec(out);
    const value = match?.[1]?.trim() ?? "";
    return value === "" ? null : value.replace(/%([^%]+)%/g, (_, key) => process.env[key] ?? "");
  } catch {
    // Not set, or reg is unavailable. Both mean the same thing here.
    return null;
  }
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
 * @property {string[]} tags Tag ids from Nib's own catalog.
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
 * @returns {{ available: true, categories: any[], tags?: any[] } | { available: false, why: string }}
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
    return { available: true, categories: parsed.categories, tags: parsed.tags };
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
 * @returns {{ available: false, why: string } | { available: true, folders: NibFolder[], dir: string }}
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

  return { available: true, folders, dir: dir ?? nibDataDir() };
}

/**
 * Nib's whole tag catalog.
 *
 * Read so the mapping can be built by picking a tag rather than typing an id.
 * The names are Nib's and stay Nib's - Tend shows them and stores the id, so
 * renaming a tag over there changes what this screen says and nothing else.
 *
 * @param {string} [dir]
 * @returns {{ available: false, why: string } | { available: true, dir: string, tags: { id: string, name: string, color: string, description: string }[] }}
 */
export function listNibTags(dir) {
  const index = readNibIndex(dir);
  if (!index.available) {
    return index;
  }
  const raw = /** @type {any} */ (index).tags;
  return {
    available: true,
    dir: dir ?? nibDataDir(),
    tags: (Array.isArray(raw) ? raw : []).map((/** @type {any} */ t) => ({
      id: String(t?.id ?? ""),
      name: String(t?.name ?? ""),
      color: String(t?.color ?? "#9a9da3"),
      description: String(t?.description ?? "")
    })).filter((t) => t.id !== "" && t.name !== "")
  };
}

/**
 * The tags actually used on notes in one folder, with how many carry each.
 *
 * The mapping screen asks what a tag means HERE, and the honest scope of that
 * question is the folder in front of you. Offering the whole catalog made it
 * ask about `Principle` for a folder of conversations with a colleague, which
 * is a question with no sensible answer and five of them in a row.
 *
 * @param {string} categoryId
 * @param {string | null} subId
 * @param {string} [dir]
 * @returns {{ available: false, why: string } | { available: true, dir: string, tags: { id: string, name: string, color: string, description: string, notes: number }[] }}
 */
export function tagsInFolder(categoryId, subId, dir) {
  const catalog = listNibTags(dir);
  if (!catalog.available) {
    return catalog;
  }
  const index = readNibIndex(dir);
  if (!index.available) {
    return { available: false, why: index.why };
  }

  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const note of notesIn(index.categories, categoryId, subId ?? null)) {
    for (const id of note.tags) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }

  return {
    available: true,
    dir: catalog.dir,
    tags: catalog.tags
      .filter((tag) => counts.has(tag.id))
      .map((tag) => ({ ...tag, notes: counts.get(tag.id) ?? 0 }))
  };
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
      flag: String(n.flag ?? ""),
      // Ids only. What they MEAN is Tend's business and lives in the binding,
      // never in Nib - the same reason the folder does not carry the person.
      tags: Array.isArray(n.tags) ? n.tags.map((/** @type {any} */ t) => String(t)) : []
    }));
}

/**
 * What kinds of contact one note counts as.
 *
 * Its tags, mapped. Nothing else - there is no default, and an untagged note
 * produces no contact at all.
 *
 * That is the whole model, and the earlier version had a folder-level default
 * underneath it which was wrong in the direction that matters. A folder is one
 * PERSON, not one kind: everything about somebody lives in it, the
 * conversations and what a colleague mentioned and what you watched them do. A
 * default meant an untagged note of any of those counted as whichever kind the
 * folder was set to - so a note about something you HEARD reset the clock on
 * having SPOKEN to them, and the app said the two were in step.
 *
 * Erring the other way costs a cadence that does not advance until a note is
 * tagged, which shows up as an alert you can answer. The app's rule throughout
 * is to flag in doubt and never suppress: a missing nudge is invisible, and an
 * extra one takes a moment to dismiss.
 *
 * A tag with no rule is ignored rather than guessed at. Most of Nib's tags mean
 * nothing here and should.
 *
 * @param {Pick<NibNote, "tags">} note Only the tag ids are read, so a caller
 *   with something note-shaped does not have to build a whole one.
 * @param {any} binding
 * @param {{ tagId: string, kind: string }[]} rules
 * @returns {string[]}
 */
export function kindsFor(note, binding, rules) {
  const mapped = new Set();
  for (const rule of rules) {
    if (note.tags.includes(String(rule.tagId)) && String(rule.kind ?? "") !== "") {
      mapped.add(String(rule.kind));
    }
  }
  return [...mapped];
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

    const rules = Array.isArray(binding.rules) ? binding.rules : [];

    for (const note of notes) {
      // A note is evidence that contact happened, dated when it was written
      // rather than when it was indexed.
      //
      // One touch per KIND, not one per note. A note tagged both 1-1 and
      // Feedback is honestly both, and satisfies both cadences; the id carries
      // the kind so the two never collide and a re-run still writes nothing new.
      for (const kind of kindsFor(note, binding, rules)) {
        const touchId = `nib:${note.id}:${kind}`;
        if (existingTouches.has(touchId)) {
          continue;
        }
        contacts += 1;
        if (!dry) {
          store.create("touches", {
            id: touchId,
            subject: binding.person,
            kind,
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
