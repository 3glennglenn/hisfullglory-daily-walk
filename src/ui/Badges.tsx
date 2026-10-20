// The "AI" badge (UI-SPEC 5.3, D-06): the text "AI" in 13px/600, --on-ai on --ai, 20px tall, radius 6.
// It always sits next to words that carry the meaning ("Written by an AI model. Not checked by a person."),
// so it is hidden from assistive technology rather than read twice: the colour and the badge only repeat
// the words, they never stand alone. The same badge as the website's AiBadge.astro.
export function AiBadge() {
  return (
    <span className="ai-badge" aria-hidden="true">
      AI
    </span>
  );
}

// The review pill (UI-SPEC 5.3, A4): the words that say how a layer was checked ("Editorial draft", "Reviewed",
// "Editorial observation") or what a layer is ("Voices, not sources"), in 13px/600 with a --muted outline and a radius
// of 6. It is text that is read: the words carry the meaning, the outline only frames them.
export function ReviewPill({ children }: { children: string }) {
  return <span className="review-pill">{children}</span>;
}
