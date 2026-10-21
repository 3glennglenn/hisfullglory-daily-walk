# Giving catalog and verification

The Give screen lists 32 options on six pages. They are independently evaluated organisations, not campaigns made by this project. No donation was made during verification.

**Researched and verified on 2026-10-20.** For each entry the official donation page, the evaluator's page and the quoted evidence were opened and checked that day (`.planning/quick/261020-give/giving-research.md` and `verify-results.json` hold the working record). The data lives in `src/giving/catalogData.ts`; adding a charity is one more object there, and the page, the card and the "why it is here" line follow from it.

**World Vision was checked by hand.** Its donation page, https://www.worldvision.org/donate, blocks automated checks (every tool got an HTTP 403). The founder opened it himself on 2026-10-20 and confirmed that it is a working donation page. This one URL was therefore checked by hand by the founder on 2026-10-20, not by a script.

## The pages

1. **Most effective** (`most-effective`): Six places where independent evaluators expect a gift to do the most good, across different needs.
2. **Poverty and hunger** (`poverty-hunger`): Cash, farming, fortified food and treatment for malnourished children.
3. **Health, medicine and research** (`health-research`): Malaria, neglected diseases, sight, childbirth injuries and research into new programmes.
4. **Children and protection** (`children-protection`): Vaccines, vitamins, school meals and protection from trafficking.
5. **Animals** (`animals`): Charities recommended by Animal Charity Evaluators for reducing the suffering of farmed and wild animals.
6. **Christian charities** (`christian`): Christian organisations serving people in need. Charity Navigator and ECFA check their finances and accountability, not how much good each gift does.

The first page holds six options from four different evaluators, so the reader meets different needs before anything else.

## The 32 options

| Option | Page | Evaluator | Official donation URL | Choice in checkout |
| --- | --- | --- | --- | --- |
| GiveWell Top Charities Fund | Most effective | GiveWell | https://secure.givewell.org/ | Top Charities Fund |
| Against Malaria Foundation | Most effective | GiveWell | https://secure.givewell.org/ | Against Malaria Foundation |
| GiveDirectly | Most effective | The Life You Can Save | https://donate.givedirectly.org/ |  |
| StrongMinds | Most effective | Happier Lives Institute | https://strongminds.org/donate/ |  |
| Women and Girls Fund (The Life You Can Save) | Most effective | The Life You Can Save | https://www.thelifeyoucansave.org/cause-funds/women-and-girls-fund/ |  |
| Recommended Charity Fund (Animal Charity Evaluators) | Most effective | Animal Charity Evaluators | https://animalcharityevaluators.org/donate/donor-resources/recommended-charity-fund/ |  |
| One Acre Fund | Poverty and hunger | The Life You Can Save | https://oneacrefund.org/donate |  |
| Raising The Village | Poverty and hunger | The Life You Can Save | https://raisingthevillage.org/donation |  |
| Sanku – Project Healthy Children | Poverty and hunger | The Life You Can Save | https://sanku.com/donate |  |
| Taimaka | Poverty and hunger | Happier Lives Institute | https://taimaka.org/donate |  |
| Malaria Consortium | Health, medicine and research | GiveWell | https://secure.givewell.org/ | Malaria Consortium |
| GiveWell All Grants Fund | Health, medicine and research | GiveWell | https://secure.givewell.org/ | All Grants Fund |
| Unlimit Health | Health, medicine and research | The Life You Can Save | https://unlimithealth.org/donate/ |  |
| Evidence Action | Health, medicine and research | The Life You Can Save | https://www.evidenceaction.org/donate |  |
| Fistula Foundation | Health, medicine and research | The Life You Can Save | https://fistulafoundation.org/donate/ |  |
| The Fred Hollows Foundation | Health, medicine and research | The Life You Can Save | https://www.hollows.org/donate/ |  |
| New Incentives | Children and protection | GiveWell | https://secure.givewell.org/ | New Incentives |
| Helen Keller Intl | Children and protection | GiveWell | https://secure.givewell.org/ | Helen Keller Intl |
| Food4Education | Children and protection | The Life You Can Save | https://food4education.org/donate/ |  |
| Love146 | Children and protection | Charity Navigator | https://love146.org/donate/ |  |
| The Humane League | Animals | Animal Charity Evaluators | https://takeaction.thehumaneleague.org/a/donate |  |
| Shrimp Welfare Project | Animals | Animal Charity Evaluators | https://www.shrimpwelfareproject.org/donate |  |
| Wild Animal Initiative | Animals | Animal Charity Evaluators | https://www.wildanimalinitiative.org/donate |  |
| Sinergia Animal | Animals | Animal Charity Evaluators | https://sinergiaanimal.org/donate-1 |  |
| International Justice Mission | Christian charities | Charity Navigator (accountability check) | https://www.ijm.org/give/main-single-form |  |
| World Relief | Christian charities | Charity Navigator (accountability check) | https://worldrelief.org/donate/ |  |
| Medical Teams International | Christian charities | Charity Navigator (accountability check) | https://www.medicalteams.org/donate/ |  |
| Living Water International | Christian charities | Charity Navigator (accountability check) | https://water.cc/donate/ |  |
| Feed My Starving Children | Christian charities | Charity Navigator (accountability check) | https://give.fmsc.org/campaign/521429/donate |  |
| Habitat for Humanity International | Christian charities | Charity Navigator (accountability check) | https://www.habitat.org/donate |  |
| Compassion International | Christian charities | ECFA (accountability check) | https://www.compassion.com/give/donate/ |  |
| World Vision | Christian charities | ECFA (accountability check) | https://www.worldvision.org/donate |  |

GiveWell's checkout (secure.givewell.org) is shared by six options. The donor must pick the named programme there; the card and the confirmation dialog both say which one. No query parameters are guessed.

## Research rules

- Only the organisation's own official HTTPS donation page, or the evaluator's own page for its fund. No query strings, no affiliate or tracking codes.
- The "why it is here" line says only what the evaluator says: "Recommended by GiveWell", "Recommended by The Life You Can Save", "Top charity" or "Promising charity, Happier Lives Institute", "Recommended by Animal Charity Evaluators", "Charity Navigator: Four-Star, {score}", "ECFA accredited". Each entry keeps the evaluator's own words (under 25 words) as `evidence`, and a link to the source page.
- Descriptions are at most 20 words and promise no outcome. No dollar-to-outcome claims, no progress bars, no unverified totals, and no superlatives beyond what the evaluator itself says.
- **Charity Navigator and ECFA are accountability checks, not effectiveness evaluations.** They look at a charity's finances, governance and transparency, not at how much good each gift does. The Christian page says so in its introduction, and its cards carry a "Christian" label.
- Nothing is fetched or embedded from these sites: no logos, no scripts, no iframes. Every host is an outbound link the reader opens, listed in `outboundHosts` (`site/src/data/legal.ts`), which `tests/third-parties.test.ts` enforces.
- Tests (`tests/giving-catalog.test.ts`) require an HTTPS donation URL without query or fragment, a source URL, evidence under 25 words, a description of at most 20 words, a known page and a verification date; the first page has exactly six entries from at least four evaluators; no id or title is repeated.

## Re-check

Charities and evaluators change, so the screen says "Checked on {date}. Charities and evaluators change; we re-check them regularly." The date is the newest `verifiedOn` in the data. Re-check every link and quote before a release and periodically. In particular:

- **Animal Charity Evaluators** publishes its next list around **November 2026**. Re-check the four animal charities and the Recommended Charity Fund then.
- **Happier Lives Institute**: on 2026-10-16 it paused its recommendation of Friendship Bench while it reassesses it; the decision is expected by the end of November 2026. Friendship Bench is not in the catalog. Re-check StrongMinds and Taimaka then, and whether Friendship Bench should be added.
- **Samaritan's Purse** is not in the catalog (founder decision, 2026-10-20).

## Individual support

Only exact `https://www.gofundme.com/f/<lowercase-hyphenated-slug>` URLs, optionally with one trailing slash, are accepted. No query, fragment, credentials, port, percent encoding, alternate host or shortened link. Client and SQL apply the same allowlist. Title, story, relationship and country reject inline URLs and recognizable direct payment/account instructions; include the hosted URL only in its dedicated field. Migration 004 also excludes unsafe older approved records from public reads. This is conservative validation, not an automated scam classifier. A permitted domain is not proof a campaign is legitimate. Authors must create their external fundraiser first and explain authorization/beneficiary relationship. Requests remain private pending manual review; details about review are in MODERATION.md. Provider restrictions, country eligibility and beneficiary verification must be checked for the individual campaign.

Official references: [GoFundMe process](https://www.gofundme.com/c/how-it-works), [transfer setup](https://support.gofundme.com/hc/en-us/articles/360001992767-How-to-set-up-transfers), [provider guarantee and conditions](https://www.gofundme.com/c/safety/gofundme-guarantee). HisFullGlory does not promise that a provider will verify a specific request, approve a transfer or grant a refund. GoFundMe administers its own payment, identity, payout, dispute and refund rules. Tax/receipt treatment depends on recipient and jurisdiction; no deductibility claim is made.

There are no published personal campaigns seeded in the repository and no payment details or bank/crypto/direct PayPal instructions. Display targets are declared by the author, explicitly unverified. Current campaign progress is viewed at GoFundMe. UI confirms the provider hostname and external responsibility before opening a secure new browsing context.

## Native collection release gate

Native Stripe/Mollie code is disabled architecture only. Before enabling any collection, obtain payment and legal approval, real server credentials, tested signed webhooks, verified eligible connected recipients, fraud review, reconciliation, refund/dispute operations and an explicit production flag. No card details, identity documents, receipts or platform-held funds belong in this frontend. No platform fee is implemented.

For an iOS release, re-evaluate [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) (checked 2026-10-07), particularly 3.2.1(vi), 3.2.1(vii) and 3.2.2(iv): nonprofit approval, Apple Pay where applicable, use-of-funds disclosures, receipt availability and eligible listed nonprofits are release gates for native charitable fundraising. Individual gifts have separate conditions; do not assume charitable and individual fundraising are interchangeable. These are technical release checks, not a legal determination or App Store approval. The current app only opens external providers; no native binary was submitted.
