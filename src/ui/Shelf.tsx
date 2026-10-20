import type { AppContextCheck } from "../context/checks";
import { miniSpineHeight } from "../context/shelf";
import type { ShelfEntry } from "../platform/models";

// The mini shelf (UI-SPEC A9, last bullet): up to 12 small spines, 8px wide and 24 to 40px tall, the newest on
// the right. A picture only: aria-hidden, and the words next to it (the count, and the AI line when it applies)
// carry the meaning. A spine of a check written by an AI model that no person checked is filled --ai; the
// colour only repeats what those words say. Whether a check is AI-written is looked up by slug in the bundled
// checks, never stored with the shelf.
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
