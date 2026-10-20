import type { CSSProperties } from "react";
import { aiUnreviewedCardLabel, refLabel, spineHeight, type AppContextCheck } from "../context/checks";
import { miniSpineHeight, monthDay, slugReference } from "../context/shelf";
import type { ShelfEntry } from "../platform/models";
import { AiBadge } from "./Badges";
import { openInApp } from "./internalLink";

// The shelf (UI-SPEC 2, A9, 12, D-07). Three pieces:
//   Spine      one finished context check: a 44px spine, 128 to 160px tall, or a row of a plain list
//   Shelf      the spines on boards, oldest to newest, with the empty place for tomorrow after the last one
//   MiniShelf  up to 12 small spines on Today and on a story's last screen, a picture only
// The look of a spine (leather with two gilt bands, or a cream paper slip with a ribbon tab) is CSS; the DOM is the
// same for both looks. Whether a check was written by an AI model that no person checked is looked up by slug in
// the bundled checks, never stored with the shelf. The AI badge and the words next to it say so; the colour does not.

const AI_SUFFIX = ", context written by AI";

/** The words a spine is announced with: "John 3:16, read October 19", plus what a reader must be told. */
export function spineName(reference: string, finishedOn: string, ai: boolean, published: boolean): string {
  return `${reference}, read ${monthDay(finishedOn)}${ai ? AI_SUFFIX : ""}${published ? "" : ", no longer published"}`;
}

/**
 * One spine. With a path it is a link to the story (or, for a check that is no longer published, to the list of
 * context checks with a line saying so); without one it is only a picture, for a story's last screen where the
 * words beside it carry the meaning. `position` picks the fill (the three spine colours take turns).
 */
export function Spine({
  entry,
  check,
  position,
  linked = true,
}: {
  entry: ShelfEntry;
  /** The bundled check for this slug; undefined once it has been taken down. */
  check: AppContextCheck | undefined;
  position: number;
  linked?: boolean;
}) {
  const reference = check ? refLabel(check.verse) : slugReference(entry.slug);
  const ai = check?.review === "ai-unreviewed";
  const className = `spine spine-${(position % 3) + 1}${ai ? " spine-with-ai" : ""}`;
  const style: CSSProperties = { height: spineHeight(entry.slug) };
  const inner = (
    <>
      <span className="spine-ref">{reference}</span>
      <span className="spine-date">Read {monthDay(entry.finishedOn)}</span>
      {ai && (
        <span className="spine-ai">
          <AiBadge />
          <span className="spine-ai-text">{aiUnreviewedCardLabel}</span>
        </span>
      )}
      {!check && <span className="spine-date">No longer published</span>}
    </>
  );
  if (!linked)
    return (
      <span className={className} style={style} aria-hidden="true">
        {inner}
      </span>
    );
  const path = check ? `/context/${entry.slug}` : "/context?unpublished=1";
  return (
    <a className={className} style={style} href={path} onClick={openInApp(path)} aria-label={spineName(reference, entry.finishedOn, ai, !!check)}>
      {inner}
    </a>
  );
}

/**
 * The shelf: every finished check as a spine, oldest to newest from the left, no gaps, wrapping onto more boards.
 * After the last spine stands tomorrow's place, an empty dashed outline that never names a verse (Q2); its label
 * is for the eye only, the sentence "There is room for tomorrow." under the shelf carries the meaning.
 */
export function Shelf({ shelf, checks }: { shelf: ShelfEntry[]; checks: AppContextCheck[] }) {
  const bySlug = new Map(checks.map((check) => [check.slug, check]));
  return (
    <ul className="shelf-boards" aria-label="Your shelf">
      {shelf.map((entry, index) => (
        <li key={entry.slug} className="shelf-item">
          <Spine entry={entry} check={bySlug.get(entry.slug)} position={index} />
        </li>
      ))}
      <li className="shelf-item shelf-tomorrow" aria-hidden="true">
        <span className="spine spine-tomorrow">
          <span className="spine-ref">Tomorrow</span>
        </span>
      </li>
    </ul>
  );
}

// The mini shelf (UI-SPEC A9, last bullet): up to 12 small spines, 8px wide and 24 to 40px tall, the newest on
// the right. A picture only: aria-hidden, and the words next to it (the count, and the AI line when it applies)
// carry the meaning. A spine of a check written by an AI model that no person checked is filled --ai; the
// colour only repeats what those words say.
export const miniShelfSize = 12;

export function MiniShelf({ shelf, checks }: { shelf: ShelfEntry[]; checks: AppContextCheck[] }) {
  const unchecked = new Set(checks.filter((check) => check.review === "ai-unreviewed").map((check) => check.slug));
  const shown = shelf.slice(-miniShelfSize);
  return (
    <span className="mini-shelf" aria-hidden="true">
      {shown.map((entry, index) => (
        <span
          key={entry.slug}
          className={`mini-spine mini-spine-${(index % 3) + 1}${unchecked.has(entry.slug) ? " mini-spine-ai" : ""}`}
          style={{ height: miniSpineHeight(entry.slug) }}
        />
      ))}
    </span>
  );
}
