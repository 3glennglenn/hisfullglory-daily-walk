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

## Live state (verified 2026-10-12)

- Supabase project `fccwqguqhnbayuowmamy`: migrations 001 to 006 applied; their stored SQL
  matches `supabase/migrations/` in this repo. RLS is on for every public table.
- `app.hisfullglory.com` production is a Vercel CLI deploy from 2026-10-08 whose source
  matches branch `circles-v1` (Circles, topics, votes live). It is not tied to a git commit.
- `main` (76beca5) is behind production. Merging `circles-v1` into `main` is pending founder
  approval.
- Still open: a real two-account test on production (private Circle isolation).

## Branches

- `circles-v1`: snapshot of the Codex work now running in production.
- `study-first`: current work. Adds the study library and the launch topics.

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

## New website (planned, not started)

A separate site for `hisfullglory.com` (Bible, topic and article pages, pre-rendered for
search) reading the same Supabase data and study files; Shopify moves to
`shop.hisfullglory.com` for checkout only. Check the Meta Pixel keeps working when the
domain moves.

## Environment notes

- The cloud workspace may not reach the npm registry. If `npm ci` fails, the founder's
  laptop folder has `node_modules`; Vercel preview builds (every branch push) verify
  `npm run build`.
- Vercel CLI deploys upload the whole folder; add a `.vercelignore` before the next one.
