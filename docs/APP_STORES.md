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
| Account deletion in the app (Apple 5.1.1(v), Google) | Built: migration `007_account_deletion.sql` and `DeleteAccount` on the Profile page. The founder approved the migration on 2026-10-14 and it was applied to the hosted project that day (migration history: version 20261014190635, name account_deletion). |
| A web page to request deletion (Google) | `site/src/pages/delete-account.astro`, same branch. Uses support@hisfullglory.com, which must forward before it goes live. The founder approved its promise of deletion by email within 30 days on 2026-10-14. |
| Sign-in that works inside the app | To do: a 6-digit code instead of only a link, because a link opens the browser, not the app. |
| A sign-in for the reviewers | To do. They cannot use the founder's mailbox. |
| Sign in with Apple (App Store guideline 4.8), an iOS release gate | Not built. The app offers Google sign-in (`docs/GOOGLE_SIGN_IN.md`), and guideline 4.8 requires an equivalent privacy-focused login option, such as Sign in with Apple, next to a third-party login. It needs the Apple developer account (the founder: end of October 2026). Do not submit the iOS build before it is built and tested, and read the current wording of 4.8 when submitting. |
| Filtering of objectionable content (Apple 1.2) | To do. Reporting and blocking exist. |
| Privacy policy and terms for the app | To do: pages on the site, written by Claude, approved by the founder. |
| Native shell and a notification | To do. |
| Store listing: icon, screenshots, texts, age rating, privacy forms | To do. |
| Two-account test of the live app (sign-in, posting, private Circles) | Waiting for the founder. |

## Age and audience (founder's decision, 2026-10-19)

The founder wants the widest reach the law allows. Reading the Bible, the Daily Walk and the
private journal need no account and have no age limit. To create an account and take part in
the community a person must be at least 13; in the EU or EEA at least 16, or 13 to 15 with
permission from a parent or guardian. The same words are in the terms of use and the privacy
policy (`ageRule` in `site/src/data/legal.ts`) and, shortened, in the app's terms checkbox
(`ageLabel`); `site/tests/legal.test.ts` keeps them together.

For the store questionnaires: target audience 13 and older. The app is not designed for
children, so the store family programmes (Apple Kids category, Google Play Families) do not
apply, and the answers about children must say so. This is the founder's decision, not legal
advice, and it is not an age rating: the stores' content-rating questionnaires still have to
be filled in at listing time.

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

## Phase 2 notes from the calm redesign (phase 01.1)

- The native status bar follows `data-mode` (light content on Lamplight), not only the device setting.
- Decide whether the native splash follows a dark device (`#1A120E`), to avoid a light flash before Lamplight draws.
- Check the iOS accessibility text sizes AX1 to AX5 on a device. The web checks cover a 34px root (200 %), not the larger Apple sizes.
- The store screenshot set (six screens in Cover and story, 1320 x 2868 and 1080 x 2400, real content only) is in the phase folder, `.planning/phases/01.1-calm-redesign-of-app-and-website-apple-hig/screens/store/`. Retake it on the capture day, because Today shows whatever context check is newest then.
- Android Back does not close a sheet yet; check it in the store build.
