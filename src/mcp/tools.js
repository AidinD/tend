/**
 * The MCP tool surface.
 *
 * Kept separate from the server wiring so the whole surface can be tested
 * without stdio, a transport, or a running process.
 *
 * Two rules shape what is here:
 *
 *   Reading returns semantics, not rows. `tend_attention` answers "what needs
 *   me" in one call, already sorted and already counted. The alternative is an
 *   agent pulling raw records and doing date arithmetic, which is exactly the
 *   unreliability the deterministic core exists to prevent.
 *
 *   Writing may add, never restructure. An agent can log a promise, a contact
 *   or an observation. It can *propose* a duty. It cannot decide what the job
 *   is - `decideDuty` is not on this list, deliberately.
 */

import * as api from "../service/api.js";
import * as nib from "../service/nib.js";

/**
 * Typed rather than left as `object`, so a tool cannot be added with a schema
 * that omits `additionalProperties` and quietly accepts arguments nobody
 * validates.
 *
 * @typedef {{
 *   type: "object",
 *   properties: Record<string, any>,
 *   required?: string[],
 *   additionalProperties: false
 * }} InputSchema
 *
 * @typedef {{
 *   name: string,
 *   description: string,
 *   inputSchema: InputSchema,
 *   run: (store: any, args: any, now: number) => any
 * }} Tool
 */

/** @type {InputSchema} */
const NO_ARGS = { type: "object", properties: {}, additionalProperties: false };

/** @type {Tool[]} */
export const TOOLS = [
  {
    name: "tend_attention",
    description:
      "What needs the user right now: cadences that have drifted, promises going stale, " +
      "split into things that need a decision and softer nudges. Already sorted worst " +
      "first. Start here for any 'what should I be doing' or 'what have I forgotten' " +
      "question. Returns allInStep: true when nothing is behind.",
    inputSchema: NO_ARGS,
    run: (store, _args, now) => api.attention(store, now)
  },
  {
    name: "tend_person",
    description:
      "Everything Tend knows about one person: how the user relates to them, every cadence " +
      "that applies and how far behind it is, open promises, recent contact, and logged " +
      "observations. Accepts a name or part of one.",
    inputSchema: {
      type: "object",
      properties: { person: { type: "string", description: "Name, part of a name, or id." } },
      required: ["person"],
      additionalProperties: false
    },
    run: (store, args, now) => api.person(store, args.person, now)
  },
  {
    name: "tend_people",
    description:
      "The roster, with each person's worst drift. Optionally filtered by relationship " +
      "type. Use manage-remotely to find the people the user is accountable for but does " +
      "not see day to day.",
    inputSchema: {
      type: "object",
      properties: {
        relation: {
          type: "string",
          enum: ["lead-and-manage", "lead-only", "manage-remotely", "equal-lead", "own-manager"],
          description: "Optional filter."
        }
      },
      additionalProperties: false
    },
    run: (store, args, now) => api.people(store, now, args.relation)
  },
  {
    name: "tend_promises",
    description:
      "Open promises the user made, oldest first, with how long each has been outstanding. " +
      "Anything past two weeks is critical regardless of anything else.",
    inputSchema: NO_ARGS,
    run: (store, _args, now) => api.promises(store, now)
  },
  {
    name: "tend_role_map",
    description:
      "The role map: active duties with how many of their subjects are behind, plus " +
      "duties proposed but not yet accepted. Read this before proposing a new duty, so " +
      "you do not propose something already there or already declined.",
    inputSchema: NO_ARGS,
    run: (store, _args, now) => api.roleMap(store, now)
  },
  {
    name: "tend_prep",
    description:
      "One card per person worth talking to, worst drift first: when you last spoke, what " +
      "you promised them, what they own and how long since you reviewed it, what is open in " +
      "their area on the Jot board, and the last note you wrote about them. Read this before " +
      "a one-to-one, or when asked who needs a conversation. Capped at six on purpose - a " +
      "list of everyone is the roster, which is tend_people. `openWork` is null rather than " +
      "empty when the Jot board could not be read, which is a different fact.",
    inputSchema: NO_ARGS,
    run: (store, _args, now) => api.prep(store, now)
  },
  {
    name: "tend_focus",
    description:
      "The current focus: what it is, how long is left, how much of the week it is " +
      "budgeted, how many nudges it is holding back, and what it has cost in drift.",
    inputSchema: NO_ARGS,
    run: (store, _args, now) => api.focus(store, now)
  },
  {
    name: "tend_projects",
    description: "Projects and how long since each was last looked at, longest first.",
    inputSchema: NO_ARGS,
    run: (store, _args, now) => api.projects(store, now)
  },

  {
    name: "tend_add_person",
    description:
      "Add someone to the roster. Set `since` to when the relationship actually started, " +
      "not today - without it every cadence measures from now and somebody neglected for " +
      "months looks perfectly in step. Relationship type decides which duties apply: " +
      "manage-remotely is for a report whose work the user no longer sees, equal-lead is a " +
      "peer lead he has no authority over.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        relation: {
          type: "string",
          enum: ["lead-and-manage", "lead-only", "manage-remotely", "equal-lead", "own-manager"]
        },
        since: { type: "number", description: "When the relationship started, ms since epoch." }
      },
      required: ["name", "relation"],
      additionalProperties: false
    },
    run: (store, args, now) => api.addPerson(store, { ...args, now })
  },
  {
    name: "tend_set_relation",
    description:
      "Change how the user relates to someone: they moved team, he took them on, they became " +
      "a peer. Every duty that applies to them changes with it and their history survives. " +
      "This is how a reorg is recorded.",
    inputSchema: {
      type: "object",
      properties: {
        person: { type: "string" },
        relation: {
          type: "string",
          enum: ["lead-and-manage", "lead-only", "manage-remotely", "equal-lead", "own-manager"]
        }
      },
      required: ["person", "relation"],
      additionalProperties: false
    },
    run: (store, args) => api.setRelation(store, args.person, args.relation)
  },
  {
    name: "tend_add_project",
    description:
      "Add a project to keep an eye on. Set `since` to when they took it on, not today, " +
      "so a project he has been ignoring does not look freshly checked. Projects carry a " +
      "check-in cadence rather than a schedule, because the useful question is which one " +
      "has gone longest without a look.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        since: { type: "number", description: "When he took it on, ms since epoch." }
      },
      required: ["name"],
      additionalProperties: false
    },
    run: (store, args, now) => api.addProject(store, { ...args, now })
  },
  {
    name: "tend_log_promise",
    description:
      "Record something the user said they would do. Use this when a note or a conversation " +
      "contains a commitment - 'I'll check with X', 'I'll get back to you on Y'. When " +
      "unsure whether something is a promise, log it: a false one costs a click to " +
      "dismiss, a missed one costs trust with a real person.",
    inputSchema: {
      type: "object",
      properties: {
        person: { type: "string", description: "Who it was made to." },
        text: { type: "string", description: "What was promised, in his words where possible." },
        due: { type: "number", description: "Optional deadline, ms since epoch." },
        madeAt: { type: "number", description: "When it was said, ms since epoch. Defaults to now - set it when extracting from a dated note." }
      },
      required: ["person", "text"],
      additionalProperties: false
    },
    run: (store, args, now) => api.logPromise(store, { ...args, now })
  },
  {
    name: "tend_resolve_promise",
    description: "Close a promise, either because it was kept or because it was dropped.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        as: { type: "string", enum: ["resolved", "dropped"], description: "Defaults to resolved." }
      },
      required: ["id"],
      additionalProperties: false
    },
    run: (store, args) => api.resolvePromise(store, args.id, args.as ?? "resolved")
  },
  {
    name: "tend_log_touch",
    description:
      "Record that contact happened. This is what resets a cadence. The kind matters and " +
      "is not interchangeable: 'one-to-one' is a conversation with the person, " +
      "'second-hand' is hearing about them from someone else, 'sideways' is contact with " +
      "a peer lead, 'check-in' is looking at a project. A second-hand report must not " +
      "reset the 1-1 cadence, which is why these are separate.",
    inputSchema: {
      type: "object",
      properties: {
        subject: { type: "string", description: "Person or project name." },
        kind: { type: "string", description: "one-to-one | second-hand | sideways | check-in | feedback" },
        note: { type: "string", description: "Optional one line on what it was." },
        at: { type: "number", description: "When, ms since epoch. Defaults to now." }
      },
      required: ["subject", "kind"],
      additionalProperties: false
    },
    run: (store, args, now) => api.logTouch(store, { ...args, now })
  },
  {
    name: "tend_log_evidence",
    description:
      "Record something observed: what someone delivered, how they handled a situation, " +
      "or what the user pulled together in a coordinating role of their own. " +
      "This is the raw material for a review conversation six months from now, so it is " +
      "not a memory exercise weighted toward the last three weeks.",
    inputSchema: {
      type: "object",
      properties: {
        person: { type: "string", description: "Who it is about. Omit for evidence about your own work." },
        text: { type: "string", description: "What happened, concretely." },
        area: { type: "string", description: "Optional tag, e.g. team-lead, rnd, or an IC axis." }
      },
      required: ["text"],
      additionalProperties: false
    },
    run: (store, args, now) => api.logEvidence(store, { ...args, now })
  },
  {
    name: "tend_signals",
    description:
      "The monthly questions Tend cannot derive and has to ask: whether anyone stopped " +
      "pushing back, whether retros end early with nothing resolved, whether there is anyone " +
      "whose work has gone unseen. Shows which are due and what was last answered.",
    inputSchema: NO_ARGS,
    run: (store, _args, now) => api.signals(store, now)
  },
  {
    name: "tend_answer_signal",
    description:
      "Answer one of the monthly questions. A yes requires a note saying what was seen - a " +
      "bare yes is not actionable three months later - and brings the question back in a " +
      "week instead of a month.",
    inputSchema: {
      type: "object",
      properties: {
        signal: { type: "string", description: "The question's id." },
        answer: { type: "string", enum: ["yes", "no"] },
        note: { type: "string", description: "Required for a yes: what did you actually see?" }
      },
      required: ["signal", "answer"],
      additionalProperties: false
    },
    run: (store, args, now) => api.answerSignal(store, { ...args, now })
  },
  {
    name: "tend_workstreams",
    description:
      "Pieces of work with a stated delegation level and an owner, and how long since each " +
      "was reviewed. The review interval comes from the level: work he is still doing gets " +
      "looked at weekly, work delegated with close follow-up every two weeks, work that is " +
      "fully theirs every two months.",
    inputSchema: NO_ARGS,
    run: (store, _args, now) => api.workstreams(store, now)
  },
  {
    name: "tend_add_workstream",
    description:
      "Add a piece of work and say how far it has been delegated. The level sits on the work " +
      "and its owner together, not on the project or the person, because how closely you " +
      "follow up depends on how experienced this person is at this particular task. Leaving " +
      "the level unset is itself flagged - unstated delegation is where responsibility has " +
      "moved and information has not.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        owner: { type: "string", description: "Person who owns it." },
        project: { type: "string", description: "Project it belongs to, if any." },
        level: {
          type: "string",
          enum: ["doing", "close", "theirs"],
          description: "doing = still his; close = delegated with close follow-up; theirs = they own the outcome."
        }
      },
      required: ["name"],
      additionalProperties: false
    },
    run: (store, args, now) => api.addWorkstream(store, { ...args, now })
  },
  {
    name: "tend_set_delegation_level",
    description: "Change how far a piece of work has been delegated, which changes how often it is reviewed.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        level: { type: "string", enum: ["doing", "close", "theirs"] }
      },
      required: ["id", "level"],
      additionalProperties: false
    },
    run: (store, args) => api.setDelegationLevel(store, args.id, args.level)
  },
  {
    name: "tend_nib_folders",
    description:
      "List the categories and sub-categories in Nib, with how many notes each holds. Use " +
      "this to find the folder to bind to a person.",
    inputSchema: NO_ARGS,
    run: () => nib.listNibFolders()
  },
  {
    name: "tend_bind_source",
    description:
      "Bind a Nib folder to a person, saying what kind of contact notes there count as. This " +
      "is how Tend knows which notes are about whom, without having to follow any " +
      "naming convention. The kind matters: a folder bound as 'one-to-one' satisfies the 1-1 " +
      "cadence, one bound as 'second-hand' satisfies only the separate cadence for hearing " +
      "about someone from elsewhere.",
    inputSchema: {
      type: "object",
      properties: {
        person: { type: "string" },
        categoryId: { type: "string", description: "From tend_nib_folders." },
        subId: { type: "string", description: "From tend_nib_folders. Omit to bind the whole category." },
        kind: { type: "string", description: "one-to-one | second-hand | sideways | feedback | observation" },
        label: { type: "string", description: "The folder's readable name, for the UI." }
      },
      required: ["person", "categoryId", "kind"],
      additionalProperties: false
    },
    run: (store, args) => api.bindSource(store, args)
  },
  {
    name: "tend_sources",
    description: "Which Nib folders are bound to which people, and as what kind of contact.",
    inputSchema: {
      type: "object",
      properties: { person: { type: "string", description: "Optional filter." } },
      additionalProperties: false
    },
    run: (store, args) => api.sources(store, args.person)
  },
  {
    name: "tend_index_nib",
    description:
      "Read Nib and pull in what it finds: one contact per note in a bound folder, and one " +
      "promise per flagged action point. Ticking an action point off in Nib resolves the " +
      "promise here too. Safe to run repeatedly - every row it writes has an id derived from " +
      "the Nib id, so nothing is ever duplicated. Nib is only read, never written to.",
    inputSchema: {
      type: "object",
      properties: { dry: { type: "boolean", description: "Report what would change without writing." } },
      additionalProperties: false
    },
    run: (store, args) => nib.indexNib(store, { dry: Boolean(args.dry) })
  },
  {
    name: "tend_propose_duty",
    description:
      "Suggest a responsibility for the role map, for example after reading a management " +
      "book. It always lands as a proposal and never takes effect until it is accepted " +
      "in the app: an agent may suggest what the job is, only he decides it. Say where it " +
      "came from in `source` so he can tell a book's idea from his own.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        means: { type: "string", description: "What it means in practice, in plain words." },
        source: { type: "string", description: "Where it came from, e.g. 'The Manager's Path, ch. 4'." },
        subjectKind: { type: "string", enum: ["person", "project"] },
        cadenceDays: { type: "number", description: "Target interval in days." },
        evidenceKinds: { type: "array", items: { type: "string" }, description: "Which kinds of contact satisfy it." },
        relations: {
          type: "array",
          items: { type: "string", enum: ["lead-and-manage", "lead-only", "manage-remotely", "equal-lead", "own-manager"] },
          description: "Which relationship types it applies to. Empty means all."
        }
      },
      required: ["name", "means", "source", "subjectKind", "cadenceDays"],
      additionalProperties: false
    },
    run: (store, args) => api.proposeDuty(store, args)
  }
];

/**
 * Run one tool by name.
 *
 * Errors come back as data rather than as thrown exceptions, because an agent
 * that gets "no person matching X, known: A, B, C" can correct itself, and one
 * that gets a stack trace cannot.
 *
 * @param {import("../storage/store.js").TendStore} store
 * @param {string} name
 * @param {any} args
 * @param {number} now
 * @returns {any}
 */
export function callTool(store, name, args, now) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) {
    return { error: `Unknown tool "${name}". Available: ${TOOLS.map((t) => t.name).join(", ")}.` };
  }
  try {
    return tool.run(store, args ?? {}, now);
  } catch (err) {
    return { error: `${name} failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** The list an MCP client sees, without the run functions. */
export function toolManifest() {
  return TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
}
