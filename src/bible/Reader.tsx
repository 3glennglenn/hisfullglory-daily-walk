import { useEffect, useMemo, useState } from "react";
import { Book, Headphones, Search } from "lucide-react";
import { ListenBar, useListen } from "./Listen";
import { ChapterEnd } from "./ChapterEnd";
import { VerseSheet } from "./VerseSheet";
import { ChapterText } from "./ChapterText";
import { ReaderToolbar } from "./ReaderToolbar";
import { Library, SearchSheet, BIBLE_ERROR } from "./Library";
import { PassagePicker } from "./PassagePicker";
import { Sheet } from "../ui/Sheet";
import { GroupedList, Row } from "../ui/List";
import { webProvider, studyNote, type BibleData } from "./provider";
import { adjacentChapters, bookTitle, referenceFromPath, slugWords } from "./passages";
import { usePlatform } from "../platform/store";
import { navigate, passagePath, type Route } from "../platform/router";
import { localDate } from "../storage";
import { Feed } from "../social/Feed";
import {
  knowledgeFor,
  assembleGrounding,
  knowledgeRecords,
  loadStudyRecords,
  scopeLabel,
  type KnowledgeRecord,
} from "./knowledge";
import { topicGraph } from "../topics/graph";
import { aiFor, loadAiExplanations, type AiExplanation } from "./ai";
import { AiExplanationCard } from "./AiExplanation";

/** The toolbar control that is on screen (the width budget hides the others), for returning focus. */
const shown = (selector: string) => {
  const el = document.querySelector<HTMLElement>(selector);
  return el && el.getClientRects().length ? el : null;
};

export function Reader({ route }: { route: Route }) {
  const { state, update } = usePlatform();
  const [data, setData] = useState<BibleData | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<number | undefined>(route.verse);
  // One sheet at a time: the passage picker, search, or the overflow menu of the toolbar.
  const [sheet, setSheet] = useState<null | "picker" | "search" | "more">(null);
  const [narrow, setNarrow] = useState(false);
  // The verse whose sheet is open (UI-SPEC A4); opening one closes any other sheet.
  const [layers, setLayers] = useState<null | { verse: number }>(null);
  const [speaking, setSpeaking] = useState<number | undefined>();
  const studyBook = route.book ?? "psalms";
  const [study, setStudy] = useState<{ book: string; records: KnowledgeRecord[] }>({ book: "", records: [] });
  useEffect(() => {
    if (!route.book) return;
    let live = true;
    void loadStudyRecords(studyBook).then((records) => {
      if (live) setStudy({ book: studyBook, records });
    });
    return () => {
      live = false;
    };
  }, [studyBook]);
  // AI explanations are a separate layer; a missing or invalid file simply shows none.
  const [ai, setAi] = useState<{ book: string; records: AiExplanation[] }>({ book: "", records: [] });
  useEffect(() => {
    if (!data || !route.book) return;
    let live = true;
    void loadAiExplanations(studyBook, data).then((records) => {
      if (live) setAi({ book: studyBook, records });
    });
    return () => {
      live = false;
    };
  }, [studyBook, data]);
  async function load() {
    setFailed(false);
    try {
      setData(await webProvider.load());
    } catch {
      setFailed(true);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    setSelected(route.verse);
    setLayers(null);
  }, [route.book, route.chapter, route.verse]);

  const book = data?.books.find((b) => b.slug === (route.book ?? "psalms"));
  const chapter = book?.chapters.find((c) => c.number === (route.chapter ?? 23));
  const valid =
    !!route.book && !!book && !!chapter && (route.verse === undefined || chapter.verses.some((v) => v.number === route.verse));
  const chapterPath = book && chapter ? passagePath(book.slug, chapter.number) : undefined;

  // The chapter the reader is in is the one "Continue reading" returns to (private state, this device only).
  useEffect(() => {
    if (valid && chapterPath && state.lastChapter !== chapterPath) update((s) => ({ ...s, lastChapter: chapterPath }));
  }, [valid, chapterPath]);
  // A link to a verse brings it into view; choosing a verse in the reader does not move the page.
  useEffect(() => {
    if (valid && route.verse) document.getElementById(`verse-${route.verse}`)?.scrollIntoView({ block: "center" });
  }, [valid, route.book, route.chapter, route.verse]);

  const chapterReference = book && chapter ? `${book.name} ${chapter.number}` : "";
  const listening = useListen(chapterReference, chapter, setSpeaking);
  const studyRecords = book && study.book === book.slug ? [...knowledgeRecords, ...study.records] : knowledgeRecords;
  // Verses that carry a verse-scope note: the margin mark and ", has notes" in the number's name.
  const notes = useMemo(
    () =>
      new Set(
        studyRecords
          .filter((r) => r.scope === "verse" && r.book === book?.slug && r.chapter === chapter?.number && r.start !== undefined)
          .map((r) => r.start as number),
      ),
    [studyRecords, book?.slug, chapter?.number],
  );

  if (!route.book) return <Library data={data} failed={failed} onRetry={() => void load()} />;
  if (!data)
    return (
      <section className="reader">
        <ReaderToolbar />
        <h1 className="sr-only">{route.book ? `${slugWords(route.book)} ${route.chapter}` : "Bible"}</h1>
        <p role="status" className="reader-status">
          {failed ? BIBLE_ERROR : "Opening the Bible…"}
        </p>
        {failed && (
          <button type="button" className="reader-retry" onClick={() => void load()}>
            Try downloading again
          </button>
        )}
      </section>
    );
  if (!book || !chapter || !valid)
    return (
      <section className="reader">
        <ReaderToolbar />
        <div className="card">
          <h1>Passage not found</h1>
          <button onClick={() => navigate("/bible/psalms/23")}>Open Psalm 23</button>
        </div>
      </section>
    );

  const source = passagePath(book.slug, chapter.number, selected);
  const reference = `${book.name} ${chapter.number}${selected ? `:${selected}` : ""}`;
  const { previous, next } = adjacentChapters(data, book.slug, chapter.number);
  const read = state.reading.includes(chapterPath!);
  const note = knowledgeFor(book.slug, chapter.number, selected, studyRecords);
  const aiNote = ai.book === book.slug ? aiFor(ai.records, book.slug, chapter.number) : undefined;
  const tab = route.tab;

  // The address follows the chosen verse, but choosing one is not a page change: it must not scroll to the
  // top or add a history entry.
  function openVerse(n: number) {
    setSheet(null);
    setSelected(n);
    history.replaceState({}, "", passagePath(book!.slug, chapter!.number, n));
    setLayers({ verse: n });
    // The sheet covers the lower half of the screen: a verse that would sit under it is brought up above it.
    requestAnimationFrame(() => {
      const box = document.getElementById(`verse-${n}`)?.getBoundingClientRect();
      if (box && box.bottom > window.innerHeight * 0.45) window.scrollBy({ top: box.top - window.innerHeight * 0.2 });
    });
  }
  // Closing the sheet ends the choice: the tint goes and the address is the chapter's again.
  function closeLayers() {
    setLayers(null);
    setSelected(undefined);
    history.replaceState({}, "", passagePath(book!.slug, chapter!.number));
  }
  // Under 360px, and in large-text mode, Books is not in the toolbar and moves into More.
  function openMore() {
    setNarrow(window.matchMedia("(max-width: 359px)").matches || document.documentElement.dataset.text === "large");
    setSheet("more");
  }
  function journal(type: "Bible passage" | "study note") {
    if (
      update((s) => ({
        ...s,
        entries: [
          { id: crypto.randomUUID(), type, title: reference, body: "", date: localDate(), source },
          ...s.entries,
        ],
      }))
    )
      navigate("/journal");
  }
  return (
    <section className="reader" data-listening={listening.state !== "idle" ? "true" : undefined}>
      <ReaderToolbar
        reference={chapterReference}
        previous={previous && { label: `Previous chapter: ${previous.reference}`, path: passagePath(previous.book, previous.chapter) }}
        next={next && { label: `Next chapter: ${next.reference}`, path: passagePath(next.book, next.chapter) }}
        onTitle={() => setSheet("picker")}
        onSearch={() => setSheet("search")}
        onListen={listening.supported && listening.state === "idle" ? listening.start : undefined}
        listenName={`Listen to ${chapterReference}`}
        onMore={openMore}
      />
      <header className="reader-head">
        <p className="reader-book">{bookTitle(book)}</p>
        <h1 className="reader-heading">{chapterReference}</h1>
      </header>
      <ChapterText
        key={`${book.slug}/${chapter.number}`}
        book={book}
        chapter={chapter}
        highlights={state.highlights}
        selected={selected}
        speaking={speaking}
        notes={notes}
        onOpen={openVerse}
      />
      <ChapterEnd
        chapter={chapterReference}
        previous={previous && { reference: previous.reference, path: passagePath(previous.book, previous.chapter) }}
        next={next && { reference: next.reference, path: passagePath(next.book, next.chapter) }}
        read={read}
        onToggleRead={() =>
          update((s) => ({
            ...s,
            reading: read ? s.reading.filter((p) => p !== chapterPath) : [...new Set([...s.reading, chapterPath!])],
          }))
        }
        onNote={() => journal("study note")}
        topics={topicGraph.filter((t) => t.passages.includes(chapterPath!)).map((t) => ({ id: t.id, label: t.label }))}
      />
      {tab === "context" ? (
        <>
          <article className="card" data-layer="sourced">
            <h3>{note ? scopeLabel[note.scope] : "Context"}</h3>
            {note ? (
              <>
                <p className="eyebrow">
                  {note.scope === "book" ? book.name : note.scope === "chapter" ? chapterReference : reference}
                  {" · "}
                  {note.review === "reviewed" ? "Reviewed" : note.review === "editorial draft" ? "Editorial draft" : "Editorial observation"}
                </p>
                <p>{note.text}</p>
                {note.scope !== "verse" && selected !== undefined && (
                  <p>
                    <small>No note for this verse yet, so this shows the wider {note.scope} context.</small>
                  </p>
                )}
                <details>
                  <summary>Why we say this</summary>
                  <p>
                    {note.editor} · {note.interpretiveStatus}
                    {note.review === "editorial draft" && " · not yet reviewed by a theological reader"}
                  </p>
                  {note.basis && note.basis.length > 0 && (
                    <>
                      <h4>From the text itself</h4>
                      <ul>
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
                  <h4>Sources</h4>
                  <ul>
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
                  <p>
                    Notes summarise their sources in our own words. Where Christians or scholars disagree, the note
                    says so. Notes are not original-language evidence and do not replace the text.
                  </p>
                </details>
              </>
            ) : (
              <p>
                Context for this book is being written. Read the surrounding chapter, reflect in your journal or
                discuss it with the community. A note appears here only once it names its sources.
              </p>
            )}
          </article>
          {aiNote && (
            <AiExplanationCard
              explanation={aiNote}
              book={book}
              onVerse={(v) => navigate(passagePath(book.slug, chapter.number, v))}
            />
          )}
        </>
      ) : tab === "study" ? (
        <article className="card">
          <h3>Study, with Scripture first</h3>
          <p>{studyNote}</p>
          <ol>
            <li>What do you observe in these verses?</li>
            <li>What changes when you read the whole chapter?</li>
            <li>What question would you bring to a trusted pastor or study group?</li>
          </ol>
          <p>Greek, Hebrew, cross-reference commentary and denomination-specific interpretations are not licensed or curated here.</p>
          <button onClick={() => journal("study note")}>Write a private study note</button>
          <details>
            <summary>Ask HisFullGlory AI · integration pending</summary>
            <p>A server-side grounded explanation provider is not configured. No generated answer or citation is supplied.</p>
            <h4>Available grounding</h4>
            {assembleGrounding(data, book.slug, chapter.number, selected, studyRecords).map((s) => (
              <p key={s.id}>
                {s.authority} · {s.reference}
              </p>
            ))}
          </details>
        </article>
      ) : tab === "community" ? (
        <Feed source={source} />
      ) : null}
      {layers && (
        <VerseSheet
          key={layers.verse}
          book={book}
          chapter={chapter}
          verse={layers.verse}
          returnFocus={() => document.querySelector<HTMLElement>(`#verse-${layers.verse} .verse-num`)}
          onClose={closeLayers}
        />
      )}
      <ListenBar
        reference={chapterReference}
        listening={listening}
        verse={speaking}
        onStopped={() => setTimeout(() => (shown(".rt-listen") ?? shown(".rt-more"))?.focus(), 0)}
      />
      {sheet === "picker" && (
        <Sheet title="Choose a passage" detent="large" returnFocus={() => shown(".rt-title")} onClose={() => setSheet(null)}>
          <PassagePicker
            data={data}
            current={{ book: book.slug, chapter: chapter.number }}
            onPick={(path) => {
              setSheet(null);
              navigate(path);
            }}
          />
        </Sheet>
      )}
      {sheet === "search" && (
        <SearchSheet
          data={data}
          returnFocus={() => shown(".rt-search") ?? shown(".rt-more")}
          onClose={() => setSheet(null)}
          onPick={(path) => {
            setSheet(null);
            navigate(path);
          }}
        />
      )}
      {sheet === "more" && (
        <Sheet title="More options" returnFocus={() => shown(".rt-more")} onClose={() => setSheet(null)}>
          <GroupedList>
            {narrow && (
              <Row
                leading={<Book size={22} aria-hidden="true" focusable="false" />}
                title="Books"
                chevron
                onClick={() => {
                  setSheet(null);
                  navigate("/bible");
                }}
              />
            )}
            <Row
              leading={<Search size={22} aria-hidden="true" focusable="false" />}
              title="Search the Bible"
              chevron
              onClick={() => setSheet("search")}
            />
            {listening.supported && listening.state === "idle" && (
              <Row
                leading={<Headphones size={22} aria-hidden="true" focusable="false" />}
                title={`Listen to ${chapterReference}`}
                detail="Read aloud by your device’s own voice."
                chevron
                onClick={() => {
                  setSheet(null);
                  listening.start();
                }}
              />
            )}
          </GroupedList>
        </Sheet>
      )}
    </section>
  );
}
