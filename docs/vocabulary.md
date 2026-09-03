# The words the app uses

The reported symptom was "jag vet inte vad många ord betyder". This document is
what could be said about it once every string was in one place, and it is the
input to the wording pass rather than the pass itself.

Slice 1 moved all 1104 strings into [`src/renderer/text.js`](../src/renderer/text.js),
namespaced by screen, changing none of them. That is what makes the question
below answerable at all: before it, "what does the app actually say?" meant
reading the markup of seventeen files.

## How this was surveyed

Every string in the module, rendered with placeholders where it takes a value,
then each candidate term counted with the screens it appears on. A term on one
screen is a name. A term on five screens in three senses is a decision waiting
to be made.

The script is not checked in - it is twenty lines against the module and easier
to rewrite than to maintain - but the shape is: import `T`, flatten it to
`{section, key, text}`, call every function key with `"X"` arguments, and grep.

## What the survey refutes

**The app is not full of jargon.** This was the working assumption and it is
wrong. The questions Tend asks are in plain first-person English, and the growth
dialogs - the ones nearest the reported confusion - are the best-written text in
the app:

- "What will you see in three months that you do not see now?"
- "Do they want this, or does the job need it?"
- "How did that land against your guess?"
- "Which real work does this happen through?"

And the cards summarise them in the same voice: "I will see", "Their words",
"Through", "My guess before asking", "I am putting in".

**Three terms that were expected to be the problem never reach the screen at
all.** `driver`, `stance` and `horizon` are internal names in
`src/domain/growth.js`; what renders is the question and the option labels
("They want it", "The job needs it", "Landed - same direction"). There is
nothing to rename.

So the pass is much smaller than it looked, and it splits cleanly into one part
that needs no decision and two that do.

## A. Five internal names that leak into the prose

Each of these names something real, is never the label on the thing it names,
and appears only in the sentences that explain a field. A reader meets the word
for the first time in an explanation of something else.

| Term | Said | Where | What the reader actually sees it called |
| --- | --- | --- | --- |
| `marker` | 4× | growth, reflection, model | the field asks "What will you see in three months…", the card says **I will see** |
| `thread` | 10× | people, growth, settings, waiting | the block is **Growing**, the button is **Open a direction** |
| `drift` | 6× | settings, focus, palette | there is no drift page; the view is **Now**, and Ctrl+K offers "from the drift log" |
| `stake` | 1× | work | the group is **Waiting to hear from you**, the button **Add stakeholder** |
| `verdict` | 2× | reflection | the field is **How you will know** |

Worst of them, because it is the only one a reader is asked to act on: the Ctrl+K
row **What needs you** carries the hint *"from the drift log"*, naming a place
that does not exist in the app.

**No decision needed.** Each sentence can say the thing rather than its internal
name - "the marker will measure the wrong person" becomes "you will be measuring
the wrong person", "from the drift log" becomes "from what is behind". Nothing
is renamed and no field changes.

## B. Three words carrying two meanings each

These are decisions, not bugs, and each one has a defensible answer either way.

### `half` - 17 sentences, 7 screens

Two unrelated senses, and they are close enough together to collide:

- **the app's mode**: "The private half", "The work half", "Which half"
- **your own part in something**: "which is the half you can change, and the
  only half worth keeping" (a moment), "The half that decides whether to chase
  or route around it" (why you are waiting)

The second sense is the better piece of writing and it is load-bearing - the
private journal exists to record your own part rather than somebody's state.
But it is the same word as the mode the app is running in.

### `waiting` - 18 sentences, 4 screens, three different things

1. **Waiting on someone** - a question you sent that has not come back
2. **Waiting to hear from you** - a stakeholder owed a report
3. **waiting commitments** - promises imported from notes that have no owner yet

One and two are opposite directions of the same idea, which is the confusing
part: on the same day the app can tell you both that you are waiting and that
somebody is waiting. Three is unrelated and only appears after an import.

### `level` - 11 sentences, 2 screens

Inside the app this is unambiguous: how closely you follow up on delegated work,
five values from the domain. Outside it, "level" is the IC ladder - which came up
in a real conversation this month and is a live open question at work. The
collision is with the world, not with another part of Tend.

## C. Two words for the same family, on purpose

`direction` (growth, 15 sentences) is a thing you want to become true for
somebody else. `aim` (reflection, 4 sentences) is one about yourself. `goal`
appears nowhere, which is the right call.

The split is deliberate and the surrounding text supports it - the aims block is
headed **What I am working on in myself**. Worth confirming rather than changing:
two words for two subjects is defensible, and one word for both would need a
qualifier every time it was used.

## What is not covered here

`index.html` holds the rail's labels and "Reading the log…" as static markup. It
was left out of slice 1 because scripting those at boot is a behaviour change
rather than a move, and a test in `test/text.test.mjs` now asserts the rail's
labels equal the names the palette uses for the same views.

## The proposed replacements for A

Written out rather than described, because "stop saying the internal name" is
only cheap if the sentence that replaces it is as good. Eleven sentences.

| Where | Now | Proposed |
| --- | --- | --- |
| `growth.rewordAimHint` | …If it describes what you do for them, **the marker will measure** the wrong person. | …If it describes what you do for them, **you will be measuring** the wrong person. |
| `growth.observedIntro` | **The marker**, actually observed rather than discussed. | **What you said you would see**, actually observed rather than discussed. |
| `growth.fAimHint` | Everything else about **this thread** can wait until you use "Prepare" on the card. | Everything else about **this direction** can wait until you use "Prepare" on the card. |
| `growth.fHorizonHint` | When it passes **the thread asks** whether this is still the thing. | When it passes **Tend asks** whether this is still the thing. |
| `growth.rewordIntro` | **The thread is named** after this. | **The card is named** after this. |
| `reflection.setIntro` | …where **its verdict** comes from. Without a source it can only ever be kept to next time, which is what **a development point with no marker** becomes. | …**how you will know**. Without that it can only ever be kept to next time, which is what **a development point with nothing to see** becomes. |
| `reflection.aimsEmpty` | An aim says what you want to be able to do and where **its verdict** comes from… | An aim says what you want to be able to do and **how you will know**… |
| `palette.whatNeedsYouHint` | from **the drift log** | from **what is behind** |
| `settings.privateWhy` | **Drift**, cadences, duties, prep and a focus budget are not here… | **What is behind**, cadences, duties, prep and a focus budget are not here… |
| `settings.draftingWithout` | **Drift**, cadences, promises and the focus budget are ordinary arithmetic… | **What is behind**, cadences, promises and the focus budget are ordinary arithmetic… |
| `work.archiveProjectBody` | Every check-in, **stake** and review already logged against it… | Every check-in, **stakeholder** and review already logged against it… |

Three uses that look like the same fault and are not, so they stay:

- "When something **drifts**, it appears here and nowhere else" and "Who has
  **drifted** or is owed something" - ordinary English verb, not the mechanism's
  name.
- "Real **stakes** move people; courses feel like it" - a different word that
  happens to share a stem.
- "It asks questions rather than reaching **verdicts**" - also ordinary English,
  and in the one place where saying the app does not reach verdicts is the
  point.

## The three questions

Group A above needs no answer - it is the same words the reader already sees.
These do:

1. **`half`.** Keep both senses, or find another word for one? The mode is the
   one that could move ("the private side", "private mode"); the other sense -
   your own half of what happened - is the better writing and is load-bearing.
2. **`waiting`.** The app can say on one day that you are waiting on somebody
   and that somebody is waiting on you, in the same word. Rename one direction?
   "Owed to you" and "Owed by you" is the obvious pair and is uglier.
3. **`level`.** No collision inside the app. It collides with the IC ladder
   outside it, which is currently an open question at work. Leave it, or say
   "hand-over level" wherever it appears alone?

## What A actually took, once it was applied

Twenty sentences, not eleven. Three things the survey's counts hid, all of which
only reading each hit could have found:

**The proposal table missed the two places an internal name is a label rather
than prose.** The journal's ledger printed **Growth threads discussed** and
**marker seen 3×** - which is exactly the shape the survey had just declared did
not exist. They are now **Directions discussed** and **seen happening 3×**.

**Six of `thread`'s ten hits were the module's own comments**, which should say
`thread`, because that is what the domain calls it and whoever edits the file
needs the connection. The other four were sentences a reader sees. A count could
not tell them apart.

**"growth thread" survived two passes because it reads as ordinary English.** It
appears in the three archive bodies, listing what is preserved when somebody or
everybody is archived. But a reader archiving a colleague has never seen the
word, and `direction` is the one they have - so all three now say "growth
direction".

Four uses of `drift` remain and are meant to: "when something drifts", "who has
drifted", "a drift nobody noticed", "not a drift". All the English verb or the
English noun, none of them the mechanism's name. `marker` remains only in a
parameter name and two comments; `verdict` only in "asks questions rather than
reaching verdicts", where saying it is the point.
