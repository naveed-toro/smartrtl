# Task: which text-direction rule does each AI chat use today?

You are helping with a research paper about right-to-left (RTL) text - Urdu, Arabic, Persian,
Hebrew - in AI chats. The paper needs one table that is **measured, not guessed**: for each
AI chat, what the page does to decide the direction of a message. You have a browser on the
owner's computer; the owner is already logged in where a login is needed.

Work carefully and report only what you observed. If something could not be checked, say so
in the table - never fill a cell from memory or from what a product "probably" does.

Everything you need is in this folder: `C:\Users\raysn\Desktop\smartrtl\paper\survey\`
- `probe.js` - reads how the page directs each test line (run after the answer finishes)
- `watch.js` - records what a reader sees while the answer streams (run before sending)

## Chats to check

| # | chat | address |
|---|---|---|
| 1 | ChatGPT | https://chatgpt.com |
| 2 | Gemini | https://gemini.google.com |
| 3 | Claude | https://claude.ai |
| 4 | Microsoft Copilot | https://copilot.microsoft.com |
| 5 | DeepSeek | https://chat.deepseek.com |
| 6 | Grok | https://grok.com |
| 7 | Meta AI | https://www.meta.ai |
| 8 | Perplexity | https://www.perplexity.ai |
| 9 | Mistral Le Chat | https://chat.mistral.ai |
| 10 | Qwen | https://chat.qwen.ai |

If a chat needs a login that is not already there, **skip it** and write "not checked: login
needed". Never type a password, never create an account, never change a setting. Use a
temporary / incognito chat mode where the product offers one.

## For each chat

1. Open the chat, start a new conversation. Note the model name shown, if any.
2. Open the browser developer console (or use your page-JavaScript tool) and run **all of
   `watch.js`**. It prints "bidi watch running".
3. Send this message, exactly (everything between the two `~~~` lines, not the lines themselves):

~~~
Please reply with exactly the text between the two lines of dashes below, formatted as Markdown, with nothing before or after it and without changing any word.

----------
## useMemo اور useCallback

## Debounce بمقابلہ Throttle

React ایک لائبریری ہے جو صارف کا انٹرفیس بناتی ہے۔

In Urdu this idea is called ایونٹ لوپ, but the mechanics are identical.

- `useMemo` جب حساب مہنگا ہو
- The call stack runs first.

یہ فنکشن React میں استعمال ہوتا ہے۔

Python هي لغة برمجة سهلة التعلم.

This line is plain English.
----------
~~~

4. Wait until the answer has completely finished. Check that the chat actually repeated the
   lines; if it changed or refused some, note which.
5. In the console run `window.__bidiWatchReport()` and **save its output**.
6. Run **all of `probe.js`** and **save its output**.
7. Take one screenshot of the finished answer (the whole answer visible).
8. Before sending anything, also type `useMemo اور useCallback` into the message box (do not
   send it) and note whether the text in the box shows right-to-left or left-to-right; then
   clear the box.

## Save

In `C:\Users\raysn\Desktop\smartrtl\paper\survey\results\` (create it if missing):
- `<chat>-probe.json` - the output of step 6
- `<chat>-watch.json` - the output of step 5
- `<chat>.png` - the screenshot of step 7

(`<chat>` in lowercase: `chatgpt`, `gemini`, `claude`, `copilot`, `deepseek`, `grok`, `metaai`,
`perplexity`, `mistral`, `qwen`.) Do not change any other file in the folder.

## How to read the results

`probe.js` lists every place a test line was found; the **answer** is normally the last match
of each case, and a match with `"inInputBox": true` is the message box. For the answer's
lines, look at `direction`, `nearestDir` and `unicodeBidiUpTheTree`:

| what you see on the answer's lines | the rule is |
|---|---|
| no `dir` anywhere up the tree, `unicode-bidi` normal, every line `ltr` | **No rule** - everything left-to-right |
| `dir="auto"` on each line or block | **First strong, per block** (HTML `dir=auto`) |
| `dir="auto"` only on the whole message | **First strong, whole message** |
| `unicode-bidi: plaintext` on the lines or a container | **First strong, per paragraph** (CSS plaintext) |
| an explicit `dir="rtl"`/`"ltr"` that differs between lines | **the page's own rule** - work out which from the pattern below |
| every line the same direction, including T9 (plain English) | **one decision for the whole message** |

Pattern for the page's own rule (answer lines, `direction`):

| case | first strong | any RTL | our expectation of a correct reader |
|---|---|---|---|
| T1 `useMemo اور useCallback` | ltr | rtl | rtl |
| T2 `Debounce بمقابلہ Throttle` | ltr | rtl | rtl |
| T3 `React ایک لائبریری ہے…` | ltr | rtl | rtl |
| T4 `In Urdu this idea is called ایونٹ لوپ…` | ltr | rtl | ltr |
| T5 list item `useMemo جب حساب مہنگا ہو` | ltr | rtl | rtl |
| T6 list item `The call stack runs first.` | ltr | ltr | ltr |
| T7 `یہ فنکشن React میں…` | rtl | rtl | rtl |
| T8 Arabic `Python هي لغة…` | ltr | rtl | rtl |
| T9 `This line is plain English.` | ltr | ltr | ltr |

If the pattern matches neither column, write down the directions exactly as observed and say
"own rule, unidentified".

`watch.js`: `changedWhileStreaming` counts how many times a line's direction changed while the
reader was watching it arrive (0 = never). Some pages rebuild the text while streaming, which
starts a new record ("element": "new ...") - that is not a change. If you *saw* a line flip
direction on screen, say so in the notes even if the count is 0.

## Report back

Write `C:\Users\raysn\Desktop\smartrtl\paper\survey\results\SUMMARY.md` with one table:

| chat | date and time | model shown | logged in? | rule on the answer | per block or whole message | message box while typing | direction changed while streaming? | T1-T9 as observed (answer) | notes (refusals, edits, anything odd) |

Then tell the owner, in Urdu, in a few lines: which chats were checked, what each does, and
anything that could not be checked and why.
