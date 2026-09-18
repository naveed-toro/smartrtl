# Results

Measurements the paper will report. Each file here is written by a script in
`corpus/tools/`, holds counts only, and records the corpus snapshot and the formulas' file
hash it was computed from. Nothing here is edited by hand.

## romanized.json - how people write to a chat in a right-to-left language

`node measure-romanized.mjs --groups 200`. The corpus keeps only the assistant's turns, so this
reads the **user's** turns, from 200 row groups of the same dataset and revision (a seeded
sample, 6,102 conversations, 11,823 user turns). Only counts are kept; no message text is
written anywhere.

| | user turns | holds its own script | Latin letters only | mixes both in one turn |
|---|---|---|---|---|
| Arabic | 6,645 | 96.5% | 3.0% | 26.5% |
| Persian | 4,897 | 96.0% | 3.7% | 14.3% |
| Hebrew | 243 | 82.3% | 12.3% | 49.0% |
| Urdu | 38 | 78.9% | 21.1% | 15.8% |
| **all four** | **11,823** | **95.9%** | **3.6%** | **21.9%** |

**This does not support the claim it was built to test.** The introduction wanted to say that
readers are pushed into writing their language in Latin letters; on these chats they are not. They
write their own script - 95.9% of their turns hold right-to-left letters. The paper drops that
claim as a finding of ours and keeps only what is measured here.

**What it does show, and it is stronger:**

- **People bring their own script to these systems.** Nearly every message they send is in it, so
  nearly every answer they read is in it too - which is precisely the text these products lay out
  the wrong way round. This is not an edge of their usage; it is their usage.
- **One turn in five mixes both directions** (21.9%; Hebrew 49.0%, Arabic 26.5%) - a technical
  term, a file name, a link inside their own sentence. That is the case every formula in this
  paper is fighting over, and it is what people actually type.
- **Latin-only turns are rare, and they are not people who lack the script**: 409 of the 421
  Latin-only turns were written by someone who writes the script elsewhere in the same
  conversation. Whatever those turns are - English, a command, a pasted error - the person has
  their own script and uses it.
- Urdu and Hebrew counts here are small (38 and 243 turns); nothing is claimed from them alone.

## switches.json - how often a line changes direction more than once

`node measure-switches.mjs`. A line that opens in English and turns Urdu can still be read: the
reader starts on the wrong side and carries on. A line that opens in English, turns Urdu, and
turns back - and again - is the case the owner describes as the one nobody reads: there is no side
to start from, and the reader either skips it or asks the chat to send it in Latin letters.

| | mixed lines | change direction twice or more | open left-to-right | of those, twice or more |
|---|---|---|---|---|
| A, Claude answers (Urdu) | 5,144 | **80.2%** | 1,750 (34.0%) | **55.1%** |
| B, ChatGPT answers (Arabic, Persian, Hebrew, Urdu) | 60,699 | **66.4%** | 13,416 (22.1%) | **32.7%** |

**What it means.** The hard case is not the exception - it is most of the mixed text these systems
write. Two thirds to four fifths of mixed lines move between the two directions more than once,
and among the lines that open left-to-right - the ones every formula in this paper argues about -
a third to a half do. Whatever direction a formula gives such a line, the runs inside it are then
laid out by the browser around that choice, so the cost of choosing wrongly is paid several times
in one line.

## four.json - the four candidates on the chat data

`node measure-four.mjs`. Any RTL, our first formula, and Firefox's formula at 63 and at 45 letters
agree on every one-language text and every text that opens right-to-left, so they are compared on
the mixed texts that open left-to-right. In order of what matters to a reader: **wrong at the end**
(proxy until labels, as in x.json), **went back** (checked on every prefix), and **how late a
line turns** (every block of every answer). The 45 and 63 rows reproduce x.json exactly.

| | wrong, Claude (of 1,574) | wrong, ChatGPT (of 11,757) | went back | latest turn, Claude | latest turn, ChatGPT | blocks turned after letter 45 / 100, ChatGPT |
|---|---|---|---|---|---|---|
| Any RTL | 27 (1.7%) | 1,228 (10.4%) | 0 | letter 113 | **letter 1,054** | 363 / 87 |
| Our first formula | 27 (1.7%) | 1,236 (10.5%) | 0 | letter 114 | **letter 1,055** | 376 / 83 |
| Firefox's formula, 63 | 26 (1.7%) | **1,108 (9.4%)** | 0 | letter 63 | letter 63 | 163 / 0 |
| Firefox's formula, 45 | 33 (2.1%) | 1,115 (9.5%) | 0 | **letter 45** | **letter 45** | **0 / 0** |

**What this shows.**
- **Nobody goes back.** All four only ever turn one way, checked, not assumed.
- **The windowless two are not the most accurate.** On ChatGPT's answers they are wrong most
  often: every one of Any RTL's 1,228 mistakes is an English text shown right-to-left because an
  Urdu, Arabic, Persian or Hebrew word comes somewhere in it. A window stops that.
- **The windows trade two kinds of mistake.** 45 shows more right-to-left texts left-to-right (8
  and 92) and fewer English texts right-to-left than 63; in total they are 7 texts apart in 11,757.
- **The difference that is left is streaming.** Without a window a line can turn at any letter -
  a thousand letters in - after it has been read; with 45, never after letter 45. Half of all turns
  come by letter 8-10 under every candidate; the tail is where they part.
- Proxy, not labels: a text with 50% or more right-to-left words should read right-to-left, 20% or
  less left-to-right, and between is not counted.

### Choosing between the four - the rule, written 2026-09-17, before the first label

X = 45 was chosen when the paper still expected to propose holding a stream until the formula
settles, so waiting was a cost and the shorter window was preferred. Part 2 now proposes no hold
(outline.md 2.0), so waiting is no longer a cost, and the owner set the order of what matters:
**1. the direction left on the screen is right; 2. a line never goes back; 3. a line turns as
early as possible.** The proxy cannot decide the first: 45 and 63 are 7 texts apart. So:

- **What is labelled:** every text, from both sources, on which the four candidates do not all
  agree - 493 texts (20 from Claude's answers, 473 from ChatGPT's), in a fixed shuffle
  (`corpus/tools/four.mjs`, `npm run label -- --set four`). Where all four agree they are right or
  wrong together, so those texts cannot rank them.
- **The rule:** X is the window with the **fewest mistakes on the labelled texts, both sources
  together**; a window within **3 mistakes** of the fewest is chosen instead if it is **shorter**,
  because it settles earlier. Went back does not decide: all four are 0. Compared: every window
  from 45 letters up, and no window (Any RTL); our first formula is reported beside them.
- **Counting:** rtl or ltr - a mistake where the window gives the other; either - no mistake;
  neither - a mistake for every window alike; unclear - left out.
- **Applied** by `corpus/tools/score-four.mjs` only once every one of the 493 is labelled, and
  the result goes to `four-labels.json` whichever window it names - 45, 63 or another.

### First reading: the 493 texts read by the assistant (2026-09-17) - not human labels

`four-labels.claude-read.json`, labeller `claude`: the assistant read every one of the 493 texts
and said which drawing reads correctly (230 ltr, 116 rtl, 81 either, 46 unclear - garbled text
and bare LaTeX). A sentence followed by its own translation was labelled *either*. These labels
are a first reading for the owner to check; the paper's figure needs a person's labels.

| | wrong, Claude (A) | wrong, ChatGPT (B) | together | kind of mistake, B |
|---|---|---|---|---|
| Any RTL | 3 | 230 | 233 | 230 English shown RTL |
| Our first formula | 3 | 197 | 200 | 188 English RTL, 9 RTL shown LTR |
| **Firefox's formula, 63** | **3** | **136** | **139** | 92 English RTL, 44 RTL shown LTR |
| Firefox's formula, 45 | 15 | 145 | 160 | 38 English RTL, 107 RTL shown LTR |

Every window from 45 to 120: fewest mistakes at **X = 52 (133)**; the curve is 160 at 45, 135-142
from 49 to 63, and rises past 65 (163 at 80, 191 at 120, 233 with no window). **By the rule, X =
49** (135, the shortest within 3 of 133). On Claude's answers alone the fewest are at 80 and
beyond, because of one habit of this project's conversations (an English quotation, then Urdu).

### The owner's decision (2026-09-17): the proposal is Firefox's formula at 63 letters

The paper's case, in the order it is made in the lab: **machine 1** runs every formula over all
11,712 answers - the formulas that go back, or are wrong far more often, drop out, and four are
left (Any RTL, Firefox's formula at 63, our first formula, and 45). **Machine 2** runs those four
over the lines they disagree on, read one by one - and **Firefox's formula at 63 letters leaves
the fewest lines in the wrong direction** (139 of 447 judged; 45: 160; our first formula: 200;
Any RTL: 233). It was proposed for Firefox in 2010 and not adopted; the paper proposes it for
today.

Recorded plainly, because it departs from the rule written above: that rule, applied to every
window from 45 up, names **X = 49** (135 mistakes; the fewest, 133, at 52). The owner chose among
the four candidates rather than among all windows - 63 is an existing proposal, within 4 mistakes
of 49 and 6 of the fewest - and the labels behind all of these numbers are the assistant's first
reading, to be checked by a person. If the owner's own labels move the result, this is revisited.

## x.json - choosing X, the window in letters (the proposed formula)

`node measure-x.mjs`. The formula: **first letter right-to-left → right-to-left; first letter
left-to-right → right-to-left only if a right-to-left letter arrives within the first X
letters, otherwise left-to-right.** Words were set aside for letters: words differ in length
(six words were 25 letters in Claude's texts and 31 in ChatGPT's, 18 to 40 from text to text)
and are not defined the same way in every language.

For every X from 5 to 100 on both sources: **mistakes** among mixed texts starting
left-to-right (late: mostly right-to-left text whose first right-to-left letter comes after X;
early: mostly left-to-right text with one within X; proxy until labels), and **waiting**: the
letters a reader waits, averaged over every block of every answer, when a block is held until
decided.

| X | mistakes, Claude (of 1,574) | mistakes, ChatGPT (of 11,757) | letters waited per block, Claude | ChatGPT |
|---|---|---|---|---|
| 20 | 136 | 1,616 | 2.91 | 1.45 |
| 30 | 59 | 1,224 | 3.53 | 1.86 |
| 35 | 39 | 1,154 | 3.77 | 2.04 |
| 40 | 37 | 1,118 | 3.99 | 2.21 |
| **45** | **33** | **1,115** | **4.19** | **2.37** |
| 50 | 29 | 1,094 | 4.37 | 2.52 |
| 55 | 27 | 1,097 | 4.53 | 2.67 |
| 63 *(fantasai, 2010)* | 26 | 1,108 | 4.75 | 2.88 |
| 80 | 26 | 1,134 | 5.14 | 3.27 |

The fewest mistakes are at X = 60 (Claude) and X = 49 (ChatGPT); past about 45 the curve is flat
on both, while waiting keeps rising with every letter.

**The rule that chooses X, written before choosing:** the shortest window whose mistake rate is
within **half a percentage point** of the best window's, on **both** sources. That is **X = 45**.
How much the answer depends on that tolerance:

| tolerance | ¼ point | ½ point | 1 point | 2 points |
|---|---|---|---|---|
| X | 50 | **45** | 35 | 31 |

**What this shows.** 63 was not wrong - it sits on the same flat floor - but it was never
measured, and it makes a reader wait 22% more than 45 on ChatGPT's answers for no fewer
mistakes. **What it costs.** Every window this long turns an English sentence right-to-left
when a right-to-left word comes early in it: *"In Urdu this idea is called ایونٹ لوپ, …"* (the
phrase is letter 23) is right-to-left under X = 45, as under 63 - the case decisions.md 5 gave
up, now counted: most of the 1,115 mistakes above are of this kind. The labels will say how
many are real.

## Both sources, run 3 - went back, and the hold (Parts 1 and 2)

`node measure-streaming.mjs [--source B]`, by word: Claude's 5,065 and ChatGPT's 59,411
distinct mixed texts. **Went back**: share of texts whose answer returned to one it had
already given while arriving. **Held** (Part 2, the stream held until the formula can no
longer change): share of texts shown at once · mean words held · 95th percentile words held.
A formula with no settle point holds every block until it is complete.

| group | formula | went back, Claude | went back, ChatGPT | held, Claude | held, ChatGPT |
|---|---|---|---|---|---|
| adopted | First strong | 0.0% | 0.0% | 100% · 0 · 0 | 100% · 0 · 0 |
| adopted | First strong, per paragraph | 0.0% | 0.0% | 100% · 0 · 0 | 100% · 0 · 0 |
| adopted | Word count 40% (Google) | 9.1% | 5.5% | 0% · 23.6 · 58 | 0% · 18.98 · 51 |
| proposed | First strong, else RTL | 0.0% | 0.0% | 100% · 0 · 0 | 100% · 0 · 0 |
| proposed | Any RTL | 0.0% | 0.0% | 66.4% · 0.66 · 3 | 78.5% · 0.47 · 2 |
| proposed | Any RTL in 63 letters | 0.0% | 0.0% | 65.9% · 0.66 · 3 | 78.5% · 0.44 · 2 |
| proposed | Character majority | 22.6% | 13.5% | 0% · 23.6 · 58 | 0% · 18.98 · 51 |
| proposed | Majority without links (Telegram) | 20.7% | 12.0% | 0% · 23.6 · 58 | 0% · 18.98 · 51 |
| proposed | Majority of prose | 16.6% | 9.2% | 0% · 23.6 · 58 | 0% · 18.98 · 51 |
| ours | SmartRTL today | 0.0% | 0.0% | 65.8% · 0.67 · 3 | 78% · 0.5 · 2 |
| ours | Opening words (3) | 0.0% | 0.0% | 66.2% · 0.57 · 3 | 78.2% · 0.37 · 2 |
| ours | **Opening words (6)** | 0.0% | 0.0% | 66.2% · 0.61 · 3 | 78.2% · 0.42 · 2 |

**What this shows.**
- On ChatGPT's answers too, every counting formula goes back on itself: Google's word count on
  5.5% of texts, Telegram's on 12.0%, character majority on 13.5%. Held until final, they must
  hide every block until it is complete: 19 words on average, 51 at the 95th percentile.
- **Opening words (6) never goes back on either source** (the 0.2% of run 2 came from counting
  prose, which is gone), and held until final it shows 78% of ChatGPT's mixed texts and 66% of
  Claude's at once; on average a reader waits less than one word, at the 95th percentile two or
  three.
- These are mixed texts. A block with no right-to-left letter at all waits for the whole window
  (or its own end if shorter): 6.2-6.3% of all blocks in ChatGPT's answers, 12.3-12.6% in
  Claude's, whether the window is 35 or 63 letters.

## streaming.json, run 2 - every formula while text arrives (superseded by run 3)

`node measure-streaming.mjs`, 2026-09-17: the 5,065 distinct mixed texts of source A, each
replayed as its **Markdown source** arriving a character at a time and a word at a time
(inline code becomes code only when its closing backtick arrives, as on a real screen).
After every arrival holding a strong letter, each formula in `rules/rules.js` is asked.

**By word:**

| group | formula | final answer rtl | changed while arriving | **went back** | arrivals shown the other way (changed texts) |
|---|---|---|---|---|---|
| adopted | First strong | 66.2% | 0.0% | **0.0%** | 2.7% |
| adopted | First strong, per paragraph | 66.2% | 0.0% | **0.0%** | 2.7% |
| adopted | Word count 40% (Google) | 96.5% | 36.2% | **9.1%** | 23.3% |
| proposed | First strong, else RTL | 66.2% | 0.0% | **0.0%** | 2.7% |
| proposed | Any RTL | 99.9% | 33.5% | **0.0%** | 19.5% |
| proposed | Any RTL in 63 letters | 99.7% | 33.8% | **0.0%** | 19.2% |
| proposed | Character majority | 85.6% | 47.0% | **22.6%** | 31.0% |
| proposed | Majority without links (Telegram) | 86.0% | 44.8% | **20.7%** | 31.2% |
| proposed | Majority of prose | 92.1% | 42.7% | **16.6%** | 27.1% |
| ours | SmartRTL today | 99.8% | 34.0% | **0.0%** | 19.1% |
| ours | Opening words (3) | 97.9% | 31.8% | **0.2%** | 18.6% |
| ours | Opening words (2 of 5) | 96.8% | 30.6% | **0.2%** | 25.9% |

By character the picture is the same (went back: Google 9.1%, character majority 23.2%,
Telegram 21.4%, prose 23.9%, opening words 0.3% and 0.3%); SmartRTL changes on 99.2% there
because its rule waits for a second right-to-left letter.

**What this shows.**
- Every counting formula ever proposed to fix first strong goes back on its own answer while
  text arrives - on 1 text in 11 (Google's) to nearly 1 in 4 (character majority). A reader
  sees the text turn over and turn back.
- The formulas that never go back are first strong and its variants, any-RTL and SmartRTL -
  and those are the ones whose correctness is in question.
- Our two opening-words candidates go back on 0.2%: 12 and 8 texts, all where inline code
  closes and takes words out of the count. That is a real cost, now visible, and the next
  revision has to remove it or justify it.
- "First strong" changed on 1 text: Markdown turning a line into another kind of block
  mid-stream, not the formula.

**What this does not show.**
- Correctness. No labels were used; "final answer rtl" is not "right".
- Real display of "leave it alone". A formula's null is counted as `ltr`, a page's default.
- Real chunking. Models stream tokens, neither characters nor words; the two replays bracket it.
- Generality. One model family, Urdu only; 2,715 texts come from a project about RTL itself.

## opening.json - how many words before the direction is known

`node measure-opening.mjs`, 2026-09-17, same 5,065 texts. Of them 3,354 start right-to-left:
their direction shows at word 1. The other 1,711 start left-to-right, and for those the
evidence is the first right-to-left word. At which word does it arrive? (1,699 of them have a
right-to-left word by this count; in the other 12 the right-to-left letters sit inside a
word that starts left-to-right.)

| first right-to-left word arrives by word | 2 | 3 | 4 | 5 | 10 |
|---|---|---|---|---|---|
| texts (as rendered) | 71.2% | 90.2% | 95.4% | 97.4% | 99.1% |

Histogram: word 2: 1,210 · 3: 322 · 4: 88 · 5: 34 · 6: 11 · 7-10: 19 · beyond 10: 15 (longest: 29).
By kind, headings are the quickest (97.6% by word 3) and list items the slowest (85.0% by word 3).
Leaving inline code out of the count, 95.0% arrive by word 3.

**What this shows.** The evidence arrives early and then almost stops: the count drops by
three to four times with each word to word 5, and 45 texts lie beyond word 5. Waiting three
words would catch 90% of these texts, five words 97%.

**What it cannot show yet.** Which of the late ones *should* turn right-to-left. The long
tail is where an English sentence carrying an Urdu phrase lives - text that must stay
left-to-right - mixed with Urdu sentences that open with a long English name. Only a
reader's label separates them, and the number to wait for is where they separate. That is
a small labelling task: the texts whose first right-to-left word arrives after word 2 -
489 - not the whole corpus.

### The same on ChatGPT's answers (source B)

`node measure-opening.mjs --source B`: the WildChat-4.8M sample, **59,411 distinct mixed
texts** from 36,705 answers of OpenAI models. 46,455 start right-to-left (known at word 1),
12,956 start left-to-right; for 12,904 of those a right-to-left word arrives:

| first right-to-left word arrives by word | 2 | 3 | 4 | 5 | 10 |
|---|---|---|---|---|---|
| all (as rendered) | 60.7% | 85.2% | 90.7% | 93.8% | 97.9% |
| Arabic (5,772) | 59.4% | 79.9% | 86.3% | 91% | 97% |
| Persian (6,451) | 60.6% | 89.6% | 94% | 95.9% | 98.5% |
| Hebrew (674) | 73.6% | 88.3% | 96.6% | 98.7% | 99.9% |
| *source A, Urdu, Claude (1,699)* | *71.2%* | *90.2%* | *95.4%* | *97.4%* | *99.1%* |

794 texts lie beyond word 5 (longest: 153); 5,066 arrive after word 2. By kind: list items
are 11,043 of these texts and headings the quickest (95.2% by word 3); paragraphs the
slowest (75.5% by word 3). Urdu in source B is too small to read (7 texts).

**What this adds.** The shape holds across models and languages: the evidence comes early and
then thins out. It is later in ChatGPT's Arabic than in Claude's Urdu - by word 3, 79.9%
against 90.2% - and the tail is longer, which is where English sentences with an inserted
phrase and Arabic sentences with long English openings live. The number of words to wait for
has to come from both sources, and from labels on the tail.

## window.json, window-B.json - how many words to wait: N

`node measure-window.mjs --source A|B`. For texts that start left-to-right and hold a
right-to-left word, every N makes two mistakes: **late** - a mostly right-to-left text whose
first right-to-left word comes after word N stays left-to-right; **early** - a mostly
left-to-right text with a right-to-left word within N words turns right-to-left. "Mostly" is a
**proxy until labels exist**: at least 50% right-to-left words, or at most 20%.

| N | late, Claude (1,544) | early, Claude (25) | late, ChatGPT (10,547) | early, ChatGPT (1,176) | mistakes, ChatGPT |
|---|---|---|---|---|---|
| 2 | 25.8% | 48% | 37.4% | 56.1% | 4,600 |
| 3 | 7.1% | 60% | 10.1% | 60.7% | 1,780 |
| 4 | 2.5% | 72% | 5.3% | 69.4% | 1,380 |
| 5 | 1.2% | 84% | 3.0% | 75.3% | 1,199 |
| **6** | **0.9%** | **84%** | **1.6%** | **78.6%** | **1,091** |
| 7 | 0.7% | 84% | 1.1% | 80.9% | 1,069 |
| 8 | 0.6% | 84% | 0.8% | 83.4% | 1,070 |
| 10 | 0.4% | 92% | 0.6% | 86.2% | 1,075 |

**What this shows.**
- **Late mistakes fall fast and then stop falling.** From 3 to 6 words ChatGPT's drop from
  10.1% to 1.6%; from 6 to 10 only to 0.6%, while every extra word adds early mistakes. The
  total is lowest at 6-8 and flat after. **N = 6** is the first point of that floor, and the
  shorter wait.
- **Early mistakes are not a matter of N.** Most mostly-left-to-right texts that hold a
  right-to-left word hold it within the first two words already (48% Claude, 56% ChatGPT) -
  a term with its translation, a name, a quoted word. No window separates those; this is the
  case decisions.md 5 gave up, and it stays the formula's known weakness: 886-924 texts of
  59,411 in ChatGPT's sample at N 5-6 by this proxy, about 1.5%. The labels will say how many
  are really wrong.

## eye-tests/ - can a reader notice a block turn? (Part 2)

The lab's **Eye test**: 30 blind trials; an answer opens with an English word and the first
Urdu chunk arrives after 0, 1, 2, 4, 8 or 16 painted frames (5 of each, random order); the
viewer says only whether they **noticed** a turn. Real times between the two paints are recorded.
Copied from the lab's database into `eye-tests/perception/`.

**Viewer 1 - the owner, 2026-09-17**, 60 Hz screen (16.7 ms a frame):

| the block stood the wrong way | 0 (no turn) | 1 frame, 16 ms | 2 frames, 33 ms | 4 frames, 66 ms | 8 frames, 133 ms | 16 frames, 267 ms |
|---|---|---|---|---|---|---|
| noticed | 0 of 5 | 0 of 5 | 0 of 5 | 4 of 5 | 2 of 5 | 3 of 5 |

**What this shows, for one viewer.** No turn of one or two frames was noticed, and no turn was
reported where there was none. From four frames on, turns were noticed about half the time or
more (9 of 15) - and even a quarter of a second was missed 2 times in 5, so noticing is not
only a matter of length. The line for this viewer lies between 33 and 66 ms.

**What it cannot show yet.** One viewer and five trials a length are a first reading, not a
threshold: more viewers are needed, and published perception research is to be read and cited
beside it. And it answers only half of Part 2: how long a wrong direction really stands in real
chats needs the rhythm recordings (survey/RHYTHM.md).

## Runs

| run | file | what changed |
|---|---|---|
| 1 | `streaming-run1.json` | first run with all twelve formulas |
| 2 | `streaming-run2.txt` | "Opening words (2 of 5)" revised after run 1: it showed a text that starts in Urdu left-to-right until the second Urdu word, so 94.8% of texts changed while arriving (by word). It now decides right-to-left at once when the text starts right-to-left: 30.6%. No other formula changed; their figures are identical across runs. |
| 3 | `streaming.json` (`streaming-run3.txt`), `streaming-B.json` | "Opening words (2 of 5)" withdrawn; "Opening words (6)" added from the window measurement; the opening-words family now counts the rendered text's words, inline code included, so code closing mid-stream cannot reverse it; every formula has a settle point where one exists, and the hold (Part 2) is measured. |
