import { useEffect, useId, useRef, useState } from "react";
import { supabase } from "../supabase";
import { useAuth } from "../platform/auth";
import { Dialog } from "../platform/Dialog";
import {
  chooseReasonMessage,
  kindNoun,
  reportErrorMessage,
  reportFailure,
  reportReasons,
  signInToReportBody,
  signInToReportTitle,
  type ReportFailure,
} from "./reportReasons";
export type TargetKind = "post" | "chat" | "prayer" | "support";
type Execute = (args: Record<string, unknown>) => Promise<void>;
type Outcome = { reported: boolean; blocked: boolean };
const noteLimit = 1000;
const counterFrom = 100;
const blockFailedMessage =
  "We could not save that. Check your connection and try again.";

// Report a post, chat message, prayer request or support request: the trigger lives in the
// list, the dialog is mounted only while it is open so a feed of 50 posts renders none.
// Nothing here ever logs or sends the reason, the note or who reported.
export function SafetyControls({
  id,
  kind,
  onChange,
  execute,
}: {
  id: string;
  kind: TargetKind;
  onChange?: () => void;
  execute?: Execute;
}) {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  // A different post or a different account is a different dialog: close the old one.
  useEffect(() => {
    setOpen(false);
  }, [id, session?.user.id]);
  useEffect(() => {
    if (!open && returnFocus.current) {
      returnFocus.current = false;
      trigger.current?.focus();
    }
  }, [open]);
  function finish(outcome: Outcome) {
    returnFocus.current = true;
    const area = trigger.current?.closest<HTMLElement>("main");
    setOpen(false);
    // Lists refresh only now, so a post that was just held or blocked does not vanish
    // together with the confirmation the reader is still reading.
    if (outcome.blocked) window.dispatchEvent(new Event("hfg-blocks-changed"));
    if (outcome.reported || outcome.blocked) {
      onChange?.();
      // If the refresh removed the post, the trigger is gone: keep focus inside the page.
      window.setTimeout(() => {
        const active = document.activeElement;
        if (area?.isConnected && (!active || active === document.body)) area.focus();
      }, 400);
    }
  }
  if (!supabase) return null;
  return (
    <div className="safety">
      <button
        ref={trigger}
        type="button"
        className="text-button"
        aria-haspopup="dialog"
        aria-label={`Report this ${kindNoun(kind)}`}
        onClick={() => setOpen(true)}
      >
        Report
      </button>
      {open && (
        <ReportDialog
          id={id}
          kind={kind}
          execute={execute}
          onFinish={finish}
        />
      )}
    </div>
  );
}

function ReportDialog({
  id,
  kind,
  execute,
  onFinish,
}: {
  id: string;
  kind: TargetKind;
  execute?: Execute;
  onFinish: (outcome: Outcome) => void;
}) {
  const { session } = useAuth();
  const uid = useId();
  const titleId = `${uid}-title`;
  const reasonErrorId = `${uid}-reason-error`;
  const noteId = `${uid}-note`;
  const noteHintId = `${uid}-note-hint`;
  const noun = kindNoun(kind);
  const [step, setStep] = useState<"form" | "done">("form");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [needReason, setNeedReason] = useState(false);
  const [failure, setFailure] = useState<ReportFailure | "">("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [blockFailed, setBlockFailed] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const firstRadio = useRef<HTMLInputElement>(null);
  const doneHeading = useRef<HTMLHeadingElement>(null);
  const keepReading = useRef<HTMLButtonElement>(null);
  const noteText = useRef("");
  const working = useRef(false);
  const alive = useRef(true);
  const finished = useRef(false);
  const outcome = useRef<Outcome>({ reported: false, blocked: false });
  const signedOut = !session || failure === "signed-out";

  function close() {
    finished.current = true;
    onFinish(outcome.current);
  }
  const closeNow = useRef(close);
  closeNow.current = close;

  // A late answer after the dialog is gone must not touch anything; a block that was saved
  // but never confirmed on screen still tells the lists.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (!finished.current && outcome.current.blocked)
        window.dispatchEvent(new Event("hfg-blocks-changed"));
    };
  }, []);

  // A click on the backdrop closes the dialog, unless a note was typed: Escape still closes,
  // but a stray tap must not lose a long note. Clicks on the dialog's own padding stay inside.
  useEffect(() => {
    const dialog = wrap.current?.closest("dialog");
    if (!dialog) return;
    const onClick = (event: MouseEvent) => {
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      const inside =
        event.clientX >= box.left &&
        event.clientX <= box.right &&
        event.clientY >= box.top &&
        event.clientY <= box.bottom;
      if (inside || noteText.current.trim()) return;
      closeNow.current();
    };
    dialog.addEventListener("click", onClick);
    return () => dialog.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
    if (step === "done") doneHeading.current?.focus();
  }, [step]);
  useEffect(() => {
    if (blocked) keepReading.current?.focus();
  }, [blocked]);

  async function perform(
    action: "report" | "block",
    category: string,
    text: string,
  ): Promise<{ ok: boolean; error: unknown }> {
    if (!supabase || !session) return { ok: false, error: "Authentication required" };
    const args = {
      target_kind: kind,
      target_id: id,
      action_name: action,
      report_category: category,
      report_note: text,
    };
    try {
      if (execute) {
        await execute(args);
        return { ok: true, error: null };
      }
      const result = await supabase.rpc("community_safety_action", args);
      return { ok: !result.error, error: result.error };
    } catch (failed) {
      return { ok: false, error: failed ?? "failed" };
    }
  }

  async function send() {
    if (working.current) return;
    if (!reason) {
      setNeedReason(true);
      firstRadio.current?.focus();
      return;
    }
    setNeedReason(false);
    setFailure("");
    setError(null);
    working.current = true;
    setBusy(true);
    const result = await perform("report", reason, note.trim());
    working.current = false;
    if (!alive.current) return;
    setBusy(false);
    if (result.ok) {
      outcome.current.reported = true;
      setStep("done");
    } else {
      setFailure(reportFailure(result.error));
      setError(result.error);
    }
  }

  async function block() {
    if (working.current) return;
    working.current = true;
    setBlocking(true);
    setBlockFailed(false);
    // Blocking sends no reason and no note: the report already said everything.
    const result = await perform("block", "other", "");
    working.current = false;
    if (!alive.current) return;
    setBlocking(false);
    if (result.ok) {
      outcome.current.blocked = true;
      setBlocked(true);
    } else setBlockFailed(true);
  }

  const left = noteLimit - note.length;
  const gone = failure === "gone";
  return (
    <Dialog onClose={close} labelledBy={titleId}>
      <div className="report-dialog" ref={wrap}>
        {signedOut ? (
          <>
            <h2 id={titleId}>{signInToReportTitle}</h2>
            <p>{signInToReportBody}</p>
            <button type="button" onClick={close}>
              Close dialog
            </button>
          </>
        ) : step === "form" ? (
          <>
            <h2 id={titleId}>Report this {noun}</h2>
            <p>A person reads every report. The author is not told who reported.</p>
            {!gone && (
              <>
                <fieldset
                  aria-describedby={needReason ? reasonErrorId : undefined}
                >
                  <legend>What is the problem?</legend>
                  {reportReasons.map((r, index) => (
                    <label key={r.value} className="check report-reason">
                      <input
                        ref={index === 0 ? firstRadio : undefined}
                        type="radio"
                        name={`${uid}-reason`}
                        value={r.value}
                        checked={reason === r.value}
                        onChange={() => {
                          setReason(r.value);
                          setNeedReason(false);
                        }}
                      />
                      <span>
                        <span className="report-reason-label">{r.label}</span>
                        <span className="report-hint">{r.hint}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
                {needReason && (
                  <p role="alert" id={reasonErrorId} className="danger-text">
                    <span className="sr-only">Error: </span>
                    {chooseReasonMessage}
                  </p>
                )}
                <label htmlFor={noteId}>Anything we should know? (optional)</label>
                <textarea
                  id={noteId}
                  maxLength={noteLimit}
                  value={note}
                  aria-describedby={noteHintId}
                  onChange={(event) => {
                    noteText.current = event.target.value;
                    setNote(event.target.value);
                  }}
                />
                <p id={noteHintId} className="report-hint">
                  Only our reviewers see this. Do not include passwords.
                </p>
                {left <= counterFrom && (
                  <p className="report-hint">
                    {left === 1 ? "1 character left" : `${left} characters left`}
                  </p>
                )}
              </>
            )}
            {failure && (
              <p role="alert" className="danger-text">
                <span className="sr-only">Error: </span>
                {reportErrorMessage(error, noun)}
              </p>
            )}
            {gone ? (
              <button type="button" onClick={close}>
                Close dialog
              </button>
            ) : (
              <>
                <button
                  type="button"
                  aria-disabled={busy}
                  onClick={() => void send()}
                >
                  {busy ? "Sending…" : "Send report"}
                </button>
                <button
                  type="button"
                  className="secondary"
                  aria-disabled={busy}
                  onClick={() => {
                    if (!busy) close();
                  }}
                >
                  Don't send report
                </button>
              </>
            )}
            <p className="report-hint">
              If someone may be in danger right now, contact your local emergency
              services.
            </p>
          </>
        ) : (
          <>
            <h2 id={titleId} tabIndex={-1} ref={doneHeading}>
              Thank you for telling us
            </h2>
            <p>
              We have sent your report. A person will read it. The author is not
              told who reported.
            </p>
            <div className="report-block">
              {!blocked && (
                <>
                  <p className="report-label">
                    You can also stop seeing posts from this person.
                  </p>
                  <button
                    type="button"
                    className="secondary"
                    aria-disabled={blocking}
                    onClick={() => void block()}
                  >
                    {blocking ? "Blocking…" : "Block this person"}
                  </button>
                  <p className="report-hint">
                    You will not see their posts. You can undo this in Settings.
                  </p>
                </>
              )}
              <div role="status">
                {blocked && (
                  <p>
                    Blocked. You will not see their posts. You can undo this in
                    Settings.
                  </p>
                )}
              </div>
              {blockFailed && (
                <p role="alert" className="danger-text">
                  <span className="sr-only">Error: </span>
                  {blockFailedMessage}
                </p>
              )}
            </div>
            <button type="button" ref={keepReading} onClick={close}>
              Keep reading
            </button>
          </>
        )}
      </div>
    </Dialog>
  );
}
