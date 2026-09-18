# The corpus - plan

Sections 3, 4, 5 and 7 of [outline.md](outline.md) are measured on one body of text. This
document says where that text comes from, what each unit of it is, who decides its correct
direction, and how it is kept honest. No unit is labelled until the owner has read and
approved the labelling guide.

---

## What is needed

Real machine-written answers that mix a right-to-left script with left-to-right text, in
the shapes an AI answer really has - paragraphs, headings, list items, table cells, inline
code, numbers and units - with the correct direction of every unit decided by a person
who reads the language.

Real, because every rule tried in this repository that was tuned on invented sentences
failed on a real one (decisions.md 3, 5, 42).

## Sources

### A. The owner's own Claude Code answers (Urdu)

Extracted 2026-09-17 by `tools/transcripts.mjs` (units as defined below, Unicode 18.0.0
bidi classes) from the local Claude Code transcripts. **Cutoff:** only answers written before
2026-09-17 00:00 UTC, the day the formula study began - later answers are about the study
itself, and the transcripts keep growing, so without a cutoff the corpus would never be the
same twice. The answers run from 2026-08-04 to 2026-09-16: 1,369 distinct answers (16
repeats, 24 synthetic messages and 321 later answers dropped), 1,364 by claude-opus-5 and 5
by claude-sonnet-5. The script prints counts only.

**The snapshot is the corpus.** Claude Code deletes old transcripts on its own schedule, so
the extracted file may soon be the only copy. It is never overwritten unless asked for by
name (`--overwrite-snapshot`), and every label records its hash:
`corpus/private/transcripts.units.jsonl`, SHA-256
`d02d8c5d76953d4617400f39d2a0070cead6320d275e68b002544918b700b08e`. **Back it up.**

| | count |
|---|---|
| units | 13,454 |
| - paragraphs / list items / headings / table cells | 4,686 / 1,590 / 1,353 / 5,278 |
| - fenced code blocks (not labelled) | 544 |
| units holding a right-to-left letter | 10,408 |
| - also holding a left-to-right letter | 5,144 |
| - whose first strong character is left-to-right | 1,750 |
| - whose direction switches three or more times | 2,544 |
| **distinct mixed texts - what needs a human label** | **5,065** |
| - of which first strong is L / AL / R | 1,711 / 3,338 / 16 |
| - paragraphs / list items / table cells / headings | 2,720 / 1,094 / 1,052 / 199 |
| - from this project / GK-glk-ui / SmartRTL-VSCode | 2,715 / 2,207 / 143 |

1,711 distinct texts begin with a left-to-right letter and still hold Urdu: the web's rule
decides every one of them LTR, and the owner's reading will say how many of those are wrong.

- Strength: real answers, real subjects (GK-glk-ui is not about RTL).
- Weaknesses a reviewer will name: one model family, one reader, one language; 2,715 of the
  mixed texts come from this project, whose subject is RTL itself. Report results with and
  without it.
- **Privacy:** these are private conversations. Only assistant text is used, one block at
  a time, never whole conversations, and **every block is read by the owner before it can
  be published.** Anything personal is dropped, not edited.

### B. WildChat-4.8M (Arabic, Persian, Hebrew, Urdu)

Real ChatGPT conversations from users who opted in, published by AI2 under ODC-BY
(allenai/WildChat-4.8M, revision `c827c6df`). Paper: [WILDCHAT] in references.md.

**Index of the whole dataset** (`tools/wildchat-index.mjs`, 2026-09-17): the small columns of
all 86 files were read; the train split holds **3,199,860 conversations** (the dataset's name
says 4.8M; this is what its files hold at that revision). Conversations by WildChat's own
language label:

| Arabic | Persian | Hebrew | Urdu | Pashto, Sindhi, Kurdish, Uyghur, Yiddish, Dhivehi |
|---|---|---|---|---|
| 77,487 | 23,937 | 1,391 | 602 | 0 |

Answered by 14 models from gpt-3.5-turbo (2023) to gpt-4o, o1 and gpt-4.1-mini (2025); the
split per language and model is in `corpus/public/wildchat-index.json`.

**Sample** (`tools/wildchat-sample.mjs`): a cluster sample of whole row groups (1,000
conversations each) in an order fixed by a seed, taken until Arabic ≥ 3,000, Persian ≥ 3,000,
Hebrew ≥ 500 and Urdu ≥ 250 conversations. Hebrew and Urdu are scarce, so it takes 521 of the
3,131 row groups that hold right-to-left conversations, which brings 17,360 Arabic, 5,044
Persian, 500 Hebrew and 257 Urdu conversations. Conversations WildChat flags as toxic are left
out; only assistant turns are used.

- Strength: many users and models, four right-to-left languages, public and re-runnable; its
  licence lets the paper show examples with attribution.
- Weaknesses: one vendor (OpenAI); a conversation's language label is not every answer's
  language - the same mixed-text filter applies; less technical text than a coding tool.

[LMSYS-CHAT-1M] forbids redistribution, so it is kept only as a possible check, never as
published data.

## The unit

A unit is what a browser gives a direction to on its own: a paragraph, a heading, one list
item, one table cell, one paragraph of a quotation. Answers are parsed to the CommonMark and
GitHub Flavored Markdown specifications (micromark, pinned in `tools/package.json`), not
to any one product's renderer, and not split on newlines. Fenced code blocks are recorded
but not labelled - their direction is never in question. Each unit keeps its place in the
answer (which list, which table, which row), so the composition question (outline section
7) is measured on the same data.

Strong, first strong and right-to-left mean exactly what UAX #9 means: bidi classes are read
from Unicode 18.0.0's `DerivedBidiClass.txt`, checked against a recorded hash
(`tools/bidi.mjs`).

Only **mixed** units are labelled - those holding at least one left-to-right and one
right-to-left strong character. A unit in one direction only has one reading and every
rule agrees on it; the paper states this.

## The label

Decided by reading, as written in [corpus/guide.md](corpus/guide.md) (Urdu translation:
[corpus/guide.ur.md](corpus/guide.ur.md)): the labeller sees the unit drawn twice,
right-to-left and left-to-right, and says which reads correctly - **rtl**, **ltr**,
**either**, **neither**, **unclear**.

To be believable:
- a second labeller relabels a random share of the Urdu units; agreement is reported;
- Arabic, Persian and Hebrew units are labelled by native readers;
- the guide is frozen before the first label, and the labels before any rule is scored;
- the corpus, the guide and the scripts are published together, so anyone can re-run it.

## How many to label

All 5,065 distinct mixed texts are shuffled once, with a recorded seed, and labelled in that
order. Any number labelled from the start of that order is then a uniform random sample of
the whole, so the labelling can stop anywhere without biasing the result - and continue
later without starting again.

| labelled | margin of error (95%, worst case) |
|---|---|
| 500 | ±4.2% |
| 1,000 | ±2.8% |
| 1,500 | ±2.1% |
| 2,500 | ±1.4% |
| 5,065 | exact |

Target: at least 1,000 before any rule is scored; all of them if the time per label, measured
in the first sitting, allows it.

## Files

```
paper/corpus/
  guide.md, guide.ur.md   the labelling guide, and its Urdu translation
  tools/                  run everything from here (npm install once)
    bidi.mjs              Unicode 18.0.0 bidi classes, pinned by hash
    units.mjs             an answer -> its units (CommonMark + GFM)
    transcripts.mjs       source A -> private/transcripts.units.jsonl   (npm run transcripts)
    label/                the labelling page on 127.0.0.1               (npm run label)
    *.test.mjs            npm test
  private/                ignored by git: the snapshot and the labels
```

---

## Decisions

Approved by the owner, 2026-09-17:
1. Source A is used, unit by unit; every unit is read by the owner before it is published,
   and anything personal is dropped, not edited.
2. WildChat for Arabic, Persian and Hebrew; native labellers to be found. Urdu first.
3. Labels rtl / ltr / either / unclear.
4. A second Urdu labeller (an educated Urdu reader, not necessarily a programmer) relabels
   10-20% before the paper is written.

Made while building, for the owner to see:
- one home for the paper, `paper/`, apart from the extension's documents;
- CommonMark/GFM rather than Claude Code's renderer, so the corpus is about text and not an app;
- Unicode 18.0.0 bidi data, pinned by hash;
- only mixed units are labelled;
- one shuffled order, so any prefix is a random sample.

Made after the owner asked for the work to go ahead without deciding each point
(2026-09-17), each reversible until the guide and labels are frozen:
- the fifth label, **neither**, added (guide.md says why);
- the cutoff at 2026-09-17 00:00 UTC, and the snapshot protected from being overwritten;
- the labelling page: both drawings rendered from the unit's own Markdown with nothing but
  `dir` different, a random order fixed by a seed, every label recording its time taken,
  whether the context was opened, and the hashes of the guide and the snapshot.

Open:
- the guide itself, which the owner reads and corrects before it is frozen.
