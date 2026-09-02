/**
 * Which words this half of the app uses, asked rather than branched on.
 *
 * The private half draws the same pages with a different vocabulary, and the
 * first version of it hard-coded the work half's list into the renderer. The
 * symptom was exact: "Add someone" offered six management relationships for
 * somebody's family. Every list that differs between halves is asked for here.
 *
 * Split out of api.js: measured as needing nothing from any other section.
 */

import {
  defaultRelationIn,
  homeViewIn,
  personBlocksIn,
  relationOptionsIn,
  viewsIn
} from "../domain/halves.js";

/**
 * What this half consists of.
 *
 * One call, answered from `domain/halves.js`, and the reason it exists is a
 * failure this project has had four times: a list of options written out again
 * in the renderer, which then quietly disagreed with the service. A
 * relationship type that existed and was unpickable; a roster group missing so
 * everybody with one relationship vanished from the page. The private half added
 * a fifth copy - a hand-written array of which views belong here - and this
 * removes it.
 *
 * So the window asks what the half is rather than knowing. Adding a view or a
 * relationship type is then one edit in one file.
 *
 * @param {import("../storage/store.js").TendStore} store
 */
export function vocabulary(store) {
  const half = store.half;
  return {
    half,
    views: viewsIn(half),
    home: homeViewIn(half),
    relations: relationOptionsIn(half),
    defaultRelation: defaultRelationIn(half),
    personBlocks: personBlocksIn(half)
  };
}
