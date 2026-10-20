import { useEffect, useState, type ReactNode } from "react";
import { navigate } from "../platform/router";

// The screen's one h1 in the Large Title style (UI-SPEC 6.2). The shell pads the top safe area once,
// so the first title area of every screen starts below the notch (UI-SPEC 7.5).
export function LargeTitle({ children }: { children: ReactNode }) {
  return <h1 className="large-title">{children}</h1>;
}

// A sticky toolbar of 52px (UI-SPEC 7.1, 8.2): Back shows "‹ {parent}" and is named "Back to {parent}",
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
      <button type="button" className="toolbar-back" aria-label={`Back to ${back}`} onClick={() => navigate(to)}>
        <span aria-hidden="true">‹</span> {back}
      </button>
      {title ? <h1 className="toolbar-title">{title}</h1> : <span />}
      <div className="toolbar-actions">{actions}</div>
    </header>
  );
}
