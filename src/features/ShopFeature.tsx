import { useId, useState, type MouseEvent } from "react";
import { BookOpen } from "lucide-react";
import { products, type Product } from "../config";
import { navigate } from "../platform/router";

// The Shop card on You, directly under the Give card (founder, 2026-10-22): the shop's second always-visible
// place after the bag on Today. Three small covers, one line, and an outlined button, so the Give card keeps
// the only filled button on the screen.
function Thumb({ product }: { product: Product }) {
  const [failed, setFailed] = useState(false);
  return (
    <li className="shop-feature-thumb">
      {!failed ? (
        <img src={product.image} alt={product.title} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <div className="book-placeholder">
          <BookOpen size={24} aria-hidden="true" />
          <span>HisFullGlory</span>
        </div>
      )}
    </li>
  );
}

export function ShopFeature() {
  const heading = useId();
  return (
    <section className="shop-feature" aria-labelledby={heading}>
      <h2 id={heading}>Study Bibles for your walk</h2>
      <p>Hand-picked study Bibles from the HisFullGlory shop.</p>
      <ul className="shop-feature-thumbs">
        {products.map((p) => (
          <Thumb key={p.handle} product={p} />
        ))}
      </ul>
      <a
        className="button secondary"
        href="/shop"
        onClick={(e: MouseEvent<HTMLAnchorElement>) => {
          // Modifier and middle clicks are left to the browser (new tab, copy link).
          if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          navigate("/shop");
        }}
      >
        Visit the shop
      </a>
    </section>
  );
}
