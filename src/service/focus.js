/**
 * The focus: what he has said his attention is on, and what it costs.
 *
 * The only place in the app where an INTENTION about where attention would go
 * is written down, which is what makes it the only thing "where it actually
 * went" can be measured against. Everything else here is a record of what
 * happened; this is a statement about what was supposed to.
 *
 * Read and edits together. The reader was declared in api.js's reading section
 * and used by nothing there - only by these edits and by the reflection pass -
 * so it belongs beside them rather than in the section it was filed under.
 */

import { buildAttention, expandCadences, meanDrift } from "../domain/attention.js";
import { DEFAULT_STRETCH, focusStatus } from "../domain/focus.js";

/**
 * @param {import("../storage/store.js").TendStore} store
 * @param {number} now
 */
export function focus(store, now) {
  const f = store.focus();
  const status = focusStatus(f, now);
  if (!status.active) {
    return { active: false, summary: status.summary };
  }
  const a = buildAttention(store.state(), now);
  return {
    active: true,
    name: f?.name,
    summary: status.summary,
    overrun: status.overrun,
    budgetOfWeek: f?.budget ?? null,
    stretchInForce: status.stretch,
    heldBackRightNow: a.muted,
    cost: a.focus.cost.summary
  };
}

/**
 * Start a focus, or replace the one running.
 *
 * The baseline drift is captured here and nowhere else. Without it the focus
 * can never say what it cost, and "what did this cost me" is the honest half of
 * the feature - the half that stops a focus from quietly becoming the job.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {object} args
 * @param {string} args.name
 * @param {number} [args.endsAt] Milliseconds since epoch.
 * @param {number} [args.budget] Share of the week, 0 to 1.
 * @param {number} [args.stretch]
 * @param {string[]} [args.guarded] Duty ids this focus may never dampen.
 * @param {number} args.now
 */
export function setFocus(store, { name, endsAt, budget, stretch, guarded, now }) {
  if (!String(name ?? "").trim()) {
    return { error: "Ett fokus behöver ett namn - vad är det du faktiskt försöker få gjort?" };
  }
  if (typeof endsAt === "number" && endsAt <= now) {
    return { error: "Slutdatumet har passerat. Ett fokus utan ett slutdatum framåt kan aldrig gå tillbaka." };
  }
  if (budget !== undefined && (!(budget > 0) || budget > 1)) {
    return { error: "Budgeten är en andel av veckan mellan 0 och 1." };
  }

  const baselineDrift = meanDrift(expandCadences(store.state(), now));

  store.emit("focus.set", {
    id: randomId(),
    name: String(name).trim(),
    startedAt: now,
    endsAt: endsAt ?? null,
    budget: budget ?? null,
    stretch: stretch ?? DEFAULT_STRETCH,
    guarded: guarded ?? [],
    baselineDrift
  });

  return { name, baselineDrift: Number(baselineDrift.toFixed(2)) };
}

/**
 * @param {import("../storage/store.js").TendStore} store
 */
export function endFocus(store) {
  if (!store.focus()) {
    return { error: "Inget fokus körs." };
  }
  const was = String(store.focus()?.name ?? "");
  store.emit("focus.end", {});
  return { ended: was, note: "Varje uttänjd tröskel är tillbaka till det normala." };
}

/** Ids that read as ids rather than as anything meaningful. */
function randomId() {
  return `f-${Math.floor(Date.now() % 1_000_000_000).toString(36)}`;
}
