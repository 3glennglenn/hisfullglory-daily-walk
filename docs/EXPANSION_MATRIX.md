# Third-stage scope and evidence

Baseline main / 76beca5d957df6e2a61492caff7501628740ce17; pre-existing untracked supabase/.temp/ preserved. Local migration history 001–004 and v2 persistence found. Final read-only linked history confirms 001–004 recorded; dry run shows only pending 005/006. Hosted Auth/API/RLS remains unverified. New state v3 and local migration 005 are not committed, pushed or deployed.

| Capability | Current classification / evidence |
|---|---|
| Original Bible, walks, journals, prayers, 15 devotionals, giving/shop, legacy chat/wall | Reused/preserved; baseline + final regression suites |
| Topic graph, private preferences, local recommendations, topic/Scripture/devotional links | Implemented; stable 26 IDs/aliases, local/UI tests |
| Account boundaries and recoverable v1→v2→v3 | Implemented; state tests plus actual React boundary with controlled SDK; genuine Auth pending |
| Topic hub/following/saved links/testimonies/feed | Implemented; guest browser flows; connected composition needs external QA |
| Memberships, threads/one-level replies, sources, votes/ranking/reputation | Implemented RPC/UI; local SQL roles/fixtures; hosted 005 and real Auth/API/concurrency unverified |
| Context hierarchy / Why we say this | Implemented fallback/source model; corpus still three original checked chapter observations |
| Grounded AI | Provider/grounding architecture prepared; no runtime, backend integration pending |
| Private prayer→answer→testimony relationship | Implemented local real returned-public-ID linkage; no private-ID upload; live publication pending |
| My Walk | Implemented private real-state overview; no fake milestones/reputation maturity |
| Paths/challenge | Two three-step editorial paths + one private seven-practice challenge implemented/tested through Grow; dedicated links/community check-ins future |
| Circles v1 | Implemented UI/RPCs; local SQL/controlled SDK evidence in CIRCLES_QA.md; 006 undeployed and linked Auth unverified |
| Helpers, Walk With Me, Prayer Chain | Future slices; no live UI/server flows claimed |
| External/community insights | Disabled; future verified-source/editorial pipeline |
| Premium/Church/Creator/contributor verification | Disabled provider/type contracts prepared; backend/billing/reviewer integrations absent |
| Journey commerce/acquisition | Existing safe shop/deep links preserved; new targeting/publishing/dedicated destinations future |
| Licensed content, native push/builds | Blocked by rights/providers/tooling; no fabricated availability |

Read EXPANSION_QA.md, MIGRATIONS.md and PRIVACY_DATA_FLOW.md for current evidence and manual release gates. This matrix describes delivered boundaries, not a completion claim for the full broader roadmap.
