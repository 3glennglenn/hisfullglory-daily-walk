// Sign in with the code from the email instead of its link. A link opens the browser, not
// an app installed from a store, so the code is what works everywhere. The sign-in email
// shows both (Supabase Auth, Magic Link template, with {{ .Token }}).
import { useState, type FormEvent } from "react";
import { supabase } from "../supabase";
import { cleanCode } from "./signInCode";

export function CodeEntry({ email }: { email: string }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  if (!supabase) return null;
  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!supabase || busy) return;
    const token = cleanCode(code);
    if (!token) {
      setNote("Type the code from the email: 6 to 10 digits.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
    setBusy(false);
    setNote(error ? "That code did not work. Check it, or ask for a new email." : "Signed in.");
  }
  return (
    <form className="code-entry" onSubmit={(e) => void verify(e)}>
      <label>
        Does the email show a code? Type it here
        <input
          id="sign-in-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={14}
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </label>
      <button disabled={busy}>Sign in with code</button>
      <p role="status">{note}</p>
    </form>
  );
}
