# AI explanations

Decided by the founder on 2026-10-12: the app and the website may show an explanation
written by an AI model, as a separate and clearly labelled layer. It lets readers get
started on chapters that have no sourced note yet. Status: pilot of five chapters, shown on
the website only, awaiting the founder's judgment of the quality.

This changes two earlier rules on purpose. "AI Study" was deferred, and unsourced context
was not published. Both now read: AI explanations are allowed as their own layer; sourced
notes (`docs/STUDY_NOTES.md`) stay exactly as they were and are never written by AI.

## What it is, and what it is not

- Written ahead of time and stored as files. Nothing is generated at build time, on a
  server or in the browser. This is not runtime AI, which stays disabled (`AGENTS.md`).
- A third layer beside Scripture and sourced context. It is never placed inside a sourced
  note, never merged with one, and never shown without its label.
- Not reviewed scholarship. Every explanation says it was written by an AI model, that it
  names no sources and that it can contain mistakes.

## Files

`public/ai/<book-slug>.json`, one per WEB book, with one record per chapter:

```json
{ "book": "john", "records": [{
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

`site/src/lib/ai.ts` validates every file (`parseAiFile`). An invalid file stops the build.

## Rules for the text

- Curly double quotes are reserved for the WEB text of the chapter being explained. Every
  such quotation must occur in that chapter word for word; the validator enforces it. Refer
  to other passages by reference, without quoting them.
- Compare only with public-domain translations. Allowed today: KJV and ASV (1901). Never
  quote or paraphrase the wording of a licensed translation (NIV, ESV, NLT, NBV21 and
  others). Renderings are copied from a public-domain source, not typed from memory, and
  `site/tests/fixtures/public-domain-verses.json` holds the verses they are checked against.
- Where Christians differ, set the main readings side by side and name the traditions
  fairly. Do not pick a winner.
- Say "many scholars", "usually dated" or "tradition links" where that is the honest state
  of knowledge. No invented citations, numbers or quotations from writers.
- Language notes only where the point is well established, stated modestly.
- Follow the site copy rules (`docs/WEBSITE_PLAN.md`, section 5): plain English, no em
  dashes, no assumptions about the reader, growth attributed to God.
- Record the model and the date. Keep `"review": "ai draft"` until a theological reader has
  checked the record; only then `"reviewed"`.

## How it is shown

On a chapter page of the website, below the sourced context: a dashed card titled
"AI explanation" with an AI badge, the line "Written by an AI model · Not reviewed by a
theological reader", a short warning, the sections, the translation comparison and a
"Report a mistake" link. `site/tests/ai.test.ts` checks the label, the warning, that the
text is shown as written and that it never appears inside the sourced note.

## Not done yet

- The app does not show AI explanations. When it does, move the validator next to
  `src/bible/knowledge.ts`, keep the same files and label, and update the Reader's fallback
  sentence ("We do not generate unsourced scholarship").
- Only five chapters exist: Genesis 1, Psalm 23, Matthew 5, John 3 and Romans 8. Writing
  the other 1,184 waits for the founder's decision after the pilot.
