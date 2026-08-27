# What is left, and in what order

This repository will end up carrying several products. They exist to fix one bug, so the
danger is not that any of them is hard - it is that they drift, and the same edge case has
to be found and fixed five times.

This file is the answer to that: what a new surface must provide, which order they get
built in, and why. The reasoning behind the rule and the design is in
[decisions.md](decisions.md); this is only the plan.

---

## The shape

```
@smartrtl/core    the rule     which direction does this text belong to?
@smartrtl/dom     the engine   when to ask, and what to do with the answer
adapter           the product  what this particular page looks like
```

On disk that is two folders, and the names carry a rule:

```
packages/   the shared halves. A library, with no product anywhere in it.
apps/       one folder per surface that ships to somebody.
```

An `app` may depend on a `package`. A `package` may never depend on an `app` - the day it
does, something product-shaped has been built into the shared half, and every other surface
inherits it. The folder names are there so that a violation is visible without reading any
code.

Two more rules keep it that way:

- **No adapter contains rule logic.** If an adapter needs to know what counts as RTL, it
  asks core. Nothing else may decide.
- **Anything true of a second surface moves down.** The first time two adapters need the
  same thing, it belongs in `dom`, not copied. That is the whole reason for the split.

## What an adapter is

An adapter describes a page and nothing more. Everything below is optional except the
first line - `SmartRTLDom.start(SmartRTL, {...})`.

| key | what it is |
|---|---|
| `blocks` | selector for the elements that carry text, if the default is wrong |
| `boxSelector` | hint for "one message", tried first when scoping a decision |
| `composer` | `{ container, layers[], probe }` - the box the user types into |
| `extraCss` | rules the adapter wants in the same stylesheet |
| `onDecision` | `(block, box)` - run once, when a message is decided |
| `onCleanup` | `()` - undo the adapter's own work when the escape hatch is pulled |
| `quietMs`, `maxBox` | timing and scope limits, if this surface needs different ones |

An adapter should also carry, in its own package: how the code gets onto the page, and a
test that renders the built result against that product's own CSS. The tests are not
optional - they are what makes it possible to change the engine later without opening
five products by hand.

## The surfaces

| surface | how the fix is delivered | state |
|---|---|---|
| Claude Code in VS Code | companion extension, patches the webview bundle | works, tested, not published |
| AI chat sites in the browser | Chrome extension, one adapter per site | next |
| a markdown editor | three surfaces of its own - VS Code, desktop, web | shape not decided |
| Claude desktop app | not investigated | unknown |

## Order, and why

**1. The Chrome extension, in full, starting with one site.**

Not because it reaches the most people, though it does - because it is the first thing to
test whether the engine's shape is right. Every option in the table above was chosen while
looking at exactly one product. A second real adapter either confirms that design or breaks
it, and it is much cheaper to learn that now than after three more surfaces have been built
on top of it.

Adding the second and third site after that should be small. If it is not, the engine is
wrong, and that is worth knowing too.

**2. The markdown editor.** It is three deliverables wearing one name, and unlike everything
else here it is a product we own end to end - there is no host page to be a guest on. Worth
starting only once the engine has been proven somewhere it does not control the page.

**3. The Claude desktop app.** Nothing is known yet beyond the fact that the same bug is
there. It may take the same route as VS Code, or no clean route may exist. Until someone
looks, any estimate is invented.

Deliberately not in this list yet: publishing to npm and the two marketplaces, and the
website. Those are one phase, at the end, once there is something worth pointing people at.

## Questions the browser will answer

Written down because they are the reasons step 1 comes first, and because they are easy to
forget once they stop hurting.

- **Recycled nodes.** Chat sites virtualise their message lists: the same DOM element is
  reused for a different message as you scroll. `data-bidi="ltr"` would ride along on it,
  and `settledBlocks` would never look at it again. The webview does not do this, so the
  engine has no answer for it yet.
- **The isolated world.** A content script's `window` is not the page's, so `__bidiFixOff()`
  typed into the console will not find it. The escape hatch needs another way in.
- **Navigation without a reload.** Switching conversations in a single-page app replaces the
  content while the engine keeps running. Nothing obviously breaks, but nothing has tested it.
- **More than one site at a time.** Today an engine instance describes one page. Whether a
  browser extension wants one configured instance per site, or one instance that switches, is
  not decided.
