# Changelog

## Trust pages and account deletion: branch `account-deletion` (new pull request; #16 merged the earlier deletion work on 2026-10-16), waiting for the founder's text approval and merge (2026-10-16)
- Add the privacy policy, terms of use and contact pages to the site (GATE-02). All unknown facts (legal entity, registration number, address, minimum age, response target, governing law, supervisory authority, legal basis, transfers, retention, hosting regions, "we do not sell your data", licence to posts) are `[CONFIRM: ...]` markers in one file, `site/src/data/legal.ts`. Until the founder approves the text, the pages are noindex drafts with a banner, stay out of the sitemap, and a production build of the site stops with an error naming `legal.ts`. Vercel then keeps the previous deployment. Do not merge before the approval.
- Revise `/delete-account` to three numbered steps in the app, with the email route shown only when `supportEmailReady` is true (forwarding of support@hisfullglory.com proven). The footer lists About, Privacy, Terms, Contact, Delete account and Shop; the shared header no longer scrolls sideways at 200% text size.
- Check the privacy text against the code: no cookies set by our code, no analytics or tracking tools, five named processors. Add `tests/third-parties.test.ts`: a new outside host in the code, or a listed host the code stopped using, fails CI. Bring `docs/PRIVACY_DATA_FLOW.md` in line with the code.
- Finish the in-app deletion card: typing `delete` in any letter case works, the six consequences are listed in the words of `/delete-account`, the permanent button stays disabled until the word matches (hint "Type DELETE exactly to confirm."), focus moves sensibly, a second press adds no second call, and a failure is announced and keeps the form. Add a browser check of the real Profile page (`tests/profile.browser.mjs`).
- Link Privacy policy, Terms of use and How account deletion works from Profile and Settings. "Contact support" and "Report a mistake" appear in the app only when `supportEmailReady` is true. A production build of the app (`VERCEL_ENV=production`) also stops while the text is not approved.
- Sign-in speaks of a 6-digit sign-in code everywhere (Profile and Community), with a visible 60-second countdown before a new code can be sent. The terms checkbox names the minimum age, links the terms and privacy policy, says reports are reviewed by a person and shows the terms version.
- Two differences from the UI-SPEC are flagged for the founder: a held post has no distinct "being reviewed" line in Phase 1 (a direct link shows the existing "unavailable" line), and the delete button is disabled until DELETE is typed.
- Fill in the founder's values of 2026-10-19 in `site/src/data/legal.ts` and keep the draft gate shut (`approved = false`, so production builds of the site and the app are still refused). The service is run by a private person, Glennysan Read, the Netherlands: no company, no registration number and no postal address are published, contact is by email, and the response-time sentences are gone. `supportEmailReady` is true: the founder's test mail to support@hisfullglory.com arrived on 2026-10-19, so the pages and the app show the address. One age rule everywhere (terms, privacy policy, the app's terms checkbox, `docs/APP_STORES.md`): reading, the Daily Walk and the private journal need no account and have no age limit; an account needs at least 13, and in the EU or EEA at least 16 or 13 to 15 with permission from a parent or guardian; the app is not designed for children (target audience 13+). Governing law, supervisory authority, rights, legal basis, transfers, "we do not sell your data" and the licence to posts are drafts for the founder to accept or change on the preview. Hosting regions are filled in (Supabase Ireland, Vercel worldwide network, Resend Ireland as the region to be set). Log and backup periods come from the providers' own pages (Supabase Free: API and database logs 1 day, no automatic backups; Vercel Hobby: runtime logs 1 hour). Two markers remain on purpose: the approval date, and how long Supabase keeps the sign-in audit log, which its documentation does not state.

## Reports that hold a post: branch `report-hold`, waiting for the founder's merge (2026-10-16)
- Server side: migration 013 (next section) hides a post that two different people have reported until a person has reviewed it. It is written and tested locally and not applied to the hosted project. This section is the app side.
- Replace the inline "Report / block" card with a report dialog (GATE-06 client half, UX-01). The reader picks one of eight reasons, harm first (harassment or threats, hate, sexual content, dangerous advice, scam, private information, spam, something else), none preselected, may add a private note of up to 1,000 characters, and sends it. The reasons are the values the server already accepts; the reason and the note go only to `community_safety_action` and are never logged, stored or put in an address.
- After sending, a calm confirmation ("Thank you for telling us") says a person will read it and the author is not told who reported, and offers "Block this person" and "Keep reading". Blocking sends no reason and no note, and nothing asks the reader to reload: lists refresh when the dialog closes.
- Specific, non-technical errors: not sent (connection), post no longer available, signed out, and more than 30 reports in an hour. Escape closes, a click outside is ignored while the note has text, and focus returns to the Report button, which is named for what it reports (post, chat message, prayer request, support request).
- Settings: the blocked list is "Blocked authors", shows no empty text while loading, "Block list unavailable." when it cannot be read, "No blocked authors." when empty, and each Remove button names its row.
- Add `src/social/reportReasons.ts`, `tests/safety.test.ts` (reasons stay inside the server's category list) and `tests/safety.browser.mjs` (15 checks plus the blocked list: states, roles, focus, 44px targets at 320px, no logging of the note).
- Held posts need no client change: the readers return nothing for a held post, so a direct link shows the existing "This thread is unavailable, removed or blocked." line. A distinct "This post is being reviewed." line needs changes to the thread readers and waits for the week-2 surfaces.

## Held for review: branch `report-hold`, written and tested locally, not applied to the hosted project (2026-10-16)
- Add `supabase/migrations/013_report_hold.sql` (GATE-06): an item that two different people other than its author have reported is hidden from every reader until a person has reviewed it. It covers community posts (Circle posts too), chat messages, prayer requests and support requests. The author's own report and a repeat report from the same person do not count.
- Add `public.review_held_content(item_kind, item_id, decision, review_note)` for the database owner only (not granted to `anon` or `authenticated`): `restore`, `keep_hidden` or `remove`, resolving the item's open reports in the same transaction so the next single report does not hold a restored item again.
- `community_safety_action` keeps its signature and grants and refuses a 31st report from one account within an hour ("Report limit reached"). `community_reports.target_kind` also accepts `walk_reflection` for week 2.
- Add `tests/report-hold-schema.test.mjs` (PGlite): every storage shape, Circle isolation, flood cap, operator review, a WHERE guard for every UPDATE and DELETE in a database function, and a reader-coverage guard so a future reader that forgets to hold back held content fails the suite. Two reports arriving at the same moment are covered by a per-item lock that PGlite cannot exercise.
- Document the routine in `docs/MODERATION.md` ("Held for review"): count-only check, how to read an item and its reports, the three decisions, and the limits.

## Release foundation: branch `release-foundation`, waiting for the founder's merge (2026-10-16)
- Skip Vercel builds for branches that need no preview: `git.deploymentEnabled` in `vercel.json` and `site/vercel.json` turns off `docs-*`, `planning-*`, `scratch-*`, `wip-*`, `ci` and `ci-*`. Every other branch still gets a preview and `main` always builds. A test push of a `scratch-*` branch created no Vercel status and no deployment.
- Write down the fair-use answer in `CLAUDE.md` ("Vercel notes"): both projects stay on Hobby until the store launch around mid-November 2026, then the founder upgrades to Pro ($20 a month, one seat) himself.
- Add the shared tokens `--danger` and `--on-danger` (Light and Dark) with `button.danger`, `.secondary.danger` and `.danger-text`, reserved for deleting an account and inline errors.
- Fix two contrast defects found by the audit: the keyboard focus ring is `var(--strong)` instead of `var(--secondary)` (2.89:1 on the Light background, now 6.06:1), in the app and on the site; the edges of input, textarea and select use `var(--muted)` instead of `var(--border)` (1.4 to 2.3:1, now 6.09:1 or more).
- Add `tests/vercel-config.test.ts` (both rule sets equal, no rule can match `main`) and `tests/tokens-contrast.test.ts` (WCAG ratios computed from the token hex values: 4.5:1 for text pairs, 3:1 for the focus ring and control edges, Light and Dark).
- Add `docs/UX_REVIEW.md`: the review every pull request that adds or changes a screen records (design critique, UX copy, accessibility).

## Checks on GitHub (2026-10-14)
- Add `.github/workflows/checks.yml`: on every pull request to `main` and every push to `main`, run the app's `npm test`, `npm run security`, `npm run build` and the browser check against `npm run preview`, and build and test the site. Free GitHub-hosted runners, no secrets; the checks report and never block a push or a Vercel deployment.
- Nothing ran the browser check automatically, which is how it could fail from pull request #2 until pull request #10 without anyone seeing it.
- Make two browser checks wait until the page has settled. On GitHub's runners they failed most of the time (the offline check counted a late `/ai/luke.json` fetch; the Circles sign-in helper let a click land between two loads), on a laptop rarely. What they assert is unchanged.
- A failed check puts its first error and the end of its output in an annotation (`scripts/ci-failure-note.mjs`), because GitHub shows full logs only to signed-in users.

## Supabase advisor: `rls_auto_enable()` no longer callable over the API (branch `lock-rls-auto-enable`, 2026-10-14)
- The security advisor (lints 0028 and 0029) listed `public.rls_auto_enable()` as a SECURITY DEFINER function that guests and signed-in users can call at `/rest/v1/rpc/rls_auto_enable`. No migration creates it: it and its event trigger `ensure_rls` have been in the hosted project since before migration 001, and its body is the "Auto-enable RLS for new tables" example from Supabase's Row Level Security guide. It switches RLS on for every new table in `public`.
- A direct call does nothing but return an error ("trigger functions can only be called as triggers"), and the function can only switch RLS on. The risk was therefore small; no API caller needs it, so the grant goes.
- Add `supabase/migrations/009_rls_auto_enable_grants.sql`: revokes EXECUTE from `public`, `anon` and `authenticated`, and does nothing where the function does not exist. The function itself, its owner and the event trigger stay as they are; no other function changes.
- Add `tests/rls-auto-enable-schema.test.mjs` (PGlite, with the hosted definition): the grants are gone, a guest or signed-in call gets permission denied, nothing else changed, and the trigger still switches RLS on for new tables, also for a role without EXECUTE.
- Applied to the hosted project on 2026-10-14 with the founder's approval (version 20261014193724, name `rls_auto_enable_grants`). Checked afterwards: the function's grant list is only `postgres=X/postgres`; `anon`, `authenticated`, `service_role` and `authenticator` cannot execute it; its body, owner, SECURITY DEFINER and search_path and the grants of the 57 other functions in `public` are unchanged; `ensure_rls` is still enabled; the security advisor no longer lists it. Written as 008, renumbered 009 because `008_word_filter` (branch `word-filter`) was applied first.

## Song of Songs speakers shown as labels: branch `bible-speaker-labels`, waiting for the founder's merge (2026-10-14)
- Show who speaks in Song of Songs, as the founder decided on 2026-10-14: a small label above the verse where a new speaker starts (28 times) or inside the verse where the speaker changes mid-verse (5 times), in the Reader and on the site's chapter pages. The labels are the WEB's own (Beloved 15, Lover 10, Friends 7, Brothers 1). Each chapter that has labels opens with one line: "Speaker labels come from the WEB translators, not the Hebrew text. Beloved is the woman, Lover is the man." Chapter 3 has no label in the WEB, so it has no line either.
- The labels are not verse text: `public/bible/web.json` gives a Song of Songs verse an optional `speakers` field next to its unchanged text. Search, "Copy Scripture", quotes, study notes and AI explanations use the text alone; labels cannot be selected or copied with it.
- Regenerate `public/bible/web.json` from the same official archive; the importer before this change reproduces the previous file byte for byte. Compared verse by verse: no text, verse number or omitted marker changed; 29 Song of Songs verses gained `speakers`, 33 labels in all, each at the first words after its `\sp` line in the source.
- Tests: `tests/bible-text.test.ts` (USFM snippets, the 33 places, `speakerParts`) and `site/tests/bible.test.ts` (each label and the note on the built pages; the verse-text check ignores labels).

## Song of Songs speaker labels: merged into `main` with pull request #11 (2026-10-14)
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
