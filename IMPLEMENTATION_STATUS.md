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

Release decision: **READY FOR MANUAL TESTING**. Clean baseline `b5671f6`; lockfile clean install audited 364 packages with zero reported vulnerabilities. Final local verification: 22 Node test entries; 88 SQL assertions (27 original + 61 platform); 14 headless Edge browser flows, including four viewport widths in both themes, offline reload, migrated v1 data, full/unavailable/corrupt storage and Scripture retry. Strict TypeScript, production Vite/PWA build and security scan passed; zero uncaught main-page errors and no screenshots. No lint script is configured. See [QA report](docs/QA_REPORT.md) for reproduced repairs, exact commands, scope and remaining hosted/device gates. Fresh schema plus migrations 001–004 and upgrades through 004 are required; hosted migrations remain unexecuted.

Known practical limits: localStorage quota varies by browser; export before clearing data. Complete WEB adds ~5.27 MB to first download. Search returns first 60 matches; public support listing is capped at 50; new community cursor is 20. Manual review means a request may wait and is never automatically approved. Private backups are unencrypted. No deployment, DNS, Shopify mutation or new push has been performed by this implementation.
