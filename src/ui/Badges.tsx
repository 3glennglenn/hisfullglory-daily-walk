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
