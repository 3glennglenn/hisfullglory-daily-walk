import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Segmented } from "../ui/Segmented";
import { isOldTestament, oldTestamentBooks } from "./passages";
import { passagePath } from "../platform/router";
import type { BibleData } from "./provider";

type Testament = "old" | "new";

// The books of the Bible as a grouped list with a testament switch; choosing a book opens its chapter grid
// right under it (UI-SPEC A2). The library shows it on the page, the reader's title pill shows it in a
// sheet with the current book already open. Only one book is open at a time.
export function PassagePicker({
  data,
  current,
  onPick,
}: {
  data: BibleData;
  /** The chapter being read, if any: its testament is shown and its book is open. */
  current?: { book: string; chapter: number };
  /** The address of the chosen chapter. */
  onPick: (path: string) => void;
}) {
  const [testament, setTestament] = useState<Testament>(() =>
    !current || isOldTestament(data, current.book) ? "old" : "new",
  );
  const [open, setOpen] = useState<string | undefined>(current?.book);
  const root = useRef<HTMLDivElement>(null);
  // The chapter being read is brought into view when the picker opens on its book.
  useEffect(() => {
    root.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ block: "nearest" });
  }, []);
  const books = data.books.filter((_, i) => (testament === "old") === (i < oldTestamentBooks));
  return (
    <div className="picker" ref={root}>
      <Segmented
        label="Testament"
        value={testament}
        options={[
          { value: "old", label: "Old Testament" },
          { value: "new", label: "New Testament" },
        ]}
        onChange={setTestament}
      />
      <section className="group picker-books">
        <ul className="group-list">
          {books.map((book) => {
            const expanded = open === book.slug;
            const Chevron = expanded ? ChevronDown : ChevronRight;
            return (
              <li key={book.slug}>
                <button
                  type="button"
                  className="list-row"
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? undefined : book.slug)}
                >
                  <span className="list-row-text">
                    <span className="list-row-title">{book.name}</span>
                  </span>
                  <Chevron className="list-row-chevron" aria-hidden="true" focusable="false" size={20} />
                </button>
                {expanded && (
                  <div className="chapter-grid" role="group" aria-label={`${book.name} chapters`}>
                    {book.chapters.map((chapter) => (
                      <button
                        key={chapter.number}
                        type="button"
                        className="chapter-cell"
                        aria-label={`Chapter ${chapter.number}`}
                        aria-current={current?.book === book.slug && current.chapter === chapter.number ? "true" : undefined}
                        onClick={() => onPick(passagePath(book.slug, chapter.number))}
                      >
                        {chapter.number}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
