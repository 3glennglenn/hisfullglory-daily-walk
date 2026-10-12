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
only when their page exists, the copy has no em dashes, and each resource links to its
product in the shop.

## Conventions

- `src/config.ts` holds the site name, the app and shop addresses and the navigation.
  A navigation item gets `ready: true` in the same change that adds its page, so the site
  never links to a page that does not exist.
- `/styleguide` is an internal reference page: not in the navigation, not indexed.
- Light and Dark follow the visitor's device setting. A manual switch can set
  `data-theme="light"` or `"dark"` on `<html>`; the tokens already support it.
- Copy rules: `docs/WEBSITE_PLAN.md`, section 5.

## Status

Done from the build order in `docs/WEBSITE_PLAN.md`, section 9:

1. Scaffold, shared tokens, layout, header and footer.
2. Bible pages: `/bible`, `/bible/<book>` and `/bible/<book>/<chapter>`, with the build test.
3. Home, About, Beta and Resources. The About story is the founder's, approved 2026-10-12.
   The launch topics on Home open in the app until the topic pages of step 4 exist.

Addresses have no trailing slash (`/bible/psalms/23`); each page is built as
`<address>/index.html` and `vercel.json` is ready for that.
Deployed for review only, at https://hisfullglory-site.vercel.app (Vercel project
`hisfullglory-site`, created 2026-10-12, connected to this repository with production
branch `website`: a push to `website` redeploys it). `vercel.json` sends a noindex header on
that address. No domain, DNS or Shopify change has been made for the site.
