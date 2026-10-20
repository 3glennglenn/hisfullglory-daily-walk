import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  Bookmark,
  BookmarkCheck,
  ChevronRight,
  Copy,
  FileText,
  Highlighter,
  NotebookPen,
  Share,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Sheet } from "../ui/Sheet";
import { GroupedList } from "../ui/List";
import { LayerBlock } from "../ui/LayerBlock";
import { AiBadge, ReviewPill } from "../ui/Badges";
import { radioKeyTarget } from "../ui/Segmented";
import { AiExplanationCard } from "./AiExplanation";
import { aiFor, type AiStatus } from "./ai";
import { knowledgeFor, type KnowledgeRecord } from "./knowledge";
import { referenceFromPath } from "./passages";
import type { BibleBook, BibleData, Chapter } from "./provider";
import { Feed } from "../social/Feed";
import { supabase } from "../supabase";
import { usePlatform } from "../platform/store";
import { navigate, passagePath } from "../platform/router";
import { localDate } from "../storage";

// One sheet for a verse, and the same sheet for a whole chapter (UI-SPEC A4, D-08). Its root page has the
// verse's actions (no actions for a chapter) and, under "Around this verse", the three layers in a fixed order:
// Context, AI explanation, Community. Each layer is a row that opens its own page inside this sheet, with
// "‹ {reference}" to come back and Close. The layers never mix: each page shows exactly one LayerBlock, with
// its own words, icon, frame and colour (AGENTS.md, UI-SPEC 5.3).
export type LayerPage = "context" | "ai" | "community";

export interface VerseSheetProps {
  data: BibleData;
  book: BibleBook;
  chapter: Chapter;
  /** The verse; absent for the chapter sheet ("Around John 3"). */
  verse?: number;
  /** A page to open at, for the old ?tab= links. */
  startPage?: LayerPage;
  records: readonly KnowledgeRecord[];
  ai: AiStatus | "pending";
  onLoadAgain: () => void;
  /** The reader chose another verse from inside a layer page (the translation comparison). */
  onVerse: (verse: number) => void;
  onClose: () => void;
  returnFocus?: () => HTMLElement | null;
}

export const AI_NONE = "No AI explanation for this chapter yet.";
export const AI_FAILED = "The AI explanation could not be loaded. Check your connection, then tap Load again.";
export const COMMUNITY_OFFLINE = "Community voices need a connection.";
export const CONTEXT_PENDING = "Context for this book is being written.";

const reviewWord = (review: KnowledgeRecord["review"]) =>
  review === "reviewed" ? "Reviewed" : review === "editorial draft" ? "Editorial draft" : "Editorial observation";

/** Whether the device is online, following the browser's own events. */
function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const change = () => setOnline(navigator.onLine);
    window.addEventListener("online", change);
    window.addEventListener("offline", change);
    return () => {
      window.removeEventListener("online", change);
      window.removeEventListener("offline", change);
    };
  }, []);
  return online;
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

/** A row of "Around this verse": its icon, its words, and where it leads. Without `onOpen` it is information only. */
function LayerRow({
  kind,
  title,
  badge,
  pill,
  detail,
  onOpen,
  focusMe,
  children,
}: {
  kind: LayerPage;
  title: string;
  badge?: boolean;
  pill?: string;
  detail: ReactNode;
  onOpen?: () => void;
  focusMe?: boolean;
  children?: ReactNode;
}) {
  const Icon = kind === "context" ? FileText : kind === "ai" ? Sparkles : Users;
  const inner = (
    <>
      <Icon className="layer-row-icon" size={24} aria-hidden="true" focusable="false" />
      <span className="list-row-text">
        <span className="layer-row-label">
          <span className="list-row-title">{title}</span>
          {badge && <AiBadge />}
          {pill && <ReviewPill>{pill}</ReviewPill>}
        </span>
        <span className="list-row-detail">{detail}</span>
        {children}
      </span>
      {onOpen && <ChevronRight className="list-row-chevron" aria-hidden="true" focusable="false" size={20} />}
    </>
  );
  const className = `list-row layer-row layer-row-${kind}`;
  return (
    <li>
      {onOpen ? (
        <button type="button" className={className} data-layer-row={kind} data-sheet-focus={focusMe ? "true" : undefined} onClick={onOpen}>
          {inner}
        </button>
      ) : (
        <div className={className} data-layer-row={kind}>
          {inner}
        </div>
      )}
    </li>
  );
}

export function VerseSheet({ data, book, chapter, verse, startPage, records, ai, onLoadAgain, onVerse, onClose, returnFocus }: VerseSheetProps) {
  const { state, update } = usePlatform();
  const online = useOnline();
  const [page, setPage] = useState<"root" | LayerPage>(startPage ?? "root");
  // The row to put focus on when Back returns to the root page: the one that was opened.
  const [focusRow, setFocusRow] = useState<LayerPage | null>(null);
  const [swatchesOpen, setSwatchesOpen] = useState(false);
  const [status, setStatus] = useState("");

  const chapterReference = `${book.name} ${chapter.number}`;
  const reference = verse ? `${chapterReference}:${verse}` : chapterReference;
  const title = verse ? reference : `Around ${chapterReference}`;
  const source = passagePath(book.slug, chapter.number, verse);
  const text = chapter.verses.find((v) => v.number === verse)?.text ?? "";
  const saved = state.bookmarks.includes(source);
  const colour = state.highlights[source] ?? "none";

  const note = knowledgeFor(book.slug, chapter.number, verse, records);
  const contextDetail = !note
    ? CONTEXT_PENDING
    : note.scope === "book"
      ? `About ${book.name} as a whole`
      : note.scope === "chapter"
        ? `About ${chapterReference}`
        : `About ${chapterReference}:${note.start}${note.end && note.end !== note.start ? `–${note.end}` : ""}`;
  const record = ai !== "pending" && ai.state === "ready" ? aiFor(ai.records, book.slug, chapter.number) : undefined;
  const aiDetail = !record
    ? AI_NONE
    : verse && record.translations.some((t) => t.verse === verse)
      ? "How translations differ here"
      : record.scope === "book"
        ? `About ${book.name} as a whole`
        : `About ${chapterReference}`;
  const communityOn = !!supabase;

  function open(next: LayerPage) {
    setPage(next);
  }
  function back() {
    if (page !== "root") setFocusRow(page);
    setPage("root");
  }
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

  // The root page: actions for a verse, the layers, and for a chapter its two own rows.
  const layerRows = (
    <GroupedList title={verse ? "Around this verse" : undefined}>
      <LayerRow
        kind="context"
        title="Context"
        pill={note ? reviewWord(note.review) : undefined}
        detail={contextDetail}
        onOpen={() => open("context")}
        focusMe={focusRow === "context"}
      />
      <LayerRow
        kind="ai"
        title="AI explanation"
        badge
        detail={ai === "pending" ? "Loading…" : ai.state === "failed" ? AI_FAILED : aiDetail}
        onOpen={record ? () => open("ai") : undefined}
        focusMe={focusRow === "ai"}
      >
        {ai !== "pending" && ai.state === "failed" && (
          <button type="button" className="layer-retry" onClick={onLoadAgain}>
            Load again
          </button>
        )}
      </LayerRow>
      {communityOn && (
        <LayerRow
          kind="community"
          title="Community"
          pill="Voices, not sources"
          detail={!online ? COMMUNITY_OFFLINE : verse ? "What this verse means to people" : "What this chapter means to people"}
          onOpen={online ? () => open("community") : undefined}
          focusMe={focusRow === "community"}
        />
      )}
    </GroupedList>
  );

  return (
    <Sheet
      title={title}
      object={title}
      detent={page === "root" ? "medium" : "large"}
      back={page === "root" ? undefined : { label: title, onBack: back }}
      returnFocus={returnFocus}
      onClose={onClose}
    >
      {page === "root" ? (
        <>
          {verse ? (
            <>
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
            </>
          ) : null}
          {layerRows}
          {!verse && (
            <GroupedList>
              <li>
                <button type="button" className="list-row" aria-pressed={saved} onClick={toggleSaved}>
                  <span className="list-row-text">
                    <span className="list-row-title">{saved ? "Saved" : "Save chapter"}</span>
                  </span>
                  {saved ? <BookmarkCheck className="list-row-chevron" size={20} aria-hidden="true" focusable="false" /> : <Bookmark className="list-row-chevron" size={20} aria-hidden="true" focusable="false" />}
                </button>
              </li>
              <li>
                <button type="button" className="list-row" onClick={() => void share()}>
                  <span className="list-row-text">
                    <span className="list-row-title">Share chapter</span>
                  </span>
                  <Share className="list-row-chevron" size={20} aria-hidden="true" focusable="false" />
                </button>
              </li>
            </GroupedList>
          )}
          {!verse && (
            <p role="status" className="sheet-status">
              {status}
            </p>
          )}
        </>
      ) : page === "context" ? (
        <LayerBlock kind="sourced" pill={note ? <ReviewPill>{reviewWord(note.review)}</ReviewPill> : undefined}>
          {note ? (
            <>
              <p className="layer-meta">{contextDetail}</p>
              <p className="layer-body">{note.text}</p>
              {(note.scope === "book" || note.scope === "chapter") && verse !== undefined && (
                <p className="layer-meta">No note for this verse yet, so this shows the wider {note.scope} context.</p>
              )}
              <details className="layer-details">
                <summary>Why we say this</summary>
                <p className="layer-meta">
                  {note.editor} · {note.interpretiveStatus}
                  {note.review === "editorial draft" && " · not yet reviewed by a theological reader"}
                </p>
                {note.basis && note.basis.length > 0 && (
                  <>
                    <h4 className="layer-subtitle">From the text itself</h4>
                    <ul className="layer-list">
                      {note.basis.map((p) => (
                        <li key={p}>
                          <a
                            href={p}
                            onClick={(e) => {
                              e.preventDefault();
                              navigate(p);
                            }}
                          >
                            {referenceFromPath(data, p)}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <h4 className="layer-subtitle">Sources</h4>
                <ul className="layer-list">
                  {[{ title: "Primary source", url: note.source }, ...(note.sources ?? [])]
                    .filter((s, i, all) => all.findIndex((o) => o.url === s.url) === i)
                    .map((s) => (
                      <li key={s.url}>
                        <a href={s.url} target="_blank" rel="noopener noreferrer">
                          {s.title}
                        </a>
                      </li>
                    ))}
                </ul>
                <p className="layer-meta">
                  Notes summarise their sources in our own words. Where Christians or scholars disagree, the note says so. Notes
                  are not original-language evidence and do not replace the text.
                </p>
              </details>
            </>
          ) : (
            <p className="layer-body">
              Context for this book is being written. Read the surrounding chapter, reflect in your journal or discuss it with the
              community. A note appears here only once it names its sources.
            </p>
          )}
        </LayerBlock>
      ) : page === "ai" ? (
        record ? <AiExplanationCard explanation={record} book={book} onVerse={onVerse} /> : <p className="sheet-body-text">{AI_NONE}</p>
      ) : (
        <LayerBlock kind="community" pill={<ReviewPill>Voices, not sources</ReviewPill>}>
          <Feed source={source} />
        </LayerBlock>
      )}
    </Sheet>
  );
}
