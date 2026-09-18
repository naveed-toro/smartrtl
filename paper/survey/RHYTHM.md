# Recording how real chats stream (Part 2)

For the paper's question *can a reader see a block turn?* we need the real rhythm of each chat:
how many characters appear per painted frame, and how often. `rhythm.js` records exactly that -
counts and times only, never text.

## Each recording

1. Open the chat. Start a new conversation.
2. Open the developer console:
   - a browser chat (ChatGPT, Gemini, Claude.ai, ...): press **F12**, tab **Console**;
   - Claude Code in VS Code: **Ctrl+Shift+P → "Developer: Open Webview Developer Tools"**, tab **Console**,
     and in the drop-down at the top of the console (it says `top`) choose **`active-frame`** - the
     panel's own page. Pasted into `top`, it measures an empty page.
3. Paste all of `rhythm.js`, press Enter. It prints "rhythm recording for 120 s".
4. At once send a message that gets a **long** answer, for example:
   *"Urdu mein React ke hooks ki tafseel se wazahat karo, har hook ki misaal ke saath."*
5. When the answer has finished (or the 120 s are up), run `window.__rhythmReport()` if it has
   not printed already, and copy the JSON line it printed.
6. Save it as `paper/survey/results/<chat>-rhythm.json` - `claude-code`, `chatgpt`, `gemini`,
   `claude-ai`, `deepseek`, ...

Two recordings per chat are better than one; add `-2` to the second file's name.

## What happens next

The report's `charsPerSecond`, `charsPerFrame` and `msBetweenFrames` are how fast a real chat puts
its answer on the screen. The lab's stream delay is set from them, per chat, in place of any
published model speed: a model's speed at its API is not what a reader sees, because a chat may
gather tokens before it paints them.
