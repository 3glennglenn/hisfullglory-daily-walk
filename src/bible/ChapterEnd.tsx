import { Check } from "lucide-react";
import { GroupedList, Row } from "../ui/List";
import { navigate } from "../platform/router";

// The end of a chapter (UI-SPEC A3): after the last verse, 48px below it, one clear next step and a few quiet
// ones. "Next: John 4" is the one filled button; the chapter before is a plain button; "Mark as read" is a
// toggle; then the three questions to carry, a private study note, the topics that use this chapter and the
// line that says whose text this is (the public-domain WEB), which stays at the end of every chapter.
export interface EndStep {
  /** "John 4" */
  reference: string;
  path: string;
}

// The three questions the Study view carried, unchanged.
export const questionsToCarry = [
  "What do you observe in these verses?",
  "What changes when you read the whole chapter?",
  "What question would you bring to a trusted pastor or study group?",
];

export function ChapterEnd({
  chapter,
  previous,
  next,
  read,
  onToggleRead,
  onNote,
  topics,
}: {
  /** "John 3" */
  chapter: string;
  previous?: EndStep;
  next?: EndStep;
  read: boolean;
  onToggleRead: () => void;
  /** Starts a private study note for this chapter. */
  onNote: () => void;
  topics: { id: string; label: string }[];
}) {
  return (
    <section className="chapter-end" id="chapter-end" aria-label={`End of ${chapter}`}>
      <p className="end-of">End of {chapter}</p>
      {next && (
        <button type="button" className="end-next" onClick={() => navigate(next.path)}>
          Next: {next.reference}
        </button>
      )}
      <div className="end-pair">
        {previous ? (
          <button type="button" className="end-plain" aria-label={`Previous: ${previous.reference}`} onClick={() => navigate(previous.path)}>
            <span aria-hidden="true">‹</span> {previous.reference}
          </button>
        ) : (
          <span />
        )}
        <button type="button" className="end-toggle" aria-pressed={read} onClick={onToggleRead}>
          {read && <Check size={18} aria-hidden="true" focusable="false" />}
          Mark as read
        </button>
      </div>
      <h2 className="end-title">Questions to carry</h2>
      <ol className="end-questions">
        {questionsToCarry.map((question) => (
          <li key={question}>{question}</li>
        ))}
      </ol>
      <button type="button" className="end-link" onClick={onNote}>
        Write a private study note
      </button>
      {topics.length > 0 && (
        <GroupedList
          title="Topics that use this chapter"
          note="Editorial links, not verified interpretations or evidence of what other readers have experienced."
        >
          {topics.map((topic) => (
            <Row key={topic.id} title={topic.label} href={`/community/${topic.id}`} chevron />
          ))}
        </GroupedList>
      )}
      <p className="web-line">
        World English Bible (WEB), public domain.{" "}
        <a href="https://ebible.org/engwebp/copyright.htm" target="_blank" rel="noopener noreferrer">
          Source and edition notes
        </a>
      </p>
    </section>
  );
}
