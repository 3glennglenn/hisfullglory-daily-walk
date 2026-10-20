import type { ReactNode } from "react";
import { FileText, Sparkles, Users } from "lucide-react";
import { AiBadge } from "./Badges";

// The three layers around Scripture, each visibly apart from the others and from the text (UI-SPEC 5.3,
// AGENTS.md "layers stay separate"). Scripture is plain text on the page and never inside one of these.
//
//   sourced    --surface, a 1px solid --line, radius 20; heading "Context" with a document icon and a review pill
//   ai         --surface, a 1.5px DASHED --ai frame, radius 14; heading "AI explanation" in --ai with a sparkle
//              icon and the "AI" badge, then the sentence that says an AI model wrote it
//   community  --surface, no frame, a 3px --community rule on the left, radius 20; heading "Community" with a
//              people icon and the pill "Voices, not sources"
//
// The four differences hold without colour: the words in the heading, the icon, the shape of the frame and
// the colour. Every block keeps its data-layer attribute ("sourced", "ai", "voices"). The face is always the UI
// face: the serif belongs to Scripture alone, so AI and community text never wear it.
export type LayerKind = "sourced" | "ai" | "community";

const names: Record<LayerKind, { heading: string; attribute: string }> = {
  sourced: { heading: "Context", attribute: "sourced" },
  ai: { heading: "AI explanation", attribute: "ai" },
  community: { heading: "Community", attribute: "voices" },
};

export function LayerBlock({
  kind,
  pill,
  note,
  children,
}: {
  kind: LayerKind;
  /** The review pill beside "Context" or the pill "Voices, not sources" (a ReviewPill). */
  pill?: ReactNode;
  /** The sentence under an AI heading: "Written by an AI model. Not reviewed by a theological reader." */
  note?: string;
  children: ReactNode;
}) {
  const { heading, attribute } = names[kind];
  const Icon = kind === "sourced" ? FileText : kind === "ai" ? Sparkles : Users;
  return (
    <article className={`layer layer-${kind}`} data-layer={attribute}>
      <div className="layer-head">
        <Icon className="layer-icon" size={24} aria-hidden="true" focusable="false" />
        {/* The heading takes focus when a page opens in a sheet (data-sheet-focus). */}
        <h3 className="layer-title" tabIndex={-1} data-sheet-focus="true">
          {heading}
        </h3>
        {kind === "ai" && <AiBadge />}
        {pill}
      </div>
      {note && <p className="layer-note">{note}</p>}
      {children}
    </article>
  );
}
