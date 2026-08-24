/**
 * Reading Jot's board, so a person's card can say what is open in their area.
 *
 * Tend owns people, cadences, promises and delegation. It has never known what
 * work exists, which is the whole reason preparing for a conversation meant
 * three windows: who they are here, what is moving in Jot, what you last wrote
 * in Nib. This closes the first of those two gaps.
 *
 * Read-only, and one file. `todos.json` is a documented contract - Jot's own
 * INTEGRATION.md is written for exactly this - so there is no API to call and
 * nothing to keep in sync beyond the shape below.
 *
 * ## How a task becomes "theirs"
 *
 * Two routes, and the card says which one found it, because a join you cannot
 * see the reason for is a join you stop trusting the first time it is wrong.
 *
 *   owner    the person owns a workstream, the workstream names a project, and
 *            a Jot category has that name. This is the principled route: it goes
 *            through a delegation somebody actually recorded.
 *
 *   named    the task text mentions their name. Fragile, obviously - two people
 *            called Anna, or a task about a person rather than for them - but it
 *            catches the common case that nobody remembered to model, and a
 *            labelled guess is better than a silent miss.
 *
 * Nothing here sends anything anywhere. The board carries internal project names
 * and private work; this is a local read for a local card.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { stripBom } from "keel/storage";

/** @typedef {{ id: string, name: string, domain?: string, repoPath?: string }} JotCategory */
/** @typedef {{ id: string, text: string, status: string, categoryId: string, priority?: number, parentId?: string | null }} JotTodo */
/** @typedef {{ text: string, category: string, status: string, priority: number, found: "owner" | "named" }} Relevant */

/**
 * Where Jot keeps its board.
 *
 * Same convention as Tend's own data directory, and the same reason: the default
 * userData path is inside the area an agent session's writes get redirected away
 * from, so anything but a real path is a coin toss about which copy you read.
 *
 * @param {{ env?: NodeJS.ProcessEnv, home?: string }} [options]
 */
export function jotDataDir({ env = process.env, home = homedir() } = {}) {
  const override = env.JOT_DATA_DIR;
  if (override !== undefined && override.trim() !== "") {
    return override.trim();
  }
  return join(home, "AppData", "Roaming", "jot");
}

/**
 * The board, or null when there is not one.
 *
 * Null rather than an empty board, so a caller can tell "Jot is not installed"
 * from "nothing is open". A card that says "nothing on the board" when it could
 * not find the board is a card that lies quietly.
 *
 * @param {string} [dir]
 * @returns {{ categories: JotCategory[], todos: JotTodo[] } | null}
 */
export function readBoard(dir = jotDataDir()) {
  const path = join(dir, "todos.json");
  if (!existsSync(path)) {
    return null;
  }
  try {
    const raw = JSON.parse(stripBom(readFileSync(path, "utf8")));
    if (!Array.isArray(raw?.categories) || !Array.isArray(raw?.todos)) {
      return null;
    }
    return { categories: raw.categories, todos: raw.todos };
  } catch {
    return null;
  }
}

/** Work that is actually moving or waiting, which is what a card should show. */
const LIVE = new Set(["open", "in-progress", "review"]);

/**
 * Open work that belongs to one person.
 *
 * @param {object} args
 * @param {{ categories: JotCategory[], todos: JotTodo[] } | null} args.board
 * @param {string} args.name Their name, for the `named` route.
 * @param {string[]} args.areas Project names from workstreams they own.
 * @param {number} [args.limit]
 * @returns {Relevant[]}
 */
export function workFor({ board, name, areas, limit = 6 }) {
  if (board === null) {
    return [];
  }

  const byId = new Map(board.categories.map((c) => [String(c.id), String(c.name ?? "")]));
  const wanted = new Set(areas.map((a) => a.trim().toLowerCase()).filter((a) => a !== ""));

  // First name only for the text route. A full name rarely appears in a task,
  // and a surname on its own is more likely to be a false match than a hit.
  const first = String(name ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  const mentions =
    first.length >= 3 ? new RegExp(`(^|[^\\p{L}])${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}]|$)`, "iu") : null;

  /** @type {Relevant[]} */
  const out = [];
  for (const todo of board.todos) {
    if (!LIVE.has(String(todo.status))) {
      continue;
    }
    const category = byId.get(String(todo.categoryId)) ?? "";
    const text = String(todo.text ?? "").trim();
    if (text === "") {
      continue;
    }

    // Owner beats named: it is the route through a recorded delegation, and if
    // both apply the honest label is the stronger one.
    const owned = wanted.has(category.toLowerCase());
    const named = mentions !== null && mentions.test(text);
    if (!owned && !named) {
      continue;
    }

    out.push({
      text,
      category,
      status: String(todo.status),
      priority: Number(todo.priority ?? 0),
      found: owned ? "owner" : "named"
    });
  }

  // Owner-route work first, then by Jot's own priority convention, which is
  // lowest-number-first and where negative numbers mean urgent.
  out.sort((a, b) => {
    if (a.found !== b.found) {
      return a.found === "owner" ? -1 : 1;
    }
    return a.priority - b.priority;
  });

  return out.slice(0, limit);
}
