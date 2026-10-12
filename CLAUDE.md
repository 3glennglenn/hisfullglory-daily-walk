# HisFullGlory Daily Walk: working notes for Claude

Read `AGENTS.md` first: its product, privacy, Scripture and migration rules still apply.
This file adds the current state and how to work with the founder. Last updated 2026-10-12.

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
  from sourced context.
- AI explanations are allowed since 2026-10-12, as a separate labelled layer written ahead
  of time (no runtime AI). Sourced notes are never written by AI. Every book has one; a
  daily cloud routine adds 30 chapter explanations to `main`, so pull before you work.
  Each of its pushes redeploys the app and the site; the founder approved that on
  2026-10-12. Rules, format and status: `docs/AI_EXPLANATIONS.md`.

## Live state (verified 2026-10-12, evening)

- Supabase project `fccwqguqhnbayuowmamy`: migrations 001 to 006 applied; their stored SQL
  matches `supabase/migrations/` in this repo. RLS is on for every public table.
- `app.hisfullglory.com` production is a Vercel build of `main` at ee01209, the merge of
  pull request #2 (study library, launch topics, AI explanations, shop prices and the
  `site/` folder). Vercel built and assigned it by itself when the founder merged.
  Checked on the live address afterwards, as a guest: the Reader's Context tab for John 3
  shows the sourced note and the AI card as two separate blocks, `/ai/john.json` and
  `/ai/mark.json` are served, the community lists the eight launch topics, and
  `read_topic_discussions` returns 200.
- Later production builds come from the daily routine's pushes to `main`. Nobody looks at
  those before they go live, so the routine may only change files under `public/ai/`.
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

## Branches

- `main`: what both Vercel projects build for production. The daily routine pushes here.
- `circles-v1`: merged into `main` on 2026-10-12 (pull request #1); kept for reference.
- `study-first` and `website`: merged into `main` on 2026-10-12 (pull request #2); kept
  for reference. Start new work on a fresh branch from `main`.

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

## New website (in progress): full plan in `docs/WEBSITE_PLAN.md`

A separate site for `hisfullglory.com` (Bible, topic and article pages, pre-rendered for
search) reading the same study files and topic graph as the app; Shopify moves to
`shop.hisfullglory.com` for checkout only. Check the Meta Pixel keeps working when the
domain moves. The site lives in `site/`; `site/README.md` says how to run it and which
build steps are done.

Since 2026-10-12 the site has its own Vercel project, `hisfullglory-site` (root directory
`site`, framework Astro, source files outside the root directory included), reachable for
review at https://hisfullglory-site.vercel.app. That address sends a noindex header. The
founder connected the project to this repository on 2026-10-12. Its production branch has
to be `main` (it was `website` until pull request #2). If the review site stops following
`main`, check that setting first: Settings, Environments, Production, Branch Tracking.
Every domain, DNS or Shopify step still needs the founder's approval first.

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
