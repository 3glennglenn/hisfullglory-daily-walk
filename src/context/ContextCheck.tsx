// /context and /context/<slug>: a context check as a short story, one part per screen.
// Swipe or use the buttons; the last screen leads to the chapter, the community and sharing.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { webProvider } from "../bible/provider";
import { navigate } from "../platform/router";
import { usePlatform } from "../platform/store";
import { localDate } from "../storage";
import {
  checkUrl,
  editorialNote,
  paragraphs,
  refLabel,
  storyStatuses,
  todaysCheck,
  withVoices,
  type AppContextCheck,
} from "./checks";
import { contextChecks } from "./data";
import { shareCheckPicture } from "./shareCard";

function Told({ value, check }: { value: string; check: AppContextCheck }) {
  return (
    <>
      {paragraphs(value).map((p, i) => (
        <p key={i}>
          {withVoices(p, check.voices).map((piece, j) =>
            typeof piece === "string" ? piece : <q key={j} cite={piece.source.url}>{piece.words}</q>,
          )}
        </p>
      ))}
    </>
  );
}

function VerseText({ check }: { check: AppContextCheck }) {
  const [verses, setVerses] = useState<string[] | null>(null);
  useEffect(() => {
    let active = true;
    webProvider
      .load()
      .then((bible) => {
        const chapter = bible.books.find((b) => b.slug === check.verse.book)?.chapters.find((c) => c.number === check.verse.chapter);
        const found = chapter?.verses.filter((v) => v.number >= check.verse.start && v.number <= check.verse.end && !v.omitted).map((v) => v.text);
        if (active) setVerses(found?.length ? found : []);
      })
      .catch(() => active && setVerses([]));
    return () => {
      active = false;
    };
  }, [check.slug]);
  if (verses === null) return <p className="muted">Loading the verse…</p>;
  if (!verses.length) return <p className="muted">Open the chapter to read the verse once the Bible has downloaded.</p>;
  return <blockquote className="story-verse">{verses.join(" ")}</blockquote>;
}

export function ContextCheck({ slug }: { slug?: string }) {
  const { state } = usePlatform();
  // Until the list of context checks arrives, /context without a slug opens Today’s check.
  const check = slug ? contextChecks.find((c) => c.slug === slug) : todaysCheck(contextChecks, state.shelf, localDate())?.check;
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState("");
  const touch = useRef<number | null>(null);
  const card = useRef<HTMLElement>(null);
  useEffect(() => setIndex(0), [check?.slug]);
  // A new part starts at its top, also when the reader tapped Next below a long one.
  useEffect(() => {
    if (index > 0 && card.current && card.current.getBoundingClientRect().top < 0)
      card.current.scrollIntoView({ block: "start" });
  }, [index]);
  if (!check)
    return (
      <section>
        <h1>Context check not found</h1>
        <button onClick={() => navigate("/context")}>Today’s context check</button>
      </section>
    );
  const label = refLabel(check.verse);
  const slides: { title: string; body: ReactNode }[] = [
    {
      title: "Context check",
      body: (
        <>
          <h1 className="story-hook">{check.hook}</h1>
          <p className="story-ref">{label}</p>
          <p className="muted">Swipe or tap Next to read the story.</p>
        </>
      ),
    },
    { title: label, body: <><VerseText check={check} /><small>{label}, World English Bible</small></> },
    {
      title: "The story around it",
      body: <><Told value={check.story} check={check} /><small className="muted">{storyStatuses[check.storyStatus]}</small></>,
    },
    { title: "The moment", body: <Told value={check.moment} check={check} /> },
    { title: "How people have read it", body: <Told value={check.readings} check={check} /> },
    ...(check.argued ? [{ title: "Who has argued over it", body: <Told value={check.argued} check={check} /> }] : []),
    { title: "What the context adds", body: <Told value={check.point} check={check} /> },
    {
      title: "Keep going",
      body: (
        <div className="story-actions">
          <button onClick={() => navigate(`/bible/${check.verse.book}/${check.verse.chapter}/${check.verse.start}`)}>
            Read {label.replace(/:.*/, "")} in full
          </button>
          <button className="secondary" onClick={() => navigate("/community")}>
            Talk about it in the community
          </button>
          <button
            className="secondary"
            onClick={() =>
              void shareCheckPicture(check)
                .then((result) => setStatus(result === "saved" ? "Picture saved. Share it wherever you like." : result === "shared" ? "Shared." : ""))
                .catch(() => setStatus("The picture could not be made on this device."))
            }
          >
            Share as a picture
          </button>
          <a className="text-button" href={checkUrl(check)} target="_blank" rel="noopener">
            Sources and the full page on hisfullglory.com
          </a>
          <p role="status">{status}</p>
        </div>
      ),
    },
  ];
  const last = slides.length - 1;
  const go = (next: number) => setIndex(Math.max(0, Math.min(last, next)));
  const slide = slides[index];
  return (
    <section
      className="context-story"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(index + 1);
        if (e.key === "ArrowLeft") go(index - 1);
      }}
    >
      <p className="eyebrow">{slug ? "Context check" : "Context check of the day"}</p>
      <article
        ref={card}
        className="card story-slide"
        aria-live="polite"
        onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touch.current === null) return;
          const dx = e.changedTouches[0].clientX - touch.current;
          touch.current = null;
          if (Math.abs(dx) > 50) go(index + (dx < 0 ? 1 : -1));
        }}
      >
        {index > 0 && <h2>{slide.title}</h2>}
        {slide.body}
      </article>
      <nav className="story-nav" aria-label="Story">
        <button className="secondary" disabled={index === 0} onClick={() => go(index - 1)}>
          Back
        </button>
        <span className="story-dots" aria-label={`Part ${index + 1} of ${slides.length}`}>
          {slides.map((_, i) => (
            <span key={i} className={i === index ? "on" : ""} />
          ))}
        </span>
        <button disabled={index === last} onClick={() => go(index + 1)}>
          Next
        </button>
      </nav>
      <small className="muted">{editorialNote(check.review, check.drafted)}</small>
      <details className="card">
        <summary>More context checks</summary>
        {contextChecks.map((c) => (
          <button key={c.slug} className="text-button" onClick={() => navigate(`/context/${c.slug}`)}>
            {refLabel(c.verse)}: {c.hook}
          </button>
        ))}
      </details>
    </section>
  );
}
