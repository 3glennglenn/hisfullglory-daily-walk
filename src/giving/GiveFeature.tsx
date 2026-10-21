import { useId, type MouseEvent } from "react";
import { causesByPage } from "./catalog";
import { navigate } from "../platform/router";

// The Give card on You, directly under the large title (founder, 2026-10-20): the one prominent element on
// that screen. It names the first three options of the first Give page and opens /give.
const firstThree = causesByPage()[0].causes.slice(0, 3).map((c) => c.title);

function joinNames(names: string[]): string {
  if (names.length < 2) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function GiveFeature() {
  const heading = useId();
  return (
    <section className="give-feature" aria-labelledby={heading}>
      <h2 id={heading}>Give where it helps most</h2>
      <p>Six pages of charities chosen by independent evaluators, from malaria nets to Christian relief.</p>
      <p className="give-feature-names">{joinNames(firstThree)}</p>
      <a
        className="button"
        href="/give"
        onClick={(e: MouseEvent<HTMLAnchorElement>) => {
          // Modifier and middle clicks are left to the browser (new tab, copy link).
          if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          navigate("/give");
        }}
      >
        See where to give
      </a>
    </section>
  );
}
