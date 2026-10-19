// The facts behind /privacy, /terms and /contact, and the switch that keeps them unpublished.
//
// This file imports nothing, because the site tests and the app's own tests read it too.
//
// STATE (2026-10-19): the founder gave his values on 2026-10-19 (his words are in the plan 01-10
// notes). Two markers are left on purpose:
//   - lastUpdated: it becomes the date the founder approves the text.
//   - signInRecords: Supabase's documentation does not state how long it keeps the sign-in audit
//     log, so the sentence waits for a figure (read it from the dashboard, or turn the log off).
// `approved` stays false until the founder has read the finished pages on the preview and said so.
//
// HOW TO FINISH THE PAGES
//   1. Replace the remaining "[CONFIRM: ...]" markers with the real wording.
//   2. Set approved to true. The pages then lose their draft banner and noindex, join the
//      sitemap, and a production build is allowed.
// Nothing below is a legal fact until the founder has accepted it. Never invent one.

/** False until the founder has approved the final text. See assertReleasable. */
export const approved = false;

/** False until mail to the support address is known to arrive (GATE-03). While false, no page
 *  prints the address or links to it. True since 2026-10-19: the founder's test mail to
 *  support@hisfullglory.com arrived ("de test mail is binnen"). */
export const supportEmailReady = true;
export const supportEmail = "support@hisfullglory.com";

/** Must equal TERMS_VERSION in src/platform/auth.tsx (site/tests/legal.test.ts checks it). */
export const termsVersion = "2026-10-07";

/** A value that is empty would render as a broken sentence, so it stops the build instead. */
function need(name: string, value: string): string {
  if (typeof value !== "string" || value.trim() === "")
    throw new Error(`site/src/data/legal.ts: "${name}" is empty. Write the wording, or keep its [CONFIRM: ...] marker.`);
  return value;
}

// Who we are (P1 to P3). The founder, 2026-10-19: no company and no KvK registration yet, so the
// service is run by a private person ("you can use my full name Glennysan Read"). No registration
// number and no postal address are published; contact is by email. Update `entity` when a company
// is registered, and add the registration number and address then.
export const entityName = need("entityName", "Glennysan Read");
export const entity = need("entity", `${entityName}, a private person in the Netherlands`);

// P4: the age rule. The founder wants the widest reach the law allows: no limit for reading, 13 for
// an account, 16 in the EU/EEA (or 13 to 15 with a parent's or guardian's permission). The terms,
// the privacy policy, the acceptance label in the app and docs/APP_STORES.md use these words.
// This is the founder's decision, not legal advice.
/** What needs no account. */
export const ageNoAccount = need(
  "ageNoAccount",
  "Reading the Bible, the Daily Walk and your private journal do not need an account and have no age limit.",
);
/** The rule for an account and the community (terms and privacy policy). */
export const ageRule = need(
  "ageRule",
  "To create an account and take part in the community you must be at least 13. In the EU or EEA (the European Union plus Iceland, Liechtenstein and Norway) you must be at least 16, or 13 to 15 with permission from a parent or guardian.",
);
/** The same rule as the start of the checkbox sentence in the app ("<label>. I accept the ..."). */
export const ageLabel = need(
  "ageLabel",
  "I am at least 13 (in the EU or EEA: at least 16, or 13 to 15 with permission from a parent or guardian)",
);

// P6: the date of the founder's approval. Stays a marker until he approves.
export const lastUpdated = need("lastUpdated", "[CONFIRM: date]");

// P7, P8: the law and the legal bases. Drafts proposed by Claude on 2026-10-19; the founder accepts
// or changes them on the preview. "We" is the person named in `entity`.
export const governingLaw = need(
  "governingLaw",
  "These terms are governed by Dutch law. A dispute goes to the competent court in the Netherlands.",
);
export const rights = need(
  "rights",
  `You can ask us for a copy of your data, to correct it or to delete it. You can delete your account yourself in the app. For anything else, ${supportEmailReady ? `write to ${supportEmail}` : "use the contact page"}.`,
);
export const supervisoryAuthority = need(
  "supervisoryAuthority",
  "If you think we handle your personal data wrongly, you can complain to the Dutch Data Protection Authority (Autoriteit Persoonsgegevens).",
);
export const legalBasis = need(
  "legalBasis",
  "We use your email address to give you an account and to sign you in, because we cannot offer the service without it. We keep what you publish because you asked us to publish it. We keep reports and review records to keep the community safe.",
);
export const transfers = need(
  "transfers",
  "If one of the companies named above handles data outside the European Economic Area, it does so under the safeguards the law requires, such as the European Commission's standard contractual clauses.",
);

// P9: how long things are kept. Deleting an account removes the server data at once (migration
// 007). The figures below come from the providers' own pages, read on 2026-10-19, for the plans we
// use today (Supabase Free, Vercel Hobby). Update them if a plan changes (the founder plans Vercel
// Pro around mid-November 2026: runtime logs are then kept 1 day). The addresses are written
// without the scheme on purpose: tests/third-parties.test.ts treats every address with a scheme
// as a contact the app makes.
//   Supabase API and database logs, Free plan: 1 day.
//     supabase.com/pricing ("Platform Security and Compliance", "Log retention (API & Database)": 1 day for Free)
//     supabase.com/docs/guides/telemetry/logs ("Retention depends on your pricing plan")
//   Supabase sign-in (auth) audit log: its page says it is kept in external log storage and, if the
//     "Write audit logs to the database" switch is on, in auth.audit_log_entries; it states no
//     period for either. supabase.com/docs/guides/auth/audit-logs  -> the marker stays.
//   Supabase backups, Free plan: none. supabase.com/docs/guides/platform/backups ("We
//     automatically back up all Pro, Team, and Enterprise Plan projects") and supabase.com/pricing
//     ("Automatic backups": "Not included in free"). Pro would keep 7 days of daily backups.
//   Vercel runtime (request) logs, Hobby plan: 1 hour.
//     vercel.com/docs/runtime-logs ("Hobby 1 hour of logs") and vercel.com/docs/limits
//     ("Runtime logs are stored for 1 hour on Hobby, 1 day on Pro, and for 3 days on Enterprise")
export const retention = need(
  "retention",
  "Supabase keeps the logs of our API and database for 1 day on the plan we use.",
);
export const signInRecords = need(
  "signInRecords",
  "[CONFIRM: how long Supabase keeps the record of sign-in events; its documentation gives no period]",
);
export const logRetention = need("logRetention", "Vercel keeps these logs for 1 hour on the plan we use.");
export const backups = need(
  "backups",
  "Supabase does not make automatic backups of projects on its free plan, which is the plan we use today, so Supabase's backup service holds no copy of your data.",
);

// P10: Supabase read from the project by the orchestrator on 2026-10-16 (fccwqguqhnbayuowmamy is
// in eu-west-1, Ireland). Vercel serves the static pages from its worldwide network. Resend: the
// founder will create the sending domain in the EU (Ireland) region; confirm it is done before he
// approves the text.
export const regions = {
  supabase: need("regions.supabase", "Ireland, in the European Union."),
  vercel: need(
    "regions.vercel",
    "Vercel's worldwide network. Pages are delivered from a server near the reader, which can be outside the European Economic Area.",
  ),
  resend: need("regions.resend", "Ireland, in the European Union. This is the region we set for our sign-in email domain."),
};

// P13, P14: business statements, not facts the code can prove. Proposed by Claude, accepted or
// changed by the founder on the preview.
export const noSale = need("noSale", "We do not sell your data.");
export const postLicence = need(
  "postLicence",
  "You keep ownership of what you post. By publishing it you give HisFullGlory permission to show it in the app to the people you chose, for as long as it is online. When you delete a post, that permission ends.",
);

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
    receives: "An address for your device from the notification service, and the fixed reminder text.",
    where: "Depends on the company behind your browser or phone.",
  },
];

/**
 * What kind of contact an outside address is, in the words the privacy policy uses:
 *  - "processor": a company that receives personal data so a feature can work;
 *  - "loaded by the page": the browser fetches it by itself, so that company sees the reader's IP address;
 *  - "link you click": nothing is requested until the reader follows the link;
 *  - "no request": the address only appears as text, for example an XML namespace.
 */
export type OutboundKind = "processor" | "loaded by the page" | "link you click" | "no request";

export type OutboundHost = {
  host: string;
  /** Why the code names this address, in plain words. */
  purpose: string;
  kind: OutboundKind;
  /** The `id` of the processor card above that covers this address. Required for "processor"
   *  and "loaded by the page". */
  processor?: string;
  /** True when the code never writes the address as a literal: it comes from configuration, so
   *  tests/third-parties.test.ts does not expect to find it in the source. */
  viaConfiguration?: boolean;
};

/**
 * Every outside address the app and the website use. tests/third-parties.test.ts scans src,
 * site/src, index.html, vite.config.ts and public/*.js for http(s) hosts and fails when one is
 * missing here, or when an entry here is no longer used. So a new host cannot ship until
 * someone has decided what it receives and written it into the privacy policy and
 * docs/PRIVACY_DATA_FLOW.md. Checked against the code on 2026-10-16.
 */
export const outboundHosts: OutboundHost[] = [
  // Reached through configuration, so not written as literals in the code.
  {
    host: "fccwqguqhnbayuowmamy.supabase.co",
    purpose: "The database, sign-in and live updates. The address comes from VITE_SUPABASE_URL when the app is built.",
    kind: "processor",
    processor: "supabase",
    viaConfiguration: true,
  },
  {
    host: "smtp.resend.com",
    purpose: "Relays the sign-in email. Set in the Supabase dashboard (custom SMTP), not in our code.",
    kind: "processor",
    processor: "resend",
    viaConfiguration: true,
  },
  {
    host: "fcm.googleapis.com",
    purpose: "Delivers reminders to Chrome and Android. Allowed by the endpoint check in supabase/migrations/010_push.sql.",
    kind: "processor",
    processor: "push",
    viaConfiguration: true,
  },
  {
    host: "updates.push.services.mozilla.com",
    purpose: "Delivers reminders to Firefox. Allowed by the endpoint check in supabase/migrations/010_push.sql.",
    kind: "processor",
    processor: "push",
    viaConfiguration: true,
  },
  {
    host: "*.notify.windows.com",
    purpose: "Delivers reminders to Edge on Windows. Allowed by the endpoint check in supabase/migrations/010_push.sql.",
    kind: "processor",
    processor: "push",
    viaConfiguration: true,
  },
  {
    host: "web.push.apple.com",
    purpose: "Delivers reminders to Safari and iPhone. Allowed by the endpoint check in supabase/migrations/010_push.sql.",
    kind: "processor",
    processor: "push",
    viaConfiguration: true,
  },
  // Written in the code.
  {
    host: "cdn.shopify.com",
    purpose: "Product pictures on the Resources page and in the app's Shop tab.",
    kind: "loaded by the page",
    processor: "shopify",
  },
  {
    host: "shop.hisfullglory.com",
    purpose: "Our shop, run by Shopify. Product links, the shop contact page and the old shop addresses that are sent on.",
    kind: "link you click",
    processor: "shopify",
  },
  {
    host: "hisfullglory.com",
    purpose: "This website, hosted by Vercel. The app links to it.",
    kind: "link you click",
    processor: "vercel",
  },
  {
    host: "app.hisfullglory.com",
    purpose: "The app, hosted by Vercel. The website links to it.",
    kind: "link you click",
    processor: "vercel",
  },
  { host: "ebible.org", purpose: "Source of the World English Bible text, linked as provenance.", kind: "link you click" },
  { host: "www.gofundme.com", purpose: "The fundraising platform behind reviewed fundraisers, and its how-it-works page.", kind: "link you click" },
  { host: "www.givewell.org", purpose: "GiveWell's list of top charities, linked as the source.", kind: "link you click" },
  { host: "secure.givewell.org", purpose: "GiveWell's own donation page. We never handle the money.", kind: "link you click" },
  { host: "www.facebook.com", purpose: "Share to X from the website.", kind: "link you click" },
  { host: "wa.me", purpose: "WhatsApp share link on the website.", kind: "link you click" },
  { host: "twitter.com", purpose: "Share to X from the website.", kind: "link you click" },
  { host: "www.sitemaps.org", purpose: "The XML namespace of the sitemap. It is a name, not an address anyone visits.", kind: "no request" },
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
