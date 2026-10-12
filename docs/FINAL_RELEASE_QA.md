# Final independent release QA — 2026-10-08

**PARTIAL — LOCAL RELEASE CANDIDATE WITH EXTERNAL BLOCKERS.** No demonstrated unresolved P0/P1 defect was found. Three reproducible P2 Circle client defects were repaired. Local evidence is not hosted authorization certification; no commit, push or deployment occurred.

## Baseline and provenance
Starting/ending main HEAD: 76beca5d957df6e2a61492caff7501628740ce17. Initial dirty tree: 28 tracked modifications (407 additions/122 deletions) and 40 individual untracked files, including nine pre-existing Supabase cache metadata files. Before product edits, .tooling/final-qa-baseline captured HEAD, status, diff/stat/name-status, binary patch, complete untracked inventory, scripts and SHA-256 manifests. It holds byte-for-byte copies of 63 relevant modified/untracked files and migrations; credentials/cache contents were not copied or printed. This ignored temporary evidence is outside the application bundle. No reset/clean/checkout/restore/stash was used. All previous source/test/documentation files remain.

Pre-Circles original in-session checksum record (circleBaseline) survives independently of the prior report and is copied to the temporary pre-circles-checksums.json. 001–005 match it; 001–004 plus bootstrap/lockfile also have no Git diff against HEAD. 005 has no committed Git baseline. Previous starting-file snapshots identify earlier expansion versus Circles changes; final hashes/change inventory distinguish this QA pass. The dirty tree is intentionally retained, not described as a clean committed release.

## Independently reproduced previous claims
Original unchanged baseline: clean install exit 0 (363 added/364 audited, zero reported vulnerabilities); 34 test entries, zero failures/skips; 307 SQL checks = 27 bootstrap + 61 platform + 60 expansion + 159 Circles; 88 security-scanned files; build/PWA pass; 22 browser flows including nine nested Circles SDK checks. Original scripts did not capture Circle fixture console errors/warnings; the prior broad clean-console claim was incomplete. Extra tests reproduced the defects below.

Discovery/create/edit/close/public join/private application/approve/decline/withdraw/reapply/leave/removal/owner/moderator roles/discussions/replies/votes/reactions/reports/blocks/scoped moderation passed actual migration execution in PGlite with separate users and simulated JWT claims. Controlled browser tests execute production React/Auth/account components and production circleRpc data access, replacing only Supabase SDK responses. Their fixture intentionally does not implement complete database authorization: they prove UI behavior, not hosted RLS. SQL tests prove the separate database boundary. Safe metadata/application serializers, raw access denial, protected owner/self roles, legacy-reader exclusion, migration upgrades and failed-transaction rollback independently pass.

## Reproduced defects and repairs
| Severity/status | Root cause and repair | Regression |
|---|---|---|
| P2 / FAIL → FIXED | 30-second revalidation invalidated a valid multi-RPC load before it finished. Circles.tsx now skips periodic revalidation while loading/mutating; individual requests retain 12-second deadlines. | Four sequential nine-second responses complete instead of repeatedly restarting; failed baseline assertion reproduced. |
| P2 / FAIL → FIXED | circleRpc accepted arbitrary caller result casts. A malformed successful discussion response crashed rendering (blank synthetic fixture; production global recovery boundary). circleContracts.ts now maps RPC result types and validates output before render; no arbitrary result casts remain in Circle data access. | Malformed records give a recoverable unavailable/Refresh state; pure contract negatives and six actual SQL serializer checks. |
| P2 / FAIL → FIXED | Slug/path HTML pattern classes contained an unescaped literal hyphen, invalid under browser Unicode v mode. Native validation was ignored and Edge warned. Both classes are corrected. | Native patternMismatch/checkValidity rejects invalid slugs/paths and accepts valid Scripture/devotional paths; all controlled fixture/main console warnings/errors asserted absent. |

No SQL correction or new dependency was required. Report cursor regression initially expected a previously resolved-visible report to remain in the open queue; corrected the fixture expectation to the 23 newly open reports, without loosening production filters. The added HTML/Unicode rendering regression also exposed unsafe inline bootstrap serialization in the synthetic reload fixture; escaping `<` in that fixture preserves script-looking plain text and the real application remained unaffected. A retained-draft test locator initially included changing textarea text; corrected the locator before establishing the slow-load failure.

## Database evidence and test quality
- PASS — static code inspection: 005/006 references, exact RPC signatures, grants, safe search_path, immutable identity, constraints, indexes, explicit serializers, conservative legacy/global-reputation exclusion, no seeds/private logs/new payment behavior.
- PASS — PGlite: actual SQL/grants/RLS/SECURITY DEFINER with simulated JWT subjects and distinct identities, positive/negative access, transitions/retention, pagination and upgrades/rollback. Final 183 Circle SQL checks, 331 total SQL checks.
- PASS — controlled browser: production UI/Auth/account boundary and SDK data access, synthetic server records; not a real Supabase backend.
- BLOCKED — disposable PostgreSQL/local Supabase: docker/psql not available; no local Supabase config/disposable stack. No large tooling was installed and no reset was run.
- NOT RUN — hosted production Auth/API/RLS, actual expired JWT enforcement and multi-connection concurrency. Migration history alone does not prove live schema or policies.
- PASS — linked Supabase read-only check: remote versions 001–004 recorded; 005/006 not recorded. Dry run lists exactly 005_topic_discussions.sql then 006_circles.sql, with no seeds/role changes. No real push.

Circle denial helper now verifies authorization/constraint SQLSTATE rather than accepting parser/missing-object errors. On two disposable copies only, making private Circle content readable caused the guest-private-read assertion to fail, and allowing ordinary members to review caused a missing-expected-rejection failure. Both mutation runs exit 1 for the intended security assertions. Product migration hashes remain unchanged; normal full suite rerun passes. No mutation remains in the product tree. Genuine parallel-session approve/withdraw, remove/publish, role changes or voting were NOT RUN. Locks/uniqueness are inspected, not certified as concurrency results.

## Access and privacy result
| Context | Public read | Private content | Interaction | Review/roles |
|---|---|---|---|---|
| anon | Allowed | Denied; no private metadata | Denied | Denied |
| unrelated authenticated | Allowed | Limited discovery only | Join/apply; no publish/vote before activation | Denied |
| pending | Allowed | Own pending answer/status only | Withdraw; no private publication | Denied |
| declined/withdrawn/left | Allowed | Denied; answer erased | Reapply/rejoin after cooldown where documented | Denied |
| removed | Allowed public content only | Denied | No self-restoration or Circle interaction | Denied |
| active member | Allowed | Allowed for own Circle | Scoped publish/reply/vote/react/report/block/delete-own | Cannot enumerate members/applications or set roles |
| moderator | Allowed | Own Circle only | Scoped interaction | Applications, reports, remove ordinary members; no owner/self/other-moderator escalation |
| owner | Allowed | Own Circle only | Scoped interaction, edit safe details, terminal closure | Approve/decline/promote/demote/remove others; cannot leave/change own ownership |

All raw Circle/member/post/vote/audit access denied to ordinary app roles. Exact member count only for current active roles; no directory/auth UUIDs in broad readers. Application answers: max 1000, plain text, caller-only own reader/current scoped reviewers only, absent from metadata/feeds/search/recommendations/profiles/URLs/logs/analytics/cache. Approval/decline/withdraw/removal/closure erase text; unresolved pending answers remain for review and have no time-based purge. Hard account deletion cascades dependents; no frontend deletion/succession service exists. Reporter identity/note are excluded from scoped review queues. Anonymous display retains internal accountable ownership, without public author UUID/reputation disclosure.

Legacy aggregate/community/topic/thread/saved/Scripture/devotional/testimony readers exclude all Circle contributions; public Circle posts are intentionally visible only on dedicated routes. Public profile/social-search/activity endpoints reading Circles do not exist. Private topic recommendations consume explicit IDs, not private bodies. Guest/A/B state provider remounts and scoped exports preserve local writing without adoption/deletion; Circle data remains transient, cleared on account/offline/background/block changes. Static precache only, no dynamic RPC/cache queue/Realtime Circle publication. Built worker has cleanupOutdatedCaches; synthetic SDK markers are absent from dist. Previously viewed content can remain until the next idle refresh; no promise that remote revocation can erase already read information.

## State, reputation and regression
PASS (PGlite): public none→active→left→active; private none→pending→active/declined/left and declined/left→pending; active→removed; owner-controlled member↔moderator. Repeat join/apply is idempotent; repeat review after decision is rejected, not replayed. Owner leave/self-role changes, self approval, member escalation, moderator owner/peer-role changes, cross-Circle changes, direct forged writes and removed self-restoration are denied. Closed groups are terminal, deny reads/join/apply/approve/edit/publish/reply/vote/react and clear pending answers; no privacy conversion/reopen exists.

PASS (PGlite): unique votes, desired-state retries, removal, self-vote denial, hidden/blocked handling, forged rows/counts denied, distinct supporter union prevents vote+helped double counting. Both public/private Circle activity is excluded from global reputation. Role ≠ reputation ≠ verification; popularity ≠ Biblical accuracy; lived experience ≠ expertise; trusted verification remains FUTURE pending independent human review. Concurrency remains NOT RUN.

PASS (executed pure/PGlite/controlled browser, as applicable): full WEB/navigation/search/bookmarks/highlights/saved/read history; unavailable context honesty/Scripture Community; 15 devotionals/progress/discussions; Community/topic/threads/reactions/reports/blocks/Terms; private/public prayer and explicit testimony; Journal/Walk/My Walk/private preferences; Light/Dark/System/OS changes; PWA/static Bible/local journal offline; giving destination confirmation, disabled payments and support authorization. Real checkout campaign freshness/payment completion was NOT RUN or newly certified; no donation was made.

PASS (controlled browser): Circle long names/descriptions at 320/360/390/430/768/1280px in both themes, no horizontal overflow, named inputs/buttons/status/vote pressed state, tested 44px controls/source links, native Cancel focus/Escape/focus restoration, error/offline/retry states. Safe areas/reduced motion/theme tokens inspected. Full screen-reader/contrast certification, physical devices and virtual keyboard remain NOT RUN. No native wrapper/toolchain is configured.

## Migration integrity
| File | SHA-256 (unchanged) |
|---|---|
| 005_topic_discussions.sql | 251b3169fb4eb3a1ee5090a8c42ea28bbbf0534137a8462f760e9039e88a533c |
| 006_circles.sql | b024954b54728b583b65e04300ff5e69ccb07f7fee6fa54ebab371ed244fb72f |
| 001_platform.sql | 82c8acda7a3f39ea01ca34ab3fa6cb121c20cf0506739110fcd6e72859203741 |
| 002_support.sql | 325ae57345d271f0fd13dc7553dfdb06d6acc24645e885897f89f0c9c5620a41 |
| 003_aggregate_feed.sql | fe36e81a4b43277c5475f4a17ae50039b16992dadb688f15ddd375635e183de3 |
| 004_qa_guards.sql | cd8b3d10be9f9917f84988792e03e306c5e6b904df8877d32bff18b80ab0d185 |

001–004: Git history plus original/current checksum. 005: original pre-Circles checksum plus final-pass baseline; no historical committed 005 exists. 006: final-pass byte backup/checksum unchanged. PGlite fresh bootstrap→001–006, populated 004→005→006 and 005→006, deliberate pre-COMMIT failure/ROLLBACK/no partial table/column and clean retry all PASS. No hosted migration execution. No 007 needed.

## Final command record
Windows PowerShell, Node 24.21.0, existing lockfile/dependencies; logs in ignored baseline directory.
| Command | Exit | Result | Duration |
|---|---:|---|---:|
| npm.cmd ci | 0 | 363 added/364 audited; 0 vulnerabilities; glob deprecation + esbuild script notice | 42.36s |
| npx.cmd tsc --noEmit | 0 | Strict typecheck PASS | 6.78s |
| npm.cmd test | 0 | 35 entries PASS, 0 fail/skip; 331 SQL checks | 21.97s |
| npm.cmd run security | 0 | 90-file credential/key/cache/lock guards PASS | 0.93s |
| npm.cmd run build | 0 | TS/Vite/PWA PASS; 1662 modules; JS361.42kB/gzip112.19; CSS16.00kB;16precaches | 14.68s |
| $env:BROWSER_CHANNEL='msedge'; npm.cmd run test:browser | 0 | 22 top-level flows +12 nested Circles checks;0 fail/skip; main/Auth/topic/Circle console errors/warnings absent | 46.12s |
| npx.cmd supabase migration list --linked | 0 | History 001–004 remote,005/006 pending | 3.45s |
| npx.cmd supabase db push --dry-run --linked | 0 | Exactly pending005/006; no seeds/roles; NOT deployment | 3.26s |
| git diff --check | 0 | No whitespace errors; existing LF→CRLF notices | not timed |

No lint script exists (NOT APPLICABLE). Local PostgreSQL/Supabase/native checks BLOCKED by absent tooling. Earlier focused reproduction failures and expected mutation failures are retained separately, not counted as passing normal runs. Final verification logs/manifests are authoritative if durations/file totals change during documentation reconciliation.

## Manual deployment and remaining gates
Migrations005/006 and frontend are ready for manual review, not production certification. Genuine Auth/API/RLS/schema drift/concurrency, SMTP/Realtime/manual moderator coverage and device/PWA browser matrix remain external gates before connected public release. Native/AI/licensed scholarship/billing/contributor verification are outside delivered v1 and disabled; do not activate merely to complete QA. Known local limitations: plaintext device storage, same-profile multi-tab last-write behavior, pending-answer review retention, and already-read UI staleness until revalidation; these are explicitly documented, not new P0/P1 findings.

From the repository, inspect again:
~~~powershell
npx.cmd supabase migration list --linked
npx.cmd supabase db push --dry-run --linked
~~~
Expected pending005_topic_discussions.sql then006_circles.sql. Stop if001–004 reappear, history/project differs, migration hashes differ, or any unexpected migration/seed/role appears. Never repair/reset. Dry run is not deployment. Only AFTER the user's manual review and approval:
~~~powershell
npx.cmd supabase db push --linked
npx.cmd supabase migration list --linked
~~~
These real-push commands were not executed. After deployment, verify005/006 recorded and use genuine A/B accounts (plus signed-out browser) for public/private read rights, separate pending answers/erasure, protected owner/moderator operations, immediate server removal denial, legacy exclusion, real voting/report/block, same-browser account/offline isolation and existing Bible/Community/Scripture/devotional regression.

Five highest-risk manual tests: (1) guessed private Circle/post IDs plus every legacy reader; (2) answer isolation and review/withdraw/closure erasure; (3) owner/moderator/member escalation/removal including races; (4) A→B→guest/back/forward/offline/cache and return-to-A writing; (5) Community/Scripture/devotional and installed offline Bible after005/006.

Nothing committed/pushed/deployed. Linked history/dry run verified read-only; hosted production authorization and production frontend remain unverified/undeployed by this session. Final pass complete; final logs, manifest comparison and documentation security scan pass.

## Exact final-pass file inventory
Changed existing pre-final files: AGENTS.md, CHANGELOG.md, IMPLEMENTATION_STATUS.md, README.md, docs/ARCHITECTURE.md, docs/DECISIONS.md, docs/MODERATION.md, scripts/browser-check.mjs, docs/CIRCLES_QA.md, docs/EXPANSION_MATRIX.md, docs/MIGRATIONS.md, src/social/Circles.tsx, src/social/circlesApi.ts, tests/circles-schema.test.mjs, tests/circles.browser.mjs, tests/circles.test.ts, tests/auth-boundary.browser.mjs, tests/topic-hub.browser.mjs.
New files: docs/FINAL_RELEASE_QA.md, src/social/circleContracts.ts.
Unchanged migrations:001–006. Final source/test changes are confined to Circle loading/contracts/validation and QA coverage; documentation reconciles read-only linked evidence and historical claims. Final-state manifest is in the ignored baseline directory; no prior file was deleted.
