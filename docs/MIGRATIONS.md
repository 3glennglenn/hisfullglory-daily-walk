# Migration handoff: Topics 005 and Circles 006

Final explicitly authorized read-only linked inspection confirmed hosted history synchronized through 004. The non-deploying dry run proposed exactly 005_topic_discussions.sql and 006_circles.sql. No real push or history repair was run. Both 005_topic_discussions.sql and 006_circles.sql remain local; neither was deployed by this session. Git main starts and ends at 76beca5; prior expansion work, including untracked 005, is preserved.

001–004 match committed history 76beca5. 005 is checked against the byte-for-byte SHA-256 recorded before Circles edits; there is no committed pre-Circles 005 baseline. All five hashes are in CIRCLES_QA.md. Do not edit, rename, delete, manually rerun or repair 001–005. In particular, reapplying 005 after 006 would replace newer guarded functions; migration history must be respected.

## What 006 changes

006_circles.sql is a single BEGIN/COMMIT transaction, intended to apply once after 005. It creates circles/circle_memberships, their constraints/indexes/default-deny RLS, scoped RPCs, membership audit and immutable owner/privacy/slug trigger. It adds nullable circle_id to existing community_posts (old rows retain every existing field). No bootstrap table or existing contribution is deleted or rewritten. Report categories widen additively. Legacy reader signatures/grants remain compatible and exclude Circle posts/replies/counts/reputation. Vote/reaction/prayer-update/report RPCs check current Circle authorization for guessed IDs. Existing new-post raw access remains denied.

Only create/join/application/review RPCs derive owner/user IDs, timestamps, roles and states. Member/application/report lists expose no auth UUIDs/emails, voters, reporter IDs or private reporter notes. Broad metadata includes no answers. Owner-specific safe metadata editing is audited; privacy/owner/slug are immutable even for accidental direct operator UPDATE. Closure disables access and clears pending answers; ownership transfer/privacy conversion/restoration are unavailable in v1.

Local PGlite checks cover a fresh bootstrap→001–006 chain, populated 004→005→006 and 005→006 upgrades, preserving original fields, and a deliberately failed transaction followed by ROLLBACK and successful clean installation. No rollback/re-run was executed against hosted Supabase. Simulated local JWTs do not certify actual Supabase Auth, service configuration or simultaneous connections.

## Windows PowerShell: manual inspection and review only

From the repository directory:

~~~powershell
npx.cmd supabase migration list --linked
npx.cmd supabase db push --dry-run --linked
~~~

At the final inspection both are pending: the dry run should contain **005_topic_discussions.sql and 006_circles.sql only**, in that order. If reviewed deployment later records 005, only 006 may remain. Stop if it proposes 001–004, a modified 005, renamed/deleted history or unexpected SQL. Do not push to solve a mismatch. Confirm the intended project and an existing backup, then share/review the output.

**Only after manual review and explicit approval**, the user may run:

~~~powershell
npx.cmd supabase db push --linked
npx.cmd supabase migration list --linked
~~~

A dry run is not deployment. No reset, repair, bootstrap recreation or old-migration manual rerun is part of this handoff.

## Post-deployment gate on an isolated QA project first

Use genuine guest/A/B/C accounts plus owner/scoped moderator. Exercise the five prioritized flows in CIRCLES_QA.md, direct RPC/raw table access, concurrent vote/join/review/removal, account refresh/expiry, private/public deep-link refresh/back/forward and PWA launch. Confirm 006 recorded remotely before testing the frontend. Original Community/Scripture/devotional/prayer/support moderation must still work. Keep production release blocked until real Auth/permissions, moderation coverage and deployment are reviewed independently.

## 014 terms version

`014_terms_version.sql` makes the terms the founder approved on 2026-10-19 (pull request #27) the version everyone accepts. Founder approval of the migration: 2026-10-20 ("akkoord migratie 014"). It is forward-only and safe to apply twice, and changes no data.

What it does:

- Adds `public.current_terms_version()`, which returns `2026-10-19`. It is the one place in the database that names the version in force. Anon and authenticated may call it.
- Redefines `public.accept_community_terms(terms_version text)` and `public.require_terms()` with the same signatures, messages and grants as in 001, comparing with `current_terms_version()` instead of the literal `2026-10-07`. After 014 an acceptance of `2026-10-07` is refused ("Current terms and authentication required"), and an account that accepted only `2026-10-07` gets "Accept current community rules before publishing" until it accepts the new version once. Old `community_terms` rows stay as the record. Every function that calls `require_terms()` (posts, prayer updates, support requests, topics, Circles, the chat and prayer-wall guards) follows at once.

The same date must stand in three places: `current_terms_version()` (this file), `TERMS_VERSION` in `src/platform/auth.tsx` and `termsVersion` in `site/src/data/legal.ts`. `tests/terms-version-schema.test.mjs` and `site/tests/legal.test.ts` keep them equal. A later terms change needs a new migration that redefines `current_terms_version()`, plus both constants, in one pull request.

Apply timing: the database and the app must switch together.

1. The founder merges the pull request that carries the new `TERMS_VERSION` (this branch, `terms-014`, together with the trust pull request).
2. Claude applies 014 to the hosted project right after the production app build of that merge is live, with the Supabase MCP `apply_migration` (name `terms_version`), never before. Applied earlier, the old app sends `2026-10-07` and cannot accept the rules; applied much later, the new app sends `2026-10-19` and cannot accept them. The window between the live build and the migration is minutes, and today only the founder can sign in, so it affects nobody else.
3. Check read-only afterwards: `list_migrations` lists `terms_version` after `report_hold`, and `select public.current_terms_version()` returns `2026-10-19`.

The earlier schema tests (`platform-schema`, `report-hold-schema` and the others) keep the old literal `2026-10-07` in their fixtures because they load migrations up to 013 and never load 014; only `terms-version-schema.test.mjs` loads it. Undoing 014 needs another forward migration that points `current_terms_version()` back, and asks people to accept again.
