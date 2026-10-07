# Giving catalog and verification

Checked 2026-10-07 against official sources. These are independently evaluated programs, not fabricated project campaigns. No donation was made during verification.

| Option                      | Category           | Exact official donation URL  | Choice in checkout         |
| --------------------------- | ------------------ | ---------------------------- | -------------------------- |
| GiveWell Top Charities Fund | Flexible giving    | https://secure.givewell.org/ | Top Charities Fund         |
| Malaria Consortium          | Malaria prevention | https://secure.givewell.org/ | Malaria Consortium         |
| Against Malaria Foundation  | Malaria prevention | https://secure.givewell.org/ | Against Malaria Foundation |
| Helen Keller Intl           | Child nutrition    | https://secure.givewell.org/ | Helen Keller Intl          |
| New Incentives              | Child immunization | https://secure.givewell.org/ | New Incentives             |

The [official GiveWell donation page](https://www.givewell.org/donate) redirects to that checkout, which offers all five destinations. No unsupported query parameters are guessed. The app explicitly instructs the donor to select the named program. [GiveWell's recommendations and evidence](https://www.givewell.org/charities/top-charities) support the short program descriptions. The app uses no dollar-to-outcome promises, progress bars or unverified totals. Recheck links and recommendations before release and periodically; the verification date does not guarantee future availability.

## Individual support

Only exact `https://www.gofundme.com/f/<lowercase-hyphenated-slug>` URLs, optionally with one trailing slash, are accepted. No query, fragment, credentials, port, percent encoding, alternate host or shortened link. Client and SQL apply the same allowlist. A permitted domain is not proof a campaign is legitimate. Authors must create their external fundraiser first and explain authorization/beneficiary relationship. Requests remain private pending manual review; details about review are in MODERATION.md. Provider restrictions, country eligibility and beneficiary verification must be checked for the individual campaign.

Official references: [GoFundMe process](https://www.gofundme.com/c/how-it-works), [transfer setup](https://support.gofundme.com/hc/en-us/articles/360001992767-How-to-set-up-transfers), [provider guarantee and conditions](https://www.gofundme.com/c/safety/gofundme-guarantee). HisFullGlory does not promise that a provider will verify a specific request, approve a transfer or grant a refund. GoFundMe administers its own payment, identity, payout, dispute and refund rules. Tax/receipt treatment depends on recipient and jurisdiction; no deductibility claim is made.

There are no published personal campaigns seeded in the repository and no payment details or bank/crypto/direct PayPal instructions. Display targets are declared by the author, explicitly unverified. Current campaign progress is viewed at GoFundMe. UI confirms the provider hostname and external responsibility before opening a secure new browsing context.

## Native collection release gate

Native Stripe/Mollie code is disabled architecture only. Before enabling any collection, obtain payment and legal approval, real server credentials, tested signed webhooks, verified eligible connected recipients, fraud review, reconciliation, refund/dispute operations and an explicit production flag. No card details, identity documents, receipts or platform-held funds belong in this frontend. No platform fee is implemented.

For an iOS release, re-evaluate [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) (checked 2026-10-07), particularly 3.2.1(vi), 3.2.1(vii) and 3.2.2(iv): nonprofit approval, Apple Pay where applicable, use-of-funds disclosures, receipt availability and eligible listed nonprofits are release gates for native charitable fundraising. Individual gifts have separate conditions; do not assume charitable and individual fundraising are interchangeable. These are technical release checks, not a legal determination or App Store approval. The current app only opens external providers; no native binary was submitted.
