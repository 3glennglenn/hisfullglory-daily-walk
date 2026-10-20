// /context/<slug>: a context check as a short story, a full-screen flow (UI-SPEC A7), one part per screen.
// The tab bar is hidden while it is open; "‹ Today" is the way out. Swipe, the arrow keys or the buttons, which
// are named after the parts. Reaching the last screen puts the check on the reader's shelf (D-07).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Share } from "lucide-react";
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
import { finishCheck, shelfHeading } from "./shelf";
import { shareCheckPicture } from "./shareCard";
import { Cover, CoverAiRow, CoverHook } from "../ui/Cover";
import { StepIndicator } from "../ui/StepIndicator";
import { Toolbar } from "../ui/Screen";

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

/** How a screen's heading is shown: the Title 20 line, visually hidden, or supplied by the content itself (the cover). */
type Heading = "shown" | "hidden" | "own";
interface Slide {
  title: string;
  heading: Heading;
  body: ReactNode;
}

function Story({ check }: { check: AppContextCheck }) {
  const { state, update } = usePlatform();
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState("");
  const [shelved, setShelved] = useState<ReturnType<typeof shelfHeading>>(null);
  const touch = useRef<number | null>(null);
  const card = useRef<HTMLElement>(null);
  // Focus follows the reader to the new part's title, but not when the story first opens.
  const moved = useRef(false);
  // Reaching the last screen is "finished": it is written once for this story, however often the screen redraws.
  const finished = useRef(false);

  const label = refLabel(check.verse);
  const share = () =>
    void shareCheckPicture(check)
      .then((result) => setStatus(result === "saved" ? "Picture saved. Share it wherever you like." : result === "shared" ? "Shared." : ""))
      .catch(() => setStatus("The picture could not be made on this device."));

  const slides: Slide[] = [
    {
      title: "Context check",
      heading: "own",
      body: (
        <Cover heading="Context check" reference={label}>
          <CoverHook hook={check.hook} />
          {check.review === "ai-unreviewed" && <CoverAiRow />}
          <p className="cover-hint">Swipe or tap Next to read the story.</p>
        </Cover>
      ),
    },
    {
      title: label,
      heading: "hidden",
      body: (
        <>
          <VerseText check={check} />
          <small>{label}, World English Bible</small>
        </>
      ),
    },
    {
      title: "The story around it",
      heading: "shown",
      body: (
        <>
          <Told value={check.story} check={check} />
          <small>{storyStatuses[check.storyStatus]}</small>
        </>
      ),
    },
    { title: "The moment", heading: "shown", body: <Told value={check.moment} check={check} /> },
    { title: "How people have read it", heading: "shown", body: <Told value={check.readings} check={check} /> },
    ...(check.argued ? [{ title: "Who has argued over it", heading: "shown" as const, body: <Told value={check.argued} check={check} /> }] : []),
    { title: "What the context adds", heading: "shown", body: <Told value={check.point} check={check} /> },
    {
      title: "Keep going",
      // The shelf heading is the first thing seen here; "Keep going" stays the screen's heading for a screen reader.
      heading: shelved ? "hidden" : "shown",
      body: (
        <>
          {shelved && <h3 className="flow-shelf-heading">{shelved}</h3>}
          <div className="story-actions">
            <button type="button" className="flow-button" onClick={() => navigate(`/bible/${check.verse.book}/${check.verse.chapter}/${check.verse.start}`)}>
              Read {label.replace(/:.*/, "")} in full
            </button>
            <button type="button" className="flow-button flow-button-secondary" onClick={() => navigate("/community")}>
              Talk about it in the community
            </button>
            <button type="button" className="flow-button flow-button-secondary" onClick={share}>
              Share as a picture
            </button>
            <a className="flow-link" href={checkUrl(check)} target="_blank" rel="noopener">
              Sources and the full page on hisfullglory.com
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </div>
          <p className="flow-note">{editorialNote(check.review, check.drafted)}</p>
        </>
      ),
    },
  ];
  const last = slides.length - 1;
  const go = (next: number) => {
    moved.current = true;
    setIndex(Math.max(0, Math.min(last, next)));
  };

  // The last screen is reached: the check goes on the shelf once. "Added to your shelf" is said only when the
  // write worked; a check that was already there says "On your shelf" and is not written again.
  useEffect(() => {
    if (index !== last || finished.current) return;
    finished.current = true;
    const already = state.shelf.some((entry) => entry.slug === check.slug);
    const saved = already ? true : update((s) => ({ ...s, shelf: finishCheck(s.shelf, check.slug, localDate()) }));
    setShelved(shelfHeading(already, saved));
  }, [index]);

  // A new part starts at its title: focus moves there, and the part scrolls into view if Next was tapped below it.
  useEffect(() => {
    if (!moved.current) return;
    const title = card.current?.querySelector<HTMLElement>("h2");
    if (title) {
      title.tabIndex = -1;
      title.focus({ preventScroll: true });
    }
    if (card.current && card.current.getBoundingClientRect().top < 0) card.current.scrollIntoView({ block: "start" });
  }, [index]);

  const slide = slides[index];
  const previous = index > 0 ? slides[index - 1] : null;
  const next = index < last ? slides[index + 1] : null;
  return (
    <section
      className="flow story-flow"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(index + 1);
        if (e.key === "ArrowLeft") go(index - 1);
      }}
    >
      <Toolbar
        back="Today"
        to="/"
        title={label}
        actions={
          <button type="button" className="toolbar-icon" aria-label="Share as a picture" onClick={share}>
            <Share aria-hidden="true" focusable="false" size={22} />
          </button>
        }
      />
      <StepIndicator name="Story progress" current={index + 1} total={slides.length} label={`${index + 1} of ${slides.length}`} />
      <article
        ref={card}
        className="flow-part"
        aria-live="polite"
        onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touch.current === null) return;
          const dx = e.changedTouches[0].clientX - touch.current;
          touch.current = null;
          if (Math.abs(dx) > 50) go(index + (dx < 0 ? 1 : -1));
        }}
      >
        {slide.heading !== "own" && <h2 className={slide.heading === "hidden" ? "sr-only" : undefined}>{slide.title}</h2>}
        {slide.body}
      </article>
      <p className="flow-status" role="status">
        {status}
      </p>
      <nav className="flow-actions" aria-label="Story">
        {previous && (
          <button type="button" className="flow-button flow-button-secondary" aria-label={`Back to ${previous.title}`} onClick={() => go(index - 1)}>
            <span aria-hidden="true">‹</span> {previous.title}
          </button>
        )}
        {next && (
          <button type="button" className="flow-button" onClick={() => go(index + 1)}>
            Next: {next.title}
          </button>
        )}
      </nav>
      <details className="flow-more">
        <summary>More context checks</summary>
        {contextChecks.map((c) => (
          <button key={c.slug} type="button" className="text-button" onClick={() => navigate(`/context/${c.slug}`)}>
            {refLabel(c.verse)}: {c.hook}
          </button>
        ))}
      </details>
    </section>
  );
}

export function ContextCheck({ slug }: { slug?: string }) {
  const { state } = usePlatform();
  // Until the list of context checks arrives, /context without a slug opens Today’s check.
  const check = slug ? contextChecks.find((c) => c.slug === slug) : todaysCheck(contextChecks, state.shelf, localDate())?.check;
  if (!check)
    return (
      <section>
        <h1>Context check not found</h1>
        <button onClick={() => navigate("/context")}>Today’s context check</button>
      </section>
    );
  return <Story key={check.slug} check={check} />;
}
