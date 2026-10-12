# Circles v1 — historical implementation handoff (2026-10-08)

Superseded by [FINAL_RELEASE_QA.md](FINAL_RELEASE_QA.md). Counts and failures below record the earlier implementation pass, not current final QA. Final QA reproduced its original counts, found three further client defects, and executed explicitly authorized linked history/dry-run inspection without deployment.

## Baseline and scope
Branch main, starting/ending HEAD: 76beca5d957df6e2a61492caff7501628740ce17. The expected features existed locally as a dirty third-stage expansion, including untracked 005, rather than a committed expansion baseline. All pre-existing work and supabase/.temp/ were preserved; the cache directory was not inspected. This pass implements Circles only. No commit, push, linked CLI, hosted database change, deployment, store/DNS change or external message was performed. No dependency or lockfile change was needed.

Changed specifically for Circles: src/social/Circles.tsx, circlesApi.ts, safety.tsx and TopicHub.tsx; src/platform/router.ts/capabilities.ts; src/platformApp.tsx; scoped styles; 006_circles.sql; package test script, browser runner, four Circle test/fixture files; documentation listed below. Existing private-state models/persistence/Auth implementations were reused without Circle-specific storage additions.

## Implemented capability/evidence matrix
PASS below means local evidence only; every connected capability is **linked Supabase unverified / production undeployed**.

| Capability | Status | Evidence |
|---|---|---|
| Discovery, limited authenticated private metadata, topic/page filtering, own active groups | PASS | Code + SQL cursor/visibility tests + SDK browser |
| Creation, profile/Terms/rate limits, unique/reserved slug, atomic server-derived owner | PASS | SQL; actual UI create/edit/close using controlled SDK |
| Public join/idempotency/leave/rejoin | PASS | SQL state transitions + SDK browser |
| Private apply/pending/read-own/approve/decline/withdraw/reapply | PASS | SQL authorization; primary apply/approve browser flow |
| Application answer exclusion from broad metadata | FAIL → FIXED | Separate own-application RPC and explicit SQL regression |
| Owner promotion/demotion, protected owner/self roles, scoped moderator removal | PASS | SQL denied escalation/cross-group + SDK browser |
| Removed account cannot self-restore; immediate server read/write revocation | PASS | SQL; browser hides private content |
| Owner detail editing, immutable owner/privacy/slug, closure | PASS | SQL guards/audit; actual controlled UI |
| Circle contributions/one-level replies, safe sources and Scripture/devotional links | PASS | SQL same-group/depth/source validation + SDK browser |
| Votes/removal/deduplication, helpful/Amen/Praying reactions and real counts | PASS | Existing storage/helpers; SQL + SDK browser |
| Reputation/roles/anonymous identity separation | PASS | SQL + inspected output; ALL Circle contributions excluded from global reputation |
| Report/block/mute integration and private scoped queues | PASS | SQL reporter isolation/block scenarios + SDK report |
| Hide/remove/restore a reported contribution; resolved hidden targets stay reviewable | PASS | Scoped SQL + hide/restore browser; own-deleted content cannot be restored |
| Review panel stays open across actions | FAIL → FIXED | Reproduced browser timeout; controlled open state; passing regression |
| 20-row discovery/discussion/member/application/report bounds and cursors | PASS | SQL no-loss/no-duplicate tests for first four; reports capped/indexed and inspected |
| Circle direct links/refresh/back/forward/signed-out denial | PASS | Route tests + SDK browser with server fixture memory across reload |
| PWA shell navigation into Circle routes/offline Bible | PASS | Production browser/static cache regression; no backend simulated in production |
| Light/Dark responsive layout and confirmation keyboard behavior | PASS | 320/360/390/430/768/1280px, both themes; labels/overflow/touch size/focus/Escape checks |
| Missing configuration/offline/network/authorization/timeout/failed mutation | PASS | Production unavailable state + SDK; 12-second per-RPC timeout, drafts retained, no fake success |
| Current Auth/account/stale-response boundaries | PASS | Existing actual-provider browser fixture + Circle switches; genuine Auth unverified |
| No private persistent/shared cache, analytics/logging or test SDK in production | PASS | Code audit, browser storage check, security scan and generated-bundle check |
| Fresh/populated migrations/transaction failure | PASS | Actual PGlite SQL with simulated JWTs |
| Real linked Auth/API/RLS/configuration/concurrent connections | BLOCKED | No hosted commands permitted or executed; genuine sessions absent |
| Native keyboard/back/device/App Store testing | BLOCKED | No configured native project/toolchain/device evidence |
| Ownership transfer, privacy conversion, removed-membership restoration | FUTURE | Deliberately absent v1 operations |
| DMs, media, billing, expert/church verification | NOT IMPLEMENTED | Outside v1; billing/verification capability flags remain disabled |
| Circle offline mutation queue/cloud private sync | NOT APPLICABLE | Network-only Circle operations; no fake local backend |

## State-machine evidence
All the following SQL transitions passed:
- public none→active, repeated join (one record), active→left, left→active after cooldown;
- private none→pending; pending→active/declined by current owner/moderator; pending→left withdrawal;
- private declined/left→pending after cooldown; active→left; active→removed by scoped moderator;
- owner member→moderator and moderator→member; role changes do not alter reputation;
- removed→active/pending denied; ordinary member approval/promotion denied; moderator promotion/demotion/other-moderator removal denied;
- owner leave/remove/demote/self-role changes denied by protected membership rules; cross-Circle moderation denied.
Owner removal/transfer is not a v1 transition. The browser verifies primary public/private flows, owner role changes/removal, and protected owner controls; SQL proves authorization below the UI.

## Privacy, read-path and cache audit
| Actual read path | Circle boundary |
|---|---|
| read_aggregate_feed / read_community_feed, including Scripture, devotional, testimony filters | circle_id IS NULL; all Circle content intentionally excluded |
| read_topic_discussions: newest/top/helpful/replies | Scope NULL; private root IDs rejected before children |
| read_topic_thread, including saved-thread links | Scope NULL; private/public Circle IDs cannot bypass through saved local topic links |
| Topic Following and local recommendations | Canonical explicit local topic IDs/resources only; no Circle content reader |
| Circle metadata/discovery | Public to guests; limited private metadata only to signed-in users; no answers/owner UUIDs/member identities; count only current active members |
| read_own_circle_application | Caller record only; no lookup of another applicant |
| read_circle_members | Current scoped owner/moderators only; pending answers/active snapshots with opaque IDs; no auth UUID/email |
| Circle discussions/thread | Public eligible content, or private active members; same Circle, parent visibility and caller blocks |
| Circle report/moderation queue | Current scoped owner/moderators; permits inspection despite blocks; no reporter UUID/note; reported hidden/removed targets remain restorable |
| Public profile/social search/activity/recommendation endpoints | No such Circle-reading endpoints exist; profiles remain owner-private; Bible search is static Scripture |
| Legacy prayer wall/chat/support | Separate unchanged tables/readers; Circle prayers are community_posts and never enter these tables |
| Global contribution_reputation | ALL Circle contributions excluded; no private activity score oracle; helper EXECUTE denied |
| Votes/reactions/prayer updates/report/block RPCs by guessed IDs | Current scoped visibility/member checks; generic inaccessible-contribution denial |
| Own deletion | Existing self-owner check; can delete own known contribution after leaving without disclosing content or granting another owner's deletion |
| Raw Circle/member/post/vote/reaction/audit tables | No app table privileges; RLS default deny; narrow serializers only |
| Auth / React / local state / service worker | Account-keyed remount; no Circle data added to private/local storage; static-only precache; no dynamic runtime cache or private Realtime publication |

Answers: plain text, max 1000 characters. Unresolved pending answers remain solely for their decision and are withdrawable; approval/decline/withdrawal/removal/closure erases them immediately. There is no time-based purge job. Private records never reach logs/analytics/notification bodies/URLs. Source URLs use existing safe HTTPS validation, visible domains, noopener/noreferrer and no preview fetching. React renders text, not HTML; no new any/ts-ignore/dangerous HTML or secret was found.

Normal blocks/mutes hide authors and root descendants. Applicant blocking a moderator does not defeat application review; Circle report inspectors can examine reported content only in their own group. Account changes clear drafts/server records via the existing provider boundary. Offline/background/block/focus events clear transient records; active foreground views refresh every 30 seconds. Server revocation is immediate, but an already read screen cannot be remotely unread and can be stale until recheck. There is no claim of encryption, screenshot prevention, native verification or service-role bypass resistance for privileged operators.

## Migration immutability
These SHA-256 values were captured **before Circles edits** and matched again afterward. 001–004 additionally match tracked history 76beca5; 005 has no committed local baseline and is verified against this pre-pass checksum.

| File | SHA-256 |
|---|---|
| 001_platform.sql | 82c8acda7a3f39ea01ca34ab3fa6cb121c20cf0506739110fcd6e72859203741 |
| 002_support.sql | 325ae57345d271f0fd13dc7553dfdb06d6acc24645e885897f89f0c9c5620a41 |
| 003_aggregate_feed.sql | fe36e81a4b43277c5475f4a17ae50039b16992dadb688f15ddd375635e183de3 |
| 004_qa_guards.sql | cd8b3d10be9f9917f84988792e03e306c5e6b904df8877d32bff18b80ab0d185 |
| 005_topic_discussions.sql | 251b3169fb4eb3a1ee5090a8c42ea28bbbf0534137a8462f760e9039e88a533c |

New file: supabase/migrations/006_circles.sql. Fresh bootstrap→001–006, populated 004→005→006 and 005→006 preserve legacy contribution fields. A deliberate division-by-zero before COMMIT followed by local ROLLBACK proves no partial Circle table/column is left; clean application then succeeds. The migration is intended to run once; no rerun/repair/reset or hosted application was attempted.

## Commands and outcomes
All npm commands run from the repository with C:\Program Files\nodejs on PATH.

| Exact command | Exit | Passed | Failed | Skipped | Warnings / result |
|---|---:|---:|---:|---:|---|
| npm.cmd ci (retry after stopping preview) | 0 | clean install, 363 added / 364 audited | 0 | N/A | 0 vulnerabilities; transitive glob deprecation and esbuild install-script notice |
| npm.cmd test (baseline) | 0 | 31 entries; 148 SQL assertions | 0 | 0 | no test warnings |
| npm.cmd run security (baseline) | 0 | 80 files + key/cache/lock guards | 0 | N/A | none |
| npm.cmd run build (baseline) | 0 | TypeScript + Vite + PWA | 0 | N/A | none |
| $env:BROWSER_CHANNEL='msedge'; npm.cmd run test:browser (baseline) | 0 | 20 flows | 0 | 0 | no unexpected page/console/network errors |
| npx.cmd tsc --noEmit | 0 | strict types | 0 | N/A | none; final build also rechecks types |
| npm.cmd test (final) | 0 | 34 entries; 307 SQL assertions (27 bootstrap + 61 platform + 60 expansion + 159 Circles) | 0 | 0 | no test warnings |
| npm.cmd run build (final) | 0 | TypeScript + Vite; 1661 modules; PWA 16 precache entries | 0 | N/A | no build warnings; CSS 16.00 kB; JS 361.36 kB / gzip 112.18 kB; static WEB retained |
| $env:BROWSER_CHANNEL='msedge'; npm.cmd run test:browser (final) | 0 | 22 top-level flows, including 9 nested Circle SDK checks | 0 | 0 | no unexpected page/console/network errors; no screenshots |
| npm.cmd run security (final) | 0 | 88 files + key/cache/lock guards | 0 | N/A | none |
| git diff --check | 0 | tracked diff whitespace | 0 | N/A | Git LF→CRLF notices for existing work; no whitespace errors |
| git diff --exit-code HEAD -- supabase/schema.sql supabase/migrations/001_platform.sql supabase/migrations/002_support.sql supabase/migrations/003_aggregate_feed.sql supabase/migrations/004_qa_guards.sql package-lock.json | 0 | immutable tracked history + lockfile | 0 | N/A | no changes |

No lint script exists; no always-passing substitute was added. No native build/sync was configured. Linked tests were not run and are BLOCKED, not counted as skipped/passed local tests. The browser fixture uses the actual UI/Auth/account boundary with synthetic SDK responses, kept strictly in tests and absent from the production JS. It is not a local production Circle backend or real hosted authorization test.

Earlier development failures and resolution:
- Initial npm.cmd ci exit 1: preview held esbuild.exe open (Windows EPERM). Stopped that preview; identical clean install completed.
- Default npm.cmd run test:browser exit 1 before tests: Playwright bundled Chromium unavailable. Used existing Edge via documented BROWSER_CHANNEL; baseline/final real browser suites execute.
- Initial local 006 parse failed at CASE expression; parenthesized predicates and verified full installation/upgrade/rollback chain.
- Initial controlled-browser report selector incorrectly matched an exact label containing select options; corrected the selector, without changing safety enforcement.
- Source links inherited inline hit areas below the requested 44px size; scoped Circle CSS now gives source links a 44px target, with an actual browser assertion for height/domain/safe rel.
- Review action unmounted/collapsed the details panel; preserved open state and verified promotion/demotion/removal/hide/restore.
- Development metadata serializer included caller's pending answer; removed it from broad reads and added the caller-only RPC with explicit no-answer metadata regression.
- The final failed-submission test initially used an exact label whose name contained changing textarea text; changed it to a stable textarea selector. No production behavior or security assertion was loosened.
- Extended fixture pagination totals required correction (24 pending rows, not 25), and a withdrawal test had to use the new own-application reader. Denial assertions/security guards were not loosened.

## Documentation reconciled
AGENTS.md: 001–005 immutability/006-only scope/no remote work. README.md: delivered Circle UI/RPCs/current QA and deployment sequence. IMPLEMENTATION_STATUS.md/CHANGELOG.md: local uncommitted implementation and external limits. ARCHITECTURE.md: module/read/cache responsibility. PRIVACY_DATA_FLOW.md: answers, retention, role/identity/cache boundaries. MODERATION.md: scoped operations and actual manual review. DECISIONS.md: conservative legacy-feed/reputation exclusion and immutable privacy. MIGRATIONS.md: local evidence and exact manual commands. EXPANSION_MATRIX.md/FUTURE_INTEGRATIONS.md: Circles no longer falsely future; transfer/billing/verification remain absent. EXPANSION_QA.md: marked historical. This file records current evidence; existing QA_REPORT.md remains historical, not overwritten by this pass. GIVING_CATALOG.md/NATIVE.md were not changed or newly certified.

## External gates and release decision
**PARTIAL — ready for manual testing with listed blockers.** No unresolved local build/authorization defect is demonstrated by the completed tests. This is a first implementation/hardening pass, not final production sign-off. Current live blockers: 005/006 have not been deployed by this session; linked history/Auth/API/RLS/configuration and simultaneous connections are unverified; production frontend is undeployed. Native/device/virtual-keyboard verification is unavailable; no native integration is claimed. Existing SMTP/moderation operational release gates remain.

Use the exact Windows inspection/dry-run/review/approval/push/history sequence in MIGRATIONS.md. Stop on unexpected 001–004, modified 005 or divergent history. Do not use a database reset or history repair. Never count a dry run as deployment.

## Five highest-risk manual flows (in priority order)
1. Private Circle: owner posts linked Scripture + reply; guest/nonmember/pending/declined/left/removed accounts try direct URLs, raw tables, thread IDs, aggregate/topic/saved/Scripture/devotional/testimony readers and public reputation. Only active members see content; no private count/identity/activity leaks.
2. Applications: B and C submit different sensitive answers; each reads only their own via the narrow RPC. Ordinary members cannot read either. Current owner/moderator reviews; approval/decline/withdrawal/closure erases stored text, and broad metadata/logs/cache never contain it.
3. Roles/removal: owner promotes B; B attempts to demote/remove owner, promote self/another member or moderate another Circle. Owner demotes/removes B; B immediately loses private read/post/vote/reaction rights and cannot self-restore. Concurrent approve/leave/remove/vote must remain atomic. Blocking a moderator must not defeat scoped legitimate review.
4. Account/cache: A writes private journal/prayer/preferences and reads a private Circle. Switch/sign out/expire session to B/guest in the same installed PWA; back/forward/offline/reload must not expose A's drafts/answers/content or persist private RPC responses. Return to A and verify recoverable local writing remains.
5. After 006: create ordinary Community/topic and Scripture/devotional posts, reply/vote/react/report/block/delete, then refresh/back/forward/theme-switch/offline Bible. Existing feeds/counts/prayer/support moderation remain functional; Circle content cannot escape through these legacy surfaces.
