// Study Bibles sold in the shop, grouped by study goal (docs/WEBSITE_PLAN.md, section 4).
// `handle` is the product's address in Shopify. Prices and stock live in the shop only, so
// they are never repeated here. Descriptions state facts from the shop's own listings.
// `image` is the product's first picture in the shop, loaded from Shopify's own image
// address, which can resize it (`&width=`). The size given is the picture's real size.
export interface Resource {
  goal: string;
  title: string;
  handle: string;
  summary: string;
  image: { src: string; width: number; height: number; alt: string };
}

export const resources: Resource[] = [
  {
    goal: "For women",
    title: "NLT Every Woman’s Bible, Filament Enabled",
    handle: "nlt-every-woman-s-bible-filament-enabled",
    summary:
      "New Living Translation. Study notes and devotionals written by women, with the free Filament Bible app as a companion.",
    image: {
      src: "https://cdn.shopify.com/s/files/1/1085/1015/1001/files/NLTEveryWoman_sBible_FilamentEnabled_Hardcover_GoldDust_RedLetter_img1.avif?v=1790345711",
      width: 1508,
      height: 1296,
      alt: "The NLT Every Woman’s Bible, hardcover in Gold Dust",
    },
  },
  {
    goal: "For men",
    title: "ESV Applying the Gospel Study Bible for Men",
    handle: "esv-applying-the-gospel-study-bible-for-men-hardcover",
    summary:
      "English Standard Version. 365 daily devotionals, gospel-centered study notes and an introduction to each book.",
    image: {
      src: "https://cdn.shopify.com/s/files/1/1085/1015/1001/files/ESVApplyingtheGospelStudyBibleforMen_Hardcover_img1formaatwijzigingomgelijktezijnalsalleartikelen.jpg?v=1790344420",
      width: 925,
      height: 1200,
      alt: "The ESV Applying the Gospel Study Bible for Men, hardcover",
    },
  },
  {
    goal: "Deep study",
    title: "Amplified Study Bible",
    handle: "amplified-study-bible-hardcover",
    summary:
      "Amplified translation, with more than 5,000 study notes and introductions to all 66 books.",
    image: {
      src: "https://cdn.shopify.com/s/files/1/1085/1015/1001/files/theamplifiedstudybibleproductpicturejpg_613cc091-877e-4dff-b330-038bd28616a4.jpg?v=1790259084",
      width: 925,
      height: 1200,
      alt: "The Amplified Study Bible, hardcover",
    },
  },
];
