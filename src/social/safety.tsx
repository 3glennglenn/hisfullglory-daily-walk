import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";
import { useAuth } from "../platform/auth";
export type TargetKind = "post" | "chat" | "prayer" | "support";
export const reportCategories = [
  "harassment",
  "hate",
  "sexual content",
  "scam",
  "spam",
  "dangerous advice",
  "private information",
  "other", "threats", "sexual exploitation", "direct payment solicitation",
  "self-harm encouragement", "abuse", "misinformation", "impersonation",
  "misleading credentials", "misleading sources", "vote manipulation", "coordinated abuse",
] as const;
export function SafetyControls({
  id,
  kind,
  onChange,
  execute,
}: {
  id: string;
  kind: TargetKind;
  onChange?: () => void;
  execute?: (args: Record<string, unknown>) => Promise<void>;
}) {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>("other");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  useEffect(() => {sequence.current++;setBusy(false);setOpen(false);setNote("");setStatus("");return () => {sequence.current++;};},[id,session?.user.id]);
  async function act(action: "report" | "block" | "mute") {
    if (!supabase || !session || busy) return;
    setBusy(true);
    const request = sequence.current;
    const args = {
      target_kind: kind,
      target_id: id,
      action_name: action,
      report_category: category,
      report_note: note,
    };
    let error: unknown = null;
    try { if (execute) await execute(args); else {const result = await supabase.rpc("community_safety_action",args);error=result.error;} } catch (failure) {error=failure;}
    if (request !== sequence.current) return;
    setStatus(
      error
        ? "Action could not be saved. Sign in and check the platform migration."
        : action === "report"
          ? "Report sent privately for manual review."
          : `Author ${action === "block" ? "blocked" : "muted"}. Reload this view to apply.`,
    );
    setBusy(false);
    if (!error) {
      setOpen(false);
      if (action === "block" || action === "mute")
        window.dispatchEvent(new Event("hfg-blocks-changed"));
      onChange?.();
    }
  }
  if (!supabase) return null;
  return (
    <div className="safety">
      <button className="text-button" onClick={() => setOpen(!open)}>
        Report / block
      </button>
      {open && (
        <div className="card">
          <h3>Keep this community safe</h3>
          {!session ? (
            <p>Sign in from Profile to report or block.</p>
          ) : (
            <>
              <label>
                Reason
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {reportCategories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Optional detail · private
                <textarea
                  maxLength={1000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              <div className="actions">
                <button disabled={busy} onClick={() => void act("report")}>
                  Report content or author
                </button>
                <button
                  disabled={busy}
                  className="secondary"
                  onClick={() => void act("block")}
                >
                  Block author
                </button>
                <button
                  disabled={busy}
                  className="secondary"
                  onClick={() => void act("mute")}
                >
                  Mute author
                </button>
              </div>
            </>
          )}
        </div>
      )}
      <small role="status">{status}</small>
    </div>
  );
}
