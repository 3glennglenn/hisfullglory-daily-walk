import { useRef, type KeyboardEvent } from "react";

// A small set of mutually exclusive choices (UI-SPEC 3.4, A13): a radiogroup of radio buttons on a
// --surface-2 track, the chosen one raised on --surface. One option is in the Tab order (the chosen
// one); the arrow keys move the choice, as in a native radio group. In large-text mode the stylesheet
// lays the options out as a vertical list of radio rows.
export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

/**
 * The arrow, Home and End keys of a radio group: returns the value to choose next, or null for any
 * other key. Shared by Segmented and the theme tiles.
 */
export function radioKeyTarget<T extends string>(key: string, values: readonly T[], current: T): T | null {
  const at = Math.max(0, values.indexOf(current));
  if (key === "ArrowRight" || key === "ArrowDown") return values[(at + 1) % values.length];
  if (key === "ArrowLeft" || key === "ArrowUp") return values[(at - 1 + values.length) % values.length];
  if (key === "Home") return values[0];
  if (key === "End") return values[values.length - 1];
  return null;
}

export function Segmented<T extends string>({
  label,
  labelledBy,
  value,
  options,
  onChange,
}: {
  /** The group's accessible name, when no visible heading names it. */
  label?: string;
  /** The id of the visible heading that names the group. */
  labelledBy?: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
}) {
  const group = useRef<HTMLDivElement>(null);
  const values = options.map((o) => o.value);
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const next = radioKeyTarget(event.key, values, value);
    if (next === null) return;
    event.preventDefault();
    onChange(next);
    // The newly chosen option is the one in the Tab order, so focus follows the choice.
    group.current?.querySelector<HTMLElement>(`[data-value="${next}"]`)?.focus();
  }
  return (
    <div
      ref={group}
      className="segmented"
      role="radiogroup"
      aria-label={label}
      aria-labelledby={labelledBy}
      onKeyDown={onKeyDown}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          data-value={option.value}
          aria-checked={option.value === value}
          tabIndex={option.value === value ? 0 : -1}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
