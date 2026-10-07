# Implementation status

## Implemented in code

- Five primary routes and More: Home, Bible, Pray, Community, Grow, Journal, Give, Shop, Profile, Settings; refreshable Bible/chapter/verse links and history.
- Optional five-stage onboarding: eight goals (maximum three), five faith-journey choices, 5/10/20 minute and time preferences, personalized rhythm summary. Existing onboarded state preserved.
- Seven-step daily walk, date-based resume, journal saving, prayer and idempotent completion/streaks.
- Complete legally imported WEB reader, local text search, bookmarks/save, highlight colors, copy/share links, chapter read history, attached private journal/study notes, sourced limited context, editorial study and passage community.
- Fifteen topical five-day devotional journeys, filter/continue/save/completion and original three plans retained.
- Typed private journal CRUD/search/filter/attachments and explicit public-sharing composer. Private prayer CRUD/updates, Active/Waiting/Answered/Archived, answer journal entry and explicit keep-private/share-testimony choice.
- Supabase new contributions, server author snapshots, three reactions, source filters, 20-row pagination and aggregate original chat/wall timeline. Original chat rooms, 50-row pagination, Realtime, original wall and counts preserved. Public prayer status/updates implemented on new prayer contributions; original wall remains its compatible request/testimony format.
- Current server-enforced terms, private structured reports, block/mute/unblock, own deletion, moderation visibility, private audits and manual operator workflow.
- Five evaluated causes with checked official external checkout, category/details/source/date, outbound domain confirmation and giving policy.
- Authenticated personal support drafts/submission, manual review states, strict external GoFundMe allowlist, duplicate/cooldown/expiry checks, owner closure/deletion, private reviewer notes, anonymous snapshots, safe public directory and reports/blocks. No seeded fabricated personal campaigns.
- Profile, email-link auth boundary, local privacy/export/recovery, six notification preferences, capability flags, Light/Dark/System, installable PWA and static offline WEB.
- Disabled Stripe/Mollie interfaces and typed payment lifecycle contracts; architecture/release gates documented.

## Code tested locally; external configuration still required

Supabase auth, terms, feeds, reports and support are covered by local real PostgreSQL privilege tests. A hosted project was not migrated, and live SMTP/magic-link/Realtime/two-user end-to-end behavior has not been verified in this task. Public client configuration and the numbered migrations are required. Manual moderation and account-deletion/support operations need an assigned operator before release. Personal campaigns must be verified individually before publication.

Official WEB licensing/download, GiveWell program/checkouts and GoFundMe process references were checked on 2026-10-07. No real donation, transfer or account verification was attempted. Provider links can change and need rechecking before release. Original shop information was verified 2026-10-05; current prices/stock are authoritative at the store.

## Intentionally unavailable / architecture only

Licensed translations, historical/linguistic scholarship beyond curated notes, Greek/Hebrew data, encrypted cross-device journal sync, cloud backup restore, native push/reminders, Google/Apple OAuth, native payment collection/connected recipient integrations/webhooks/reconciliation/refunds/receipts, native wrapper builds and App Store approval. There is no fake enabled control or simulated production payment success. Staff tooling is manual SQL/Table Editor; no custom admin dashboard. The new feed is action/re-entry refreshed, not Realtime; original chat/wall preserve reconciliation and Realtime.

## Validation record

Node 24.19.0. `npm install` completed; dependency audit reported zero vulnerabilities. `npm test` covers existing regressions, local migrations, routes, themes, lifecycle, analytics, complete WEB text coverage, URL checks and two PostgreSQL authorization suites. `npm run build` runs strict TypeScript and produces the PWA; WEB is in the static precache. `npm run security` scans implementation/docs/tests for likely embedded credentials and checks public-key/cache/lockfile guards. `node scripts/browser-check.mjs` tests actual built DOM/mobile/offline behavior without screenshots; use a installed Chromium or `BROWSER_CHANNEL=msedge`. Validation passed: 17 Node test entries, including 27 baseline and 50 platform PostgreSQL authorization checks; 10 headless Edge browser flows at 375px, including offline Bible/journal reload; zero uncaught browser errors and no screenshots. Strict TypeScript, Vite/PWA build and the 54-file security scan passed. Do not infer live/native verification from these local checks.

Known practical limits: localStorage quota varies by browser; export before clearing data. Complete WEB adds ~5.27 MB to first download. Search returns first 60 matches; public support listing is capped at 50; new community cursor is 20. Manual review means a request may wait and is never automatically approved. Private backups are unencrypted. No deployment, DNS, Shopify mutation or new push has been performed by this implementation.
