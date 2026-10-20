import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUpRight } from "lucide-react";
import { causesByPage, whyListed, type Cause, type GivingPageId } from "./catalog";
import { radioKeyTarget } from "../ui/Segmented";

// The charities of the Give screen on six pages (founder, 2026-10-20). One horizontal pager the reader can
// swipe (CSS scroll snap, one page per screen width; on wide screens the cards sit in a grid inside the
// page) and, above it, a row of page tabs. Swiping changes the selected tab, a tab scrolls to its page, the
// arrow keys move between tabs. With Reduce Motion a jump is instant. Nothing is fetched from the charities:
// a card's button hands the charity to the screen's own "leaving HisFullGlory" dialog.
const pages = causesByPage();

export function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** "October 20, 2026" from "2026-10-20", the same on every device. */
export function checkedOn(dates: readonly string[]): string {
  const newest = [...dates].sort().at(-1);
  if (!newest) return "";
  return new Date(newest + "T00:00:00Z").toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function GiveCard({ cause, onGive }: { cause: Cause; onGive: (cause: Cause) => void }) {
  const host = new URL(cause.donationUrl).hostname;
  return (
    <article className="give-card">
      {cause.christian && <span className="give-label">Christian</span>}
      <h3>{cause.title}</h3>
      <p className="give-description">{cause.description}</p>
      <div className="give-why">
        <span>{whyListed(cause)}</span>
        <a className="give-source" href={cause.sourceUrl} target="_blank" rel="noopener noreferrer">
          Source<span className="sr-only"> (opens in a new tab)</span>
        </a>
      </div>
      {cause.countriesNote && <p className="give-note">{cause.countriesNote}</p>}
      {cause.checkoutChoice && (
        <p className="give-note">
          At the official GiveWell checkout choose “{cause.checkoutChoice}”.
        </p>
      )}
      <button type="button" className="secondary give-button" onClick={() => onGive(cause)}>
        <span>Give on {host}</span>
        <ArrowUpRight aria-hidden="true" focusable="false" size={18} />
      </button>
    </article>
  );
}

export function GivePager({ onGive }: { onGive: (cause: Cause) => void }) {
  const ids = pages.map((p) => p.id);
  const [current, setCurrent] = useState(0);
  const pager = useRef<HTMLDivElement>(null);
  const tabs = useRef<HTMLDivElement>(null);
  // The page a tab press is scrolling to: scroll events on the way there must not move the selection.
  const target = useRef<number | null>(null);
  const clear = useRef<number | undefined>(undefined);
  const base = useId();
  const tabId = (id: GivingPageId) => `${base}-tab-${id}`;
  const pageId = (id: GivingPageId) => `${base}-page-${id}`;

  function goTo(index: number) {
    const el = pager.current;
    setCurrent(index);
    if (!el) return;
    const left = index * el.clientWidth;
    if (Math.abs(el.scrollLeft - left) < 1) return;
    target.current = index;
    window.clearTimeout(clear.current);
    clear.current = window.setTimeout(() => (target.current = null), 900);
    el.scrollTo({ left, behavior: reducedMotion() ? "auto" : "smooth" });
  }

  // Swiping: the page in view is the selected one.
  useEffect(() => {
    const el = pager.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!el.clientWidth) return;
        const index = Math.max(0, Math.min(ids.length - 1, Math.round(el.scrollLeft / el.clientWidth)));
        if (target.current !== null) {
          if (index !== target.current) return;
          target.current = null;
        }
        setCurrent(index);
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
      window.clearTimeout(clear.current);
    };
  }, []);

  // A resize or a text-size change keeps the same page in view.
  useEffect(() => {
    const el = pager.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      el.scrollTo({ left: current * width, behavior: "auto" });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [current]);

  // The pager is as tall as the page in view, so a short page leaves no empty space under it. A page that
  // changes height (text size, a wrapped line) is followed.
  useEffect(() => {
    const el = pager.current;
    const page = el?.children[current] as HTMLElement | undefined;
    if (!el || !page) return;
    const fit = () => {
      el.style.height = page.offsetHeight + "px";
    };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(fit);
    observer.observe(page);
    return () => observer.disconnect();
  }, [current]);

  // The selected tab stays in view in the row of tabs (the row scrolls, the page does not).
  useEffect(() => {
    const row = tabs.current;
    const chosen = row?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!row || !chosen) return;
    row.scrollLeft = chosen.offsetLeft - (row.clientWidth - chosen.offsetWidth) / 2;
  }, [current]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const next = radioKeyTarget(event.key, ids, ids[current]);
    if (next === null) return;
    event.preventDefault();
    goTo(ids.indexOf(next));
    tabs.current?.querySelector<HTMLElement>(`[data-page="${next}"]`)?.focus();
  }

  return (
    <div className="give-pages">
      <div className="give-tabs segmented-scroll" role="tablist" aria-label="Giving pages" ref={tabs} onKeyDown={onKeyDown}>
        {pages.map((page, index) => (
          <button
            key={page.id}
            type="button"
            role="tab"
            id={tabId(page.id)}
            data-page={page.id}
            aria-selected={index === current}
            aria-controls={pageId(page.id)}
            tabIndex={index === current ? 0 : -1}
            onClick={() => goTo(index)}
          >
            {page.title}
          </button>
        ))}
      </div>
      <div className="give-indicator">
        <span className="give-dots" aria-hidden="true">
          {pages.map((page, index) => (
            <span key={page.id} className={index === current ? "give-dot give-dot-current" : "give-dot"} />
          ))}
        </span>
        <span className="give-count" role="status">
          {current + 1} of {pages.length}
        </span>
      </div>
      <div className="give-pager" ref={pager}>
        {pages.map((page) => (
          <section
            key={page.id}
            className="give-page"
            id={pageId(page.id)}
            role="tabpanel"
            aria-labelledby={`${pageId(page.id)}-title`}
          >
            <h2 id={`${pageId(page.id)}-title`}>{page.title}</h2>
            <p className="give-intro">{page.intro}</p>
            <div className="give-grid">
              {page.causes.map((cause) => (
                <GiveCard key={cause.id} cause={cause} onGive={onGive} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
