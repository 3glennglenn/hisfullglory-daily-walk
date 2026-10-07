# Release QA — 2026-10-07

Baseline: clean local `main`, `b5671f638a3ca5d792511543f89c447abd277c3e`. This pass repairs the expansion; no deployment or push is authorized. **READY FOR MANUAL TESTING**, not yet certified for public web release.

## Reproduced and repaired

- Quota-full v1 migration and v2 recovery previously returned fresh state, hiding readable journals/onboarding. Readable state now remains available with an explicit unsaved/read-only notice; the raw source stays intact. A previous normalization recovery snapshot is never replaced.
- A null private prayer update previously crashed normalization and hid unrelated valid data. Invalid updates are isolated; valid prayer bodies and journals remain readable, with the original data retained for export.
- Refreshing a devotional opened day one regardless of saved progress. Direct routes resume the first unfinished day; Home offers an unfinished journey before a new recommendation. Unknown journey IDs show an actual not-found state.
- Clearing the support expiration field previously threw `RangeError` before the RPC and left saving busy. Empty/impossible dates now produce validation before entering the busy state; expiry bounds still belong to the server.
- Direct support submission accepted alternate transfer links/account instructions. Client and migration 004 reject these across title, story, relationship and country. Links belong only in the dedicated allowlisted fundraiser field. Older unsafe approved records are excluded from public reads and cannot be newly approved until corrected. These checks supplement human moderation; they cannot interpret every obfuscated natural-language scam.
- Public answers appended to the original 2,000-character prayer body, making long prayers impossible to answer. Server-owned `prayer_updates` preserves the original and appends explicit public updates separately. Feed return contracts remain compatible. Null status/answers fail validation. Each update is limited to 1,000 characters; retained update history is bounded at 50,000 characters, with database rejection rather than truncation.
- Embedded legacy Community/Plans added duplicate primary headings. They now use secondary headings. Notification checkbox labels measured only 28px; their click targets are now at least 44px.

Regression assertions failed before the corresponding repair. No dependencies or original migration files were changed. Apply 004 to an existing 003 installation; fresh installs use schema → 001 → 002 → 003 → 004. Do not roll back to a bootstrap-only authorization state.

## Evidence and limits

| Area                                             | Actual evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guest walk, Bible, journal, prayer, Grow, themes | Built-app Edge behavior: onboarding, private journal, completion, prayer answer without publishing, bookmark/highlight reload, search, passage/history, devotional refresh/Home resume, theme persistence/live OS change.                                                                                                                                                                                                                                                                                |
| Existing v1 data                                 | Representative fixtures and real browser migration retain onboarding, goal, journals, completed dates, active plan, all plan progress and install preference; repeated load is idempotent. Full/unavailable/corrupt storage and failed Scripture download/retry are exercised.                                                                                                                                                                                                                           |
| Community and support                            | Real PostgreSQL/PGlite roles: guest, authors A/B, blocked/muted relationship and privileged operator. Terms, ownership, reports, anonymous ownership protection, reactions, cooldowns, pagination, moderation, support draft/submission/approval/expiry and direct RPC denials are tested. Every public table has RLS; every security definer has an empty search path. Hosted auth/API/Realtime/browser posting workflows and multi-connection concurrency remain manual gates.                         |
| Layout/accessibility                             | DOM measurements on primary/More screens at 375/390/768/1280px in Light/Dark: no horizontal overflow, labeled visible controls, 44px button/input/checkbox-label heights and one primary heading. Native checkout dialog excludes background controls from keyboard focus, supports Escape and uses safe external links. Settings text contrast measured in both themes without a failing pair. Native soft keyboard, screen readers and physical-device safe areas are not certified by headless tests. |
| Offline/PWA                                      | Production manifest, existing PNG icons and generated service worker; installed static Bible and local journal reload offline. Cache configuration permits static shell/Bible only, with no runtime response cache. No Capacitor project exists, so sync, Android/Xcode compilation, device back/keyboard/auth return and App Store tests were not run.                                                                                                                                                  |
| Privacy/content                                  | Code/diff and credential scans; private text stays local or enters an explicit public composer, not analytics. WEB provenance/hash unchanged, source context links checked; no licensed selectors, invented payment records, raised totals, receipts or working native payment adapter. No automated objectionable-content classifier or encrypted local storage is claimed.                                                                                                                             |

Baseline commands passed before repairs: clean install, 17 Node test entries (77 SQL assertions), security, TypeScript/build and 10 browser flows. Final commands use Node 24.19.0 / npm 11.21 through the existing local toolchain:

```sh
npm ci --cache .npm-cache --no-fund
node node_modules/typescript/bin/tsc --noEmit
npm test
node --experimental-strip-types --test tests/schema.test.mjs tests/platform-schema.test.mjs
npm run security
npm run build
npm run preview -- --port 4173 --strictPort
# PowerShell, existing Edge:
$env:BROWSER_CHANNEL='msedge'; npm run test:browser
```

Final results: 22/22 Node test entries; 88/88 SQL assertions (27 original + 61 platform); 14/14 browser flows; TypeScript, Vite/PWA build and security pass, zero uncaught main-page errors. Clean install audited 364 packages with zero reported vulnerabilities. No lint script exists. The deprecated transitive glob warning does not change the audit result. No screenshots or real payments were made.

## External verification and release gates

Reopened the [evaluator list](https://www.givewell.org/charities/top-charities) and [official checkout](https://secure.givewell.org/) on 2026-10-07: all five catalog choices are present; the official donate page redirects to this checkout. Each item retains its evaluator URL and verifiedOn date. Confirmation shows the domain and named choice; the provider collects payment information, not HisFullGlory. No affiliate/search/personal-transfer link is seeded. There is no in-app payment success, simulated donation, provider balance or tax receipt.

Verified GoFundMe's [hosted fundraising process](https://www.gofundme.com/c/how-it-works), [transfer/identity verification](https://support.gofundme.com/hc/en-us/articles/360001992767-How-to-set-up-transfers) and [donor policy](https://www.gofundme.com/c/safety/gofundme-guarantee). No real individual campaign is seeded or certified. Approved fixtures verify database publication rules; fixture URLs are not evidence of live beneficiary verification. Every real campaign requires manual URL, beneficiary, country and provider-account checks before approval. Provider progress remains external.

Before public web release: apply migrations to the intended Supabase project; configure public client settings, SMTP/origins; test real magic-link/expired-auth/reconnect/two-account publishing/report/block/support flows; confirm a staffed support mailbox and moderation/account-deletion procedure; approve public Terms/privacy/retention; verify each personal campaign. Licensed translations and native payment/provider prerequisites remain disabled future work. Native charitable collection still requires legal/provider and [App Store review](https://developer.apple.com/app-store/review/guidelines/) clearance; external checkout remains the default.

No remaining serious defect is known from completed local checks. These external and device gates remain unverified, rather than represented as successful integrations.
