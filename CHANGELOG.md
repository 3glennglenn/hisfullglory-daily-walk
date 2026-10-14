# Changelog

## Song of Songs speaker labels: branch `bible-speakers`, waiting for the founder's approval (2026-10-14)
- Fix the WEB importer: it dropped heading lines but kept the speaker lines of Song of Songs (`\sp Beloved`, `Lover`, `Friends`, `Brothers`). Because such a line sits just before the next verse, its label ended up as a word at the end or in the middle of the previous verse in 27 verses ("…which is Solomon’s. Beloved", "…more than wine! Beloved They are right to love you."). `\sp` is now dropped with the other heading lines. No other book uses `\sp`.
- Regenerate `public/bible/web.json` from the official archive downloaded on 2026-10-14 (the unchanged importer reproduces the previous file byte for byte from it). Compared verse by verse with the previous file: 29 label words removed from 27 Song of Songs verses, each matching a `\sp` line inside that verse in the source; nothing else changed (same books, chapters, verse numbers and omitted verses). Four more `\sp` lines stand before a chapter's first verse and were never in the text.
- Add `tests/bible-speakers.test.ts`: no verse may end with or contain a speaker label, and the affected verses keep the rest of their text.
- Not done: showing the speakers apart from the verse text (for example as a small label above the verse) is possible, since the source says where each speaker starts; it waits for the founder's decision. This branch and `bible-spacing` both regenerate `web.json`; whichever is merged second has to be rebased and regenerated.

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
