import { config } from "../config";
import { LayerBlock } from "../ui/LayerBlock";
import { blocks, publicDomainTranslations, sectionTitles, type AiExplanation } from "./ai";
import type { BibleBook } from "./provider";

// The AI layer is always its own labelled block, never part of the sourced note (UI-SPEC 5.3, A4). It is
// the existing explanation with the container of the layer: a dashed frame, the heading "AI explanation" with the
// "AI" badge, and the sentence that says an AI model wrote it (it replaces the uppercase eyebrow). The text is UI
// face; only the WEB quotations of the translation comparison are Scripture, and so are set in the Scripture face.
export const aiNoteLine = (review: AiExplanation["review"]) =>
  review === "reviewed"
    ? "Written by an AI model. Reviewed by a theological reader."
    : "Written by an AI model. Not reviewed by a theological reader.";

export function AiExplanationCard({ explanation, book, onVerse }: {
  explanation: AiExplanation; book: BibleBook; onVerse: (verse: number) => void;
}) {
  const written = new Date(`${explanation.written}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const subject = explanation.chapter ? `${book.name} ${explanation.chapter}` : book.name;
  const verses = explanation.chapter ? book.chapters[explanation.chapter - 1].verses : [];
  return (
    <LayerBlock kind="ai" note={aiNoteLine(explanation.review)}>
      <p className="layer-body layer-muted">
        This explanation was written by an AI model to help you get started. It names no sources and can
        contain mistakes. Scripture comes first, and context with sources is shown separately.
      </p>
      {explanation.sections.map((section) => (
        <section key={section.kind} className="layer-section">
          <h4 className="layer-subtitle">{sectionTitles[explanation.scope][section.kind]}</h4>
          {blocks(section.text).map((block, i) =>
            "list" in block ? (
              <ul key={i} className="layer-list">{block.list.map((item) => <li key={item}>{item}</li>)}</ul>
            ) : (
              <p key={i} className="layer-body">{block.paragraph}</p>
            ),
          )}
        </section>
      ))}
      {explanation.translations.length > 0 && (
        <section className="layer-section">
          <h4 className="layer-subtitle">How translations differ</h4>
          <p className="layer-meta">Compared with public-domain translations only.</p>
          {explanation.translations.map((entry) => (
            <div className="ai-compare" key={entry.verse}>
              <button type="button" className="layer-link" onClick={() => onVerse(entry.verse)}>Verse {entry.verse}</button>
              <dl>
                <dt>World English Bible</dt>
                <dd className="ai-web">{verses.find((v) => v.number === entry.verse)?.text}</dd>
                {entry.renderings.map((rendering) => (
                  <div key={rendering.translation}>
                    <dt>{publicDomainTranslations[rendering.translation]}</dt>
                    <dd>{rendering.text}</dd>
                  </div>
                ))}
              </dl>
              <p className="layer-body">{entry.note}</p>
            </div>
          ))}
        </section>
      )}
      <details className="layer-details">
        <summary>About this explanation</summary>
        <p className="layer-meta">
          Written by {explanation.model}, an AI model, on {written}. It draws on the WEB text and general
          knowledge and was not checked against sources by a person. Every quotation from Scripture is
          checked automatically against the WEB text.
        </p>
        {config.supportEmailReady && (
          <p className="layer-meta">
            <a href={`mailto:${config.supportEmail}?subject=${encodeURIComponent(`Mistake in the AI explanation of ${subject}`)}`}>
              Report a mistake
            </a>
          </p>
        )}
      </details>
    </LayerBlock>
  );
}
