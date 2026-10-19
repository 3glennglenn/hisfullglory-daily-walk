import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Dialog } from "../platform/Dialog";
import { isPromise, useReturnFocus } from "./sheet";

// Text typed in a sheet and then dismissed by Escape or a tap outside it. Held in this page's memory only,
// per item, until the page is closed: never written to storage, never sent anywhere (T-01.1-16).
const kept = new Map<string, string>();

/** For tests: what a closed sheet is still holding for an item. */
export function keptText(draftKey: string): string | undefined {
  return kept.get(draftKey);
}

// A sheet with one labelled multi-line field, in place of the browser's prompt() (UI-SPEC A15, D-10).
// The named safe choice sits on the leading edge, the action on the trailing edge. The action stays disabled
// while the trimmed text is empty (unless `optional`). Escape and a tap outside close the sheet without a
// question and keep the typed text for the same item (`draftKey`) if the sheet is opened again in this
// session; the named safe button is a deliberate "no" and drops it. The field grows to 40 % of the sheet,
// then scrolls. onAction receives the text; a return value of false means it could not be done, and the text
// is kept. onSafe closes the sheet and is also called when onAction has finished; the caller reports a failure
// on its screen's existing error line.
export function TextSheet({
  title,
  fieldLabel,
  hint,
  initialText = "",
  draftKey,
  maxLength = 10000,
  safeLabel,
  actionLabel,
  optional = false,
  busyLabel,
  onAction,
  onSafe,
}: {
  title: string;
  fieldLabel: string;
  hint?: string;
  initialText?: string;
  /** Names the item the text belongs to, so Escape followed by opening it again shows the text again. */
  draftKey?: string;
  maxLength?: number;
  safeLabel: string;
  actionLabel: string;
  /** The action works with an empty field. */
  optional?: boolean;
  /** What the action reads while the work is going on, for example "Saving…". */
  busyLabel: string;
  onAction: (text: string) => void | boolean | Promise<void | boolean>;
  onSafe: () => void;
}) {
  const id = useId();
  const titleId = `${id}-title`;
  const fieldId = `${id}-field`;
  const hintId = `${id}-hint`;
  const [text, setText] = useState(() => (draftKey ? kept.get(draftKey) : undefined) ?? initialText);
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const current = useRef(text);
  current.current = text;
  const dropped = useRef(false);
  const alive = useRef(true);
  useReturnFocus();

  // Leaving by any road except the named safe button or a finished action keeps the text for next time.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (!draftKey) return;
      const typed = current.current;
      if (!dropped.current && typed.trim() && typed !== initialText) kept.set(draftKey, typed);
      else kept.delete(draftKey);
    };
  }, []);

  // The field grows with its text up to 40 % of the sheet (the sheet is at most 90 % of the screen), then scrolls.
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const empty = !text.trim();
  const blocked = empty && !optional;

  async function act() {
    if (busy || blocked) return;
    const typed = text;
    let result: void | boolean | Promise<void | boolean>;
    try {
      result = onAction(typed);
    } catch {
      return;
    }
    if (isPromise(result)) {
      setBusy(true);
      try {
        result = await result;
      } catch {
        result = false;
      } finally {
        if (alive.current) setBusy(false);
      }
    }
    // A finished action leaves nothing behind; one that failed keeps the words for another try. Either way
    // the work is over and the sheet goes away.
    dropped.current = result !== false;
    if (alive.current) onSafe();
  }
  function decline() {
    if (busy) return;
    dropped.current = true;
    onSafe();
  }
  function dismiss() {
    if (!busy) onSafe();
  }
  return (
    <Dialog
      className="sheet-dialog text-sheet"
      labelledBy={titleId}
      onClose={(event) => {
        if (busy) event.preventDefault();
        else onSafe();
      }}
      onBackdrop={dismiss}
    >
      <h2 id={titleId} className="sheet-title">
        {title}
      </h2>
      <label htmlFor={fieldId} className="sheet-label">
        {fieldLabel}
      </label>
      <textarea
        ref={field}
        id={fieldId}
        className="sheet-field"
        rows={3}
        maxLength={maxLength}
        value={text}
        aria-describedby={hint ? hintId : undefined}
        onChange={(event) => setText(event.target.value)}
      />
      {hint && (
        <p id={hintId} className="sheet-hint">
          {hint}
        </p>
      )}
      <div className="sheet-actions sheet-actions-split">
        <button type="button" className="secondary" aria-disabled={busy || undefined} onClick={decline}>
          {safeLabel}
        </button>
        <button
          type="button"
          disabled={blocked}
          aria-disabled={busy || undefined}
          onClick={() => void act()}
        >
          {busy ? busyLabel : actionLabel}
        </button>
      </div>
    </Dialog>
  );
}
