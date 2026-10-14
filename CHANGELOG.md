# Changelog

## Supabase advisor: `rls_auto_enable()` no longer callable over the API (branch `lock-rls-auto-enable`, 2026-10-14)
- The security advisor (lints 0028 and 0029) listed `public.rls_auto_enable()` as a SECURITY DEFINER function that guests and signed-in users can call at `/rest/v1/rpc/rls_auto_enable`. No migration creates it: it and its event trigger `ensure_rls` have been in the hosted project since before migration 001, and its body is the "Auto-enable RLS for new tables" example from Supabase's Row Level Security guide. It switches RLS on for every new table in `public`.
- A direct call does nothing but return an error ("trigger functions can only be called as triggers"), and the function can only switch RLS on. The risk was therefore small; no API caller needs it, so the grant goes.
- Add `supabase/migrations/008_rls_auto_enable_grants.sql`: revokes EXECUTE from `public`, `anon` and `authenticated`, and does nothing where the function does not exist. The function itself, its owner and the event trigger stay as they are; no other function changes.
- Add `tests/rls-auto-enable-schema.test.mjs` (PGlite, with the hosted definition): the grants are gone, a guest or signed-in call gets permission denied, nothing else changed, and the trigger still switches RLS on for new tables, also for a role without EXECUTE.
- Not yet applied to the hosted project; that waits for the founder's approval.

## Song of Songs speaker labels: pull request #11 (branch `bible-speakers`), approved by the founder, waiting for his merge (2026-10-14)
- Fix the WEB importer: it dropped heading lines but kept the speaker lines of Song of Songs (`\sp Beloved`, `Lover`, `Friends`, `Brothers`). Because such a line sits just before the next verse, its label ended up as a word at the end or in the middle of the previous verse in 27 verses ("…which is Solomon’s. Beloved", "…more than wine! Beloved They are right to love you."). `scripts/usfm.mjs` now drops `\sp` with the other heading lines. No other book uses `\sp`.
- Regenerate `public/bible/web.json` from the official archive downloaded on 2026-10-14, on top of the spacing fix below (the importer without this fix reproduces that file byte for byte). Compared verse by verse: 29 label words removed from 27 Song of Songs verses, each matching a `\sp` line inside that verse in the source; nothing else changed (same books, chapters, verse numbers and omitted verses). Four more `\sp` lines stand before a chapter's first verse and were never in the text.
- Extend `tests/bible-text.test.ts`: two real Song of Songs snippets with a speaker line, and no verse may end with or contain a speaker label.
- Not done: showing the speakers apart from the verse text (for example as a small label above the verse) is possible, since the source says where each speaker starts; it waits for the founder's decision.

## WEB text spacing: merged into `main` with pull request #13 (2026-10-14)
- Fix the WEB importer: the space after a closing USFM marker such as `\wj*` (end of Jesus' words, often next to a footnote) was removed with the marker, so 142 New Testament verses ran two words together ("his only bornSon", "The windblows", "righteousness.”Then"). The marker handling moved to `scripts/usfm.mjs`.
- Regenerate `public/bible/web.json` from the official archive. Compared verse by verse with the previous file: 148 spaces added, nothing else changed (same books, chapters, verse numbers and the five omitted verses). At all 14,628 places where markers sit between two pieces of text, the new file now follows the source's spacing.
- Add `tests/bible-text.test.ts`: real USFM snippets must convert without running words together, and no verse may contain a lowercase letter followed by a capital or closing punctuation followed by a letter.
- Found, not changed: in Song of Songs the speaker labels (`\sp` Beloved, Lover, Friends, Brothers) end up inside the text of 27 verses. `npm run test:browser` stops at the step that waits for the heading "Curated passage context", on `main` as well; the Reader no longer has that heading.

## AI explanations and shop prices: merged into `main` with pull request #2 (2026-10-12)
- Add AI explanations as a separate labelled layer, decided by the founder: static files in `public/ai/`, validated by `src/bible/ai.ts`, shown in their own card under the sourced note in the Reader's Context tab. No runtime AI. Pilot of five chapters. Rules: docs/AI_EXPLANATIONS.md.
- Keep AI files out of the installable cache and out of the SPA rewrite; an offline or invalid file shows no card.
- Update the two shop prices that changed to $49.99 on 2026-10-12.
- Tests: `tests/ai.test.ts`. The browser check was not run for this change.
- Add an AI explanation of each of the 66 books as a whole (`"scope": "book"`), shown with every chapter that has no explanation of its own, in the Reader and on the website's book and chapter pages.
- A daily cloud routine adds 30 chapter explanations and pushes them to `main`; each push rebuilds the app and the site.

## Final independent release QA — local, uncommitted (2026-10-08)
- Reproduced the prior 34-test/307-SQL/22-browser baseline; fixed periodic revalidation interrupting slow Circle loads, malformed RPC output crashing rendering, and invalid HTML v-mode input patterns.
- Added runtime Circle contracts, actual SQL serializer checks, public-member/closure/report-paging regressions, explicit console/focus checks and two successful disposable-copy mutation detections.
- Preserved all migration bytes and the dirty expansion. Read-only linked history/dry run confirms only 005/006 pending; no commit, push or deployment. Current evidence: docs/FINAL_RELEASE_QA.md.

## Circles v1 — local, uncommitted, undeployed (2026-10-08)
- Added Community Circle discovery/details, creation, public joining/private applications, scoped owner/moderator roles, discussions/replies, reports, member review/removal, immutable privacy and closure.
- Added transactional 006; retained 001–005 bytes; isolated private content from legacy readers, broad metadata, global reputation and persistent caches.
- Added SQL authorization/pagination/upgrade/rollback and controlled browser tests; documented real hosted/Auth/concurrency/device gates in CIRCLES_QA.md.

## Unreleased third-stage expansion — 2026-10-08

- Add stable 26-topic graph, private topic preferences/resources, topical hub and saved/followed links around existing Scripture/devotionals/community.
- Add local v3 migration and guest/account isolation, auth-readiness/draft boundaries, recovery from retained v2/v1 and protection from stale Terms responses/token refresh.
- Add additive migration 005 for private memberships, replies, safe sources and server votes/ranking/derived reputation; production migrations 001–004 unchanged and 005 not deployed.
- Add My Walk, two optional editorial paths, a private seven-practice challenge and explicit prayer/answer/public-testimony linkage.
- Add source hierarchy/Why we say this and disabled future provider contracts; document pending AI/billing/verification and unimplemented broader social slices.
- Fix demonstrated pre-React theme initialization; preserve existing Light/Dark/System behavior and all original regression flows. No commit/push/deployment is included.

## 2.0.0 QA follow-up — 2026-10-07

- Preserve readable private data during full-storage migration/recovery; retain recovery snapshots and isolate malformed prayer updates.
- Resume saved devotional progress on refresh/Home; show honest unknown-journey state.
- Add migration 004: stricter support payment/text guards and safe reads, separate bounded public prayer update history, null-status/answer validation.
- Repair embedded primary headings and checkbox touch targets; expand browser/storage/authorization QA and document release gates.

## 2.0.0 · 2026-10-07

Expanded the existing Daily Walk into the Jesus at the Center platform. Added Home/Bible/Pray/Community/More navigation, local v2 migration preserving v1 journals and plan progress, optional richer onboarding, resumable guided walk, complete public-domain WEB library, source-separated context/study/community, fifteen original topic journeys, typed private journal, prayer lifecycle, Light/Dark/System and privacy/settings.

Added versioned terms, private reports and blocks/mutes, safer anonymous contribution RPCs, aggregate legacy/new community feed, moderator audit and three additive SQL migrations. Preserved original chat, prayer wall, auth, plans and exact store product URLs.

Added verified GiveWell catalog and external checkout confirmation, strict manually reviewed personal GoFundMe support directory, reviewer-only notes/states and disabled future payment contracts. Added architecture, giving-source, moderation, status and decision documentation plus state/Bible/privacy/SQL/mobile/offline tests. No live deployment, native payment collection or hosted migration is included.

## 1.0.0

Original Scripture/reflection/journal daily walk, local streaks, three five-day plans, Supabase magic-link community with three chat rooms/prayer wall and HisFullGlory store links. Preserved as the migration baseline.
