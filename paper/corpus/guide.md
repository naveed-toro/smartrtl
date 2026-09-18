# Labelling guide

**Draft, awaiting the owner's reading.** An Urdu translation for labellers is in
[guide.ur.md](guide.ur.md); this English text is the one that counts. Labels are frozen
before any rule is scored, and this guide is frozen before the first label. A change to it
after that point is written down here with its date and the labels it affected.

---

## The one question

You will see one piece of text drawn twice: once with its lines starting at the right
(right-to-left), once with its lines starting at the left (left-to-right). Nothing else
about the two differs.

> **Which of the two reads correctly, the way its writer meant it?**

You are not asked what language it is, how many words of each script it has, or what any
program would do with it. Only which drawing a reader of this text would accept.

## The answers

| key | label | choose it when |
|---|---|---|
| 1 | **rtl** | only the right-to-left drawing reads correctly |
| 2 | **ltr** | only the left-to-right drawing reads correctly |
| 3 | **either** | both read correctly - nothing moves between them that matters |
| 4 | **neither** | both drawings are wrong: something inside the text is out of order whichever way the line runs |
| 5 | **unclear** | you cannot decide from this text alone |

**neither** was added on 2026-09-17, on the assistant's recommendation, when the owner asked
for the work to go ahead without deciding each point. The paper's outline section 9 claims
that a direction alone cannot fix some text - a range like `250–400ms` inside an Urdu line
has been measured re-ordered to `400ms–250` (decisions.md 49). Without this answer such
text would be forced into rtl or ltr and that evidence lost. The owner can remove it before
the guide is frozen.

## How to decide

1. Read the text as a reader of its main language would, start to finish.
2. Look at both drawings. In the correct one, the words come in the order you read, the
   sentence's full stop is at its end, and a list marker or line start is on the side the
   sentence starts from.
3. Borrowed words do not change the language of a sentence. `Debounce بمقابلہ Throttle`
   is an Urdu heading with two English nouns: **rtl**.
4. A quoted or inserted word does not either. *In Urdu this idea is called ایونٹ لوپ, but
   the mechanics are identical.* is an English sentence: **ltr**.
5. Decide from the text in front of you. If only the surrounding answer could tell you,
   answer **unclear** - you may then open the context, and the tool records that you did.
6. Do not think about what a program should do. If you notice you are choosing the answer
   that would make some rule right, stop and read the text again.

## Worked examples

| text | label | why |
|---|---|---|
| `useMemo اور useCallback` | rtl | Urdu heading; the English words are names |
| `args - اصل arguments` | rtl | Urdu heading |
| `children بطور props` | rtl | Urdu heading |
| `Debounce بمقابلہ Throttle` | rtl | Urdu heading |
| `JavaScript میں Debounce فنکشن` | rtl | Urdu heading |
| *In Urdu this idea is called ایونٹ لوپ, but the mechanics are identical.* | ltr | English sentence with an Urdu insert |
| `React 18 میں نیا کیا ہے` | rtl | Urdu question; a name and a number at its start do not change that |
| `README.md` alone | - | no right-to-left letter: not shown for labelling |
| `2024 کا سال` | - | no left-to-right letter: not shown for labelling |

**either** is expected to be rare: in text that mixes both directions, the two drawings
almost always put something in a different order. Choose it only when that difference
truly does not matter to a reader.

(The last two rows are why the tool only asks about text that holds at least one right-to-left
letter and at least one left-to-right letter: text in one script only has one reading, and
every rule already agrees on it. That choice is stated in the paper.)

## The tool

```
cd paper/corpus/tools
npm install        (once)
npm run label
```

then open http://127.0.0.1:4173/?by=owner (a second labeller uses their own name after
`by=`, lowercase letters only). Keys: 1 rtl, 2 ltr, 3 either, 4 neither, 5 unclear,
Backspace for the previous text, C to see the whole answer. The page runs on this computer
only; labels are saved at once to `corpus/private/labels/<name>.jsonl`.

**The four candidates' set (493 texts):** `npm run label -- --set four` shows only the texts,
from both sources, on which Any RTL, our first formula and Firefox's formula at 63 and 45
letters do not all agree. The page does not say what any formula decides. Its labels are kept
apart, in `corpus/private/labels/four/`, and `node score-four.mjs` applies the rule in
results/README.md once all 493 are labelled.

## Housekeeping

- Take breaks. Label in sittings of at most 45 minutes; the tool records sitting times.
- The order of units is random and fixed by a seed; the answer a unit came from is hidden.
- You can change a label during a sitting. After the labels are frozen, you cannot.
- Every label records who gave it, when, and whether the context was opened.
