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

Categories: harassment, hate, sexual content, scam, spam, dangerous advice, private information, other. Content/author reporting resolves ownership from content IDs privately. Anonymous authors remain identifiable to operators, not ordinary readers. Blocks/mutes apply to the actor's reads across original chat/wall, aggregate feed and support listings; they are not a claim that someone cannot see another person's public content. Settings allows removal. Never disclose the block list or reporting identity to the reported user.

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

Back up the hosted database before changes. Apply schema, 001, 002, 003 in order. Reruns are safe; existing v1 records are retained. Local tests apply migrations twice and exercise real guest/two-user privileges. This does not prove deployed auth, SMTP or Realtime configuration.

Rollback is forward-safe: first disable community/support configuration in a new frontend build, and revoke RPC access or hide visible content if needed. Keep the added tables and preserved records for recovery. Do not DROP tables or run only the old schema to undo an authorization migration. Any structural reverse migration needs a reviewed backup/restore plan. Operators should use the previous commit for a frontend rollback while retaining server terms/security restrictions; old clients may then show a posting error until updated.
