# HisFullGlory Daily Walk: working notes for Claude

Read `AGENTS.md` first: its product, privacy, Scripture and migration rules still apply.
This file adds the current state and how to work with the founder. Last updated 2026-10-20.

## Working with the founder

- Write to the founder in Dutch, plainly, step by step. They are not technical.
- Public product copy, code and docs stay in English.
- Ask before: merging to `main`, deploying, any hosted Supabase write, any Shopify or DNS
  change, or anything that costs money. An approval covers that one action only.
- Never call something live, tested or secure without evidence (tests, SQL, deployment).

## Direction (decided)

- The app and its community are the core. The website attracts and teaches. The Shopify
  shop is a supporting "Resources" section, never placed next to prayers or sensitive topics.
- One English-language community. US online growth; the founder's Dutch network is the
  closed beta group. Dutch comes later, with a licensed Dutch Bible.
- Study first, community second: Scripture with real context is the entry point.
- Launch topics (`launchTopics` in `src/topics/graph.ts`): Returning to God, Growing
  closer to God, Anxiety, Prayer, Purpose, Relationships, Grief, New Christian. The other
  topics stay resolvable but are not listed.
- Community annotations on passages are wanted, always labelled apart from Scripture and
  from sourced context. The founder's picture (2026-10-13): annotations in the manner of
  Genius, with up and down votes, and a way for a reader to dispute a context note by
  bringing a source, after which the note can be changed. He wants two separate sections
  per verse: one for added context and other ways people read the verse, with votes, and
  one for what the verse means to people personally, with their stories and memories.
  Not designed or built yet; whether votes should also apply to the editorial verse
  context is still open.
- AI explanations are allowed since 2026-10-12, as a separate labelled layer written ahead
  of time (no runtime AI). Every book has one; a daily cloud routine adds 30 chapter
  explanations to `main`, so pull before you work. Each of its pushes redeploys the app
  and the site; the founder approved that on 2026-10-12. Rules, format and status:
  `docs/AI_EXPLANATIONS.md`.
- The storytelling voice of the context checks is the voice for every explanation, as the
  founder decided on 2026-10-13. The same routine retells the earlier explanations in it,
  eight a day, the 66 books first (`docs/AI_EXPLANATIONS.md`, "Voice").
- Since 2026-10-13 an AI model may also draft context that names sources (context checks,
  study notes), on three conditions the founder set or accepted: the page says an AI model
  helped write it, every source was actually opened and is linked, and nothing goes online
  before the founder approves it. This replaces the earlier rule that sourced notes are
  never written by AI. The third condition no longer holds for context checks (next bullet);
  it still holds for study notes, topic pages and articles.
- Since 2026-10-16 a daily cloud routine writes one new context check and publishes it to
  `main` without the founder's review. His words: "a and b and i don't have to review them".
  It applies to context checks only. Safeguards, each enforced by code: a script
  finds the exact words of every quoted person on the linked source page; every source
  must open (HTTP 200, a text page), and at least two are required; the page says "Written
  by an AI model from the sources below. Not checked by a person." (review
  `ai-unreviewed`, no approved date); Bible quotations must match the WEB text and no other
  quotation marks are allowed; the verse comes from a committed queue, one check a day.
  Today in the app and the site home show the newest published context check,
  AI-unreviewed ones included, always with the label "Written by an AI model. Not checked by
  a person." (founder, 2026-10-19). The routine does not exist yet: it is created after the
  founder's merge and an environment with network access.
  Rules, limits and the routine prompt: `docs/CONTEXT_CHECKS_ROUTINE.md`.
- Context checks are the first selling point the founder chose (2026-10-13): a well-known
  verse with the story around it, for the site and for daily short videos that open with
  "You know this verse. But did you know...". What a video says must be on the site first.
  The founder wants history, anecdotes and striking facts, not only the surrounding text,
  told with feeling so that it moves believers and non-believers alike, and always with
  respect for the faith. He leaves checking the facts to Claude: a moving claim that the
  sources do not carry is rewritten until it is true. A story therefore says what it
  rests on: the Bible itself, outside sources, or one reading that scholars dispute
  (`site/README.md`). The founder approved the first eleven on 2026-10-13, after three
  rounds of feedback; they are on the site under `/context-checks`.

## Live state (verified 2026-10-12, evening)

- Supabase project `fccwqguqhnbayuowmamy`: migrations 001 to 006 applied; their stored SQL
  matches `supabase/migrations/` in this repo. RLS is on for every public table.
- The project also has a function `public.rls_auto_enable()` and an event trigger
  `ensure_rls` that no migration creates (checked 2026-10-14): they predate migration 001
  and are Supabase's "Auto-enable RLS for new tables" example, which switches RLS on for
  every new table in `public`. Keep them. Migration 009 (applied 2026-10-14) takes away
  the API's EXECUTE grant on the function, nothing else; see the comment in that file.
- `app.hisfullglory.com` production is a Vercel build of `main`. The app's code is that of
  ee01209, the merge of pull request #2 (study library, launch topics, AI explanations, shop prices and the
  `site/` folder). Vercel built and assigned it by itself when the founder merged.
  Checked on the live address afterwards, as a guest: the Reader's Context tab for John 3
  shows the sourced note and the AI card as two separate blocks, `/ai/john.json` and
  `/ai/mark.json` are served, the community lists the eight launch topics, and
  `read_topic_discussions` returns 200.
- Later production builds come from the daily routines' pushes to `main`. Nobody looks at
  those before they go live, so the AI-explanations routine may only change files under
  `public/ai/`, and the context-check routine (once it exists) only adds one new file under
  `site/content/context-checks/`.
- From 2026-10-08 until that promotion the live app could not reach Supabase:
  `VITE_SUPABASE_URL` in Vercel ended in `/rest/v1/`, so every call went to
  `/rest/v1/rest/v1/...` and returned 404. The value is now the bare project URL, set for
  Production and Preview. Checked after the fix, as a guest: `read_topic_discussions`,
  `read_circles` and `chat_rooms` return 200.
- Not yet tested on production: sign-in, posting, voting, and the two-account test for
  private Circle isolation.
- Preview builds use the same Supabase project as production. Anything posted from a
  preview is real data.

## Vercel notes (2026-10-12)

- `VITE_*` values are baked in at build time. After changing one, redeploy.
- Pushes did not always start a build, and some builds failed at once with `git_info_fail`
  (Vercel could not read the commit from GitHub). Starting the deployment by hand worked,
  once on the second try. The cause was on Vercel's side: its status page reported a
  partial outage of builds and Git integrations from 13:35 UTC that day. The project
  settings were fine. If this happens again, check https://www.vercel-status.com before
  changing any connection, and check that a push really produced a deployment.
- After an instant rollback, new production builds are not assigned to the domain until one
  is promoted. The promotion on 2026-10-12 ended that: the next build of `main` was
  assigned automatically.
- Plan and build limits (written 2026-10-16, from the founder's decision of 2026-10-15):
  - Both Vercel projects stay on the free Hobby plan until the store launch, around
    mid-November 2026. Then the founder upgrades the team of both projects to Pro, $20 a
    month for one seat, himself; Claude gives him the exact clicks at that moment and does
    not change a plan or spend money. He accepts the fair-use risk until then: Hobby is for
    personal, non-commercial use, and the site links to the shop.
  - Hobby allows 100 deployments a day, and one push to a branch that deploys builds both
    projects (2 deployments). So `vercel.json` and `site/vercel.json` carry the same
    `git.deploymentEnabled` rules: branches named `docs-*`, `planning-*`, `scratch-*`,
    `wip-*`, `ci` or `ci-*` get no Vercel deployment. Every other branch gets a preview.
    Name a branch that needs no preview with one of those prefixes. `tests/vercel-config.test.ts`
    keeps the two files equal and fails if a rule could match `main`.
  - Every merge or push to `main` still builds both projects, whatever it changes, and the
    daily routine's pushes cannot be made free. Batch pushes and merges. A branch cut
    before these rules reached `main` keeps deploying until it merges `main`.
  - A red Vercel status "Deployment rate limited" on a branch means the daily quota was
    used up, not that the code is broken. The GitHub checks are separate and still run.
  - An Ignored Build Step does not save quota: cancelled builds count as deployments.

## Branches

- `main`: what both Vercel projects build for production. The daily routine pushes here.
- `circles-v1`: merged into `main` on 2026-10-12 (pull request #1); kept for reference.
- `study-first` and `website`: merged into `main` on 2026-10-12 (pull request #2); kept
  for reference. Start new work on a fresh branch from `main`.
- `site-seo`, `site-topics` and `site-domain-move`: merged on 2026-10-13 (pull requests #3
  and #5; #5 carried the commits of #4). `docs-live`, `context-checks` and
  `context-stories` followed the same day. The app's code has not changed since pull
  request #2.
- `bible-spacing` (2026-10-14): fixes words that ran together in `public/bible/web.json`
  (142 New Testament verses, spaces only; see `CHANGELOG.md`). Merged the same day
  (pull request #13).
- `bible-speakers` (2026-10-14, pull request #11): removes the Song of Songs speaker labels
  ("Beloved", "Lover") that ended up inside 27 verses of `public/bible/web.json`. Merged
  the same day.
- `bible-speaker-labels` (2026-10-14): shows those labels apart from the text, above or
  inside the verse, in the Reader and on the site, as the founder decided. Waits for his
  merge.
- `context-check-routine` (2026-10-16): labelled AI-unreviewed context checks on the site,
  the `scripts/context-checks.mjs` command with its online source and quote checks, and the
  routine prompt. Waits for the founder's merge.

## Checks on GitHub (since 2026-10-14)

- `.github/workflows/checks.yml` runs on every pull request to `main` and every push to
  `main`, on GitHub's free hosted runners, with no secrets. Job **App**: `npm ci`,
  `npm test`, `npm run security`, `npm run build`, then `npm run test:browser` against
  `npm run preview` with Playwright's Chromium. Job **Site**: `npm ci`, `npm run build` and
  `npm test` in `site/`, with only the site's own packages installed, as on Vercel.
- The checks only report. Vercel deploys `main` whatever they say, and the daily routine's
  pushes are not held up. Do not make the checks required for `main` (branch rule or
  ruleset): the routine pushes straight to `main` and would then be refused.
- A routine push that fails a check is live already. The commit gets a red cross on `main`
  and in the Actions tab. Fix it, or revert it, through a pull request; the routine's next
  push gets a run of its own.
- GitHub shows full logs only to signed-in users. A failed step therefore puts its first
  error and last lines in an annotation (`scripts/ci-failure-note.mjs`), shown on the pull
  request and readable without signing in through
  `https://api.github.com/repos/3glennglenn/hisfullglory-daily-walk/check-runs/<job id>/annotations`
  (anonymous API calls are limited to 60 an hour).

## Study notes

See `docs/STUDY_NOTES.md`. Notes live in `public/study/<book>.json`, are validated by
`parseStudyFile`, and every quote must match a `basis` verse (enforced in
`tests/study.test.ts`). Drafts stay `"review": "editorial draft"` until the founder's
theological reader approves. Done: book notes for Matthew, Mark, Luke, John, Psalms,
Romans (pilot, awaiting founder feedback). Next: the other 60 books, then chapter notes for
chapters used by the launch topics.

## Planned next app changes (in order)

1. Remaining book notes after pilot feedback.
2. Community annotations on passages, built on existing Scripture-linked posts
   (`source_path`), not a new social system.
3. Home and onboarding "study first": open a passage, read context, write a reflection.
4. Rename the Shop entry to Resources, matched to study goals.

## Website: live on `hisfullglory.com` since 2026-10-13; plan in `docs/WEBSITE_PLAN.md`

A separate site (Bible, topic and article pages, pre-rendered for search) that reads the
same study files and topic graph as the app. It lives in `site/`; `site/README.md` says how
to run it and what is built. The shop moved to `shop.hisfullglory.com` the same night.

Verified on 2026-10-13 after the move: `hisfullglory.com` serves the site from Vercel with
no noindex header; a wrong address gives the not-found page; the sitemap lists 1,273
addresses; old shop addresses (products, collections, cart, policies, pages) get a 308 to
the same path on the shop; the shop's home page, two product pages, cart, policies and
contact page answer on the new address; the app is unaffected.

Not done or not checked:
- `www.hisfullglory.com` still points at Shopify and ends up in the shop. It should
  redirect to the site: Vercel already has the redirect, the DNS record has not changed.
- Checkout with a real order, the Meta Pixel and the product catalog on the new shop
  address.
- The app builds product links from `storeUrl` in `src/config.ts`, still the old address.
  They work through the redirect; point them at the shop directly when the app is next
  changed.
- The Shopify DNS records have a 24-hour lifetime, so until 2026-10-14 some visitors may
  still be sent to the shop by a remembered address.

How it is set up: the Vercel project `hisfullglory-site` (root directory `site`, Astro,
source files outside the root directory included) has `hisfullglory.com` as its production
domain and follows `main`; https://hisfullglory-site.vercel.app stays as a review address
with a noindex header. The domain is managed in Shopify (Settings, Domains): its A record
points at Vercel, the AAAA record is removed, and `shop`, `www` and `account` point at
Shopify. Claude cannot change domain, DNS or certificate settings; the founder makes those
changes himself, one approved step at a time.

## Environment notes

- The cloud workspace may not reach the npm registry. If `npm ci` fails, the founder's
  laptop folder has `node_modules`; Vercel preview builds (every branch push) verify
  `npm run build`.
- Vercel CLI deploys upload the whole folder; add a `.vercelignore` before the next one.
- An Astro build of `site/` made inside the Claude desktop app's own session workspace
  comes out without stylesheets, because that folder's real path differs from its visible
  path. Build and preview from a normal folder. `site/tests/pages.test.ts` fails when
  pages have no styles.
- The founder's laptop has Git and Node 24 (since 2026-10-12). The older project folder
  there dates from the Codex work and is not a current checkout; clone from GitHub.
