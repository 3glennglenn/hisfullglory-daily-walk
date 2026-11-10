import { useId, useRef, useState } from "react";
import { Search } from "lucide-react";
import { GroupedList, Row } from "../ui/List";
import { TitleRow } from "../ui/Screen";
import { Segmented } from "../ui/Segmented";
import { Sheet } from "../ui/Sheet";
import { contextChecks } from "../context/data";
import { usePlatform } from "../platform/store";
import { navigate } from "../platform/router";
import { PassagePicker } from "./PassagePicker";
import { oldTestamentBooks, referenceFromPath } from "./passages";
import { searchBible, type BibleData } from "./provider";

export const BIBLE_ERROR = "The Bible could not be opened. Check your connection and try again.";
export const SAVED_EMPTY = "Nothing saved yet. Tap a verse and choose Save verse.";

/** The count under "Context checks": many, or one. */
export const contextChecksDetail = (n: number) =>
  n === 1 ? "1 well-known verse, back in its story" : `${n} well-known verses, back in their story`;

// The Bible library, /bible (01.2 D-05, UI-SPEC 2.2): a large title with Search and You, then two sections. Read holds where
// the reader left off and the two testaments, each opening the book list with the chapter grids in a sheet. Study (below)
// holds the study tools. The chosen section is kept in module memory while the app stays open, so Back from a chapter, the
// shelf or the context checks lands on the same section; it is never written to the device. The Bible text itself is
// downloaded once; until it has arrived the testaments say so, and say what to do when the download fails (A16).
const sections = [
  { value: "read", label: "Read" },
  { value: "study", label: "Study" },
] as const;
type Section = (typeof sections)[number]["value"];
let lastSection: Section = "read";

export const booksLabel = (n: number) => (n === 1 ? "1 book" : `${n} books`);

type LibrarySheet = "search" | "saved" | "old" | "new" | null;

export function Library({ data, failed, onRetry }: { data: BibleData | null; failed: boolean; onRetry: () => void }) {
  const { state } = usePlatform();
  const [section, setSectionState] = useState<Section>(lastSection);
  const [sheet, setSheet] = useState<LibrarySheet>(null);
  const searchButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const checks = contextChecks.length;
  const setSection = (value: Section) => {
    lastSection = value;
    setSectionState(value);
  };
  // The row that opened a sheet gets focus back when the sheet closes.
  const openFrom = (which: Exclude<LibrarySheet, null>) => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSheet(which);
  };
  const oldBooks = data ? Math.min(data.books.length, oldTestamentBooks) : 0;
  const newBooks = data ? Math.max(0, data.books.length - oldTestamentBooks) : 0;
  return (
    <section className="library">
      <TitleRow
        title="Bible"
        actions={
          <button
            type="button"
            className="tool-button"
            aria-label="Search the Bible"
            ref={searchButton}
            disabled={!data}
            onClick={() => setSheet("search")}
          >
            <Search size={22} aria-hidden="true" focusable="false" />
          </button>
        }
      />
      <Segmented label="Bible sections" value={section} options={sections} onChange={setSection} />
      {section === "read" ? (
        <>
          <h2 className="sr-only">Read</h2>
          {state.lastChapter && (
            <GroupedList>
              <Row title="Continue reading" detail={referenceFromPath(data, state.lastChapter)} href={state.lastChapter} chevron />
            </GroupedList>
          )}
          {data ? (
            <GroupedList>
              <Row title="Old Testament" detail={booksLabel(oldBooks)} chevron onClick={() => openFrom("old")} />
              <Row title="New Testament" detail={booksLabel(newBooks)} chevron onClick={() => openFrom("new")} />
            </GroupedList>
          ) : (
            <>
              <p role="status" className="reader-status">
                {failed ? BIBLE_ERROR : "Opening the Bible…"}
              </p>
              {failed && (
                <button type="button" className="reader-retry" onClick={onRetry}>
                  Try downloading again
                </button>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <h2 className="sr-only">Study</h2>
          <GroupedList>
            {checks > 0 && <Row title="Context checks" detail={contextChecksDetail(checks)} href="/context" chevron />}
            <Row title="Saved passages" value={state.bookmarks.length || undefined} chevron onClick={() => openFrom("saved")} />
          </GroupedList>
        </>
      )}
      {sheet === "search" && data && (
        <SearchSheet
          data={data}
          returnFocus={() => searchButton.current}
          onClose={() => setSheet(null)}
          onPick={(path) => {
            setSheet(null);
            navigate(path);
          }}
        />
      )}
      {(sheet === "old" || sheet === "new") && data && (
        <Sheet
          title={sheet === "old" ? "Old Testament" : "New Testament"}
          detent="large"
          returnFocus={() => opener.current}
          onClose={() => setSheet(null)}
        >
          <PassagePicker
            data={data}
            testament={sheet}
            onPick={(path) => {
              setSheet(null);
              navigate(path);
            }}
          />
        </Sheet>
      )}
      {sheet === "saved" && (
        <Sheet title="Saved passages" detent="large" returnFocus={() => opener.current} onClose={() => setSheet(null)}>
          {state.bookmarks.length ? (
            <GroupedList>
              {state.bookmarks.map((path) => (
                <Row
                  key={path}
                  title={referenceFromPath(data, path)}
                  href={path}
                  chevron
                />
              ))}
            </GroupedList>
          ) : (
            <p className="sheet-body-text">{SAVED_EMPTY}</p>
          )}
        </Sheet>
      )}
    </section>
  );
}

// Search the Bible: a sheet with one labelled field, behind a toolbar icon (UI-SPEC A2, A3, A16). The search
// runs on this device over the downloaded WEB text; nothing is sent anywhere.
export const MIN_SEARCH_LETTERS = 3;
export const noResults = (query: string) => `No verses found for “${query}”. Check the spelling, or search for one word.`;

export function SearchSheet({
  data,
  onPick,
  onClose,
  returnFocus,
}: {
  data: BibleData;
  /** The address of the verse the reader chose. */
  onPick: (path: string) => void;
  onClose: () => void;
  returnFocus?: () => HTMLElement | null;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const [searched, setSearched] = useState("");
  const query = searched.trim();
  const results = searchBible(data, query);
  return (
    <Sheet title="Search the Bible" detent="large" onClose={onClose} returnFocus={returnFocus}>
      <form
        className="search-form"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          setSearched(text);
        }}
      >
        <label htmlFor={`${id}-field`} className="sheet-label">
          Words to find
        </label>
        <div className="search-line">
          <input
            id={`${id}-field`}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={text}
            aria-describedby={`${id}-hint`}
            onChange={(event) => setText(event.target.value)}
          />
          <button type="submit">Search</button>
        </div>
        <p id={`${id}-hint`} className="sheet-hint">
          At least three letters. The search runs on this device.
        </p>
      </form>
      <div role="status" className="search-status">
        {query && query.length < MIN_SEARCH_LETTERS ? "Type at least three letters to search." : null}
        {query.length >= MIN_SEARCH_LETTERS && !results.length ? noResults(query) : null}
        {results.length ? `${results.length === 60 ? "The first 60 verses" : results.length === 1 ? "1 verse" : `${results.length} verses`} with “${query}”.` : null}
      </div>
      {results.length > 0 && (
        <ul className="search-results">
          {results.map((r) => (
            <li key={r.path}>
              <button type="button" className="search-hit" onClick={() => onPick(r.path)}>
                <span className="search-hit-ref">{r.reference}</span>
                <span className="search-hit-text">{r.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
