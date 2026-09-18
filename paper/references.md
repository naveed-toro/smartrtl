# References

Every source the paper may cite, with what it is cited **for**. Accessed 2026-09-17 unless
another date is given.

Status:
- **verified** - the primary source was downloaded and the facts and quotations below were
  found in it, character for character (quotations here are copied from that download, not
  from a summary; runs of whitespace and line breaks are normalised to one space).
- **read** - opened at the source through a tool that summarises pages; the fact is right in
  substance, but nothing from it may be quoted until it is verified.
- **secondary** - known only from another document; find the primary source or do not cite.

A version identifier is recorded wherever the source has one, because a living page can
change after it was read.

**What verification already corrected.** Two statements made from summaries before
2026-09-17 were wrong, and are fixed below: [HTML-BIDI-REQ] does not call any-RTL
"untested" - it says word count is "untested for other languages" and character count
"untried and unproven"; and [RFC1556]'s definition of implicit directionality continues
"and according to their primary direction", which the summary dropped.

---

## Standards and specifications

**[RFC1556]** H. Nussbacher (Israeli Inter-University Computer Center). *Handling of
Bi-directional Texts in MIME.* RFC 1556, Informational, December 1993.
https://www.rfc-editor.org/rfc/rfc1556.txt
- **verified.**
- "Visual directionality is a presentation method that displays text according to the
  primary display direction only, which is left to right."
- "Implicit directionality is a presentation method in which the direction is determined by
  an algorithm according to the type of characters and their position relative to the
  adjacent characters and according to their primary direction."
- Charsets `ISO-8859-6-e`, `ISO-8859-6-i`, `ISO-8859-8-e`, `ISO-8859-8-i`: "The "i" suffix
  refers to implicit mode and the "e" suffix refers to explicit mode."
- It names ECMA TR/53 as the source of the explicit method: "defined in ECMA TR/53, which
  defines three new control functions and updates 22 existing control functions in the
  ECMA-48 standard."

**[ECMA-TR53]** Ecma International. *Handling of Bi-Directional Texts.* Technical Report
TR/53, 1st edition, June 1992.
https://ecma-international.org/publications-and-standards/technical-reports/ecma-tr-53/
- **read.** Its content is confirmed by [RFC1556] (verified); the report's own PDF is still
  to be read.

**[TR53-REVIEW]** Terminal Working Group. *ECMA TR/53 review.*
https://terminal-wg.pages.freedesktop.org/bidi/ecma-tr53-review.html
- **read.** An assessment (no known implementations; no explicit paragraph direction), cited
  only as an assessment.

**[RFC2070]** F. Yergeau (Alis Technologies), G. Nicol (Electronic Book Technologies),
G. Adams (Spyglass), M. Duerst (University of Zurich). *Internationalization of the Hypertext
Markup Language.* RFC 2070, Standards Track, January 1997.
https://www.rfc-editor.org/rfc/rfc2070.txt
- **verified.**
- DIR: "all elements except BR, HR, BASE, NEXTID, and META admit this attribute."
- "A new phrase-level element called BDO (BIDI Override) is introduced, which requires the
  DIR attribute to specify whether the override is left-to-right or right-to-left."

**[HTML4]** W3C. *HTML 4.0 Specification.* W3C Recommendation, 18 December 1997.
https://www.w3.org/TR/REC-html40-971218/
- **secondary** (date from [DAGAN]); open the Recommendation.

**[UTR9-1999]** M. Davis (IBM). *Unicode Technical Report #9: The Bidirectional Algorithm.*
Revision 6.0, 1999-11-11. https://www.unicode.org/reports/tr9/tr9-6.html
- **verified.**
- "P2. In each paragraph, find the first character that is a strong directional type (L, AL,
  R)."
- "Note that when a higher-level protocol specifies the paragraph level, it is not necessary
  to apply rules P2 and P3."
- "The algorithm extends the implicit model currently employed by a number of existing
  implementations and adds explicit format codes for special circumstances."

**[UAX9]** M. Goregaokar, R. Leroy (eds.). *Unicode Standard Annex #9: Unicode
Bidirectional Algorithm.* Unicode 18.0.0, revision 52, 2026-09-01 (stable).
https://www.unicode.org/reports/tr9/tr9-52.html
- **verified.** Revision 51 (Unicode 17.0.0, 2025-08-13) has the same wording for all three
  quotations.
- P2: "In each paragraph, find the first character of type L, AL, or R while skipping over
  any characters between an isolate initiator and its matching PDI or, if it has no matching
  PDI, the end of the paragraph."
- HL1: "A higher-level protocol may use an entirely different algorithm that heuristically
  auto-detects the paragraph embedding level based on the paragraph text and its context.
  For example, it could base it on whether there are more RTL characters in the text than
  LTR."
- "Directional isolate characters were introduced in Unicode 6.3 after it became apparent
  that directional embeddings usually have too strong an effect on their surroundings and are
  thus unnecessarily difficult to use. The new characters were introduced instead of changing
  the behavior of the existing ones because doing so might have had an undesirable effect on
  those existing documents that do rely on the old behavior."

**[UCD-BIDI]** Unicode Consortium. *DerivedBidiClass.txt*, Unicode 18.0.0, dated
2026-07-02. https://www.unicode.org/Public/18.0.0/ucd/extracted/DerivedBidiClass.txt
- **verified.** SHA-256 `d9e23222522551348ea1ccfbb4f62efbf98982afb95840f8959c08ed992c5607`;
  the corpus tools use exactly this file.

**[UNICODE-1.0]** The Unicode Consortium. *The Unicode Standard, Version 1.0.* 1991.
- **secondary**; the book's bidi text not yet read.

**[UNICODE-FAQ-BIDI]** Unicode Consortium. *FAQ - Writing Direction and Bidirectional
Text.* https://www.unicode.org/faq/bidi.html
- **verified.** Not normative; cite as the Consortium's guidance.
- "The paragraph direction can be based on the first strongly directional character in the
  text. But as this is often an incorrect guess, one option is to override such a guess by
  making an explicit choice, whether by means of the document style or the user interface."

**[HTML-LS]** WHATWG. *HTML Living Standard*, "The dir attribute". Last updated 16 September
2026 (whatwg/html commit `d78d7dd8efb783a9a32e187da5152e756ec6bae8`).
https://html.spec.whatwg.org/multipage/dom.html#the-dir-attribute
- **verified.**
- "The heuristic used by the Auto state is very crude (it just looks at the first character
  with a strong directionality, in a manner analogous to the Paragraph Level determination in
  the bidirectional algorithm). Authors are urged to only use this value as a last resort
  when the direction of the text is truly unknown and no better server-side heuristic can be
  applied."
- "For textarea and pre elements, the heuristic is applied on a per-paragraph level."
- For attributes: "Find the first character (in logical order) of the attribute's value that
  is of bidirectional character type L, AL, or R."

**[CSS-WM3]** W3C. *CSS Writing Modes Level 3* - `unicode-bidi: isolate | plaintext`.
https://www.w3.org/TR/css-writing-modes-3/
- **secondary**; read the Recommendation text.

**[STRING-META]** R. Ishida, A. Phillips (eds.). *Strings on the Web: Language and Direction
Metadata.* W3C First Public Working Draft, 16 July 2026.
https://www.w3.org/TR/2026/WD-string-meta-20260716/
- **verified.**
- "first-strong heuristics would produce the wrong result for a string such as " HTML و CSS:
  تصميم و إنشاء مواقع الويب "."
- "The main problem with this approach is that it produces the wrong result for strings that
  begin with a strong character with a different directionality than that needed for the
  string overall (eg. an Arabic tweet that starts with a hashtag)"
- "Assignment of metadata (either as a resource-wide default, or in a string-specific label)
  is an intentional act that removes the need to guess the outcome by applying heuristics."

## Proposals and the decisions on them

**[L2/09-411]** A. Lanin (Google), with A. Allawi (Diwan Software) and M. Allouche (IBM).
*A Proposal for HTML Improvements for Bidi.* Unicode document L2/09-411 (revised as
L2/09-411R), registered 2009-11-02. https://www.unicode.org/L2/L2009/09411-bidi.html
- **verified**, including the date in the Unicode document register
  (https://www.unicode.org/L2/L2009/Register-2009.html).
- On first-strong: "it is not uncommon for an RTL phrase to start with an LTR word like a
  brand name or a technical term, and here this algorithm fails."
- On any-RTL: "This fails for LTR text that includes some RTL, which is quite uncommon, but
  not unheard of."
- On word count: "Works very well, but also fails unexpectedly."
- "Different approaches have been preferred in different contexts: first-strong for search
  boxes, any-RTL for advertisements, and word-count for longer texts like e-mails."
- "For most real-world data strings, all these estimation algorithms will give the same
  correct result." - a claim the corpus can test on machine-written text.

**[HTML-BIDI-REQ]** A. Lanin (ed.). *Additional Requirements for Bidi in HTML.* W3C Working
Draft 10 February 2011, editor's copy (`Overview.html,v 1.17 2011/02/22`).
https://www.w3.org/International/docs/html-bidi-requirements/ (latest: https://www.w3.org/TR/html-bidi/)
- **verified.**
- "Nevertheless, it is not uncommon for an RTL phrase to start with an LTR word like a brand
  name or a technical term, in which case this algorithm fails."
- Word count: "Works well for a mixture of the RTL languages with English, but untested for
  other languages, and not well-defined for the languages that do not use spaces to separate
  words. Also, it proves unintuitive to the user in some circumstances."
- Character count: "This remains untried and unproven."
- "Since there is no one perfect, practical direction estimation algorthm currently known,
  and since different known algorithms are heuristic and work best in different use cases,
  we support two algorithms and allow a new HTML element attribute,
  autodirmethod="first-strong"|"any-rtl", to specify which algorithm dir=auto should use."
  (The misspelling "algorthm" is the source's.)

**[MOZ-548206]** Mozilla Bugzilla. *Bug 548206 - (DirAuto) Implement the auto value for the
HTML dir attribute.* Opened 2010-02-24 (E. Akhgari); RESOLVED FIXED 2012-11-22, target
mozilla20. https://bugzilla.mozilla.org/show_bug.cgi?id=548206 (read through the REST API,
`/rest/bug/548206/comment`).
- **verified.**
- Comment 0 (2010-02-24): "Fantasai suggested this heuristic: Look at the first 63 alphabet
  characters of the text inside the element. If it contains any strong RTL characters, then
  set the direction to rtl. Otherwise, set it ltr."
- Comment 13 (S. Montagu, 2010-03-17), quoting Lanin: "This is basically the any-RTL
  algorithm, and I think is generally less useful than either first-strong or word-count. It
  fails on casual LTR text "peppered" with some RTL words (e.g. a chat between expats from
  RTL countries), as well as on scholarly LTR text that uses some RTL words for precision
  (e.g. a discussion on biblical topics)."
- Comment 34 (A. Lanin, 2011-08-07): "The first-strong heuristic is certainly not ideal.
  Google rarely uses it, preferring either the any-RTL heuristic or a word-count heuristic
  (over 40% of words are RTL -> it's RTL). However, no known algorithm is perfect, and
  first-strong has the advantages of being very fast for long strings, and fairly easy for
  the user to figure out and even control [...] The HTML5 editor / WG decided to stick with
  first-strong and did not accept the proposal to add some way for the page to choose the
  algorithm."
- Comment 35 (a user, 2011-08-09): "only in convoluted speech would one ever start a sentence
  in an RTL language with LTR text, or vice versa. Nobody would ever speak or type like that,
  it doesn't even sound right. [...] That is a consequence of how people write." - the
  assumption behind first-strong, stated plainly, from the era of human-written text. Cite
  as a user's view, not a decision.

**[LANIN-2010-0020]** A. Lanin. public-i18n-bidi, 2010.
https://lists.w3.org/Archives/Public/public-i18n-bidi/2010JanMar/0020.html
- **secondary** (quoted in [MOZ-548206]); open the message itself.

**[ATKINS-2010]** T. Atkins Jr. *Re: Re: FPWD of Additional Requirements for Bidi in HTML.*
public-i18n-bidi, 2010-03-20.
https://lists.w3.org/Archives/Public/public-i18n-bidi/2010JanMar/0034.html
- **verified.**
- "If we have to expose the algorithm at all, I like this one. I'm still dubious that it's
  useful to do this, but at least this hides the algorithm from people who don't care about
  it, and reduces the need to specify the algorithm multiple times."

**[BIDI-IMPL-STATUS]** *Implementation status of "Additional Requirements for Bidi in
HTML".* Google Docs.
https://docs.google.com/document/d/17nb3wlYkIG9MNtL1mlXVPOVe4QwyApiHRYim3nTi5CE/
- **read**; no author or date shown. Replace with the W3C records of the same decisions
  (i18n tracker, HTML WG bugs) before citing.

**[AUTO-RTL]** *bidi-dir* (proposal for `dir="auto-rtl"` / `"auto-ltr"`). macchiato.com.
https://www.macchiato.com/unicode-intl-sw/utc/bidi-dir
- **read**; author and date not shown - identify before citing.

**[L2/12-186]** A. Lanin; revision with M. Davis and R. Pournader. *A Proposal for Bidi
Isolates in Unicode.* Unicode L2/12-186, 2012.
https://www.unicode.org/L2/L2012/12186-bidi-isolates.pdf ,
https://www.unicode.org/L2/L2012/12186r-bidi-isolates.pdf
- **read**; dates (7 May and 9 October 2012) to be confirmed in the PDFs and the register.

**[TERMINAL-BIDI]** Terminal Working Group. *BiDi in Terminal Emulators.* Work in progress.
https://terminal-wg.pages.freedesktop.org/bidi/
- **read**; author (E. Koblinger, to confirm) and version.

**[ZARETSKII-2019]** E. Zaretskii. *Bidi paragraph direction in terminal emulators.* Unicode
mailing list, Sun, 03 Feb 2019.
http://unicode.org/mail-arch/unicode-ml/y2019-m02/0052.html
- **verified.**
- "the implicit mode described in the above-mentioned document needs to be augmented by a
  smarter method of determining the base paragraph direction."

## Implementations

**[CLOSURE-BIDI]** Google. *Closure Library*, `closure/goog/i18n/bidi.js`, last changed in
commit `0d779e6baca4cf9d650aa28c3146305db3c101ce` (2023-10-16); repository archived.
https://github.com/google/closure-library/blob/0d779e6baca4cf9d650aa28c3146305db3c101ce/closure/goog/i18n/bidi.js
- **verified.**
- `goog.i18n.bidi.rtlDetectionThreshold_ = 0.40;`
- "Estimates the directionality of a string based on relative word counts. If the number of
  RTL words is above a certain percentage of the total number of strongly directional words,
  returns RTL. [...] Numbers are counted as weakly LTR."

**[AA-SPEED]** Artificial Analysis. *LLM Leaderboard - Comparison of AI models*, output speed,
and *Performance Benchmarking Methodology*. Read 2026-09-17; a living page, figures change.
https://artificialanalysis.ai/leaderboards/models ·
https://artificialanalysis.ai/methodology/performance-benchmarking
- **read**; cited for how fast tokens arrive while an answer streams. Output speed is "the
  average number of tokens received per second, after the first token is received", the median
  (P50) over the past 72 hours, measured through each provider's API from Google Cloud
  us-central1. On 2026-09-17: Claude Opus 5 53, Claude Sonnet 5 72, Claude Fable 5.1 68,
  GPT-6 Astra 53, GPT-5.6 Luna 119-124 tokens/s; fast models higher (Gemini 3.8 Flash 345).
- Measured at the API, not in a chat app's page; a chat app may batch tokens before painting.
  Save a snapshot of the page before citing, and add real chat recordings (survey/RHYTHM.md).

**[ANDROID-TDH]** Android. *TextDirectionHeuristics.* API level 18.
https://developer.android.com/reference/android/text/TextDirectionHeuristics
- **read**; quote the field descriptions from the page before citing.

## Public requests (evidence the problem is live)

All **read**; each to be re-read through the GitHub API with its state and dates recorded
before citing.

- **[TDESKTOP-3845]** telegramdesktop/tdesktop #3845, *Proposal: Better RTL detection*,
  2017-08-29; character count; closed automatically.
  https://github.com/telegramdesktop/tdesktop/issues/3845
- **[HERMES-51318]** NousResearch/hermes-agent #51318, 2026-06-23; majority count; open.
  https://github.com/NousResearch/hermes-agent/issues/51318
- **[HERMES-100280]** NousResearch/hermes-agent #100280 - title only so far.
  https://github.com/NousResearch/hermes-agent/issues/100280
- **[CC-75196]** anthropics/claude-code #75196, 2026-07-07; proposes `unicode-bidi:
  plaintext`; closed as not planned. https://github.com/anthropics/claude-code/issues/75196
- **[CC-38005]** anthropics/claude-code #38005, 2026-03-23 (RTL in Claude Desktop).
  https://github.com/anthropics/claude-code/issues/38005
- **[OPENCLAW-147732]** openclaw/openclaw #147732, 2026-09-14; open.
  https://github.com/openclaw/openclaw/issues/147732
- **[BIDILENS]** CodeinScrubs/BidiLens - content-majority direction with "bounded
  re-analysis" while streaming; cite a commit and read the implementation first.
  https://github.com/CodeinScrubs/BidiLens

## Why this matters (Introduction I.0)

The sources behind the opening claims: that people read their own language faster and with
less effort, that writing it in Latin letters costs the reader something, that people do talk
to these systems in their own language, and how many readers of right-to-left scripts there
are. Read 2026-09-18.

**[L2-READING]** F. Rocabado, G. Schmitz, J. A. Duñabeitia. *You Can Stand Under My Umbrella:
Cognitive Load in Second-Language Reading.* Behavioral Sciences 15(8):1051, 2025.
https://doi.org/10.3390/bs15081051 (open access; PMC12382749)
- **read**; cited for the cost of reading in a second language.
- "L2 reading is generally slower and more effortful than reading in the native language (L1),
  often involving additional cognitive load."
- "reading in L2 takes longer than in L1, even for highly proficient readers."
- The sentences came back through a summarising fetch: verify them in the PDF before printing.

**[ARABIC-ORTHO]** I. Asadi, A. Asli-Badarneh. *Diglossia and Orthographic Complexity as
Multiplicative but not Additive Challenges in Arabic: A Critical Review.* Journal of
Psycholinguistic Research, 2026. https://doi.org/10.1007/s10936-026-10214-3 (open access;
PMC13050341)
- **read**; cited for what Latin-letter Arabic costs a reader.
- "In the Arabizi condition, students performed well with narratives but poorly with expository
  texts, showing that script familiarity aids informal reading but not academic comprehension."
- The study it reviews (eighth-grade readers, Arabizi against vowelled and unvowelled Arabic)
  is the primary source and has still to be read: Reading and Writing,
  https://doi.org/10.1007/s11145-021-10143-8 - Springer asked for a login.

**[ARABIZI-USE]** A. Keleg, A. A. Ben Abdallah, T. Yassine, C. Helwe, I. Guellil, N. Ousidhoum.
*Romanized Arabic Across Dialects: Views, Usage Patterns, and Linguistic Variation.*
arXiv:2608.02555, 2026-08-03. https://arxiv.org/abs/2608.02555
- **read**; cited for people writing their own language in Latin letters, and what they think
  of it: "the prevalence and usage of Arabizi vary by factors such as region and age group".

**[CHATGPT-LANG]** OpenAI (Global Affairs, OpenAI Signals). *How ChatGPT adoption has expanded.*
2026-06-30. https://openai.com/index/how-chatgpt-adoption-has-expanded/
- **verified from the page by the owner, 2026-09-18** - the site refuses an automated fetch
  (403), so it was opened in a browser and the text taken from it. Anyone checking this does the
  same. The companion working paper - A. Chatterji, T. Cunningham, D. Deming, Z. Hitzig, C. Ong,
  C. Shan, K. Wadman, *How People Use ChatGPT*, NBER Working Paper 34255, September 2025,
  https://www.nber.org/papers/w34255 - was downloaded and searched here: it carries the task and
  growth figures, and no language figures at all.
- "Non-English ChatGPT usage grew alongside global usage. Users predominantly using a language
  other than English now represent over half of active users. The leading non-English languages
  on ChatGPT are Spanish, Portuguese, and Arabic."
- "Uzbek, Kazakh, and Burmese were the languages with the largest percentage increase in their
  share of active users since July 2023."
- "ChatGPT adoption has grown sharply across every continent since July 2023. In relative terms,
  the fastest growth has been in Africa and Asia."
- "lower-Human Development Index (HDI) countries have seen the fastest relative growth in weekly
  active users since July 2023"
- Its own method note, which the paper quotes with the figure: "Language is assigned using each
  user's most recent available language classification profile. Monthly shares include users
  active in the seven days preceding the first day of each month who are over 18 years of age."
- What it does and does not say: it counts **users by their predominant language**, not messages,
  and it names Arabic third among non-English languages - it gives no figure for Persian, Urdu or
  Hebrew, and none for how those users write (script or transliteration).

**[SPEAKERS-AR]** UNESCO, *World Arabic Language Day*, and the United Nations, *World Arabic
Language Day*. Read 2026-09-18. https://www.unesco.org/en/world-arabic-language-day ·
https://www.un.org/en/observances/arabiclanguageday
- **read** (both pages fetched here, same wording on each); cited for how many people Arabic
  serves and for its standing at the UN.
- Arabic is "used daily by more than 400 million people".
- The day "coincides with the day in 1973 that the General Assembly of the United Nations
  adopted Arabic as the sixth official language of the Organization."
- Note for the paper: this is a round figure from an observance page, not a census. It is enough
  for "this is not a niche"; it is not enough for any arithmetic.

**[POPULATION]** World Bank, *Population, total* (indicator `SP.POP.TOTL`), read through the
World Bank API 2026-09-18, most recent value per economy.
https://api.worldbank.org/v2/country/ARB;PAK;IND;IRN;ISR/indicator/SP.POP.TOTL?format=json
- **verified** (fetched here as JSON, the figures below are its own):

| | 2025 population |
|---|---|
| Arab World (World Bank aggregate) | 503,356,133 |
| Pakistan | 255,219,554 |
| India | 1,463,865,525 |
| Iran | 92,417,681 |
| Israel | 10,122,800 |

- What this is and is not: these are **people living in those countries**, not counts of readers
  of a script. They belong in the paper only as the scale of the places where these scripts are
  the script of daily life, beside [SPEAKERS-AR]'s "more than 400 million" for Arabic, and never
  as "N readers of Urdu". The per-language counts below are what would carry that claim.

**[SPEAKERS]** Per-language counts of readers - Urdu, Persian, Hebrew and the rest - **still to
be cited from official sources**, and every automated route to them failed on 2026-09-18:
- Pakistan's 7th Population and Housing Census 2023, Table 11, *Population by Mother Tongue*:
  the PDF opens but its text is drawn with a custom font encoding, so it cannot be read by
  script - it has to be read by eye. Start at https://www.pbs.gov.pk/digital-census (the
  National Census Report 2023 also carries "Percentage of Population by Mother Tongue", Table
  4.14).
- Census of India 2011, table C-16 *Population by Mother Tongue* - `censusindia.gov.in` and
  `language.census.gov.in` were unreachable from here (a bad certificate and a refused
  connection).
- Israel's Central Bureau of Statistics: the media-release index loads, but no Hebrew Language
  Day release was found in it - https://www.cbs.gov.il/en/Pages/SubjectPressReleases.aspx
- Iran's Statistical Centre (`amar.org.ir`) closed the connection.
Nothing goes into the paper from a secondary summary; where the number cannot be read from the
source, the paper uses [POPULATION] and says what it is.

## Datasets

**[WILDCHAT]** W. Zhao, X. Ren, J. Hessel, C. Cardie, Y. Choi, Y. Deng. *WildChat: 1M
ChatGPT Interaction Logs in the Wild.* ICLR 2024. arXiv:2405.01470.
Datasets: https://huggingface.co/datasets/allenai/WildChat-1M (revision `7d6490e4`, ODC-BY)
and https://huggingface.co/datasets/allenai/WildChat-4.8M (revision
`c827c6df8fcf008219ffaffa4d1dd77491099367`, ODC-BY, not gated) - the one the corpus uses.
- **verified** (licence and revision from the Hugging Face API; counts read from the files).
- WildChat-4.8M at that revision: 3,199,860 conversations in its 86 train files; by language
  label Arabic 77,487, Persian 23,937, Hebrew 1,391, Urdu 602.

**[LMSYS-CHAT-1M]** L. Zheng et al. arXiv:2309.11998, 2023.
https://huggingface.co/datasets/lmsys/lmsys-chat-1m
- **read.** Its licence forbids redistribution: a possible check, never published data.

## Background (not cited in the paper)

- **[DAGAN]** N. Dagan, *Hebrew on the web: standards*,
  https://www.nirdagan.com/hebrew/standards.html - a lead to primary sources.
- **[MS-DIRECTIONALITY]** Microsoft Learn, *Text directionality*, 2023-10-31,
  https://learn.microsoft.com/en-us/globalization/fonts-layout/text-directionality - read in
  full; a vendor explainer, cite only if a vendor statement is needed.
- **[WIKI-UBA]**, **[RTLWTF]**, **[GROKIPEDIA-HEBREW-KB]** - leads only.
