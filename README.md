# HisFullGlory Daily Walk

Installable mobile-first PWA: local WEB Scripture, private journals, streaks, three five-day plans, optional Supabase community, and HisFullGlory store links. No backend server or Shopify integration.

## Local development

Node 22.12+ (Node 24 recommended).

```sh
npm install
cp .env.example .env.local
npm run dev
```

Without environment variables the app works with a clearly labeled read-only Community preview. Journals and progress stay in this browser; clearing site data removes them. Storage failures are shown visibly. Internet is needed for initial installation, live community, and store links.

```sh
npm test
npm run build
npm run preview
```

Tests cover calendar dates, streak idempotence, corrupt storage recovery, and database authorization in a local in-memory PostgreSQL engine (development only). They verify profile privacy, author-only writes/deletion, anonymous author protection, reactions, cooldowns, and hidden/deleted content. No hosted database is contacted by the tests.

Build validates strict TypeScript and outputs `dist/`, including manifest and app-shell service worker. Fonts are self-hosted. Only bundled app assets are precached; Supabase responses, product images, and external pages are not cached. Use HTTPS for installation. iPhone: Share → Add to Home Screen. Other browsers: browser install/menu option.

## Supabase setup

1. Create a Supabase project. Run the entire `supabase/schema.sql` in SQL Editor. It creates five tables, RLS policies, author-only deletion, private profiles, server-controlled author snapshots, a three-second SQL cooldown, prayer count aggregation, and three fixed rooms. Seed/policy/publication setup is idempotent.
2. Enable email authentication. Configure production Site URL `https://app.hisfullglory.com` and redirect allowlist `https://app.hisfullglory.com/` and `http://localhost:5173/` (or the exact Vite dev URL). Configure production email delivery for magic links. Guests can read without signing in.
3. Add only these public client settings to `.env.local`, or Vercel project environment:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY
```

Never add a service-role/secret key. Vite variables are public at build time. Rebuild when they change. Supabase manages auth tokens; the app does not manually copy them. After sign-in, choose a display name before posting. Profiles are readable/editable only by their owner; existing messages retain their name snapshot.

4. Verify with two accounts and a guest: guests cannot write, each account can edit only its own profile, delete only its own posts, and toggle one prayer reaction. Check rapid concurrent submissions, pagination, reconnect, moderation, and expired magic links. Live auth/Realtime/RLS verification requires a configured Supabase project.

Prayer Wall lists the latest 50 or 50 most-prayed visible posts. Chat loads 50 messages with `(created_at, id)` cursor pagination. Realtime inserts are deduplicated; periodic reconciliation removes moderated content and refreshes counts. Anonymous display hides the name from readers; project administrators can identify authors.

## Manual moderation

Use Supabase Table Editor to set `is_hidden = true` or `deleted_at` on concerning `chat_messages` / `prayer_posts`. Review spam manually; client word checks are only a basic aid. Visible feeds reconcile every 20 seconds. Never share private profile rows or create a public user directory. Confirm the support mailbox in `src/config.ts` before publishing; reports contain only a message/post ID and room name. Community prayer does not replace emergency or professional support.

## Store content and privacy

Edit product titles, benefit lines, price strings and image URLs in `src/config.ts`. Store product information and USD currency were verified on 2026-10-05. Unavailable images use a CSS fallback. Buttons open the three exact supplied product links in the same tab; all purchases stay in the store.

WEB quotations are the public-domain updated World English Bible: [Psalm 23](https://ebible.org/engwebp/PSA023.htm) and [Psalm 121](https://ebible.org/engwebp/PSA121.htm). All quotations are labeled WEB. Devotionals are local original reflections.

Analytics use a dependency-free console helper with allowed non-sensitive metadata only. Journals, community text, email and display names are never sent to analytics/logs. Community never receives journal state.

## Vercel, domain and Shopify link

Import this GitHub repository into Vercel. Choose Vite, build `npm run build`, output `dist`, Node 24. Add the two public Supabase variables if Community is ready. Tabs use app state, and magic links return to `/`, so no SPA rewrite is needed. Deploy and verify HTTPS manifest/service worker and auth redirects.

Add `app.hisfullglory.com` in Vercel Project Settings → Domains and configure the exact DNS record it specifies with your DNS provider. Update Supabase redirects if the production URL changes. This implementation does not deploy or change DNS.

In Shopify navigation add a “Daily Walk” link to `https://app.hisfullglory.com`, optionally also as a storefront CTA. All commerce stays on the existing store; this app does not modify Shopify.
