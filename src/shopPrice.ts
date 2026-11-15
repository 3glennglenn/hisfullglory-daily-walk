import type { Product } from "./config";

// The price line of the Study Bibles card on Today (01.2 D-04) is computed from the product data, never typed. This file
// has no JSX so the unit tests can import it (src/features/ShopFeature.tsx re-exports it).

const AMOUNT = /\$\s?(\d+(?:,\d{3})*(?:\.\d{1,2})?)/g;

/**
 * The smallest dollar amount found in the products' price strings, written "$49.99", or undefined when no string
 * holds one. "From $49.99 USD" and "$69.99 USD" give "$49.99".
 */
export function lowestPrice(list: ReadonlyArray<Pick<Product, "price">>): string | undefined {
  let least: number | undefined;
  for (const { price } of list)
    for (const match of price.matchAll(AMOUNT)) {
      const amount = Number(match[1].replace(/,/g, ""));
      if (Number.isFinite(amount) && (least === undefined || amount < least)) least = amount;
    }
  return least === undefined ? undefined : `$${least.toFixed(2)}`;
}
