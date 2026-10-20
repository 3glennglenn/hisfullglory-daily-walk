import { useMemo } from "react";
import { starPositions } from "./stars";

// The star field of Lamplight (direction B, founder 2026-10-20): decoration only, so it is hidden from assistive
// technology; the line under it (Today) or the list (the walk finish) says the same in words. The CSS draws it in
// Lamplight and leaves it out in the light modes. `finish` lights today's star with one soft glow that fades in over
// 600 ms (with Reduce Motion it is simply there); on Today nothing moves.
export function StarField({ walked, today, finish = false }: { walked: readonly string[]; today: string; finish?: boolean }) {
  const stars = useMemo(() => starPositions(walked, today), [walked, today]);
  return (
    <div className={finish ? "sky sky-finish" : "sky"} aria-hidden="true">
      {stars.map((star) => (
        <span
          key={star.date}
          className={star.isToday ? (star.walked ? (finish ? "star star-today star-lit" : "star star-today star-walked") : "star star-today") : "star"}
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            // Today's place is sized by the CSS (a ring, a lit star or a small star), never inline.
            ...(star.isToday ? {} : { width: star.size, height: star.size, opacity: star.opacity }),
          }}
        />
      ))}
    </div>
  );
}
