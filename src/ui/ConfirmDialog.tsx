import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Dialog } from "../platform/Dialog";
import { isPromise, useReturnFocus } from "./dialogFocus";

// A confirmation in the app's own words (UI-SPEC A15, D-10), in place of the browser's confirm().
// Both choices are named by what they do. The action comes first, filled (--danger when it destroys
// something, --button otherwise), the safe choice below it as a secondary button. Escape and a tap on the
// dim area are the safe choice. While the action is busy it reads busyLabel with aria-disabled, and
// Escape and the backdrop wait. The caller closes the dialog (it unmounts this component) once its own
// work is done, and reports a failure on its screen's existing error line.
export function ConfirmDialog({
  title,
  body,
  actionLabel,
  safeLabel,
  destructive = false,
  busyLabel,
  onAction,
  onSafe,
}: {
  title: string;
  body?: ReactNode;
  actionLabel: string;
  safeLabel: string;
  destructive?: boolean;
  /** What the action button reads while the work is going on, for example "Deleting…". */
  busyLabel?: string;
  /** May return a promise: the button is busy until it settles. */
  onAction: () => void | Promise<unknown>;
  onSafe: () => void;
}) {
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useReturnFocus();
  async function act() {
    if (busy) return;
    const result = onAction();
    if (!isPromise(result)) return;
    setBusy(true);
    try {
      await result;
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  const safe = () => {
    if (!busy) onSafe();
  };
  return (
    <Dialog
      className="sheet-dialog confirm-dialog"
      labelledBy={titleId}
      onClose={(event) => {
        // Escape. While busy the dialog stays: leaving would hide the outcome of the work.
        if (busy) event.preventDefault();
        else onSafe();
      }}
      onBackdrop={safe}
    >
      <h2 id={titleId} className="sheet-title">
        {title}
      </h2>
      {body && <p className="sheet-body">{body}</p>}
      <div className="sheet-actions">
        <button
          type="button"
          className={destructive ? "danger" : undefined}
          aria-disabled={busy || undefined}
          onClick={() => void act()}
        >
          {busy && busyLabel ? busyLabel : actionLabel}
        </button>
        <button type="button" className="secondary" aria-disabled={busy || undefined} onClick={safe}>
          {safeLabel}
        </button>
      </div>
    </Dialog>
  );
}
