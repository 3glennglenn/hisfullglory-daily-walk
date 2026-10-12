# Study notes

Context notes live as static public files: `public/study/<book-slug>.json`, one per WEB book.
The Reader loads the current book's file on demand (`loadStudyRecords`), merges it with the
built-in chapter observations in `src/bible/provider.ts`, and shows the most specific note:
verse, then passage, then chapter, then book. A missing or invalid file shows the honest
"being written" fallback; nothing is generated at runtime.

## Record format

```json
{ "book": "romans", "records": [{
  "id": "book:romans", "scope": "book",
  "text": "Own-words summary. Quotes must match the WEB text of a basis verse exactly.",
  "source": "https://…", "sources": [{ "title": "…", "url": "https://…" }],
  "basis": ["/bible/romans/1/1"],
  "interpretiveStatus": "broad consensus | common interpretation | debated | tradition-specific | editorial observation",
  "review": "editorial draft",
  "editor": "HisFullGlory editorial"
}]}
```

`scope` `chapter` needs `chapter`; `passage`/`verse` also need `start` (and optional `end`).

## Rules

- Summarise sources in our own words; never paste copyrighted text.
- Use only public-domain or openly licensed reference works (for example Easton's Bible
  Dictionary, 1897) and the WEB text itself. Link every source.
- Every quotation in `text` must appear verbatim in one of the `basis` verses
  (`tests/study.test.ts` enforces this).
- Name disagreement plainly ("many later scholars think…") and set `interpretiveStatus`.
- No original-language claims, reconstructed history or invented citations.
- Notes stay `"review": "editorial draft"` until a theological reader approves them; the
  Reader labels drafts.

## Coverage

| Scope | Done | Total |
| --- | --- | --- |
| Book | 6 (Matthew, Mark, Luke, John, Psalms, Romans) | 66 |
| Chapter | 3 built-in observations (Psalm 23, Psalm 121, Romans 8) | 1,189 |
