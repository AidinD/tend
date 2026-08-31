# Decisions

Newest first. Each entry: the date, what was decided, what else was considered,
and why this won.

## 2026-08-31 - The way back from one press is one press

**Decided.** A run of the bulk archive is recorded as a row in `bulkArchives`,
holding the ids it changed. Settings offers a single Undo for the most recent
run that has not been undone, and undoing puts back only that run's rows, only
the ones still archived. The run is marked `undoneAt` rather than removed.

**Why the asymmetry was the real problem.** Archiving a whole roster was one
button; putting it back was thirty separate decisions with the app saying nothing
in between. Worse, the confirmation offered "each one can be brought back on its
own" as reassurance, when that sentence was also the limitation. A control that
is easy in one direction and laborious in the other is not reversible in any
sense a person cares about, and the moment somebody reaches for undo is precisely
the moment they have just done something they did not mean to.

**Why a recorded run rather than matching the timestamp.** One bulk run does
stamp every row with the same instant, so an undo could have looked for that
number. But the shared instant is a coincidence of how the loop is written, not a
promise: a per-item archive in the same millisecond would be swept up by it. The
explicit list is what makes undo mean "put back what that press changed" instead
of "unarchive whatever shares a number".

**Rejected: unarchive everything.** It reads as the same feature and is a
different one. A row archived deliberately last month has nothing to do with the
press being undone, and dragging it back is a decision nobody made. Undo is
scoped to one run and skips rows already brought back by hand - which is also why
the offer counts what is *still* archived rather than what it changed at the
time, since promising to restore something that needs no restoring is a lie about
what the button does.

**Rejected: recording every press.** A press that changes nothing - the
accidental double-press - records no run. Otherwise the empty second press would
become "the most recent run", and undo would restore nothing while appearing to
work, at the exact moment somebody is reaching for it.

## 2026-08-31 - A habit may not stop the page being quiet

**Decided.** A signal in `myattention.js` may carry `habit: true`, and Now
excludes those from the check that decides whether it can say "nothing needs
you". The reminder is still printed, at the bottom, under that sentence.

**Why.** Every other signal there points at something that already exists and is
going unread. The reflection reminder points at something that has *not* been
written, and a week nobody reflected on has let nobody down. Counting it changed
the daily page's headline for as long as it stood, which is far louder than the
"quietly, at the bottom, easy to ignore" it was designed as, and it quietly
redefined "needs you" to include a routine.

**Why a flag rather than a check on the key.** A view testing for
`"i-have-not-reflected"` would be correct today and silently wrong for the next
reminder of this kind. Declaring the sort makes the next author say which it is.

**And the flag may not become a way of hiding it.** The quiet branch used to
return early without printing signals at all, so filtering alone would have
deleted the reminder from the very page it belongs on. Both branches now render
the same block.

## 2026-08-31 - An empty list is not the same fact as a failed read

**Decided.** `readFailed`/`readFailedHtml` in `ui.js`, and the views ask which
they have before rendering an absence. An empty roster with archived rows behind
it says so, rather than showing the first-run instructions.

**Why.** Every operation that throws comes back as `{ error }`, and the views
were collapsing that into an empty array. On this data the wrong answer is
alarming rather than merely wrong: a page that says "nobody here yet" because a
read failed is telling somebody their whole record is gone. The bulk archive made
it worse in two ways - the archived group can be the page's only content, and a
roster where everybody is archived is not a new install, though Now's first-run
branch was reporting it as one.

**Also a crash, not just a wrong word.** `(projects ?? [])` does not survive a
failed read: `{ error }` is truthy, so the default never applies and `.map` is
undefined. The Work view threw rather than saying anything.

**Why not one shared empty-state component.** The distinction is the point, and
each view knows something the helper cannot: what was being read, and what the
absence would otherwise be mistaken for. `prep.js` already drew this line for the
Jot board - "'Nothing is open' and 'I could not find the board' are different
facts" - and this is the same line for the window.

## 2026-08-30 - Archive is a date on a row, not a delete

**Decided.** People, projects and workstreams carry `archivedAt`, a plain
timestamp. Every view that looks forward - the roster, Now, prep, attention
nudges, duty cadences, the Work lists - reads it and skips the row. Nothing else
changes shape: the append-only log is untouched, no historical row is mutated,
and no row is removed. Unarchiving clears the timestamp and the row comes back
where it was.

**Why a whole mechanism for something a delete would have covered.** The store's
one design principle is that nothing is destroyed, and this is the exact case
that tests it. When a piece of work ends or a responsibility moves on, the
forward-looking half of the app is wrong until the rows stop counting - but the
backward-looking half is the part worth keeping, and it is at its most valuable
precisely then. A clear-everything button would have been three lines and would
have thrown away the year of record that made the app worth opening.

**The invariant is "every forward-looking read", and three of them were missed.**
The filtering went in where the forward-looking work is concentrated -
`expandCadences`, `buildAttention`, the default listings, `prep` - which left out
the three read paths that go through none of them: the waiting list, the daily
page's slice of it, and the open-promise list. They join against people by id and
never carry the person row, so there was nothing on hand to ask `isArchived`
about. The result was the loudest possible version of the bug: after archiving
everything, the daily page still named people off the roster and would not say
"nothing needs you", and the material handed to the model carried a critical
promise owed to somebody the same payload's roster said did not exist. The lesson
is about the shape rather than the three functions - a claim of the form "every
view does X" is only worth the enumeration behind it, so the guard is now a
shared `archivedPersonIds` helper and the tests assert the invariant BETWEEN the
roster and what is reported as owed, not on either list alone.

**A name stays taken while its row is archived.** Ctrl+K refuses an ambiguous
match rather than guessing, so two rows sharing one name makes both unreachable
whether or not one of them is archived - which means the refusal is right and
only the wording was wrong. It said "already here" about a row on no list, and
offered a remedy that cannot touch an archived row. It now says the row is
archived and names the way out. The cost is real and accepted: a genuinely
different person who happens to share an archived name has to be entered under
something that tells the two apart.

**Why a date rather than a flag.** The same reason `awayUntil` and `leftAt` are
dates: it says when, and "when" is the question anyone asks about an archived
row six months later. A boolean answers "is it archived" and nothing else, and
the answer is dated anyway in the log, so the flag would only be a worse copy of
something already recorded.

**Rejected: folding this into `leftAt` or `_deleted`.** Both were already there
and neither fits. `leftAt` is a period with a return baked into the cadence
maths - `notBefore` restarts the clock - so a row is expected back and the
absence is temporary by construction. `_deleted` has no restore path at all and
leaves a row unresolvable by id, which breaks every historical reference that
points at it. Archiving had to be simpler than the first, because there is
nothing to compute and no clock to restart, and more reversible than the second,
because the whole point is that the record stays addressable. Sharing an
implementation with either would have meant one of them growing a mode flag, and
a mode flag on a mechanism this load-bearing is how the next reader gets it
wrong.

**Rejected: hiding archived rows completely.** An archived row that cannot be
found again is a delete with a longer name. Each list keeps a closed-by-default
archived group, and an archived person's page still resolves with their full
history - it is reachable, just not asked about.

**The bulk trigger is the same function in a loop.** One call archives everything
currently active, reusing the per-item function rather than taking a shortcut
through the store, so there is no second code path that could archive things
differently from the buttons. It confirms first, and the confirmation says
plainly that nothing is deleted and that each row can be brought back on its own.

## 2026-08-30 - Opening a direction asks one question, not six

**The form asked for more than the system ever required.** The service layer
has only ever required `aim` to open a growth thread; driver, whose need it is,
what happens if nothing changes, what has already been seen, and what is being
put in were all optional there from the start. The open dialog asked for all of
them anyway, up front, before the thread even existed.

**Two mechanisms already existed to carry the rest, so the form did not need
to.** `missing()` already turns an unanswered question into a "still to
prepare" line on the thread's own card, and the "Prepare" dialog already
reopens the exact same fields, pre-filled, at any later time. Asking six
questions before a thread can be created duplicated work the tool already did
elsewhere, and asked it at the one moment - before any conversation has
happened - when most of the answers are least likely to be known.

**So opening now asks one sentence: what the direction looks like before you
have asked.** Everything else waits for "Prepare" on the card, whenever there
is an actual answer rather than a guess filled in to get past a required
field. The alternative - keeping all six fields but making only one required -
was rejected because an optional field on a form still reads as a question
the tool expects an answer to right now.

## 2026-08-30 - A weekly reflection is three fixed questions, not a diary field

**Decided.** A new `reflections` collection holds one flat row per entry -
`wellDone`, `differently`, an optional `notes`, nothing else. No status, no
lifecycle, no severity. `logReflection` requires at least one of the two
primary questions to carry something; `notes` alone is refused, because
notes is secondary to the two questions the feature exists to ask, not a way
around them.

**Why not a diary.** The same reasoning `growth.js` already gives for why it
is not a development plan, one size down: an open textarea invites a
paragraph, the paragraph invites another one next week, and a few months in
it is a diary - which is exactly the document this app keeps refusing to
become, because a document written once and revisited only by scrolling back
through it is not a tool. Two or three fixed questions in fixed boxes instead
of one blank box, so the shape of the answer is decided once, in code, and
not re-invented every week under whatever mood produced that week's box.

**Why not the day, and not a moment.** `journal.js`'s day entry is nightly,
never prompted, and about everywhere the day went. A moment names other
people and is about one event. A reflection names nobody, is gently
prompted rather than nightly, and asks a narrower question over a longer,
looser stretch of time - not "where did the day go" but "how did it go, and
what would you do differently". Three different subjects, three different
cadences, three separate places to keep them rather than one field trying to
serve all three.

**Why the nudge lives where attention signals already live.** The soft "it
has been a while, want to reflect" reminder is a new signal in
`src/domain/myattention.js`, alongside the signals decided on 2026-08-24 in
"Attention signals measure me, and the line is in the code". That entry's
line is exactly the one this feature needs: something genuinely about the
owner rather than a colleague belongs in the file that only ever
measures them, not in `attention.js`'s severity machinery that ranks what is
late for somebody else. The signal has no severity field, the same
mechanical guarantee the rest of that file relies on rather than a comment
promising restraint, so it can never reach a "Now" list or a critical nudge
- it can only ever show up quietly, at the bottom, easy to ignore, exactly
like the three signals already there.

**Why no MCP tool.** `entries` and `moments` - the two existing collections
that are self-directed and name no other person - have no MCP surface at
all, not even read-only, and a reflection is the same shape, arguably more
private since it is explicitly about the owner's own performance. Nothing
the job-running surface needs from an agent requires reading or writing it,
so it stays out of `tend_*` entirely rather than gaining a tool nobody asked
for.

## 2026-08-26 - A form asks each question once, and only where it applies

**Found by reading it.** The first version of the growth form asked "The
direction, in one sentence" at the top and "What do you think the direction is?"
four fields below, and displayed "Whose need is it?" under an answer of "I do not
know yet". The first person to open it could not tell whether the top field
wanted his own description or the other person's answer - which is exactly the
distinction the two sittings exist to keep clear, undone by the form that
implements them.

**The duplicate was a real modelling mistake, not a wording slip.** Before the
conversation the aim IS his guess. The two only become different things
afterwards, when the aim gets reworded to what they agreed while the guess stays
as what he thought first. So opening now asks once, labelled as his own view and
saying out loud that their answer comes later and is kept beside it rather than
replacing it. That one sentence is stored as both `aim` and `hypothesis`, and the
reopened form shows the pair, so rewording the aim cannot lose the guess.

The person's page leaves the guess out while it is still word for word the aim.
Printing the same sentence under two labels reads as the tool having lost track
of which is which.

**Conditional fields, in the form helper rather than in one form.** A field can
carry `showIf: { field, equals }` and is hidden until that answer is chosen. The
alternative was a hint saying "only if the job needs it", which is what was there
and which nobody reads before being confused by the question above it.

Two details that are the whole reason this lives in the shared helper: a hidden
field is submitted as EMPTY rather than skipped, because skipping means "leave
what was there" and would silently keep a need typed under an answer he has since
changed; and a `required` field that is not being asked cannot block the form.

**The test had to be rewritten too, and it is the interesting part.** The obvious
check reads the dialog's text for the question. That proves nothing: `textContent`
carries hidden elements as well, so it passes whatever the form actually shows.
The check now reads the field's own `hidden` state, before and after choosing the
answer it belongs to. This is the second check in this feature that started out
unable to fail - the first matched a `data-act` attribute against `textContent`,
where an attribute never appears at all.

## 2026-08-26 - A development plan is a direction with two clocks, not a document

**Decided.** A growth thread is one direction per person: an aim, the observable
marker that would prove it, a cadence for when it should come up, and a horizon
after which the direction itself gets questioned rather than followed. The prose
stays in the notebook, the actions stay as promises, measured competence stays on
a workstream's delegation level. `src/domain/growth.js` holds the readings,
`src/renderer/views/growth.js` the two surfaces.

**What it is not.** A written development plan almost never fails because the
plan was wrong. It fails because it was written once, felt good, and was never
looked at again - so storing the document would have been storing the failure
mode. Nothing here holds a plan.

**Most of it already existed.** Worth writing down, because the temptation on a
feature like this is to build a parallel world. The things he said he would do
are promises, which already escalate hard and cannot be dampened by a focus, so
all of a plan's urgency lives there and nothing in this feature ever has to reach
Now. What to raise next time is a topic. Competence on a piece of work is a
delegation level, and moving one from close follow-up to fully theirs IS growth,
observed and already tracked - for some people that is the entire plan with no
thread needed. What none of them held is a direction that persists across the
rest, and whether it is moving.

**Two clocks, and the second one is the whole point.** Attention drift is
familiar: we have not talked about this in a while. Progress drift is not:
discussed three times with the marker never once observed. That is a wrong plan
or missing support, not a late task, and it is invisible to every tool that
counts whether conversations happened. So a note carries `observed` as a separate
answer from having been logged at all, and the gap between the two counts
produces the reading. It surfaces as a question - is the aim wrong, or is the
support missing - because a nag would be answering something the data cannot.

**Never in Now, and a licence to reach Prep instead.** Nobody is let down today
because a direction stood still for a month; the person let down by a broken
promise is let down today. A Now page that talks about development is a page that
gets skimmed, which would cost far more than this gains. But a thread whose
person never drifts would then surface nowhere at all, so a thread that is asking
something can put somebody on the prep page on its own - the same licence topics
already have, and the same argument: the moment before the conversation is the
only moment the answer is actionable.

**Not in "My month" either**, which was the tempting home. Every signal there has
a first-person subject, enforced by a test, and that constraint is what keeps the
feature from becoming surveillance. A question about a thread is not about him.

**Wants it, needs it, or unknown - asked first.** Two different instruments.
Using the development one on a performance gap produces a plan the person reads
as a disciplinary process with a smile, and loses both the trust and the
improvement. `unknown` is a first-class answer rather than a missing one: not
knowing is the normal state before the first conversation, and pretending
otherwise is how a manager ends up writing somebody else's ambitions for them.
The `needs` branch has to answer what happens if nothing changes, because if the
honest answer is nothing then it is a wish, and that is worth finding out before
the conversation rather than after.

**The form is two sittings, and the split is enforced rather than suggested.**
Stage one is his own preparation and never asks what the other person wants;
stage two is what the conversation returned, in their words, and does not clear
the guess. Collapsing them into one screen is how the plan gets written alone at
a desk. Keeping the guess beside what they said is how a manager finds out they
have been managing an assumption.

**A declined direction is a path, not an edge case.** Recording it asks the
follow-up immediately: does the job require it anyway? If it does, the thread
becomes a stated expectation, written as it will be said out loud, including what
follows if it is not met - and "you stay where you are" is a legitimate thing for
that to be. If it does not, it is let go with a reason.

**An ending needs its reason, and `endingSaid` defaults to false.** The most
important default in the feature. Letting a direction go is often the right call;
letting it go without telling the person is the worst of the three options,
because the disappointment stays readable in the room while the decision never
gets said. So the thread keeps asking until he confirms he said it, and the
reason stays visible afterwards - a dropped thread with no reason turns into a
mood six months later that neither of them can name.

**Rejected: a limit on how many threads can be live.** Two is about what anybody
can hold, and the app says so once he passes it. Enforcing it would be software
deciding how many people he is allowed to develop at once.

**Rejected: opening or ending a thread over MCP.** Reading one and logging that
it came up are available; the rest is not. Deciding what somebody should be
growing towards is his call, made in the window - the same line duties draw.

## 2026-08-25 - The app harness only ever drives the app it started

**Decided.** `scripts/e2e-app.mjs` refuses to begin when something is already
listening on the debugging port, naming the PID and the executable holding it,
and once attached it asks the app for its data directory and stops unless the
answer is the scratch folder this run just made. `--port=N` moves the port. The
pure half of both gates is in `scripts/e2e-port.mjs`, tested in
`test/harness.test.mjs`.

**The failure it removes.** A previous run had left an Electron alive on 9411, so
a fresh run attached to that old instance and reported four failures: main never
reported the scratch dir, the first-run view was already People, and then nothing
matched `[data-act=seed]`. Not one of them had anything to do with the code.
Killing the stale process made the same run pass 83 of 83.

**Both gates, not one.** The port check alone would have caught this, and it is
the one that produces the good message - it fires before Electron starts, so a
refused run leaves no scratch folders and no half a run's worth of wrong
assertions. But it can only say the port was free when it looked, and a release
gate should not rest on that. The identity check is the unconditional half: this
run made its scratch directory with `mkdtemp` seconds earlier, so no other
instance on the machine can name it, and the check needs no process-inspection
tooling to hold.

**The data directory is the proof, not the PID.** Comparing the CDP target's
owner against the spawned PID was the obvious version and it is worse: the owning
process is the spawned one on Windows but a descendant under the `.bin/electron`
shim elsewhere, so it needs a parent-chain walk, per-platform tools, and a
degraded path when they are missing. The app already reports `dataDir` through
`status`, over the same bridge the walkthrough uses for everything else.

**It refuses, it never kills.** The process holding the port is by definition one
the harness did not start, and a broad kill here has already closed somebody's
work once - a filter on a command-line flag rather than a path stopped 19
processes at once, because Chromium passes its flags to every child. So the
lookup reports and nothing more; a test asserts there is no `Stop-Process` in it.
The only process this harness may stop is still the one it spawned, by that PID.

**A fixed default port, not a random one.** A per-run port would have dodged the
collision without anyone noticing the stale process, and `--keep` exists so a
person can attach real DevTools to the window it leaves - telling them to read
the port out of a log first is worse than telling them the number. Instead
`--keep` now prints that it is holding the port and how to stop it, which is
where this went wrong in the first place.

**A dead Electron is reported as dead.** The attach loop gives up the moment the
process it spawned exits, rather than polling out fifteen seconds and calling it
"the renderer never appeared". An Electron that cannot bind the port exits almost
immediately, and that is the failure this change makes more likely to be seen.


## 2026-08-25 - The walkthrough waits for a settled window, it does not sleep

**Decided.** The maximise check in `scripts/e2e-app.mjs` polls `outerWidth`
until it holds the same value across three reads eighty milliseconds apart *and*
satisfies what the click should have done, with a six second timeout that fails
with the whole trace. The two fixed 400ms sleeps are gone.

**The failure it removes.** The check failed once with "width went 1180 -> 160",
then passed on an immediate re-run with nothing changed in between. 160 is
neither a maximised width nor a restored one: the renderer was reading the frame
while the window manager was still moving it.

**Not a longer sleep.** That was the obvious fix and it is the wrong one - it
makes the race rarer rather than removing it, and this harness is the thing that
is supposed to catch races. A flaky check here is worse than a missing one,
because `npm run test:app` is the evidence gate before every release: a check
that cries wolf teaches everybody to re-run until green, which is exactly how a
real failure gets waved through.

**The wait is conditional, not just settled.** Waiting for stillness alone would
pass a click that never reached the main process, because a window nobody touched
is perfectly still. Each wait carries what it expects - larger than before it,
then back to exactly what it was - so the timeout is what a dead click looks
like, and the message says which of the two it was.

**The widths are printed on a passing run** as a `--` note. This check is
entirely about timing, so the log should show the margin getting thinner before
the check starts failing.


## 2026-08-25 - A binding follows its folder, by id

**Decided.** A binding to a Nib sub-folder is resolved by `subId` alone, wherever
that folder now sits. The stored `categoryId` is corrected on the next index
rather than being part of the lookup. A binding to a whole category still matches
on `categoryId`, because there is nothing more specific to match on.

**The failure it removes.** Dragging a person's folder to another category in Nib
takes its id with it, so the sub id stayed right and the category id went stale.
The lookup needed both, found nothing, and reported "no notes" - which reads
exactly like a person you have not written about yet. Alve moved from Team to Org
and stopped being indexed, and nothing anywhere said so. This is the app's own
worst failure mode: not a wrong answer, a missing one.

**An id, not a path, and only one id.** The sub id is minted once and never
changes. Keeping the category id in the lookup was belt and braces where the belt
was the thing breaking - a second identifier that can only ever disagree with the
first.

**A folder that is nowhere is reported as gone, not as empty.** Different words
for different things: one is a mistake to fix, the other is a person you have not
written about. The old message could not tell them apart.

**`bindSource` matches on the sub id too**, so a moved folder cannot be bound a
second time. Comparing both ids would have let one set of notes count twice.


## 2026-08-25 - A tag taken off a note withdraws its contact

**Decided.** `indexNib` now retracts a derived contact whose tag is gone. A note
tagged 1-1 by mistake, indexed, then corrected to Casual leaves one contact -
casual - not two.

**What it looked like before.** Both rows survived, and the stale `one-to-one`
went on satisfying the fortnightly cadence for ever. Found in real data: a note
renamed from "2026-08-24 1-1" to "2026-08-24 Resignation" and re-tagged had left
`nib:<id>:one-to-one` behind, and Rasmus's 1-1 read "today, on time" on the
strength of a note that no longer claimed to be a 1-1. After the fix the same
cadence reads "12 days ago", which is the truth.

**This is the direction that matters.** A contact that should not be there
suppresses a nudge, and a nudge that never appears cannot be noticed - the rule
everywhere else in this app is to flag in doubt and never suppress. A wrong tag
was quietly worse than no tag at all, which is the opposite of what a correction
should cost.

**Only rows this indexer wrote.** A contact logged by hand is somebody's own
record of a conversation, and Nib does not get to withdraw it: the sweep is
limited to `from: "nib"` rows whose id starts `nib:`.

**Scoped to the notes read on this pass, deliberately.** The dangerous version of
this fix reconciles a whole folder, and then an empty read - Nib closed mid-sync,
or the wrong data directory - deletes every contact in it as though none of those
conversations happened. A folder that comes back empty retracts nothing. There is
a test for exactly that.


## 2026-08-24 - The mark is a picture, and 16px is dense on purpose

**Decided.** Tend's mark is an open hand with a flame rising out of it, supplied
as artwork at `src/renderer/assets/tend-logo.png`. The generator only resamples
it into the .ico ladder. The same file is the header mark, so there is one
picture rather than two drawings that can drift.

**What it replaces.** Four tally strokes inside a rounded square. The square was
the error: every other app in the suite is one object on nothing, and a
container made this the only one wearing a frame.

**Geometry was tried first and failed, which is worth recording because it will
be tempting to try again.** Around forty drawings, all as distance fields. Every
one hit the same wall: a solid shape sitting inside a curved one reads as an
object in a vessel - a cupcake, an ice cream, a cake, a hat - and a hand drawn
well enough to escape that becomes a comb below 24px. The rule underneath it is
that at icon size only ONE object survives, which is exactly why the family's
marks are single objects. What the geometry could produce was a *gesture*
suggesting a hand, and a gesture was not the mark that was wanted.

**The trade is permanent and was accepted knowingly.** The hand has fingers and
the flame has a counter inside it, and below about 32px those close up. A mark
held as geometry can drop its own detail for the small frames - Nib drops its
vent hole, Jot widens its ring's gap - and a bitmap cannot. So 16px stays dense.
Helm made the same trade for its wheel and its generator says so too.

**What the pipeline still fixes.** Pointing `build.win.icon` at a 512px PNG lets
Windows scale one bitmap to whatever it needs. Each frame is instead resampled
from the source at its own size, always from the source rather than from an
already-shrunk frame, and the ladder carries 20 and 24 - the sizes the taskbar
asks for at 125% and 150% display scaling.

**The artwork arrived as a JPEG on a drawn checkerboard**, so its alpha had to
be recovered rather than kept. The mark is one flat colour on a neutral ground,
which makes that exact instead of a guess: red minus blue is zero on any grey
pixel and its full spread wherever the mark is opaque, so the ratio is the
coverage, anti-aliased edges included.

## 2026-08-24 - Ctrl+K captures before it navigates, and refuses before it guesses

**Decided.** Capture, commands, questions, in that order. `Nina: look at the
render pass` logs a promise with no dialog and no view change.

**Why capture is first.** The time this saves is the four seconds between
somebody saying "can you look at the render pass" and the moment you have moved
on. Every one of those seconds spent navigating is a promise that does not get
written down, so the fastest path in the app is the one that records something.

**Only an explicit colon counts as addressing somebody.** Taking the first word
of any sentence that begins with a name turns "Nina said the build is slow" into
a promise to Nina - a note about her recorded as a commitment to her. That
mistake is invisible until the day it is read back to the person.

**Two people with the same first name is a refusal, not a coin toss.** The
roster of anyone leading a team is exactly where two people share a name, and
the failure mode is a promise silently attached to the wrong colleague. A full
name typed out still resolves.

**The parsing is in `src/domain/parse.js`, not in the overlay.** Everything else
in the palette is arrangement; this is the part with a consequence, so it lives
where it can be tested without a window. Most of those tests assert a refusal.

**Command matching is substring, not fuzzy.** Fuzzy finds "settings" from
"sett", which is the good case, and also finds half the list on every keystroke,
which makes the arrow keys the only way to use it - slower than the rail it
replaced.

**Questions answer locally or offer a model, never call one on their own.** The
ones Tend can answer from its own data are matched against a short list and
answered instantly. Only what falls through appears as a row that says it will
cost a few seconds, and nothing happens until it is chosen. A palette that
paused on a keystroke would be abandoned in a week.

## 2026-08-24 - The model drafts, and the MCP surface has no model on it

**Decided.** Three model jobs, all in `src/service/model.js`, each behind a
button: a brief before a conversation, one note read for a commitment written in
prose, and what recurs across several notes about one person. Nothing else.

**A brief is not stored.** It is built from the prep card, shown, and thrown
away. Storing one makes a second copy of facts that change daily, which is the
same trap `prep.js` already avoids by showing a note's title rather than its
prose. The discard button is the whole lifecycle.

**Extraction returns candidates and writes nothing.** Nib already models a
flagged block as an action point with a done state, and indexing turns those
into promises with no model at all. The model is only ever the second pass over
the half that was written as ordinary prose and never flagged - so the reliable
path stays deterministic and the uncertain one needs a click. A candidate that
is kept records `source: model:<id>`, because the store's `_by` records which
*process* wrote a row and that is a different question: a suggestion a person
accepted is written by the app and would otherwise be indistinguishable from one
typed out by hand.

**Themes are the only thing a model may write**, and only on a scheduled pass;
the button drafts. Two notes minimum, enforced in code and again after the
answer comes back - one note called a pattern is how a tool starts saying untrue
things about people. Structure - the role map, cadences, relationships, focus -
is never written by a model at any confidence.

**Nothing runs on app open.** `test/model.test.mjs` reads `src/main/index.js`
and fails if a model call appears after `app.whenReady()`. The rule was already
written in three comments, which is exactly the kind of rule that survives until
somebody warms a cache and nobody notices the window now costs money to open.

**The MCP surface deliberately has no model tool on it.** Every caller there
already *is* a model, so a tool that spawned a second one would pay twice for a
worse answer - the nested call sees one note, the caller sees the conversation.
It gets `tend_note_text` and the same guarded write path instead. The window
needs a model layer for the same reason it needs a window: there is no agent in
it.

**Rejected: the Agent SDK.** The earlier entry below said the Agent SDK on
Claude Code's login. What shipped is the `claude` executable itself, spawned per
call - same authentication, same absence of an API key, one fewer dependency,
and it works with the app closed, which a library inside Electron does not. It
lives in `keel/claude` so the next app in the suite does not rediscover that
`--bare` forces API-key auth and that a shell on Windows eats everything in a
prompt after the first space.

**Measured rather than assumed.** A brief costs about 29 cents on the writing
tier and 7 on the cheap one, and the expensive one is better enough to keep for
something read before a real conversation. Running the call from inside a
repository rather than a neutral directory tripled the price of an extraction,
because Claude Code loads the CLAUDE.md files above its working directory - so
keel now defaults to somewhere with no project in it.

## 2026-08-24 - Attention signals measure me, and the line is in the code

**Decided.** `src/domain/myattention.js` derives three patterns from touches: who
I have not spoken to this month, whether my contact is concentrated on a few
people, and who I have only heard about second-hand. Shown at the bottom of Now,
below everything that is actually late.

**The line, and why it is not only in a document.** The obvious version of this
measures the team - review latency, who reviews whom, who is quiet in a retro,
response times. That version is surveillance: it measures people who did not
agree to be measured, using proxies that are wrong, and it turns a tool for
noticing into a tool for evidence-gathering.

It is also easier to build and looks like more value, which is exactly why the
refusal has to be mechanical. **Every signal has a first-person subject, and a
test asserts every signal's text begins that way.** A second test greps the
module for the specific field names the surveillance version would need. A prose
rule in a document does not survive a future session reading "attention signals"
and reaching for the easier thing; a failing test does.

**No model, and this is not frugality.** It is arithmetic on dates. A script is
the same answer every time and cannot hallucinate a neglected colleague who does
not exist - which matters more than usual here, because a false "you are
neglecting Nina" is a thing somebody might act on.

**Quiet on thin data.** Three touches across four people is not a pattern, and
calling it one is how a signal loses its credibility in its first week. Also
silent on a roster of one, where "I have not spoken to 1 of 1 people" is a
tautology rather than a signal.

**Named, not aggregated.** "Your attention is concentrated" is not actionable;
"it all went to these two" is. Naming them is not a judgement about them - the
pattern belongs to me.

## 2026-08-24 - The delegation trail already existed; the mandate did not say who decides

**Found rather than built.** The idea note asked for a delegation trail - what I
gave away, to whom, with what mandate, and when I check in. That is `workstreams`,
which has existed for weeks: owner, level, a review interval derived from the
level, entries in `attention` so an overdue review surfaces in Now, and a
separate flag for a workstream whose level was never stated at all.

Building a second entity for it would have been a parallel reinvention of a
feature already shipped, which is the failure the idea notes themselves warn
about elsewhere.

**What was genuinely missing was one sentence per level.** The levels described
how closely I follow - "theirs to drive, mine to stay close to" - and said
nothing about who *decides*. Those are different axes: somebody can own an
outcome and still be expected to ask before a call that is expensive to undo, and
"you own this" means different things to the person saying it and the person
hearing it. The idea note called that the most common silent misunderstanding
between a manager and a senior, and it was right.

So each level now carries an `authority` line, written in the second person
because it is a sentence you should be able to read to them: "You decide, and
tell me afterwards. I will not be checking first." A level with none says
"nobody has said who decides" rather than "not stated", which names the gap
instead of the missing field.

Considered and rejected: a second axis, authority separate from follow-up
closeness. Two fields per workstream is more bookkeeping than the distinction
earns, and the three existing levels already map onto the three authority
answers cleanly. What was wrong was that the mapping was implicit.

## 2026-08-24 - Ledger: decisions with a date they come back on

**Decided.** A `decisions` collection in Tend, with its own view. What was
decided, why, what was rejected, who was consulted, and when to look at it again.

**The revisit date is the design, not a field.** An archive is where decisions go
to be forgotten politely. What makes this a tool is that it returns: you do not
have to remember to reconsider the staffing call in November, because in November
it appears - in the Now view, beside the cadences, because "nothing needs you"
has to be true and a revisit you set months ago is exactly a thing you asked to
be reminded of.

It also makes deciding cheaper. A decision with a revisit date is not permanent,
and knowing that is what lets you make it today instead of gathering information
you will not use.

**"It still holds" is its own action.** That is the common answer and it has to
cost one click. Without it the honest move is to clear the date, and then the
decision quietly stops coming back at all - which is how a log becomes an
archive without anybody deciding that it should.

**An agent may propose; only the user records.** Same boundary as the role map.
`tend_propose_decision` forces `status: "proposed"` in the tool rather than
trusting a caller-supplied status, because the boundary is the point of the tool
and an argument would be a way around it. There is deliberately no MCP tool that
records or accepts one, and a test asserts those names do not exist. Recording is
what starts the revisit clock, so an agent that could both propose and accept
would be an agent writing the decision log - and there would be no way to tell.

A proposal carries `source`. "This looks like a decision" is only checkable
against the note it was read out of.

**`thin()` advises and never refuses.** A decision recorded with only its text
still beats one nobody wrote down. But the three fields people skip - why, what
was rejected, who was consulted - are the ones that make the record survive being
read in a year by somebody who was not there, so every card says which are
missing rather than only the form at the moment of writing.

**Resolving `consulted` refuses the whole call on one bad name.** Dropping the
unknown one would record "consulted two people" when three were named, and that
is a wrong record nobody will ever notice.

**Not promises, and the distinction is load-bearing.** A promise is given TO a
person; a decision is ABOUT the organisation. They overlap and are not the same,
and `consulted` pointing at people is precisely why this belongs in Tend rather
than in a new app.

**`resolvePerson` moved to `src/service/resolve.js`.** `ledger.js` needs it and
importing `api.js` would have made a cycle. `api.js` re-exports both resolvers,
so nothing that already called them changed.

## 2026-08-24 - Prep reads drift, not a calendar

**Decided.** Prep is a view in Tend: one card per person worth talking to, with
what you promised them, what they own, what is open on the Jot board and the last
note you wrote. Chosen by cadence drift and open promises. No calendar.

**The calendar was the plan and it is not the blocker it looked like.** Two
routes, both real work and neither of them Tend: a secret iCal feed, whose
attendee lines are the one field Prep would need and are unreliable, or a
Calendar API app whose consent screen expires the refresh token every seven days
while it sits in Testing. Both are still open as a *later input* - a different
way of choosing whose cards to show.

**Drift is the better question anyway.** A meeting that is booked will happen
whether or not you prepared. The conversation you are quietly six weeks behind on
is the one that does not happen at all, and Tend already models exactly that.
Building the join first also makes the calendar cheap later: swapping who gets
listed is a small change once the card exists.

**Tend reads Jot now, and that is the new thing here.** `todos.json` is a
documented contract, so there is no API and nothing to keep in sync. Two routes
from a person to a task, and the card says which one found it, because a join
whose reasoning you cannot see is one you stop trusting the first time it is
wrong:

- **owner** - they own a workstream, and a Jot category is named after the
  workstream or its project. The principled route: it goes through a delegation
  somebody actually recorded.
- **named** - their first name appears in the task text, on a word boundary, and
  only when the name is at least three characters. Fragile by construction and
  labelled as such. It catches the case nobody remembered to model.

Matching on the project alone was the first version and it missed the common
shape: the project is a bucket and the workstream is the specific thing, so a
card came back with no open work while the matching category sat right there.

**`openWork` is null and not empty when the board cannot be read.** "Nothing is
open" and "I could not find Jot" are different facts, and a card that renders
them identically lies quietly - the failure mode a missing integration always
has. The view says which sources it could not reach, in the warning colour.

**Six cards, and the cap is the feature.** A list of everyone is the roster, and
`people` is already that. This is meant to be read before a day starts and then
be finished, the same discipline Brief keeps.

**The harness now isolates the Jot board too.** It already pointed
`TEND_DATA_DIR` and `NIB_DATA_DIR` at scratch folders; the moment Tend read Jot,
a test run started reading the real board. Read-only, so nothing could be
corrupted - and still wrong, because the test would depend on whatever is on the
board today.

## 2026-08-23 - Window chrome and the icon pipeline come from keel

**Decided.** Tend depends on `keel` (`file:../keel`) for two things it had its
own copy of: the three title-bar IPC handlers and the icon generator.

**Why Tend went second.** Jot proved the package inside a bundler and a
TypeScript codebase. Tend is the opposite case on both counts - plain DOM, JS
with JSDoc, no build step - and if a shared layer only works in one of those, it
is not a shared layer. Two things came out of doing it that would not have shown
up in Jot:

- **keel has to be a real `dependency` here.** Jot bundles, so its copy is
  inlined at build time and a devDependency is enough. Tend ships `src/**`
  unbuilt, so `import { windowControlsBridge } from "keel/window"` is still an
  import when the app runs, out of an asar archive. It packs correctly - npm
  symlinks a `file:` dependency and electron-builder dereferences it - but that
  is a fact worth having verified rather than assumed, which is why
  `test:app -- --packaged` now clicks the maximise button and checks the window
  actually resized.
- **The renderer's type for the bridge is derived, not written.** `ui.js`
  annotates the preload global, and the window-control half of that annotation is
  `ReturnType<typeof import("keel/window").windowControlsBridge>`. Spelling the
  three functions out again would have recreated, one level out, exactly the
  problem keel's generated declarations exist to prevent.

**The window buttons left `OPERATIONS`.** They were entries in the same
whitelist as `logPromise` and `attention`, which was a category error: window
chrome is not an operation on Tend's data. They also reached for
`BrowserWindow.getFocusedWindow()` - the window that happens to have focus rather
than the one that sent the message. Invisible with one window; wrong the moment
there are two, or when the click arrives from the test harness while focus sits
elsewhere. keel uses `fromWebContents(event.sender)`.

**The icon changed slightly, and deliberately.** The old generator supersampled a
hard in-or-out test 4x4 per pixel; keel's is a distance field, so coverage is
computed rather than sampled. Same geometry, same colours - 1.5% of pixels moved,
all of them on an outline, none inside a flat area, mean delta 0.18/255. It is
marginally crisper and sixteen times less arithmetic. Two helpers went into keel
to make Tend's drawing expressible: `distSegmentAt`, which also returns how far
along a segment the nearest point is (the pen taper needs it), and
`distRoundedRect`, which is signed because a plate is filled rather than stroked.

## 2026-08-23 - The packaged app ships source, not a bundle

**Decided.** electron-builder packs `src/**` directly. No electron-vite, no
`out/`, matching the buildless decision below.

**What it costs.** The packaged app resolves the preload and the renderer from
inside an asar archive, where a path that works in development can fail with
nothing but a blank window and no error in main. So `npm run test:app --
--packaged` exists and runs the whole walkthrough against
`dist/win-unpacked/Tend.exe`. A packaged build is not considered working until
that passes.

**Auto-update** is electron-updater against GitHub releases, checked once at
startup and installed on quit. Skipped entirely when not packaged, where it only
produces a confusing error.

**The upload must go through electron-builder's publisher.** `latest.yml`
references the installer by its dashed name while the file on disk has spaces;
electron-builder renames it on upload. A hand-rolled `gh release create` gives
the asset the spaced name and electron-updater 404s on a release that looks
perfectly published. Nib learned this one first.

**Only this build's processes are stopped before clearing `dist/`**, matched on
executable path. Killing Electron by name would close whichever other Electron
app happens to be open, which has bitten the sibling apps before.

## 2026-08-23 - Nib folders are bound to people in Tend, not by convention

**Decided.** The user binds a
Nib category or sub-category to a person inside Tend, and the binding says what
kind of contact notes there count as. One person can have several.

**Considered and rejected:** a naming convention in Nib (a sub-category per
person under a "1-1" category), or matching a person's name in note titles. The
convention means remembering a rule while writing, and locks the structure;
name matching is guessing, and a mismatch hangs a promise on the wrong
colleague.

**Why this wins.** Nib gets organised however suits, and changing your mind
edits one binding instead of rewriting notes. Same principle as the role map:
the thing that could go stale is editable data, not structure baked into code.

**The binding carries the kind, and that is the load-bearing part.** One folder
can be "1-1 notes about someone" and another "what their team's lead said about
them", satisfying different cadences. Without it, indexing would collapse every
kind of contact into one and close the blind spot on paper.

**A useful accident:** Nib already models flagged blocks as action points with a
done state. Those are promises, structured by hand, which means the single
highest-value thing Tend tracks needs no model at all - and ticking one off in
Nib resolves it here, so nothing has to be said twice.

## 2026-08-23 - Feedback and record-keeping are two duties, not one

**Decided.** "Feedback close to the event" and "running record of what each
person delivered" stay separate, and can each nag independently.

**Why.** They look alike and are not. One is something you *say to the person*;
the other is something you *write down for yourself*. Merged, you could tick off
one by doing the other, and the failure they guard against is precisely the
common one: having formed a view of someone and never told them.

## 2026-08-23 - Three monthly questions, not six

**Decided.** Three signal questions: has anyone stopped pushing back, do retros
end early with nothing resolved, is there anyone whose work you have not seen.
One covers an individual withdrawing, one the team going quiet, one the
structural blind spot of a crossed reporting line.

**Why three.** Six fit on a screen; three get answered. An unanswered question is
worth nothing, and this is the one thing in the whole tool that cannot be
derived, so its only cost is attention.

**Two rules that came out of building it:** a "yes" requires a note saying what
was seen, because a bare yes is useless three months later; and a yes brings the
question back in a week rather than a month, since a flagged problem should not
wait for the next cycle. A never-answered question is due immediately - adding a
question means wanting an answer.

## 2026-08-23 - A delegation level sits on a piece of work with an owner

**Decided.** Not on the project and not on the person, but on the pair: "this
subsystem, this person, delegated with close follow-up" is one row. Three levels,
and each one carries its own review interval - weekly, fortnightly, every two
months.

**Why.** Grove's task-relevant maturity is about how experienced *this person* is
at *this task*, so a project-wide level would be a guess and a person-wide one a
judgement about them rather than the work. The review interval is the level's
whole meaning: a level with no interval is a label, which is the abdication Grove
warns about with better branding.

**A workstream with no level set is surfaced as a finding**, not treated as
incomplete data. That unstated middle - responsibility moved, information did
not - is the failure mode itself.

## 2026-08-23 - An agent may record reality; only the user defines the job

**Decided.** The write boundary is drawn between *facts* and *the role*, not
between reading and writing.

An agent may record what is true: add a person, change their relationship type
after a reorg, add a project, log a promise, a contact or an observation. All of
it is additive and attributable.

An agent may not define what the job is. Duties always land as proposals;
`decideDuty` is app-only.

**Why here and not somewhere tidier.** Changing someone's relationship type has
a large effect - every cadence that applies to them changes. It is tempting to
call that structural and lock it to the app. But it is a fact about the world,
and telling Claude Code "this person moved teams" should simply work,
because the alternative is that the tool's picture of the org silently goes
stale. What must stay the user's is the answer to "what does this job require of
me", which is the role map and nothing else.

## 2026-08-23 - A buildless renderer, no framework

**Decided.** The Electron renderer is plain HTML, CSS and a single ES module
that talks to main over one `invoke` bridge. No React, no Vite, no build step.

**Considered and rejected:** electron-vite plus React, as in Jot and Nib.
Consistent with the family and better if the UI grows large. But the whole app
is three views of a list, the mock was already vanilla, and the rest of the repo
is deliberately buildless so the MCP server can import the same code with no
compile step between an agent writing an event and the file existing.

**Revisit if** the renderer grows past what one file can hold clearly. The
storage, domain and service layers should stay buildless regardless - those are
the ones the MCP server imports.

**One thing this cost:** the Electron preload script has to be named `.mjs`.
Electron loads a preload as CommonJS based on the file extension, ignoring
`type: "module"` in package.json, and the failure is a silent
`window.tend is undefined` in the renderer rather than an error in main.

## 2026-08-23 - One service layer, two clients

**Decided.** Operations live in `src/service/api.js`. The MCP server calls them
and serialises; the Electron app will call the same functions and render. No
capability is implemented twice.

**Why this won.** It is what makes "the MCP server is the core, the app is a
client" real rather than aspirational. If the tool surface were implemented
against the store directly, the app would grow its own slightly different
version of every query within a month, and the two would drift.

**The write boundary lives here, not in the tool definitions.** `proposeDuty`
always writes `status: "proposed"` regardless of caller, and `decideDuty` is
simply not exported to MCP. Putting the rule in the service layer means a second
client cannot route around it. A test asserts that no tool matching
`decide|accept|activate` ever appears in the manifest.

**Errors are return values, not exceptions.** An agent that receives
`No person matching "X". Known: A, B, C.` can correct itself. One that receives
a stack trace cannot. Ambiguous name matches are refused rather than guessed,
because logging a promise against the wrong colleague is worse than an error.

## 2026-08-23 - Cadences are generated, not stored

**Decided.** There is no cadence table. A cadence is produced at read time by
crossing an active duty with every subject it applies to. A duty names which
relationship types it covers ("second-hand read" applies to `manage-remotely`
and nothing else), and the cross does the rest.

**Why this won.** It is what makes "I might reorganise, I might change job,
don't let that break everything" actually hold. When someone
moves to another team you change one field - their relationship type - and every
cadence that applies to them changes with it. No migration, no orphaned rows, and
their entire history survives because it was never attached to the cadence in the
first place. There is a test for exactly this.

**Considered and rejected:** storing a cadence row per person per duty. It is the
obvious model and it means every org change is a data migration, which for a
personal tool means every org change is the moment you stop using it.

## 2026-08-23 - A focus can soften how something reads, never whether it is seen

**Decided.** Every drift carries two severities: `severity` after the focus
stretch, and `trueSeverity` ignoring it. Existence is decided by `trueSeverity`,
placement by `severity`. Anything genuinely critical is never held back, only
possibly demoted from "needs you" to a nudge. Anything the stretch flattened all
the way to "ok" is counted in `muted` rather than disappearing.

**Why.** Writing the contract tests found a real hole: a stretch could push an
item below the display threshold entirely, so the focus was hiding things while
reporting that it was holding back nothing. The count was honest about what it
knew and the mechanism made sure it knew less. Splitting fact from policy fixes
it at the root, and the fact is now the thing that decides visibility.

**Rule that follows:** drift is truth, severity is policy. Any future feature
that wants to dampen something has to go through `stretchFor`, which is the one
place the contract could be broken and is under test.

## 2026-08-23 - Append-only event log, one file per writer

**Decided.** All data is an append-only stream of events under
`<dataDir>/events/`, with one file per `<machine>-<role>` writer. State is
produced by merging every file and replaying in a deterministic order. Nothing
is ever rewritten in place and nothing is ever deleted; removal is a tombstone.

**Considered and rejected:**

- *One `todos.json`-style file, rewritten atomically* (how Jot and Nib work).
  It works for them because one process owns the file. Tend has three writers
  and two of them must work while the app is closed, so an atomic rewrite is
  just a lost update with better manners.
- *A lock file.* Requires every writer to behave, breaks when a process dies
  holding the lock, and does nothing about Dropbox syncing the same file from
  two machines.
- *The app owns the file, MCP sends it messages.* Clean, but it makes the MCP
  server useless when Electron is closed, which is exactly when a scheduled job
  runs.
- *A real database (SQLite).* Solves concurrency properly on one machine, and
  is actively hostile to a file that Dropbox syncs between machines.

**Why this won.** Two writers never touch the same bytes, so there is no lost
update and Dropbox never produces a conflicted copy. It works with the app
closed, it needs no coordination between processes, and it gives history for
free. Full reasoning and the failure modes in [docs/storage.md](docs/storage.md).

**Deliberately not built:** compaction. A few hundred events a month stays under
a megabyte a year, and compaction would be the only operation in the system that
destroys data. Not having it is a feature.

## 2026-08-23 - No AI in the core, but AI inside the app as one client

**Decided.** The MCP server is the core. The Electron app is one client of it;
Claude Code and Helm are another. No feature exists twice.

The app **must stay fully usable with the model switched off**. Drift, cadences,
promises, focus budget - all plain deterministic code. The model only reads
prose and writes drafts. It never computes the radar.

**Considered and rejected:**

- *Model-driven attention.* Asking a model "who has drifted" is slower, costs
  money on every app open, and is occasionally wrong. A wrong radar is worse
  than no radar, because it is trusted.
- *No AI anywhere, only an MCP surface* (the position held for about an hour on
  2026-08-23). It is cleaner, but it means extracting a promise from a note
  requires switching to another window, which is precisely the friction the tool
  exists to remove.

**Why this won.** The deterministic parts are the ones that must never be wrong;
the language parts are the ones a model is actually good at. Routing both
through one MCP layer means the app and an external agent can never disagree
about what the data says.

**Rules that follow:**

- Everything model-generated is labelled with its source and model, and can be
  rejected in one click.
- An agent may **create** rows freely (promises, check-ins, evidence) but may
  only **propose** changes to the user's structure - the role map, cadences, focus.
  Otherwise an agent can quietly rewrite what he believes the job is.
- Heavy work runs on write or on a schedule, never on app open.
- Model tiering: Haiku for extraction and tagging, Sonnet for briefs and search,
  Opus for the conversational rehearsal mode.

## 2026-08-23 - MCP over files, never HTTP

**Decided.** The external interface is an MCP server: a standalone process that
reads the same files on disk as the app.

**Considered and rejected:**

- *A local HTTP API.* Requires the Electron app to be running, so a scheduled
  nightly job fails because a window was closed.
- *Let Claude Code read the JSON directly*, the way the `jot-watch` skill reads
  `todos.json`. Cheaper to build, but then the model does date arithmetic on raw
  data - reintroducing exactly the unreliability the deterministic core exists
  to prevent. `tend_attention()` is right every time; a model counting weeks in
  400 lines of JSON is right most of the time.

**Why this won.** MCP gives semantics instead of structure: fewer tokens, no
arithmetic mistakes, and tool names that carry their own intent.

## 2026-08-23 - Plain JavaScript with JSDoc types, checked by tsc

**Decided.** `src/` is `.js` with JSDoc annotations, type-checked with
`tsc --checkJs --noEmit`. No build step.

**Considered and rejected:** TypeScript, as in Jot and Nib. Consistent with the
family, but the storage layer is imported by both Electron and a bare Node MCP
process, and a build step between an agent writing an event and the file
existing is friction with no payoff at this size.

**Revisit if** the renderer grows enough that JSDoc becomes painful. The storage
layer should stay buildless regardless.

## 2026-08-23 - Nib owns the notes; Tend reads them

**Decided.** Raw prose - 1-1 notes, lessons from books, observations - lives in
Nib. Tend indexes it and keeps its own structured layer beside it. Same relation
Helm has to Jot.

**Considered and rejected:** Tend owning its own notes. It would mean two places
to write a note, and one of them would go unused within a month.

## 2026-08-23 - Drift, not due dates

**Decided.** Every cadence carries a "how far behind am I" number per person or
project. There is no binary overdue state.

**Considered and rejected:** recurring tasks with due dates, as in a normal todo
app. A date that passes turns red, and red that appears every bad week gets
ignored. Drift sorts itself, survives a bad month, and makes the pattern visible
over time - that it is always the same person who slips matters more than that
someone slipped this week.

## 2026-08-23 - Never ask for what can be derived

**Decided.** Writing a 1-1 note about someone in Nib *is* the evidence that the
cadence was met. No check-boxes for things the data already knows.

**Why.** Every manual confirmation is a future reason to abandon the app.

## 2026-08-23 - Focus dampens noise, never alarms

**Decided.** A focus is a time-boxed priority with a percentage budget. While one
is active, soft nudge thresholds stretch and proposed duties stop surfacing.
Guarded duties are never muted and nothing is ever removed from "Needs you". The
focus shows what it cost in drift, and every stretched threshold reverts on the
end date whether or not the work is done.

**Why.** Without the contract a focus quietly becomes the whole job, which was
the stated concern behind the feature.

## 2026-08-23 - People are grouped by relationship, not by org chart

**Decided.** Each person carries a relationship type: lead-and-manage,
lead-only, manage-remotely, equal-lead. Attention rules differ per type.

**Why.** Tend is built for a crossed reporting line: some people you lead you do
not manage, and some you manage you no longer observe. "Someone you manage but
cannot see" is a guarded alert, because that is the blind spot everything else
widens. A tool that assumes team == reports models the one thing that is not
true here.

## 2026-08-23 - Authentication reuses Claude Code's login

**Decided.** Model access goes through the Agent SDK using Claude Code's
existing authentication, as Helm does. No separate API key to store.

**Trade accepted:** it ties Tend to the Agent SDK being installed. Given it is a
personal tool on machines that already have it, that is fine.

## 2026-08-25 - Topics are separate from duties

**Decided.** A second thing the role map can hold: standing topics to raise with
a person, on a per-topic cadence, surfaced only on that person's prep card. A
topic is content ("what does the next level actually require of me?"); a duty is
contact ("have you spoken to them at all?").

**Why.** Nothing modelled the upward direction. No duty listed `own-manager`, so
his own manager could not appear on any page, and the questions that drive his
own career had no home in a tool built entirely around what he owes other
people. Sideways had a contact duty but nothing to say.

**Rejected: a flag on the duty model.** Duties drift into Now, where everything
on the page is a deviation to act on today. A career question is never critical
and never neglect, so it would either shout about something that is not urgent
or teach him to skim the one page that must never be skimmed.

**Rejected: one shared "raised something" contact kind.** Cheaper, and it fails
the way the evidence-kinds rule already says contact fails: one such touch would
satisfy every topic for that person at once, so raising the easy question would
silence the hard one. Each topic carries its own last-raised date, per person.

**A never-raised topic counts from the start of the relationship,** not from
when the row was written. Counting from the row means a set seeded today sits
silent for three months and shows up empty on the day he goes looking for it -
and it is a lie besides: a question never put to someone you have worked with
for two years is two years unasked, whenever you got round to writing it down.

**Three per card, with the reason on the page.** The same limit as the monthly
questions and for the same reason. The reason is shown rather than hidden behind
a hover, because a question you do not believe in is one you skip.

## 2026-08-25 - The window is told about changes rather than polling for them

**Decided.** The main process watches the events directory and tells the
renderer when another writer appends. A slow timer stays as a backstop.

**Why.** The storage layer is built for concurrent writers and the store
re-reads on demand, but a window sitting on a view has no reason to ask, so a
contact logged over MCP was up to twenty seconds late. The poll it replaced did
the same work whether or not anything had changed - a full render plus six calls
into the service layer, which on Prep means re-reading Nib's index and Jot's
board off disk - forever, in an app meant to be left open all day.

**A writer never hears its own appends.** Segments are named after their writer,
so the app's own writes are filtered out. Otherwise every action redraws twice,
and the watcher starts to look like the thing keeping the app current when the
action already did.

**The backstop was kept rather than deleted,** at two minutes. Directory
watching is the part most likely to fail quietly on a given machine, and the
data directory can be pointed at Dropbox, where it is least reliable.

**Measured, not assumed.** Both the old behaviour and the new one were checked
by launching an Electron instance against a copy of the real data and writing a
contact from a second process while the window was up: 20 seconds before, 2.5
after, with nothing touched.

## 2026-08-25 - The data directory is read from the user environment, not only inherited

**Decided.** `resolveDataDir()` checks `TEND_DATA_DIR` in `process.env` first, then
the value Windows has stored for the user, then the per-user default. The
returned `source` says which of the three answered.

**Why.** `process.env` only carries what a process inherited, so a variable set
after the parent started is invisible - and then the app silently uses the
per-user default, which is a real directory that parses and reports nothing
wrong. An agent session on this machine additionally has its writes to that
default redirected into an app-container overlay while its reads fall through,
so the two halves of the same tool ended up on separate stores, each verifying
its own writes successfully and each convinced the other was showing stale
data. Nothing errored, at any point.

`src/service/nib.js` already had this exact fallback for `NIB_DATA_DIR`, with a
comment saying it had cost an evening. Tend's own directory did not have it. The
reader is now one module both use.

**The inherited value still wins,** because that is how a test points the app at
a scratch folder.

**Naming the source is the point, not decoration.** "default" is the answer that
quietly means nobody configured this, which is the only case where the shadow
directory can happen. Settings says which of the three applies, so the question
is answerable from the window rather than by comparing file timestamps.

## 2026-08-25 - The kind of contact decides what the subject must be

**Decided.** Each contact kind belongs to exactly one sort of subject: person,
project, or workstream. The kind chosen decides which lookup runs, the form
offers only the kinds that can be about what you clicked, and the service layer
refuses the rest.

**Why.** The form offered all kinds whatever the subject was. Filing a 1-1
against a project, or a check-in against a person, recorded a row, said
"Logged", and satisfied no cadence - so the thing it was meant to answer stayed
exactly as behind as it was. The whole design rests on kinds not being
interchangeable, so a form that lets one be filed against the wrong sort of
subject is quietly undoing the premise.

**Filtered on the subject's TYPE, not on which duties are active.** The
tempting version offers only kinds that would move a clock today. It fails
twice: `casual` satisfies nothing by design and would disappear, taking the one
way to record having actually spoken to somebody; and duties are the user's to
edit, so a list that reshuffles when a duty's relations change, or refuses to
record a true thing because no duty consumes it yet, is a tool arguing about
what happened. Duties decide what counts. This decides what a sentence can be
about.

**Refused in the service layer, not only filtered in the window.** The window
is not the only caller - an agent over MCP reaches the same function.

**Found while doing it: delegation reviews had never worked.** `logTouch`
resolved a subject as a person or a project only, and a workstream is neither,
so the Work view's "Log a review" button answered "No project matching
<uuid>". The duty that consumes those reviews could not be satisfied by
anything. Letting the kind pick the lookup fixed it as a side effect, which is
the argument for that ordering: resolving first and validating afterwards also
meant a name shared by a person and a project silently picked whichever lookup
ran first.

## 2026-08-25 - A stakeholder is a person and a project, not a relationship type

**Decided.** Stakeholders are modelled as a stake: one row joining one person to
one project, carrying its own interval. A stake is its own cadence subject, and
`update` is a contact kind that can only be about one. Plus a `stakeholder`
relationship type, so somebody you deliver to can exist on the roster without
inheriting duties written for people you lead.

**Why it was missing at all.** A stakeholder is neither a report nor a peer, so
no duty could reach them. The failure is specific: you go quiet for a quarter
and the first thing they hear is that it slipped. That is the one direction
where silence leaves no trace anywhere in the tool.

**Rejected: a relationship type with one duty behind it.** Much smaller, and it
fails for the reason this whole tool exists. That cadence would be satisfied by
any update at all, so telling somebody about one project silences every other -
a quarter of silence about the thing they actually depend on, sitting behind a
fortnight of talk about something else. Contact kinds are not interchangeable,
and neither are the things contact is about.

**Rejected: modelling milestones.** Tend measures drift, not due dates, and
shipping something and saying so resets the clock where it happens. A milestone
is an occasion to write an update, not a second kind of obligation.

**The interval lives on the stake, not on the duty.** How often is the whole
substance of the arrangement, and a sponsor two levels up who wants to know it
is moving is a different obligation from someone sitting beside the work. Same
reasoning as a workstream taking its review interval from its delegation level.

**The label is built from the rows every time, never stored.** A copied label
goes stale in the most misleading way available: a person was renamed and the
card still shows the old spelling, which reads as a second person you have
neglected. A stake whose person or project is gone is dropped rather than shown
with a placeholder - nobody can act on it, and this page's value is that
everything on it can be acted on.

**Found while doing it: the delegation-level duty was declared against a
project.** It consumes `delegation-review`, which is about a piece of work, so
it crossed with every project and could never be satisfied by anything. It
would have sat in Now saying a project had never had its level set, forever.

## 2026-08-25 - A relationship type is declared once, and the list is derived

**Decided.** `RELATIONS` in `src/domain/cadence.js` carries three strings per
type - a name, what it means on a card, and how it reads in a dropdown - and
`RELATION_OPTIONS` is derived from it. The renderer re-exports rather than
keeping a copy.

**Why.** It kept a hand-written copy. Adding the `stakeholder` type to the
domain therefore left it unpickable in the window with nothing failing
anywhere: the type existed, the service accepted it, tests that called
`addPerson` directly passed, and the only way to notice was to open the dropdown
and find it absent. The user found it, one commit after the same duplication was
removed for contact kinds - the list that broke was ten lines above the one that
had just been fixed.

**The dropdown wording is stored rather than derived from the other two.** A
list of options wants to be scannable and a note wants to be read, so joining
`label` and `note` produced something worse than either. Three strings in one
place beats two strings in one place and a third somewhere else.

**Guarded twice, at both altitudes.** A unit test asserts every key in
`RELATIONS` appears in `RELATION_OPTIONS` and that the counts match. The
walkthrough separately counts the options in the real dropdown against the
domain, because the unit test would have passed the whole time this bug existed:
it was the renderer's copy that was wrong, and no unit test read it.

## 2026-08-25 - A duty must be satisfiable by the evidence it names

**Decided.** `proposeDuty` and `updateDuty` refuse a duty whose evidence kinds
cannot be about its subject kind, checked against the merged row rather than
against the fields given. An unknown subject kind is refused rather than coerced
to "person". An empty evidence list stays legal - that means "any contact
counts", which is a real thing to want.

**Why.** A duty declared against a person while consuming evidence about a stake
can never be satisfied by anything. It crosses with every colleague, reports
each of them as never done, and no action anywhere in the app can clear it. That
is worse than an error: it is a permanent red item that looks exactly like real
neglect.

**How it happened, twice.** The seeded delegation-level duty shipped declared
against a project while consuming a workstream's evidence. And the duty edit
form kept a hand-written list of subject kinds that was missing `stake`, so the
stored value matched no option, the browser showed the first one, and saving
rewrote a stakeholder duty to apply to every person. The user saw the result
before any test did.

**The merged-row check is the point.** An edit that changes only the subject has
to be judged against the evidence already stored, and vice versa. Validating
just the incoming fields lets each half pass on its own while the pair is
nonsense - which is exactly the edit that broke it.

**The form's options are derived now, and the interval comes as a number.** It
used to recover the interval by stripping non-digits out of "30 days", which
turns "no cadence" into zero and breaks the day that wording changes.

**Guarded at three altitudes.** A unit test asserts every seeded duty is
coherent. Service tests cover the refusals, including that a refused edit writes
nothing. And the walkthrough opens the real edit form on a stake duty and checks
the subject survives a round trip - the unit tests would all have passed while
this bug was live, because the broken list was in the renderer.

## 2026-08-25 - Away and gone are dates on a person, not a delete

**Decided.** A person carries `awayUntil` and `leftAt`. While away, no cadence
applies and the clock restarts from the day they return rather than from the last
conversation. A last day changes nothing until it passes; after it, cadences and
promises go quiet and the whole history stays. A logged contact can also be taken
back.

**Why not delete somebody who leaves.** The record is the valuable part - a year
of 1-1s, what they delivered, what was promised - and a tombstone throws it away
to save a line on a roster. The last day is stored the moment it is known, so the
app handles the transition itself instead of waiting to be told.

**Why a date rather than a flag.** It expires by itself. A flag somebody has to
remember to unset is a flag that stays set, and an "away indefinitely" state
never prompts anybody to look again. A rough return date that comes round and
puts the person back on the page is better than an accurate one nobody enters.

**The clock restarts from the return.** Measuring from the last conversation
reports somebody as critically neglected on their first morning back, which is a
red item that is not true and cannot be cleared. Treating the return as contact
means nobody notices you have not caught up. A return is the start of an
interval, not an event in it.

**Rejected: hiding a promise the moment a resignation is known.** A promise to
somebody leaving next week is exactly the promise to keep. It goes quiet when the
day passes, and the row is never touched.

**A mislogged contact had to become undoable.** `removeRow` did not accept
`touches`, `stakes` or `topics`, so three Remove buttons in the window did
nothing and a contact logged against the wrong person was permanent. A wrong
entry is worse than a missing one: it moves a clock and then looks identical to a
real one.

**Two bugs found by the walkthrough that unit tests could not see.** `Number(null)`
is 0, a finite instant in the past, so clearing a last day reported somebody as
having left in 1970 - the unit tests passed `{}` where the form sends an explicit
null. And the roster's list of groups was a fourth hand-written copy of the
relationship types, missing `stakeholder`, so a person with that relationship was
in the store and absent from the page with no error anywhere.

## 2026-08-25 - An update to a stakeholder is contact with a person

**Decided.** `myAttention` translates a touch filed against a stake into contact
with the person that stake is for.

**Why.** The stake is the right subject for the cadence - an update about one
project must not answer for another - but it is the wrong subject for "have I
spoken to this person at all". Without the translation the app showed an update
to somebody logged that morning, and a signal on the same page saying nobody had
spoken to them this month. Two true records contradicting each other is worse
than either being absent: it teaches you that the signals are approximate, and
then you stop believing the one that matters.

**Only for the first-person signals, not for the cadence.** The duty still reads
the stake, because that is the whole reason a stake exists.

## 2026-08-25 - Which duties survive a notice period is a choice per duty

**Decided.** A duty carries `keepWhileLeaving`. Once a person has a last day set,
duties with it turned off stop applying to them. Absent means it still applies,
so nothing changes for a duty nobody has revisited.

**Why per duty rather than per person, or as a rule.** The answer genuinely
differs and the user is the one who knows: a 1-1 during a notice period is when
the handover actually gets arranged, so it matters more than usual, while a peer
review round is an instrument for developing somebody who is on their way out -
running one is work for everybody involved and changes nothing. Neither "keep
everything" nor "drop everything" is right, and the app is not in a position to
guess which duty is which.

**It takes effect when the last day is SET, not when it arrives.** That is the
point: the decision not to run a review round happens the moment you know
somebody is leaving, not on their final afternoon.

**A related correction to something this file used to imply.** A focus never
removes a critical item from Now, guarded or not - `buildAttention` surfaces
critical first and pushes anything with a critical true severity to nudges rather
than muting it. Guarding only changes whether the tier below critical is
protected. Un-guarding a duty that is badly overdue therefore does nothing at
all, and suggesting it as a way to quiet the page was wrong.

## 2026-08-25 - A cancelled meeting is recorded, and satisfies nothing

**Decided.** A `skips` row holds a meeting that was booked and did not happen:
who, what it would have been, when, and why in one free line. It lives in its
own collection, is read nowhere contact is read, and no cadence consumes it.

**Why record it at all.** "We never got round to booking it" and "we booked it
and cancelled it three times" look identical to a tool that only counts contact:
both are silence. They are not the same fact. The second is a pattern, it is
usually about something, and it is exactly the sort of thing that is obvious in
hindsight and invisible while it is happening.

**Why it must satisfy nothing.** The conversation still has not taken place, so
the page saying so is correct. If recording a cancellation quieted the cadence,
being honest about it would make the tool lie - and then the honest thing to do
would be to record nothing.

**The reason is a free line, not a category.** A dropdown of causes produces
statistics nobody acts on. The difference between "he was ill" and "I moved it
for the third time" is the whole point, and only one of those is about you.

**Two, not one, before it is called a pattern.** Something cancelled once is a
week. A card that comments on every rearranged meeting is a card that gets
skimmed.

**Also: contact can no longer be logged for a day that has not arrived.** The
temptation is concrete - a 1-1 in the diary for next week and a card saying you
are two weeks behind - and logging it early goes green immediately and stays
green until the day comes. Wrong in the flattering direction, which is the
direction nobody checks. The check is day-granular because the date pickers
parse a chosen day at midday, so a plain `at > now` would have rejected today.

## 2026-08-25 - The principles being practised are read from Nib, with no clock

**Decided.** A note tagged `Principle` and flagged open in Nib is a principle he
is currently working on. Tend reads them, shows up to three above the Prep cards,
and puts no date on any of them. Unfinished action points written on a principle
note appear in the same block, oldest first.

**Why no interval.** A flag means "this is what I am trying to emphasise at the
moment", and it graduates when it starts coming naturally - a judgement only he
can make from the inside. A review date would be a deadline on internalising a
habit, which does not have one, and it would turn a practice into a chore. Nib
owns the flag; he raises and lowers it there and Tend only reads.

**Rejected: a principle on every card.** They are about him, not about any one
person, so the same two lines beside six names is exactly how a card stops being
read. Once for the page, above the cards.

**Rejected: Now.** Nothing here is a deviation, and every item on Now is one.

**Rejected: a model pass judging entries against the principles.** Technically
easy, and the fastest way to stop the app being opened. A tool that comments on
your character is not a tool anybody keeps.

**Three at a time, and the rest is named rather than truncated.** A set that has
grown to six is worth saying out loud, because emphasising six things at once is
emphasising none of them - a fact about the set, not a display problem.

**The action point's age is a proxy and says so.** Nib records when a note
changed, not when a block was flagged, so the list is sorted by it and no number
of days is put in front of him as though it were measured.

## 2026-08-25 - The day gets written down, and nothing asks for it

**Decided.** Four boxes on their own page: what took the day, what I avoided,
what I would do differently, and a longer one. Every field optional, one entry
per day replaced rather than duplicated, no prompt, no streak, and no count in
the rail.

**Why nothing prompts.** Days will be missed, by design rather than by
shortfall. A tool that asks every evening becomes a tool that is avoided every
evening, and then the record stops entirely instead of arriving unevenly - which
is strictly worse, because an uneven record still shows a pattern and an
abandoned one shows nothing. The rail carries no badge for the same reason: every
other entry there earns a number because something waits, and a number on an
optional habit is only ever a reproach.

**Why every field is optional.** Three required boxes produce something invented
at eleven at night. Invented data is worse than none: it survives, it reads like
a fact afterwards, and it poisons the pass that is the entire point of writing
any of this down. One filled box is a complete entry, and an empty box is absent
from the card rather than shown with a dash.

**Why these questions.** The rule the rest of the app follows - never ask for
what can be derived. Who he spoke to is in the store, so asking would waste the
only thing a form has, which is his attention. What is left is what only he can
say: where the day actually went as opposed to where it was meant to, what he
avoided, and the smallest possible retrospective.

**One entry per day, replaced.** Coming back in the evening to add a line is
normal; three partial rows for one Tuesday would make every count over days
wrong, and the count over days is what separates a habit from an evening of
catching up.

**The coverage travels with the entries.** A pass over five and a pass over
twenty-five are different claims, and a summary that does not say which sounds
equally confident either way. Saying it in the data rather than leaving it to
whoever renders it means the honesty is structural rather than remembered.

**Deliberately not built yet: the pass that reads them.** It is the product and
the form is only the means, but a summary needs entries to summarise. Signals
built on a guess about which patterns exist are worse than no signals, which is
the same order the topic and stakeholder work followed.

*Built on 2026-08-27, once there were entries to read. See "The journal gets read,
on request, and the reading can be kept" below.*

## 2026-08-27 - Notes import themselves, and the manual button stays

Importing from Nib was correct, idempotent and reachable from exactly two
places: a button in Settings and a command in the palette. It now runs on its
own, from a watcher on the notebook's `index.json` with a ten-minute sweep
underneath it, and both buttons stay.

**Why this was the worst bug in the app.** The central claim - "you have not
spoken to this person in three weeks" - was true only for somebody who
remembered to press a button. Write the conversation up, tag it, close the
notebook, and the app went on reporting silence with total confidence. Not a
wrong answer that looks wrong: a right-looking answer built on a stale copy,
which is the one failure there is nothing to notice about. Every other
correctness rule in here - flag in doubt, never suppress a real signal - was
being undone by the freshness of the data underneath it.

**Why two triggers rather than one.** The watcher is what makes a note tagged a
moment ago count a moment later. The sweep is not redundancy: a notebook can
live in a synced folder, where a file arriving from another machine is written
by a background process whose notifications are not something to stake the app's
core claim on. A ten-minute floor on staleness costs one small file read per
sweep and removes a class of "why does it not see my note" that would otherwise
be unreproducible.

**The directory is watched, not the file.** Nib saves atomically - temporary
file, then rename - so a watch held on `index.json` follows the file that was
replaced and goes silent after the first save. Watching the directory and
filtering on the one filename survives that. The note bodies live in a
subdirectory and are deliberately not watched: they are rewritten on every save,
and nothing on the automatic path reads them.

**Why running unattended does not widen what gets read.** Indexing opens
`index.json` and nothing else, which is why `noteBody` sits alone at the bottom
of the Nib reader with nothing calling it. Automatic or not, no note body is
opened without somebody asking by name. The boundary was already in the right
place; this change leans on it rather than moving it.

**Why the manual buttons stay.** Preview-import answers a different question -
what WOULD change - and it is the only way to check a new tag mapping without
committing to it. Import-now is what somebody presses when they do not believe
the automatic one ran, and taking it away would leave nothing to press.

**Why the state is on screen.** A background job nobody can see is a background
job nobody believes, and the honest response to not believing it is to press the
manual button every time - which defeats the whole change. So Settings says when
the last import ran and what it found, including when it found nothing. "Nothing
new as of a minute ago" is the message that makes it trustworthy, and it is
exactly the message a report that only speaks up on changes cannot send.

**Repeated failures are said once.** An unreadable notebook fails identically on
every sweep, for ever. Reporting each one buries the warning list under one
message repeated six times an hour, which is the same as having no warning list;
so a failure is announced when it appears and when its wording changes, and not
otherwise.

**It never creates the notebook directory.** A missing directory means the
notebook is not there or is configured elsewhere, and the useful response is to
say so. Creating it would make a misconfigured path look exactly like an empty
notebook - the one reading that cannot be recovered from by looking at the
screen.

## 2026-08-27 - The journal gets read, on request, and the reading can be kept

The end-of-day form has existed for days and the entry it wrote was read by
nothing. The pass now exists: it reads the entries over a window, names what
recurs, and returns something that is kept only if he keeps it.

**Why a button rather than a schedule.** Every other design decision on that
page is about not nagging - no prompt, no streak, no badge in the rail - and a
reading that appeared unasked on the first of the month would be a verdict
delivered to somebody who was not asking for one. Nothing on that page gets to
be an exception, least of all the part that has opinions.

**Why there is a floor, and why it refuses rather than hedges.** Below four
entries across three separate days the pass will not run. A pattern named from
two evenings is one evening restated with confidence, and the damage is not that
it is wrong today: it is that it survives, and gets read next month as a fact
about how the work went. The spread matters separately from the count because a
catch-up evening produces four entries about one week, which is one data point
wearing four. The floor is enforced in the service and again in the window - a
disabled button with the reason on it, so a refusal is never something you
discover by pressing.

**Why the counts travel with the prose.** An evening's writing is a memory of a
day, and a memory of a month of days is worse. So what the store recorded over
the same window - conversations, promises made and closed, decisions, growth
threads discussed against markers actually observed, meetings that did not
happen - goes into the prompt beside the entries, and the model is told to say so
where the two disagree rather than picking one. "It all went into meetings" reads
very differently next to four recorded conversations, and only one of those two
numbers is checkable.

**What the counts deliberately are not.** They are counts, labelled as counts.
The store has never held hours, and a share-of-week derived from event counts
would be an invented number with a real-looking denominator. The one thing that
can be stated honestly about where attention went is what a focus cost, because
that is measured: mean drift when it was set against mean drift now. Everything
else stays a count.

**Why the focus is what the entries are set against.** A focus is the only place
in the app where an intention about where attention *would* go is written down,
which makes it the only thing "where it actually went" has anything to be
compared to. When no focus was in force the comparison is left out entirely
rather than an intention being invented to compare against, and when one covered
four of thirty days the reading says so - a month held up against a focus that
barely ran overstates both.

**It asks rather than concludes.** Same rule as the growth threads. A verdict
about how somebody spent their month is the one output that cannot be argued
with, and therefore cannot be used.

**A kept reading is stored, where a brief is not.** The reason briefs are thrown
away is that the facts underneath them move, so a saved one quietly stops
matching. A review is built from entries about days that are over: it is as true
next year as it was on the evening it ran. It is also the only way the second
reading is worth anything - a pattern that has survived three months is a
different fact from one noticed tonight - and that comparison is impossible if
each reading is discarded. The coverage is stored *with* it rather than
recomputed later, because recomputing would answer for a window that has since
moved.

**Nothing is stored without him having read it.** The pass writes nothing; the
window shows what came back and keeping it is a separate press. Same shape as
keeping an extracted promise, and the same reason.

**The floor is applied to the result as well as asked for in the prompt.** A
minimum stated in a prompt is a request. Anything the model reports as happening
on a single evening is dropped on the way out, which is where it becomes a rule.

**Over MCP the material is exposed, not the pass.** `tend_journal` hands over the
entries, the readiness, the recorded counts and the declared focus; the caller
does its own reading. That is the existing rule on that surface rather than a new
one - a caller there already is a model, and nesting a second would pay twice for
a worse answer, because the inner call sees only the entries while the outer one
sees the conversation. Keeping a reading is deliberately absent from that surface
too: nothing a model concluded about how his months went should reach the store
without him having read it.

**The entry cards now say they are entries.** Adding a card above them broke two
end-to-end checks that had quietly meant "the first card on the page", and one of
them kept passing while measuring the wrong element - the worse half of that
failure. A card that says what it is costs nothing and removes a class of test
that measures the layout instead of the thing.

## 2026-08-27 - Two stores, one at a time, and the rule that makes the private one safe

The app now opens one of two stores. Work is where everything always was; private
is a sibling directory that the work half never reads and never merges with.
Switching restarts the app.

**Why two directories rather than one store with a filter.** A filter is a rule,
and a rule is a thing that can be got wrong once. Two directories that are never
read across cannot leak into each other by anybody forgetting a condition
somewhere, so the boundary becomes a property of the filesystem instead of a
property of the code continuing to be careful. This was argued the other way
first and the argument was lost on exactly that point.

**Beside, never inside.** The private directory is derived from the work one by
appending a suffix, not by nesting under it. Nested, a backup or a sync of the
work store would quietly carry the private one along - and the entire reason
there are two is that they never travel together. `TEND_PRIVATE_DIR` moves it
outright for a different drive or an encrypted volume; there is no second
variable to set in the normal case, because the first one took an afternoon to
discover was missing and a second would have the same failure with half the
visibility.

**Switching restarts the app.** Everything under the window - the store, the
change watcher, the Nib import - was opened for the mode the app started in.
Swapping them underneath a drawing view is a sequence that has a wrong order, and
the cost of the wrong order is private words written into the work store. A
restart has no wrong order. It also puts the right amount of friction on this
particular button: this is not a control to flick by accident.

**The remembered mode is configuration, not data.** It lives in the app's own
per-user directory rather than as a row in either store, because a row would have
to be written in both to stay true, which is how the two halves start disagreeing.
Every way of failing to read it resolves to work mode - missing, unparseable,
half-written, a mode that does not exist - because that is the only fallback that
cannot put private words in the work store.

**Three signals, not one.** The window title carries the mode outside the app,
where it is readable in a taskbar; the accent colour carries it at a glance; and
the rail carries it by being visibly shorter. The badge beside the wordmark is
empty in work mode rather than saying "work", for the same reason the rail counts
hide a zero: a label that is always there stops being read, and this one has to
still be doing its job in six months.

**What is not in the private half, and why it is absent rather than dampened.**
Drift, cadences, duties, prep, the focus budget, the role map, decisions. Not
turned down - absent. Contact with somebody you live with is continuous, so a
cadence over it reads as permanently fine and means nothing, and a "you have not
spoken to them in three days" about a person in the next room is worse than
useless. What transfers is the journal, which is the part that was thinnest, and
the reference material you go to with a question.

**The rule the private journal is written under.** An entry records the
interaction and his own part in it, never the other person's state. "That went
badly and I got impatient", not "she was impossible." Three reasons and the third
is the one that matters: it is the half he can change, it keeps the first-person
constraint the signals already depend on, and it is the only version of an entry
he could show the person it is about - which is the test a journal about people
you live with has to pass, because one day somebody reads it.

**The rule is in the form first and the check second.** The labels and hints say
the rule while the entry is being written, which is worth more than any amount of
reading it back afterwards. The check exists for the evenings where good
intentions do not hold.

**Why the check is a model and not a pattern in code.** "She was impossible" and
"I could not reach her" are the same sentence at the level of grammar and
opposite at the level of what they claim. No rule over pronouns separates them,
and one that tried would flag every mention of another person - which in a
journal about a family is every sentence. So the check is told the rule in both
directions: describing what somebody DID or SAID is fine and is often the whole
point; a claim about what they ARE is what breaks it.

**The check may not rewrite anything.** It returns the phrase and an alternative
beside it, shown once and thrown away, and the entry on disk is untouched
whatever it says. An automatic rewrite would replace his words with a model's in
the one place where the words being his is the entire value, and it would do it
to the record of a relationship. Structurally rather than by promise: the
function takes the text and no store, so there is nothing it could write to.

**The clean answer is shown rather than swallowed.** "This all keeps to your own
part" is the common result and the one worth seeing. A check that only ever speaks
up when something is wrong reads as an accusation waiting to happen, which is how
a check about your family stops being run.

**The cheap tier.** One stated rule over a few sentences is exactly that tier's
shape, and a check that costs real money every evening is a check that gets
turned off.

**Fixed while here: the instruction that protects Swedish quotes had itself been
written with the letters stripped** - "keep a, a and o with their diacritics".
Not a typo but an instruction that cannot do its job, and the failure it lets
through is a quote that looks like somebody's words while not being them. It now
contains the letters, and a test asserts that it does, because the stripping is a
writing habit rather than an encoding fault and can come back through any edit.

## 2026-08-27 - No protocol command in the app harness may wait for ever

Every command the app harness sends over the debugging protocol now has a
thirty-second ceiling, and the screenshots it takes may fail without failing the
run.

**The bug.** Each command was a promise registered against a reply id, with
nothing to settle it if the reply never came. One command reliably does not come:
capturing a screenshot never answers while the window is not being presented -
minimised, fully occluded, or a machine that locked while the suite was running.
Every check would pass, the summary line would never print, and the process sat
there. Node's own warning was the only clue, and it pointed at the awaiting line
rather than at the command underneath it.

**Why a hang is worse than a failure.** It looks like slowness, so it gets waited
on. It produces no output, so there is nothing to read. And it depends on whether
somebody happened to minimise a window, so it is intermittent and gets blamed on
the machine. This one wasted a run that had already passed - twice.

**Why the screenshots are allowed to fail.** They are documentation: they end up
in docs/ and not one check reads them. So a machine that cannot present a window
must not be able to fail a suite where everything passed. It says why it could not
capture, on one line, and carries on.

**Why a ceiling rather than only fixing the screenshot.** The screenshot is the
command that fails today. The property worth having is that no command can wait
for ever, because the next one to acquire that behaviour would cost the same
afternoon to find.

**A harness states which half it drives, in the environment.** `TEND_MODE`
overrides the remembered choice for one launch and writes nothing. Without it a
run inherits whichever half the real app was last left in, and every check in the
work suite is written against the work half - the failure would have been a screen
of red on a machine where nothing was wrong, for a reason nothing in the output
would mention. It doubles as the way out of a mode you cannot get out of, since
the switch lives inside a window that might not open.

**Not by giving the work harness its own Electron user directory, which was the
first attempt and was wrong.** A fresh Chromium profile leaves the window
unpresented on this machine: maximising it then changes nothing measurable, and
capturing a screenshot never returns. So the attempt to isolate the mode broke
two checks with no visible connection to it - and one of those two was the check
that had just been fixed for hanging, which made the hang fix look like the
culprit. Reverting the harness to its committed state and watching it pass was
what separated them. The private harness keeps the flag, because it is testing
the remembered choice itself and so the file has to live somewhere; it is
therefore the one harness that may not assert anything about window chrome.

**The private half has its own short harness, because the main one cannot reach
it.** Switching modes relaunches the app, which would end a run half-way through,
so `scripts/e2e-private.mjs` launches a second instance that is already in the
private half and asserts only what differs: the choice survived a launch, the
store it opened is the private one and is beside the work store rather than inside
it, the mode is visible without opening anything, and the machinery that means
nothing over there is not on offer. Everything general about the app is already
covered by the work suite against the same code.

**Two things that harness taught, both about waiting for the wrong signal.** Its
checks were written with async bodies and a non-awaiting runner, so an assertion
inside one rejected into nothing and the line printed ok - the third
cannot-fail check found in this project, which is why its runner is async even
where a body is not. And a readiness check on `1` answering proves nothing about
the DOM: the target appears and the socket opens before the page has a document,
and a missing document comes back as a reply carrying no value, which looks
exactly like a command that was never answered. The symptom was a parse error
pointing at a line that was not the problem.

## 2026-08-27 - A nudge for evenings nobody has read, triggered by material and not by time

There is now one signal about the journal: written evenings that no pass has read.
It sits with the other first-person signals, it is never critical, and it is not a
badge in the rail.

**Why time alone would have been the wrong trigger.** The obvious version fires
on elapsed days - "it has been six weeks since you read your journal". That
version speaks up loudest on a month where nothing was written, which makes it a
reproach for not having journalled - precisely what that page was designed never
to produce. No prompt, no streak, no badge, because a tool that asks every evening
becomes a tool that is avoided every evening, and then the data stops entirely
rather than arriving unevenly.

So the unread material is the trigger and time is only an amplifier. It cannot
fire on a quiet month, because a quiet month has nothing unread; a long gap raises
the weight once there is already enough to read.

**Its floor is the pass's own floor.** Four entries across three separate days,
from one place. Suggesting a reading the service would refuse is worse than
silence: it sends somebody to a disabled button.

**It counts from when a pass RAN, not from when a reading was kept.** This is what
makes the nudge trustworthy rather than merely correct. Reading a month and
deciding it said nothing is a complete act - the material has been read - and a
nudge that came back the next day suggesting a reading would teach him to ignore
it, and then to ignore the others beside it. So the pass records that it ran, and
keeping the reading fills in the same row rather than writing a second one.

**Why the pass may write that row.** The model layer's rule is that nothing a
model PRODUCED enters the store without somebody having read it first, and that
still holds: the row is a timestamp and how much was read, with none of the prose,
and the reading itself is still returned and kept only if he keeps it. This is the
app recording that an action happened, in the same sense as a logged contact. A
test asserts the run row carries no findings.

**It also appears on the journal page itself.** Same fact, same wording, read from
the same signal - on the page he is already standing on when he writes an evening
down, which is the moment a line about unread material costs nothing. Still no
count in the rail: nothing on that page is late, and a number that is always there
becomes a reproach.

**It sorts below every signal about a person.** Somebody being neglected outranks a
month of his own evenings going unread, and a list where those two compete on equal
terms teaches the wrong order.

**The mechanical first-person check now has to produce every signal.** That test
is the only guard on the rule that no signal may have a colleague as its subject,
and its fixture did not produce the new one - so the rule was unenforced on it. The
fixture was widened and the assertion now names the full set, so adding a signal
without adding it there fails rather than passing quietly.

## 2026-08-27 - What each half consists of is declared once, and the halves have different vocabularies

The private half's first version was three entries hidden in the rail, and that
was not a half - it was the work app with some buttons taken away. It now has its
own vocabulary, its own set of views, its own shape of person page, and its own
side of the notebook, all declared in `src/domain/halves.js`.

**What went wrong, exactly.** Adding somebody in the private half asked whether
they were one you lead and manage, manage remotely, lead without managing, are an
equal lead to, are managed by, or are a stakeholder to. Six management
relationships offered for somebody's family. And everything behind the hidden
buttons was still reachable: the palette offered every view in the app, and
navigating to one this half does not have fell back to the work radar - drawn over
private data, which is the single failure this whole arrangement exists to
prevent. Ctrl+K is bound on the window precisely so it works from anywhere, which
made it the widest hole rather than an edge case.

**The cause was a fifth hand-copied list.** The relationship options were a
constant compiled into the renderer; which views belong to the private half was a
hand-written array in the shell. This project has been bitten four times by the
same shape - a relationship type that existed and was unpickable, a roster group
missing so everybody with one relationship vanished from the page, a dropdown
short an option the service accepted. So there is now one declaration and the
window asks: `vocabulary` returns the half's views, its relationships, where it
opens, and which blocks a person page may show.

**The store carries its half.** One field, set where the store is opened, because
the half IS the store - two directories that are never read across, so "which
vocabulary applies" has exactly one answer per store and it is known the moment it
opens. Threading a parameter instead would have meant every new function was one
somebody could forget to pass it to. The service now validates a relationship
against the half it is being added to, not against the union: a store holds one
half's people, and accepting the other half's words would put a row in the data
that every grouping treats as unknown.

**The private relationships carry nothing, deliberately.** Partner, child,
parent, sibling, wider family, close friend, friend, someone else. They group a
list and they sit on a person's page. No duty, no cadence, no expectation derived
from them - because the work half's relationship types are the input to what you
owe somebody, and reusing that idea here ends with the app telling him what he
owes his own family on a schedule.

**A person page shows what still means something.** Promises transfer whole: "I
said I would sort out the bike" is owed exactly as much, and the person let down is
let down the same way. Waiting on somebody transfers. Cadences and cancellations do
not, because there is no drift. A growth thread does not, and the reason is not
squeamishness - it is a direction you have decided somebody should develop in with
a marker you watch for, and run on your own child the tool has become something
else. An observation does not, because it records the other person's state, which
is precisely what the private journal's one rule forbids. Which blocks apply is
asked from the domain rather than branched on in the renderer, so adding a block
means deciding which halves it belongs to instead of discovering later that it
renders drift over a picture of somebody's family.

**The start date is not asked in the private half.** It exists to give a cadence
something to measure from before there is contact to measure from instead. With no
cadences it is a question with no consequence, and asking "since when" about a
parent is its own small absurdity.

### The notebook has two sides, and Tend was reading both

Nib has marked a category as work, private or neither since before Tend had
halves - which is why the private half needed no change over there. What was
missing was Tend honouring it.

**The leak.** The Nib reader offered every category to every caller, so a note in
a private category carrying the principle tag appeared in the WORK half's
knowledge view. Private content surfacing on the work side is the direction of
that boundary that actually costs something, and it needed no mistake to happen -
just a tag on a note.

**Filtered at the one door.** Inside `readNibIndex`, not in each caller. Every
folder list, note search, principle read and import goes through it, which is the
only arrangement that survives somebody adding a caller. An unknown or absent half
defaults to work, so a caller that has not been given one cannot be handed private
notes.

**Unmarked belongs to both, and the first answer was wrong.** The first version
made unmarked mean work, reasoning that everything unmarked today is read by the
work half. Against a real notebook that breaks: the reference material - notes
from books about how to behave with people - is unmarked, and it is neither
work-confidential nor family-private. Scoping it to work would have removed it
from the private half's Knowledge view, silently, in the half where that view is
the whole point. The rule that matches what a mark means: marked private is
private, marked work is work, unmarked is shared. Nothing he has declared private
reaches work; nothing he has declared work reaches private; and an unmarked
category is one he has declared nothing about, so the tool does not guess - the
honest answer to "should this be private" is to make marking it easy.

**How the shape was settled.** By driving the running app in the private half over
the debugging protocol and reading what the page actually said, rather than by
reasoning about it. The relationship dropdown, the person page's buttons and
blocks, the palette with nothing typed. Two of the checks written from that pass
had encoded the earlier, wrong design - that the private half has no People view -
and failed, which is what they are for.

## 2026-08-27 - A view a half does not have is removed from the rail, not hidden

The private half drew every work entry in the rail. Clicking one bounced to this
half's home view, and the last one clicked kept its hover highlight - looking
selected while a different view was open.

**Why `hidden` did nothing.** `[hidden] { display: none }` is a user-agent rule
at the lowest specificity there is, and `.nav-btn { display: flex }` beats it. The
attribute was set on every work entry and every work entry was on screen at full
size. There is now also a `[hidden] { display: none !important }` rule, so the
next thing to reach for the attribute is not caught by the same trap.

**Removed rather than styled away.** A button that is not in the document cannot
be clicked, cannot be styled back into view by a later rule, cannot be found by a
selector, and cannot hold a hover state. Nothing here has to be undone later: the
half is chosen at launch and switching it restarts the app. Hiding would have left
four of those five failure modes open.

**The check that reported success.** The private-half harness asserted
`button.hidden` - the attribute, which was correctly set - while the buttons were
visibly on screen. An element was asked what it thought rather than what it was.
It now measures the box and also asserts the entries are gone from the document,
and that version was run against the broken build first and observed to fail.

**Fifth of the kind today, and the third that was mine.** The pattern is now
written down in memory: a check that reads a property instead of the rendered
result, an async body under a non-awaiting runner, a selector meaning "wherever it
happens to be", comparing the wrong two things. The rule that catches all four is
the same - break the thing and watch the check go red before believing it.

## 2026-08-27 - Reference material belongs to neither half, and the tag is its boundary

The scope rule shipped earlier today emptied the work half's practice block
completely. It is fixed by adding a third scope that is not a half: principle
notes are read from every category, in both halves, and the principle tag rather
than the folder is what bounds that read.

**How total the regression was.** Against a real notebook, every principle note
sat in a privately-marked category - the reading and the practices, twenty-five
notes between them - because marking those private is the obvious thing to do
with your own reading. So the work half's prep cards lost the practice block
entirely, and its knowledge view had nothing but colleague notes to search.
Nothing failed anywhere; the numbers were just zero. It shipped in two releases.

**The mistake underneath it.** The scope mark was read as answering "which half
of my life is this about". It does not. It answers "is this work". Notes from
books, and practices being worked on, are neither work nor family - they are
about the person keeping them, which is a third kind of content that the first
version had nowhere to put.

**Why the tag makes it safe.** A principle-tagged note is one somebody
deliberately marked as a practice they are working on: a statement about their
own behaviour, not a fact about a colleague and not a fact about their family.
Only tagged notes cross. Untagged material stays inside its half, which is where
the leak that actually matters lives - a note about somebody's family answering a
question asked at work.

**What stayed strict, and must.** Folder lists, bindings and contact indexing.
Those are about people and belong to a half; a private folder offered as a
binding for a colleague would import notes about somebody's family as work
contact. A test asserts the reference scope never reaches them.

**The knowledge search reads its own half plus the reference material.** Its
original design note - that books and people are not separated, because which one
bears on a situation is not knowable in advance - is what the first scoping
broke. It now merges the two reads and deduplicates, and reports the count it
actually searched rather than the half's count, because that number is shown on
the screen.

**Two tests had to be rewritten rather than repaired, and both had encoded the
rule being replaced.** One asserted that a privately-marked folder's principles
were invisible to the work half, which was exactly the bug. Its surviving half -
that the folder is not bindable from the work half - is the claim worth keeping,
so it now makes only that.

## 2026-08-27 - An evening may say who it was about, and the accent bar is a border

Three fixes from using the private half: a person's page had nowhere to record
that anything had happened, the rail left green flecks behind, and the Knowledge
view offered a work example in the private half.

### Naming who an evening was about

*Superseded within the hour, twice. See "A moment is an event with people in it"
below for what this became and why. Kept because both wrong turns are worth
knowing.*

A person's page in the private half could say what was promised them and nothing
about how it had been going. There is no "log a contact" there on purpose -
contact feeds cadences and there are none - and no "record an observation",
because an observation records the other person's state, which is what that
half's one rule forbids. Which left the honest answer to "how do I log something"
as "write the day", and the day pointed at nobody.

The first attempt was a checkbox per person on the DAY's entry.

### The rail's green flecks

The 2px accent bar on the current entry was `box-shadow: inset 2px 0 0`. The rail
sits at a fractional vertical offset, so the shadow's antialiasing at the rounded
corner landed one pixel OUTSIDE the button's own box - and that pixel is not in
the rectangle Chromium repaints when the element changes. Every entry that had
ever been current kept two green specks at the ends of its corner arcs, for the
life of the window.

It is now a `border-left`, transparent on every entry and coloured on the current
one. A border is part of the border box: painted and cleared with the element,
with nothing left to strand. Verified by counting non-background pixels in the
strip left of the buttons - twenty-one before, none after.

Worth carrying as a shape rather than as this one bug: an inset shadow on a
rounded box at a fractional position can paint outside the box, and anything that
paints outside its own box can be left behind.

**Two wrong diagnoses came first, and both were stated too confidently.** The
attribute-not-hiding bug was real and fixed, and it was claimed to be the cause
of the flecks as well; it was not. Then a stuck hover state on a phantom button
was reproduced and treated as the same thing; it was not either. What settled it
was reading the actual pixels rather than the DOM - the flecks were never
elements, so every DOM probe came back empty and looked like a clean result.

### An example belongs to its half

The Knowledge placeholder is the only instruction anybody reads on that page, and
it was a work situation in both halves. An example from the wrong half does more
than look careless: it tells you what sort of question the box wants, so it
teaches the wrong use of the feature in the half where the feature is newest.

## 2026-08-27 - A moment is an event with people in it, and the day is still the day

Two wrong shapes preceded this one, both mine, both found by him within minutes
of use.

**First: people on the day's entry.** The day is a whole-day retrospective, so
ticking four names put one day's text - which may not be about any of them - onto
four people's pages. An answer built from that is worse than no answer. He spotted
it as a question: does the day not mean the whole day?

**Second: a moment tied to one person.** Better, and still wrong. Most of what is
worth writing down involves several people at once - all the children - and one
person per moment means writing the same sentence three times. That kind of cost
does not make a feature slower to use; it stops it being used.

**What it is now.** One event, dated to the day it happened on, naming everybody
it involved. Written once, shown on each of their pages, and each of them says who
else was there - because "this was all of you" and "this was you and me" are
different memories. A day holds as many as it holds.

**Why it is not the day, and the day did not change.** The day stays one entry per
day, replaced, naming nobody. That rule exists because the pass over it counts
DAYS: three rows for one Tuesday makes every count wrong and makes a catching-up
evening look like three days of habit. Two actions on that page, and they are two
different acts: a retrospective written in the evening, and an event logged when it
happens.

**Why it is not the work half's observation.** An observation exists to be the
material a review conversation is built from, so it is about the other person.
This is the other thing: what happened, and the half of it that was his.

**Two text fields, and the second is the whole point.** `part` is required and
`what` is not. One box would let the own-part half go unwritten, and the rule this
half is written under only holds if it gets written - a form is where that becomes
structural rather than remembered. "I was short with them" is a complete entry;
"they slammed the door" cannot be saved at all.

**Everybody named must exist, and one unknown name refuses the whole thing.**
Quietly keeping the ones it recognised would store a moment that reads as complete
and is missing a person.

**A tie-break on the write time.** Two moments on one day sort equal by date, and
`sort` is then free to order them however it likes. Found by a test asserting the
second of two same-day moments came first, which it did not reliably.

**Deliberately not built: splitting a shared moment per person with a model.** He
raised it, and the multi-person moment removes most of what it was for - one write,
appearing on each page, saying who else was there. What is left is a real risk: a
model asked to divide one sentence into per-person prose is inventing attribution,
which is the plausible-but-wrong record this app refuses everywhere else. If it is
built, it belongs on the same footing as a brief - shown, and never stored.

## 2026-08-27 - Several people are picked from one collapsed list, and each half has its own mark

### The picker

A checkbox per person put seven rows in a dialog that also holds two text boxes
and a date. The picker became the tallest thing in it and the two fields that
matter went off the bottom.

**Not a native `<select multiple>`,** which is the obvious reading of "a dropdown
with multiselect" and would have been smaller still. It costs ctrl-click: every
option after the first needs a modifier, and clicking one plainly clears the rest
without saying so. In a form filled in a hurry that is a way to lose an answer
and not notice.

**A `<details>` disclosure with checkboxes inside.** One click per person, one
line when closed, and the summary names who is chosen so it does not have to be
opened to be read. Native rather than a scripted popover: keyboard support comes
free and it cannot fight the dialog for clicks.

**Collapsed always, including when nothing is chosen.** The first version opened
it in that case, reasoning that a required field should show its options - which
put the full list back on screen in exactly the situation the collapse was for,
since nothing is chosen when a form opens. The summary line is the affordance and
the field being required means an empty answer is refused out loud.

**The summary is recomputed as boxes are ticked.** Without that it reports what
was chosen when the dialog opened, and "Nobody chosen yet" sitting above three
ticked boxes is a worse state than no summary at all.

### And the decision ledger's consulted field

It was a comma-separated text box with the valid names listed in its hint. That
cost a whole filled-in decision earlier the same day: the service refuses a name
it does not know, and the dialog closed on the refusal and took four fields of
prose with it. `attempt` fixed the second half of that failure - the form stays
open now - but the first half was always the field's fault. **A name that cannot
be mistyped cannot be rejected.**

It also removes a derived list rendered as prose inside a hint, which is the shape
this project keeps being bitten by.

### A mark per half

The header mark and the window icon both follow the half. The window icon is the
one that earns its keep: it is the only marking of the two halves visible when the
app is not focused, because a title needs the window fronted to be read and a
taskbar shows a picture.

**The private mark is a hand holding a heart, where the work mark is a hand
holding a flame.** Two silhouettes, not two colours - which was the first attempt
and was the wrong answer to the question. A recoloured copy of the same drawing
differs only in hue, and hue is the thing that survives least well at 16px and is
useless to anybody who cannot tell those two hues apart. The generator still
writes a tint when there is no artwork at all, because a default has to exist, but
it says out loud that it is one.

**Recoloured on top of the new silhouette anyway.** The two halves now differ on
both axes, which is the whole reason for a second mark: two windows open at once
must not be mistakable for each other, and either signal alone can fail - colour
to a colourblind reader, silhouette to a glance at 16px.

**How the supplied artwork was made usable, because it will happen again.** It
arrived as a JPEG with its transparency PAINTED - a grey checkerboard baked into
the pixels - portrait, and mostly empty canvas. Used as it was, the icon would
have carried grey squares and the mark would have been a thin diagonal smear in
the taskbar. So: Electron's own decoder for the JPEG, since the icon pipeline
reads PNG; the background keyed on SATURATION rather than lightness, because the
mark is one flat colour and a checkerboard is greyscale whatever its brightness;
then cropped to the mark's own bounding box and padded to a square with an even
margin.

**It survives 16px better than the work mark does.** Checked rather than assumed,
by rendering both at 16 and 24 side by side: the heart keeps its notch and the
hand stays readable, where the flame's counters close up. Which is a small
vindication of the trade recorded above - a bitmap cannot drop detail for the
small frames, so the only lever is a silhouette that has less to lose.

**The header falls back to the work mark rather than to a broken image.** The
artwork is optional, and a missing file must degrade to "looks like the work half"
instead of to "looks broken". The private harness asserts the mark LOADED as well
as which file it points at, because a check that only read the `src` would pass
over a broken image.

**The window icon is passed only when the file exists.** An `icon` pointing at
nothing gives a window with no icon at all, which is worse than the packaged
default - and in development there is no packaged default to fall back to.
