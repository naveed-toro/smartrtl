# The paper - outline

A working document, not the paper. For every section it says what the section **claims**,
what **evidence** already exists, what evidence still has to be **built**, and what a
reviewer will **attack**. Nothing gets written into the paper that has no row here.

Working title (to be decided):
*Text that writes itself: deciding right-to-left direction for streamed, machine-written text*

---

## The paper, in the owner's words (2026-09-17)

The problem is decades old, and in the AI era it hurts every day. We studied a large sample of
real AI chat answers. On it we ran every formula the world has adopted and every one that was
proposed, and we record which formula each AI chat uses today. Then our proposal:

1. **Text that starts right-to-left is right-to-left at once** - as the bidi algorithm does.
2. **Text that starts left-to-right is checked over an opening stretch**: if no right-to-left
   word has arrived by the end of it, it is left-to-right; if one has, it is right-to-left.
   **How long that stretch is, we measured** on the sample.
3. **Whatever the formula, a streamed text shows one direction until the decision is made and
   another after.** Whether a reader can see that turn in real streaming is measured; only if
   they can does the paper propose holding a block until its decision is final (the way
   browsers already hold text while a web font loads, the `font-display` block period).

---

## Who has to say yes

| who | what they decide | what they will need |
|---|---|---|
| Browser engines (Blink, WebKit, Gecko) | whether it is built | cost, compatibility, a test suite |
| WHATWG (HTML) / CSS WG | whether it enters the standard | use cases, no breakage of `dir="auto"` |
| W3C Internationalization WG | whether it is recommended | all RTL scripts, no language lists |
| Unicode Technical Committee | a higher-level protocol note (HL1) | stability: P2-P3 unchanged |

Three lessons from history shape the proposal:

1. **Nothing old is changed; something new is added.** Unicode 6.3 added isolates instead of
   changing embeddings [UAX9]. `dir="auto"` stays exactly as it is; the proposal is a new value.
2. **One good default, not a menu.** `autodirmethod` was not accepted [MOZ-548206 c34].
3. **Evidence, not opinion.** Earlier proposals were never measured - word count was "untested
   for other languages", character count "untried and unproven" [HTML-BIDI-REQ].

---

## Structure (owner, 2026-09-17)

The paper makes **three points**, in this order of importance, and every earlier proposal it
builds on is cited. Around them: the problem, what was studied, and the lab - the paper comes
with everything working, so the people who decide for the whole world do not have to trust
our numbers; they can see the problem, and each answer to it, with their own eyes.

| | part | what it proposes |
|---|---|---|
| intro | the problem, and what we studied | - |
| **1** | **Formulas** - adopted, proposed but never adopted, ours, and the final one | the formula that should decide a text's direction |
| **2** | **Streaming** - does text visibly turn over while it arrives? | measured first: if the eye cannot see it, the formula alone is enough; otherwise hold, only where needed |
| **3** | **Lists and tables** - their problems, and what solves them | markers on one side, every line readable |
| | the proposal to the standards | the three together, as spec text and tests |
| | try it | the lab |

---

## Introduction

### I.0 Why this is worth anybody's time (the owner, 2026-09-18)

The case the paper opens with, in the owner's words, written down here so the rest of the
document serves it:

- **Nobody meant to leave these readers out.** More money and more first-class engineering has
  gone into these systems than into almost anything else being built; whole countries treat the
  race as a matter of standing. That is exactly why the gap is worth naming: it is not
  indifference, it is a defect nobody measured.
- **Understanding every language is the point of the thing.** A model takes a question in any
  language, spelled any way, typed at any speed, mistakes and all, and answers it. A reader
  whose language runs right to left gets that same answer - and cannot read it, because the
  line is laid out the wrong way round.
- **This is not about weak English.** A person may write English perfectly and still think in
  their own language, and still read an answer in their own language faster and with less
  effort. Given the choice, people ask in the language they think in.
- **What is left to them.** Writing their own language in Latin letters. Urdu in `abc` can be
  read, but nobody enjoys it for long: it tires the eye, and it is a second-class way to use a
  first-class tool. *(Measured since, and it is not what most of them do - see below. The point
  the paper keeps is the one the measurement supports: they bring their own script, and it is
  their own script that comes back laid out the wrong way round.)*
- **And the deeper irony:** for decades the web never gave anyone a rule that gets this right.
  Proposals came - and were refused, not against evidence, but against doubt. Neither side
  brought a measurement. So the question simply stopped moving, and it is the AI era that has
  made the cost of that daily.

**What is cited already** (references.md, "Why this matters"):

- Reading in a second language is slower and costs more: "L2 reading is generally slower and
  more effortful than reading in the native language (L1), often involving additional cognitive
  load" - and it holds "even for highly proficient readers" [L2-READING]. That is the answer to
  "their English is good enough".
- Latin letters are not a free substitute for a reader's own script: in the Arabizi condition
  readers "performed well with narratives but poorly with expository texts, showing that script
  familiarity aids informal reading but not academic comprehension" [ARABIC-ORTHO]. Chat answers
  - explanations, instructions, code - are expository text.
- Writing one's own language in Latin letters is a real, lasting practice, not a curiosity, and
  its prevalence differs by region and age [ARABIZI-USE].
- These readers are not a niche of the people using these systems - they are the majority
  direction of travel. OpenAI's own data: "Users predominantly using a language other than
  English now represent over half of active users. The leading non-English languages on ChatGPT
  are Spanish, Portuguese, and Arabic" - **a right-to-left language, third**, and the fastest
  relative growth is in Africa, in Asia and in lower-HDI countries [CHATGPT-LANG]. A rule that
  leaves right-to-left text laid out backwards is failing a growing majority's languages, in the
  markets where the growth is.

**Still owed, and not to be written as a finding until it is in hand:**

1. **How many people read right-to-left scripts.** Cited so far: Arabic is "used daily by more
   than 400 million people" and has been an official UN language since 1973 [SPEAKERS-AR], and
   the places where these scripts are daily life hold, by the World Bank, 503 million people in
   the Arab world, 255 million in Pakistan, 92 million in Iran and 10 million in Israel
   [POPULATION] - people, not readers, and the paper says so. Per-language reader counts for
   Urdu, Persian and Hebrew are still owed: Pakistan publishes them in a PDF no script can read,
   and India, Israel and Iran could not be reached at all [SPEAKERS].
**Measured, and it went the other way** (results/README.md, romanized.json): on 11,823 user
turns in Arabic, Persian, Hebrew and Urdu conversations, **95.9% hold the writer's own script**;
only 3.6% are Latin letters alone, and 409 of those 421 turns were written by someone who writes
the script elsewhere in the same conversation. People are not pushed into `abc` here, and the
paper says so. What the same measurement gives instead is stronger: their own script is what they
write to these systems, so it is what they read back - and **one turn in five (21.9%; Hebrew
49.0%) mixes both directions inside a single message**, which is exactly the case the whole paper
is about, typed by the reader themselves.

### I.0.2 Who this hurts, and what they do about it (the owner, 2026-09-18)

The owner's account of the readers he knows, kept here with what supports it and what does not.
It is about Urdu in Pakistan; the paper will say so, and will not stretch it to other languages.

- **Not everyone who speaks the language reads it.** A large part of the population never
  finished school - or never went - and cannot read Urdu script comfortably even though they
  speak Urdu. For them `abc` is not a preference, it is the only way in. **To cite:** the
  literacy rate and the out-of-school figure from Pakistan's own statistics, and the reading
  levels the ASER household survey measures.
- **The habit has a history.** Urdu in Latin letters is what the SMS years on keypad phones
  taught a generation, because those phones could not write the script. **To cite:** a source
  on Urdu SMS and keypad input.
- **Then came a writing era.** Facebook made ordinary people write Urdu again, in its own script
  and in `abc`, and reading each other's posts and comments became a daily habit - fading now as
  video takes over, but not gone. **To cite:** a source on Roman Urdu on social media and the
  objections to it ("write it in ا ب پ, I cannot read this").
- **And the readers who do read the script are exactly the ones these systems fail.** The people
  who write and read Urdu well are the ones asking a model in Urdu - and getting an answer laid
  out backwards. What they can do about it is skip the line, or ask the chat to send it in Latin
  letters instead.
- **The two shapes of that answer, in the owner's words:** English first and then Urdu can still
  be read, with effort. English, then Urdu, then English again is not read at all.

**Measured for the last point** (results/README.md, switches.json): the second shape is the
common one, not the rare one. **80.2% of the mixed lines in Claude's Urdu answers, and 66.4% in
ChatGPT's Arabic, Persian, Hebrew and Urdu answers, change direction more than once.** Among the
lines that open left-to-right - the lines every formula in this paper argues about - 55.1% and
32.7% do. So the reader's hardest case is most of what these systems produce for them.

**One more of the owner's observations, to test, not to assert:** an Urdu reader usually leaves
the phone and the laptop in English, while Arabic and Persian readers more often set the
interface to their own language. If that holds, the Urdu reader meets an English interface and a
right-to-left answer in the same window - which is the worst arrangement for this fault. Nothing
in the corpus can show this; it needs its own question put to real users.

### I.0.1 What this work adds, and what it still cannot do

The paper does not argue from opinion. It eliminates:

- **The counting formulas** - word count, character majority, majority of prose - go back on
  their own answer while it streams: the text is read one way, jumps, and comes back. Measured:
  Google's word count on 9.1% of Claude's mixed texts and 5.5% of ChatGPT's; character majority
  on 22.6% and 13.5% (results/README.md, run 3). Private developers building their own fixes
  today land in the same place, for the same reason.
- **First strong** - what HTML actually adopted - never goes back, and is wrong on 10 of the 16
  lines of a single ordinary Urdu answer in the lab.
- **What is left** are four rules that only ever move one way: Any RTL, this project's first
  rule, and Firefox's window at 63 and at 45 letters. They agree everywhere except 493 texts,
  and those 493 were read one by one.
- **The answer is 63** - fantasai's number for Firefox in 2010, refused then for want of
  evidence, measured now: 139 of 447 judged lines wrong, against 45's 160. This work's own
  earlier suggestion, 45, is rejected here by this work's own data (decisions.md 53).

**And the limit, stated in the paper itself:** an English sentence that carries a right-to-left
phrase inside its first 63 letters is still laid out right to left. That is not a bug in the
rule; it is the cost of a rule that can decide a half-written line and never take it back. No
formula over letters can have both. Saying so plainly is part of the proposal: this fixes most
of the problem, measurably, and names the piece it does not fix.

### I.1 A decades-old problem, and why AI made it daily

- **Claim:** every answer so far assumed a human author holding the control (an editor's
  direction button, an RLM typed before a post, a site author's `dir`). Now the author is a
  model, the reader cannot edit the text, and it streams.
- **Have:** the history, 1992-2026 (formulas.md, references.md); first strong was defended in
  2011 on how *people* write - "only in convoluted speech would one ever start a sentence in
  an RTL language with LTR text" [MOZ-548206 c35] - and 1,711 of 5,065 model-written mixed
  texts start exactly that way; the HTML standard calls its own rule "very crude" [HTML-LS].
- **Build:** the same figure on source B (WildChat).
- **Attack:** "a niche." Answer with the sample sizes and the chats in part 1.1.

### I.2 What we studied

- **Claim:** a sample large and varied enough to speak for AI chats, not one product.
- **Have:** source A - 1,369 Claude answers, Urdu, 5,065 distinct mixed texts (corpus.md).
- **Build:** source B - WildChat-4.8M (ODC-BY, real ChatGPT conversations with consent):
  exact counts of Arabic, Persian, Hebrew, Urdu conversations over the whole dataset
  (indexing running), and a reproducible sample of them turned into units.
- **Attack:** "old models / one language." Answer with both sources, per model and per
  language, and with what each cannot show.

---

## Part 1 - Formulas

### 1.1 Adopted, and in use today: which formula each AI chat uses

- **Claim:** a table - product, what it does to an answer's direction, checked on the date.
- **Have:** public reports that some use first strong or nothing (claude-code #75196,
  openclaw #147732, hermes-agent #51318, Telegram #3845) - reports, not measurements. The
  owner's screenshot of ChatGPT (temporary chat, 2026-09-17) with the survey's test message
  *looks* like first strong per block: Urdu lines opening with an English word sit on the left,
  the line opening in Urdu on the right - seen, not yet read from the page with probe.js.
- **Build:** for each chat (ChatGPT, Gemini, Claude, Copilot, DeepSeek, Grok, Meta AI,
  Perplexity, Mistral Le Chat, Qwen): open it, send the same mixed test messages, and read
  from the page itself what it sets on a message - `dir`, `unicode-bidi`, `text-align` - with
  one script, saved with a screenshot and the date. The owner runs it where a login is needed.
- **Attack:** "it changed since." Answer: the date, the script, and anyone can re-run it.

### 1.2 Proposed, never adopted

- **Claim:** every formula put forward since 1999 and not adopted, with who, when, where, and
  what happened to it - cited from the source (formulas.md, references.md).
- **Have:** the table in formulas.md; the decisive record that HTML "did not accept the proposal
  to add some way for the page to choose the algorithm" [MOZ-548206 c34].

### 1.3 Every formula, measured on the sample

- **Claim:** adopted and proposed formulas, one by one, on the sample: how often each is
  right, and what it does while text arrives.
- **Have:** twelve formulas in one file, run by the lab and the measurements alike
  (rules/rules.js). Streaming, measured: every counting formula goes back on its own answer -
  Google's word count on 9.1% of texts, character majority on 22.6% - while first strong,
  any-RTL and SmartRTL never do (results/README.md).
- **Build:** correctness against labels; the same on source B.
- **Attack:** "the labels are yours." Answer: the guide, a second labeller, published labels.

### 1.4 Ours, and the final formula

- **Claim:** starts right-to-left → right-to-left at once; starts left-to-right → left-to-right
  unless a right-to-left word arrives within the opening stretch of N words.
- **Have:** the family already runs in the lab ("Opening words"). Measured: in texts starting
  left-to-right, the first right-to-left word arrives by word 2 in 71.2%, word 3 in 90.2%,
  word 5 in 97.4%, word 10 in 99.1% (results/opening.json).
- **Build:** **N from data, not chosen.** Labels on the texts whose first right-to-left word
  comes after word 2 (489 in source A) show where Urdu sentences with long English openings
  stop and English sentences with an Urdu phrase begin; N is where they separate. The same on
  source B. Then its correctness against every formula in 1.3.
- **Attack:** "N is tuned to your data." Answer: N from one part of the labels, tested on the
  other; the same N checked on another language.
- **Decision:** direction.js stays frozen until the owner chooses, with these numbers.

---

## Part 2 - Streaming: is holding the stream needed at all?

### 2.0 Answered (2026-09-17): no hold

The fear that started Part 2 was a misunderstanding, and the measurements put it to rest.
**A turn is never a separate event** (the owner's reading): a one-way formula turns a block only
because a right-to-left letter has just arrived, so the turn and that new text are painted
together. While an answer streams, text is already moving on the screen, and a block settling to
the right as its Urdu arrives is seen as part of that arrival - part of the stream - not as a
change. It needs no particular machinery. It has one limit, and the eye test found it: when
the English opening stands alone on the screen for four frames or more before its Urdu arrives, the
turn was mostly noticed; in real streams the opening does not stand alone that long. In the owner's eye test no turn of one or two
frames was noticed; in Claude Code's real panel, across about fifty answers written to include
the hardest case, one turn was recorded and it was never painted the other way (0 frames;
docs/decisions.md section 52). **The formula alone is the proposal; no hold is proposed.** The
recorder and the lab's eye test and hold control were then taken out (extension 0.8.0, lab
version 8); their readings stay in results/README.md. The plan below is kept as the record of
how the question was asked.

**Turning is not the disease; going back is (the owner, 2026-09-17).** A line that turns once, one
way, turns while its text is pouring in, and the eye takes it as part of the arrival. A line that
goes back is different: it has already been read in one direction for several tokens, then jerks
to the other side, then back again as more text comes - the text is seen jumping right and left.
That is what a reader of a streamed answer notices, and it is what only the counting formulas do:
on the sample, Google's word count goes back on 9.1% (Claude) and 5.5% (ChatGPT) of mixed texts,
character majority on 22.6% and 13.5%, majority without links on 20.7% and 12.0%, majority of prose
on 16.6% and 9.2%; first strong and the opening-letters formula never do (results/README.md, run
3). So the property the proposal rests on is not "never turns" but **"moves one way only"** - and
the lab puts *went back* beside *right* and *wrong* for every formula.

**The limit of that evidence (found the same day).** A rhythm recording in Claude Code's panel
(survey/results/claude-code-rhythm.json) shows that it does not paint an answer token by token:
the answer arrived in three pieces of 633, 134 and 1,140 characters, about a second apart. A
block there reaches the screen whole, so it cannot be seen turning - the panel's rendering hides
the question rather than answering it. The real test is a chat that paints token by token:
record the browser chats (ChatGPT, Claude.ai, Gemini) with survey/rhythm.js, and test the
formula there, as the Chrome extension will. Until then Part 2's answer rests on the eye test
and on the argument that a turn arrives with the text that causes it.

### 2.1 The owner's decision (2026-09-17)

**If the human eye does not notice the turn in real streaming, the stream does not need to be
held, and the formula alone is the proposal.** In more than fifty versions of the extension on
Claude Code, whose first formula also turned a block once, the owner never saw a block turn;
the turns are seen in the lab only because its speed can be slowed. A standard should not ask
browsers for something nobody can see.

So Part 2 is decided by measurement, in three steps:

1. **How long a wrong direction really stays on screen.** Record real chats while an answer
   streams - Claude Code's panel, ChatGPT, Gemini: the size of each chunk and the milliseconds
   between chunks. Replay the corpus (64,476 mixed texts) at those real rhythms through the
   proposed formula, and measure how many milliseconds a block shows the wrong direction before
   it turns - on average and in the longest 5% and 1%.
2. **How long a turn must last to be seen.** A blind test in the lab: the same streamed answer
   shown with and without a turn of a set length (one frame, two, five, ten ...), in random
   order; the viewer says only "turned" or "did not"; several viewers. Published perception
   research is read and cited alongside it, from the source.
3. **The decision, by that rule:** if nearly every real turn is shorter than a turn people can
   see, Part 2 becomes a finding - *measured: in real streaming the turn is not seen; the
   formula alone is enough* - and no hold is proposed. If some real turns are long enough to
   be seen, holding is proposed only for those, with their numbers.

- **Have:** the hold already measured as a cost (under one word on average, results/README.md);
  the formula's settle point, which makes a hold possible if it is needed.
- **Attack:** "you only looked at fast chats." Answer: the rhythms recorded, per chat, and the
  slowest case reported.

## Part 3 - Lists and tables

### 3.1 One side for the markers, every line readable

- **Claim (owner's decision, 2026-09-17):** a list's bullets or numbers stand on one side, the
  list's; they are never directed item by item, because a list whose lines start on
  alternating sides is not read as a list. The text of every item is still shown in its own
  direction, because the point of all of this is that the text can be read.
- **Have:** the 2009 proposal asked the same - "the rendering of numbering or bullets in a
  list should be independent of the direction of individual `<li>` elements" [L2/09-411 2.9],
  still "in progress" in the implementation record; the extension already draws a list this
  way with today's CSS (`direction` from the list, `unicode-bidi: plaintext` for the item's
  text), which means the item's text is decided by first strong, not by our formula; the
  owner's screenshot where one decision for the whole message turned English items
  right-to-left (decisions.md 7).
- **Build:** how often lists and tables mix directions in both sources; which item decides the
  list's side while it streams (a side that can never change once shown); the readability of
  each arrangement measured as order breaks in the browser (the introduction's measure); the same for
  a table's column order and its cells.
- **Proposal:** marker side from the list, item text from the formula - a browser change, since
  today only first strong can direct an item's text apart from its marker.

### 3.2 What a direction alone cannot fix

- **Have:** `250–400ms` → `400ms–250`, moved full stops, corrupted code (decisions.md 49).
- **Build:** the list of runs that need isolation, against `<bdi>` and Unicode isolates.

---

## Closing

### C.1 The proposal to the standards

- **Claim:** a new `dir` value (name to be decided) meaning "our formula, held until final";
  `dir="auto"` unchanged.
- **Build:** draft spec text; web-platform-tests-style tests; the lab as the reference
  implementation anyone can open.

### C.2 The tag is enough

- **Have:** the extension, `the-mirror` (113 elements, told only the tag); decisions.md 44-49.
- **Build:** the same on a second surface (the Chrome extension).

### C.3 Limitations

- Everything given up on purpose, in decisions.md; what each source cannot show.

### Try it - the lab, with the paper

- The lab: every formula, one click, your own text, streamed. The corpus scripts, the labels,
  the results.
