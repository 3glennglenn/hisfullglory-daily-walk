import { useId, type MouseEvent } from "react";
import { config, products } from "../config";
import { track } from "../analytics";
import { navigate } from "../platform/router";
import { lowestPrice } from "../shopPrice";

// The Study Bibles card on Today (01.2 D-04, D-10; canvas "Optie 2 · Today"): under the walk row, the shop's one
// place on Today. The title, a Shop link to /shop, three covers that each open the product on the shop, and one muted
// line with the lowest price. The covers are drawn on the device from the spine tokens (the canvas draws them so);
// Today loads no product picture and nothing from another host, so a reader's address reaches the shop only when
// they follow a link. The real pictures stay on the Shop screen.

/** "From $49.99 USD" -> "from $49.99": the price as it is spoken in a link's name. */
const spokenPrice = (price: string) => price.replace(/\s+USD$/i, "").replace(/^From\b/, "from");

export function StudyBiblesCard() {
  const heading = useId();
  const lowest = lowestPrice(products);
  return (
    <section className="study-card" aria-labelledby={heading}>
      <div className="study-card-head">
        <h2 id={heading}>Study Bibles for your walk</h2>
        <a
          className="study-card-shop"
          href="/shop"
          onClick={(e: MouseEvent<HTMLAnchorElement>) => {
            // Modifier and middle clicks are left to the browser (new tab, copy link).
            if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            navigate("/shop");
          }}
        >
          Shop
        </a>
      </div>
      <div className="study-card-body">
        <ul className="study-covers">
          {products.map((p, i) => (
            <li key={p.handle}>
              <a
                className={`study-cover study-cover-${(i % 3) + 1}`}
                href={`${config.storeUrl}/products/${p.handle}`}
                aria-label={`${p.title}, ${spokenPrice(p.price)}`}
                onClick={() => track("product_clicked", { product: p.handle })}
              >
                {p.shortName}
              </a>
            </li>
          ))}
        </ul>
        {lowest && <p className="study-card-note">Hand-picked, from {lowest}</p>}
      </div>
    </section>
  );
}
