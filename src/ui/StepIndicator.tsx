// The step indicator of the story and the walk (UI-SPEC A5, A7): one 4px segment per step, the steps done and the
// current one filled, the steps to come drawn as an outline, so the shape and not only the colour shows the count.
// The first step shows its first segment filled (never an empty bar). It is a progressbar with a name, a value
// from 1 to the number of steps and a spoken value; the same words are also written next to it, so nobody needs
// the bar to know where they are.
export function StepIndicator({
  name,
  current,
  total,
  label,
  valueText,
}: {
  /** What is progressing, for the progressbar's accessible name: "Story progress", "Walk progress". */
  name: string;
  /** The step the reader is on, 1 to total. */
  current: number;
  total: number;
  /** The visible words: "2 of 8", "Step 2 of 6". */
  label: string;
  /** The spoken value; defaults to the visible words. */
  valueText?: string;
}) {
  const now = Math.max(1, Math.min(total, current));
  return (
    <div className="step-indicator">
      <div
        className="step-segments"
        role="progressbar"
        aria-label={name}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={now}
        aria-valuetext={valueText ?? label}
      >
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={i < now ? "step-segment step-segment-done" : "step-segment"} />
        ))}
      </div>
      <span className="step-label">{label}</span>
    </div>
  );
}
