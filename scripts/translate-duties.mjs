#!/usr/bin/env node
/**
 * Put the text that is already in `seed.js` onto duty rows that never got it.
 *
 * ## The fault this exists for
 *
 * `seedRoleMap` creates a row once and never touches an existing one - which is
 * the right behaviour, because a duty is his to edit and a seeding pass that
 * rewrote his wording would be the tool overruling him. The consequence is that
 * translating `seed.js` changed nothing on any store that had already been
 * seeded: every live duty went on holding the English original, with the Swedish
 * sitting in the repository three files away.
 *
 * Found on 2026-09-08 with seven English duty names and ten English
 * descriptions in real data, months after the translation was called finished.
 * A card had described it as three short names to type.
 *
 * Nothing here is new writing. Every string comes from `SEED_DUTIES`, keyed by
 * id, so this only closes the gap between the repository and a store.
 *
 * ## What it refuses to do
 *
 * **It never overwrites a name unless asked.** Names are short, so no heuristic
 * can tell "Project check-in" from a name he chose - and the seed's longer
 * versions would silently undo a rename. `--names` opts in, and `--keep` names
 * the ids whose name is his own.
 *
 * **It only replaces prose that holds no Swedish.** A `means` or `source`
 * containing å, ä or ö is his and is left alone, however much it differs from
 * the seed. Long prose is where that test is reliable.
 *
 * **It writes nothing twice.** A field already equal to the seed is skipped, so
 * a second run reports no changes.
 *
 *   node scripts/translate-duties.mjs                     # dry run, prose only
 *   node scripts/translate-duties.mjs --names             # dry run, names too
 *   node scripts/translate-duties.mjs --names --keep=a,b  # ...but not those
 *   node scripts/translate-duties.mjs --write             # apply
 *
 * `TEND_DATA_DIR` decides which store. Without it this would open the default
 * `userData` directory, which on a session running inside an app container is
 * not even the one the app reads - so it is required rather than defaulted.
 */

import { openStore } from "../src/storage/store.js";
import { SEED_DUTIES } from "../src/service/seed.js";
import * as api from "../src/service/api.js";

const args = process.argv.slice(2);
const write = args.includes("--write");
const doNames = args.includes("--names");
const keep = new Set(
  (args.find((a) => a.startsWith("--keep=")) ?? "")
    .replace("--keep=", "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "")
);

const dataDir = process.env.TEND_DATA_DIR;
if (!dataDir) {
  console.error(
    "TEND_DATA_DIR is not set. Point it at the store to translate - the default\n" +
      "userData directory is not necessarily the one the app reads."
  );
  process.exit(1);
}

/**
 * Does this hold Swedish? Then it is his and not the untranslated original.
 *
 * @param {unknown} value
 */
const swedish = (value) => /[åäöÅÄÖ]/.test(String(value ?? ""));

const store = openStore({ dataDir, role: "job", host: "translate-duties" });
const seed = new Map(SEED_DUTIES.map((d) => [String(d.id), d]));

let changed = 0;
let held = 0;

for (const row of store.rows("duties").filter((d) => !d._deleted)) {
  const id = String(row.id);
  const s = seed.get(id);
  if (!s) {
    console.log(`SKIP  ${id.slice(0, 22)}  no seed source, nothing to copy from`);
    continue;
  }

  /** @type {Record<string, string>} */
  const fields = {};

  if (row.name !== s.name) {
    if (!doNames) {
      console.log(`NAME? ${id.slice(0, 22)}  "${row.name}" differs - pass --names to change it`);
    } else if (keep.has(id)) {
      console.log(`KEEP  ${id.slice(0, 22)}  name "${row.name}" is yours`);
      held += 1;
    } else {
      fields.name = s.name;
      console.log(`NAME  ${id.slice(0, 22)}\n      "${row.name}"\n   -> "${s.name}"`);
    }
  }

  for (const field of /** @type {("means" | "source")[]} */ (["means", "source"])) {
    if (row[field] === s[field]) {
      continue;
    }
    if (swedish(row[field])) {
      console.log(`KEEP  ${id.slice(0, 22)}  ${field} is already Swedish and differs - yours`);
      held += 1;
      continue;
    }
    fields[field] = s[field];
    console.log(
      `${field.toUpperCase().padEnd(5)} ${id.slice(0, 22)}\n` +
        `      "${String(row[field]).slice(0, 68)}..."\n` +
        `   -> "${String(s[field]).slice(0, 68)}..."`
    );
  }

  if (Object.keys(fields).length === 0) {
    continue;
  }
  changed += 1;
  if (!write) {
    continue;
  }
  const out = api.updateDuty(store, id, fields);
  if (out.error) {
    console.error(`FAILED ${id}: ${out.error}`);
    process.exit(1);
  }
}

console.log(
  `\n${changed} ${changed === 1 ? "duty" : "duties"} ${write ? "changed" : "would change"}, ` +
    `${held} ${held === 1 ? "field" : "fields"} left as yours.`
);
if (!write) {
  console.log("Dry run. Pass --write to apply.");
}
