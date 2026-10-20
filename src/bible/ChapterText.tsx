import { Fragment, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent } from "react";
import { hasSpeakers, speakerNote, speakerParts, type BibleBook, type Chapter } from "./provider";
import { passagePath } from "../platform/router";

// The chapter's verses as text (UI-SPEC A3, WCAG 4.1.2). A verse is a span, not a toggle button: the
// reader reads running text, a screen reader hears text. Each verse's number is a button, and the numbers
// form one composite: a single Tab stop (roving tabindex), the arrow keys move between verses, Home and End
// jump, Enter or Space opens the verse. A pointer tap anywhere on a verse's text opens it too, unless it
// ended a text selection or was a long press, so selecting and copying with the native handles still works.
// The markup is the same in both looks; Cover sets each verse as a block with its number hanging in a 24px
// margin, Marked sets the verses as running text with raised numbers (src/styles.css, section "The reader").

/** A press this long (in ms) is a long press: the browser's own text selection and copy menu, not a tap. */
export const LONG_PRESS_MS = 500;

export interface ChapterTextProps {
  book: BibleBook;
  chapter: Chapter;
  /** Highlight colour per passage address (the private state). */
  highlights: Record<string, string>;
  /** The verse whose sheet is open, or that a link pointed at. */
  selected?: number;
  /** The verse being read aloud. */
  speaking?: number;
  /** Verses that carry a verse-scope note, for the margin mark and the accessible name. */
  notes: ReadonlySet<number>;
  /** The reader chose a verse: a number activated, or a tap on its text. */
  onOpen: (verse: number) => void;
}

const firstWord = (text: string) => /^\S+/.exec(text)?.[0] ?? "";
const restAfterFirstWord = (text: string) => text.slice(firstWord(text).length);
const sameVerse = (el: Element | null) => el?.closest<HTMLElement>("[data-verse]") ?? null;

export function ChapterText({ book, chapter, highlights, selected, speaking, notes, onOpen }: ChapterTextProps) {
  const numbers = chapter.verses.map((v) => v.number);
  const [active, setActive] = useState<number>(selected && numbers.includes(selected) ? selected : numbers[0]);
  const root = useRef<HTMLDivElement>(null);
  // What the pointer did last, read when the click arrives: when it went down and whether text was selected.
  const press = useRef<{ at: number; selecting: boolean } | null>(null);

  function focusNumber(verse: number) {
    setActive(verse);
    root.current?.querySelector<HTMLElement>(`[data-verse="${verse}"] .verse-num`)?.focus();
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const verse = sameVerse(event.target as Element);
    if (!verse || !(event.target as Element).classList.contains("verse-num")) return;
    const at = numbers.indexOf(Number(verse.dataset.verse));
    let to = -1;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") to = Math.min(numbers.length - 1, at + 1);
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") to = Math.max(0, at - 1);
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = numbers.length - 1;
    if (to < 0) return;
    event.preventDefault();
    focusNumber(numbers[to]);
  }
  function onPointerDown() {
    // Read now: the browser clears an existing selection when a press lands on text, before the click.
    press.current = { at: performance.now(), selecting: !!window.getSelection()?.toString() };
  }
  function onFocus(event: FocusEvent<HTMLDivElement>) {
    const target = event.target as Element;
    if (target.classList.contains("verse-num")) setActive(Number(sameVerse(target)?.dataset.verse));
  }
  function onClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as Element;
    const verse = sameVerse(target);
    if (!verse) return;
    const n = Number(verse.dataset.verse);
    if (target.closest(".verse-num")) {
      onOpen(n);
      return;
    }
    const down = press.current;
    press.current = null;
    if (event.button !== 0 || event.detail > 1 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (window.getSelection()?.toString() || down?.selecting) return;
    if (down && performance.now() - down.at >= LONG_PRESS_MS) return;
    onOpen(n);
  }

  return (
    <div className={chapter.verses.length >= 100 ? "chapter-text wide-numbers" : "chapter-text"} ref={root} onKeyDown={onKeyDown} onFocus={onFocus} onPointerDown={onPointerDown} onClick={onClick}>
      {/* The printed chapter numeral and its ribbon: drawn in the Marked look only, never read. */}
      <span className="chapter-opening" aria-hidden="true">
        <span className="chapter-numeral">{chapter.number}</span>
        <span className="chapter-ribbon" />
      </span>
      {book.id === "SNG" && hasSpeakers(chapter) && <p className="speaker-note">{speakerNote}</p>}
      {chapter.verses.map((v) => {
        const path = passagePath(book.slug, chapter.number, v.number);
        const { above, parts } = speakerParts(v);
        const hasNote = notes.has(v.number);
        const label = `Verse ${v.number}, notes and actions${hasNote ? ", has notes" : ""}`;
        const classes = ["verse", `highlight-${highlights[path] ?? "none"}`];
        if (selected === v.number) classes.push("selected");
        if (speaking === v.number) classes.push("speaking");
        return (
          <Fragment key={v.number}>
            {above.map((text, i) => (
              <p className="speaker" key={i}>
                {text}
              </p>
            ))}
            <span id={`verse-${v.number}`} data-verse={v.number} className={classes.join(" ")}>
              {/* The number and the verse's first word never part at a line end. */}
              <span className="verse-lead">
                <button
                  type="button"
                  className="verse-num"
                  aria-label={label}
                  tabIndex={active === v.number ? 0 : -1}
                  data-note={hasNote ? "true" : undefined}
                >
                  {v.number}
                  {hasNote && <span className="verse-mark" aria-hidden="true" />}
                </button>
                {!v.omitted && !parts[0].label && firstWord(parts[0].text)}
              </span>
              <span className="verse-text">
                {v.omitted ? (
                  <em>Verse omitted in this WEB edition. See the source notes.</em>
                ) : (
                  parts.map((part, i) => (
                    <Fragment key={i}>
                      {part.label && (
                        <>
                          <span className="speaker">{part.label}</span>{" "}
                        </>
                      )}
                      {i === 0 && !part.label ? restAfterFirstWord(part.text) : part.text}
                    </Fragment>
                  ))
                )}
              </span>{" "}
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}
