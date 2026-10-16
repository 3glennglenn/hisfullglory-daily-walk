# Manual moderation and database operations

Operator access is Supabase SQL/Table Editor with the project owner role; there is no browser admin role, public user directory or staff key in the app. Confirm the support mailbox before release and assign a human review owner. Client text checks are not complete moderation. No automatic review/approval service is claimed.

## Queue, reports and blocks

`community_reports` stores reporter, content kind/ID, category, optional note, status and timestamps. Only the reporter can read their own rows through application credentials. Ordinary clients cannot change queue status, timestamps or reporter identity. Operators review open reports privately and avoid exposing private notes in responses.

```sql
select id,target_kind,target_id,category,note,created_at
from public.community_reports where status='open' order by created_at;
update public.community_reports set status='reviewing' where id='REPORT_UUID';
-- After reviewing evidence and recording the action:
update public.community_reports set status='resolved',resolved_at=clock_timestamp()
where id='REPORT_UUID';
```

Categories preserve the original list and add threats, sexual exploitation, direct payment solicitation, self-harm encouragement, abuse, misinformation, impersonation, misleading credentials and misleading sources. Fraudulent expertise claims fall under misleading credentials; reputation never establishes expertise. Content/author reporting resolves ownership from content IDs privately. Anonymous authors remain identifiable to operators, not ordinary readers. Blocks/mutes apply to the actor's reads across original chat/wall, aggregate feed and support listings; they are not a claim that someone cannot see another person's public content. Settings allows removal. Never disclose the block list or reporting identity to the reported user.

## Held for review

Written in migration `013_report_hold.sql` (Phase 1, GATE-06). It is tested on PGlite
(`tests/report-hold-schema.test.mjs`). Until the founder approves it and it is applied to the
hosted project, no hold happens in production.

**The rule.** When two different people, neither of them the author, have reported the same
item, the item is hidden from every reader until a person has reviewed it. Reports count
while they are `open` or `reviewing`, once per person. The author's own report does not
count, and the same person reporting twice is still one person. A hold covers community
posts (including Circle posts, replies and stories), chat messages, prayer requests and
support requests. It is the database that holds, so every version of the app is treated alike.

- Posts and support requests go to `moderation_state = 'pending_review'`.
- Chat messages and prayer requests go to `is_hidden = true`, with an audit row whose actor
  is `system`. The audit row of a held post or support request is written by the existing
  trigger.
- A held item is gone from every list, feed, thread and reply count. There is no
  placeholder and no count. A third person can no longer report it ("Visible target
  required").
- A person who is not a member of a private Circle cannot report its posts, so cannot hold
  them or learn that they exist.

**Check for held items (numbers only).** Run this in the SQL editor to see whether anything is
waiting. It returns counts and nothing else.

```sql
select 'post' as kind, count(*) as held from public.community_posts
 where moderation_state='pending_review' and deleted_at is null
union all select 'chat', count(*) from public.chat_messages where is_hidden and deleted_at is null
union all select 'prayer', count(*) from public.prayer_posts where is_hidden and deleted_at is null
union all select 'support', count(*) from public.support_requests
 where moderation_state='pending_review' and status in('approved','fundraising') and deleted_at is null;
```

Chat and prayer counts also include items an operator hid by hand, because both use the same
flag. A support request waiting for its first approval is not counted: it is decided with
`review_support_request`.

**Read one item and its reports.** Replace `ITEM_UUID` and the kind. The reports are private;
do not copy a reason, a note or a reporter into email, chat, push, analytics or a URL.

```sql
select id,reporter_id,category,note,status,created_at from public.community_reports
 where target_kind='post' and target_id='ITEM_UUID' order by created_at;
select id,body,moderation_state from public.community_posts where id='ITEM_UUID';
-- chat: public.chat_messages, prayer: public.prayer_posts, support: public.support_requests
select created_at,actor,old_state,new_state,note from public.moderation_audit
 where target_id='ITEM_UUID' order by created_at;
```

**Decide.** `public.review_held_content(item_kind, item_id, decision, review_note)` is the only
way to release a hold. It cannot be run from the app, by a guest or by a signed-in account;
only the database owner in the SQL editor can. `item_kind` is `post` (also Circle posts),
`chat`, `prayer` or `support`. Write your name, the date and the reason in the note, because
the audit actor is the shared database role.

```sql
-- Nothing wrong with it: visible again.
select public.review_held_content('post','ITEM_UUID','restore','Reviewer NAME; DATE; reason');
-- Not allowed, but keep the record: stays hidden.
select public.review_held_content('post','ITEM_UUID','keep_hidden','Reviewer NAME; DATE; reason');
-- Concluded removal: hidden for good (a chat or prayer item also gets deleted_at).
select public.review_held_content('post','ITEM_UUID','remove','Reviewer NAME; DATE; reason');
```

Each decision resolves that item's `open` and `reviewing` reports in the same transaction.
That matters: a restored item has no open reports left, so the next single report does not
hold it again. "Held item not found" means the item is not held (already decided, deleted,
or a support request that is not approved or fundraising). A Circle owner or moderator can also
restore a held Circle post with `moderate_circle_post`, which resolves its reports too;
Circle moderators still see the reports of a held post in their own queue, without any
reporter identity.

**Limits to know.**

- Two accounts controlled by one person can still hold a post. That is why every hold is
  reviewed by a person, and why the author's own report does not count.
- One account may file 30 reports an hour; the 31st is refused with "Report limit reached".
  The number is a design choice, not a measured fact, and can be changed in the migration
  that follows.
- An open chat window may keep showing a held message until its next refresh; the original
  chat reconciles periodically.
- Two reports that arrive at the same moment still hold the item, because the trigger takes a
  lock per item before it counts. PGlite has one connection and cannot prove that; the
  hosted project is where it would be seen.
- Reports about Walk With Me reflections are accepted by the table (`walk_reflection`) but
  the report function gets its branch for them when that table exists (Phase 4).
- Deleting a reporter's account removes their reports but leaves a held item held.
- No report reason, note or reporter goes into email, push, analytics or URLs.

## Contributions and original community

New `community_posts.moderation_state`: visible, pending_review, hidden, removed. Only visible undeleted rows appear in public feeds. State changes automatically create private audit records. Use pending_review while investigating, hidden to stop display, removed for a concluded removal. Private evidence/rationale belongs in the audit note, not in public post text.

```sql
update public.community_posts set moderation_state='hidden'
where id='POST_UUID';
insert into public.moderation_audit(target_kind,target_id,old_state,new_state,note)
values('post','POST_UUID',null,'hidden','Reviewer name / evidence / action reason');
```

Original `chat_messages` and `prayer_posts` preserve `is_hidden` and `deleted_at` rather than replacing existing data. Moderation reconciles periodically in their original UI and on feed reload. Write an explicit audit note for legacy operations:

```sql
update public.chat_messages set is_hidden=true where id='MESSAGE_UUID';
-- Or prayer_posts for a wall contribution. Do not confuse table types.
insert into public.moderation_audit(target_kind,target_id,new_state,note)
values('chat','MESSAGE_UUID','hidden','Reviewer name / reason');
```

Do not publish private profile rows, emails or reactor identities. Ordinary users may delete only their own contributions. Public prayer updates have a required answer reflection when marking Answered and are explicitly public; private prayer answers never upload automatically. New post deletion is soft; historical moderation/audit information remains operator-only. Account deletion cascades owned records; decide lawful audit retention before a public release and document it in the published privacy policy.

## Personal support review

1. Inspect `under_review` and private reviewer notes. Verify the exact public provider URL and active campaign manually; allowlisting a host alone is insufficient.
2. Check the author is authorized by the actual beneficiary, provider identity/transfer eligibility, country, purpose and expiry. Check for duplicates, misleading claims and direct payment instructions. Do not collect IDs, bank numbers or health documents in this frontend.
3. Check dignity and privacy; remove sensitive public details by rejecting and requesting a corrected draft rather than silently approving it.
4. Record reviewer identity, check date, evidence source, findings and decision in a private review note. Approval is manual, never triggered by a client field.

```sql
select id,title,story,fundraiser_url,beneficiary_relationship,country,
       expires_at,status from public.support_requests
where status='under_review' and deleted_at is null order by created_at;

-- Replace IDs; write a concrete verification record, not a generic approval.
select public.review_support_request('REQUEST_UUID','approved',
 'Reviewer NAME; DATE; verified external campaign and beneficiary authorization; evidence REFERENCE');
select public.review_support_request('REQUEST_UUID','fundraising',
 'Reviewer NAME; provider campaign still active; checked DATE');
-- Reject, close or mark funded only with appropriate verified evidence:
select public.review_support_request('REQUEST_UUID','rejected',
 'Reviewer NAME; concrete reason; corrected submission required');
```

Supported states: draft → under_review → approved → fundraising → funded/closed; rejected drafts can be revised and resubmitted. Review function enforces approval/fundraising/funded transitions, nonempty reasons and unexpired approval. Only approved/fundraising and visible unexpired records are public. Funded does not imply a checked total; staff must verify the external outcome and leave a note. Authors cannot edit approved claims; they can close or delete their own request. Under-review content is private. Staff can hide without changing progress/target:

```sql
update public.support_requests set moderation_state='hidden' where id='REQUEST_UUID';
insert into public.support_review_notes(request_id,note)
values('REQUEST_UUID','Reviewer NAME; reason and evidence for hiding');
```

Audit actor identifies the database role; put human reviewer attribution in notes because SQL Editor access often shares that role. No ordinary app role can execute the review function or read reviewer/audit notes. Expires_at automatically excludes listings without needing a cron job. Reactivate an expired campaign only after a fresh reviewed submission. Do not promise legitimacy, payouts, refunds or tax treatment; the external provider owns those processes.

## Migration and rollback

See MIGRATIONS.md. Final read-only inspection confirmed hosted history through 004 and exactly pending 005/006; no migration was deployed. The dry run may include only 006, plus 005 if genuinely still undeployed, after linked history review and later explicit approval. Never manually rerun bootstrap/001–005 as the expansion deployment. Local PGlite tests simulate JWT claims and do not certify real Auth/API/Realtime or multi-connection races. Preserve stricter giving guards from 004.

Topic replies use the existing moderation state and reports. Hidden/deleted/blocked parents make descendants unavailable through thread readers, reactions and votes. Account hard deletion cascades dependent replies; discuss retention obligations before enabling an account-deletion service. Ordinary clients cannot read voter identities, write counters or run the internal reputation function. Anonymous contributions do not expose an author's reputation. Review source titles/destinations manually; user sources are not verified scholarship. There is no automated abuse classifier, source preview or expert badge.

Rollback is forward-safe: first disable community/support configuration in a new frontend build, and revoke RPC access or hide visible content if needed. Keep the added tables and preserved records for recovery. Do not DROP tables or run only the old schema to undo an authorization migration. Any structural reverse migration needs a reviewed backup/restore plan. Operators should use the previous commit for a frontend rollback while retaining server terms/security restrictions; old clients may then show a posting error until updated.


## Circle operations
Circle owners/moderators may approve/decline pending applications and moderate contributions only in their active Circle. Only owners promote/demote moderators. Moderators can remove ordinary active members; owners may also remove moderators. Neither can change their own role or the owner's protected membership. There is no role restoration or ownership transfer in v1; owners can close a Circle, not leave it. Platform operators still handle broader abuse, reporter details and appeals using the existing private reports/audit records and documented response procedure.

The UI accepts current Community Guidelines before joining/creating/posting. Backend Terms/profile/cooldown enforcement is shared with Community. Report categories now include vote manipulation/coordinated abuse; reports do not alter score or auto-hide content. Scoped reviewers can hide/remove/keep a reported post visible; resolving its reports is server-controlled and auditable. A block cannot grant or revoke a moderator role, hide a pending application from its authorized reviewer, or defeat scoped report review. Application answers are erased after decision, and report notes/identities never enter Circle queues. These workflows are locally tested; live operator coverage and genuine hosted Auth remain release gates.

## Word filter

Added on 2026-10-14 (migration `008_word_filter.sql`, approved by the founder that day and
applied to the hosted project; history name word_filter). The App Store asks apps with
user content for a way to filter objectionable material before it is posted (guideline 1.2).

A trigger refuses a post, reply, prayer update, chat message, public prayer, display name,
Circle text, Circle application or support request that contains a term from
`public.blocked_terms`. Terms match whole words only and ignore case, so a word inside
another word is never caught. The app shows "This contains language that is not allowed
in the community. Please rephrase it." (`src/social/blockedLanguage.ts`).

Deliberately not on the list: words people read in older Bible translations (whore, ass,
piss, bastard, cock, hell, damn) and words survivors need to name what happened to them
(rape, abuse). Nobody outside the database can read the list. To add a term, an operator
runs `insert into public.blocked_terms(term) values ('...') on conflict do nothing;`.
`tests/word-filter-schema.test.mjs` checks what is refused and what is allowed.
