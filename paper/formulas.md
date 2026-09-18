# The formulas

Part 1 of the paper, in the order it tells it (the owner's account, 2026-09-17). Every formula
runs from one file, in the lab and in the measurements: [rules/rules.js](rules/rules.js).
Sources are in [references.md](references.md); anything not yet verified there is verified
before the paper quotes it. Figures are in [results/README.md](results/README.md).

---

## 1. Where this work started

Before any study, reasoning alone gave this project its formula - in effect **Any RTL**: a
block holding a right-to-left word is right-to-left.

- It knowingly gave up one case: an **English sentence carrying an Urdu phrase**, which should
  stay left-to-right (decisions.md 5).
- It decided **on sight** and only ever turned one way - left-to-right to right-to-left, once -
  so a streamed answer never turned back. Waiting for a whole block before deciding was
  measured and rejected: 42 frames against 3 (decisions.md 42).
- In daily use nothing about the stream felt missing; the case given up was the price.

Then the study began, and the paper.

## 2. Adopted - and the situation each was made for

| formula | since | made for | who |
|---|---|---|---|
| **First strong** | 1999 | a paragraph written in one language, whose first word shows it; used for search boxes [L2/09-411] | Unicode UAX #9 P2-P3 [UTR9-1999]; HTML `dir="auto"` [HTML-LS]; Android `FIRSTSTRONG_LTR` |
| **First strong, per paragraph** | 2011 | text a person types line by line - HTML applies it per paragraph in `textarea` and `pre` [HTML-LS] | CSS `unicode-bidi: plaintext` [CSS-WM3] |
| **Word count 40%** | ≤2011 | "longer texts like e-mails" [L2/09-411] | Google Closure `estimateDirection` [CLOSURE-BIDI]; used in Google products, never a standard [MOZ-548206 c34] |

None was made for text a machine writes and streams. The HTML standard calls its own rule
"very crude" and a "last resort" [HTML-LS]; the Unicode FAQ calls a first-strong guess "often
an incorrect guess" [UNICODE-FAQ-BIDI].

## 3. Proposed, never adopted - and the situation each was made for

| formula | when | made for | who | what happened |
|---|---|---|---|---|
| **Any RTL** | 2009 | "any-RTL for advertisements" [L2/09-411] | Lanin (Google), Allawi, Allouche (IBM); W3C `autodirmethod` [HTML-BIDI-REQ]; Android `ANYRTL_LTR` | HTML "did not accept the proposal to add some way for the page to choose the algorithm" [MOZ-548206 c34] |
| **Firefox's formula, 63 letters** | 2010 | web content from an unknown source, "like comments in a weblog" [MOZ-548206 c0] | fantasai, for Firefox's `dir=auto` | called "generally less useful than either first-strong or word-count"; Firefox shipped first strong [MOZ-548206 c13] |
| **First strong, else RTL** | ~2010 | text entry fields and UI elements [AUTO-RTL] | `dir="auto-rtl"` proposal; Android `FIRSTSTRONG_RTL` | not in HTML |
| **Character majority** | 1999 | any higher-level protocol wanting a heuristic - UAX #9 HL1's own example [UAX9] | Unicode | allowed, never standardised |
| **Majority without links** | 2017 | chat messages that start with a link [TDESKTOP-3845] | a Telegram user | closed without a response |
| *Character count with script weights* | 2011 | - [HTML-BIDI-REQ] | W3C requirements | never specified, "untried and unproven": cited, cannot be run |

Not formulas, and cited as such: the UI locale (Android `LOCALE`) ignores the text; explicit
metadata [STRING-META] is a declaration - and in the AI era nobody is there to declare it.

## 4. What developers build for AI chats today

| what | where | formula |
|---|---|---|
| `unicode-bidi: plaintext` on the chat panel | anthropics/claude-code #75196 (closed, not planned); openclaw #147732 | first strong, per paragraph |
| majority of letters | NousResearch/hermes-agent #51318 | character majority |
| majority of prose, leaving code and links out; bounded re-analysis while streaming | BidiLens [BIDILENS] | majority of prose (the lab runs its own implementation of the idea) |
| this project's first formula | SmartRTL, Claude Code panel | Any RTL, needing a right-to-left word |
| what the chats themselves do | ChatGPT looks like first strong per block in the owner's screenshot; the survey (paper/survey) checks each chat from the page | to be measured |

## 5. What the AI-chat data showed

With 64,476 mixed texts from Claude's and ChatGPT's answers (Urdu, Arabic, Persian, Hebrew):

- **Firefox's 63-letter formula fitted this situation better** than the adopted ones - although
  63 was chosen, not calculated: bug 548206 gives no reason for it. It never turns back while
  text arrives, and held until decided it shows most blocks at once.
- **The honest truth about the given-up case:** there is no certain way to tell that an English
  sentence carrying an Urdu phrase should stay left-to-right. A window of letters gets it right
  only when the phrase comes late (the owner's screenshot: letter 342 of 406); when it comes in
  the first letters, every window is wrong.
- **Every counting formula turns back on itself** while text arrives - Google's word count on
  5.5% of ChatGPT's texts, character majority on 13.5% - and none can know it is finished
  before its block ends.

## 6. The suggestion: Firefox's formula, 45 letters

**First letter right-to-left → right-to-left. First letter left-to-right → look at the first 45
letters: a right-to-left letter among them → right-to-left; none → left-to-right.**

- **The formula is Firefox's (2010).** This work adds the number, measured instead of chosen.
- **Why 45:** computed for every window from 5 to 100 letters on both sources, weighing mistakes
  and waiting together; the rule - the shortest window within half a percentage point of the
  fewest mistakes on both - gives 45. Beyond it mistakes stop falling and waiting keeps
  rising: 63 makes a reader wait 22% longer on ChatGPT's answers for no fewer mistakes.
- **45 against 63:** they disagree on 176 of 64,476 texts. By the proxy it is close to even -
  63 slightly better for right-to-left sentences, 45 slightly better for English sentences
  with a phrase - and 45 waits less. Labels on those 176 texts settle it.
- **With the stream held until decided** (Part 2), it never shows a text turning over.
- **Known limit:** an English sentence whose right-to-left phrase comes within the first 45
  letters.

---

## Steps on the way (kept in the measurements, not in the lab)

| formula | why it was left |
|---|---|
| Opening words (3), Opening words (6) | counted in words; words vary in length (six words were 25 letters in Claude's texts, 31 in ChatGPT's) and are not defined the same way in every language |
| Opening words (2 of 5) | showed Urdu-first text left-to-right until the second Urdu word; withdrawn after streaming run 2 |

## How the final choice is confirmed

1. **While text arrives** - measured, no labels needed: [results/](results/).
2. **Correctness** - the 176 texts where 45 and 63 disagree, and the texts after word 2
   (corpus.md), labelled by readers of each language.
3. Every revision is written down with its reason; once labels exist, a revision is tested on
   labels it was not revised against.
