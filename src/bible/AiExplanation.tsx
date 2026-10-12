import { config } from "../config";
import { blocks, publicDomainTranslations, sectionTitles, type AiExplanation } from "./ai";
import type { BibleBook } from "./provider";

// The AI layer is always its own labelled card, never part of the sourced note.
export function AiExplanationCard({ explanation, book, onVerse }: {
  explanation: AiExplanation; book: BibleBook; onVerse: (verse: number) => void;
}) {
  const written = new Date(`${explanation.written}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const subject = explanation.chapter ? `${book.name} ${explanation.chapter}` : book.name;
  const verses = explanation.chapter ? book.chapters[explanation.chapter - 1].verses : [];
  return (
    <article className="card ai-explanation" data-layer="ai">
      <h3>AI explanation <span className="ai-badge">AI</span></h3>
      <p className="eyebrow">
        {explanation.scope === "book" ? `About ${book.name} as a whole` : subject} · Written by an AI model ·{" "}
        {explanation.review === "reviewed" ? "Reviewed by a theological reader" : "Not reviewed by a theological reader"}
      </p>
      <p>
        <small>
          This explanation was written by an AI model to help you get started. It names no sources and can
          contain mistakes. Scripture comes first, and context with sources is shown separately above.
        </small>
      </p>
      {explanation.sections.map((section) => (
        <section key={section.kind}>
          <h4>{sectionTitles[explanation.scope][section.kind]}</h4>
          {blocks(section.text).map((block, i) =>
            "list" in block ? (
              <ul key={i}>{block.list.map((item) => <li key={item}>{item}</li>)}</ul>
            ) : (
              <p key={i}>{block.paragraph}</p>
            ),
          )}
        </section>
      ))}
      {explanation.translations.length > 0 && (
        <section>
          <h4>How translations differ</h4>
          <p><small>Compared with public-domain translations only.</small></p>
          {explanation.translations.map((entry) => (
            <div className="ai-compare" key={entry.verse}>
              <button className="text-button" onClick={() => onVerse(entry.verse)}>Verse {entry.verse}</button>
              <dl>
                <dt>World English Bible</dt>
                <dd>{verses.find((v) => v.number === entry.verse)?.text}</dd>
                {entry.renderings.map((rendering) => (
                  <div key={rendering.translation}>
                    <dt>{publicDomainTranslations[rendering.translation]}</dt>
                    <dd>{rendering.text}</dd>
                  </div>
                ))}
              </dl>
              <p>{entry.note}</p>
            </div>
          ))}
        </section>
      )}
      <details>
        <summary>About this explanation</summary>
        <p>
          <small>
            Written by {explanation.model}, an AI model, on {written}. It draws on the WEB text and general
            knowledge and was not checked against sources by a person. Every quotation from Scripture is
            checked automatically against the WEB text.
          </small>
        </p>
        <p>
          <a href={`mailto:${config.supportEmail}?subject=${encodeURIComponent(`Mistake in the AI explanation of ${subject}`)}`}>
            Report a mistake
          </a>
        </p>
      </details>
    </article>
  );
}
