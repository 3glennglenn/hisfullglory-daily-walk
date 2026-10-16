// The website's own file decides whether the support address may be shown, so the app and the
// site cannot disagree (GATE-03). The .ts extension lets Node's test runner resolve it too.
import { supportEmailReady } from "../site/src/data/legal.ts";

export const config = {
  supportEmail: "support@hisfullglory.com",
  // True only when mail sent to the support address is known to reach a person. While false, no
  // screen of the app shows the address or links to it.
  supportEmailReady,
  siteUrl: "https://hisfullglory.com",
  // The shop moved to its own subdomain on 2026-10-13; hisfullglory.com is the website.
  storeUrl: "https://shop.hisfullglory.com",
  // The public half of the Web Push key pair. Public by design; the private half is in
  // Supabase Vault (supabase/migrations/011_push_schedule.sql).
  pushPublicKey: "BI2X1QZC6n3ww4Sihf2xfYgsOOfb8DYfIp9Jurf_u7b6n1_QKQQYWQJce8eni3oxN5R1Jy5FsV1f12qVlud9SSg",
};

export interface Product {
  handle: string;
  title: string;
  price: string;
  image: string;
  benefit: string;
}
// Store titles and images verified from Shopify product JSON on 2026-10-05; prices verified
// on 2026-10-12 after the NLT (Gold Dust) and ESV went to $49.99. The NLT has other covers
// at higher prices, hence "From". Store currency is USD. Update these strings as prices change.
export const products: Product[] = [
  {
    handle: "nlt-every-woman-s-bible-filament-enabled",
    title: "NLT Every Woman’s Bible, Filament Enabled",
    price: "From $49.99 USD",
    image:
      "https://cdn.shopify.com/s/files/1/1085/1015/1001/files/NLTEveryWoman_sBible_FilamentEnabled_Hardcover_GoldDust_RedLetter_img1.avif?v=1790345711",
    benefit: "Make room for Scripture in your everyday life.",
  },
  {
    handle: "esv-applying-the-gospel-study-bible-for-men-hardcover",
    title: "ESV Applying the Gospel Study Bible for Men, Hardcover",
    price: "$49.99 USD",
    image:
      "https://cdn.shopify.com/s/files/1/1085/1015/1001/files/ESVApplyingtheGospelStudyBibleforMen_Hardcover_img1formaatwijzigingomgelijktezijnalsalleartikelen.jpg?v=1790344420",
    benefit: "Explore how the gospel shapes your daily walk.",
  },
  {
    handle: "amplified-study-bible-hardcover",
    title: "Amplified Study Bible, Hardcover",
    price: "$69.99 USD",
    image:
      "https://cdn.shopify.com/s/files/1/1085/1015/1001/files/theamplifiedstudybibleproductpicturejpg_613cc091-877e-4dff-b330-038bd28616a4.jpg?v=1790259084",
    benefit: "Take a closer look at the words you are reading.",
  },
];
