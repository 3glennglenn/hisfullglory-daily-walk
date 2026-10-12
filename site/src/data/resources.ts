// Study Bibles sold in the shop, grouped by study goal (docs/WEBSITE_PLAN.md, section 4).
// `handle` is the product's address in Shopify. Prices and stock live in the shop only, so
// they are never repeated here. Descriptions state facts from the shop's own listings.
export interface Resource {
  goal: string;
  title: string;
  handle: string;
  summary: string;
}

export const resources: Resource[] = [
  {
    goal: "For women",
    title: "NLT Every Woman’s Bible, Filament Enabled",
    handle: "nlt-every-woman-s-bible-filament-enabled",
    summary:
      "New Living Translation. Study notes and devotionals written by women, with the free Filament Bible app as a companion.",
  },
  {
    goal: "For men",
    title: "ESV Applying the Gospel Study Bible for Men",
    handle: "esv-applying-the-gospel-study-bible-for-men-hardcover",
    summary:
      "English Standard Version. 365 daily devotionals, gospel-centered study notes and an introduction to each book.",
  },
  {
    goal: "Deep study",
    title: "Amplified Study Bible",
    handle: "amplified-study-bible-hardcover",
    summary:
      "Amplified translation, with more than 5,000 study notes and introductions to all 66 books.",
  },
];
