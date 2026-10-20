import { useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Dialog } from "../platform/Dialog";

// A sheet that holds content, not a question (UI-SPEC A4, 7.4): the reader's verse sheet, chapter sheet,
// picker and search. It stands on the same native dialog as the confirmations and text sheets of plan 05
// (.sheet-dialog), so the page behind it is inert, Escape and a tap outside close it, and it is one sheet
// at a time because only the screen that owns it renders it.
//
// On top of that: a 36 x 5 grabber, two detents (medium, up to about half the screen; large, nearly all of
// it) that a drag on the grabber or the title row moves between, a swipe down that dismisses, a Close
// button named after the object (aria-label "Close John 3:3"), a title that takes focus on open, focus
// back on the opener when it closes, and an optional inner page: with `back` the title row shows
// "‹ {previous page}" instead of the title (the title stays for assistive technology).
export function Sheet({
  title,
  object,
  detent = "medium",
  back,
  returnFocus,
  className,
  onClose,
  children,
}: {
  title: string;
  /** What Close closes, for its accessible name: "Close John 3:3". Defaults to the title. */
  object?: string;
  detent?: "medium" | "large";
  /** An inner page: the previous page's name and the way back to it. */
  back?: { label: string; onBack: () => void };
  /** Where focus goes on close; the element that was focused on open when this returns nothing. */
  returnFocus?: () => HTMLElement | null | undefined;
  className?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const head = useRef<HTMLDivElement>(null);
  const dialogOf = () => head.current?.closest("dialog") ?? null;
  const [size, setSize] = useState(detent);
  // A new page asks for the large detent; the reader can still drag it back.
  useEffect(() => setSize(detent), [detent]);
  // The control that opened the sheet, read before the dialog opens and moves focus into itself.
  const [opener] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));
  const give = useRef(returnFocus);
  give.current = returnFocus;

  // Focus moves to the title on open and to the new page's own heading when the page changes (a heading
  // marked data-sheet-focus), so a keyboard or screen reader user starts at the top of what is new.
  useEffect(() => {
    const box = dialogOf();
    if (!box) return;
    const target = box.querySelector<HTMLElement>("[data-sheet-focus]") ?? box.querySelector<HTMLElement>(`[id="${titleId}"]`);
    target?.focus({ preventScroll: true });
  }, [title, back?.label, titleId]);

  // Focus goes back after the dialog has closed: closing restores focus to what had it before, and this
  // runs after that, so the reader lands where the sheet says (the verse number), not where they pressed.
  useEffect(
    () => () => {
      const target = give.current?.() ?? opener;
      setTimeout(() => {
        // Another sheet took over (More leading to Search): it owns focus now.
        if (document.querySelector("dialog.reader-sheet[open]")) return;
        if (target?.isConnected) target.focus({ preventScroll: true });
        else document.getElementById("main")?.focus({ preventScroll: true });
      }, 0);
    },
    [opener],
  );

  // A drag on the grabber or the title row (never on a button in it).
  const drag = useRef<{ y: number; at: number } | null>(null);
  function move(dy: number, settle: boolean) {
    const box = dialogOf();
    if (!box) return;
    box.style.transition = settle ? "transform 160ms var(--ease-sheet)" : "none";
    box.style.transform = dy > 0 ? `translateY(${dy}px)` : "";
  }
  function down(event: PointerEvent<HTMLDivElement>) {
    if ((event.target as Element).closest("button")) return;
    drag.current = { y: event.clientY, at: performance.now() };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function drawn(event: PointerEvent<HTMLDivElement>) {
    if (drag.current) move(event.clientY - drag.current.y, false);
  }
  function up(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    drag.current = null;
    if (!start) return;
    const dy = event.clientY - start.y;
    const speed = dy / Math.max(1, performance.now() - start.at);
    move(0, true);
    if (dy > 40 && (dy > 160 || speed > 0.6)) {
      // From the large detent a short swipe settles at the medium one; a long or fast one dismisses.
      if (size === "large" && dy < 260 && speed < 1.2) setSize("medium");
      else onClose();
    } else if (dy < -50 && size === "medium") setSize("large");
  }

  return (
    <Dialog
      className={`sheet-dialog reader-sheet reader-sheet-${size}${className ? ` ${className}` : ""}`}
      labelledBy={titleId}
      onClose={(event) => {
        event.preventDefault();
        onClose();
      }}
      onBackdrop={onClose}
    >
      <div className="sheet-head" ref={head} onPointerDown={down} onPointerMove={drawn} onPointerUp={up} onPointerCancel={up}>
        <span className="sheet-grabber" aria-hidden="true" />
        <div className="sheet-bar">
          {back ? (
            <button type="button" className="sheet-back" aria-label={`Back to ${back.label}`} onClick={back.onBack}>
              <span aria-hidden="true">‹</span> {back.label}
            </button>
          ) : null}
          <h2 id={titleId} tabIndex={-1} className={back ? "sheet-title sr-only" : "sheet-title"}>
            {title}
          </h2>
          <button type="button" className="sheet-close" aria-label={`Close ${object ?? title}`} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      <div className="sheet-body">{children}</div>
    </Dialog>
  );
}
