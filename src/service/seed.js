/**
 * The starting role map.
 *
 * Lives here rather than in a script so the app can offer it on an empty store:
 * a tool nobody can set up without a terminal is not finished.
 *
 * The three most managers already practise go in active. The five from the research go
 * in as proposals, because an agent may suggest what the job is and
 * only the user decides it.
 *
 * Reasoning and sources: docs/role-map-research.md.
 */

import { DEFAULT_SIGNALS, SIGNAL_CADENCE_DAYS } from "../domain/signals.js";
import { DEFAULT_STAKE_DAYS } from "../domain/stakes.js";
import { TOPIC_SEEDS } from "../domain/topics.js";

export const SEED_DUTIES = [
  {
    id: "duty-one-to-one",
    status: "active",
    name: "1-1",
    means:
      "A recurring conversation with a structure, starting with follow-up on what was " +
      "agreed last time. New action points only when there is something concrete, " +
      "never to fill the slot.",
    source: "yours",
    subjectKind: "person",
    cadenceDays: 14,
    evidenceKinds: ["one-to-one"],
    relations: ["lead-and-manage", "manage-remotely"],
    guarded: true
  },
  {
    id: "duty-feedback-rounds",
    status: "active",
    name: "Producer and peer feedback round",
    means:
      "Two question sets on a 1-5 scale with behavioural anchors, mapped onto whatever " +
      "levelling axes your org uses, so the answers feed level-setting rather than " +
      "only your own impression.",
    source: "yours",
    subjectKind: "person",
    cadenceDays: 90,
    evidenceKinds: ["survey"],
    relations: ["lead-and-manage", "lead-only", "manage-remotely"],
    guarded: true
  },
  {
    id: "duty-project-check",
    status: "active",
    name: "Project check-in",
    means:
      "You own the code side without being in the daily work. The question is not whether " +
      "it ships, it is whether you would hear about a problem before it became a delivery " +
      "problem.",
    source: "yours",
    subjectKind: "project",
    cadenceDays: 14,
    evidenceKinds: ["check-in"],
    relations: [],
    guarded: false
  },

  {
    id: "duty-second-hand",
    status: "proposed",
    name: "Second-hand read on people you cannot see",
    means:
      "A short standing exchange with the other teams' leads about each report who sits " +
      "there. You hold the mandate and none of the observation, and surveys are a " +
      "quarterly snapshot rather than a channel. Guarded: a focus must never widen this " +
      "particular blind spot.",
    source: "Resilient Management, The Manager's Path",
    subjectKind: "person",
    cadenceDays: 30,
    evidenceKinds: ["second-hand"],
    relations: ["manage-remotely"],
    guarded: true
  },
  {
    id: "duty-feedback-fresh",
    status: "proposed",
    name: "Feedback close to the event",
    means:
      "Praise and correction within days, not saved for a review. Feedback held until " +
      "review season arrives too late to act on and lands as a verdict instead of help.",
    source: "The Manager's Path, Resilient Management",
    subjectKind: "person",
    cadenceDays: 28,
    evidenceKinds: ["feedback"],
    relations: ["lead-and-manage", "lead-only", "manage-remotely"],
    guarded: false
  },
  {
    id: "duty-track-record",
    status: "proposed",
    name: "Running record of what each person delivered",
    means:
      "Write it down when it happens. Otherwise review season is a memory exercise weighted " +
      "toward the last few weeks, which is the exact bias the feedback rounds were built to " +
      "avoid. For the people in other teams this may be the only record that exists.",
    source: "The Manager's Path, plus practitioner writing on recency bias",
    subjectKind: "person",
    cadenceDays: 42,
    evidenceKinds: ["observation"],
    relations: ["lead-and-manage", "lead-only", "manage-remotely"],
    guarded: false
  },
  {
    id: "duty-delegation-level",
    status: "proposed",
    name: "Stated delegation level per workstream",
    means:
      "Grove's task-relevant maturity: how closely you follow up depends on how experienced " +
      "someone is at this specific task, not on how good they are generally. Set a level per " +
      "piece of work - doing it, delegated with close follow-up, or fully theirs. The absence " +
      "of monitoring is what separates delegating from abdicating, and it is the half the " +
      "player-coach model does not specify.",
    source: "High Output Management (task-relevant maturity)",
    // A workstream, not a project. It consumes `delegation-review`, which is
    // about a piece of work, so declared against a project it crossed with
    // every project and could never be satisfied by anything - it would have
    // sat in Now saying a project had never had its level set, forever.
    subjectKind: "workstream",
    cadenceDays: 30,
    evidenceKinds: ["delegation-review"],
    relations: [],
    guarded: false
  },
  {
    id: "duty-sideways",
    status: "proposed",
    name: "Sideways contact with the other leads",
    means:
      "Coordinating across peers has no authority behind it, so it runs entirely on " +
      "trust and demonstrated reliability. Peer relationships are the direction leaders " +
      "neglect first, because nothing in a calendar forces them.",
    source: "Practice writing on matrix and cross-functional leadership",
    subjectKind: "person",
    cadenceDays: 7,
    evidenceKinds: ["sideways"],
    relations: ["equal-lead"],
    guarded: false
  },
  {
    id: "duty-stakeholder-update",
    // Proposed, like every duty he did not write. A missing status reads as
    // active, which would have switched this on without him agreeing to it -
    // the one boundary the role map exists to hold.
    status: "proposed",
    name: "Keep your stakeholders current",
    means:
      "Somebody who depends on what you deliver should not learn how it is going from " +
      "the news that it slipped. The interval lives on each stakeholder rather than " +
      "here, because a sponsor two levels up who wants to know it is moving is a " +
      "different obligation from someone sitting next to the work.",
    source: "The gap nothing else covered: a stakeholder is neither a report nor a peer",
    subjectKind: "stake",
    cadenceDays: DEFAULT_STAKE_DAYS,
    evidenceKinds: ["update"],
    // Empty on purpose. A stake is its own subject and carries no relationship
    // type, so a duty that filtered on one would never apply to any of them.
    relations: [],
    guarded: false
  }
];

/**
 * The monthly questions. Seeded active rather than proposed: unlike a duty, a
 * question costs nothing until it is due, and answering "no" a few times is how
 * he finds out whether the set earns its place.
 */
export const SEED_SIGNALS = DEFAULT_SIGNALS.map((s) => ({
  ...s,
  status: "active",
  cadenceDays: SIGNAL_CADENCE_DAYS
}));

/**
 * Write anything missing. Fixed ids make it idempotent, so it is safe to offer
 * as a button that can be pressed twice.
 *
 * No people and no projects: those are real colleagues, and placeholder names
 * would put fiction into live data.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @returns {{ duties: number, questions: number, topics: number }}
 */
export function seedRoleMap(store) {
  const haveDuties = new Set(store.rows("duties").map((d) => d.id));
  const haveSignals = new Set(store.rows("signals").map((s) => s.id));
  const haveTopics = new Set(store.rows("topics").map((t) => t.id));

  let duties = 0;
  for (const duty of SEED_DUTIES) {
    if (!haveDuties.has(duty.id)) {
      store.create("duties", duty);
      duties += 1;
    }
  }

  let questions = 0;
  for (const signal of SEED_SIGNALS) {
    if (!haveSignals.has(signal.id)) {
      store.create("signals", signal);
      questions += 1;
    }
  }

  // Topics are seeded proposed like everything else. They cover the two
  // directions no duty does: upward, where the question is what he wants rather
  // than what he owes, and sideways, where there is no formal channel at all.
  let topics = 0;
  for (const topic of TOPIC_SEEDS) {
    if (!haveTopics.has(topic.id)) {
      store.create("topics", {
        ...topic,
        relations: [...topic.relations],
        person: null,
        source: "management reading",
        status: "proposed"
      });
      topics += 1;
    }
  }

  return { duties, questions, topics };
}
