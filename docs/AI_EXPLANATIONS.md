# AI explanations

Decided by the founder on 2026-10-12: the app and the website may show an explanation
written by an AI model, as a separate and clearly labelled layer. It lets readers get
started on chapters that have no sourced note yet. Status on 2026-10-12: the founder
approved the pilot and the app and the website both show the layer. Every one of the 66
books has an explanation of the book as a whole, which is shown on each of its chapters.
Five pilot chapters have their own, fuller explanation. The founder chose this route to
keep the cost down; shorter chapter explanations follow in daily portions (see "Plan for
the chapters").

This changes two earlier rules on purpose. "AI Study" was deferred, and unsourced context
was not published. Both now read: AI explanations are allowed as their own layer, and
sourced notes (`docs/STUDY_NOTES.md`) keep their own rules. On 2026-10-13 the founder
decided that an AI model may draft sourced context too, as long as the page says so, the
sources were actually opened and he approves it before it goes online (`CLAUDE.md`). That
does not change this layer: an AI explanation names no sources and stays labelled as such.

## What it is, and what it is not

- Written ahead of time and stored as files. Nothing is generated at build time, on a
  server or in the browser. This is not runtime AI, which stays disabled (`AGENTS.md`).
- A third layer beside Scripture and sourced context. It is never placed inside a sourced
  note, never merged with one, and never shown without its label.
- Not reviewed scholarship. Every explanation says it was written by an AI model, that it
  names no sources and that it can contain mistakes.

## Files

`public/ai/<book-slug>.json`, one per WEB book. A file holds at most one record for the
book as a whole and one per chapter. A chapter shows its own record if it has one, and
otherwise the book record (`aiFor` in `src/bible/ai.ts`).

```json
{ "book": "john", "records": [{
  "id": "ai:john", "scope": "book",
  "model": "Claude Opus 5.5", "written": "2026-10-12", "review": "ai draft",
  "sections": [
    { "kind": "summary", "text": "What the book is about." },
    { "kind": "background", "text": "..." },
    { "kind": "interpretations", "text": "..." }
  ]
}, {
  "id": "ai:john/3", "chapter": 3,
  "model": "Claude Opus 5.5", "written": "2026-10-12", "review": "ai draft",
  "sections": [
    { "kind": "summary", "text": "Paragraphs separated by a blank line." },
    { "kind": "background", "text": "..." },
    { "kind": "interpretations", "text": "Lines that start with '- ' become a list." }
  ],
  "translations": [{
    "verse": 3, "note": "What the difference is and why.",
    "renderings": [{ "translation": "KJV", "text": "Exact wording from that translation." }]
  }]
}]}
```

A record written in the storytelling voice also carries `"voice": "story"` (see "Voice").
Only the bookkeeping script reads that field; the app and the website ignore it. The
script also counts every record written on or after 2026-10-14 as told in that voice,
because the routine has used it since that day's run.

`parseAiFile` in `src/bible/ai.ts` validates every file, for the app and the website alike.
On the website an invalid file stops the build. In the app an invalid, missing or offline
file shows no AI card at all. The app loads a book's file on demand and keeps it out of the
installable cache (`vite.config.ts`).

## Rules for the text

- Curly double quotes are reserved for the WEB text being explained: the chapter, or for a
  book record any chapter of that book. Every such quotation must occur there word for
  word; the validator enforces it. Refer to other passages by reference, without quoting
  them. A book record carries no translation notes.
- American spelling, for the United States audience.
- Compare only with public-domain translations. Allowed today: KJV and ASV (1901). Never
  quote or paraphrase the wording of a licensed translation (NIV, ESV, NLT, NBV21 and
  others). Renderings are copied from a public-domain source, not typed from memory, and
  `site/tests/fixtures/public-domain-verses.json` holds the verses they are checked against.
- Where Christians differ, set the main readings side by side and name the traditions
  fairly. Do not pick a winner.
- Take extra care with hard passages: violence, slavery, sexuality, the place of women,
  judgment, and texts that have been used against Jews or other groups. Say what the text
  says and how it has been read, name harmful misuse where it is well known (for example
  that "the Jews" in John often means the leaders opposing Jesus, not a people), and give
  no medical, legal or counselling advice.
- Say "many scholars", "usually dated" or "tradition links" where that is the honest state
  of knowledge. No invented citations, numbers or quotations from writers.
- Language notes only where the point is well established, stated modestly.
- Follow the site copy rules (`docs/WEBSITE_PLAN.md`, section 5): plain English, no em
  dashes, no assumptions about the reader, growth attributed to God.
- Record the model and the date. Keep `"review": "ai draft"` until a theological reader has
  checked the record; only then `"reviewed"`.

## Voice

Asked for by the founder on 2026-10-13, for everything that explains a verse, a chapter or
a book: tell it as a story, warmly and with feeling, for believers and for people who do
not believe. Open with the scene, the person or the tension, not with "This chapter".

- The feeling has to come from what the text says. Invent nothing: no thoughts, faces,
  weather, numbers or speech that the text does not give. Where a vivid sentence and an
  accurate sentence pull apart, choose the accurate one.
- Write with respect for the Bible, for every faith and for every reader. Never mock a
  person, a people or a way of reading.
- The explanations written before this voice are retold in it, in daily portions, as the
  founder chose on 2026-10-13: the 66 book explanations first, then the 65 chapter
  explanations of 12 and 13 October. Matthew's book explanation was retold that day as the
  example to follow. `node scripts/ai-chapters.mjs status` says how many are left.
- A retelling changes the telling, not the facts. What the earlier text says from outside
  the Bible (dates, authors, history, how a passage is read) stays as it is, and nothing
  of that kind is added. A scene or a quotation taken from the book itself is read in the
  WEB text first (`node scripts/ai-chapters.mjs text <book> <chapter>`).

## How it is shown

Below the sourced context, on a chapter page of the website and in the Context tab of the
app's Reader (`src/bible/AiExplanation.tsx`): a dashed card titled "AI explanation" with an
AI badge, the line "Written by an AI model · Not reviewed by a theological reader", a short
warning, the sections, the translation comparison and a "Report a mistake" link.
`tests/ai.test.ts` checks the files and the loader; `site/tests/ai.test.ts` checks the
label, the warning, that the text is shown as written and that it never appears inside the
sourced note.

## Plan for the chapters

Agreed with the founder on 2026-10-12, to keep the cost down:

- Chapters get a shorter record than the pilot: `summary` and `background` only, no
  `interpretations` and no translation notes. The five pilot chapters stay as they are.
- They are written in daily portions by a lighter model, starting with the New Testament
  in Bible order, then the Old Testament.
- Each portion must pass `tests/ai.test.ts` before it is committed, and the `model` field
  must name the model that actually wrote it.

A cloud routine does this, set up on 2026-10-12: "HisFullGlory: daily AI chapter
explanations" (https://claude.ai/code/routines/trig_013ZcDYFyML8PRi5ML6tjgjq). It runs
every day at 04:00 UTC on Claude Sonnet 5.5, writes 30 chapters, commits them to `main`
and pushes (until pull request #2 on 2026-10-12 it used branch `website`). It has no
connectors and deploys nothing itself; the push is what makes Vercel rebuild the app and
the site, so both show the new chapters each morning. The founder approved those daily
production builds on 2026-10-12. At 30 a day the New Testament takes about 9 days and the
whole Bible about 40. Pause it on that page when `status` reports nothing left, or sooner
if the founder wants to stop.

Since 2026-10-13 the routine's instructions have a second part: after the new chapters,
retell eight earlier explanations in the storytelling voice (see "Voice") and commit them
separately. At eight a day the 66 books take about nine days and the 65 chapters another
eight. That part ends by itself when `retell-next` reports nothing left.

`scripts/ai-chapters.mjs` does the bookkeeping: `status` counts what is left, `next 30`
prints the next chapters with their WEB text, and `add drafts.json --model "<name>"` checks
a batch of drafts (length, exact WEB quotations, no licensed translation names, no em
dashes) and writes the records only if every draft passes. For retelling, `retell-next 8`
prints the next explanations still in the earlier voice with their present text,
`retell drafts.json --model "<name>"` runs the same checks and replaces those texts, and
`text <book> <chapter>` prints the WEB text of a chapter. A retold pilot chapter keeps its
"How Christians read it" section and its translation notes as they were.

## Not done yet

- Most chapters have no explanation of their own yet and show their book's explanation;
  `node scripts/ai-chapters.mjs status` gives the count.
- 65 of the 66 book explanations and the 65 chapter explanations of 12 and 13 October are
  still in the earlier, plainer voice (counted on 2026-10-13).
- Nobody reads a retelling before it goes online. The checks catch a misquoted verse, not
  a wrong detail told in the writer's own words.
- The app change reached `main` with pull request #2. The Reader card was viewed in a
  local build at phone width, not on a real device.
- No theological reader has reviewed any explanation.
