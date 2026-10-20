import { useId, type ReactNode } from "react";
import { aiUnreviewedCardLabel, splitHook } from "../context/checks";
import { AiBadge } from "./Badges";

// The signature block (UI-SPEC 2, A1): the day's story on the cover of a well-worn Bible, or the passage on
// the marked page. One DOM for both looks: only the CSS differs by data-look.
//   Cover and story: a leather block (--sig) with a gilt rule 8px inside its edge and four corner ornaments.
//   Marked page: no box, a satin ribbon (--brand) beside the passage.
//   Lamplight (either look, direction B, plan 16): no block at all. No leather, no gilt rule, no corner ornaments, no
//     ribbon: the words sit on the night page inside one soft pool of lamp light that fades to nothing (never an edge),
//     the reference small in --link, the hook in the serif in --ink, and the one filled button is the salmon pill
//     (--button on --on-button). The spans below stay in the markup and the CSS leaves them out.
// The decoration (ribbon and ornaments) is aria-hidden; the words carry the meaning. The section is named by a
// visually hidden h2, so heading navigation finds it; the screen's only h1 stays the screen's title.
export function Cover({ heading, reference, children }: { heading: string; reference: string; children: ReactNode }) {
  const id = useId();
  return (
    <section className="cover-wrap" aria-labelledby={id}>
      <h2 className="sr-only" id={id}>
        {heading}
      </h2>
      <div className="cover">
        <span className="cover-ribbon" aria-hidden="true" />
        <span className="cover-orn cover-orn-tl" aria-hidden="true" />
        <span className="cover-orn cover-orn-tr" aria-hidden="true" />
        <span className="cover-orn cover-orn-br" aria-hidden="true" />
        <span className="cover-orn cover-orn-bl" aria-hidden="true" />
        <p className="cover-ref">{reference}</p>
        {children}
      </div>
    </section>
  );
}

/** The hook split at its turn: "You know X." as the Display line, "But did you know Y?" as the Body line. */
export function CoverHook({ hook }: { hook: string }) {
  const { first, second } = splitHook(hook);
  return (
    <>
      <p className="cover-display">{first}</p>
      {second && <p className="cover-body">{second}</p>}
    </>
  );
}

/** The label row of a context check that no person has checked (D-06): the badge and the card label, in words. */
export function CoverAiRow() {
  return (
    <p className="cover-ai">
      <AiBadge />
      <span>{aiUnreviewedCardLabel}</span>
    </p>
  );
}
