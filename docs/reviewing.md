# Reviewing this project

> **If you have been asked to review SmartRTL, read this page first and nothing else.**
> It exists because reviews of this project kept producing lists of new work, and those
> lists were the problem rather than the findings in them.

## There are two questions. There is no third one.

**1. Does the formula reach every place text appears, without costing anybody anything?**

**2. Will it still do that after Claude Code's next update?**

Both are answered by a command, not by reading:

```
cd apps/vscode-claude
npm run review
```

Green means the answer to both is yes. That is the whole review. The daily watch runs the
same thing against each new Claude Code release the morning it ships.

## The line

This project decides which direction a piece of text belongs to, and sets it.

```
starts RTL                    -> RTL   (already true, nothing to do)
starts LTR, no RTL after it   -> LTR   (left alone)
starts LTR, RTL follows       -> RTL
```

Nothing else about Claude Code's panel belongs to us. The line was drawn on the first day
and has not moved since.

### The formula itself is not under review

It is printed above so you know what the project does, not so you can weigh it. It lives
in `packages/core/src/direction.js`, and that file and its tests are **frozen**.

Every obvious improvement to it has already been tried and measured: character ratios,
word counts at a threshold, context from surrounding blocks, a five-word guard, a
function-word guard. Each is written up in `docs/decisions.md`, with the lines that
killed it. And accuracy is not even the main reason the rule stands: its answer only ever
moves one way, which is what lets the engine decide from a half-written block while an
answer streams - 3 frames instead of 42. A better-informed formula can revise itself, and
a formula that can revise itself cannot decide on sight.

So a finding about the formula is not a finding. If you believe it should change, say so
and stop; it is a decision its owner makes deliberately, with evidence, as its own piece
of work. `docs/decisions.md` section 42 has the two questions such a proposal has to
answer, and the order they are asked in.

### What is inside it

The work is to give text its correct right-to-left or left-to-right tag - the one fact the
web's first-strong-character rule does not have - and let the browser do the rest. So the
test is not an opinion about what belongs to what. It is a measurement:

> **Tell the browser only the tag. Whatever then moves by itself is the text's. Whatever does
> not move by itself is not ours to move.**

- the words of an answer, a sent message, a draft in the box — obviously
- a list's bullets and numbers, a table's column order, a quote's bar — the browser moves
  them by itself the moment it is told
- one exception, and it is the same exception everywhere: where the tag ALONE would change
  the text. Told a message is right to left, the browser draws a code block with its `;` at
  the front of the line, `250–400ms` in an Urdu list as `400ms–250`, and an English paragraph
  with its full stop moved. Those keep their own order, because nobody's text is ever changed.
  Every one of them is measured in `test/the-mirror.test.js`, not assumed.

**Work, and wishes.** Anything that would have to be moved by hand because it would look nicer
is a wish, not the work. There are no wishes at this stage. If one is ever carried out, it is
said plainly beside it that it is a wish, forced by hand - because this repository is the
evidence that a correct tag alone is enough, and a thing moved by hand is evidence against it.

### What is outside it

- how wide a bubble is, or which edge of the panel it sits against
- where a control is, or what a row lines up with
- anything reserved on **another** row: a gutter that takes 30px from an English answer
  because somebody else wrote in Urdu is not a direction
- how much of this extension is visible: one small "RTL on", only while Claude Code is in
  front of you, is the whole of it
- **a message's timeline dot.** Told the direction, the browser leaves it where it is: it is
  drawn at `left: 9px` in a gutter of `padding-left: 30px`, its connector joins one row to the
  next, and its colour says what a tool did. It is a timeline and a status light, not text.

The dot was ruled inside the line once (section 41) and moved to the right by hand until 0.5.9.
That was decided before the rule above existed, and on a row whose lines were ragged it left a
gap beside the dot that changed from one line to the next. `docs/decisions.md` section 49.

### We tell. We do not build.

If there is a thing to point at - an element - point at it and let the browser draw. The
browser has always known how to draw right-to-left; the only thing it was missing is which
piece is right-to-left, and that is the whole of what this project supplies.

If there is **no** thing to point at, making one is the job of whoever owns that DOM. It is
not a gap to be filled here. The box you type into is where this bites: it is
`contenteditable="plaintext-only"`, so a new line is a `\n` character rather than an element,
and the layer people read is one text node. Per line there was built twice and died twice -
the panel came down, then every keystroke arrived late. `docs/decisions.md` section 47.

So a finding that begins "we could build" is answered by this line, not by weighing it.

### The one crossing

Claude Code's own bug: a message that heads a turn is pinned, and expanded it has no height
cap, so the answer under it cannot be read past. It has nothing to do with language, it
costs an English-only reader exactly as much, and it is unfixed upstream. Crossed for
deliberately, once, and written up on its own terms in `docs/claude-code-bug.md`.

Nothing else gets crossed for. If a second crossing ever looks necessary, that is a
conversation to have, not a change to make.

## What `npm run review` actually asks

| | what it holds | where |
|---|---|---|
| the line | every computed property of every element, with the fix and without it, against a named list of what may differ | `test/the-line.test.js` |
| the mirror, all four places | compared with what the BROWSER draws when it is told - Claude Code's own bundle with the incomplete rule DELETED and the formula's answer said plainly. An answer: 96 elements, no allow-list, at two widths. The box you type into and a message you sent: every box and every piece of ink, the caret included, and identical to untouched Claude Code when there is no Urdu in them. An answer while it streams: five rhythms, and no line holding right-to-left text drawn from the left in any frame | `test/the-mirror.test.js` |
| the dot | stays exactly where Claude Code draws it, on every row, in every language - its gutter, its position and its connector read on every row of the-mirror, and against untouched Claude Code | `test/rendering.test.js`, `test/real-webview.test.js` and `test/the-mirror.test.js` |
| what we show | one item, only while Claude Code is in front of you | `test/status-bar.test.js` |
| what we cost | no write and no whole-file read on an ordinary start; a tab change touches the disk not at all | `test/startup-cost.test.js` |
| the roads in | every name renamed, every role taken away — each place still found | `test/real-webview.test.js` and the survival suites |
| the assumptions | which one went, in one line, the morning it goes | `test/claude-shape.test.js` |
| standing down | a build that has fixed one of these takes that circuit out of the page | the survival suites |
| the formula | that it is byte for byte what it was - behaviour tests can be updated to match a change, bytes cannot | `packages/core/test/frozen.test.js` |

## When it is red

The failing line names the thing. Fix that thing. Do not widen the review because you were
already looking.

## When it is green

The review is finished. Say so.

If something still looks wrong to you and it is not in the table above, ask one question of
it before writing it down as a finding:

> Does this belong to the text whose direction we are setting?

If the answer is no, it is not a finding. It may still be a good idea — and it is somebody
else's good idea, in somebody else's product.
