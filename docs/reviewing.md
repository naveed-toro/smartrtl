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

A thing is inside the line when it **belongs to the text whose direction is being set**.

- the words of an answer, a sent message, a draft in the box — obviously
- **a message's own timeline dot**, which mirrors with its message, at the same distances
  on both sides. It belongs to that message, so it turns with it.

### What is outside it

- how wide a bubble is, or which edge of the panel it sits against
- where a control is, or what a row lines up with
- anything reserved on **another** row: a gutter that takes 30px from an English answer
  because somebody else wrote in Urdu is not a direction
- how much of this extension is visible: one small "RTL on", only while Claude Code is in
  front of you, is the whole of it

Both mistakes have been made. The dot was removed once as "decoration" — wrong, it is
direction. A gutter was reserved on every row to keep columns aligned — wrong, that is
layout. `docs/decisions.md` section 41 has both.

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
| the mirror | an answer, arriving and arrived, compared with what the BROWSER draws when it is told - Claude Code's own bundle with the incomplete rule deleted and the formula's answer said plainly. 96 elements, no allow-list, at two widths; and while it streams, at five rhythms, no line holding right-to-left text drawn from the left in any frame | `test/the-mirror.test.js` |
| and the other two places | a draft in the box and a sent message, against a reference written by hand - the one claim here weaker than the line above | `test/as-claude-would.test.js` |
| the dot | the same three distances on both sides, or "that is two designs, not one mirrored" - and still found with its class renamed, its test id renamed, or neither left | `test/rendering.test.js` and `test/timeline-survival.test.js` |
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
