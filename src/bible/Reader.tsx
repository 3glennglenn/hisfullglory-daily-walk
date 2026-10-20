import { useEffect, useMemo, useState } from "react";
import { Book, Headphones, Search, Sparkles } from "lucide-react";
import { ListenBar, useListen } from "./Listen";
import { ChapterEnd } from "./ChapterEnd";
import { VerseSheet, type LayerPage } from "./VerseSheet";
import { ChapterText } from "./ChapterText";
import { ReaderToolbar } from "./ReaderToolbar";
import { Library, SearchSheet, BIBLE_ERROR } from "./Library";
import { PassagePicker } from "./PassagePicker";
import { Sheet } from "../ui/Sheet";
import { GroupedList, Row } from "../ui/List";
import { webProvider, type BibleData } from "./provider";
import { adjacentChapters, bookTitle, slugWords } from "./passages";
import { usePlatform } from "../platform/store";
import { navigate, passagePath, type Route } from "../platform/router";
import { localDate } from "../storage";
import { knowledgeRecords, loadStudyRecords, type KnowledgeRecord } from "./knowledge";
import { topicGraph } from "../topics/graph";
import { loadAiStatus, type AiStatus } from "./ai";

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
  // The verse sheet, or the chapter sheet when there is no verse (UI-SPEC A4), at a page for the old ?tab= links;
  // opening one closes any other sheet.
  const [layers, setLayers] = useState<null | { verse?: number; page?: LayerPage }>(null);
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
  // AI explanations are a separate layer: loading, ready, none for this book, or failed (and worth asking again).
  const [ai, setAi] = useState<{ book: string; status: AiStatus | "pending" }>({ book: "", status: "pending" });
  useEffect(() => {
    if (!data || !route.book) return;
    let live = true;
    setAi({ book: studyBook, status: "pending" });
    void loadAiStatus(studyBook, data).then((status) => {
      if (live) setAi({ book: studyBook, status });
    });
    return () => {
      live = false;
    };
  }, [studyBook, data]);
  // "Load again": one request per press (loadAiStatus drops a failure and asks again).
  function loadAiAgain() {
    if (!data) return;
    setAi({ book: studyBook, status: "pending" });
    void loadAiStatus(studyBook, data).then((status) => setAi({ book: studyBook, status }));
  }
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
  // The old ?tab= addresses (UI-SPEC 8.2): context and community open the sheet at that page (the verse's when the
  // address names one, else the chapter's), study scrolls to the end of the chapter; read and no tab open nothing.
  useEffect(() => {
    if (!valid) return;
    if (route.tab === "context" || route.tab === "community") setLayers({ verse: route.verse, page: route.tab });
    else if (route.tab === "study") requestAnimationFrame(() => document.getElementById("chapter-end")?.scrollIntoView({ block: "start" }));
  }, [valid, route.book, route.chapter, route.verse, route.tab]);
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
  const aiStatus = ai.book === book.slug ? ai.status : "pending";

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
  // The chapter's sheet, from the capsule.
  function openChapter() {
    setSheet(null);
    setLayers({});
  }
  // Closing the sheet ends the choice: the tint goes and the address is the chapter's again (without a ?tab=).
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
      {layers && (
        <VerseSheet
          key={layers.verse ?? "chapter"}
          data={data}
          book={book}
          chapter={chapter}
          verse={layers.verse}
          startPage={layers.page}
          records={studyRecords}
          ai={aiStatus}
          onLoadAgain={loadAiAgain}
          onVerse={openVerse}
          returnFocus={() =>
            layers.verse ? document.querySelector<HTMLElement>(`#verse-${layers.verse} .verse-num`) : document.querySelector<HTMLElement>(".around-capsule")
          }
          onClose={closeLayers}
        />
      )}
      {listening.state === "idle" && (
        <button type="button" className="around-capsule" onClick={openChapter}>
          <Sparkles size={18} aria-hidden="true" focusable="false" />
          Around {chapterReference}
        </button>
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
