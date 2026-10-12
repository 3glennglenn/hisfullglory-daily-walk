export const site = {
  name: "HisFullGlory",
  tagline: "Jesus at the Center",
  positioning: "Simple Bible study. Real community. Deeper faith.",
  description:
    "Study the Bible together: read Scripture, understand its context and discuss it with others.",
};

export const appUrl = "https://app.hisfullglory.com";

// The shop still lives on hisfullglory.com. When it moves (docs/WEBSITE_PLAN.md, section 7),
// change this one line to https://shop.hisfullglory.com.
export const shopUrl = "https://hisfullglory.com";

export type NavItem = { label: string; href: string; ready: boolean };

// `ready` turns true in the build step that adds the page, so the header never links to a
// page that does not exist yet.
export const mainNav: NavItem[] = [
  { label: "Bible", href: "/bible", ready: true },
  { label: "Topics", href: "/topics", ready: false },
  { label: "Articles", href: "/articles", ready: false },
  { label: "Resources", href: "/resources", ready: true },
  { label: "About", href: "/about", ready: true },
];

// Privacy, Terms and Contact link to the existing shop pages (WEBSITE_PLAN.md, section 8).
export const footerNav: NavItem[] = [
  { label: "About", href: "/about", ready: true },
  { label: "Privacy", href: `${shopUrl}/policies/privacy-policy`, ready: true },
  { label: "Terms", href: `${shopUrl}/policies/terms-of-service`, ready: true },
  { label: "Contact", href: `${shopUrl}/pages/contact`, ready: true },
  { label: "Shop", href: shopUrl, ready: true },
];
