# HisFullGlory · Jesus at the Center

A mobile-first React/TypeScript/Vite faith platform with an installable PWA, complete public-domain WEB reader, daily guided walk, local private journal and prayer lifecycle, 15 five-day devotional topics, optional Supabase community, external giving and the original HisFullGlory shop links.

## Run and verify

Node 22.12+; Node 24 used for validation.

```sh
npm install
npm run dev
npm test
npm run security
npm run build
npm run preview
# In a second terminal, with Chromium installed (`npx playwright install chromium`):
npm run test:browser
```

For an existing Edge installation, set `BROWSER_CHANNEL=msedge` before the browser script (PowerShell: `$env:BROWSER_CHANNEL="msedge"`). The script captures no screenshots and makes no donations.

`npm test` runs pure state/privacy/Bible tests and real PostgreSQL authorization checks using PGlite; no hosted database is contacted. Build includes strict TypeScript and the production service worker. `dist/` is generated, ignored output.

Guest mode needs no credentials. Missing Supabase produces explicit unavailable publishing/support states. Local writing, WEB, Grow, bookmarks and external causes work without auth. Browser storage is local and unencrypted: export Settings → private backup before clearing data. On first run the v1 key is preserved and migrated forward to v2. Already-onboarded users are not forced through onboarding again.

## Connected community setup

Apply these files in this exact order in Supabase SQL Editor as the project owner:

1. `supabase/schema.sql` — existing profiles, three chat rooms, chat, original prayer wall and reactions.
2. `supabase/migrations/001_platform.sql` — current terms, passage/devotional contributions, reactions, private reports, blocks/mutes, moderation audit and legacy posting terms guard.
3. `supabase/migrations/002_support.sql` — private support drafts, manual review, public safe directory and reviewer notes.
4. `supabase/migrations/003_aggregate_feed.sql` — paginated community timeline across new posts, existing chat and original prayer posts.

All are rerunnable. Apply the bootstrap before numbered migrations; do not rerun only the bootstrap afterward because it replaces legacy policies/functions. Hosted migrations were **not executed** by this implementation.

Enable email magic links, configure production SMTP, Site URL and exact redirect allowlist. Local development uses `http://localhost:5173/`; set the actual production origin when approved. Copy `.env.example` to `.env.local` and provide only:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY
```

These settings are public build inputs. Never put secret/service-role/payment keys in a Vite variable. Rebuild after changing settings. Sign in, set a display name and explicitly accept the current rules in Profile before posting. Google/Apple auth, push, encrypted sync and native payments are unavailable.

Before public release, verify real email delivery, guest/two-account rights, expired sessions, Realtime reconnect, reporting and moderation on the configured project. Local PostgreSQL tests do not certify hosted configuration. See [moderation operations](docs/MODERATION.md).

## Data, licensing and payments

The full WEB library is imported from the official [eBible bulk USFM archive](https://ebible.org/Scriptures/engwebp_usfm.zip), with [public-domain terms](https://ebible.org/engwebp/copyright.htm). Source text is separate from original editorial devotionals and community stories. No licensed translation, Bible scraping, third-party Bible API or original-language database is included. See [architecture](docs/ARCHITECTURE.md) and [decisions](docs/DECISIONS.md).

Giving offers five independently evaluated options through the official GiveWell checkout. Personal requests require an exact allowlisted external GoFundMe URL and manual approval. No payment is collected by HisFullGlory; no receipts, custody, payouts, platform fees or claimed fundraising totals. See [verified giving catalog](docs/GIVING_CATALOG.md).

## Hosting and native preparation

No deployment, DNS, Shopify or store settings were changed. A Vercel SPA rewrite is included for `/bible/romans/8/28` and other refreshed deep links. If later approved: Vite preset, `npm run build`, output `dist`, HTTPS, correct auth origins. On another host serve existing static files before falling back to `index.html`.

The service worker precaches the app, fonts, icons and 5.27 MB WEB JSON. It does not cache Supabase/private responses or external pages. Initial internet access is required. Browser installation uses the install prompt where supported; iPhone uses Share → Add to Home Screen. Offline writing and downloaded Bible work; live community does not.

Native wrapper boundaries and App Store release gates are documented, but no Capacitor project, Xcode/Android build, push delivery or native-device result is claimed. Current delivery is a PWA.

See [implementation status](IMPLEMENTATION_STATUS.md), [architecture](docs/ARCHITECTURE.md) and [changelog](CHANGELOG.md) for exact scope and verification limits.
