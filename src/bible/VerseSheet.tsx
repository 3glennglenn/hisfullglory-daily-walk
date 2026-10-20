import { useState, type KeyboardEvent } from "react";
import { Bookmark, BookmarkCheck, Copy, Highlighter, NotebookPen, Share, type LucideIcon } from "lucide-react";
import { Sheet } from "../ui/Sheet";
import { radioKeyTarget } from "../ui/Segmented";
import type { BibleBook, Chapter } from "./provider";
import { usePlatform } from "../platform/store";
import { navigate, passagePath } from "../platform/router";
import { localDate } from "../storage";

// One sheet for a verse (UI-SPEC A4, D-08): its title is the reference, the verse is tinted gold in the text
// while it is open, and its actions are in one row: Highlight, Save verse, Add to journal, Copy verse, Share
// verse. Plan 10's next task adds the layers under "Around this verse".
export interface VerseSheetProps {
  book: BibleBook;
  chapter: Chapter;
  verse: number;
  onClose: () => void;
  returnFocus?: () => HTMLElement | null;
}

const swatches = [
  { value: "gold", label: "Gold" },
  { value: "sage", label: "Sage" },
  { value: "rose", label: "Rose" },
  { value: "none", label: "None" },
] as const;

function Action({
  icon: Icon,
  label,
  pressed,
  expanded,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  pressed?: boolean;
  expanded?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="verse-action"
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!disabled) onClick();
      }}
    >
      <Icon size={24} aria-hidden="true" focusable="false" />
      <span>{label}</span>
    </button>
  );
}

export function VerseSheet({ book, chapter, verse, onClose, returnFocus }: VerseSheetProps) {
  const { state, update } = usePlatform();
  const [swatchesOpen, setSwatchesOpen] = useState(false);
  const [status, setStatus] = useState("");

  const reference = `${book.name} ${chapter.number}:${verse}`;
  const source = passagePath(book.slug, chapter.number, verse);
  const text = chapter.verses.find((v) => v.number === verse)?.text ?? "";
  const saved = state.bookmarks.includes(source);
  const colour = state.highlights[source] ?? "none";

  function journal() {
    const made = update((s) => ({
      ...s,
      entries: [{ id: crypto.randomUUID(), type: "Bible passage", title: reference, body: "", date: localDate(), source }, ...s.entries],
    }));
    if (made) navigate("/journal");
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${text} ${reference} (WEB)`);
      setStatus("Copied.");
    } catch {
      setStatus("Copy unavailable in this browser.");
    }
  }
  async function share() {
    try {
      const sharing = { title: reference, text: `${reference} (WEB)`, url: window.location.origin + source };
      if (navigator.share) await navigator.share(sharing);
      else {
        await navigator.clipboard.writeText(sharing.url);
        setStatus("Passage link copied.");
      }
    } catch {
      setStatus("Share canceled or unavailable.");
    }
  }
  function toggleSaved() {
    update((s) => ({
      ...s,
      bookmarks: s.bookmarks.includes(source) ? s.bookmarks.filter((p) => p !== source) : [...s.bookmarks, source],
    }));
  }
  function choose(value: (typeof swatches)[number]["value"]) {
    update((s) => {
      const highlights = { ...s.highlights };
      if (value === "none") delete highlights[source];
      else highlights[source] = value;
      return { ...s, highlights };
    });
  }
  function onSwatchKey(event: KeyboardEvent<HTMLDivElement>) {
    const values = swatches.map((s) => s.value);
    const next = radioKeyTarget(event.key, values, colour as (typeof values)[number]);
    if (next === null) return;
    event.preventDefault();
    choose(next);
    event.currentTarget.querySelector<HTMLElement>(`[data-value="${next}"]`)?.focus();
  }

  return (
    <Sheet title={reference} object={reference} returnFocus={returnFocus} onClose={onClose}>
      <div className="verse-actions">
        <Action icon={Highlighter} label="Highlight" expanded={swatchesOpen} onClick={() => setSwatchesOpen(!swatchesOpen)} />
        <Action icon={saved ? BookmarkCheck : Bookmark} label={saved ? "Saved" : "Save verse"} pressed={saved} onClick={toggleSaved} />
        <Action icon={NotebookPen} label="Add to journal" onClick={journal} />
        <Action icon={Copy} label="Copy verse" disabled={!text} onClick={() => void copy()} />
        <Action icon={Share} label="Share verse" onClick={() => void share()} />
      </div>
      {swatchesOpen && (
        <div className="swatches" role="radiogroup" aria-label="Highlight colour" onKeyDown={onSwatchKey}>
          {swatches.map((s) => (
            <button
              key={s.value}
              type="button"
              role="radio"
              className={`swatch swatch-${s.value}`}
              data-value={s.value}
              aria-checked={colour === s.value}
              tabIndex={colour === s.value ? 0 : -1}
              onClick={() => choose(s.value)}
            >
              <span className="swatch-dot" aria-hidden="true" />
              <span className="swatch-name">{s.label}</span>
            </button>
          ))}
        </div>
      )}
      <p role="status" className="sheet-status">
        {status}
      </p>
    </Sheet>
  );
}
