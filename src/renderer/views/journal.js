/**
 * The day, in four boxes - and the pass that reads them.
 *
 * Its own place in the rail because it is its own act. Prep is what you read
 * before talking to somebody; this is what you write after a day, and folding it
 * into another view would make both of them worse.
 *
 * ## No prompt, and no count in the rail
 *
 * Every other view earns a number beside its name because something there is
 * waiting. Nothing here waits. Days get missed and that is the design, so a
 * badge would only ever be a reproach - and a tool that reproaches you every
 * evening is one you stop opening, which takes the data with it.
 *
 * ## The page says how thin it is
 *
 * Because a pass over five entries and a pass over twenty-five are different
 * claims. Saying so here, above any reading rather than inside it, means the
 * honesty is structural rather than something a model has to remember to
 * mention.
 *
 * ## In the private half, the rule is in the form
 *
 * An entry there records the interaction and his own part in it, never the other
 * person's state. The check that reads an entry back against that rule exists,
 * but the cheaper half of enforcing it is upstream: the labels and hints on the
 * form say the rule while it is being written, which is worth more than any
 * amount of reading it back afterwards.
 *
 * ## Why the reading is a button and not a schedule
 *
 * The entries were always the means and the reading is the product, but a
 * reading that arrives unasked on the first of the month is a verdict delivered
 * to somebody who was not asking for one. The whole design of this page is that
 * nothing here nags, and the pass over it does not get an exception.
 */

import { act, asDateInput, esc, form, tend, toast } from "../ui.js";
import { discard, isRunning, modelActions, modelStatus, ownPartHtml, resultFor, reviewHtml, run, stamp } from "../model.js";
import { refresh } from "../app.js";
import { T } from "../text.js";

const words = T.journal;

/** The key the current reading is held under. One at a time is enough. */
const REVIEW_KEY = "review:journal";
const PATTERN_KEY = "review:moments";

export async function render() {
  const [result, kept, model, status, mine] = await Promise.all([
    tend.invoke("journal"),
    tend.invoke("reviews"),
    modelStatus(),
    tend.invoke("status"),
    tend.invoke("myAttention")
  ]);
  // The same signal the Now view shows, read here because this is the page you
  // are already on when you write an evening down - which is the moment a line
  // about unread material costs nothing and a badge in the rail would be a
  // reproach.
  const backlog = (Array.isArray(mine) ? mine : []).find(
    (/** @type {any} */ s) => s.key === "i-have-written-and-not-read"
  );
  const isPrivate = String(status?.mode ?? "work") === "private";

  if (result?.error) {
    return `<div class="card sev-critical"><div class="card-top">
      <h2 class="card-title">${words.readFailedTitle}</h2></div>
      <p class="card-why">${esc(result.error)}</p></div>`;
  }

  const entries = Array.isArray(result.entries) ? result.entries : [];
  const cover = result.coverage ?? { summary: "", thin: true, spread: 0 };

  const head = `
    <div class="view-head">
      <div class="head-row">
        <div>
          <h1 class="view-title">${words.title}</h1>
          <p class="view-sub">${isPrivate ? words.subPrivate : words.subWork}</p>
        </div>
        <span class="foot-actions">
          <!--
            Two actions, and they are two different acts rather than one with a
            switch. The day is a retrospective written once, in the evening, about
            where the whole of it went. A moment is an event, logged when it
            happens, involving specific people - and a day holds as many as it
            holds. Folding either into the other is what produced the first two
            wrong versions of this.
          -->
          ${isPrivate ? `<button class="act" data-act="logMoment">${words.logMomentButton}</button>` : ""}
          <button class="act primary" data-act="writeEntry">${words.writeButton}</button>
        </span>
      </div>
    </div>`;

  const coverage = `
    <p class="prep-dropped">
      ${esc(cover.summary)}${
        cover.spread > 0 && cover.thin
          ? words.tooThinNote
          : ""
      }
    </p>`;

  if (entries.length === 0) {
    return `${head}
      ${isPrivate ? await momentsSection(model) : ""}
      <div class="empty">${words.empty}</div>`;
  }

  const fields = Array.isArray(result.fields) ? result.fields : [];

  return `${head}
    ${coverage}
    ${isPrivate ? await momentsSection(model) : ""}
    ${readingSection(cover, model, backlog)}
    ${keptSection(Array.isArray(kept) ? kept : [])}
    ${entries.map((/** @type {any} */ e) => entry(e, fields, isPrivate, model)).join("")}`;
}

/**
 * The moments logged, newest first.
 *
 * On this page rather than only on people's pages, because this is where he comes
 * to write about his life - and because a moment involving three of them has no
 * single page it belongs to. Each one says who it involved; their own pages show
 * the same rows filtered to them.
 *
 * @param {{ available: boolean, why: string | null }} model
 */
async function momentsSection(model) {
  const rows = /** @type {any[]} */ (await tend.invoke("moments"));
  const logged = Array.isArray(rows) ? rows : [];

  if (logged.length === 0) {
    return "";
  }

  return `<div class="group">
    <div class="group-head">
      <span class="group-title">${words.momentsGroup}</span>
      <span class="group-rule"></span>
      <span class="group-meta">${logged.length}</span>
    </div>
    <div class="rows">
      ${logged
        .slice(0, 12)
        .map(
          (/** @type {any} */ m) => `<div class="row static">
            <span class="row-name">${esc(m.part)}</span>
            <span class="row-right">
              <span class="row-meta">${esc((m.who ?? []).join(", "))}</span>
              <span class="pill plain">${esc(m.when)}</span>
            </span>
          </div>`
        )
        .join("")}
    </div>
    ${
      logged.length > 12
        ? `<p class="card-why dim">${words.momentsMore(logged.length - 12)}</p>`
        : ""
    }
    ${patternsBlock(logged, model)}
  </div>`;
}

/**
 * Reading across the moments, offered - or the reason it is not.
 *
 * ## Why this half has this and not themes
 *
 * The work half names patterns in observations ABOUT a person. Over a family that
 * is a character profile of your own child, so this half has no themes at all.
 * This reads the same material from the other end: what the writer did. Every
 * finding has them as its subject, which is what makes pattern-finding safe to
 * have here - and it is the half the whole private mode was built for, because
 * one moment is a note and thirty are the only thing that can show you something.
 *
 * ## The floor is on the button, not in an error
 *
 * Said before it is pressed rather than after. A refusal you could have seen
 * coming should have been a disabled button with the reason on it.
 *
 * @param {any[]} logged
 * @param {{ available: boolean, why: string | null }} model
 */
function patternsBlock(logged, model) {
  const current = resultFor(PATTERN_KEY);
  if (current !== null) {
    return patternsHtml(current);
  }

  const running = isRunning(PATTERN_KEY);

  // The same floors the service enforces. Days rather than moments is the one
  // that earns its keep: three logged in one sitting describe one afternoon
  // however many rows they make.
  const days = new Set(
    logged.map((/** @type {any} */ m) => new Date(Number(m.at ?? 0)).toISOString().slice(0, 10))
  ).size;
  const tooThin = logged.length < 4 || days < 3;

  const why = tooThin
    ? words.patternsTooThin(logged.length, days)
    : model.available
      ? words.patternsReady
      : String(model.why ?? words.patternsNoModel);

  return `<article class="card">
    <div class="card-top"><h2 class="card-title">${words.patternsTitle}</h2></div>
    <p class="card-why">${esc(why)}</p>
    <div class="card-foot">
      <span class="src">${words.patternsNote}</span>
      <button class="act" data-act="readMoments" ${tooThin || !model.available || running ? "disabled" : ""}>
        ${running ? words.patternsReading : words.patternsRead}
      </button>
    </div>
  </article>`;
}

/**
 * What the pass came back with.
 *
 * Marked as a draft the same way every other model answer in the app is, and
 * discarded rather than kept: unlike a journal reading, which reads days that are
 * over and cannot go stale, this is cheap to run again over material that grows
 * every time something happens.
 *
 * @param {any} result
 */
function patternsHtml(result) {
  if (result?.error) {
    return `<article class="card sev-critical">
      <div class="card-top"><h2 class="card-title">${words.patternsFailedTitle}</h2></div>
      <p class="card-why">${esc(String(result.error))}</p>
      <div class="card-foot"><button class="act" data-act="dropMoments">${words.close}</button></div>
    </article>`;
  }

  const recurs = Array.isArray(result?.recurs) ? result.recurs : [];
  const questions = Array.isArray(result?.questions) ? result.questions : [];

  const body =
    recurs.length === 0 && questions.length === 0
      ? `<p class="draft-opening">${esc(
          String(result?.nothingToSay ?? "").trim() ||
            words.patternsNothing
        )}</p>`
      : `${
          recurs
            .map(
              (/** @type {any} */ r) => `<div class="line">
                <span class="line-when">${words.patternsDays(esc(String(r.days)))}</span>
                <span class="line-text"><strong>${esc(String(r.what))}</strong>${
                  r.evidence ? ` - "${esc(String(r.evidence))}"` : ""
                }</span>
              </div>`
            )
            .join("")
        }
        ${
          String(result?.wentWell ?? "").trim() === ""
            ? ""
            : `<p class="draft-note">${esc(String(result.wentWell))}</p>`
        }
        ${
          questions.length === 0
            ? ""
            : `<div class="block"><div class="block-title">${words.toPutToYourself}</div>${questions
                .map((/** @type {string} */ q) => `<div class="line"><span class="line-text">${esc(q)}</span></div>`)
                .join("")}</div>`
        }`;

  return `<article class="card draft">
    <div class="card-top">
      <h2 class="card-title">${words.patternsTitle}</h2>
      <span class="tag">${esc(stamp(result))}</span>
    </div>
    ${body}
    <div class="card-foot">
      <span class="src">${esc(String(result?.coverage?.summary ?? ""))}</span>
      <button class="act" data-act="dropMoments">${words.doneWithIt}</button>
    </div>
  </article>`;
}

/**
 * The pass, offered - or the reason it is not.
 *
 * A disabled button that says nothing reads as broken, so every state here says
 * what would change it: too little written, no model reachable, or ready.
 *
 * @param {any} cover
 * @param {{ available: boolean, why: string | null }} model
 * @param {any} [backlog] The unread signal, when there is one.
 */
function readingSection(cover, model, backlog) {
  const current = resultFor(REVIEW_KEY);
  if (current !== null) {
    return `<div class="group">
      <div class="group-head"><span class="group-title">${words.readingGroup}</span><span class="group-rule"></span></div>
      ${reviewHtml(REVIEW_KEY, current)}
    </div>`;
  }

  const running = isRunning(REVIEW_KEY);
  // The same floor the service enforces, said before the button is pressed
  // rather than as an error afterwards. A refusal you could have seen coming is
  // a refusal that should have been a disabled button with a reason on it.
  const tooThin = Number(cover.entries ?? 0) < 4 || Number(cover.spread ?? 0) < 3;

  const why = tooThin
    ? words.readTooThin
    : model.available
      ? words.readReady
      : String(model.why ?? words.readNoModel);

  return `<div class="group">
    <div class="group-head"><span class="group-title">${words.readingGroup}</span><span class="group-rule"></span></div>
    <article class="card">
      <div class="card-top"><h2 class="card-title">${words.readTitle}</h2></div>
      <p class="card-why">${esc(why)}</p>
      <p class="card-why dim">${words.readWhatItLooksFor}</p>
      <!--
        What has gone unread, when anything has.
        A line on the page you are already standing on rather than a badge in the
        rail: the rail carries no count for this view on purpose, because nothing
        here is late and a number that is always there becomes a reproach. This
        appears only when there is actually a month of material nobody has looked
        at, and says nothing on a quiet month.
      -->
      ${
        backlog === undefined
          ? ""
          : `<div class="mine-row">
               <span class="mine-text">${esc(String(backlog.text))}</span>
               <span class="src">${esc(String(backlog.detail ?? ""))}</span>
             </div>`
      }
      <div class="card-foot">
        <span class="src">${esc(String(cover.summary ?? ""))}</span>
        <button class="act primary" data-act="readJournal" ${tooThin || !model.available || running ? "disabled" : ""}>
          ${running ? words.reading : words.readThem}
        </button>
      </div>
    </article>
  </div>`;
}

/**
 * The readings that were kept.
 *
 * Kept at all - where a brief deliberately is not - because the entries under a
 * reading are about days that are over, so it cannot go stale. And because the
 * second reading is where this feature starts earning anything: a pattern that
 * has survived three months is a different fact from one noticed tonight.
 *
 * @param {any[]} kept
 */
function keptSection(kept) {
  if (kept.length === 0) {
    return "";
  }

  return `<div class="group">
    <div class="group-head">
      <span class="group-title">${words.keptGroup}</span>
      <span class="group-rule"></span>
      <span class="group-meta">${kept.length}</span>
    </div>
    ${kept.map(keptCard).join("")}
  </div>`;
}

/** @param {any} r */
function keptCard(r) {
  const avoidance = Array.isArray(r.avoidance) ? r.avoidance : [];
  const wentInto = Array.isArray(r.wentInto) ? r.wentInto : [];
  const questions = Array.isArray(r.questions) ? r.questions : [];

  /** @param {string} label @param {any[]} items */
  const block = (label, items) =>
    items.length === 0
      ? ""
      : `<div class="prep-block">
          <h3 class="prep-head">${esc(label)}</h3>
          <ul class="draft-list">${items
            .map(
              (/** @type {any} */ i) =>
                `<li>${esc(i.what)} <span class="pill plain">${esc(String(i.evenings))}</span>${
                  i.evidence ? `<span class="src">${esc(i.evidence)}</span>` : ""
                }</li>`
            )
            .join("")}</ul>
        </div>`;

  return `<article class="card">
    <div class="card-top">
      <h2 class="card-title">${esc(new Date(r.at).toLocaleDateString("sv-SE"))}</h2>
      <!--
        The coverage is on the card rather than in a footnote, and it is the
        coverage as it WAS - recomputing it later would answer for a window that
        has since moved, which is how a reading built on six evenings ends up
        looking like one built on twenty-six.
      -->
      <span class="badge">${words.keptCoverage(esc(String(r.entries)), esc(String(r.spread)))}</span>
    </div>
    ${block(words.keptAvoided, avoidance)}
    ${block(words.keptWentInto, wentInto)}
    ${r.saidVsDid ? `<div class="prep-block">
      <h3 class="prep-head">${words.keptSaidVsDid}</h3>
      <p class="prep-note">${esc(r.saidVsDid)}</p>
    </div>` : ""}
    ${questions.length ? `<div class="prep-block">
      <h3 class="prep-head">${words.keptQuestions}</h3>
      <ul class="draft-list">${questions.map((/** @type {string} */ q) => `<li>${esc(q)}</li>`).join("")}</ul>
    </div>` : ""}
    <div class="card-foot">
      <span class="src">${words.keptFoot(
        esc(String(r.days)),
        r.source ? words.keptReadBy(esc(String(r.source).replace(/^model:/, ""))) : ""
      )}</span>
      <span class="foot-actions">
        <button class="act danger" data-act="dropReview" data-id="${esc(r.id)}"
          data-day="${esc(new Date(r.at).toLocaleDateString("sv-SE"))}">${words.remove}</button>
      </span>
    </div>
  </article>`;
}

/**
 * One day.
 *
 * A box left empty is absent rather than shown with a dash. Four labels with
 * nothing under three of them reads as a form you failed to fill in, when in
 * fact one filled box is a complete entry.
 *
 * @param {any} e
 * @param {{ name: string, label: string }[]} fields
 * @param {boolean} isPrivate
 * @param {{ available: boolean, why: string | null }} model
 */
function entry(e, fields, isPrivate = false, model = { available: false, why: null }) {
  const lines = fields
    .filter((f) => String(e[f.name] ?? "") !== "")
    .map(
      (f) => `<div class="prep-block">
        <h3 class="prep-head">${esc(f.label)}</h3>
        <p class="prep-note">${esc(e[f.name])}</p>
      </div>`
    )
    .join("");

  /*
   * Marked as an entry rather than left as one card among several.
   *
   * The page grew a reading card above the entries, and two checks that had said
   * "the first card is an entry" started answering about the wrong element -
   * still passing on one of them, which is the worse half. A card that says what
   * it is costs nothing and removes a class of test that quietly measures the
   * layout instead of the thing.
   */
  return `<article class="card" data-entry="${esc(String(e.at))}">
    <div class="card-top">
      <h2 class="card-title">${esc(new Date(e.at).toLocaleDateString("sv-SE"))}</h2>
      <span class="badge">${esc(e.when)}</span>
    </div>
    ${lines}
    ${isPrivate ? ownPartBlock(e, model) : ""}
    <div class="card-foot">
      <span class="src">${words.entryFoot}</span>
      <span class="foot-actions">
        ${
          isPrivate && model.available
            ? `<button class="act" data-act="readBack" data-at="${esc(String(e.at))}">${words.readBackButton}</button>`
            : ""
        }
        <button class="act" data-act="writeEntry" data-at="${esc(String(e.at))}">${words.edit}</button>
        <button class="act danger" data-act="dropEntry" data-id="${esc(e.id)}" data-day="${esc(new Date(e.at).toLocaleDateString("sv-SE"))}">${words.remove}</button>
      </span>
    </div>
  </article>`;
}

/**
 * The own-part check for one day, once it has been asked for.
 *
 * Keyed per entry rather than one at a time, so reading two evenings back does
 * not throw the first away - and so the result sits under the entry it is about
 * instead of somewhere the reader has to match it up by hand.
 *
 * @param {any} e
 * @param {{ available: boolean, why: string | null }} model
 */
function ownPartBlock(e, model) {
  const key = ownPartKey(e.at);
  if (isRunning(key)) {
    return `<p class="src">${words.readingBack}</p>`;
  }
  const result = resultFor(key);
  if (result === null) {
    return model.available
      ? ""
      : `<p class="src">${esc(String(model.why ?? words.ownPartNoModel))}</p>`;
  }
  return ownPartHtml(key, result);
}

/** @param {number | string} at */
function ownPartKey(at) {
  return `ownpart:${at}`;
}

export const actions = {
  ...modelActions(),

  readJournal: () => run(REVIEW_KEY, "reviewJournal", {}),

  readMoments: () => run(PATTERN_KEY, "readOwnPatterns", {}),
  dropMoments: () => {
    discard(PATTERN_KEY);
    refresh();
  },

  /**
   * One thing that happened, whoever it involved.
   *
   * Reachable from this page rather than only from a person, because most of what
   * is worth writing down involves more than one of them - and a version that
   * asked per person meant writing the same sentence three times, which is the
   * kind of cost that stops a thing being written at all.
   *
   * One collapsed list rather than a checkbox per person: seven rows pushed the
   * two fields that matter off the bottom of the dialog. `data-person` pre-ticks
   * one when this is opened from somebody's own page.
   *
   * @param {Record<string, string>} d
   */
  logMoment: async (d) => {
    const roster = /** @type {any[]} */ (await tend.invoke("people"));
    const people = Array.isArray(roster) ? roster : [];
    if (people.length === 0) {
      toast(words.momentNoRoster, "bad");
      return;
    }

    const values = await form({
      title: words.momentTitle,
      intro: words.momentIntro,
      fields: [
        {
          name: "what",
          label: words.momentWhatLabel,
          type: /** @type {const} */ ("textarea"),
          hint: words.momentWhatHint
        },
        {
          name: "part",
          label: words.momentPartLabel,
          type: /** @type {const} */ ("textarea"),
          required: true,
          hint: words.momentPartHint
        },
        {
          name: "who",
          label: words.momentWhoLabel,
          type: /** @type {const} */ ("multiselect"),
          required: true,
          options: people.map((/** @type {any} */ person) => ({
            value: String(person.id),
            label: String(person.name)
          })),
          value: d.person ? [String(d.person)] : [],
          hint: words.momentWhoHint
        },
        {
          name: "at",
          label: words.momentWhenLabel,
          type: /** @type {const} */ ("date"),
          value: asDateInput(Date.now())
        }
      ],
      confirm: words.momentConfirm
    });
    if (!values) {
      return;
    }

    const chosen = Array.isArray(values.who) ? values.who : [];

    if (chosen.length === 0) {
      toast(words.momentNobody, "bad");
      return;
    }

    if (
      await act(
        "logMoment",
        { what: values.what, part: values.part, at: values.at, people: chosen },
        words.keptToast
      )
    ) {
      refresh();
    }
  },

  /**
   * Read one entry back against the rule.
   *
   * The whole entry is sent, not one box, because the rule is about what the
   * writing claims rather than about any single field - and "what took the day"
   * is exactly where a sentence about somebody else's state ends up.
   *
   * @param {Record<string, string>} d
   */
  readBack: async (d) => {
    const journal = await tend.invoke("journal");
    const at = Number(d.at);
    const found = (journal?.entries ?? []).find((/** @type {any} */ e) => Number(e.at) === at);
    if (!found) {
      return;
    }
    const fields = Array.isArray(journal?.fields) ? journal.fields : [];
    const text = fields
      .map((/** @type {any} */ f) => (found[f.name] ? `${f.label}: ${found[f.name]}` : ""))
      .filter((/** @type {string} */ line) => line !== "")
      .join("\n");
    await run(ownPartKey(at), "checkOwnPart", { text });
  },

  /** @param {Record<string, string>} d */
  keepReview: async (d) => {
    const review = resultFor(d.key);
    if (review === null) {
      return;
    }
    if (await act("keepReview", { review }, words.keptToast)) {
      // Cleared so the page does not show the same reading twice, once as a
      // draft and once as a kept card - which reads as two readings.
      modelActions().discardDraft({ key: d.key });
    }
  },

  /** @param {Record<string, string>} d */
  dropReview: async (d) => {
    if (await act("removeRow", { collection: "reviews", id: d.id }, words.removedToast)) {
      refresh();
    }
  },

  /**
   * Writing the day.
   *
   * No people here, deliberately. A checkbox per person was added and taken out
   * again: this is a whole-day retrospective, so ticking four names put one day's
   * text - which may not be about any of them - onto four people's pages. What
   * belongs to a person is a moment, and it lives on their page.
   *
   * @param {Record<string, string>} d
   */
  writeEntry: async (d) => {
    const result = await tend.invoke("journal");
    const at = d.at === undefined ? Date.now() : Number(d.at);
    const day = new Date(at).toISOString().slice(0, 10);
    const existing = (result?.entries ?? []).find(
      (/** @type {any} */ e) => new Date(e.at).toISOString().slice(0, 10) === day
    );
    const fields = Array.isArray(result?.fields) ? result.fields : [];

    const values = await form({
      title: existing ? words.writeEditTitle(new Date(at).toLocaleDateString("sv-SE")) : words.writeTitle,
      intro: words.writeIntro,
      fields: [
        ...fields.map((/** @type {any} */ f) => ({
          name: f.name,
          label: f.label,
          type: /** @type {const} */ ("textarea"),
          value: existing?.[f.name] ?? "",
          hint: f.hint
        })),
        { name: "at", label: words.writeWhichDay, type: /** @type {const} */ ("date"), value: asDateInput(at) }
      ],
      confirm: words.writeConfirm
    });
    if (!values) {
      return;
    }
    if (await act("logEntry", values, words.keptToast)) {
      refresh();
    }
  },

  /** @param {Record<string, string>} d */
  dropEntry: async (d) => {
    if (await act("removeRow", { collection: "entries", id: d.id }, words.removedToast)) {
      refresh();
    }
  }
};
