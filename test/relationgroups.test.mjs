/**
 * The four clusters cover every relationship type, exactly once.
 *
 * This test is the whole reason the clusters are a declaration rather than a
 * loop in the renderer. people.js records what the alternative cost: the
 * hand-written group list "was the fourth copy of the same thing and it hid
 * people" - it had no row for one relationship type, so everybody with that
 * type was in the store and off the page, with no error and no empty group and
 * no trace.
 *
 * A cluster list can fail the same way and more quietly, because the page it
 * feeds is the one opened every morning.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { RELATIONS, RELATION_GROUPS, groupOf } from "../src/domain/cadence.js";

test("every relationship type is in exactly one cluster", async (t) => {
  const types = Object.keys(RELATIONS);

  await t.test("this check found the types at all", () => {
    /*
     * A vacuous pass here is permanent and silent: an empty list satisfies
     * "each appears once" forever. Six types exist, so anything under six means
     * the import is broken rather than the declaration clean.
     */
    assert.ok(types.length >= 6, `only found ${types.length} relationship types`);
    assert.ok(
      Object.keys(RELATION_GROUPS).length >= 4,
      `only found ${Object.keys(RELATION_GROUPS).length} clusters`
    );
  });

  await t.test("none is missing from the clusters", () => {
    /*
     * The failure this exists for. A type added to RELATIONS and not to a
     * cluster puts everybody holding it off the front page.
     */
    const placed = Object.values(RELATION_GROUPS).flatMap((g) => g.relations);
    const missing = types.filter((r) => !placed.includes(/** @type {any} */ (r)));
    assert.deepEqual(missing, [], `types in no cluster: ${missing.join(", ")}`);
  });

  await t.test("and none is in two, which would render them twice", () => {
    const placed = Object.values(RELATION_GROUPS).flatMap((g) => g.relations);
    const twice = placed.filter((r, i) => placed.indexOf(r) !== i);
    assert.deepEqual(twice, [], `types in more than one cluster: ${twice.join(", ")}`);
  });

  await t.test("no cluster names a type that does not exist", () => {
    /* The mirror of the first: a renamed type leaves a cluster pointing at
       nothing, which is an empty group where four people used to be. */
    const placed = Object.values(RELATION_GROUPS).flatMap((g) => g.relations);
    const unknown = placed.filter((r) => !Object.prototype.hasOwnProperty.call(RELATIONS, r));
    assert.deepEqual(unknown, [], `clusters naming unknown types: ${unknown.join(", ")}`);
  });

  await t.test("groupOf answers for every type, and refuses anything else", () => {
    for (const r of types) {
      assert.ok(groupOf(r) !== null, `${r} has no cluster`);
    }
    assert.equal(groupOf("not-a-relation"), null);
    assert.equal(groupOf(""), null);
  });

  await t.test("the mandate cluster is first, because the layout reads order", () => {
    /*
     * The page gives the first cluster a grid and the rest a strip, so this is
     * not a cosmetic assertion: reordering the declaration silently demotes the
     * people the page exists to show.
     */
    assert.equal(Object.keys(RELATION_GROUPS)[0], "mandate");
    assert.deepEqual(RELATION_GROUPS.mandate.relations, ["lead-and-manage", "manage-remotely"]);
  });

  await t.test("the blind spot is in the mandate cluster and not in the strip", () => {
    /*
     * `manage-remotely` is the mandate without the observation - RELATIONS
     * calls it "The blind spot" - so it belongs where the eye goes. Asserted
     * because it is the one placement somebody would reasonably "tidy" into the
     * outward strip, on the grounds that you do not see those people.
     */
    assert.equal(groupOf("manage-remotely"), "mandate");
  });
});
