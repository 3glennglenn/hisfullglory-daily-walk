# HisFullGlory · Jesus at the Center

A mobile-first React/TypeScript/Vite faith platform with an installable PWA, complete public-domain WEB reader, daily guided walk, local private journal and prayer lifecycle, 15 five-day devotional topics, optional Supabase community, external giving and the original HisFullGlory shop links.

## Run and verify

Node 22.12+; Node 24 used for validation.

```sh
npm ci
npm run dev
npm test
npm run security
npm run build
npm run preview
# In a second terminal, with Chromium installed (`npx playwright install chromium`):
npm run test:browser
```

GitHub Actions runs these checks, plus the site's build and tests, on every pull request to `main` and every push to `main` (`.github/workflows/checks.yml`). They report only; they do not block a push or a deployment.

For an existing Edge installation, set `BROWSER_CHANNEL=msedge` before the browser script (PowerShell: `$env:BROWSER_CHANNEL="msedge"`). The script captures no screenshots and makes no donations.

`npm test` runs pure state/privacy/Bible tests and PGlite PostgreSQL privilege/policy checks with simulated JWT claims; no hosted database is contacted. Build includes strict TypeScript and the production service worker. `dist/` is generated, ignored output. No lint script is configured. See [final independent release QA](docs/FINAL_RELEASE_QA.md), [historical Circles implementation QA](docs/CIRCLES_QA.md) and [historical expansion QA](docs/EXPANSION_QA.md); [previous QA](docs/QA_REPORT.md) is a historical record.

Guest mode needs no credentials. Missing Supabase produces explicit unavailable publishing/support states. Local writing, WEB, Grow, bookmarks and external causes work without auth. Browser storage is local and unencrypted: export Settings → private backup before clearing data. On first run preserved v1/v2 keys migrate forward to v3. Guest and each authenticated account have separate local profiles; sign-in never silently adopts guest writing. Local storage is unencrypted and does not protect against someone inspecting this browser/device. Already-onboarded users are not forced through onboarding again.

## Expansion scope

Private topic preferences, a canonical 26-topic graph, device-side resources, My Walk, two three-step editorial paths and a seven-practice private challenge extend existing flows. Community adds explicit private memberships, topical discussions/one-level replies, sources, private saved links, server votes/ranking and derived reputation through 005. Controlled SDK browser tests exercise production posting components; real hosted Auth/API testing remains pending; guest/local flows and SQL authorization are tested separately. Private prayers retain explicit sharing, with returned public testimony IDs linked only in the local prayer record.

Context has a sourced scope/fallback architecture and “Why we say this”; checked observations still cover only Psalms 23/121 and Romans 8. AI, billing and contributor verification are disabled contracts, not working integrations. Circles v1 adds public/private group discussions, explicit join/application/review, scoped owner/moderator roles and moderation via migration 006. These flows are locally SQL/controlled-SDK-tested; linked deployment/Auth remain unverified. Helper notifications, Walk With Me, Prayer Chain and external insight imports remain future slices. See [scope matrix](docs/EXPANSION_MATRIX.md), [privacy/data flow](docs/PRIVACY_DATA_FLOW.md) and [future integration gates](docs/FUTURE_INTEGRATIONS.md).

## Connected community setup

Final read-only linked inspection confirmed migrations 001–004 recorded remotely, with 005 and 006 pending. The dry run proposed exactly those two migrations; nothing was applied. This does not verify hosted schema drift, Auth or RLS. Production history 001–004 is immutable against commit 76beca5. New migrations: `005_topic_discussions.sql` and `006_circles.sql`, locally tested on fresh and populated upgrade chains, but not deployed by this session. Migrations 001–005 are immutable for the Circles pass.

Follow [migration inspection and approval steps](docs/MIGRATIONS.md). Do not reapply bootstrap SQL or repair production history as an expansion step. A linked dry-run must show only 006, plus 005 if it genuinely remains undeployed; review its output and obtain explicit approval before a real push.

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
