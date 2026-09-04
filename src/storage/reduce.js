/**
 * Turning the event stream into current state.
 *
 * The reducer is pure and total-ordered: given the same events it always
 * produces the same state, on any machine. Conflicting edits resolve
 * field-by-field with last-write-wins, which is decided entirely by the event
 * order rather than by which process happened to write first.
 *
 * Every entity carries provenance (`_by`, `_at`, `_editedBy`) so the UI can
 * label anything a model or an agent produced without a separate bookkeeping
 * table.
 */

/**
 * Entities that may be created, updated and tombstoned generically.
 *
 * A whitelist rather than open-ended tables: an agent with write access should
 * be able to add a promise, not invent a new kind of record.
 */
export const COLLECTIONS = /** @type {const} */ ([
  "people",
  "promises",
  "projects",
  "duties",
  "touches",
  "evidence",
  /** Pieces of work with a stated delegation level and an owner. */
  "workstreams",
  /** The questions Tend asks rather than derives, and their answers. */
  "signals",
  "signalAnswers",
  /** Which Nib categories feed which person, and as what kind of contact. */
  "sources",
  /**
   * Pointers to material about somebody that lives outside the app.
   *
   * Prepared words for a conversation, a reading of one that happened, a spec
   * somebody else maintains. The same shape as the Nib pointer: the material
   * stays where it is and this holds the address, the title and the date.
   *
   * The date is not decoration. A note about a conversation stays true; a
   * prepared reading stops being current the moment the conversation happens,
   * and an undated link reads as advice rather than as history. See
   * `domain/links.js`.
   */
  "links",
  /**
   * Commitments read out of a shared meeting note that nobody has been named
   * for yet.
   *
   * Held here rather than written straight into `promises`, because a note
   * bound to several people gives no way to tell whose each flagged block is.
   * The two wrong answers are both worse than waiting: fanning one commitment
   * out to every attendee inflates the promise list until it stops being read,
   * and guessing a single owner puts a real obligation on a page where it may
   * never be looked for.
   *
   * A separate collection rather than a flag on a half-built promise, so that
   * no existing reader of `promises` can accidentally show one. A promise
   * without somebody to owe it to is not a quieter promise, it is a different
   * kind of thing, and the type system should have to be told before it becomes
   * the first kind.
   *
   * Rows here share the id their promise will get, so filing one is a create
   * with the same id in `promises` - which keeps the import idempotent through
   * the handover, and keeps a later deletion permanent.
   */
  "pendingPromises",
  /**
   * His own action points: work he was handed, that nobody is waiting for.
   *
   * A separate collection for the same reason `pendingPromises` is one, and
   * the reason is the whole feature. A promise needs somebody waiting for it.
   * A task out of a meeting has no such person - he is not in his own roster -
   * so filing it as a promise would have to name somebody, and naming the
   * nearest attendee inflates their card and puts work that is not about them
   * into their 1-1 prep.
   *
   * The absence of this cost him eleven tracked action points from one manager
   * meeting: Tend found them, could offer only the other two attendees, and
   * they went nowhere.
   *
   * Rows keep the id of the pending row they came from, so filing one as his
   * own and as a promise is impossible - which is correct, it is one or the
   * other - and a re-import cannot resurrect it.
   *
   * Not in AGENT_WRITABLE. An agent may add a promise, because somebody said
   * it out loud and there is a person who is waiting; deciding that a piece of
   * work is his is a judgement about his own week.
   */
  "myActions",
  /**
   * Performance plans: the second shape beside a growth direction.
   *
   * Its own collection because a plan is the opposite of a direction in every
   * way that matters - see `domain/plan.js` for the table. Sharing the growth
   * rows with a flag would mean a direction could become a plan by an edit,
   * and a direction that quietly becomes a performance plan is the worst
   * version of this conversation: the person believes they are being developed
   * while a decision is being made about them.
   *
   * Not in AGENT_WRITABLE and there is no MCP tool. A promise is something
   * somebody said out loud with a person waiting for it; a plan is a decision
   * about whether somebody keeps their job in its current shape. Same boundary
   * as the role map and the decision log.
   */
  "plans",
  /**
   * Decisions about the organisation, with a date to revisit them.
   *
   * Not promises. A promise is given TO a person; a decision is ABOUT the
   * organisation, and it is the thing that has no commit history and therefore
   * gets renegotiated every three months by people who have forgotten why -
   * yourself included.
   */
  "decisions",
  /**
   * Standing subjects worth raising with someone, and a row per time one was.
   *
   * Separate from duties because a duty is contact you owe and drifts into Now;
   * a topic is content, it belongs to one conversation, and it is never
   * critical. Separate from touches because a shared "raised something" kind
   * would let the easy question silence the hard one.
   */
  "topics",
  "raised",
  /**
   * One person's interest in one project, and what you owe them about it.
   *
   * The pair rather than the person, because a stakeholder cadence satisfied by
   * any update at all would let a quarter of silence about the thing they depend
   * on hide behind a fortnight of chatter about something else.
   */
  "stakes",
  /**
   * Meetings that were booked and did not happen.
   *
   * Stored beside contact and read nowhere contact is read. "We never booked it"
   * and "we booked it and cancelled it three times" are different facts, and a
   * tool that only counts contact sees both as silence.
   */
  "skips",
  /**
   * End-of-day entries. Optional by design - days get missed and nothing here
   * prompts for one - so the value is in a pass over many rather than in any
   * single row.
   */
  "entries",
  /**
   * One direction a person is growing in, and a row per time it came up.
   *
   * The note carries an `observed` flag that is deliberately a separate answer
   * from "did we talk about it", because the gap between the two is the whole
   * reading: many conversations and nothing ever observed is a wrong plan or
   * missing support, and no tool that only counts meetings can see it.
   */
  "growth",
  "growthNotes",
  /**
   * Goals he sets for himself, and a row per occasion one did or did not
   * happen.
   *
   * The mirror of a growth thread, turned inward, and kept apart from it for the
   * reason `domain/aims.js` opens with: a thread's consent fields mean nothing
   * on oneself, and the question that decides whether a self-set goal is worth
   * anything - who judges - has no field there.
   *
   * An aim names where its verdict comes from, and one with no source is
   * refused. A goal nothing can ever satisfy is not a goal, it is a standing
   * reproach.
   */
  "aims",
  "aimNotes",
  /**
   * Answers you are waiting for from somebody else, and a row per time you
   * chased one.
   *
   * The mirror of a promise and kept apart from it on purpose. A promise you owe
   * escalates hard because the person let down is let down today; somebody
   * else's silence is not an alarm about you, so nothing here is ever critical.
   * The count that matters is the chases, not the days.
   */
  "waiting",
  "chases",
  /**
   * A kept reading of the journal over one closed window of days.
   *
   * Stored, where a brief deliberately is not, and the difference is whether the
   * thing underneath it can change. A brief is built from live facts and starts
   * going stale the moment it is written; a review is built from entries about
   * days that are over, so it is as true next year as it was on the evening it
   * was run. Keeping it is also the only way "is this the same thing as last
   * month" ever becomes answerable.
   */
  "reviews",
  /**
   * One thing that happened, who it involved, and the writer's own part in it.
   *
   * Dated to the moment rather than to the day, and naming everybody it involved -
   * most of what is worth writing down involves several people at once, and one
   * row per person would mean writing the same sentence three times.
   *
   * Deliberately not the day, and deliberately not an observation. The day is
   * about where the whole of it went and names nobody - attaching people to it
   * put one day's text on four pages, saying nothing about any of them. An
   * observation is material for a review conversation and is therefore about the
   * other person, which is what the private half refuses to keep.
   *
   * The own-part field is required and the what-happened field is not, which is
   * the rule made structural: an entry with only "I was short with them" is
   * complete, and one with only what somebody else did cannot be written.
   */
  "moments",
  /**
   * A short, occasionally-prompted look back at how the last week or so went -
   * what went well, what you would do differently.
   *
   * Not the day: the day is a nightly retrospective that never prompts and is
   * about everywhere the day went, where this asks two fixed questions about a
   * wider stretch of time and does gently prompt when it has lapsed. Not a
   * moment: a moment is one event with named people, and this names nobody -
   * it is about the shape of the week, not any interaction inside it.
   */
  "reflections",
  /**
   * One row per run of the bulk "archive everyone and everything active"
   * action, holding the ids it changed.
   *
   * Needed because the bulk action is the only place in the app where one press
   * changes dozens of rows, and it was reversible only one row at a time - so a
   * mis-press was thirty manual undos with the app silent in between. Undo has
   * to know which rows THAT run archived, and the archive flag alone cannot say:
   * a row archived by hand the same afternoon looks identical.
   *
   * A recorded run rather than a timestamp match, even though one bulk run
   * stamps every row with the same instant. The instant is a coincidence of
   * implementation - a per-item archive in the same millisecond would be swept
   * up by an undo that trusted it - and the explicit list is what makes the undo
   * mean "put back what that press changed" rather than "unarchive whatever
   * shares a number".
   */
  "bulkArchives"
]);

/**
 * @typedef {Record<string, any> & {
 *   id: string,
 *   _by: string,
 *   _at: number,
 *   _editedBy?: string,
 *   _editedAt?: number,
 *   _deleted?: boolean
 * }} Entity
 */

/**
 * @typedef {object} TendState
 * @property {Record<string, Record<string, Entity>>} c Collections, keyed by id.
 * @property {Entity | null} focus The single active focus, or null.
 * @property {number} applied How many events were applied.
 * @property {{ op: string, reason: string, id: string }[]} rejected Events that did not apply.
 */

/** @returns {TendState} */
export function emptyState() {
  /** @type {Record<string, Record<string, Entity>>} */
  const c = {};
  for (const name of COLLECTIONS) {
    c[name] = {};
  }
  return { c, focus: null, applied: 0, rejected: [] };
}

/**
 * Apply one event to a state, in place.
 *
 * Unknown or malformed events are recorded in `rejected` rather than thrown:
 * a single bad event written by an older or buggier client must not make the
 * whole log unreadable.
 *
 * @param {TendState} state
 * @param {import("./events.js").TendEvent} e
 */
export function applyEvent(state, e) {
  const [collection, action] = e.op.split(".");

  if (collection === "focus") {
    applyFocus(state, action, e);
    return;
  }

  if (!COLLECTIONS.includes(/** @type {any} */ (collection))) {
    state.rejected.push({ op: e.op, reason: "unknown collection", id: e.id });
    return;
  }

  const table = state.c[collection];
  const id = typeof e.p.id === "string" ? e.p.id : null;
  if (!id) {
    state.rejected.push({ op: e.op, reason: "payload has no id", id: e.id });
    return;
  }

  if (action === "create") {
    // A replayed create must not wipe later edits, so an existing row only
    // gains the fields it is missing.
    const existing = table[id];
    if (existing) {
      table[id] = { ...e.p, ...existing, id };
      state.applied += 1;
      return;
    }
    table[id] = { ...e.p, id, _by: e.w, _at: e.ts };
    state.applied += 1;
    return;
  }

  if (action === "update") {
    const existing = table[id];
    if (!existing) {
      // Update before create: keep it as a partial row so the create can fill
      // the rest in. Out-of-order arrival is normal across two machines.
      table[id] = { ...e.p, id, _by: e.w, _at: e.ts, _editedBy: e.w, _editedAt: e.ts };
      state.applied += 1;
      return;
    }
    Object.assign(existing, e.p, { id, _editedBy: e.w, _editedAt: e.ts });
    state.applied += 1;
    return;
  }

  if (action === "delete") {
    const existing = table[id] ?? { id, _by: e.w, _at: e.ts };
    table[id] = { ...existing, _deleted: true, _editedBy: e.w, _editedAt: e.ts };
    state.applied += 1;
    return;
  }

  state.rejected.push({ op: e.op, reason: "unknown action", id: e.id });
}

/**
 * Focus is a singleton rather than a collection: there is one current focus or
 * none, and setting a new one ends the previous.
 *
 * @param {TendState} state
 * @param {string} action
 * @param {import("./events.js").TendEvent} e
 */
function applyFocus(state, action, e) {
  if (action === "set") {
    state.focus = { ...e.p, id: String(e.p.id ?? e.id), _by: e.w, _at: e.ts };
    state.applied += 1;
    return;
  }
  if (action === "update" && state.focus) {
    Object.assign(state.focus, e.p, { _editedBy: e.w, _editedAt: e.ts });
    state.applied += 1;
    return;
  }
  if (action === "end") {
    state.focus = null;
    state.applied += 1;
    return;
  }
  state.rejected.push({ op: e.op, reason: "unknown focus action", id: e.id });
}

/**
 * Reduce an ordered event stream to state.
 *
 * @param {import("./events.js").TendEvent[]} events Must already be in total order.
 * @returns {TendState}
 */
export function reduce(events) {
  const state = emptyState();
  for (const e of events) {
    applyEvent(state, e);
  }
  return state;
}

/**
 * Live rows of one collection, tombstones removed.
 *
 * @param {TendState} state
 * @param {string} collection
 * @returns {Entity[]}
 */
export function rows(state, collection) {
  const table = state.c[collection];
  if (!table) {
    return [];
  }
  return Object.values(table).filter((r) => !r._deleted);
}
