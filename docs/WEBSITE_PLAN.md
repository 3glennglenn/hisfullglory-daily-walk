# Website plan: hisfullglory.com

Status: steps 1 to 3 of section 9 are built and in `main` since pull request #2 (scaffold,
shared tokens, layout; Bible index, book and chapter pages with their build test; Home,
About, Beta and Resources; see `site/README.md`). Step 5 (sitemap, `robots.txt`, share
image, not-found page) is built as well. Step 4: pages for the eight launch
topics and three articles, written on 2026-10-13 and approved by the founder that day
(`site/README.md`, "Topic pages and articles").
Step 7: the site went live on `hisfullglory.com` on 2026-10-13 and the shop moved to
`shop.hisfullglory.com`; what is left of it is in section 7. Step 6 is partly done: the
home page scored 100 for performance, accessibility and best practices on mobile, and the
founder looked at the review site. A review copy stays at
https://hisfullglory-site.vercel.app (noindex). Owner: founder. Last updated 2026-10-13.
Read `CLAUDE.md` first. Talk to the founder in Dutch; site copy is English.

## 1. Purpose

The website attracts people through search and social media, teaches them something real
about the Bible, and invites them into the app, where they study daily and join the
community. The shop is a supporting section, not the front door.

Funnel: question on Google or social → helpful page on the site → the same passage or topic
in the app → Daily Walk, reflection, community → (optional) a study resource from the shop.

## 2. Domains

| Address | Becomes | Today |
| --- | --- | --- |
| `hisfullglory.com` | New static site (this plan) | The site, since 2026-10-13 |
| `shop.hisfullglory.com` | Shopify, store and checkout only | The shop, since 2026-10-13 |
| `app.hisfullglory.com` | The app (unchanged) | Live |
| `www.hisfullglory.com` | Redirect to the site | Redirects to the site (308, path kept), since 2026-10-20 |

## 3. Architecture

- New folder `site/` in this repository, deployed as a **second Vercel project** with root
  directory `site/`. The app (`/`) stays untouched.
- Framework: **Astro** with static output, so every Bible, topic and article page is plain
  HTML that search engines can read. React only where interaction is needed (few places).
- Shared data, read at build time, never copied by hand:
  - `public/bible/web.json`: WEB text (public domain).
  - `public/study/<book>.json`: study notes, validated with `parseStudyFile` from
    `src/bible/knowledge.ts`. Drafts show the "Editorial draft" label, as in the app.
  - `src/topics/graph.ts`: topic ids, labels and `launchTopics`.
  - `public/ai/<book>.json`: AI explanations, a separate labelled layer decided on
    2026-10-12 (`docs/AI_EXPLANATIONS.md`). Shown below the sourced context on a chapter
    page, never inside it. A pilot of five chapters exists.
- No user-generated content on the site in v1. Circles, prayers, journals, private topics
  and anything sensitive never appear on the site, now or later.
- Design: same tokens as the app (`src/styles.css`, five blocks synced by `scripts/sync-shared.mjs`):
  two themes, Cover and story (default) and Marked page, each with Light and Lamplight modes
  that follow the device unless the visitor changes them with the switch in the footer.
  Manrope (Cover) and the system font (Marked) for interface text, Gelasio and Literata for
  Scripture, all bundled. Brand mark: the cream and gold cross. Mobile-first, 44px touch
  targets, visible focus, reduced motion.

## 4. Pages (v1)

| URL | Content | Main button |
| --- | --- | --- |
| `/` | Home (see 4.1) | Open the app |
| `/bible` | All 66 books, grouped by testament | Pick a book |
| `/bible/<book>` | Book context note (if any) and chapter list | Read chapter 1 |
| `/bible/<book>/<chapter>` | WEB text of the chapter, its context note (chapter, else book), "Why we say this" with sources | "Study and discuss this chapter in the app" → `app.hisfullglory.com/bible/<book>/<chapter>` |
| `/topics` | The 8 launch topics | Pick a topic |
| `/topics/<id>` | Short honest intro, key passages (from a reviewed editorial file, see 6), link to the topic in the app | "Join the conversation" → `app.hisfullglory.com/community/<id>` |
| `/articles` and `/articles/<slug>` | Sourced explainers, for example "What did Jesus mean by turn the other cheek?" | The passage in the app |
| `/resources` | Bibles grouped by study goal (for women, for men, deep study) | Buy → `shop.hisfullglory.com/products/<handle>` |
| `/about` | Mission, who is behind it, how moderation and privacy work | Open the app |
| `/beta` | What the Daily Walk beta is and how to join | Open the app |

Chapter pages: 1,189 static pages. A chapter without its own note shows the book note with
the label "Book context"; a book without a note shows "Context for this book is being
written." Never generate notes at build time.

### 4.1 Home sections

1. Hero: "Study the Bible together." Subline about reading, understanding and discussing
   Scripture with others. Buttons: Open the app (primary), Explore the Bible (secondary).
2. How it works: Read, Understand, Discuss, Grow, each with one line.
3. Inside the app: Bible with context, Daily Walk, private journal and prayer, topic
   discussions, Circles. Only features that are live; label the app "beta".
4. Trust: Scripture first; context is sourced and labelled; community voices are labelled
   as community; journals stay private; moderated community.
5. Start here: the 8 launch topics as cards.
6. Resources: a quiet strip linking to `/resources`.
7. Beta invitation and footer (About, Privacy, Terms, Contact, Shop).

Since the calm redesign (phase 01.1) the home opens on the newest published context check
(`featuredChecks()` in `site/src/lib/content.ts`, AI-unreviewed ones included and always
labelled), with a bookcase of the six newest beside it from 1024px, then the sentence about
the app with the one filled "Open the app", the four layers, and the launch topics. The list
above is the earlier home.

## 5. Copy rules

- English, warm, plain, specific. No em dashes. No fake urgency, reviews, numbers or
  user counts. Call the app a beta web app, never an App Store app.
- Meta-safe: never assume the reader's faith, gender, feelings or struggles.
- Transformation is attributed to God, not to the product or the app.
- Quotes from Scripture must match the WEB text exactly.

## 6. Content that needs the founder

- **Topic pages** need real passage lists. `topicGraph` passages in the app are
  placeholders. Create `site/content/topics/<id>.json` drafts (passages with a one-line,
  sourced reason each) and ask the founder to approve before publishing.
- **Articles**: start with 3 drafts, each citing its sources; the founder approves each one.
- **About**: ask the founder for the story in his own words.

## 7. Moving the shop (needs founder approval for each step)

1. Build and review the site on its temporary Vercel URL. No domain or Shopify change.
2. In Shopify, add `shop.hisfullglory.com` and make it the primary domain. DNS change.
3. Point `hisfullglory.com` to the new Vercel project. DNS change.
4. Permanent (308) redirects on the site, same path to the shop:
   `/products/*`, `/collections/*`, `/cart`, `/checkout*`, `/account*`, `/pages/*`,
   `/policies/*`, `/search*`. Existing ads and search results must keep working.
5. Check afterwards: Meta Pixel and Conversions API events (ViewContent, AddToCart,
   InitiateCheckout, Purchase) still arrive from the shop; the product catalog still syncs;
   Meta domain verification still covers the subdomain; an ad link to a product page works.

Done on 2026-10-13, by the founder in Shopify and Vercel: steps 2 and 3, with the redirects
of step 4 merged first (pull request #5). The redirects cover a few more shop paths than
listed above: blogs, discount links, gift cards, app proxies, and order and checkout links
that start with the shop number. The domain is managed in Shopify. Its A record points at
Vercel (`216.198.79.1`) and its AAAA record is removed, because Vercel has no IPv6 address
and a leftover AAAA record keeps sending visitors to Shopify.

Still open from this section:
- Step 5 has not been checked, and no real order has been placed on the new shop address.
- Shopify's records live for 24 hours. A browser that was sent to the shop during that time
  may remember the redirect for longer; a private window shows the real state.

## 8. Tracking and privacy

- v1: no Meta Pixel on the site. Purchases happen on the shop, where the Pixel already runs.
- If tracking is added later, it needs a cookie consent banner first (EU visitors) and must
  never carry Bible, topic or personal data in URLs or events.
- Privacy and Terms pages link to the existing policies.

## 9. Build order and done criteria

1. Scaffold `site/` (Astro, static), shared design tokens, layout, header and footer.
2. Bible pages (index, book, chapter) from the shared data, with a build test that every
   page exists and every quote in a note matches the WEB text.
3. Home, About, Beta, Resources.
4. Topics and Articles, from founder-approved drafts only.
5. SEO: unique titles and descriptions, canonical URLs, `sitemap.xml`, `robots.txt`,
   Open Graph images, clean 404.
6. Preview on Vercel, Lighthouse check on mobile (performance, accessibility, SEO above 90),
   founder review.
7. Domain steps from section 7, one approval at a time.

Out of scope for v1: accounts or login on the site, user content, search, Dutch pages,
newsletter platform changes, paid tools.
