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

- the five colour token blocks (constants, Cover Light, Cover Lamplight, Marked Light, Marked
  Lamplight) from `src/styles.css`
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

`tests/content.test.ts` checks the topic pages, articles and context checks on file: a
misquoted verse, a passage reason without a quotation or a wrong reference is rejected,
drafts are never built, an AI-unreviewed context check is built with its label (top of the
page, cards and closing note) and kept off the home page, and a built page shows its text
as written and says how it was made.

`tests/context-routine.test.ts` at the repository root checks the context-check command
(`scripts/context-checks.mjs`) offline: matching of quoted words, the source checks with an
injected fetch and a local stub server, the routine rules, the queue and the command line.

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
and, for the first three, a place on the home page. The app builds the same approved files
in (`src/context`): one check a day on its Home page, told one part per screen at
`/context`, with a picture to share. A change to a check therefore reaches the app too. The eleven checks of 2026-10-13 were
written by an AI model and approved by the founder that day. No theological reader has
read them.

Since 2026-10-16 a daily routine also writes context checks and publishes them without
anyone reading them first (the founder's decision: "a and b and i don't have to review them";
context checks only). Such a file says `"review": "ai-unreviewed"`, names the
`model`, has no `approved` date and needs at least two `sources`. Its page says "Context written by AI, from the sources below. The Bible text is the World English Bible." at the top and a note at the bottom ("This context was written by an AI model to help you see the verse in its setting. The Bible text is the World English Bible. Before publishing, an automatic check made sure every source below opens and every quotation matches its source. It can contain mistakes. If a source says otherwise, tell us."), and its cards say "Context written by AI, from named sources." The home
page and Today in the app show the newest published check, AI-unreviewed ones included,
always with that label (founder, 2026-10-19). The build rejects any quotation mark in such a
file other than the curly double quotes around WEB text, so the words of people can only
stand in `voices`; `scripts/context-checks.mjs add` then refuses to write the file unless
every source opens and every voice's words stand on its source page. The command, the
limits of these checks and the routine prompt are in `docs/CONTEXT_CHECKS_ROUTINE.md`.

Each check also tells `story`, the story around the verse, and says in `storyStatus` what
that story rests on: `scripture` (the Bible itself), `history` (background from outside
the Bible) or `reading` (one reading that scholars dispute). For the last two, `sources`
must list what was used, and the page shows those links. Rules for a story:

- Tell it as a story, with feeling: a scene, people, what was at stake. The feeling has
  to come from what the sources say. No invented detail, and no claim made larger than
  its source. The founder asked for this style on 2026-10-13.
- Write with respect, for the faith and for readers. `readings` says what a verse means
  to the people who quote it; it never makes a common use look foolish.
- `voices` holds what named people said, word for word, each with the page where it can
  be read. The page adds the quotation marks, because curly double quotes in the files
  are reserved for the WEB text.
- `argued` (optional, shown as "Who has argued over it" after the readings) tells how
  people took the verse up and disagreed about it: scholars, writers, public figures,
  believers and others, side by side and without a winner. The founder asked for this on
  2026-10-14. A marker such as `[[tolstoy]]` stands for the words of the voice with that
  `id`; the page sets them in quotation marks. Such a voice is quoted exactly once, is not
  repeated as a card, and its source must also be in `sources`. A famous person appears
  only when a source shows they said something about this passage. Matthew 5:39 is the
  model.
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
  Only the founder approves; a new file starts as `"draft"`. The one exception is a context
  check with `"review": "ai-unreviewed"` (see above), which the build labels as context
  written by AI. `/topics` and `/articles`, their navigation items and the
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
- Two themes (Cover and story, the default; Marked page) with Light and Lamplight modes. The
  modes follow the visitor's device unless they pick one with the switch in the footer
  (Theme: Cover and story, Marked page; Lamplight: Automatic, On, Off). The choices are kept
  in the browser as `hfg-look` and `hfg-lamplight` (the older `hfg-theme` is read once and
  removed) and applied in the page head, before the page is drawn. Without JavaScript the
  switch stays hidden and the page follows the device.
- The home opens on the newest published context check (`featuredChecks()` in
  `src/lib/content.ts`, AI-unreviewed ones included and labelled), with a bookcase of the six
  newest from 1024px. The label words come from `src/lib/editorial.ts`, which the app imports
  too, so the two cannot disagree. `site.sponsor` is `null`: the sponsor slot renders nothing.
- The Shop page (`/resources`) and the home page's Study Bibles band show each product's first
  picture straight from Shopify's image address (`cdn.shopify.com`), so a visitor's browser
  contacts Shopify on those two pages only.
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

Added after that plan: context checks, eleven of them, approved by the founder on
2026-10-13.

Addresses have no trailing slash (`/bible/psalms/23`); each page is built as
`<address>/index.html` and `vercel.json` is ready for that.
Live on https://hisfullglory.com since 2026-10-13 (Vercel project `hisfullglory-site`,
connected to this repository; a push to `main` redeploys it). The review address
https://hisfullglory-site.vercel.app stays, and `vercel.json` sends a noindex header there
only. `vercel.json` also sends old shop addresses to `shop.hisfullglory.com`.
