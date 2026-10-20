import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Ellipsis, Headphones, Library, Search } from "lucide-react";
import { navigate } from "../platform/router";

// The reader's sticky toolbar (UI-SPEC A3): 52px on --bar with 44px buttons. Books, the previous chapter, the
// title pill that opens the picker, the next chapter, then Search and Listen, or More when they do not fit.
// The width budget decides which set shows, in CSS (styles.css, "The reader"): 430px and wider show Books,
// previous, title, next, Search and Listen; 360 to 429px show Books, previous, title, next and More; under
// 360px, and at every width in large-text mode, previous, title, next and More. A control that is not shown
// is not in the accessibility tree either (display: none), so nothing is read twice. Previous and next are
// part of the toolbar, so they stay reachable at every scroll position; each is absent only at the very
// start (Genesis 1) or end (Revelation 22) of the Bible.
export interface ChapterStep {
  label: string;
  path: string;
}
export function ReaderToolbar({
  reference,
  previous,
  next,
  onTitle,
  onSearch,
  onListen,
  listenName,
  onMore,
}: {
  /** "John 3". Absent while the Bible is still opening. */
  reference?: string;
  /** The chapter before: its accessible name ("Previous chapter: John 2") and its address. */
  previous?: ChapterStep;
  next?: ChapterStep;
  onTitle?: () => void;
  onSearch?: () => void;
  /** Present only where the device can read aloud. */
  onListen?: () => void;
  listenName?: string;
  onMore?: () => void;
}) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const chapterButton = (step: ChapterStep | undefined, icon: ReactNode) =>
    step ? (
      <button type="button" className="rt-button" aria-label={step.label} onClick={() => navigate(step.path)}>
        {icon}
      </button>
    ) : reference ? (
      <span className="rt-slot" aria-hidden="true" />
    ) : null;
  return (
    <header className="reader-toolbar" data-scrolled={scrolled ? "true" : undefined}>
      <button type="button" className="rt-button rt-books" aria-label="Books" onClick={() => navigate("/bible")}>
        <Library size={22} aria-hidden="true" focusable="false" />
      </button>
      {chapterButton(previous, <ChevronLeft size={24} aria-hidden="true" focusable="false" />)}
      {reference && (
        <button type="button" className="rt-title" aria-haspopup="dialog" onClick={onTitle}>
          <span className="rt-title-text">{reference}</span>
          <ChevronDown size={18} aria-hidden="true" focusable="false" />
        </button>
      )}
      {chapterButton(next, <ChevronRight size={24} aria-hidden="true" focusable="false" />)}
      {onSearch && (
        <button type="button" className="rt-button rt-search" aria-label="Search the Bible" onClick={onSearch}>
          <Search size={22} aria-hidden="true" focusable="false" />
        </button>
      )}
      {onListen && (
        <button type="button" className="rt-button rt-listen" aria-label={listenName} onClick={onListen}>
          <Headphones size={22} aria-hidden="true" focusable="false" />
        </button>
      )}
      {onMore && (
        <button type="button" className="rt-button rt-more" aria-label="More options" aria-haspopup="dialog" onClick={onMore}>
          <Ellipsis size={22} aria-hidden="true" focusable="false" />
        </button>
      )}
    </header>
  );
}
