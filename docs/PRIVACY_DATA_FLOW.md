# Private data and account boundaries

| Data | Stored / sent | Visibility |
|---|---|---|
| Journals, notes, prayers/answers, struggles, preferences, reading/progress | Local v3 profile only | Guest or matching signed-in account UI; never automatically uploaded |
| Followed topics, saved discussion links, paths/challenge progress | Local profile | Private; following never implies server membership |
| Community membership | community_memberships via explicit join/leave RPC | Matching owner only; no public member directory |
| Public post/reply/source | Explicit public composer RPC | Constrained visible/unblocked readers; staff retain accountable author ownership |
| Votes | Server-owned community_votes | Counts/current user's own vote only; raw voter rows inaccessible to app roles |
| Reports, blocks, moderation notes | Existing private tables/RPCs | Existing owner/operator rules; not public |
| Testimony relationship | Returned public UUID stored on private prayer | Local only; private prayer ID/body never sent as a relationship |
| Theme hint | hfg-appearance | Nonsensitive shared-device appearance hint |

Guest uses hfg-daily-walk:v1/v2/v3. Accounts use hfg-private:<account-id>:<key>. Auth readiness gates rendering; changing account remounts the provider and drafts. Stale Terms responses cannot authorize a later account; token refresh rechecks acceptance. Signing in never automatically merges/adopts guest state. Existing pre-expansion local records have no trustworthy account ownership and remain in the guest profile; signing out returns to that profile.

Local storage and exported backups are **unencrypted**, browser/device-specific and inspectable through developer tools or another same-origin script. This is account separation in the application, not a device lock or encrypted storage. Shared-browser tabs in the same profile are not synchronized or transactionally coordinated; concurrent edits can overwrite a later save. Do not clear browser storage without a private backup. No cross-device restore, encrypted sync or account-deletion service is configured.

Migration reads v1 through the retained v2 transformation, normalizes v2 into v3, and preserves source bytes. Current corrupt/unknown v3 blocks writes. Normalization preserves original data in recovery snapshots; full/unavailable storage does not claim a save. Explicit recovery after export first retains current v3, then uses the latest readable retained v2, otherwise available v1 (or fresh state). Recovery keys do not replace earlier snapshots. Backup enumeration is scoped; the guest export cannot enumerate account data.

Recommendations take only explicit topic IDs/following. They never inspect journal/prayer bodies, send preferences to analytics or join a community. Sensitive choices do not influence commerce or public reputation. Serious-topic guidance precedes encouragement; no unverified local emergency numbers are invented. Source links do not fetch previews, so no preview SSRF flow exists. No dynamic/private/API/payment response is precached.

Public sources are unverified user attachments, rendered as text. HTTPS DNS links reject credentials, ports, IP/private host literals, control characters and backslashes. Destination domains are visible; external tabs use noopener/noreferrer. A DNS hostname can still resolve privately or host misinformation; no server/client preview fetch follows it and moderators must evaluate source claims. Sharing always requires a separate explicit Publish action.


## Circle boundaries
Only public Circle metadata/discussions are available to guests. Signed-in users may discover a private Circle's name, description, topic, privacy and question; nonmembers receive no exact count, members, applicants or discussion content. Active current members can read private discussions; pending/declined/left/removed accounts cannot. Broad discovery/detail metadata never includes application answers, including the caller's own answer. read_own_circle_application reads only the caller's record. Current owner/moderators use read_circle_members for pending answers; ordinary active members cannot.

Answers (max 1000 characters, plain text) remain only while pending, to support a review decision. They are immediately erased on approval, decline, withdrawal, removal or closure. Pending applicants can withdraw at any time; there is no time-based automatic purge job or indefinite post-decision retention claim. Closing preserves membership/post records but makes the Circle unavailable; hard owner-account deletion cascades its Circle and posts, and applicant account deletion cascades membership. No account-deletion service or ownership succession exists in v1. Operators must decide retention/backup requirements before enabling such a service.

Private answers and group content are held in transient React memory only, never localStorage, URLs, analytics, notifications, logs or shared PWA caches. Application RPCs must not be logged by external observability tooling. Copy links contain only immutable Circle slug and thread UUID; receiving a link never grants private access. Reports keep reporter UUID/details private to the reporter/platform operators; scoped Circle reviewers see only category, target contribution, state and display snapshot. Blocks/mutes hide normal discussion authors/children without preventing legitimate scoped application/report review.
