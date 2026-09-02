/**
 * The service surface: every operation Tend can perform, in one import.
 *
 * This layer exists so that no capability is implemented twice. The MCP server
 * calls these and serialises the result; the Electron app calls the same
 * functions and renders it. If the app can do something an agent can ask for it,
 * and the two can never disagree about what the data says.
 *
 * Everything returns plain objects. Nothing here formats for a screen and
 * nothing here knows about MCP.
 *
 * ## Why this file is only re-exports
 *
 * It held all of it, and by fifteen sections and 3687 lines that had stopped
 * being one file and started being fifteen filed together. Each section now has
 * its own module named after its subject, and this re-exports them.
 *
 * The re-export is the point rather than a leftover. `main/index.js` and
 * `mcp/tools.js` both import this surface whole, so a section moving must not
 * become a rename landing in three files for no gain - and a reader who wants
 * to know what the app can do reads one list instead of finding fifteen.
 *
 * The split was measured before it was cut. Counting the calls between sections
 * found eleven edges across all fifteen, so the pieces genuinely came apart;
 * where two sections shared something, the shared thing moved to where it
 * belonged - the archive-id helper into the domain, the two write guards into
 * guards.js, the focus reader down beside its own edits.
 */

import { PREP_CARDS, prep } from "./prep.js";
import { decideDecision, decisions, logDecision, revisitsDue, stillHolds } from "./ledger.js";
import { resolvePerson, resolveProject, resolveStake, resolveWorkstream } from "./resolve.js";

export { PREP_CARDS, prep };
export { decideDecision, decisions, logDecision, revisitsDue, stillHolds };
export { resolvePerson, resolveProject, resolveStake, resolveWorkstream };

/** Collections an agent may add rows to. Structure is not on this list. */
export const AGENT_WRITABLE = /** @type {const} */ (["promises", "touches", "evidence"]);

/* ------------------------------------------------------- reading -- */

/* Moved to reading.js and re-exported, so the service surface is unchanged. */
export {
  archivedPeople,
  archivedProjects,
  attention,
  myAttentionSignals,
  people,
  person,
  project,
  projects,
  promises,
  roleMap
} from "./reading.js";

/* ------------------------------------------------------- writing -- */

/* Moved to writing.js and re-exported, so the service surface is unchanged. */
export {
  addPerson,
  addProject,
  archivePerson,
  archiveProject,
  logEvidence,
  logPromise,
  logTouch,
  resolvePromise,
  setRelation,
  unarchivePerson,
  unarchiveProject,
  updatePerson
} from "./writing.js";

/* ------------------------------------------------------- signals -- */

/* Moved to signals.js and re-exported, so the service surface is unchanged. */
export {
  answerSignal,
  signals
} from "./signals.js";

/* --------------------------------------------------- workstreams -- */

/* Moved to workstreams.js and re-exported, so the service surface is unchanged. */
export {
  addWorkstream,
  archiveEverythingActive,
  archiveWorkstream,
  archivedWorkstreams,
  setDelegationLevel,
  unarchiveWorkstream,
  undoBulkArchive,
  undoableBulkArchive,
  workstreams
} from "./workstreams.js";

/* ----------------------------------------------------------- nib links -- */

/*
 * Moved to niblinks.js and re-exported here.
 *
 * api.js is the service surface: main/index.js and mcp/tools.js both import it
 * whole. Re-exporting means a section can move without every caller learning
 * where it went - the alternative is a rename landing in three files for no
 * gain.
 */
export {
  assignCommitment,
  bindSource,
  dropCommitment,
  observations,
  pendingCommitments,
  setSourceRules,
  sources,
  unbindSource
} from "./niblinks.js";

/* --------------------------------------------------------------- duties -- */

/* Moved to duties.js and re-exported, so the service surface is unchanged. */
export { decideDuty, proposeDuty, removeRow, updateDuty } from "./duties.js";

/* ----------------------------------------------------------- focus edits -- */

/* Moved to focus.js and re-exported, so the service surface is unchanged. */
export { endFocus, focus, setFocus } from "./focus.js";

/* -------------------------------------------------------- topics -- */

/* Moved to topics.js and re-exported, so the service surface is unchanged. */
export {
  allTopics,
  decideTopic,
  markRaised,
  proposeTopic,
  topics
} from "./topics.js";

/* -------------------------------------------------- stakeholders -- */

/* Moved to stakes.js and re-exported, so the service surface is unchanged. */
export {
  addStake,
  stakeholders,
  updateStake
} from "./stakes.js";

/* --------------------------------------------------------- skips -- */

/* Moved to skips.js and re-exported, so the service surface is unchanged. */
export {
  logSkip,
  skips
} from "./skips.js";

/* ---------------------------------------------------- vocabulary -- */

/* Moved to vocabulary.js and re-exported, so the service surface is unchanged. */
export {
  vocabulary
} from "./vocabulary.js";

/* ------------------------------------------------------- journal -- */

/*
 * Moved to journal.js and re-exported, so the service surface is unchanged.
 * Also imported, because the reflection section below reads the journal - a
 * re-export alone would leave that call referring to nothing.
 */

export {
  journal,
  logEntry,
  logMoment,
  moments,
  momentsFor
} from "./journal.js";

/* ---------------------------------------------------- reflection -- */

/* Moved to reflection.js and re-exported, so the service surface is unchanged. */
export {
  journalMaterial,
  keepReview,
  lastReflectedAt,
  lastReviewRun,
  logReflection,
  noteReviewRun,
  reflections,
  reviews
} from "./reflection.js";

/* -------------------------------------------------------- growth -- */

/* Moved to growth.js and re-exported, so the service surface is unchanged. */
export {
  endThread,
  growth,
  growthQuestions,
  logGrowthNote,
  openThread,
  thread,
  updateThread
} from "./growth.js";

/* ------------------------------------------------------- waiting -- */

/* Moved to waiting.js and re-exported, so the service surface is unchanged. */
export {
  chase,
  stopWaiting,
  waitFor,
  waits,
  waitsOnNow
} from "./waiting.js";
