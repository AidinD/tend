# Decisions

Newest first. Each entry: the date, what was decided, what else was considered,
and why this won.

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

**What the pipsignee still fixes.** Pointing `build.win.icon` at a 512px PNG lets
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

## 2026-08-23 - Window chrome and the icon pipsignee come from keel

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
