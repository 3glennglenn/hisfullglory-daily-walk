// The facts behind /privacy, /terms and /contact, and the switch that keeps them unpublished.
//
// This file imports nothing, because the site tests and the app's own tests read it too.
//
// HOW THE FOUNDER FINISHES THE PAGES
//   1. Replace each "[CONFIRM: ...]" marker below with the real wording. Two kinds:
//      - a fact dropped into a sentence (entity, registration, businessAddress, minimumAge,
//        responseTarget, lastUpdated, regions): write only the words, for example "16".
//      - a whole passage (governingLaw, rights, supervisoryAuthority, legalBasis, transfers,
//        retention, backups, logRetention, noSale, postLicence): write the full sentence or
//        sentences.
//   2. Set supportEmailReady to true only when mail sent to the support address reaches a person.
//   3. Set approved to true. The pages then lose their draft banner and noindex, join the
//      sitemap, and a production build is allowed.
// Nothing below is a legal fact until the founder has replaced its marker. Never invent one.

/** False until the founder has approved the final text. See assertReleasable. */
export const approved = false;

/** False until mail to the support address is known to arrive (GATE-03). While false, no page
 *  prints the address or links to it. */
export const supportEmailReady = false;
export const supportEmail = "support@hisfullglory.com";

/** Must equal TERMS_VERSION in src/platform/auth.tsx (site/tests/legal.test.ts checks it). */
export const termsVersion = "2026-10-07";

/** A value that is empty would render as a broken sentence, so it stops the build instead. */
function need(name: string, value: string): string {
  if (typeof value !== "string" || value.trim() === "")
    throw new Error(`site/src/data/legal.ts: "${name}" is empty. Write the wording, or keep its [CONFIRM: ...] marker.`);
  return value;
}

// Who we are (P1 to P3).
export const entity = need("entity", "[CONFIRM: legal entity name]");
export const registration = need("registration", "[CONFIRM: registration number]");
export const businessAddress = need("businessAddress", "[CONFIRM: business address]");

// P4: proposed 16 (the Dutch age of digital consent). The terms, the privacy policy, the
// acceptance line in the app and the store questionnaires must all say the same.
export const minimumAge = need("minimumAge", "[CONFIRM: minimum age, proposed 16]");

// P5, P6.
export const responseTarget = need("responseTarget", "[CONFIRM: support response target]");
export const lastUpdated = need("lastUpdated", "[CONFIRM: date]");

// P7, P8: the law and the legal bases.
export const governingLaw = need("governingLaw", "[CONFIRM: governing law and courts]");
export const rights = need("rights", "[CONFIRM: rights wording]");
export const supervisoryAuthority = need("supervisoryAuthority", "[CONFIRM: supervisory authority wording]");
export const legalBasis = need("legalBasis", "[CONFIRM: legal basis wording]");
export const transfers = need("transfers", "[CONFIRM: international transfer wording]");

// P9: how long things are kept. Deleting an account removes the server data at once (migration
// 007); how long sign-in records, server logs and backups last is not known from the code.
export const retention = need("retention", "[CONFIRM: retention periods for sign-in records and server logs]");
export const logRetention = need("logRetention", "[CONFIRM: log retention]");
export const backups = need("backups", "[CONFIRM: backup wording]");

// P10: read from the Supabase, Vercel and Resend dashboards by the founder, never guessed.
export const regions = {
  supabase: need("regions.supabase", "[CONFIRM: hosting region of Supabase]"),
  vercel: need("regions.vercel", "[CONFIRM: hosting region of Vercel]"),
  resend: need("regions.resend", "[CONFIRM: hosting region of Resend]"),
};

// P13, P14: business statements, not facts the code can prove.
export const noSale = need("noSale", '[CONFIRM: "We do not sell your data."]');
export const postLicence = need("postLicence", "[CONFIRM: licence to posts]");

export type Processor = {
  id: string;
  name: string;
  /** What they do for us. */
  does: string;
  /** What they receive. */
  receives: string;
  /** Where they run. */
  where: string;
};

/** The five companies that handle data for us (UI-SPEC Surface 1). Facts from
 *  docs/PRIVACY_DATA_FLOW.md and the code; regions and retention stay markers. */
export const processors: Processor[] = [
  {
    id: "supabase",
    name: "Supabase",
    does: "Runs our database and the sign-in.",
    receives: "Your email address, your display name and what you publish.",
    where: regions.supabase,
  },
  {
    id: "vercel",
    name: "Vercel",
    does: "Hosts the website and the app.",
    receives: `The technical details every web server sees, such as your IP address and the pages you request. ${logRetention}`,
    where: regions.vercel,
  },
  {
    id: "resend",
    name: "Resend",
    does: "Sends your sign-in code by email.",
    receives: "Your email address and the email it delivers.",
    where: regions.resend,
  },
  {
    id: "shopify",
    name: "Shopify",
    does: "Runs the shop at shop.hisfullglory.com and manages the DNS records of our domain.",
    receives:
      "What you give the shop when you order. Product pictures on our Resources page and in the app's Shop tab load from Shopify, so Shopify also sees your IP address then. The shop has its own privacy policy, and your app account and your shop account are separate.",
    where: "Set by Shopify. See the shop's own privacy policy.",
  },
  {
    id: "push",
    name: "Browser and phone push services",
    does: "Deliver reminders. They are run by the company behind your browser or phone.",
    receives: "A push address for your device and the fixed reminder text.",
    where: "Depends on the company behind your browser or phone.",
  },
];

/**
 * Stops a production build while the legal pages are not approved, so an early or interrupted
 * merge never publishes draft text: the build fails and Vercel keeps the previous deployment.
 * Preview builds, local builds and builds with no environment name are allowed to show drafts.
 */
export function assertReleasable(env: string | undefined, isApproved: boolean = approved): void {
  if (env === "production" && !isApproved)
    throw new Error(
      "site/src/data/legal.ts: the legal pages are not approved (approved = false), so this production build is stopped. " +
        "Finish the [CONFIRM: ...] markers and set approved to true, or keep this change off the production branch.",
    );
}
