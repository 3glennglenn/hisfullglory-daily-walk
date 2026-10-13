# hisfullglory.com (site)

The public website: static pages built with Astro. Plan and build order: `docs/WEBSITE_PLAN.md`.
The app in the repository root is not changed by anything in this folder.

## Run it

```
cd site
npm install
npm run dev      # http://127.0.0.1:4321
npm run build    # static files in site/dist
npm run check    # build, then test the built pages
```

## What is shared with the app

`scripts/sync-shared.mjs` runs before `dev` and `build` and reads from the app:

- colour tokens (Light and Dark) from `src/styles.css`
- the brand icons from `public/`

The results are generated files (see `.gitignore`); do not edit them. If the app's token
block changes shape, the script stops the build with a clear message.

`src/lib/bible.ts` reads, at build time and without copying:

- the WEB text from `public/bible/web.json`
- the study notes from `public/study/<book>.json`, validated with the app's own
  `parseStudyFile`, plus the app's built-in chapter observations

An invalid study file stops the build. The site never writes, generates or rewords a note.

`src/lib/ai.ts` reads the AI explanations from `public/ai/<book>.json` and validates them.
They are a separate labelled layer (`docs/AI_EXPLANATIONS.md`): written ahead of time,
shown in their own card below the sourced context, never inside it.

## Tests

`tests/bible.test.ts` checks the built pages: every book and chapter page exists (1 + 66 +
1,189), every verse on a chapter page equals the WEB text, every quotation in a note occurs
in its basis verses, and each page shows its note as written or the "being written"
fallback.

`tests/ai.test.ts` checks the AI explanations: a misquoted verse or a licensed translation
is rejected, wording from other translations matches the public-domain verse on file, and
each page shows the explanation as its own labelled block, apart from the sourced note.

`tests/pages.test.ts` checks the site as a whole: every page loads its styles, every
internal link leads somewhere, addresses have no trailing slash, navigation items are links
only when their page exists, the copy has no em dashes, each resource links to its product
in the shop and shows its picture, every page carries the theme switch, and no redirect
hides a page of this site.

`tests/seo.test.ts` checks what search engines and link previews get: the sitemap lists
every indexable page once and nothing else, `robots.txt` names it, every indexable page has
its own title and description and its Open Graph tags, the share image is 1200 by 630, and
the not-found page exists and is not indexed.

`tests/content.test.ts` checks the topic pages and articles on file: a misquoted verse, a
passage reason without a quotation or a wrong reference is rejected, only approved files
are built, and a built page shows its text as written and says how it was made.

## Topic pages, articles and context checks

A context check (`content/context-checks/<slug>.json`) puts one well-known verse back into
its surroundings, told as one continuing story: `story` (the story around it), `moment`
(who is speaking, to whom, and what was happening to them), `around` (what stands around
the verse), `readings` (how people have read it, side by side and without a winner) and
`point` (what the context adds). The founder asked for this on 2026-10-13: no short fact
fields, because a reader's interest drops there. Every quotation in curly double quotes
must occur in the verse or in its `basis` passages. `hook` opens the page, is its
description for search engines, and is the opening line for a video about it. A published
check gets its own page under `/context-checks`, a card on the chapter page of its verse
and, for the first three, a place on the home page. The eleven checks of 2026-10-13 are
drafts written by an AI model.

Each check also tells `story`, the story around the verse, and says in `storyStatus` what
that story rests on: `scripture` (the Bible itself), `history` (background from outside
the Bible) or `reading` (one reading that scholars dispute). For the last two, `sources`
must list what was used, and the page shows those links. Rules for a story:

- Tell it as a story, with feeling: a scene, people, what was at stake. The feeling has
  to come from what the sources say. No invented detail, and no claim made larger than
  its source. The founder asked for this style on 2026-10-13.
- Write with respect, for the faith and for readers. `known` says what a verse means to
  the people who quote it; it never makes a common use look foolish.
- `voices` holds what named people said, word for word, each with the page where it can
  be read. The page adds the quotation marks, because curly double quotes in the files
  are reserved for the WEB text.
- Use a source only after opening it, link it, and tell the story in our own words.
- Say who holds a reading and that others differ, where that is the case. The right
  cheek in Matthew 5:39 is the model: the Mishnah for the facts, Walter Wink for the
  reading, and a sentence that other scholars are more careful.
- Curly double quotes stay reserved for the WEB text, also inside a story.
- A page invites readers to send a source that says otherwise. Disputes inside the app
  are wanted and not built yet.

Editorial content also lives in `content/topics/<id>.json` (one per launch topic) and
`content/articles/<slug>.json`. `src/lib/content.ts` validates every file and an invalid one
stops the build.

- A file is built only when it says `"review": "approved"`, with the date in `"approved"`.
  Only the founder approves; a new file starts as `"draft"`. `/topics` and `/articles`, their navigation items and the
  sitemap entries appear with the first approved file of each kind.
- Curly double quotes are reserved for words from the WEB text. In a topic file every
  passage reason must quote its own passage. In an article every quotation must occur in
  one of its `basis` passages.
- Sources are the WEB text and public-domain or openly licensed works that were actually
  opened (`docs/STUDY_NOTES.md` has the same rule). No reconstructed history, no
  original-language claims, no quotations from writers.
- `"drafted": "ai"` makes the page say that it was written with the help of an AI model.
  The eight topic pages and three articles of 2026-10-13 were written by an AI model and
  approved by the founder that day. No theological reader has read them.
- To look at drafts as pages, build and test with `SHOW_DRAFTS=1` (PowerShell:
  `$env:SHOW_DRAFTS = "1"; npm run check`). Drafts then carry a "Draft" label and noindex.
  Never set it in Vercel.

## Search engines and sharing

- `src/pages/sitemap.xml.ts` builds the sitemap from `src/lib/pages.ts`. A new page outside
  the Bible is added to that list in the same change; the test fails if it is forgotten.
- A page is indexable unless it passes `noindex` to the layout (`/styleguide`, the
  not-found page). The review address on vercel.app is kept out of search results as a
  whole by the header in `vercel.json`.
- Every page shares one image, `public/og.png`. Its design is `scripts/og-image.html`;
  after changing it, run `npm run og` (see the note at the top of `scripts/og-image.mjs`)
  and commit the new image.
- `src/pages/404.astro` becomes `404.html`, which Vercel serves for unknown addresses.

## Conventions

- `src/config.ts` holds the site name, the app and shop addresses and the navigation.
  A navigation item gets `ready: true` in the same change that adds its page, so the site
  never links to a page that does not exist.
- `/styleguide` is an internal reference page: not in the navigation, not indexed.
- Light and Dark follow the visitor's device unless they pick one with the switch in the
  footer (Auto, Light, Dark). The choice is kept in the browser as `hfg-theme` and applied
  in the page head, before the page is drawn. Without JavaScript the switch stays hidden.
- The Resources page shows each product's first picture straight from Shopify's image
  address (`cdn.shopify.com`), so a visitor's browser contacts Shopify on that page only.
- A topic page ends with a card that points to Circles in the app.
- Copy rules: `docs/WEBSITE_PLAN.md`, section 5.

## Status

Done from the build order in `docs/WEBSITE_PLAN.md`, section 9:

1. Scaffold, shared tokens, layout, header and footer.
2. Bible pages: `/bible`, `/bible/<book>` and `/bible/<book>/<chapter>`, with the build test.
3. Home, About, Beta and Resources. The About story is the founder's, approved 2026-10-12.
   The launch topics on Home open in the app until the topic pages of step 4 exist.
4. Topics and articles: pages for the eight launch topics and three articles, approved by
   the founder on 2026-10-13. Each passage on a topic page links to the full passage.
5. Search engines and sharing: titles, descriptions, canonical addresses, sitemap,
   `robots.txt`, share image and a not-found page.

Addresses have no trailing slash (`/bible/psalms/23`); each page is built as
`<address>/index.html` and `vercel.json` is ready for that.
Live on https://hisfullglory.com since 2026-10-13 (Vercel project `hisfullglory-site`,
connected to this repository; a push to `main` redeploys it). The review address
https://hisfullglory-site.vercel.app stays, and `vercel.json` sends a noindex header there
only. `vercel.json` also sends old shop addresses to `shop.hisfullglory.com`.
