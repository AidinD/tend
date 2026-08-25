/*
 * Give every Nib binding a rule for the Casual tag.
 *
 * Tend has had the `casual` kind since the contact kinds were written - "you
 * spoke, but it was not a 1-1" - and deliberately no duty consumes it, so it
 * records that contact happened without letting a week of corridor talk hide a
 * quarter with no real conversation in it. What was missing was the other half:
 * nothing mapped Nib's Casual TAG onto that kind, so a note tagged Casual counted
 * as nothing at all.
 *
 * Written through Tend's own service rather than by editing data. The store is an
 * append-only event log, so this is safe with the app running - but going through
 * `setSourceRules` also means the same validation the UI gets, including the
 * one-kind-per-tag rule.
 *
 * Run with `node scripts/add-casual-rule.mjs [--write]`.
 */
import { TendStore } from '../src/storage/store.js'
import { resolveDataDir } from '../src/domain/paths.js'
import * as api from '../src/service/api.js'

const TAG = 'tag-casual'
const KIND = 'casual'

const apply = process.argv.includes('--write')
const { dir, source } = resolveDataDir()
console.log(`data dir: ${dir} (${source})`)

// `job` is the writer role for exactly this: a background task with its own
// event file, so it can never interleave with the app's or the MCP server's.
const store = new TendStore({ dataDir: dir, role: 'job' })

const bindings = api.sources(store)
if (!Array.isArray(bindings)) {
  console.error(bindings)
  process.exit(1)
}

let changed = 0
for (const binding of bindings) {
  const rules = binding.rules ?? []
  const existing = rules.find((rule) => rule.tagId === TAG)
  // A binding whose person has been deleted still has rules, and naming it by
  // its folder is more use here than a blank column anyway.
  const who = (binding.person ?? binding.nibFolder ?? binding.id).padEnd(10)
  if (existing !== undefined) {
    console.log(`  ${who} already maps Casual to "${existing.kind}"`)
    continue
  }
  console.log(`  ${who} ${binding.nibFolder} -> add ${TAG} = ${KIND}`)
  if (apply) {
    const result = api.setSourceRules(store, {
      id: binding.id,
      rules: [...rules, { tagId: TAG, kind: KIND }]
    })
    if (result?.error) {
      console.error(`    failed: ${result.error}`)
      process.exit(1)
    }
  }
  changed++
}

if (!apply) {
  console.log(`\n${changed} binding(s) would change. Pass --write to do it.`)
  process.exit(0)
}

// Read back through the service, so a silent failure cannot pass for success.
// `sources` answers with an error object rather than throwing, so the shape has
// to be checked before anything is counted: counting the keys of an error object
// is how a failed verification reports a clean run.
const after = api.sources(store)
if (!Array.isArray(after)) {
  console.error(`Could not read the bindings back: ${after.error}`)
  process.exit(1)
}
const withCasual = after.filter((binding) =>
  (binding.rules ?? []).some((rule) => rule.tagId === TAG && rule.kind === KIND)
)
console.log(`\n${changed} binding(s) updated; ${withCasual.length}/${after.length} now map Casual.`)
