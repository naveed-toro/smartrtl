# The paper

Everything for the paper lives here, apart from the extension it is evidence for.

| file | what it is | state |
|---|---|---|
| [outline.md](outline.md) | every section: its claim, the evidence we have, the evidence to build, the attack to expect | written |
| [references.md](references.md) | every source, with what it is cited for and whether it was checked word for word | being verified |
| [corpus.md](corpus.md) | the body of real answers the measurements run on | source A extracted; source B to do |
| [corpus/guide.md](corpus/guide.md) | how a text's correct direction is decided ([Urdu](corpus/guide.ur.md)) | draft, for the owner to read |
| [corpus/tools/](corpus/tools/) | extraction, the rules compared, the labelling page, measurements, tests | working, tested |
| [demo/](demo/) | Bidi Stream Lab: a neutral AI chat that streams your text back under any rule, with an inspector and a session log. `node build.mjs` builds `lab.html` from `lab.src.html`; published at https://claude.ai/artifact/2FyY8jECSnt1DynhtdoomQ | version 1 |
| [results/](results/) | measurements, counts only, each written by a script | streaming: done |

## Rules this folder keeps

- **No claim without a source or a measurement.** A quotation goes into the paper only after
  it was read at the primary source (references.md).
- **Anything personal stays private.** Text taken from the owner's own conversations lives
  in `corpus/private/`, which git ignores, until the owner has read it and released it.
- **Nothing is tuned after looking.** The guide is frozen before the first label; the labels
  before any rule is scored.
- **Everything re-runs.** Pinned dependencies, a pinned Unicode version, a fixed seed, and
  scripts instead of hand counts.

## Running

```
cd paper/corpus/tools
npm install         once
npm test            the tools' own tests
npm run label       the labelling page: http://127.0.0.1:4173/?by=owner
```

`npm run transcripts` rebuilds the snapshot from the local Claude Code transcripts - it
refuses while a snapshot exists, because the transcripts are deleted over time and the
snapshot is the corpus.

## Next

1. The owner reads `corpus/guide.md` (or the Urdu translation) and corrects it; it is frozen.
2. The owner labels, from the page, at least 1,000 texts.
3. Meanwhile: every reference verified at its source; WildChat's licence and RTL counts; the
   reading-cost measure (outline section 3); the known rules implemented for scoring.
