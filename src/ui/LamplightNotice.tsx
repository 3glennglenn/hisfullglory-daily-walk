import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { LampDesk } from "lucide-react";
import { useAppearance } from "../platform/AppearanceProvider";

// The Lamplight notice (UI-SPEC 4, D-03): when Lamplight turns on by itself, a calm card above the tab bar
// says why and offers a way out. It is not a dialog and not an alert: nothing is blocked, focus is not moved
// and there is no timer. Its sentence is also written into the shell's pre-rendered status region
// (#lamplight-status), so a screen reader announces it once, politely.
export const NOTICE_ON = "Lamplight is on, because your device is set to dark.";
export const NOTICE_OFF = "Lamplight is off. You can turn it on in You, Appearance.";

/** The sentence the notice shows, or "" while it does not show; the shell writes it into the status region. */
export const noticeText = (variant: "on" | "off" | undefined) =>
  variant === "on" ? NOTICE_ON : variant === "off" ? NOTICE_OFF : "";

// The tab bar's selected tab is the next stop after the notice in the Tab order, so it takes focus when the
// notice goes away from under the keyboard.
const focusSelectedTab = () =>
  requestAnimationFrame(() => document.querySelector<HTMLElement>('nav.tabbar [aria-current="page"]')?.focus());

/**
 * The card. `tab` and `path` say where the reader is: another tab ends the notice for this session, and after
 * "Turn off" any other screen does.
 */
export function LamplightNotice({ tab, path }: { tab: string | null; path: string }) {
  const { notice, keepNotice, turnOffNotice, hideNotice, escapeNotice, leaveNotice } = useAppearance();
  const region = useRef<HTMLElement>(null);
  const hideButton = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  const origin = useRef<{ tab: string | null; path: string; variant: string } | null>(null);
  const variant = notice?.variant;

  // Where the reader was when this text appeared; a move away from there ends the notice.
  useEffect(() => {
    if (!variant) {
      origin.current = null;
      return;
    }
    const at = origin.current;
    if (!at || at.variant !== variant) {
      origin.current = { tab, path, variant };
      return;
    }
    if (variant === "on" ? at.tab !== tab : at.path !== path) leaveNotice();
  }, [variant, tab, path, leaveNotice]);

  // While shown, main's bottom padding grows by the card's height so the last content scrolls clear of it
  // (WCAG 2.4.11). The height is a CSS variable on <html> that other floating things can respect too.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const card = region.current;
    if (!variant || !card) {
      root.style.removeProperty("--notice-h");
      return;
    }
    // Plus the 12px between the card and the tab bar.
    const measure = () => root.style.setProperty("--notice-h", `${Math.ceil(card.getBoundingClientRect().height) + 12}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(card);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--notice-h");
    };
  }, [variant]);

  // After Turn off the button that was pressed is gone; the one that replaces it takes focus.
  useEffect(() => {
    if (variant === "off" && refocus.current) {
      refocus.current = false;
      hideButton.current?.focus();
    }
  }, [variant]);

  if (!variant) return null;

  const focusInside = () => !!region.current?.contains(document.activeElement);
  // Only while focus is inside the card does Escape act on it: an open sheet or dialog takes Escape first.
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    escapeNotice();
    focusSelectedTab();
  };
  const closeAnd = (action: () => void) => () => {
    const inside = focusInside();
    action();
    if (inside) focusSelectedTab();
  };

  return (
    <section ref={region} role="region" aria-label="Lamplight" className="lamplight-notice" onKeyDown={onKeyDown}>
      <LampDesk className="lamplight-notice-icon" size={20} aria-hidden="true" focusable="false" />
      <p className="lamplight-notice-text">{noticeText(variant)}</p>
      <div className="lamplight-notice-actions">
        {variant === "on" ? (
          <>
            <button type="button" className="lamplight-keep" onClick={closeAnd(keepNotice)}>
              Keep Lamplight
            </button>
            <button
              type="button"
              className="lamplight-plain"
              onClick={() => {
                refocus.current = focusInside();
                turnOffNotice();
              }}
            >
              Turn off
            </button>
          </>
        ) : (
          <button ref={hideButton} type="button" className="lamplight-plain" onClick={closeAnd(hideNotice)}>
            Hide notice
          </button>
        )}
      </div>
    </section>
  );
}
