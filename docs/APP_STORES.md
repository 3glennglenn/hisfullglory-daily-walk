# App Store and Google Play

The founder decided on 2026-10-14 to bring the app to the App Store and Google Play. This
file records the route, what the stores require and where each piece stands.

## Accounts

Advised on 2026-10-14 and accepted by the founder: both developer accounts in his own name,
as a person (Google: personal; Apple: individual). His business currently runs through
another person's BV under a trade name, and Apple does not accept trade names; an
organization account would show the BV as the seller and bind it to the store contracts.
Both stores allow a later move to his own company: Google converts the account in place,
Apple converts the membership (which can take weeks) or transfers the app.

Consequences: on the App Store his own name is shown as the seller, and Google requires a
closed test with at least 12 testers, opted in for 14 days in a row, before the app may go
to production (personal accounts created after 2023-11-13). The founder buys the accounts
himself (Google 25 USD once, Apple 99 USD a year) and has an Android phone and an iPhone.

## Route

The web app at app.hisfullglory.com goes into a native shell (Capacitor) for Android and
iOS, so there is one app. The iOS build needs a Mac; a cloud build service with Macs will
do that, chosen on cost before anything is bought. Apple refuses apps that are only a
website in a wrapper (guideline 4.2), so the shell adds things a website cannot do, starting
with a daily reminder as a notification.

## What the stores require, and status

| Requirement | Status |
| --- | --- |
| Account deletion in the app (Apple 5.1.1(v), Google) | Built on branch `account-deletion`: migration `007_account_deletion.sql` and `DeleteAccount` on the Profile page. Migration not applied to the hosted project. |
| A web page to request deletion (Google) | `site/src/pages/delete-account.astro`, same branch. Uses support@hisfullglory.com, which must forward before it goes live. |
| Sign-in that works inside the app | To do: a 6-digit code instead of only a link, because a link opens the browser, not the app. |
| A sign-in for the reviewers | To do. They cannot use the founder's mailbox. |
| Filtering of objectionable content (Apple 1.2) | To do. Reporting and blocking exist. |
| Privacy policy and terms for the app | To do: pages on the site, written by Claude, approved by the founder. |
| Native shell and a notification | To do. |
| Store listing: icon, screenshots, texts, age rating, privacy forms | To do. |
| Two-account test of the live app (sign-in, posting, private Circles) | Waiting for the founder. |

## Account deletion: what it removes

Deleting the auth user removes every row that references it: all foreign keys to
`auth.users` cascade (checked on the hosted project on 2026-10-14). Replies other people
wrote under the user's posts go with those posts, and Circles the user owns close with their
posts, because a Circle's owner cannot change in v1. Both are said in the app before the
user confirms. Moderation records keep what was decided about which item and by which
account id, without names, email addresses or post text. In the app, the private data that
account saved on the device is removed too (`forgetAccount` in `src/platform/persistence.ts`);
guest data stays. `tests/account-deletion-schema.test.mjs` runs the migration on 001 to 006
and checks all of this.

Open: whether an owner's Circle should pass to its longest-standing moderator or member
instead of closing. That needs a change to the v1 rule that owners are immutable.
