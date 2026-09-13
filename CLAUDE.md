# SmartRTL

An extension family that fixes the direction of mixed Urdu/English text where it is read:
Claude Code's panel first, a browser extension and a markdown editor after it.

- `docs/reviewing.md` - what a review of this project is, and what is not a finding.
- `docs/decisions.md` - why everything is the way it is, including every attempt that was
  measured and rejected. Sections 6, 7 and 42 are the ones this file depends on.

---

## The formula is frozen

`packages/core/src/direction.js` holds the rule this entire project exists to apply:

```
starts RTL                    -> RTL   (already true, nothing to do)
starts LTR, no RTL after it   -> LTR   (left alone)
starts LTR, RTL follows       -> RTL
```

**Do not change this file.** Not to improve it, simplify it, refactor it, tidy it, rename
anything inside it, make it handle a case it currently gets wrong, or bring it closer to a
standard. Not as part of a review, a cleanup, a dependency bump, a type annotation pass, or
any other task you were given. This holds even when the change looks obviously correct -
**especially** then, because every rejected attempt in `docs/decisions.md` looked obviously
correct too.

`packages/core/test/direction.test.js` is frozen for the same reason and a sharper one:
changing a rule and updating its tests to match is how a rule gets changed without anybody
noticing.

`packages/core/test/frozen.test.js` fails if either file's bytes change. That test is not a
formality to satisfy - if it is red, something has gone wrong that a human has to look at.

### Why it is frozen

Two things, both measured, both written up in `docs/decisions.md` section 42.

**It is more accurate than it looks.** Five real headings killed every counting formula
ever tried here - `useMemo اور useCallback`, `args - اصل arguments`,
`children بطور props`, `Debounce بمقابلہ Throttle`, `JavaScript میں Debounce فنکشن`. In
lines like these the Latin words are nouns and the grammar is RTL, so character ratios,
word counts and function-word lists all get them wrong. The rule in the file gets all five
right.

**Its real value is a property, not its accuracy.** The rule's answer only ever moves one
way: text is appended and never unwritten, so a block that holds an RTL word holds one for
the rest of its life, and the answer for such a block is RTL whatever else arrives. That is
what lets `packages/dom/src/engine.js` decide from a half-written block while an answer is
still streaming. Deciding on sight costs 3 frames; waiting for the block to settle was
measured at 42 - two thirds of a second of somebody reading a short reply backwards.
`apps/vscode-claude/test/jitter.test.js` holds both halves.

Any rule that is better informed - counting, ratios, context, word lists - can also change
its mind, and a rule that can change its mind cannot be trusted with a half-written block.
So a "more accurate" formula does not cost a little accuracy somewhere else. It costs the
real-time behaviour of the whole extension.

The one case the rule gets wrong on purpose - an English sentence carrying a single RTL
phrase - is not a defect it tolerates. It is the price of that property. Section 5 of
`docs/decisions.md` gave it up deliberately, and section 42 is why it stays given up.

### If you think it should change

Say so, and stop. Do not write the change and do not open a branch for it.

A change to the rule is a decision its owner makes deliberately, with evidence, as its own
piece of work - not a side effect of some other task. Before it can even be discussed, a
proposal has to answer two questions, in this order:

1. **Can the rule's answer still only ever move one way?** A proposal that fails this is
   finished here. Its accuracy does not need to be discussed, because its cost has already
   been paid in frames, on every short answer, for every user.
2. Does it survive the five headings above?

Both questions have been answered wrongly by careful people, including by the assistant
that wrote section 42.

---

## What a review is

Read `docs/reviewing.md` first and nothing else. A review of this project is a command:

```
cd apps/vscode-claude
npm run review
```

Green is the whole review. Red names the thing - fix that thing, and do not widen the
review because you were already looking. If something looks wrong and is not in that
document's table, ask its one question of it before writing it down as a finding:

> Does this belong to the text whose direction we are setting?

If the answer is no, it is not a finding.

---

## Working in this repository

- **Commits belong to the owner.** Write the commit message out; do not stage and do not
  commit unless you have been asked to in that session. One commit is one change.
- **Read-only git commands take `--no-optional-locks`**, or an `index.lock` is left behind
  on the mount.
- `packages/` holds the shared parts, `apps/` holds one app per surface. An app may depend
  on a package. **A package must never depend on an app.**
- Anything installed must be fully removable: an effect on install, and no trace left on
  uninstall. A tool that cannot do that is not a tool, it is a bug.
- Documents carry counts that `apps/vscode-claude/test/docs.test.js` checks against the
  truth. If you add a section to `docs/decisions.md`, the count in `README.md`,
  `apps/vscode-claude/README.md` and `docs/launch-note.md` follows it.
