# Architecture

## Application and modules

`src/main.tsx` loads `platformApp.tsx`. The shell provides Home, Bible, Pray, Community and More; More links Grow, Journal, Give, Shop, Profile and Settings. `platform/router.ts` parses stable URL paths and query tabs with native history/popstate; there is no routing dependency. Hosts must use the documented SPA fallback. Auth links return to the origin root.

`platform/store.tsx` owns local state and atomic browser writes. `platform/persistence.ts` migrates the preserved v1 key to version 2. `storage.ts` retains the original calendar/plan model and regression behavior. Original journals become typed journal entries; edits/deletion of migrated entries mirror the legacy journal map within v2 to avoid resurrection. The original v1 key is never overwritten or deleted. Unknown/corrupt v2 blocks writes and offers export/recovery. Normalized original v2 data is retained under a recovery key. Storage failures show a notice instead of silently claiming success.

Private data: localStorage, unencrypted, this browser only. Auth does not upload it. `JournalRepository` separates typed CRUD from UI; encrypted synchronization would require a new implementation, key recovery policy, RLS and explicit consent. Public sharing opens a separate composer and requires an explicit publish. Source attachments contain passage/devotional paths; private text is never placed in URLs. State holds preferences, theme, bookmarks, highlight colors, read chapters, saved devotionals, progress, walk steps and notification preferences. There are no actual scheduled notifications.

## Scripture

`bible/provider.ts` supplies an asynchronous `BibleProvider` and local search capped at 60 matches. Official WEB JSON includes books, chapters and numbered verses; the importer removes USFM formatting, footnotes, cross references and word attributes, preserving verse words. Edition-omitted verses have an explicit `omitted` marker and show an edition note instead of invented Scripture. JSON is fetched once and statically precached, not copied into React's JavaScript bundle.

Provenance: official updated WEB Protestant USFM, retrieved 2026-10-07, 66 books, 1,189 chapters, 31,103 numbered records, 5,267,952 bytes. SHA-256: `40127592c69579c58c9af5951140a18e39fb6da4ad01b2e58be318aa65b3ca45`. Reproduce with `node scripts/import-web.mjs EXTRACTED_OFFICIAL_ARCHIVE_DIRECTORY`. Do not substitute a scraped or licensed source. Text licensing is public domain; observe the WEB name/trademark restrictions if changing translation words.

Reader exposes Read, Context, Study and Community. Curated textual observations exist for Psalms 23/121 and Romans 8; other chapters show an honest unavailable-context state. Study supplies labeled editorial questions, not fabricated scholarship. No historical commentary, Greek/Hebrew dataset or denomination-specific commentary is supplied. Source headings/verses are linked. Community experiences do not establish passage meaning.

## Server authorization

Browser uses the public Supabase key and caller session. RLS guards original tables and owner-only terms, drafts, reports and block lists. New public feeds use explicitly constrained SECURITY DEFINER RPCs with empty search paths; raw new post tables are not readable by application roles. Public return types omit anonymous authors' auth UUIDs, private notes, reporter identity and reactor lists. Author snapshots come from the private profile, never the request. Server time, author, moderation, review state and counters are not client-writeable.

Terms are versioned and timestamped by the server, enforced for new contributions, original chat/prayer inserts and support submission. New posts serialize per author with a durable 30-second cooldown; legacy chat retains its original 3-second SQL guard. Reactions have uniqueness constraints. Aggregate feed uses a `(created_at,id)` cursor and 20 rows; original chat retains 50-row pagination and Realtime, original wall retains latest/most-prayed 50. New feed refreshes on actions and re-entry; it does not claim Realtime. Block management exposes opaque block-record IDs; raw block rows and the author-UUID predicate are not callable/readable by app roles. Blocks and mutes filter all public server readers, including anonymous authors resolved privately by content ID. Staff can identify authors for moderation.

## Giving boundary

The CharityCatalogProvider returns isolated curated records; ExternalFundraisingProvider validates hosted fundraiser destinations. External catalog links are verified exact destinations. Support requests are private drafts and under_review until an operator uses a privileged review function. Public RPC includes only approved/fundraising, visible, undeleted, unexpired rows. Content edits after approval are unavailable to authors: close and submit a new reviewed request rather than silently changing approved claims. Duplicate active URLs, malformed domains, direct payment instructions and client moderation bypass are rejected. Displayed targets are declared/unverified; actual progress is viewed at the provider.

`giving/contracts.ts` defines recipient verification, checkout, contribution, webhook, payout, refund and dispute models. Stripe/Mollie adapters always reject and make no API requests. A future server must validate credentials, webhook signatures, recipient/KYC state, legal approval and explicit production flag together. It must derive amounts/currency on the server, deduplicate provider event IDs and idempotency keys, reconcile provider balances and payment states, handle out-of-order events, refunds/disputes and recipient restrictions. Client flags cannot enable this integration. No production native payment database or simulated success flow is included.

## Themes, capabilities, PWA and native

Semantic Light/Dark/System tokens cover surfaces, text, buttons, focus, borders, shadows and highlights. System theme subscribes to media changes; theme choice persists locally. Navigation observes safe areas and 44px targets. Static fonts are self-hosted; reduced motion from the original stylesheet remains. Native dialog handles focus/Escape for external checkout confirmation.

`Capabilities` centralizes enabled and unavailable services. Build-time public configuration permits community access, subject to schema and auth setup; it does not prove hosted readiness. WEB/external charity links are available independently. Licensed translations, production payments, native push, Google/Apple auth are disabled.

Native integration boundary: replace browser persistence, external URL/share, deep-link and notification adapters with platform implementations without changing feature domains. A future Capacitor wrapper must use an external system browser for giving, handle universal/app links and safe areas, test secure local storage and authentication return links, and support account-deletion requirements. Wrapper/deep-link device setup is not implemented or tested. PWA precache contains only static application/Bible assets; there is no dynamic response cache. Never place private records or auth responses in a shared cache.

Future notifications require owner-only subscription/token storage and preference enforcement, explicit OS permission only after configuration, timezone-aware scheduling, server-held APNs/FCM/Web Push credentials, logout/unsubscribe cleanup and deep-link validation. Push payloads must avoid private prayer/journal/support text. Delivery, token registration and scheduling are not implemented.
