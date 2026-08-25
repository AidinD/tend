/**
 * What needs you now.
 *
 * This is where the pieces meet, and where the two rules that make the tool
 * usable are enforced:
 *
 *   Only deviations are shown. When everything is in step this comes back
 *   nearly empty, and that is the design rather than a gap.
 *
 *   Nothing critical is ever held back. A focus can hold back a soft nudge and
 *   nothing else.
 *
 * Cadences are not stored. They are produced by crossing duties with subjects,
 * which is what makes the role map survive a reorg: change a person's
 * relationship type and every cadence that applies to them follows, with no
 * migration and no lost history.
 */

import { compareDrift, computeDrift, latestEvidence, SEVERITY_ORDER } from "./cadence.js";
import { focusCost, focusStatus, stretchFor } from "./focus.js";
import { openPromises } from "./promises.js";
import { signalsDue } from "./signals.js";
import { driftBadge, humanDays } from "./time.js";
import { appliesWhileLeaving, hasLeft, inScope, isLeaving, notBefore } from "./people.js";
import { namedStakes, stakeInterval } from "./stakes.js";
import { isUnspecified, reviewInterval } from "./workstreams.js";

/**
 * @typedef {object} AttentionItem
 * @property {string} key Stable identity, so the UI can dismiss or snooze one.
 * @property {"cadence" | "promise" | "signal"} kind
 * @property {string} title
 * @property {string} why
 * @property {import("./cadence.js").Severity} severity How it reads right now.
 * @property {import("./cadence.js").Severity} trueSeverity Ignoring any focus.
 * @property {string} badge
 * @property {boolean} guarded
 * @property {string} source Where the item came from, shown to the user.
 * @property {string | null} subject Subject id, when there is one.
 * @property {string | null} [subjectKind] What sort of thing the subject is.
 *   Carried because the actions a card can offer depend on it: the kinds of
 *   contact that could satisfy a project cadence are not the ones that could
 *   satisfy a person's, and a card that offers all of them lets you record
 *   something that satisfies nothing.
 */

/**
 * Duties that apply to a given subject.
 *
 * @param {import("../storage/reduce.js").Entity[]} duties
 * @param {string} subjectKind
 * @param {string | undefined} relation
 * @returns {import("../storage/reduce.js").Entity[]}
 */
function dutiesFor(duties, subjectKind, relation) {
  return duties.filter((d) => {
    if ((d.status ?? "active") !== "active") {
      return false;
    }
    if (d.subjectKind !== subjectKind) {
      return false;
    }
    if (!Array.isArray(d.relations) || d.relations.length === 0) {
      return true;
    }
    return relation !== undefined && d.relations.includes(relation);
  });
}

/**
 * Cross every active duty with every subject it applies to, and compute drift.
 *
 * @param {import("../storage/reduce.js").TendState} state
 * @param {number} now
 * @returns {{ duty: any, subject: any, subjectKind: string, drift: import("./cadence.js").Drift }[]}
 */
export function expandCadences(state, now) {
  /** @param {string} name */
  const live = (name) =>
    Object.values(state.c[name] ?? {}).filter((r) => !r._deleted);

  const duties = live("duties");
  const touches = live("touches");
  const focus = state.focus;

  /** @type {{ duty: any, subject: any, subjectKind: string, drift: import("./cadence.js").Drift }[]} */
  const out = [];

  /** @param {any[]} subjects @param {string} kind */
  const cross = (subjects, kind) => {
    for (const subject of subjects) {
      // Somebody with a last day still owes everything by default. Which duties
      // stop is his choice per duty, because the answer differs: a 1-1 during a
      // notice period is when the handover gets arranged, a feedback round is an
      // instrument for developing somebody who is on their way out.
      const leaving = kind === "person" && isLeaving(subject);
      for (const duty of dutiesFor(duties, kind, subject.relation)) {
        if (leaving && !appliesWhileLeaving(duty)) {
          continue;
        }
        // A workstream's review interval comes from its delegation level rather
        // than from the duty: how often you look is the whole meaning of the
        // level, and a level with no review interval is the abdication Grove
        // warns about wearing a label.
        // A workstream's interval comes from its delegation level, and a
        // stake's from the stake itself: in both cases how often you look IS
        // the substance of the arrangement, so it belongs on the thing rather
        // than on a duty shared by every one of them.
        const interval =
          kind === "workstream"
            ? reviewInterval(subject.level)
            : kind === "stake"
              ? stakeInterval(subject, Number(duty.cadenceDays))
              : Number(duty.cadenceDays);
        if (!(interval > 0)) {
          continue;
        }
        const kinds = Array.isArray(duty.evidenceKinds) ? duty.evidenceKinds : [];

        // Nothing older than a return counts. A person back from six months of
        // leave has not been neglected for six months, and measuring from the
        // conversation before they left would report them as critical on their
        // first morning back - a red item that is not true and cannot be
        // cleared by anything except talking to somebody who was not there.
        const floor = kind === "person" ? notBefore(subject, now) : 0;
        const last = latestEvidence(touches, subject.id, kinds);

        out.push({
          duty,
          subject,
          subjectKind: kind,
          drift: computeDrift({
            intervalDays: interval,
            lastAt: last !== null && last >= floor ? last : floor > 0 ? floor : last,
            // `since` can be set explicitly - somebody may have existed for
            // years before becoming your report - and otherwise falls back to
            // when the row was created.
            since:
              typeof subject.since === "number"
                ? subject.since
                : typeof subject._at === "number"
                  ? subject._at
                  : now,
            now,
            stretch: stretchFor(focus, now, { id: duty.id, guarded: Boolean(duty.guarded) })
          })
        });
      }
    }
  };

  // Somebody away or already gone is skipped entirely rather than shown as
  // behind. See src/domain/people.js for why that is not the same as removing
  // them: the history is the valuable part, and a flag somebody has to remember
  // to unset is a flag that stays set.
  cross(
    live("people").filter((p) => inScope(p, now)),
    "person"
  );
  cross(live("projects"), "project");
  cross(live("workstreams"), "workstream");
  // Named here rather than stored on the row, so renaming a person or a project
  // cannot leave a card showing a spelling nobody uses any more.
  cross(namedStakes(live("stakes"), live("people"), live("projects")), "stake");

  return out.sort((a, b) => compareDrift(a.drift, b.drift));
}

/**
 * Mean drift across everything a focus is allowed to dampen. This is the number
 * the focus cost is measured in, so it deliberately excludes guarded duties -
 * those were never going to move, and including them would flatter the focus.
 *
 * @param {ReturnType<typeof expandCadences>} cadences
 * @returns {number}
 */
export function meanDrift(cadences) {
  const relevant = cadences.filter((c) => !c.duty.guarded);
  if (relevant.length === 0) {
    return 0;
  }
  const total = relevant.reduce((sum, c) => sum + Math.max(0, c.drift.driftDays), 0);
  return total / relevant.length;
}

/**
 * @param {any} subject
 * @returns {string}
 */
function subjectName(subject) {
  return String(subject.name ?? subject.title ?? subject.id ?? "unknown");
}

/**
 * Build the Now view.
 *
 * @param {import("../storage/reduce.js").TendState} state
 * @param {number} now
 * @returns {{
 *   needs: AttentionItem[],
 *   nudges: AttentionItem[],
 *   muted: number,
 *   quiet: boolean,
 *   focus: import("./focus.js").FocusStatus & { cost: ReturnType<typeof focusCost> }
 * }}
 */
export function buildAttention(state, now) {
  const cadences = expandCadences(state, now);
  const status = focusStatus(state.focus, now);
  const cost = focusCost(state.focus, meanDrift(cadences));

  /** @param {string} name */
  const live = (name) => Object.values(state.c[name] ?? {}).filter((r) => !r._deleted);
  const people = live("people");

  /** @type {AttentionItem[]} */
  const items = [];

  for (const { duty, subject, subjectKind, drift } of cadences) {
    // Existence is decided by the truth, not by the focus. An item the focus
    // softened all the way to "ok" still exists - it gets counted as held back
    // rather than vanishing.
    if (drift.trueSeverity === "ok") {
      continue;
    }
    const name = subjectName(subject);
    const never = !drift.everHappened;
    items.push({
      key: `cadence:${duty.id}:${subject.id}`,
      kind: "cadence",
      trueSeverity: drift.trueSeverity,
      title: never
        ? `${duty.name} has never happened for ${name}`
        : `${name}: ${humanDays(drift.daysSince)} since ${String(duty.name).toLowerCase()}`,
      why: never
        ? `Target is every ${drift.interval} days and there is no record of it yet.`
        : `Target is every ${drift.interval} days.${drift.stretched ? " Threshold is currently stretched by the active focus." : ""}`,
      severity: drift.severity,
      badge: driftBadge(drift.driftDays),
      guarded: Boolean(duty.guarded),
      source: `Role map: ${duty.name}`,
      subject: subject.id,
      subjectKind
    });
  }

  for (const p of openPromises(live("promises"), now)) {
    if (p.status.severity === "ok") {
      continue;
    }
    const person = people.find((x) => x.id === p.person);
    // Somebody who has left cannot be given the answer, so it stops being
    // something you can act on today. Deliberately still true until their last
    // day passes: a promise to a person leaving next week is exactly the
    // promise to keep. The row itself is never touched.
    if (person && hasLeft(person, now)) {
      continue;
    }
    const who = person ? subjectName(person) : "someone";
    items.push({
      key: `promise:${p.id}`,
      kind: "promise",
      trueSeverity: p.status.severity,
      title: `You owe ${who} an answer`,
      why: `${p.text ?? "A promise you made"}. ${p.status.why}`,
      severity: p.status.severity,
      badge: driftBadge(p.status.ageDays),
      guarded: p.status.guarded,
      source: "Promise, logged from a note",
      subject: p.person ?? null
    });
  }

  // The one thing that cannot be derived: questions only he can answer.
  for (const s of signalsDue(live("signals"), live("signalAnswers"), now)) {
    if (s.severity === "ok") {
      continue;
    }
    items.push({
      key: `signal:${s.id}`,
      kind: "signal",
      trueSeverity: s.severity,
      title: s.text,
      why:
        s.lastAnswer === "yes"
          ? `You answered yes ${humanDays(s.daysSince)} ago. Worth another look sooner than the rest.`
          : `${s.why}${s.everAnswered ? ` Last asked ${humanDays(s.daysSince)} ago.` : " Never asked."}`,
      severity: s.severity,
      badge: s.everAnswered ? driftBadge(s.daysSince) : "new",
      guarded: false,
      source: "Monthly check. The answer is usually no",
      subject: null
    });
  }

  // A piece of work whose delegation level was never stated is the middle
  // ground Grove names: the responsibility has moved and the information has
  // not. Flag it as its own thing rather than letting it look like tidy-up.
  for (const w of live("workstreams")) {
    if (!isUnspecified(w)) {
      continue;
    }
    const owner = w.owner ? people.find((p) => p.id === w.owner) : null;
    items.push({
      key: `unspecified:${w.id}`,
      kind: "cadence",
      trueSeverity: "warn",
      title: `No delegation level set on ${subjectName(w)}`,
      why: owner
        ? `${subjectName(owner)} is on this and you have not said how far you have stepped back. That gap is where the responsibility has moved and the information has not.`
        : "Nobody is named on this and no level is set, so nothing about it is decided.",
      severity: "warn",
      badge: "unset",
      guarded: false,
      source: "Role map: delegation level",
      subject: w.owner ?? null
    });
  }

  const rank = (/** @type {AttentionItem} */ i) => SEVERITY_ORDER.indexOf(i.severity);
  items.sort((a, b) => rank(b) - rank(a));

  /** @type {AttentionItem[]} */
  const needs = [];
  /** @type {AttentionItem[]} */
  const nudges = [];
  let muted = 0;

  const dampening = status.active && !status.overrun;

  for (const item of items) {
    // Critical always surfaces. A guarded item surfaces from warn upward, since
    // guarding it means a focus must not be able to bury it.
    if (item.severity === "critical" || (item.guarded && item.severity === "warn")) {
      needs.push(item);
      continue;
    }

    // The contract's hard edge: something that is genuinely critical may be
    // softened in how it reads, but it is never held back. Without this, a
    // long enough stretch would silently swallow the worst item on the board.
    if (item.trueSeverity === "critical") {
      nudges.push(item);
      continue;
    }

    // Under an active focus the softest tier is held back, and so is anything
    // the stretch flattened all the way to "ok". Both are counted, so the user
    // is always told how much is being kept from them.
    if (dampening && !item.guarded && (item.severity === "watch" || item.severity === "ok")) {
      muted += 1;
      continue;
    }

    nudges.push(item);
  }

  return {
    needs,
    nudges,
    muted,
    quiet: needs.length === 0 && nudges.length === 0,
    focus: { ...status, cost }
  };
}
