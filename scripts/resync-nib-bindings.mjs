/*
 * Point the Nib bindings at where the folders actually are.
 *
 * Indexing follows a moved folder by itself now - `folderFor` resolves a binding
 * by its own sub id, wherever the folder has been dragged to, and corrects the
 * stored path as it goes. So the re-pointing here is a belt to that braces: it
 * will normally report nothing, and it stays because a one-line check is worth
 * having when the alternative failed in silence.
 *
 * What this is still for is the other half: binding a person who has a folder in
 * Nib and no binding here. It reads Nib and writes only to Tend.
 *
 * Run with `node scripts/resync-nib-bindings.mjs [--write]`.
 */
import { openStore } from '../src/storage/store.js'
import { resolveDataDir } from '../src/domain/paths.js'
import * as api from '../src/service/api.js'
import { listNibFolders } from '../src/service/nib.js'

/*
 * What a folder about a person counts as.
 *
 * The same six rules the existing bindings carry, so a new person is not quietly
 * on a different footing from the rest. `casual` is in the list and no duty
 * consumes it: it records that you spoke without resetting the 1-1 clock.
 */
const RULES = [
  { tagId: 'tag-one-to-one', kind: 'one-to-one' },
  { tagId: 'tag-second-hand', kind: 'second-hand' },
  { tagId: 'tag-sideways', kind: 'sideways' },
  { tagId: 'tag-feedback', kind: 'feedback' },
  { tagId: 'tag-observation', kind: 'observation' },
  { tagId: 'tag-casual', kind: 'casual' }
]

const apply = process.argv.includes('--write')
const store = openStore({ dataDir: resolveDataDir().dir, role: 'job' })

const folders = listNibFolders()
if (!folders.available) {
  console.error(folders.why)
  process.exit(1)
}

/*
 * Every sub-folder in Nib, with the leaf name split back out of the label.
 *
 * `listNibFolders` returns a flat list with labels like "Org / Alve" - it is what
 * the bind dialog shows, so it is what this reads too rather than opening Nib's
 * index a second time with different assumptions.
 */
const nibFolders = folders.folders
  .filter((folder) => folder.subId !== null && folder.subId !== undefined)
  .map((folder) => ({
    categoryId: folder.categoryId,
    subId: folder.subId,
    label: folder.label,
    // `?? label` rather than a bare `pop()`: a label with no separator would
    // otherwise type as possibly-undefined and read as one at every use.
    name: String(folder.label).split(' / ').pop() ?? String(folder.label)
  }))

const people = store.rows('people')
const bindings = api.sources(store)
if (!Array.isArray(bindings)) {
  console.error(bindings.error)
  process.exit(1)
}

let moved = 0
let bound = 0

// A binding whose sub still exists somewhere else in Nib has been dragged.
for (const binding of bindings) {
  if (binding.subId === null || binding.subId === undefined) {
    continue
  }
  const folder = nibFolders.find((candidate) => candidate.subId === binding.subId)
  if (folder === undefined || folder.categoryId === binding.categoryId) {
    continue
  }
  console.log(`moved: ${binding.person} - ${binding.nibFolder} is now ${folder.label}`)
  moved++
  if (apply) {
    store.update('sources', binding.id, { categoryId: folder.categoryId, label: folder.label })
  }
}

// A folder named after somebody Tend knows, with nothing bound to it.
for (const folder of nibFolders) {
  if (bindings.some((binding) => binding.subId === folder.subId)) {
    continue
  }
  const person = people.find(
    (candidate) => String(candidate.name).toLowerCase() === folder.name.toLowerCase()
  )
  if (person === undefined) {
    continue
  }
  console.log(`unbound: ${folder.label} matches ${person.name} - binding it`)
  bound++
  if (apply) {
    const result = api.bindSource(store, {
      person: String(person.id),
      categoryId: String(folder.categoryId),
      subId: folder.subId === null ? undefined : String(folder.subId),
      label: String(folder.label)
    })
    if (result?.error) {
      console.error(`  failed: ${result.error}`)
      process.exit(1)
    }
    const rules = api.setSourceRules(store, { id: String(result.id), rules: RULES })
    if (rules?.error) {
      console.error(`  rules failed: ${rules.error}`)
      process.exit(1)
    }
  }
}

/*
 * Folders that look like a person but match nobody are reported, never guessed
 * at. Adding a person on the strength of a folder name would invent a colleague
 * out of a typo.
 */
for (const folder of nibFolders) {
  const known = people.some(
    (candidate) => String(candidate.name).toLowerCase() === folder.name.toLowerCase()
  )
  const isBound = bindings.some((binding) => binding.subId === folder.subId)
  if (!known && !isBound) {
    console.log(`unmatched: ${folder.label} - no person in Tend by that name`)
  }
}

if (!apply) {
  console.log(`\n${moved} to re-point, ${bound} to bind. Pass --write to do it.`)
  process.exit(0)
}

const after = api.sources(store)
if (!Array.isArray(after)) {
  console.error(`Could not read the bindings back: ${after.error}`)
  process.exit(1)
}
console.log(`\n${moved} re-pointed, ${bound} bound; ${after.length} binding(s) in total:`)
for (const binding of after) {
  console.log(`  ${String(binding.person).padEnd(10)} ${binding.nibFolder}`)
}
