import { publishedArticles, publishedChecks, publishedTopics } from "./lib/content.ts";
import type { Sponsor } from "./lib/sponsor.ts";

export const site = {
  name: "HisFullGlory",
  tagline: "Jesus at the Center",
  positioning: "Simple Bible study. Real community. Deeper faith.",
  description:
    "Study the Bible together: read Scripture, understand its context and discuss it with others.",
  // The sponsor slot is built for later and empty at launch (founder, 2026-10-19, D-13): while
  // this is null nothing renders at any place, not even a space. No house messages.
  sponsor: null as Sponsor | null,
};

export const appUrl = "https://app.hisfullglory.com";

// The shop's own address since the domain move (docs/WEBSITE_PLAN.md, section 7). Old shop
// addresses on hisfullglory.com are sent here by the redirects in vercel.json.
export const shopUrl = "https://shop.hisfullglory.com";

export type NavItem = { label: string; href: string; ready: boolean };

// `ready` turns true in the build step that adds the page, so the header never links to a
// page that does not exist yet. Topics and Articles appear once the founder has approved
// at least one of them (src/lib/content.ts).
export const mainNav: NavItem[] = [
  { label: "Bible", href: "/bible", ready: true },
  { label: "Context checks", href: "/context-checks", ready: publishedChecks().length > 0 },
  { label: "Topics", href: "/topics", ready: publishedTopics().length > 0 },
  { label: "Articles", href: "/articles", ready: publishedArticles().length > 0 },
  // "Shop" is the founder's name for it (2026-10-22). The address stays /resources so old links keep working.
  { label: "Shop", href: "/resources", ready: true },
  { label: "About", href: "/about", ready: true },
];

// Privacy, Terms, Contact and Delete account are this site's own pages. They stay behind the
// approval gate in src/data/legal.ts (noindex and a draft banner until the founder approves
// the text), so the footer links to them from day one. Never use a path that begins with
// /pages/ or /policies/: vercel.json sends both to the shop.
export const footerNav: NavItem[] = [
  { label: "About", href: "/about", ready: true },
  { label: "Privacy", href: "/privacy", ready: true },
  { label: "Terms", href: "/terms", ready: true },
  { label: "Contact", href: "/contact", ready: true },
  { label: "Delete account", href: "/delete-account", ready: true },
  { label: "Shop", href: shopUrl, ready: true },
];
