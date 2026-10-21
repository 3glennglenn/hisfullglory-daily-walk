# Sign in with Google

Written 2026-10-21. Branch `google-signin`, on top of pull request #32.

## Why

Supabase's built-in email sender only delivers the sign-in code to members of the Supabase
team (error code `email_address_not_authorized`), so nobody but the founder could sign in.
Asked for a way without email codes, the founder chose Google sign-in on 2026-10-20/21 ("c
start voor nu we gaan het waarschijnlijk later aanpassen"). He does not want to set up a
custom email sender (Resend) now, so Resend is not used for now and is not in the privacy
policy.

## The two ways in

1. **Continue with Google**, first and primary. `AuthPanel` in `src/platform/auth.tsx` calls
   `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } })`. The button
   is `src/platform/GoogleButton.tsx`, drawn to Google's sign-in branding guidelines (exact label
   "Continue with Google", the multicolour "G" as inline SVG, white button in the light looks and
   dark button in Lamplight).
2. **Email me a sign-in code**, second. It still goes through Supabase's built-in sender, so it only
   reaches team members. For anyone else Supabase answers `email_address_not_authorized` and the
   app says "Signing in by email is not open yet. Use Continue with Google." Any other failure keeps
   the old message.

The client keeps its flow type: implicit, `detectSessionInUrl` (see `src/supabase.ts`).
`redirectTo` is built by `oauthRedirectTo` in `src/platform/googleSignIn.ts`: the app's own origin
and the current path, nothing else (no query, no hash, so no code or token is carried along).
When Supabase sends the reader back with `error` or `error_description` in the hash or query, the
panel says "Google sign-in did not finish. Try again." and the parameters are removed from the
address bar.

A Google reader has no row in `profiles` yet, so the existing "choose a display name" step and
the terms acceptance run exactly as for an email reader. The app never reads, copies or shows the
name or the picture that Google sends; they only sit with the account at Supabase Auth.

## What is set up where (read 2026-10-21)

**Google Cloud**, project `hisfullglory`, Google Auth Platform:

| Setting | Value |
| --- | --- |
| App name | HisFullGlory |
| User type | External |
| Publishing status | In production |
| Client | Web application, named "HisFullGlory web" |
| Authorized JavaScript origin | `https://app.hisfullglory.com` |
| Authorized redirect URI | `https://fccwqguqhnbayuowmamy.supabase.co/auth/v1/callback` |
| Scopes | `openid`, `email`, `profile` (none of them needs Google's app verification) |
| Brand verification | Not done. Google's consent screen therefore names `fccwqguqhnbayuowmamy.supabase.co` instead of HisFullGlory. |

The client ID is not a secret and is shown in Google Cloud (Clients) and in the Supabase Google
provider; it is not repeated here.

**Supabase**, project `fccwqguqhnbayuowmamy`:

- Authentication, Providers: Google is enabled (`GET /auth/v1/settings` reports `external.google:
  true`). `/auth/v1/authorize?provider=google` redirects to accounts.google.com with the web
  client's ID and the callback above, and Google shows its sign-in page (no `redirect_uri_mismatch`).
- Authentication, URL configuration: Site URL `https://app.hisfullglory.com`; redirect URL
  `https://app.hisfullglory.com/**` (set by the founder).
- Preview builds (Vercel) sit on other addresses, which are not in the redirect list, so Supabase
  sends a reader who signs in from a preview back to the Site URL (the live app). Test sign-in on
  the live address.

## The secret

The client secret lives only in Supabase (Authentication, Providers, Google). Never put it, or any
key, in this repository, in an environment file, in a chat or in a screenshot.

### Rotating it

Menu names are Google's and Supabase's as of 2026-10-21; they may move. The founder does this
himself, one step at a time (a hosted Supabase change needs his approval).

1. Google Cloud, project `hisfullglory`, Google Auth Platform, Clients, "HisFullGlory web": add a
   new client secret. Google shows it once; copy it.
2. Supabase, Authentication, Providers, Google: paste it into "Client Secret" and save.
3. Sign in with Google on https://app.hisfullglory.com to check it still works.
4. Back in Google Cloud, disable the old secret, and delete it after a day without problems.

If the secret may have leaked, do step 1 and 2 at once and delete the old secret straight away.

## Open follow-ups

- **Brand verification**, so Google's screen says HisFullGlory. Needs `hisfullglory.com` verified in
  Google Search Console with a TXT record in the Shopify DNS (Settings, Domains; the founder makes
  DNS changes himself), the app logo, and the home page, privacy and terms addresses on the
  Branding page, then "Submit for verification".
- **Supabase custom domain** is the other fix for the same problem: the screen then names the
  custom domain (for example `auth.hisfullglory.com`) instead of the project address. It is a
  paid add-on, and the redirect URI in Google Cloud must change to the new domain.
- **Email codes for everyone** need a custom sender (Resend or another provider). Until then email
  sign-in only works for Supabase team members.
- **iOS release gate:** see `docs/APP_STORES.md` (Sign in with Apple, App Store guideline 4.8). Google
  also refuses sign-in inside an embedded web view, so the native shell must use the system browser
  for this button.
- **Not tested on production yet.** No test signs in anywhere; the browser tests stub the Supabase
  client and never reach Google. The first real sign-in is the founder's.
