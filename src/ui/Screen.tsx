import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { CircleUser } from "lucide-react";
import { cameFrom, navigate } from "../platform/router";

// The screen's one h1 in the Large Title style (UI-SPEC 6.2). The shell pads the top safe area once,
// so the first title area of every screen starts below the notch (UI-SPEC 7.5).
export function LargeTitle({ children }: { children: ReactNode }) {
  return <h1 className="large-title">{children}</h1>;
}

// The round You button (01.2 N-02): 44 x 44, at the trailing end of the title row of each tab's root screen, never on a
// pushed screen or in a full-screen flow. It is a link to /you, like the tab links: a plain left click goes through the
// router (without scrolling the page behind the sheet), modifier and middle clicks are left to the browser.
export function YouButton() {
  return (
    <a
      className="you-button"
      href="/you"
      aria-label="You"
      draggable={false}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigate("/you", { keepScroll: true });
      }}
    >
      <CircleUser aria-hidden="true" focusable="false" size={22} strokeWidth={1.75} />
    </a>
  );
}

// The title row of a tab's root screen (01.2 N-02): the Large Title, then the screen's own actions (a search button)
// and the You button, aligned with the title's first line.
export function TitleRow({ title, className, actions }: { title: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <div className={className ? `title-row ${className}` : "title-row"}>
      <LargeTitle>{title}</LargeTitle>
      <div className="title-actions">
        {actions}
        <YouButton />
      </div>
    </div>
  );
}

// A sticky toolbar of 52px (UI-SPEC 7.1, 8.2): Back shows "‹ {parent}" and is named "Back to {parent}". When the parent
// is the screen the reader came from, Back goes back through history (so "Back to You" lands on the You sheet over the
// right tab, with the scroll position kept); otherwise it navigates to the parent,
// an optional centred title (then the title is the screen's h1) and trailing actions. It turns into the
// floating bar (blur and elevation) once the page has scrolled.
export function Toolbar({
  back,
  to,
  title,
  actions,
}: {
  /** Name of the parent screen, for example "You". */
  back: string;
  /** Path of the parent screen. */
  to: string;
  title?: ReactNode;
  actions?: ReactNode;
}) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header className="toolbar" data-scrolled={scrolled ? "true" : undefined}>
      <button type="button" className="toolbar-back" aria-label={`Back to ${back}`} onClick={() => (cameFrom() === to ? history.back() : navigate(to))}>
        <span aria-hidden="true">‹</span> {back}
      </button>
      {title ? <h1 className="toolbar-title">{title}</h1> : <span />}
      <div className="toolbar-actions">{actions}</div>
    </header>
  );
}
