import { useEffect, useState } from "react";
import {
  webProvider,
  contextNotes,
  studyNote,
  type BibleData,
  searchBible,
} from "./provider";
import { usePlatform } from "../platform/store";
import { navigate, passagePath, type Route } from "../platform/router";
import { localDate } from "../storage";
import { Feed } from "../social/Feed";
export function Reader({ route }: { route: Route }) {
  const { state, update } = usePlatform();
  const [data, setData] = useState<BibleData | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<number | undefined>(route.verse);
  const [status, setStatus] = useState("");
  async function load() {
    setError("");
    try {
      setData(await webProvider.load());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bible unavailable");
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    setSelected(route.verse);
    setStatus("");
  }, [route.book, route.chapter, route.verse]);
  if (!data)
    return (
      <section className="card">
        <h1>World English Bible</h1>
        <p role="status">{error || "Loading the complete WEB library…"}</p>
        {error && <button onClick={() => void load()}>Try again</button>}
      </section>
    );
  const book = data.books.find((b) => b.slug === (route.book ?? "psalms"));
  const chapter = book?.chapters.find(
    (c) => c.number === (route.chapter ?? 23),
  );
  if (
    !book ||
    !chapter ||
    (route.verse !== undefined &&
      !chapter.verses.some((v) => v.number === route.verse))
  )
    return (
      <div className="card">
        <h1>Passage not found</h1>
        <button onClick={() => navigate("/bible/psalms/23")}>
          Open Psalm 23
        </button>
      </div>
    );
  const source = passagePath(book.slug, chapter.number, selected);
  const verse = chapter.verses.find((v) => v.number === selected);
  const reference = `${book.name} ${chapter.number}${selected ? `:${selected}` : ""}`;
  const note = contextNotes[`${book.slug}/${chapter.number}`];
  const result = searchBible(data, search);
  const tab = route.tab;
  function journal(type: "Bible passage" | "study note") {
    if (
      update((s) => ({
        ...s,
        entries: [
          {
            id: crypto.randomUUID(),
            type,
            title: reference,
            body: "",
            date: localDate(),
            source,
          },
          ...s.entries,
        ],
      }))
    )
      navigate("/journal");
  }
  return (
    <section>
      <p className="eyebrow">Scripture · Public domain · WEB</p>
      <h1>The Bible, open to you.</h1>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(query);
        }}
      >
        <input
          aria-label="Search WEB text"
          type="search"
          minLength={3}
          placeholder="Search words (3+ characters)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button>Search</button>
      </form>
      {search && (
        <section className="card">
          <h2>Search results</h2>
          <p>
            First {result.length} matches for “{search}” · search is local.
          </p>
          {result.map((r) => (
            <button
              className="search-result"
              key={r.path}
              onClick={() => {
                navigate(r.path);
                setSearch("");
              }}
            >
              <strong>{r.reference}</strong>
              <span>{r.text}</span>
            </button>
          ))}
          {!result.length && <p>No matches. Try another phrase.</p>}
          <button className="secondary" onClick={() => setSearch("")}>
            Close search
          </button>
        </section>
      )}
      <div className="row">
        <label>
          Book
          <select
            value={book.slug}
            onChange={(e) => navigate(passagePath(e.target.value, 1))}
          >
            {data.books.map((b) => (
              <option key={b.id} value={b.slug}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Chapter
          <select
            value={chapter.number}
            onChange={(e) =>
              navigate(passagePath(book.slug, Number(e.target.value)))
            }
          >
            {book.chapters.map((c) => (
              <option key={c.number}>{c.number}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="tabs" aria-label="Passage views">
        {["read", "context", "study", "community"].map((t) => (
          <button
            key={t}
            aria-pressed={tab === t}
            onClick={() =>
              navigate(
                `${passagePath(book.slug, chapter.number, route.verse)}?tab=${t}`,
              )
            }
          >
            {t}
          </button>
        ))}
      </div>
      <h2>{reference}</h2>
      {tab === "read" ? (
        <article className="card scripture-reader">
          {chapter.verses.map((v) => {
            const path = passagePath(book.slug, chapter.number, v.number);
            return (
              <button
                id={`verse-${v.number}`}
                key={v.number}
                className={`verse ${selected === v.number ? "selected" : ""} highlight-${state.highlights[path] ?? "none"}`}
                aria-pressed={selected === v.number}
                onClick={() => {
                  setSelected(v.number);
                  navigate(path);
                }}
              >
                <sup>{v.number}</sup>
                {v.omitted ? (
                  <em>
                    Verse omitted in this WEB edition. See the source notes.
                  </em>
                ) : (
                  v.text
                )}
              </button>
            );
          })}
          <small>
            World English Bible.{" "}
            <a
              href="https://ebible.org/engwebp/copyright.htm"
              target="_blank"
              rel="noopener noreferrer"
            >
              Public-domain source and edition notes
            </a>
          </small>
        </article>
      ) : tab === "context" ? (
        <article className="card">
          <h3>Curated passage context</h3>
          {note ? (
            <>
              <p>{note.text}</p>
              <a href={note.source} target="_blank" rel="noopener noreferrer">
                Read source passage and heading
              </a>
            </>
          ) : (
            <p>
              Curated historical and literary context is not available for this
              passage yet. Read the surrounding chapter. We do not generate
              unsourced scholarship.
            </p>
          )}
        </article>
      ) : tab === "study" ? (
        <article className="card">
          <h3>Study, with Scripture first</h3>
          <p>{studyNote}</p>
          <ol>
            <li>What do you observe in these verses?</li>
            <li>What changes when you read the whole chapter?</li>
            <li>
              What question would you bring to a trusted pastor or study group?
            </li>
          </ol>
          <p>
            Greek, Hebrew, cross-reference commentary and denomination-specific
            interpretations are not licensed or curated here.
          </p>
          <button onClick={() => journal("study note")}>
            Write a private study note
          </button>
        </article>
      ) : (
        <Feed source={source} />
      )}
      <div className="card">
        <h3>{selected ? "Selected passage" : "This chapter"}</h3>
        <div className="actions">
          <button
            className="secondary"
            onClick={() =>
              update((s) => ({
                ...s,
                bookmarks: s.bookmarks.includes(source)
                  ? s.bookmarks.filter((p) => p !== source)
                  : [...s.bookmarks, source],
              }))
            }
          >
            {state.bookmarks.includes(source)
              ? "Remove bookmark"
              : "Bookmark / save"}
          </button>
          {selected && (
            <label>
              Highlight
              <select
                value={state.highlights[source] ?? "none"}
                onChange={(e) =>
                  update((s) => {
                    const h = { ...s.highlights };
                    if (e.target.value === "none") delete h[source];
                    else h[source] = e.target.value;
                    return { ...s, highlights: h };
                  })
                }
              >
                {["none", "gold", "sage", "rose"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          )}
          <button
            className="secondary"
            onClick={() => journal("Bible passage")}
          >
            Journal privately
          </button>
          <button
            className="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  `${
                    verse?.text ??
                    chapter.verses
                      .filter((v) => !v.omitted)
                      .map((v) => v.text)
                      .join(" ")
                  } — ${reference} (WEB)`,
                );
                setStatus("Copied.");
              } catch {
                setStatus("Copy unavailable in this browser.");
              }
            }}
          >
            Copy Scripture
          </button>
          <button
            className="secondary"
            onClick={async () => {
              try {
                const share = {
                  title: reference,
                  text: `${reference} (WEB)`,
                  url: window.location.origin + source,
                };
                if (navigator.share) await navigator.share(share);
                else {
                  await navigator.clipboard.writeText(share.url);
                  setStatus("Passage link copied.");
                }
              } catch {
                setStatus("Share canceled or unavailable.");
              }
            }}
          >
            Share passage link
          </button>
        </div>
        <button
          onClick={() => {
            update((s) => ({
              ...s,
              reading: [
                ...new Set([
                  ...s.reading,
                  passagePath(book.slug, chapter.number),
                ]),
              ],
            }));
            setStatus("Chapter marked as read.");
          }}
        >
          {state.reading.includes(passagePath(book.slug, chapter.number))
            ? "Read · revisit anytime"
            : "Mark chapter read"}
        </button>
        <small role="status">{status}</small>
      </div>
      <div className="row">
        <button
          className="secondary"
          disabled={chapter.number === 1}
          onClick={() => navigate(passagePath(book.slug, chapter.number - 1))}
        >
          Previous
        </button>
        <button
          className="secondary"
          disabled={chapter.number === book.chapters.length}
          onClick={() => navigate(passagePath(book.slug, chapter.number + 1))}
        >
          Next
        </button>
      </div>
      {state.bookmarks.length > 0 && (
        <section className="card">
          <h3>Saved passages</h3>
          {state.bookmarks.map((p) => (
            <button className="text-button" key={p} onClick={() => navigate(p)}>
              {p.replace("/bible/", "").replaceAll("/", " · ")}
            </button>
          ))}
        </section>
      )}
    </section>
  );
}
